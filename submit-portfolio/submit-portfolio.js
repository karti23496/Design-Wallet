document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("portfolio-submission-form");
    if (!form) return;

    var PORTFOLIO_SUBMISSION_URL = window.DESIGN_WALLET_PORTFOLIO_SUBMISSION_URL || "";
    var blockedDomains = [
        "behance.net",
        "dribbble.com",
        "notion.site",
        "notion.so",
        "figma.com",
        "instagram.com",
        "linkedin.com",
        "linktr.ee",
        "bento.me",
        "carrd.co",
        "medium.com",
        "x.com",
        "twitter.com"
    ];
    var blockedDomainMessage = "Please submit your personal portfolio website. Behance, Dribbble, Notion, social media, and link-in-bio pages are not accepted.";

    function normalizeHost(hostname) {
        return String(hostname || "").toLowerCase().replace(/^www\./, "");
    }

    function isBlockedHost(hostname) {
        var host = normalizeHost(hostname);
        return blockedDomains.some(function (domain) {
            return host === domain || host.endsWith("." + domain);
        });
    }

    function getFieldErrorElement(field) {
        var wrapper = field.closest(".portfolio-field");
        return wrapper ? wrapper.querySelector(".portfolio-field-error") : null;
    }

    function setFieldError(field, message) {
        var error = getFieldErrorElement(field);
        field.classList.toggle("has-error", Boolean(message));
        field.setAttribute("aria-invalid", message ? "true" : "false");
        if (error) error.textContent = message || "";
    }

    function setRadioGroupError(group, message) {
        var error = group.querySelector(".portfolio-field-error");
        var inputs = group.querySelectorAll("input[type='radio']");
        group.classList.toggle("has-error", Boolean(message));
        inputs.forEach(function (input) {
            input.setAttribute("aria-invalid", message ? "true" : "false");
        });
        if (error) error.textContent = message || "";
    }

    function validateRequiredField(field) {
        if (field.type === "checkbox") {
            return field.checked;
        }

        return Boolean(String(field.value || "").trim());
    }

    function validateHttpsUrl(field) {
        var value = String(field.value || "").trim();
        if (!value) return "Portfolio Website URL is required.";

        try {
            var parsedUrl = new URL(value);
            if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
                return "Please enter a valid website URL.";
            }

            if (isBlockedHost(parsedUrl.hostname)) {
                return blockedDomainMessage;
            }
        } catch (error) {
            return "Please enter a valid website URL.";
        }

        return "";
    }

    function validateField(field) {
        var name = field.getAttribute("name");
        var label = field.closest(".portfolio-field");
        var labelText = label ? label.querySelector("span").textContent.replace("*", "").trim() : "This field";
        var message = "";

        if (field.hasAttribute("required") && !validateRequiredField(field)) {
            message = labelText + " is required.";
        }

        if (!message && name === "email" && field.value.trim() && !field.validity.valid) {
            message = "Please enter a valid email address.";
        }

        if (!message && name === "portfolioUrl") {
            message = validateHttpsUrl(field);
        }

        if (!message && name === "socialLink" && field.value.trim() && !field.validity.valid) {
            message = "Please enter a valid URL.";
        }

        setFieldError(field, message);
        return !message;
    }

    function validateForm() {
        var fields = Array.from(form.querySelectorAll("input, select, textarea"));
        var radioGroups = Array.from(form.querySelectorAll("[data-required-radio]"));
        var firstInvalid = null;
        var isValid = true;
        var checkboxError = form.querySelector("[data-checkbox-error]");

        fields.forEach(function (field) {
            if (field.type === "checkbox" || field.type === "radio") return;
            var fieldValid = validateField(field);
            if (!fieldValid && !firstInvalid) firstInvalid = field;
            isValid = isValid && fieldValid;
        });

        radioGroups.forEach(function (group) {
            var checked = group.querySelector("input[type='radio']:checked");
            var firstRadio = group.querySelector("input[type='radio']");
            var groupValid = Boolean(checked);
            setRadioGroupError(group, groupValid ? "" : "Designer Role is required.");
            if (!groupValid && !firstInvalid) firstInvalid = firstRadio;
            isValid = isValid && groupValid;
        });

        var permission = form.elements.permission;
        if (permission && !permission.checked) {
            isValid = false;
            if (!firstInvalid) firstInvalid = permission;
            permission.setAttribute("aria-invalid", "true");
            if (checkboxError) checkboxError.textContent = "Please confirm permission before submitting.";
        } else if (permission) {
            permission.setAttribute("aria-invalid", "false");
            if (checkboxError) checkboxError.textContent = "";
        }

        if (firstInvalid && typeof firstInvalid.focus === "function") {
            firstInvalid.focus();
        }

        return isValid;
    }

    function encodeFormData(formData) {
        var params = new URLSearchParams();
        formData.forEach(function (value, key) {
            params.append(key, value);
        });
        return params.toString();
    }

    function isLocalPreview() {
        return ["localhost", "127.0.0.1", ""].indexOf(window.location.hostname) !== -1;
    }

    function showSuccess(successMessage, submitButton, originalButtonText) {
        form.reset();
        form.querySelectorAll("[aria-invalid]").forEach(function (field) {
            field.setAttribute("aria-invalid", "false");
            field.classList.remove("has-error");
        });

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }

        if (successMessage) {
            successMessage.hidden = false;
        }
    }

    form.querySelectorAll("input, select, textarea").forEach(function (field) {
        field.addEventListener("input", function () {
            if (field.type !== "checkbox") validateField(field);
        });

        field.addEventListener("change", function () {
            if (field.type === "radio") {
                var group = field.closest("[data-required-radio]");
                if (group) setRadioGroupError(group, "");
                return;
            }

            if (field.type === "checkbox") {
                var checkboxError = form.querySelector("[data-checkbox-error]");
                field.setAttribute("aria-invalid", field.checked ? "false" : "true");
                if (checkboxError && field.checked) checkboxError.textContent = "";
                return;
            }

            validateField(field);
        });
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        var successMessage = form.querySelector(".portfolio-success-message");
        var submitError = form.querySelector(".portfolio-submit-error");
        var submitButton = form.querySelector("button[type='submit']");
        var originalButtonText = submitButton ? submitButton.textContent : "Submit Portfolio";
        if (successMessage) successMessage.hidden = true;
        if (submitError) submitError.hidden = true;

        if (!validateForm()) return;

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";
        }

        if (!PORTFOLIO_SUBMISSION_URL && isLocalPreview()) {
            window.setTimeout(function () {
                showSuccess(successMessage, submitButton, originalButtonText);
            }, 250);
            return;
        }

        if (!PORTFOLIO_SUBMISSION_URL) {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }

            if (submitError) {
                submitError.textContent = "Submission endpoint is not configured yet.";
                submitError.hidden = false;
            }
            return;
        }

        fetch(PORTFOLIO_SUBMISSION_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodeFormData(new FormData(form))
        }).then(function () {
            showSuccess(successMessage, submitButton, originalButtonText);
        }).catch(function () {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }

            if (submitError) submitError.hidden = false;
        });
    });
});
