// ============================================================================
// Pricing page logic (monthly subscription)
//   - Renders the configured price (single source: /auth/config.js).
//   - Points the CTA straight at the Lemon Squeezy hosted checkout (no custom
//     checkout form / no server call).
//   - If the visitor is already an active subscriber, sends them to the
//     collection instead of asking them to subscribe again.
// ============================================================================

import { getAccessState } from "/auth/supabase-client.js";

const cfg = window.DW_CONFIG || {};

const priceEl = document.querySelector("[data-ga-price]");
const intervalEl = document.querySelector("[data-ga-price-interval]");
const noteEl = document.querySelector("[data-ga-price-note]");
const ctaPriceEl = document.querySelector("[data-ga-cta-price]");
const ctaBtn = document.querySelector("[data-ga-checkout]");

// Single source of truth for the displayed price.
if (priceEl && cfg.ACCESS_PRICE_DISPLAY) priceEl.textContent = cfg.ACCESS_PRICE_DISPLAY;
if (intervalEl && cfg.ACCESS_PRICE_INTERVAL) intervalEl.textContent = cfg.ACCESS_PRICE_INTERVAL;
if (noteEl && cfg.ACCESS_PRICE_NOTE) noteEl.textContent = cfg.ACCESS_PRICE_NOTE;
if (ctaPriceEl && cfg.ACCESS_PRICE_DISPLAY) {
    ctaPriceEl.textContent = cfg.ACCESS_PRICE_DISPLAY + (cfg.ACCESS_PRICE_INTERVAL || "");
}

// Point the CTA at the hosted checkout so it works even before JS runs.
if (ctaBtn && cfg.LS_CHECKOUT_URL) ctaBtn.setAttribute("href", cfg.LS_CHECKOUT_URL);

if (typeof gtag === "function") gtag("event", "pricing_view");

// Already-active subscribers shouldn't be asked to subscribe again.
getAccessState().then((state) => {
    if (state.status === "active") {
        window.location.replace(cfg.ROUTE_COLLECTION);
    } else if (state.status === "suspended") {
        window.location.replace(cfg.ROUTE_ACCOUNT);
    }
}).catch(() => { /* not configured yet — leave the page as-is */ });

if (ctaBtn) {
    ctaBtn.addEventListener("click", () => {
        if (typeof gtag === "function") gtag("event", "checkout_started");
        ctaBtn.setAttribute("aria-disabled", "true");
        // Let the anchor's href navigate to Lemon Squeezy.
    });
}
