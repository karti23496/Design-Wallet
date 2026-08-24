// ============================================================================
// PREVIEW-ONLY demo login (no backend).
// Lets you experience the logged-in UX — collection, account page, suspended
// state — without a real Supabase project.
//
// HARD-GUARDED: demoModeActive() is true ONLY when
//   (a) the page is served from localhost / 127.0.0.1, AND
//   (b) Supabase is still unconfigured (placeholder keys in auth/config.js).
// So this can NEVER authenticate on designwallet.in, and it switches itself off
// automatically the moment real Supabase keys are added. It is safe to ship.
//
// Demo credentials (password for both is "designwallet"):
//   demo@designwallet.in       → active subscriber (full access)
//   suspended@designwallet.in  → suspended account (payment_failed view)
// ============================================================================

const cfg = window.DW_CONFIG || {};
const KEY = "dw_demo_session";

const DEMO_USERS = {
    "demo@designwallet.in": {
        password: "designwallet",
        status: "active"
    },
    "suspended@designwallet.in": {
        password: "designwallet",
        status: "suspended",
        suspendedReason: "payment_failed"
    }
};

export function demoModeActive() {
    const host = location.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host === "";
    const unconfigured = !cfg.SUPABASE_URL || /YOUR-PROJECT-ref/.test(cfg.SUPABASE_URL);
    return local && unconfigured;
}

export function demoSignIn(email, password) {
    const key = String(email || "").toLowerCase().trim();
    const u = DEMO_USERS[key];
    if (!u || u.password !== password) {
        return { error: { message: "Invalid demo credentials" } };
    }
    localStorage.setItem(KEY, JSON.stringify({ email: key }));
    return { error: null };
}

export function demoSignOut() {
    localStorage.removeItem(KEY);
}

export function demoState() {
    const empty = {
        session: null, user: null, status: "none",
        renewsAt: null, suspendedReason: null, portalUrl: null, email: null
    };
    let raw;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { raw = null; }
    if (!raw || !raw.email) return empty;

    const u = DEMO_USERS[raw.email];
    if (!u) return empty;

    const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    return {
        session: { demo: true },
        user: { email: raw.email },
        status: u.status,
        renewsAt: u.status === "active" ? oneYear : null,
        suspendedReason: u.suspendedReason || null,
        portalUrl: cfg.LS_PORTAL_HELP_URL || null,
        email: raw.email
    };
}
