// ============================================================================
// Combined Login + Setup screen (PRD §3.3, §3.4, §9.2)
// One screen, three behaviours:
//   1. SETUP  — arrived from a successful payment with ?token=... → set a
//               password to complete the paid account (account creation is
//               ONLY possible here, with a valid payment token).
//   2. LOGIN  — returning subscriber → standard email + password login.
//   3. Smart recognition — on a failed login for a paid-but-signup-incomplete
//               email, route the user into setup instead of a generic error.
// Plus: Forgot password, and "Already paid but can't log in?" recovery.
//
// There is NO open signup: a visitor with no payment token sees a login form
// only, plus a link to the Pricing page.
// ============================================================================

import { supabase, getAccessState, signIn } from "/auth/supabase-client.js";

const cfg = window.DW_CONFIG || {};
const params = new URLSearchParams(window.location.search);
const setupToken = params.get("token");
const prefillEmail = params.get("email") || "";
// Lemon Squeezy redirects here with ?paid=1 right after checkout, BEFORE the
// user has opened the emailed setup link. Show a reassuring "check your inbox"
// state instead of a bare login form.
const justPaid = params.get("paid") === "1";
// Returning-subscriber escape hatch: reached only via the explicit "Already
// subscribed? Log in" link on the Pricing page (/account/login/?login=1).
const allowLogin = params.get("login") === "1";
// Journey enforcement (payment before login): the login form is shown ONLY to a
// first-time payer (?token), a just-paid redirect (?paid=1), or a returning
// subscriber who deliberately chose to log in (?login=1). Anyone else who lands
// on /login — including someone typing the URL to skip payment — is funnelled to
// the Pricing page. Already-signed-in users are routed by subscription status.
const canShowForm = Boolean(setupToken) || justPaid || allowLogin;

const els = {
    title: document.querySelector("[data-auth-title]"),
    intro: document.querySelector("[data-auth-intro]"),
    banner: document.querySelector("[data-auth-banner]"),
    form: document.querySelector("[data-auth-form]"),
    email: document.querySelector("[data-auth-email]"),
    passwordField: document.querySelector("[data-auth-password-field]"),
    passwordLabel: document.querySelector("[data-auth-password-label]"),
    password: document.querySelector("[data-auth-password]"),
    error: document.querySelector("[data-auth-error]"),
    submit: document.querySelector("[data-auth-submit]"),
    forgot: document.querySelector("[data-auth-forgot]"),
    google: document.querySelector("[data-auth-google]")
};

let mode = setupToken ? "setup" : "login";

// ── UI helpers ──────────────────────────────────────────────────────────
function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = false;
}
function clearError() { els.error.hidden = true; }
function showBanner(msg, kind) {
    els.banner.textContent = msg;
    els.banner.hidden = false;
    els.banner.dataset.kind = kind || "info";
}
function setBusy(busy, busyLabel) {
    els.submit.disabled = busy;
    if (busy) els.submit.dataset.idle = els.submit.textContent;
    els.submit.textContent = busy ? (busyLabel || "Please wait…") : (els.submit.dataset.idle || els.submit.textContent);
}

function renderSetupMode() {
    els.title.textContent = "Payment successful 🎉";
    els.intro.textContent = "Set a password to access your collection — it's the last step.";
    els.passwordLabel.textContent = "Create a password";
    els.password.setAttribute("autocomplete", "new-password");
    els.submit.textContent = "Create account & open collection";
    if (prefillEmail) {
        els.email.value = prefillEmail;
        els.email.readOnly = true;
        els.email.classList.add("is-locked");
    }
}

function renderLoginMode() {
    els.title.textContent = "Log in to Design Wallet";
    els.intro.textContent = "Enter your email and password to access your collection.";
    els.passwordLabel.textContent = "Password";
    els.password.setAttribute("autocomplete", "current-password");
    els.submit.textContent = "Log in";
}

// ── Post-auth routing (PRD §5.1 state machine) ──────────────────────────
async function routeAfterAuth() {
    const state = await getAccessState();
    if (state.status === "active") {
        window.location.replace(cfg.ROUTE_COLLECTION);      // → the collection
    } else {
        // suspended (or fail-closed) → the account-status page, nothing else.
        window.location.replace(cfg.ROUTE_ACCOUNT);
    }
}


