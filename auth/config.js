// ============================================================================
// Design Wallet — Paid Access configuration (PRD v4: monthly subscription)
// Fill these in once the Supabase project + Lemon Squeezy are provisioned.
// The anon key is SAFE to expose in the browser: access is enforced by Postgres
// Row-Level Security + the subscription_status guard, not by hiding this key.
// NEVER put the Supabase service-role key or the Lemon Squeezy API/webhook
// secret here — those live only in Edge Function env.
// ============================================================================

window.DW_CONFIG = {
    // --- Supabase (from Project Settings → API) -----------------------------
    SUPABASE_URL: "https://sfnaphcifpzeerunxjxz.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_8oQEGWPOQFYPYSLtj1bTSQ_KjFRy2x5",

    // --- Lemon Squeezy hosted checkout (PRD §6.2, live link) ----------------
    // We link straight to the hosted checkout — there is no custom checkout form
    // and no create-session server call. Auto-renewal is on by default; the
    // subscription is billed on the same calendar date each month.
    LS_CHECKOUT_URL:
        "https://designwallet.lemonsqueezy.com/checkout/buy/457851d2-1a3b-4b55-99f5-0850c4f74d49",
    // Configure this product's "Redirect after purchase" URL in the Lemon
    // Squeezy dashboard to: https://designwallet.in/account/login/?paid=1
    // The authoritative account-setup link is emailed by the webhook (FR-8).

    // Generic help link shown to a suspended/cancelled user. Per-user signed
    // Customer Portal URLs come from the profile (ls_customer_portal_url); this
    // is only a fallback for when we don't have one on file.
    LS_PORTAL_HELP_URL: "mailto:hello@designwallet.in",

    // --- Pricing copy (single source of truth for display) ------------------
    // The authoritative amount + interval live in Lemon Squeezy. Keep in sync.
    ACCESS_PRICE_DISPLAY: "₹1,499",
    ACCESS_PRICE_INTERVAL: "/month",
    ACCESS_PRICE_NOTE: "billed monthly · renews monthly · cancel anytime",

    // --- Routes -------------------------------------------------------------
    ROUTE_PRICING: "/pricing/",        // subscriber Pricing / Get Access page
    ROUTE_LOGIN: "/account/login/",
    ROUTE_ACCOUNT: "/account/",        // account-status page (also the suspended view)
    ROUTE_COLLECTION: "/category/"     // the gated collection
};
