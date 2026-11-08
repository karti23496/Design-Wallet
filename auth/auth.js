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
    var ONBOARDED_KEY = "dw_onboarded";

    var page = document.body.getAttribute("data-auth-page");
    var params = new URLSearchParams(location.search);

    // Read before the client starts: it consumes the URL hash on load.
    var arrivedForRecovery = /type=recovery/.test(location.hash);
    var hashError = new URLSearchParams(location.hash.slice(1)).get("error_description");

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
        if (/password should be|at least 8|weak/i.test(m)) return "Use a password of at least 8 characters.";
        if (/same.*password|different from the old/i.test(m)) return "Choose a password you haven’t used here before.";
        if (/provider is not enabled|unsupported provider/i.test(m)) return "Google sign-in isn’t switched on yet. Use email for now.";
        if (/failed to fetch|network/i.test(m)) return "Couldn’t reach the server. Check your connection and try again.";
        return "Something went wrong. Please try again.";
    }

    // Onboarding is mandatory (Karthik, 2026-11-08). `onboarded_at` alone isn't
    // enough: "Skip for now" used to stamp it on empty rows, and those people
    // have to come back and finish too. The newsletter stays a free choice.
    function isOnboarded(profile) {
        return !!(profile && profile.onboarded_at && profile.full_name && profile.role && profile.level &&
            profile.goals && profile.goals.length && profile.city && profile.country);
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

    function google(button, msg) {
        if (!button) return;
        button.addEventListener("click", function () {
            busy(button, true, "Opening Google…");
            track("login_start", { method: "google" });
            // Back to /welcome/, which sends people who've already onboarded
            // straight on to `next`.
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

    // Onboarded people go where they were headed; everyone else to /welcome/.
    function continueAfterSignIn(user) {
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

        var last = firstName(recall(LAST_NAME_KEY));
        if (last) form.querySelector("[data-last-name]").textContent = ", " + last;

        if (params.has("signout")) {
            sb.auth.signOut().then(function () {
                show(msg, "You’re signed out.", "ok");
                history.replaceState(null, "", location.pathname + nextQuery());
            });
        } else {
            sb.auth.getSession().then(function (result) {
                if (result.data.session) continueAfterSignIn(result.data.session.user);
            });
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
            sb.auth.signInWithPassword({ email: e, password: password.value }).then(function (result) {
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
            sb.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: returnUrl("/welcome/") } })
                .then(function (result) {
                    show(msg, result.error ? friendly(result.error) : "Sent. Check your inbox.", result.error ? "error" : "ok");
                });
        });
    }

    // ── /sign-up/ ───────────────────────────────────────────────────────────
    function signUp() {
        var form = document.querySelector('[data-view="form"]');
        var msg = form.querySelector("[data-msg]");
        var submit = form.querySelector('button[type="submit"]');
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
            bad = flag(password, password.value.length < 8) || bad;
            if (bad) {
                return show(msg, password.value && password.value.length < 8 && n && validEmail(e)
                    ? "Use a password of at least 8 characters."
                    : "Fill in your name, a valid email and a password.", "error");
            }

            show(msg, "");
            busy(submit, true, "Creating account…");
            sb.auth.signUp({
                email: e,
                password: password.value,
                options: {
                    data: { full_name: n },
                    emailRedirectTo: returnUrl("/welcome/")
                }
            }).then(function (result) {
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
            sb.auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: returnUrl("/welcome/") } })
                .then(function (result) {
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
            sb.auth.resetPasswordForEmail(e, { redirectTo: returnUrl("/reset-password/") }).then(function (result) {
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
            if (flag(password, password.value.length < 8)) return show(updateMsg, "Use a password of at least 8 characters.", "error");
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

            sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function (r) {
                // Not knowing isn't the same as not done: don't ask someone
                // who's finished to fill it all in again over a network blip.
                if (r.error) {
                    document.querySelector('[data-view="loading"] .auth-sub').textContent = "We couldn’t load your account. Refresh the page to try again.";
                    return;
                }
                var profile = r.data || {};
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
                }
                showView("step-1");
            });
        });

        // ── Delete my account (supabase/delete-account.sql) ──
        var deleteMsg = document.querySelector("[data-msg-delete]");
        document.querySelector("[data-delete-open]").addEventListener("click", function () {
            show(deleteMsg, "");
            showView("delete");
        });
        document.querySelector("[data-delete-cancel]").addEventListener("click", function () {
            showView("step-1");
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

        function prefill(profile) {
            [["role", [profile.role]], ["level", [profile.level]], ["goals", profile.goals || []]].forEach(function (pair) {
                chipGroup(pair[0]).querySelectorAll(".auth-chip").forEach(function (chip) {
                    chip.setAttribute("aria-pressed", String(pair[1].indexOf(chip.getAttribute("data-value")) !== -1));
                });
            });
            var step3 = document.querySelector('[data-view="step-3"]');
            if (profile.city) field(step3, "city").value = profile.city;
            if (profile.country) field(step3, "country").value = profile.country;
            if (profile.onboarded_at) field(step3, "newsletter").checked = !!profile.newsletter;
        }

        function finish(button) {
            var step3 = document.querySelector('[data-view="step-3"]');
            var msg = step3.querySelector("[data-msg]");
            var newsletter = field(step3, "newsletter").checked;
            var answers = {
                full_name: (knownName || field(document.querySelector('[data-view="step-1"]'), "name").value.trim()).slice(0, 80),
                role: picked("role")[0],
                level: picked("level")[0],
                goals: picked("goals"),
                city: field(step3, "city").value.trim(),
                country: field(step3, "country").value.trim(),
                newsletter: newsletter,
                onboarded_at: new Date().toISOString()
            };
            busy(button, true, "Saving…");
            sb.from("profiles").update(answers).eq("id", user.id).select("id").then(function (result) {
                busy(button, false);
                if (result.error || !result.data || !result.data.length) {
                    showView("step-3");
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
                track("onboarding_complete", { role: answers.role });
                document.querySelector("[data-continue]").href = nextPath();
                forgetNext();
                showView("done");
            });
        }

        // What's still missing on a step, or "" when it's all there.
        function missing(n, form) {
            if (n === 1) {
                var name = flag(field(form, "name"), !knownName && !field(form, "name").value.trim());
                var chips = !picked("role").length || !picked("level").length;
                if (name && chips) return "Enter your name, and pick your role and level.";
                if (name) return "Enter your name to continue.";
                return chips ? "Pick your role and your level to continue." : "";
            }
            if (n === 2) return picked("goals").length ? "" : "Pick at least one to continue.";
            var city = flag(field(form, "city"), !field(form, "city").value.trim());
            var country = flag(field(form, "country"), !field(form, "country").value.trim());
            return city || country ? "Enter your city and country to continue." : "";
        }

        [1, 2, 3].forEach(function (n) {
            var form = document.querySelector('[data-view="step-' + n + '"]');
            form.addEventListener("submit", function (event) {
                event.preventDefault();
                var problem = missing(n, form);
                show(form.querySelector("[data-msg]"), problem, problem ? "error" : "");
                if (problem) return;
                if (n < 3) showView("step-" + (n + 1));
                else finish(form.querySelector('button[type="submit"]'));
            });
            var prev = form.querySelector("[data-prev]");
            if (prev) prev.addEventListener("click", function () { showView("step-" + (n - 1)); });
        });
    }

    var pages = { "sign-in": signIn, "sign-up": signUp, "reset-password": resetPassword, "welcome": welcome };
    if (pages[page]) pages[page]();
}());
