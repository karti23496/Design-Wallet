// ============================================================================
// Sign-in portal: /sign-in/, /sign-up/, /reset-password/, /welcome/.
// Which page this is comes from <body data-auth-page>.
//
// Accounts are Supabase Auth: email + password, and Google. The session lives
// in localStorage under `sb-<project>-auth-token`, which is also how header.js
// knows, on every other page, that someone is signed in — without loading this
// library there.
//
// Onboarding answers go to `public.profiles` (supabase/profiles.sql). The
// publishable key below can't read or write that table; the signed-in user's
// own token can reach their own row and nothing else.
// ============================================================================
(function () {
    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
    var LAST_NAME_KEY = "dw_last_name";
    var ONBOARDED_KEY = "dw_onboarded_v2"; // v2: LinkedIn became required (2026-11-12)

    // Local testing only: Google knows http://localhost:8000, not 127.0.0.1,
    // so Google sign-in from 127.0.0.1 is refused. Hop to localhost first.
    if (location.hostname === "127.0.0.1") {
        location.replace(location.href.replace("//127.0.0.1", "//localhost"));
        return;
    }

    var page = document.body.getAttribute("data-auth-page");
    var params = new URLSearchParams(location.search);

    // Read before the client starts: it consumes the URL hash on load.
    var arrivedForRecovery = /type=recovery/.test(location.hash);
    var hashError = new URLSearchParams(location.hash.slice(1)).get("error_description");
    // Back from Google (our own button): #id_token=…&state=… or #error=…&state=…
    var googleReturn = (function () {
        var h = new URLSearchParams(location.hash.slice(1));
        if (page !== "sign-in" || !h.get("state") || !(h.get("id_token") || h.get("error"))) return null;
        history.replaceState(null, "", location.pathname + location.search);
        return h;
    }());

    // ── Small helpers ───────────────────────────────────────────────────────

    // Only same-site paths, and never back into the portal itself.
    function safePath(path) {
        return !!path && /^\/(?!\/)/.test(path) && !/^\/(sign-in|sign-up|reset-password)\//.test(path);
    }

    // Supabase's redirect allow-list holds the exact addresses /welcome/ and
    // /reset-password/, with no wildcards, so a `?next=` can't ride along
    // through Google or an emailed link. It waits in localStorage instead
    // (not sessionStorage: a confirmation link often opens in a new tab).
    // A day old and it's stale: someone who confirms next week shouldn't be
    // sent back to whatever page they started from.
    var NEXT_KEY = "dw_auth_next";
    var NEXT_TTL = 24 * 60 * 60 * 1000;

    function nextPath() {
        var next = params.get("next");
        if (safePath(next)) return next;
        try {
            var saved = JSON.parse(localStorage.getItem(NEXT_KEY) || "null");
            if (saved && Date.now() - saved.at < NEXT_TTL && safePath(saved.path)) return saved.path;
        } catch (e) { /* private mode, or junk in storage */ }
        return "/";
    }

    // Every address handed to Supabase goes through here.
    function returnUrl(path) {
        try { localStorage.setItem(NEXT_KEY, JSON.stringify({ path: nextPath(), at: Date.now() })); } catch (e) { /* private mode */ }
        return location.origin + path;
    }
    function forgetNext() {
        try { localStorage.removeItem(NEXT_KEY); } catch (e) { /* private mode */ }
    }
    function nextQuery() {
        var next = nextPath();
        return next === "/" ? "" : "?next=" + encodeURIComponent(next);
    }

    function show(el, text, kind) {
        if (!el) return;
        el.textContent = text;
        el.className = "auth-msg" + (kind ? " auth-msg--" + kind : "");
        el.hidden = !text;
    }

    function busy(button, on, label) {
        if (!button) return;
        if (on) {
            button.dataset.label = button.textContent;
            button.textContent = label || "Please wait…";
        } else if (button.dataset.label) {
            button.textContent = button.dataset.label;
        }
        button.disabled = on;
    }

    function showView(name) {
        document.querySelectorAll(".auth-view").forEach(function (view) {
            view.hidden = view.getAttribute("data-view") !== name;
        });
        var title = document.querySelector('[data-view="' + name + '"] .auth-title');
        if (title) {
            title.setAttribute("tabindex", "-1");
            title.focus({ preventScroll: true });
        }
        // The homepage carries the sign-up form in a box near the foot of the
        // page: keep the box in view there instead of jumping to the top.
        var box = document.querySelector(".cta-box");
        if (box) box.scrollIntoView({ block: "nearest" });
        else window.scrollTo(0, 0);
    }

    function track(event, detail) {
        if (typeof window.gtag === "function") window.gtag("event", event, detail || {});
    }

    function remember(key, value) {
        try { if (value) localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }
    function recall(key) {
        try { return localStorage.getItem(key) || ""; } catch (e) { return ""; }
    }

    function firstName(full) {
        return String(full || "").trim().split(/\s+/)[0] || "";
    }

    // Supabase's messages are written for developers. These are for people.
    function friendly(error) {
        var m = (error && error.message) || "";
        if (/invalid login credentials/i.test(m)) return "That email and password don’t match. Try again, or reset your password.";
        if (/email not confirmed/i.test(m)) return "Confirm your email first. We sent you a link when you signed up.";
        if (/rate limit|too many|seconds/i.test(m)) return "Too many attempts. Wait a minute, then try again.";
        if (/password should|at least|weak|characters/i.test(m)) return PASSWORD_RULE;
        if (/same.*password|different from the old/i.test(m)) return "Choose a password you haven’t used here before.";
        if (/provider is not enabled|unsupported provider/i.test(m)) return "Google sign-in isn’t switched on yet. Use email for now.";
        if (/captcha/i.test(m)) return "We couldn’t confirm you’re a person. Refresh the page and try again.";
        if (/failed to fetch|network/i.test(m)) return "Couldn’t reach the server. Check your connection and try again.";
        return "Something went wrong. Please try again.";
    }

    // Password rule (Karthik, 2026-11-12): 10+ characters, at least one
    // letter and one number. Supabase enforces the same rule (Auth → Email →
    // minimum length 10, "Letters and digits"); this just says so earlier.
    var PASSWORD_RULE = "Use at least 10 characters, with at least one letter and one number.";
    function weakPassword(value) {
        return value.length < 10 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value);
    }

    // Onboarding is mandatory (Karthik, 2026-11-08). `onboarded_at` alone isn't
    // enough: "Skip for now" used to stamp it on empty rows, and those people
    // have to come back and finish too. The newsletter stays a free choice.
    function isOnboarded(profile) {
        return !!(profile && profile.onboarded_at && profile.full_name && profile.role && profile.level &&
            profile.goals && profile.goals.length && profile.city && profile.country && profile.linkedin);
    }

    // auth/gate.js has no database access, so it reads this note on every
    // gated page. It holds the account's id, so a different account on the
    // same browser gets checked afresh.
    function markOnboarded(user) {
        try { localStorage.setItem(ONBOARDED_KEY, user.id); } catch (e) { /* private mode */ }
    }

    function validEmail(value) {
        return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(value);
    }

    function field(form, name) {
        return form.querySelector('[name="' + name + '"]');
    }
    function flag(input, bad) {
        if (input) input.setAttribute("aria-invalid", bad ? "true" : "false");
        return bad;
    }

    // ── Bits every page shares ──────────────────────────────────────────────

    document.querySelectorAll("[data-reveal]").forEach(function (button) {
        button.addEventListener("click", function () {
            var input = button.parentNode.querySelector("input");
            var reveal = input.type === "password";
            input.type = reveal ? "text" : "password";
            button.textContent = reveal ? "Hide" : "Show";
            button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        });
    });

    document.querySelectorAll("[data-keep-next]").forEach(function (link) {
        link.href = link.getAttribute("href") + nextQuery();
    });

    if (!window.supabase || !window.supabase.createClient) {
        show(document.querySelector("[data-msg]"), "Sign-in couldn’t load. Refresh the page to try again.", "error");
        return;
    }

    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    // ── Bot check (Cloudflare Turnstile, Karthik 2026-11-13) ────────────────
    // Supabase checks a Turnstile token on sign-up, password sign-in, Google
    // (ID token), password reset and "resend" once CAPTCHA protection is on
    // (Supabase → Authentication → Attack Protection). The widget is
    // "managed": invisible for almost everyone, a one-click check only when
    // Cloudflare is unsure. Tokens are single-use, so it resets after each try.
    //
    // Empty key = no bot check at all (the site works exactly as before).
    var TURNSTILE_SITE_KEY = "";
    var captchaState = { id: null, token: "", loading: null };

    function loadTurnstile() {
        if (captchaState.loading) return captchaState.loading;
        captchaState.loading = new Promise(function (resolve, reject) {
            if (window.turnstile) return resolve();
            window.dwTurnstileReady = resolve;
            var script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=dwTurnstileReady";
            script.async = true;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        return captchaState.loading;
    }

    function gotToken(token) {
        captchaState.token = token || "";
    }

    // Draws the (normally invisible) widget just above the form's main button.
    function mountCaptcha(form) {
        if (!TURNSTILE_SITE_KEY || !form || captchaState.id !== null) return;
        var slot = document.createElement("div");
        slot.className = "auth-captcha";
        var submit = form.querySelector('button[type="submit"]');
        form.insertBefore(slot, submit || null);
        loadTurnstile().then(function () {
            captchaState.id = window.turnstile.render(slot, {
                sitekey: TURNSTILE_SITE_KEY,
                theme: "dark",
                appearance: "interaction-only",
                "refresh-expired": "auto",
                callback: gotToken,
                "expired-callback": function () { gotToken(""); },
                "error-callback": function () { gotToken(""); }
            });
        }).catch(function () { /* blocked: Supabase will refuse, and the message says why */ });
    }

    // The token the widget holds right now. The callback usually delivers it,
    // but asking the widget directly is the reliable path (the callback was
    // seen not to fire in testing even though the widget had a token).
    function currentToken() {
        if (captchaState.token) return captchaState.token;
        if (captchaState.id !== null && window.turnstile) {
            try { return window.turnstile.getResponse(captchaState.id) || ""; } catch (e) { return ""; }
        }
        return "";
    }

    // Resolves with a fresh token (or undefined when the bot check is off).
    // Waits up to 15 seconds for Cloudflare, checking every 300 ms.
    function captcha() {
        if (!TURNSTILE_SITE_KEY) return Promise.resolve(undefined);
        return new Promise(function (resolve) {
            var started = Date.now();
            (function check() {
                var token = currentToken();
                if (token || Date.now() - started > 15000) return resolve(token || undefined);
                setTimeout(check, 300);
            }());
        });
    }

    // After every attempt: tokens work once.
    function captchaUsed() {
        captchaState.token = "";
        if (captchaState.id !== null && window.turnstile) window.turnstile.reset(captchaState.id);
    }

    // ── Google ──────────────────────────────────────────────────────────────
    // Google's screen should say "designwallet.in", not the Supabase project
    // address (Karthik, 2026-11-12). So Google sends people back to our own
    // /sign-in/ with a signed ID token, and Supabase checks that token
    // (signInWithIdToken). The button stays our own design (Figma 946:833).
    //
    // Google Cloud, client "Design Wallet web", needs:
    //   Authorised JavaScript origins: https://designwallet.in, http://localhost:8000, http://localhost
    //   Authorised redirect URIs:      https://designwallet.in/sign-in/, http://localhost:8000/sign-in/
    //
    // One Tap ("Continue as …") on /sign-in/ and /sign-up/ is Google's own
    // prompt (Google Identity Services) and uses the same token check.
    // If the browser can't do any of this, the button falls back to the old
    // Supabase redirect.
    var GOOGLE_CLIENT_ID = "895593513159-vio9pmb2njr4qfnunj4ambu3gsdv34sq.apps.googleusercontent.com";
    var GOOGLE_KEY = "dw_google_attempt";

    function hex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
            return ("0" + b.toString(16)).slice(-2);
        }).join("");
    }

    // A fresh nonce for each attempt: Google signs the hashed one into the
    // token, Supabase checks it against the raw one, so a stolen token can't
    // be replayed.
    function makeNonce() {
        var raw = hex(crypto.getRandomValues(new Uint8Array(32)));
        return crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(function (hash) {
            return { raw: raw, hashed: hex(hash) };
        });
    }

    function canDoTokens() {
        return !!(window.crypto && crypto.subtle && window.sessionStorage);
    }

    function signedInWithGoogle(token, nonce, msg) {
        show(msg, "Signing you in…", "ok");
        return captcha().then(function (captchaToken) {
            return sb.auth.signInWithIdToken({ provider: "google", token: token, nonce: nonce, options: { captchaToken: captchaToken } });
        }).then(function (result) {
            captchaUsed();
            if (result.error) {
                show(msg, friendly(result.error), "error");
                return false;
            }
            var user = result.data.user;
            remember(LAST_NAME_KEY, user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name));
            track("login", { method: "google" });
            continueAfterSignIn(user);
            return true;
        });
    }

    // Our button: off to Google, back to /sign-in/ with the token in the hash.
    function redirectToGoogle() {
        return makeNonce().then(function (nonce) {
            var state = hex(crypto.getRandomValues(new Uint8Array(16)));
            sessionStorage.setItem(GOOGLE_KEY, JSON.stringify({ state: state, nonce: nonce.raw }));
            returnUrl("/sign-in/"); // keeps `next` for afterwards
            var query = new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                redirect_uri: location.origin + "/sign-in/",
                response_type: "id_token",
                scope: "openid email profile",
                nonce: nonce.hashed,
                state: state,
                prompt: "select_account"
            });
            location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + query.toString());
        });
    }

    // Back from Google on /sign-in/. Returns true when this visit is that return.
    function finishGoogle(msg) {
        if (!googleReturn) return false;
        var attempt = null;
        try {
            attempt = JSON.parse(sessionStorage.getItem(GOOGLE_KEY) || "null");
            sessionStorage.removeItem(GOOGLE_KEY);
        } catch (e) { /* storage blocked */ }

        if (googleReturn.get("error")) {
            show(msg, googleReturn.get("error") === "access_denied"
                ? "Google sign-in was cancelled."
                : "Google sign-in didn’t work. Try again, or use your email.", "error");
            return true;
        }
        if (!attempt || attempt.state !== googleReturn.get("state")) {
            show(msg, "That Google sign-in had expired. Try again.", "error");
            return true;
        }
        signedInWithGoogle(googleReturn.get("id_token"), attempt.nonce, msg);
        return true;
    }

    function loadGoogle() {
        return new Promise(function (resolve, reject) {
            if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
            var script = document.createElement("script");
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // `window.google` spelled out: inside this file, `google` is our function below.
    function oneTap(msg) {
        if (!canDoTokens() || document.body.classList.contains("home-page") || googleReturn) return;
        loadGoogle().then(makeNonce).then(function (nonce) {
            var gis = window.google.accounts.id;
            gis.initialize({
                client_id: GOOGLE_CLIENT_ID,
                nonce: nonce.hashed,
                context: page === "sign-in" ? "signin" : "signup",
                itp_support: true,
                use_fedcm_for_prompt: true,
                callback: function (response) {
                    signedInWithGoogle(response.credential, nonce.raw, msg);
                }
            });
            gis.prompt();
        }).catch(function () { /* no One Tap; the button still works */ });
    }

    function google(button, msg) {
        if (!button) return;
        oneTap(msg);
        button.addEventListener("click", function () {
            busy(button, true, "Opening Google…");
            track("login_start", { method: "google" });
            if (canDoTokens()) {
                redirectToGoogle().catch(function () {
                    busy(button, false);
                    show(msg, "Google sign-in couldn’t start. Try again.", "error");
                });
                return;
            }
            // Old browsers: Supabase's redirect, back to /welcome/.
            sb.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: returnUrl("/welcome/") }
            }).then(function (result) {
                if (result.error) {
                    busy(button, false);
                    show(msg, friendly(result.error), "error");
                }
            });
        });
    }

    // The browser still holds a sign-in for an account that was deleted
    // (its token lasts up to an hour). Drop it and start again cleanly.
    function accountGone() {
        sb.auth.signOut({ scope: "local" }).finally(function () {
            try {
                localStorage.removeItem("sb-ugjtyuikvdeymwsfsgfl-auth-token");
                localStorage.removeItem(ONBOARDED_KEY);
            } catch (e) { /* private mode */ }
            location.replace("/sign-in/?gone=1");
        });
    }

    // Onboarded people go where they were headed; everyone else to /welcome/.
    // ── Two-step login (Karthik, 2026-11-12: optional, authenticator app) ──
    // Supabase TOTP. An account with a verified factor signs in at "aal1"
    // (password or Google) and needs the 6-digit code to reach "aal2".
    function needsCode() {
        return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
            return !!(r.data && r.data.currentLevel === "aal1" && r.data.nextLevel === "aal2");
        });
    }

    function verifiedTotp() {
        return sb.auth.mfa.listFactors().then(function (r) {
            return (r.data && r.data.totp || []).filter(function (f) { return f.status === "verified"; })[0] || null;
        });
    }

    function cleanCode(input) {
        return input.value.replace(/\D/g, "").slice(0, 6);
    }

    function continueAfterSignIn(user) {
        return needsCode().then(function (need) {
            if (!need) return goOn(user);
            // The code screen lives on /sign-in/; it picks up from the session.
            if (page !== "sign-in") return location.replace("/sign-in/" + nextQuery());
            askForCode(user);
        });
    }

    function askForCode(user) {
        var form = document.querySelector('[data-view="mfa"]');
        var msg = form.querySelector("[data-msg-mfa]");
        var input = field(form, "code");
        showView("mfa");
        input.focus();
        if (form.dataset.ready) return;
        form.dataset.ready = "1";
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var code = cleanCode(input);
            if (flag(input, code.length !== 6)) return show(msg, "Enter the 6-digit code from your authenticator app.", "error");
            var submit = form.querySelector('button[type="submit"]');
            busy(submit, true, "Checking…");
            verifiedTotp().then(function (factor) {
                if (!factor) return { error: { message: "no factor" } };
                return sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code });
            }).then(function (result) {
                busy(submit, false);
                if (result.error) {
                    input.value = "";
                    return show(msg, "That code didn’t work. Codes change every 30 seconds, so try the newest one.", "error");
                }
                track("login_2fa");
                goOn(user);
            });
        });
    }

    function goOn(user) {
        return sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function (result) {
            if (!isOnboarded(result.data)) return location.replace("/welcome/" + nextQuery());
            markOnboarded(user);
            var next = nextPath();
            forgetNext();
            location.replace(next);
        });
    }

    // ── /sign-in/ ───────────────────────────────────────────────────────────
    function signIn() {
        var form = document.querySelector('[data-view="form"]');
        var msg = form.querySelector("[data-msg]");
        var submit = form.querySelector('button[type="submit"]');
        mountCaptcha(form);

        var last = firstName(recall(LAST_NAME_KEY));
        if (last) form.querySelector("[data-last-name]").textContent = ", " + last;

        if (params.has("signout")) {
            sb.auth.signOut().then(function () {
                show(msg, "You’re signed out.", "ok");
                history.replaceState(null, "", location.pathname + nextQuery());
            });
        } else if (!finishGoogle(msg)) {
            sb.auth.getSession().then(function (result) {
                if (result.data.session) continueAfterSignIn(result.data.session.user);
            });
        }

        if (params.has("gone")) {
            show(msg, "That account no longer exists. Sign in again, or create a new account.", "error");
        }

        if (hashError || params.has("expired")) {
            show(msg, "That link has expired or was already used. Sign in below, or ask for a new one.", "error");
        }

        google(form.querySelector("[data-google]"), msg);

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var email = field(form, "email"), password = field(form, "password");
            var e = email.value.trim().toLowerCase();
            var bad = flag(email, !validEmail(e));
            bad = flag(password, !password.value) || bad;
            if (bad) return show(msg, "Enter your email and password.", "error");

            show(msg, "");
            busy(submit, true, "Signing in…");
            captcha().then(function (captchaToken) {
                return sb.auth.signInWithPassword({ email: e, password: password.value, options: { captchaToken: captchaToken } });
            }).then(function (result) {
                captchaUsed();
                if (result.error) {
                    busy(submit, false);
                    show(msg, friendly(result.error), "error");
                    if (/email not confirmed/i.test(result.error.message)) offerResend(msg, e);
                    return;
                }
                var user = result.data.user;
                remember(LAST_NAME_KEY, user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name));
                track("login", { method: "email" });
                continueAfterSignIn(user);
            });
        });
    }

    function offerResend(msg, email) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = "Resend the confirmation email";
        msg.appendChild(document.createTextNode(" "));
        msg.appendChild(button);
        button.addEventListener("click", function () {
            button.disabled = true;
            captcha().then(function (captchaToken) {
                return sb.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: returnUrl("/welcome/"), captchaToken: captchaToken } });
            })
                .then(function (result) {
                    captchaUsed();
                    show(msg, result.error ? friendly(result.error) : "Sent. Check your inbox.", result.error ? "error" : "ok");
                });
        });
    }

    // ── /sign-up/ ───────────────────────────────────────────────────────────
    function signUp() {
        var form = document.querySelector('[data-view="form"]');
        var msg = form.querySelector("[data-msg]");
        var submit = form.querySelector('button[type="submit"]');
        mountCaptcha(form);
        var sentMsg = document.querySelector("[data-msg-sent]");
        var sentTo = "";

        sb.auth.getSession().then(function (result) {
            if (result.data.session) continueAfterSignIn(result.data.session.user);
        });

        google(form.querySelector("[data-google]"), msg);

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var name = field(form, "name"), email = field(form, "email"), password = field(form, "password");
            var n = name.value.trim(), e = email.value.trim().toLowerCase();
            var bad = flag(name, !n);
            bad = flag(email, !validEmail(e)) || bad;
            bad = flag(password, weakPassword(password.value)) || bad;
            if (bad) {
                return show(msg, password.value && weakPassword(password.value) && n && validEmail(e)
                    ? PASSWORD_RULE
                    : "Fill in your name, a valid email and a password.", "error");
            }

            show(msg, "");
            busy(submit, true, "Creating account…");
            captcha().then(function (captchaToken) {
                return sb.auth.signUp({
                    email: e,
                    password: password.value,
                    options: {
                        data: { full_name: n },
                        emailRedirectTo: returnUrl("/welcome/"),
                        captchaToken: captchaToken
                    }
                });
            }).then(function (result) {
                captchaUsed();
                busy(submit, false);
                if (result.error) return show(msg, friendly(result.error), "error");
                remember(LAST_NAME_KEY, n);
                track("sign_up", { method: "email" });
                // With "Confirm email" on (the default), there's no session
                // until they click the link. An address that already has an
                // account gets the same screen, so this form can't be used to
                // find out who's signed up.
                if (result.data.session) return location.replace("/welcome/" + nextQuery());
                sentTo = e;
                document.querySelector("[data-sent-to]").textContent = e;
                showView("sent");
            });
        });

        document.querySelector("[data-resend]").addEventListener("click", function (event) {
            var button = event.currentTarget;
            busy(button, true, "Sending…");
            captcha().then(function (captchaToken) {
                return sb.auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: returnUrl("/welcome/"), captchaToken: captchaToken } });
            })
                .then(function (result) {
                    captchaUsed();
                    busy(button, false);
                    show(sentMsg, result.error ? friendly(result.error) : "Sent again. Check your inbox.", result.error ? "error" : "ok");
                });
        });

        document.querySelector("[data-back]").addEventListener("click", function () {
            show(sentMsg, "");
            showView("form");
        });
    }

    // ── /reset-password/ ────────────────────────────────────────────────────
    function resetPassword() {
        var request = document.querySelector('[data-view="request"]');
        var update = document.querySelector('[data-view="update"]');
        var requestMsg = request.querySelector("[data-msg]");
        var updateMsg = update.querySelector("[data-msg-update]");
        mountCaptcha(request);

        function showUpdate(session) {
            update.querySelector("[data-user-email]").textContent = session.user.email;
            showView("update");
        }

        // The emailed link signs them in for this one purpose.
        sb.auth.onAuthStateChange(function (event, session) {
            if (event === "PASSWORD_RECOVERY" && session) showUpdate(session);
        });
        if (arrivedForRecovery) {
            sb.auth.getSession().then(function (result) {
                if (result.data.session) showUpdate(result.data.session);
            });
        }
        if (hashError) show(requestMsg, "That link has expired or was already used. Send yourself a new one.", "error");

        request.addEventListener("submit", function (event) {
            event.preventDefault();
            var email = field(request, "email");
            var e = email.value.trim().toLowerCase();
            if (flag(email, !validEmail(e))) return show(requestMsg, "Enter the email you signed up with.", "error");
            var submit = request.querySelector('button[type="submit"]');
            busy(submit, true, "Sending…");
            captcha().then(function (captchaToken) {
                return sb.auth.resetPasswordForEmail(e, { redirectTo: returnUrl("/reset-password/"), captchaToken: captchaToken });
            }).then(function (result) {
                captchaUsed();
                busy(submit, false);
                // Only a rate limit is worth reporting. "No such account" is
                // deliberately indistinguishable from success.
                if (result.error && /rate limit|too many|seconds/i.test(result.error.message)) {
                    return show(requestMsg, friendly(result.error), "error");
                }
                document.querySelector("[data-sent-to]").textContent = e;
                showView("sent");
            });
        });

        update.addEventListener("submit", function (event) {
            event.preventDefault();
            var password = field(update, "password");
            if (flag(password, weakPassword(password.value))) return show(updateMsg, PASSWORD_RULE, "error");
            var submit = update.querySelector('button[type="submit"]');
            busy(submit, true, "Saving…");
            sb.auth.updateUser({ password: password.value }).then(function (result) {
                if (result.error) {
                    busy(submit, false);
                    return show(updateMsg, friendly(result.error), "error");
                }
                show(updateMsg, "Password saved. Taking you to Design Wallet…", "ok");
                setTimeout(function () { location.replace("/"); }, 1200);
            });
        });
    }

    // ── /welcome/ (onboarding) ──────────────────────────────────────────────
    function welcome() {
        var user = null;
        var knownName = "";

        sb.auth.getSession().then(function (result) {
            var session = result.data.session;
            if (!session) {
                if (hashError) {
                    location.replace("/sign-in/" + nextQuery() + (nextQuery() ? "&" : "?") + "expired=1");
                    return;
                }
                location.replace("/sign-in/?next=" + encodeURIComponent("/welcome/" + location.search));
                return;
            }
            user = session.user;
            var meta = user.user_metadata || {};
            remember(LAST_NAME_KEY, meta.full_name || meta.name);

            needsCode().then(function (need) {
                if (need) return location.replace("/sign-in/?next=" + encodeURIComponent("/welcome/" + location.search));
                loadProfile();
            });
        });

        function loadProfile() {
            sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function (r) {
                // Not knowing isn't the same as not done: don't ask someone
                // who's finished to fill it all in again over a network blip.
                if (r.error) {
                    document.querySelector('[data-view="loading"] .auth-sub').textContent = "We couldn’t load your account. Refresh the page to try again.";
                    return;
                }
                if (!r.data) {
                    // No row usually means a brand-new account, but it can
                    // also mean the account itself was deleted. Ask the server.
                    return sb.auth.getUser().then(function (u) {
                        if (u.error && (u.error.status === 401 || u.error.status === 403 || /not exist|not found/i.test(u.error.message))) return accountGone();
                        showProfile({});
                    });
                }
                showProfile(r.data);
            });
        }

        function showProfile(profile) {
            var meta = user.user_metadata || {};
            var onboarded = isOnboarded(profile);
            if (onboarded) markOnboarded(user);
            if (onboarded && !params.has("edit")) {
                var next = nextPath();
                forgetNext();
                location.replace(next);
                return;
            }
            // Google doesn't always send a name; only then do we ask.
            knownName = String(profile.full_name || meta.full_name || meta.name || "").trim();
            document.querySelector("[data-name-field]").hidden = !!knownName;
            var first = firstName(knownName);
            document.querySelectorAll("[data-first-name]").forEach(function (el) {
                el.textContent = first ? ", " + first : "";
            });
            prefill(profile);
            // Opened from the account menu: offer deletion too.
            if (params.has("edit")) {
                document.querySelectorAll("[data-edit-only]").forEach(function (el) { el.hidden = false; });
                refresh2fa();
                showCookieChoice();
            }
            showView("profile");
        }

        // ── Cookie choice (site-prefs.js / consent.js) ──
        function showCookieChoice() {
            var c = recall("dw_cookies");
            document.querySelector("[data-cookie-choice]").textContent =
                c === "essential" ? "essential only" : c === "all" ? "all accepted" : "not chosen yet";
        }
        document.querySelector("[data-cookie-reset]").addEventListener("click", function (event) {
            try { localStorage.removeItem("dw_cookies"); } catch (e) { /* private mode */ }
            document.querySelector("[data-cookie-choice]").textContent = "we’ll ask again on the next page";
            event.currentTarget.hidden = true;
        });

        // ── Two-step login on/off (Profile & preferences only) ──
        var twoFa = { on: false, factor: null, pending: null };
        var twoFaMsg = document.querySelector("[data-msg-2fa]");
        var twoFaButton = document.querySelector("[data-2fa-toggle]");

        function refresh2fa() {
            return verifiedTotp().then(function (factor) {
                twoFa.on = !!factor;
                twoFa.factor = factor;
                document.querySelector("[data-2fa-status]").textContent = factor
                    ? "On. Signing in also asks for a 6-digit code from your authenticator app."
                    : "Off. Turn it on to also ask for a 6-digit code from an authenticator app when you sign in.";
                twoFaButton.textContent = factor ? "Turn off" : "Turn on";
            });
        }

        // Supabase sends the QR as "data:image/svg+xml;utf-8,<svg …>" with the
        // SVG unescaped, which browsers may refuse to draw. Re-wrap it safely.
        function qrSrc(raw) {
            var comma = raw.indexOf(",");
            var svg = raw.slice(comma + 1);
            if (/^%3C/i.test(svg)) svg = decodeURIComponent(svg);
            return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        }

        // Half-finished setups left behind (closed tab, cancel) would block a
        // new one, so they're cleared first.
        function dropUnverified() {
            return sb.auth.mfa.listFactors().then(function (r) {
                var stale = (r.data && r.data.all || []).filter(function (f) {
                    return f.factor_type === "totp" && f.status !== "verified";
                });
                return Promise.all(stale.map(function (f) { return sb.auth.mfa.unenroll({ factorId: f.id }); }));
            });
        }

        twoFaButton.addEventListener("click", function () {
            show(twoFaMsg, "");
            if (twoFa.on) {
                show(document.querySelector("[data-msg-off]"), "");
                return showView("mfa-off");
            }
            busy(twoFaButton, true, "Starting…");
            dropUnverified().then(function () {
                return sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
            }).then(function (result) {
                busy(twoFaButton, false);
                if (result.error) return show(twoFaMsg, "Two-step login couldn’t start. Please try again in a moment.", "error");
                twoFa.pending = result.data.id;
                document.querySelector("[data-qr]").src = qrSrc(result.data.totp.qr_code);
                document.querySelector("[data-secret]").textContent = result.data.totp.secret;
                var setup = document.querySelector('[data-view="mfa-setup"]');
                field(setup, "code").value = "";
                show(setup.querySelector("[data-msg-setup]"), "");
                showView("mfa-setup");
            });
        });

        var setupForm = document.querySelector('[data-view="mfa-setup"]');
        setupForm.addEventListener("submit", function (event) {
            event.preventDefault();
            var input = field(setupForm, "code");
            var msgSetup = setupForm.querySelector("[data-msg-setup]");
            var code = cleanCode(input);
            if (flag(input, code.length !== 6)) return show(msgSetup, "Enter the 6-digit code your app shows.", "error");
            var submit = setupForm.querySelector('button[type="submit"]');
            busy(submit, true, "Checking…");
            sb.auth.mfa.challengeAndVerify({ factorId: twoFa.pending, code: code }).then(function (result) {
                busy(submit, false);
                if (result.error) {
                    input.value = "";
                    return show(msgSetup, "That code didn’t work. Codes change every 30 seconds, so try the newest one.", "error");
                }
                twoFa.pending = null;
                track("2fa_on");
                refresh2fa().then(function () {
                    showView("profile");
                    show(twoFaMsg, "Two-step login is on. Next time you sign in, have your phone ready.", "ok");
                });
            });
        });

        document.querySelector("[data-setup-cancel]").addEventListener("click", function () {
            if (twoFa.pending) sb.auth.mfa.unenroll({ factorId: twoFa.pending });
            twoFa.pending = null;
            showView("profile");
        });

        document.querySelector("[data-off-cancel]").addEventListener("click", function () {
            showView("profile");
        });
        document.querySelector("[data-off-confirm]").addEventListener("click", function (event) {
            var button = event.currentTarget;
            busy(button, true, "Turning off…");
            sb.auth.mfa.unenroll({ factorId: twoFa.factor.id }).then(function (result) {
                busy(button, false);
                if (result.error) {
                    return show(document.querySelector("[data-msg-off]"), "We couldn’t turn it off. Sign out, sign in again with your code, then try once more.", "error");
                }
                track("2fa_off");
                refresh2fa().then(function () {
                    showView("profile");
                    show(twoFaMsg, "Two-step login is off.", "ok");
                });
            });
        });

        // ── Delete my account (supabase/delete-account.sql) ──
        var deleteMsg = document.querySelector("[data-msg-delete]");
        document.querySelector("[data-delete-open]").addEventListener("click", function () {
            show(deleteMsg, "");
            showView("delete");
        });
        document.querySelector("[data-delete-cancel]").addEventListener("click", function () {
            showView("profile");
        });
        document.querySelector("[data-delete-confirm]").addEventListener("click", function (event) {
            var button = event.currentTarget;
            busy(button, true, "Deleting…");
            sb.rpc("delete_my_account").then(function (result) {
                if (result.error) {
                    busy(button, false);
                    return show(deleteMsg, "We couldn’t delete your account. Please try again in a moment.", "error");
                }
                // The account is gone server-side; drop the local session too.
                // signOut can fail now the user no longer exists, so the
                // stored session is cleared by hand either way.
                sb.auth.signOut({ scope: "local" }).finally(function () {
                    try {
                        localStorage.removeItem("sb-ugjtyuikvdeymwsfsgfl-auth-token");
                        localStorage.removeItem(LAST_NAME_KEY);
                        localStorage.removeItem(ONBOARDED_KEY);
                    } catch (e) { /* private mode */ }
                    forgetNext();
                    track("account_deleted");
                    show(deleteMsg, "Your account has been deleted. Taking you to the homepage…", "ok");
                    button.hidden = true;
                    document.querySelector("[data-delete-cancel]").hidden = true;
                    setTimeout(function () { location.replace("/"); }, 1800);
                });
            });
        });

        function chipGroup(name) {
            return document.querySelector('[data-chips="' + name + '"]');
        }
        function picked(name) {
            var chips = chipGroup(name).querySelectorAll('[aria-pressed="true"]');
            return Array.prototype.map.call(chips, function (chip) { return chip.getAttribute("data-value"); });
        }

        document.querySelectorAll("[data-chips]").forEach(function (group) {
            var multi = group.hasAttribute("data-multi");
            group.addEventListener("click", function (event) {
                var chip = event.target.closest(".auth-chip");
                if (!chip) return;
                var on = chip.getAttribute("aria-pressed") !== "true";
                if (!multi) {
                    group.querySelectorAll(".auth-chip").forEach(function (other) { other.setAttribute("aria-pressed", "false"); });
                }
                chip.setAttribute("aria-pressed", String(on));
            });
        });

        var form = document.querySelector('[data-view="profile"]');
        var msg = form.querySelector("[data-msg]");

        function prefill(profile) {
            [["role", [profile.role]], ["level", [profile.level]], ["goals", profile.goals || []]].forEach(function (pair) {
                chipGroup(pair[0]).querySelectorAll(".auth-chip").forEach(function (chip) {
                    chip.setAttribute("aria-pressed", String(pair[1].indexOf(chip.getAttribute("data-value")) !== -1));
                });
            });
            if (profile.city) field(form, "city").value = profile.city;
            if (profile.country) field(form, "country").value = profile.country;
            if (profile.linkedin) field(form, "linkedin").value = profile.linkedin.replace(/^https:\/\/www\./, "");
            if (profile.onboarded_at) field(form, "newsletter").checked = !!profile.newsletter;
        }

        // Only a LinkedIn profile link: "linkedin.com/in/name", with or without
        // https, www or a country subdomain, a trailing slash or tracking bits.
        // Anything else (other sites, company pages, a bare name) is refused.
        // Returns the tidy link, or null.
        function linkedin(value) {
            var m = value.trim().match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9_%-]{3,100})\/?(?:[?#].*)?$/i);
            return m ? "https://www.linkedin.com/in/" + m[1] + "/" : null;
        }

        // Everything still missing, named the way the page labels it, or ""
        // when it's all there. Empty sections get a red outline, and the page
        // scrolls to the first one.
        var firstGap = null;
        function gap(el, bad) {
            if (el.tagName === "FIELDSET") el.classList.toggle("is-missing", bad);
            else flag(el, bad);
            if (bad && !firstGap) firstGap = el;
            return bad;
        }
        function missing() {
            firstGap = null;
            var gaps = [];
            if (gap(field(form, "name"), !knownName && !field(form, "name").value.trim())) gaps.push("your name");
            if (gap(chipGroup("role"), !picked("role").length)) gaps.push("a Role");
            if (gap(chipGroup("level"), !picked("level").length)) gaps.push("a Level");
            if (gap(chipGroup("goals"), !picked("goals").length)) gaps.push("at least one option under “What brings you here?”");
            var city = gap(field(form, "city"), !field(form, "city").value.trim());
            var country = gap(field(form, "country"), !field(form, "country").value.trim());
            if (city && country) gaps.push("your city and country");
            else if (city) gaps.push("your city");
            else if (country) gaps.push("your country");
            if (gap(field(form, "linkedin"), !field(form, "linkedin").value.trim())) gaps.push("your LinkedIn profile link");
            if (gaps.length) {
                var list = gaps.length > 1 ? gaps.slice(0, -1).join(", ") + " and " + gaps[gaps.length - 1] : gaps[0];
                return "To finish, pick or fill in " + list + (/”$/.test(list) ? "" : ".");
            }
            if (gap(field(form, "linkedin"), linkedin(field(form, "linkedin").value) === null)) {
                return "Only a LinkedIn profile link works here, like linkedin.com/in/yourname.";
            }
            return "";
        }

        // Picking a chip clears its group's red outline straight away.
        form.addEventListener("click", function (event) {
            var group = event.target.closest(".auth-chip") && event.target.closest("fieldset");
            if (group && group.querySelector('[aria-pressed="true"]')) group.classList.remove("is-missing");
        });

        function finish(button) {
            var newsletter = field(form, "newsletter").checked;
            var answers = {
                id: user.id,
                full_name: (knownName || field(form, "name").value.trim()).slice(0, 80),
                role: picked("role")[0],
                level: picked("level")[0],
                goals: picked("goals"),
                city: field(form, "city").value.trim(),
                country: field(form, "country").value.trim(),
                linkedin: linkedin(field(form, "linkedin").value),
                newsletter: newsletter,
                onboarded_at: new Date().toISOString()
            };
            busy(button, true, "Saving…");
            // Update the row; if it's missing (a test row deleted by hand),
            // create it. Not an upsert: PostgREST's upsert rewrites every
            // column it sends, `id` included, and `id` is deliberately not
            // updatable, so the database refuses it (42501).
            var row = Object.assign({}, answers);
            delete row.id;
            sb.from("profiles").update(row).eq("id", user.id).select("id").then(function (result) {
                if (result.error || (result.data && result.data.length)) return result;
                return sb.from("profiles").insert(answers).select("id");
            }).then(function (result) {
                busy(button, false);
                if (result.error || !result.data || !result.data.length) {
                    if (result.error) console.error("profile save", result.error);
                    if (result.error && result.error.code === "23503") return accountGone();
                    show(msg, "We couldn’t save your answers. Please try again in a moment.", "error");
                    return;
                }
                markOnboarded(user);
                // The same door the nav's old Subscribe used. Publishable key
                // only: `subscribe` is the one thing it may call, and it answers
                // the same whether or not the address was already on the list.
                if (newsletter) {
                    fetch(SUPABASE_URL + "/rest/v1/rpc/subscribe", {
                        method: "POST",
                        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
                        body: JSON.stringify({ p_email: user.email, p_source: "/welcome/" })
                    }).catch(function () { /* the profile already records the choice */ });
                }
                track("onboarding_complete", { role: answers.role, linkedin: !!answers.linkedin });
                document.querySelector("[data-continue]").href = nextPath();
                forgetNext();
                showView("done");
            });
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var problem = missing();
            show(msg, problem, problem ? "error" : "");
            if (problem) return (firstGap || msg).scrollIntoView({ block: "center", behavior: "smooth" });
            finish(form.querySelector('button[type="submit"]'));
        });
    }

    var pages = { "sign-in": signIn, "sign-up": signUp, "reset-password": resetPassword, "welcome": welcome };
    if (pages[page]) pages[page]();
}());
