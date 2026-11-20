/**
 * report-gate.js: "email me the salary report".
 *
 * Replaces the sign-in wall on Export PDF (Karthik, 2026-11-20). The visitor
 * gives an email, types a 6-digit code we mail them, and the report is emailed
 * to that address. Nothing is downloaded.
 *
 *   step 1  email + an unticked newsletter box  -> action send_code
 *   step 2  the 6-digit code                    -> action verify_code  (returns a token)
 *   step 3  build the PDF here, post it          -> action send_report  (token decides who gets it)
 *
 * The server (supabase/functions/salary-report) never takes the recipient from
 * this page: it comes from the verified token. See that file for why.
 *
 * Public API:  DWReportMail.open({ build: function () { return Promise<{ bytes, filename, role, level, location }>; } })
 */
var DWReportMail = (function () {
    "use strict";

    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
    var ENDPOINT = SUPABASE_URL + "/functions/v1/salary-report";

    // Cloudflare Turnstile PUBLIC site key (widget "Design Wallet - salary
    // report", hostname designwallet.in, Managed). Safe to ship; the secret
    // lives only in Supabase. It validates on designwallet.in only, so the bot
    // check cannot be completed on localhost. Empty = no bot check on this page.
    var TURNSTILE_SITE_KEY = "0x4AAAAAAGKFmBJYXELgN9sQ";

    var MESSAGES = {
        invalid_email: "That email doesn't look right. Check it and try again.",
        bot_check: "We couldn't confirm you're human. Refresh the page and try again.",
        cooldown: "Please wait a moment before asking for another code.",
        rate_limited: "Too many requests from here. Please try again in a few minutes.",
        send_failed: "We couldn't send that just now. Please try again in a moment.",
        expired: "That code has expired. Send yourself a new one.",
        locked: "Too many wrong tries. Send a new code to start again.",
        retry: "That didn't go through. Please try once more.",
        network: "We couldn't reach the server. Check your connection and try again.",
        timeout: "That took too long. Start again and we'll send you a fresh code.",
        report_failed: "Your email is confirmed, but we couldn't send the report. Try once more, and write to hello@designwallet.in if it keeps failing."
    };

    var MARKUP =
        '<div class="dwr-modal" id="dwr-modal" role="dialog" aria-modal="true" aria-labelledby="dwr-title" hidden>' +
            '<div class="dwr-backdrop" data-dwr-close></div>' +
            '<div class="dwr-card">' +
                '<button type="button" class="dwr-close" data-dwr-close aria-label="Close">&times;</button>' +

                '<div class="dwr-step" data-step="email">' +
                    '<h2 id="dwr-title">Get the salary report in your inbox</h2>' +
                    '<p class="dwr-sub">Enter your email and we\'ll send you a 6-digit code to confirm it\'s yours. Then the PDF is on its way.</p>' +
                    '<form class="dwr-form" id="dwr-email-form" novalidate>' +
                        '<input class="dwr-field" id="dwr-email" type="email" name="email" placeholder="you@example.com" aria-label="Email address" autocomplete="email" required>' +
                        '<label class="dwr-check"><input type="checkbox" id="dwr-newsletter"><span>Also send me the Designer\'s Weekly Drop, a weekly round-up of design tools and resources. Unsubscribe any time.</span></label>' +
                        '<button type="submit" class="primary-button" id="dwr-send-code">Send me the code</button>' +
                    '</form>' +
                    '<p class="dwr-note">We only use your email to send the report. We never sell it.</p>' +
                '</div>' +

                '<div class="dwr-step" data-step="code" hidden>' +
                    '<h2>Check your inbox</h2>' +
                    '<p class="dwr-sub">We sent a 6-digit code to <strong id="dwr-sent-to"></strong>. It works for 10 minutes.</p>' +
                    '<form class="dwr-form" id="dwr-code-form" novalidate>' +
                        '<input class="dwr-field dwr-code" id="dwr-code" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Enter code" aria-label="6-digit code" required>' +
                        '<button type="submit" class="primary-button" id="dwr-verify">Send my report</button>' +
                    '</form>' +
                    '<div class="dwr-links">' +
                        '<button type="button" class="dwr-link" id="dwr-resend" disabled>Resend code</button>' +
                        '<button type="button" class="dwr-link" id="dwr-change">Use a different email</button>' +
                    '</div>' +
                '</div>' +

                '<div class="dwr-step" data-step="retry" hidden>' +
                    '<h2>One more try</h2>' +
                    '<p class="dwr-sub">Your email is confirmed. We just need to send the report again.</p>' +
                    '<button type="button" class="primary-button" id="dwr-retry">Send my report</button>' +
                '</div>' +

                '<div class="dwr-step" data-step="done" hidden>' +
                    '<h2>Your report is on its way</h2>' +
                    '<p class="dwr-sub">It\'s heading to <strong id="dwr-done-to"></strong> and usually arrives within a minute. If you don\'t see it, check spam or Promotions.</p>' +
                    '<button type="button" class="primary-button" data-dwr-close>Close</button>' +
                '</div>' +

                '<p class="dwr-message" id="dwr-message" role="status" aria-live="polite"></p>' +
                '<div class="dwr-turnstile" id="dwr-turnstile"></div>' +
            '</div>' +
        '</div>';

    var els = {};
    var opts = null;
    var step = "email";
    var email = "";
    var newsletter = false;
    var token = "";
    var busy = false;
    var tickTimer = null;
    var lastFocus = null;
    var turnstileId = null;
    var turnstileToken = "";

    // ── helpers ─────────────────────────────────────────────────────────
    function track(name) {
        if (typeof window.gtag === "function") window.gtag("event", name, { source: "salary-report" });
    }

    function message(text, isError) {
        els.message.textContent = text || "";
        els.message.classList.toggle("is-error", !!isError);
    }

    function showStep(name) {
        step = name;
        Array.prototype.forEach.call(els.modal.querySelectorAll(".dwr-step"), function (node) {
            node.hidden = node.getAttribute("data-step") !== name;
        });
        // The bot check is only needed while a code can be sent.
        els.turnstile.hidden = !(name === "email" || name === "code");
        var focusTarget = { email: els.email, code: els.code, retry: els.retry }[name];
        if (focusTarget) focusTarget.focus();
    }

    function setBusy(isBusy, button, busyText, idleText) {
        busy = isBusy;
        if (!button) return;
        button.disabled = isBusy;
        button.textContent = isBusy ? busyText : idleText;
    }

    function errorText(code, extra) {
        if (code === "wrong_code") {
            var left = extra && typeof extra.tries_left === "number" ? extra.tries_left : 0;
            return "That code doesn't match. Try again, you have " + left + " " + (left === 1 ? "try" : "tries") + " left.";
        }
        return MESSAGES[code] || MESSAGES.send_failed;
    }

    /** POST one action. Resolves { status, body }; rejects only when the network fails. */
    function call(payload) {
        return fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
            body: JSON.stringify(payload)
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (body) {
                return { status: res.status, body: body };
            });
        });
    }

    function toBase64(bytes) {
        var chunk = 0x8000;
        var parts = [];
        for (var i = 0; i < bytes.length; i += chunk) {
            parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
        }
        return btoa(parts.join(""));
    }

    // ── Turnstile ───────────────────────────────────────────────────────
    function ensureTurnstile() {
        if (!TURNSTILE_SITE_KEY) return;
        function draw() {
            if (!window.turnstile || turnstileId !== null) return;
            turnstileId = window.turnstile.render(els.turnstile, {
                sitekey: TURNSTILE_SITE_KEY,
                theme: "dark",
                callback: function (value) { turnstileToken = value; },
                "expired-callback": function () { turnstileToken = ""; },
                "error-callback": function () { turnstileToken = ""; }
            });
        }
        if (window.turnstile) return draw();
        var script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = draw;
        document.head.appendChild(script);
    }

    function resetTurnstile() {
        turnstileToken = "";
        if (turnstileId !== null && window.turnstile) window.turnstile.reset(turnstileId);
    }

    // ── resend countdown ────────────────────────────────────────────────
    function startCountdown(seconds) {
        window.clearInterval(tickTimer);
        var left = seconds;
        function paint() {
            els.resend.disabled = left > 0;
            els.resend.textContent = left > 0 ? "Resend in " + left + "s" : "Resend code";
        }
        paint();
        tickTimer = window.setInterval(function () {
            left -= 1;
            paint();
            if (left <= 0) window.clearInterval(tickTimer);
        }, 1000);
    }

    // ── step 1: ask for a code ──────────────────────────────────────────
    function requestCode(fromResend) {
        if (busy) return;
        var button = fromResend ? null : els.sendCode;
        var address = String(els.email.value || email).trim().toLowerCase();

        if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(address)) {
            message(MESSAGES.invalid_email, true);
            els.email.focus();
            return;
        }
        if (TURNSTILE_SITE_KEY && !turnstileToken) {
            message("One moment, we're checking you're human. Try again in a second.", true);
            return;
        }

        email = address;
        newsletter = els.newsletter.checked;
        message("");
        setBusy(true, button, "Sending…", "Send me the code");
        if (fromResend) els.resend.disabled = true;

        call({ action: "send_code", email: email, newsletter: newsletter, turnstile: turnstileToken })
            .then(function (r) {
                resetTurnstile();
                setBusy(false, button, "", "Send me the code");
                if (r.status === 200) {
                    track("salary_report_request");
                    els.sentTo.textContent = email;
                    els.code.value = "";
                    showStep("code");
                    startCountdown(Number(r.body.retry_after) || 60);
                    message(fromResend ? "A new code is on its way." : "");
                    return;
                }
                if (fromResend) els.resend.disabled = false;
                message(errorText(r.body.error, r.body), true);
            })
            .catch(function () {
                resetTurnstile();
                setBusy(false, button, "", "Send me the code");
                if (fromResend) els.resend.disabled = false;
                message(MESSAGES.network, true);
            });
    }

    // ── step 2: check the code ──────────────────────────────────────────
    function checkCode() {
        if (busy) return;
        var code = String(els.code.value || "").replace(/\D/g, "");
        if (code.length !== 6) {
            message("Enter the 6-digit code from your email.", true);
            els.code.focus();
            return;
        }
        message("");
        setBusy(true, els.verify, "Checking…", "Send my report");

        call({ action: "verify_code", email: email, code: code })
            .then(function (r) {
                if (r.status === 200 && r.body.token) {
                    token = r.body.token;
                    track("salary_report_verified");
                    if (newsletter) track("newsletter_subscribe");
                    setBusy(false, els.verify, "", "Send my report");
                    sendReport();
                    return;
                }
                setBusy(false, els.verify, "", "Send my report");
                message(errorText(r.body.error, r.body), true);
                if (r.body.error === "expired" || r.body.error === "locked") {
                    els.code.value = "";
                    els.resend.disabled = false;
                    els.resend.textContent = "Resend code";
                    window.clearInterval(tickTimer);
                }
            })
            .catch(function () {
                setBusy(false, els.verify, "", "Send my report");
                message(MESSAGES.network, true);
            });
    }

    // ── step 3: build the PDF here and send it ──────────────────────────
    function sendReport() {
        if (busy) return;
        busy = true;
        message("Preparing your report…");
        els.retry.disabled = true;
        els.verify.disabled = true;
        els.verify.textContent = "Sending…";

        opts.build()
            .then(function (file) {
                if (file.bytes.length > 2900000) throw new Error("report too large");
                return call({
                    action: "send_report",
                    token: token,
                    pdf_base64: toBase64(file.bytes),
                    filename: file.filename,
                    role: file.role,
                    level: file.level,
                    location: file.location
                });
            })
            .then(function (r) {
                busy = false;
                els.retry.disabled = false;
                els.verify.disabled = false;
                els.verify.textContent = "Send my report";
                if (r.status === 200) {
                    track("salary_report_sent");
                    els.doneTo.textContent = email;
                    message("");
                    showStep("done");
                    return;
                }
                if (r.body.error === "invalid_token") {
                    token = "";
                    showStep("email");
                    message(MESSAGES.timeout, true);
                    return;
                }
                showStep("retry");
                message(MESSAGES.report_failed, true);
            })
            .catch(function (error) {
                busy = false;
                els.retry.disabled = false;
                els.verify.disabled = false;
                els.verify.textContent = "Send my report";
                if (window.console) console.error("salary report email failed:", error);
                showStep("retry");
                message(MESSAGES.report_failed, true);
            });
    }

    /** The signed-in visitor's email, if there is one, so they do not have to type it. */
    function knownEmail() {
        try {
            var session = JSON.parse(localStorage.getItem("sb-ugjtyuikvdeymwsfsgfl-auth-token") || "null");
            var found = session && session.user && session.user.email;
            return typeof found === "string" ? found : "";
        } catch (e) {
            return "";
        }
    }

    // ── open / close ────────────────────────────────────────────────────
    function open(options) {
        opts = options;
        lastFocus = document.activeElement;
        // A confirmed address with a failed send stays on "try again"; anything else starts fresh.
        if (step !== "retry") {
            if (!els.email.value) els.email.value = knownEmail();
            showStep("email");
            message("");
        }
        els.modal.hidden = false;
        document.body.classList.add("dwr-open");
        ensureTurnstile();
        if (step === "email") els.email.focus();
    }

    function close() {
        if (els.modal.hidden) return;
        els.modal.hidden = true;
        document.body.classList.remove("dwr-open");
        window.clearInterval(tickTimer);
        if (step === "done") step = "email";
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function init() {
        document.body.insertAdjacentHTML("beforeend", MARKUP);
        els.modal = document.getElementById("dwr-modal");
        els.email = document.getElementById("dwr-email");
        els.newsletter = document.getElementById("dwr-newsletter");
        els.sendCode = document.getElementById("dwr-send-code");
        els.code = document.getElementById("dwr-code");
        els.verify = document.getElementById("dwr-verify");
        els.resend = document.getElementById("dwr-resend");
        els.retry = document.getElementById("dwr-retry");
        els.sentTo = document.getElementById("dwr-sent-to");
        els.doneTo = document.getElementById("dwr-done-to");
        els.message = document.getElementById("dwr-message");
        els.turnstile = document.getElementById("dwr-turnstile");

        document.getElementById("dwr-email-form").addEventListener("submit", function (event) {
            event.preventDefault();
            requestCode(false);
        });
        document.getElementById("dwr-code-form").addEventListener("submit", function (event) {
            event.preventDefault();
            checkCode();
        });
        els.code.addEventListener("input", function () {
            els.code.value = els.code.value.replace(/\D/g, "").slice(0, 6);
        });
        els.resend.addEventListener("click", function () { requestCode(true); });
        els.retry.addEventListener("click", sendReport);
        document.getElementById("dwr-change").addEventListener("click", function () {
            window.clearInterval(tickTimer);
            els.email.value = email;
            message("");
            showStep("email");
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

    return { open: open };
})();
