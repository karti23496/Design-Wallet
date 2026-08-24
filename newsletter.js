// ============================================================================
// Newsletter signup.
//
// Two entry points, one handler:
//   1. the SUBSCRIBE button in the nav  -> opens a modal (injected below, so
//      every page gets it without editing each HTML file)
//   2. any inline .newsletter-form      -> e.g. the homepage hero
//
// Posts to the same Google Apps Script endpoint the old waitlist used, so
// existing subscribers keep landing in the same sheet.
// ============================================================================
(function () {
    var ENDPOINT = "https://script.google.com/macros/s/AKfycbyyFhF70bpxR6nJbjULkETuxYNjAfEFfoshx_ven2Z3JrwC3Zjp61eJIBjx2SCouHYVig/exec";

    var MODAL_HTML =
        '<div class="newsletter-modal" id="newsletter-modal" role="dialog" aria-modal="true" aria-labelledby="newsletter-modal-title" hidden>' +
            '<div class="newsletter-modal-backdrop" data-newsletter-close></div>' +
            '<div class="newsletter-modal-card">' +
                '<button type="button" class="newsletter-modal-close" data-newsletter-close aria-label="Close">&times;</button>' +
                '<h2 id="newsletter-modal-title">Designer’s Weekly Drop</h2>' +
                '<p>A weekly round-up of the best design tools, resources and inspiration — straight to your inbox.</p>' +
                '<form class="newsletter-form">' +
                    '<input type="email" name="email" placeholder="you@example.com" aria-label="Email address" required>' +
                    '<button type="submit" class="primary-button">Sign up</button>' +
                '</form>' +
                '<p class="newsletter-note">No spam. Unsubscribe any time.</p>' +
            '</div>' +
        '</div>';

    var modal = null;
    var lastFocus = null;

    function openModal() {
        if (!modal) return;
        lastFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add("newsletter-modal-open");
        var field = modal.querySelector("input[type='email']");
        if (field) field.focus();
    }

    function closeModal() {
        if (!modal || modal.hidden) return;
        modal.hidden = true;
        document.body.classList.remove("newsletter-modal-open");
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function wireForm(form) {
        if (form.dataset.newsletterWired) return;
        form.dataset.newsletterWired = "true";

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            var email = new FormData(form).get("email");
            var button = form.querySelector("button[type='submit']");
            var original = button ? button.textContent : "";
            var inModal = modal && modal.contains(form);

            if (button) {
                button.disabled = true;
                button.textContent = "Submitting...";
            }

            fetch(ENDPOINT, {
                method: "POST",
                body: new URLSearchParams({ email: email })
            }).then(function () {
                form.reset();
                if (button) button.textContent = "You're in";
                window.setTimeout(function () {
                    if (inModal) closeModal();
                    if (button) {
                        button.disabled = false;
                        button.textContent = original;
                    }
                }, 1200);
            }).catch(function () {
                if (button) {
                    button.disabled = false;
                    button.textContent = "Try again";
                }
            });
        });
    }

    function init() {
        if (!document.getElementById("newsletter-modal")) {
            document.body.insertAdjacentHTML("beforeend", MODAL_HTML);
        }
        modal = document.getElementById("newsletter-modal");

        document.querySelectorAll(".newsletter-form").forEach(wireForm);

        // Delegated so it works for the nav button, which header.js injects.
        document.addEventListener("click", function (event) {
            var opener = event.target.closest && event.target.closest("[data-newsletter-open]");
            if (opener) {
                event.preventDefault();
                openModal();
                return;
            }
            if (event.target.closest && event.target.closest("[data-newsletter-close]")) {
                closeModal();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") closeModal();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}());
