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
 * DW_SALARY_ENDPOINT in salary/endpoint.js — the dashboard reads the same URL.
 * Until it is set the form validates normally and tells the visitor
 * submissions aren't open yet.
 */

(function () {
    "use strict";

    var DATA_URL = "/salary/data/salaries.json?v=20260913-1";
    var SUBMISSION_URL = typeof DW_SALARY_ENDPOINT === "string" ? DW_SALARY_ENDPOINT : "";

    var form = null;
    var data = null;

    /* ── Currency ────────────────────────────────────────────────────────────
     * Designers on foreign payroll think in dollars, so the two pay fields can
     * be entered in either currency and convert in place when toggled.
     *
     * WHAT IS STORED IS ALWAYS ₹ LAKH. The sheet, scripts/build-salary.js and
     * the Apps Script's 0.5–200 range all speak LPA, so handleSubmit converts
     * before posting and nothing downstream has to know this toggle exists.
     *
     * The rate comes from the same salaries.json the form already fetches for
     * its dropdowns — the identical number the dashboard's INR/USD toggle uses,
     * so the two can never disagree. FALLBACK_USD_INR only covers the case
     * where that fetch failed, and the form is unusable then anyway.
     */
    var FALLBACK_USD_INR = 95.6;
    var LAKH = 100000;
    var MIN_LPA = 0.5;
    var MAX_LPA = 200;
    var payCurrency = "inr";

    function usdInr() {
        return (data && data.fx && data.fx.usd_inr) || FALLBACK_USD_INR;
    }

    // ₹ lakh → whole US dollars a year, and back.
    function lakhToUsd(lakh) {
        return Math.round((lakh * LAKH) / usdInr());
    }

    function usdToLakh(usd) {
        return Math.round(((usd * usdInr()) / LAKH) * 100) / 100;
    }

    /** The entered number in ₹ lakh, whichever currency it was typed in. */
    function toLakh(value) {
        return payCurrency === "usd" ? usdToLakh(value) : value;
    }

    /** The bounds the CTC field accepts, expressed in the current currency. */
    function payBounds() {
        if (payCurrency === "usd") {
            return { min: lakhToUsd(MIN_LPA), max: lakhToUsd(MAX_LPA) };
        }
        return { min: MIN_LPA, max: MAX_LPA };
    }

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

    /** Converts one field's value between currencies, leaving blanks and NIL. */
    function convertField(field, toUsd) {
        var raw = String(field.value || "").trim();
        if (!raw || /^nil$/i.test(raw)) return;

        var value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) return;

        field.value = toUsd ? lakhToUsd(value) : usdToLakh(value);
    }

    /** The "≈ ₹19.4 LPA" line under the CTC box, so nobody has to trust the
        conversion blind — it names the figure that will actually be stored. */
    function updateConvertedHint() {
        var note = document.getElementById("sal-ctc-converted");
        if (!note) return;

        var raw = String(formField("annualFixedCtcLpa").value || "").trim();
        var value = Number.parseFloat(raw);

        if (payCurrency !== "usd" || !raw || !Number.isFinite(value)) {
            note.hidden = true;
            return;
        }

        note.textContent = "≈ ₹" + usdToLakh(value) + " LPA — the figure we store, at ₹" +
            usdInr() + " to the dollar.";
        note.hidden = false;
    }

    function setPayCurrency(code) {
        if (code === payCurrency) return;

        var toUsd = code === "usd";
        convertField(formField("annualFixedCtcLpa"), toUsd);
        convertField(formField("variableOrBonusLpa"), toUsd);
        payCurrency = code;

        Array.prototype.forEach.call(form.querySelectorAll("[data-pay-label]"), function (node) {
            node.textContent = node.getAttribute("data-" + code);
        });

        Array.prototype.forEach.call(form.querySelectorAll("[data-" + code + "-placeholder]"), function (node) {
            node.placeholder = node.getAttribute("data-" + code + "-placeholder");
        });

        // The CTC box is type=number, so its own min/max must follow the
        // currency or the browser blocks a perfectly good dollar figure.
        var bounds = payBounds();
        var ctc = formField("annualFixedCtcLpa");
        ctc.min = bounds.min;
        ctc.max = bounds.max;
        ctc.step = toUsd ? 100 : 0.1;

        Array.prototype.forEach.call(form.querySelectorAll(".sal-currency-btn"), function (button) {
            var active = button.getAttribute("data-currency") === code;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        updateConvertedHint();
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

        // Bounds are checked in whatever currency was typed, so the message
        // quotes numbers the visitor recognises rather than a lakh figure they
        // never entered.
        var bounds = payBounds();
        if (!validateNumber(formField("annualFixedCtcLpa"), bounds.min, bounds.max, "Fixed CTC", true)) ok = false;

        // Variable pay takes a number or NIL, in any case; stored as "NIL".
        var variable = formField("variableOrBonusLpa");
        if (/^\s*nil\s*$/i.test(variable.value)) {
            variable.value = "NIL";
        } else if (!String(variable.value || "").trim()) {
            setFieldError(variable, "Enter an amount, 0, or NIL to skip.");
            ok = false;
        } else if (!validateNumber(variable, 0, bounds.max, "Variable pay", true)) {
            ok = false;
        }

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

        if (!SUBMISSION_URL) {
            status.textContent = "Submissions aren't switched on yet — check back shortly.";
            return;
        }

        button.disabled = true;
        status.textContent = "Sending…";

        var payload = new FormData(form);
        payload.delete("website");

        // Convert on the way out, not in the visible inputs: if the POST fails
        // the visitor is still looking at the dollars they typed.
        if (payCurrency === "usd") {
            payload.set("annualFixedCtcLpa", toLakh(Number.parseFloat(payload.get("annualFixedCtcLpa"))));

            var enteredVariable = String(payload.get("variableOrBonusLpa") || "").trim();
            if (!/^nil$/i.test(enteredVariable)) {
                payload.set("variableOrBonusLpa", toLakh(Number.parseFloat(enteredVariable)));
            }
        }

        fetch(SUBMISSION_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodeFormData(payload)
        })
            .then(function () {
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

    /* ── Location: city or country ───────────────────────────────────────────
     * The dashboard treats city and country as mutually exclusive — pick a
     * foreign employer there and the city filter becomes a country filter. The
     * form mirrors it, because asking a designer employed in Berlin which
     * Indian city they work in has no good answer.
     *
     * One <select> does both jobs, swapping its options, its label and its
     * NAME ("city" ↔ "country"), so FormData carries exactly one of them and
     * the Apps Script stores exactly one. Reached by id, never by name, since
     * the name is the thing that moves.
     */
    function locationField() {
        return document.getElementById("f-city");
    }

    function foreignEmployer() {
        return formField("employerLocation").value === "foreign";
    }

    function syncLocationField() {
        var select = locationField();
        var label = document.getElementById("sal-location-label");
        var foreign = foreignEmployer();
        var wanted = foreign ? "country" : "city";
        if (select.getAttribute("data-list") === wanted) return;

        var options = foreign ? data.countries : data.cities;
        select.name = wanted;
        if (label) label.textContent = foreign ? "Country" : "City";
        fillSelect(select, options, foreign ? "Choose a country" : "Choose a city");
        select.setAttribute("data-list", wanted);
        setFieldError(select, "");
    }

    function bindLocationSwap() {
        formField("employerLocation").addEventListener("change", syncLocationField);
        syncLocationField();
    }

    function bindCurrencyToggle() {
        var toggle = document.getElementById("sal-pay-currency");
        if (!toggle) return;

        toggle.addEventListener("click", function (event) {
            var button = event.target.closest(".sal-currency-btn");
            if (button) setPayCurrency(button.getAttribute("data-currency"));
        });

        formField("annualFixedCtcLpa").addEventListener("input", updateConvertedHint);
    }

    function start() {
        form = document.getElementById("sal-form");
        if (!form) return;

        bindCurrencyToggle();

        fetch(DATA_URL)
            .then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json();
            })
            .then(function (payload) {
                data = payload;

                fillSelect(formField("role"), data.roles, "Choose a role");
                fillSelect(formField("level"), data.levels, "Choose a level");
                fillSelect(formField("workMode"), data.work_modes, "Choose one");
                fillSelect(formField("employerLocation"), data.employers, "Choose one");
                bindLocationSwap();
                fillSelect(formField("companyType"), data.company_types, "Choose one");
                fillYears(formField("salaryEffectiveFrom"));

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
