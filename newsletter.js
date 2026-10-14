// ============================================================================
// Newsletter signup.
//
// Two entry points, one handler:
//   1. the SUBSCRIBE button in the nav  -> opens a modal (injected below, so
//      every page gets it without editing each HTML file)
//   2. any inline .newsletter-form      -> e.g. the homepage hero
//
// Addresses go into the Supabase `subscribers` table. They used to go to a
// Google Apps Script which wrote them to a spreadsheet; that spreadsheet is
// publicly readable and holds the existing 381 addresses, which is its own
// problem — see .claude/DATA-SECURITY-PLAN.md §0. Nothing writes to it now.
//
// The key below may only INSERT into that table. It cannot read it: there is no
// select policy, so a visitor can add their own address and cannot discover
// anyone else's. See supabase/subscribers.sql.
// ============================================================================
(function () {
    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";

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

            // Lowercased and trimmed here so the table's primary key does its
            // job — Karthik@x.com and karthik@x.com are one person. The database
            // enforces this too; this just avoids a pointless rejection.
            email = String(email || "").trim().toLowerCase();

            function succeed() {
                form.reset();
                if (button) button.textContent = "You're in";
                window.setTimeout(function () {
                    if (inModal) closeModal();
                    if (button) {
                        button.disabled = false;
                        button.textContent = original;
                    }
                }, 1200);
            }

            function fail() {
                if (button) {
                    button.disabled = false;
                    button.textContent = "Try again";
                }
            }

            // One RPC, not a table insert. The publishable key has no
            // privileges on `subscribers` at all — it may only call this
            // function, which runs as its owner and returns nothing.
            //
            // That matters for more than tidiness: a direct insert answers 409
            // when the address is already there, which would turn this form
            // into a way to ask whether any given person is on the list. The
            // function answers 204 either way.
            fetch(SUPABASE_URL + "/rest/v1/rpc/subscribe", {
                method: "POST",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ p_email: email, p_source: window.location.pathname })
            }).then(function (response) {
                // The old version called succeed() on ANY settled request, so a
                // server error, a quota failure or a rejected address all showed
                // "You're in" to someone who had not been subscribed.
                if (response.ok) succeed();
                else fail();
            }).catch(fail);
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
