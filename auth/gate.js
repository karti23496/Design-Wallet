// ============================================================================
// UI access gate for the collection SPA (/category/*, /tools/*).
// The page ships with <html class="dw-gate-pending"> which hides the body via
// CSS; this script either REVEALS it (active subscriber) or lets guardGatedPage
// redirect (no session → Pricing, suspended → Account). Hiding first avoids any
// flash of gated content for non-subscribers.
//
// It is DORMANT until Supabase is configured (placeholder keys → no gating), so
// this file is safe to ship before the paywall goes live. It also only acts on
// gated paths, so 404.html (which serves arbitrary routes on GitHub Pages) is
// unaffected on non-gated URLs.
//
// NOTE (per product decision): this is a UI-only gate for launch. The catalog
// still loads client-side from the public Google Sheet, so it is not
// cryptographically protected — see supabase/README.md "Deferred: real gate".
// ============================================================================

import { guardGatedPage } from "/auth/supabase-client.js";
import { demoModeActive } from "/auth/demo-auth.js";

const cfg = window.DW_CONFIG || {};
const root = document.documentElement;
const reveal = () => root.classList.remove("dw-gate-pending");

const onGatedPath = /^\/(category|tools)(\/|$)/.test(location.pathname);
const configured = cfg.SUPABASE_URL && !/YOUR-PROJECT-ref/.test(cfg.SUPABASE_URL);
// Gate is live when Supabase is configured OR when the localhost demo is active,
// so the gating experience can be reviewed in preview.
const gateLive = configured || demoModeActive();

if (!onGatedPath || !gateLive) {
    // Not a gated route, or the paywall isn't live here → leave it open.
    reveal();
} else {
    // active → reveal; suspended/none → guardGatedPage redirects (stays hidden).
    guardGatedPage({ onActive: reveal }).catch(reveal);
}
