// ============================================================================
// Design Wallet — shared Supabase client + auth/access helpers (PRD v4)
// Loaded as a module: <script type="module" src="/auth/supabase-client.js">
// Exposes window.DWAuth for non-module page scripts to consume.
//
// Access is governed by subscription_status: active | suspended | signup_incomplete.
// The status is read from the RLS-protected profiles row on every call, so it is
// real-time (no localStorage caching) and cannot be spoofed client-side — the
// row is readable only by its owner and writable only by the service role.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { demoModeActive, demoSignIn, demoSignOut, demoState } from "/auth/demo-auth.js";

const cfg = window.DW_CONFIG || {};

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,      // "stay logged in" (PRD §5.3)
        autoRefreshToken: true,
        detectSessionInUrl: true   // handles password-reset / magic links
    }
});

// Returns the current visitor's access state.
//   status: "none" (not logged in) | "active" | "suspended" | "signup_incomplete"
export async function getAccessState() {
    const empty = {
        session: null, user: null, status: "none",
        renewsAt: null, suspendedReason: null, portalUrl: null,
        email: null, name: null, avatarUrl: null
    };

    // Preview-only: localhost + unconfigured Supabase → use the demo session.
    if (demoModeActive()) return demoState();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return empty;

    // Google (and other OAuth) identities put name/picture in user_metadata.
    const meta = session.user.user_metadata || {};
    const name = meta.full_name || meta.name || null;
    const avatarUrl = meta.avatar_url || meta.picture || null;

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("subscription_status, subscription_renews_at, suspended_reason, ls_customer_portal_url, email")
        .eq("id", session.user.id)
        .maybeSingle();

    // Fail closed: an unreadable/missing profile is treated as suspended.
    if (error || !profile) {
        return { session, user: session.user, status: "suspended",
                 renewsAt: null, suspendedReason: null, portalUrl: null,
                 email: session.user.email, name, avatarUrl };
    }

    return {
        session,
        user: session.user,
        status: profile.subscription_status,
        renewsAt: profile.subscription_renews_at,
        suspendedReason: profile.suspended_reason,
        portalUrl: profile.ls_customer_portal_url,
        email: profile.email || session.user.email,
        name,
        avatarUrl
    };
}

// Guard for gated pages (/category/*, listings, search). Behaviour per PRD §4/§5.7:
//   - not logged in        → Pricing page
//   - active               → onActive(state) renders the collection
//   - suspended            → Account-status page (NO collection, NO preview)
//   - signup_incomplete /
//     anything else        → Pricing page (fail closed)
export async function guardGatedPage({ onActive } = {}) {
    const state = await getAccessState();

    if (state.status === "active") {
        if (typeof onActive === "function") onActive(state);
        return state;
    }
    if (state.status === "suspended") {
        window.location.replace(cfg.ROUTE_ACCOUNT || "/account/");
        return state;
    }
    window.location.replace(cfg.ROUTE_PRICING || "/pricing/");
    return state;
}

// Sign in wrapper: routes to the demo shim in preview, else real Supabase auth.
export async function signIn(email, password) {
    if (demoModeActive()) return demoSignIn(email, password);
    return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
    if (demoModeActive()) {
        demoSignOut();
        window.location.href = "/";
        return;
    }
    await supabase.auth.signOut();
    window.location.href = "/";
}

// Bridge for classic (non-module) scripts on the page.
window.DWAuth = { supabase, getAccessState, guardGatedPage, signIn, signOut };
