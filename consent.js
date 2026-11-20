// ============================================================================
// Cookie choice, applied before Google Analytics starts (2026-11-12).
//
// Loaded on every page, right before the Google tag snippet (2026-11-13: full
// consent, every visitor is asked, signed in or not):
//   "all"        → analytics on, with cookies.
//   "essential"  → Google Analytics switched off completely: no cookies, no hits.
//   not chosen   → consent mode "denied": Google gets cookieless, anonymous
//                  pings only, and nothing is stored on the device.
// Ads features are always off; the site doesn't use them.
//
// It also replaces the inline Google tag snippet (2026-11-13), so no page has
// inline JavaScript and the Content Security Policy can forbid it.
//
// The choice lives in localStorage `dw_cookies`: "all" or "essential".
// ============================================================================
(function () {
    var choice = "";
    try { choice = localStorage.getItem("dw_cookies") || ""; } catch (e) { /* storage blocked */ }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

    if (choice === "essential") window["ga-disable-G-HLX9Y7DQV7"] = true;

    window.gtag("consent", "default", {
        analytics_storage: choice === "all" ? "granted" : "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", "G-HLX9Y7DQV7");
}());