// ── SETUP submit: complete account via signed payment token ─────────────
async function handleSetup(email, password) {
    setBusy(true, "Creating your account…");
    try {
        // Edge Function validates the single-use token (service role), creates
        // the auth user, sets subscription_status=active + renews_at, and marks
        // the payment complete.
        const { data, error } = await supabase.functions.invoke("complete-account-setup", {
            body: { token: setupToken, email, password }
        });
        if (error || (data && data.error)) throw new Error((data && data.error) || error.message);

        // Now sign in client-side to establish the session.
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;

        if (typeof gtag === "function") gtag("event", "account_setup_complete");
        await routeAfterAuth();
    } catch (err) {
        console.error("[login] setup failed:", err);
        showError("That setup link is invalid or has expired. Use “Already paid but can't log in?” below to get a fresh one.");
        setBusy(false);
    }
}

// ── LOGIN submit, with smart recognition on failure ─────────────────────
async function handleLogin(email, password) {
    setBusy(true, "Logging in…");
    try {
        const { error } = await signIn(email, password);
        if (!error) {
            await routeAfterAuth();
            return;
        }

        // Failure → is this a paid-but-incomplete email? (PRD §5.5 / FR-18)
        const status = await checkEmailStatus(email);
        if (status === "paid_incomplete") {
            showBanner("Looks like you've already paid — check your inbox for the link to set your password and open your collection.", "info");
            clearError();
        } else {
            showError("Incorrect email or password. Please try again.");
        }
        setBusy(false);
    } catch (err) {
        console.error("[login] login failed:", err);
        showError("Something went wrong. Please try again.");
        setBusy(false);
    }
}

// Neutral-ish status check used only to improve the failed-login message.
async function checkEmailStatus(email) {
    try {
        const { data } = await supabase.functions.invoke("check-email-status", { body: { email } });
        return (data && data.status) || "unknown";
    } catch {
        return "unknown";
    }
}

// ── Forgot password (FR-20) ─────────────────────────────────────────────
async function handleForgot() {
    const email = (els.email.value || "").trim();
    if (!email) { showError("Enter your email above first, then tap Forgot password."); return; }
    clearError();
    try {
        await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + cfg.ROUTE_ACCOUNT
        });
    } catch (err) {
        console.error("[login] reset failed:", err);
    }
    // Neutral message regardless, to avoid email enumeration.
    showBanner("If that email has an account, we've sent a password reset link.", "info");
}

// ── Sign in with Google (Supabase OAuth) ────────────────────────────────
async function handleGoogle() {
    clearError();
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin + cfg.ROUTE_LOGIN }
        });
        if (error) throw error;
        // On success the browser is redirected to Google, then back to the login
        // page, where the session is detected and routeAfterAuth runs.
    } catch (err) {
        console.error("[login] google sign-in failed:", err);
        showError("Couldn't start Google sign-in. Please try again.");
    }
}

// ── Render the correct form, or enforce the journey ─────────────────────
const authCard = document.querySelector("[data-auth-card]");
if (authCard) authCard.hidden = true; // hide until we've decided

function showForm() {
    if (mode === "setup") {
        renderSetupMode();
    } else {
        renderLoginMode();
        if (justPaid) {
            showBanner("Payment successful 🎉 Check your inbox — we've emailed you a link to set your password and open your collection. Already set it? Log in below.", "info");
        }
    }
    if (authCard) authCard.hidden = false;
}

getAccessState().then((s) => {
    if (s.session) { routeAfterAuth(); return; }   // already signed in → route by status
    if (canShowForm) { showForm(); return; }         // legitimate reason to see the form
    window.location.replace(cfg.ROUTE_PRICING);      // else: pay first
}).catch(() => {
    if (canShowForm) showForm();
    else window.location.replace(cfg.ROUTE_PRICING);
});

// ── Wire up ─────────────────────────────────────────────────────────────
els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    const email = (els.email.value || "").trim();
    const password = els.password.value || "";
    if (!email || !password) { showError("Please enter both your email and password."); return; }
    if (mode === "setup" && password.length < 8) {
        showError("Use at least 8 characters for your password.");
        return;
    }
    if (mode === "setup") handleSetup(email, password);
    else handleLogin(email, password);
});

els.forgot.addEventListener("click", handleForgot);
if (els.google) els.google.addEventListener("click", handleGoogle);
