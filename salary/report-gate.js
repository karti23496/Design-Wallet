/**
 * report-gate.js: "email me the salary report", for signed-in visitors.
 *
 * Signed out, Export PDF sends the visitor to sign-in (salary.js calls
 * DWGate.require(); Karthik, 2026-11-20). Signed in, this pop-up asks one
 * question (the newsletter box, unticked) and emails the PDF to the account's
 * own address. Nothing is downloaded.
 *
 * The server (supabase/functions/salary-report, action send_report_account)
 * never takes the recipient from this page: it checks the session token we send
 * in `x-user-jwt` and mails that account's verified email.
 *
 * Public API:  DWReportMail.open({ build: function () { return Promise<{ bytes, filename, role, level, location }>; } })
 *              DWReportMail.signedIn()  -> true when there is a usable session
 */
var DWReportMail = (function () {
    "use strict";

    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
    var ENDPOINT = SUPABASE_URL + "/functions/v1/salary-report";

    var MESSAGES = {
        not_signed_in: "Your session has ended. Please sign in again to get your report.",
        rate_limited: "You've asked for a few reports already. Please try again in a little while.",
        send_failed: "We couldn't send that just now. Please try again in a moment.",
        network: "We couldn't reach the server. Check your connection and try again.",
        build_failed: "We couldn't build the report. Refresh the page and try again."
    };

    var MARKUP =
        '<div class="dwr-modal" id="dwr-modal" role="dialog" aria-modal="true" aria-labelledby="dwr-title" hidden>' +
            '<div class="dwr-backdrop" data-dwr-close></div>' +
            '<div class="dwr-card">' +
                '<button type="button" class="dwr-close" data-dwr-close aria-label="Close">&times;</button>' +

                '<div class="dwr-step" data-step="account">' +
                    '<h2 id="dwr-title">Email me the salary report</h2>' +
                    '<p class="dwr-sub">We\'ll send the PDF to <strong id="dwr-account-email"></strong>, the email on your account.</p>' +
                    '<form class="dwr-form" id="dwr-account-form" novalidate>' +
                        '<label class="dwr-check"><input type="checkbox" id="dwr-account-newsletter"><span>Also send me the Designer\'s Weekly Drop, a weekly round-up of design tools and resources. Unsubscribe any time.</span></label>' +
                        '<button type="submit" class="primary-button" id="dwr-account-send">Email me the report</button>' +
                    '</form>' +
                    '<p class="dwr-note">It comes from hello@designwallet.in. We only use your email to send the report. We never sell it.</p>' +
                '</div>' +

                '<div class="dwr-step" data-step="done" hidden>' +
                    '<h2>Your report is on its way</h2>' +
                    '<p class="dwr-sub">It\'s heading to <strong id="dwr-done-to"></strong> and usually arrives within a minute. It comes from <strong>hello@designwallet.in</strong>. Add that address to your contacts, and check Spam or Promotions if you don\'t see it.</p>' +
                    '<button type="button" class="primary-button" data-dwr-close>Close</button>' +
                '</div>' +

                '<p class="dwr-message" id="dwr-message" role="status" aria-live="polite"></p>' +
            '</div>' +
        '</div>';

    var els = {};
    var opts = null;
    var busy = false;
    var lastFocus = null;

    function track(name) {
        if (typeof window.gtag === "function") window.gtag("event", name, { source: "salary-report" });
    }

    function message(text, isError) {
        els.message.textContent = text || "";
        els.message.classList.toggle("is-error", !!isError);
    }

    function showStep(name) {
        Array.prototype.forEach.call(els.modal.querySelectorAll(".dwr-step"), function (node) {
            node.hidden = node.getAttribute("data-step") !== name;
        });
        if (name === "account") els.send.focus();
    }

    function toBase64(bytes) {
        var chunk = 0x8000;
        var parts = [];
        for (var i = 0; i < bytes.length; i += chunk) {
            parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
        }
        return btoa(parts.join(""));
    }

    /**
     * The signed-in visitor, or null. Mirrors auth/gate.js: an account with
     * two-step login that has not entered its code yet counts as signed out.
     * A convenience check only; the server verifies the token itself.
     */
    function account() {
        try {
            var session = JSON.parse(localStorage.getItem("sb-ugjtyuikvdeymwsfsgfl-auth-token") || "null");
            if (!session || !session.user || typeof session.user.email !== "string" || !session.access_token) return null;
            if (session.expires_at && session.expires_at * 1000 < Date.now() + 10000) return null;
            if (window.DWGate && window.DWGate.state && !window.DWGate.state().signedIn) return null;
            return { email: session.user.email, jwt: session.access_token };
        } catch (e) {
            return null;
        }
    }

    function sendReport() {
        if (busy) return;
        var who = account();
        if (!who) {
            message(MESSAGES.not_signed_in, true);
            return;
        }
        busy = true;
        var wantsNewsletter = els.newsletter.checked;
        els.send.disabled = true;
        els.send.textContent = "Sending…";
        message("Preparing your report…");

        function finish() {
            busy = false;
            els.send.disabled = false;
            els.send.textContent = "Email me the report";
        }

        opts.build()
            .then(function (file) {
                if (file.bytes.length > 2900000) throw new Error("report too large");
                return fetch(ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, "x-user-jwt": who.jwt },
                    body: JSON.stringify({
                        action: "send_report_account",
                        pdf_base64: toBase64(file.bytes),
                        filename: file.filename,
                        role: file.role,
                        level: file.level,
                        location: file.location,
                        newsletter: wantsNewsletter
                    })
                }).then(function (res) {
                    return res.json().catch(function () { return {}; }).then(function (body) {
                        return { status: res.status, body: body };
                    });
                });
            })
            .then(function (r) {
                finish();
                if (r.status === 200) {
                    track("salary_report_request");
                    track("salary_report_sent");
                    if (wantsNewsletter) track("newsletter_subscribe");
                    els.doneTo.textContent = who.email;
                    message("");
                    showStep("done");
                    return;
                }
                message(MESSAGES[r.body.error] || MESSAGES.send_failed, true);
            })
            .catch(function (error) {
                finish();
                if (window.console) console.error("salary report email failed:", error);
                message(error && error.message === "report too large" ? MESSAGES.build_failed : MESSAGES.network, true);
            });
    }

    function open(options) {
        var who = account();
        if (!who) return false;
        opts = options;
        lastFocus = document.activeElement;
        els.accountEmail.textContent = who.email;
        message("");
        showStep("account");
        els.modal.hidden = false;
        document.body.classList.add("dwr-open");
        return true;
    }

    function close() {
        if (els.modal.hidden) return;
        els.modal.hidden = true;
        document.body.classList.remove("dwr-open");
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function init() {
        document.body.insertAdjacentHTML("beforeend", MARKUP);
        els.modal = document.getElementById("dwr-modal");
        els.accountEmail = document.getElementById("dwr-account-email");
        els.newsletter = document.getElementById("dwr-account-newsletter");
        els.send = document.getElementById("dwr-account-send");
        els.doneTo = document.getElementById("dwr-done-to");
        els.message = document.getElementById("dwr-message");

        document.getElementById("dwr-account-form").addEventListener("submit", function (event) {
            event.preventDefault();
            sendReport();
        });
        els.modal.addEventListener("click", function (event) {
            if (event.target.closest && event.target.closest("[data-dwr-close]")) close();
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") close();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    return { open: open, signedIn: function () { return !!account(); } };
})();
