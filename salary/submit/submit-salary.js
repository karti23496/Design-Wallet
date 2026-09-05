/**
 * submit-salary.js — anonymous salary submission.
 *
 * Structure follows submit-portfolio/submit-portfolio.js, which already solves
 * field-level errors and the no-cors POST into a Google Apps Script endpoint.
 * The differences here: the option lists are read from the same salaries.json
 * the dashboard uses, so the taxonomies cannot drift apart, and there is no
 * free-text field anywhere — every input is a select or a bounded number.
 *
 * TO SWITCH SUBMISSIONS ON: deploy salary/submit/google-apps-script.js as a web
 * app ("execute as me", "anyone can access") and paste its /exec URL into
 * SUBMISSION_URL below. It lives here rather than inline in the page because
 * DECISIONS §11 keeps script out of the HTML — the portfolio form's inline
 * assignment is the older pattern, not the one to copy. Until it is set the
 * form validates normally and tells the visitor submissions aren't open yet.
 */

(function () {
    "use strict";

    var DATA_URL = "/salary/data/salaries.json?v=20260905-1";
    var SUBMISSION_URL = "";
    var STORAGE_KEY = "dw_salary_submitted_at";
    var REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

    var form = null;
    var data = null;

    /**
     * Always reach fields through form.elements, never form.<name>.
     *
     * ARIA reflection put a `role` IDL attribute on Element, and that shadows
     * the form's named-element getter — so `form.role` returns null (the form
     * has no role attribute) rather than the <select name="role">. Same trap
     * waits on title, id, style, lang, dir and slot. form.elements does named
     * lookup properly and has no such collisions.
     */
    function formField(name) {
        return form.elements[name];
    }

    // ── field errors ────────────────────────────────────────────────────────

    function errorNodeFor(field) {
        var wrapper = field.closest(".sal-field");
        return wrapper ? wrapper.querySelector(".sal-field-error") : null;
    }

    function setFieldError(field, message) {
        var node = errorNodeFor(field);
        field.classList.toggle("has-error", Boolean(message));
        field.setAttribute("aria-invalid", message ? "true" : "false");
        if (node) node.textContent = message || "";
    }

    function clearErrors() {
        Array.prototype.forEach.call(form.querySelectorAll(".has-error"), function (field) {
            setFieldError(field, "");
        });
    }

    // ── validation ──────────────────────────────────────────────────────────

    function validateNumber(field, min, max, label, required) {
        var raw = String(field.value || "").trim();

        if (!raw) {
            if (!required) return true;
            setFieldError(field, label + " is required.");
            return false;
        }

        var value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
            setFieldError(field, "Please enter a number.");
            return false;
        }
        if (value < min || value > max) {
            setFieldError(field, label + " should be between " + min + " and " + max + ".");
            return false;
        }
        return true;
    }

    function validate() {
        clearErrors();
        var ok = true;

        Array.prototype.forEach.call(form.querySelectorAll("select[required]"), function (field) {
            if (!String(field.value || "").trim()) {
                setFieldError(field, "Please choose one.");
                ok = false;
            }
        });

        if (!validateNumber(formField("yearsOfExperience"), 0, 45, "Years of experience", true)) ok = false;
        if (!validateNumber(formField("annualFixedCtcLpa"), 0.5, 200, "Fixed CTC", true)) ok = false;
        if (!validateNumber(formField("variableOrBonusLpa"), 0, 200, "Variable pay", false)) ok = false;

        // Level against years: a warning, not a block. Someone can genuinely be a
        // lead at four years, and rejecting them would lose a real data point.
        var years = Number.parseFloat(formField("yearsOfExperience").value);
        var level = formField("level").value;
        if (Number.isFinite(years)) {
            var seniorish = level === "lead" || level === "manager" || level === "director" || level === "vp";
            if (seniorish && years < 4) {
                setFieldError(formField("level"), "That's unusual for this much experience — worth a second look before you submit.");
            } else if (level === "junior" && years > 6) {
                setFieldError(formField("level"), "That's unusual for this much experience — worth a second look before you submit.");
            }
        }

        return ok;
    }

    // ── submit ──────────────────────────────────────────────────────────────

    function encodeFormData(formData) {
        var pairs = [];
        formData.forEach(function (value, key) {
            pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
        });
        return pairs.join("&");
    }

    function submittedRecently() {
        try {
            var stamp = Number.parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
            return Number.isFinite(stamp) && Date.now() - stamp < REPEAT_WINDOW_MS;
        } catch (error) {
            return false;
        }
    }

    function markSubmitted() {
        try {
            window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch (error) {
            /* Private mode. A speed bump we can live without. */
        }
    }

    function handleSubmit(event) {
        event.preventDefault();

        var status = document.getElementById("sal-form-status");
        var button = document.getElementById("sal-submit-btn");

        // Honeypot: a real person never sees this field.
        if (String(formField("website").value || "").trim()) return;

        if (!validate()) {
            status.textContent = "Please check the highlighted fields.";
            var firstError = form.querySelector(".has-error");
            if (firstError) firstError.focus();
            return;
        }

        if (submittedRecently()) {
            status.textContent = "You've already submitted from this browser today. Thank you.";
            return;
        }

        if (!SUBMISSION_URL) {
            status.textContent = "Submissions aren't switched on yet — check back shortly.";
            return;
        }

        button.disabled = true;
        status.textContent = "Sending…";

        var payload = new FormData(form);
        payload.delete("website");

        fetch(SUBMISSION_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodeFormData(payload)
        })
            .then(function () {
                markSubmitted();
                form.hidden = true;
                document.getElementById("sal-form-done").hidden = false;
                window.scrollTo({ top: 0, behavior: "smooth" });
            })
            .catch(function () {
                button.disabled = false;
                status.textContent = "That didn't go through. Please try again in a moment.";
            });
    }

    // ── setup ───────────────────────────────────────────────────────────────

    function fillSelect(select, items, placeholder) {
        var html = placeholder ? '<option value="">' + placeholder + "</option>" : "";
        html += items.map(function (item) {
            return '<option value="' + item.id + '">' + item.label + "</option>";
        }).join("");
        select.innerHTML = html;
    }

    function fillYears(select) {
        var current = new Date().getFullYear();
        var html = '<option value="">Choose a year</option>';
        for (var year = current; year >= current - 2; year -= 1) {
            html += '<option value="' + year + '">' + year + "</option>";
        }
        select.innerHTML = html;
    }

    function bindModeToEmployer() {
        var mode = formField("workMode");
        var field = document.getElementById("f-employer-field");
        var select = formField("employerLocation");

        var sync = function () {
            var remote = mode.value === "remote";
            field.hidden = !remote;
            select.required = remote;
            if (!remote) select.value = "india";
        };

        mode.addEventListener("change", sync);
        sync();
    }

    function start() {
        form = document.getElementById("sal-form");
        if (!form) return;

        fetch(DATA_URL)
            .then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json();
            })
            .then(function (payload) {
                data = payload;

                fillSelect(formField("role"), data.roles, "Choose a role");
                fillSelect(formField("level"), data.levels, "Choose a level");
                fillSelect(formField("city"), data.cities, "Choose a city");
                fillSelect(formField("workMode"), data.work_modes, "Choose one");
                fillSelect(formField("employerLocation"), data.employers, "");
                fillSelect(formField("companyType"), data.company_types, "Choose one");
                fillYears(formField("salaryEffectiveFrom"));

                bindModeToEmployer();
                form.addEventListener("submit", handleSubmit);

                // Clear an error as soon as the field is touched again.
                form.addEventListener("input", function (event) {
                    if (event.target.classList.contains("has-error")) {
                        setFieldError(event.target, "");
                    }
                });
            })
            .catch(function (error) {
                var status = document.getElementById("sal-form-status");
                if (status) status.textContent = "Couldn't load the form options. Please refresh.";
                if (window.console) console.error("salary form failed:", error);
            });
    }

    document.addEventListener("DOMContentLoaded", start);
})();
