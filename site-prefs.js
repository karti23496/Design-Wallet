// ============================================================================
// Cookie notice inside the product (Karthik, 2026-11-12: "Let them choose").
//
// Shown on every page, to everyone, until they pick (2026-11-13: public pages
// too; before that only signed-in product pages). "Essential only" switches Google Analytics off on every
// page from now on (consent.js reads the choice before the Google tag runs)
// and clears the analytics cookies already set. "Accept all" keeps it on.
// Sign-in storage is essential and always stays.
//
// Named site-prefs / .dw-prefs on purpose: ad and privacy blockers hide
// anything called cookie-notice, cookie-banner etc. (Karthik's own browser did).
//
// Change it later: Profile & preferences → "Change cookie choice", which
// clears `dw_cookies` so this card shows again.
// ============================================================================
(function () {
    var KEY = "dw_cookies";
    var GA_ID = "G-HLX9Y7DQV7";

    function read() {
        try { return localStorage.getItem(KEY) || ""; } catch (e) { return "skip"; }
    }

    // Google Analytics sets _ga and _ga_<id> on the site's domain.
    function clearAnalyticsCookies() {
        var host = location.hostname;
        var domains = ["", host, "." + host, "." + host.replace(/^www\./, "")];
        document.cookie.split(";").forEach(function (part) {
            var name = part.split("=")[0].trim();
            if (!/^_ga(_|$)|^_gid$|^_gat/.test(name)) return;
            domains.forEach(function (d) {
                document.cookie = name + "=; Max-Age=0; path=/" + (d ? "; domain=" + d : "");
            });
        });
    }

    function choose(value, card) {
        try { localStorage.setItem(KEY, value); } catch (e) { /* storage blocked */ }
        if (value === "essential") {
            window["ga-disable-" + GA_ID] = true;
            if (typeof window.gtag === "function") window.gtag("consent", "update", { analytics_storage: "denied" });
            clearAnalyticsCookies();
        } else if (typeof window.gtag === "function") {
            window.gtag("consent", "update", { analytics_storage: "granted" });
            window.gtag("event", "cookie_choice", { choice: "all" });
        }
        card.classList.add("dw-prefs--out");
        setTimeout(function () { card.remove(); }, 250);
    }

    function show() {
        if (read()) return;
        var card = document.createElement("section");
        card.className = "dw-prefs";
        card.setAttribute("role", "region");
        card.setAttribute("aria-label", "Cookie choice");
        card.innerHTML =
            '<p class="dw-prefs-title">We use cookies</p>' +
            '<p class="dw-prefs-text">Essential ones keep the site working and you signed in. Analytics (Google Analytics) show us what to improve. ' +
            'Your choice. <a href="/privacy/">Privacy policy</a></p>' +
            '<div class="dw-prefs-actions">' +
            '<button type="button" class="dw-prefs-btn dw-prefs-btn--line" data-choice="essential">Essential only</button>' +
            '<button type="button" class="dw-prefs-btn dw-prefs-btn--primary" data-choice="all">Accept all</button>' +
            "</div>";
        card.addEventListener("click", function (event) {
            var button = event.target.closest("[data-choice]");
            if (button) choose(button.getAttribute("data-choice"), card);
        });
        document.body.appendChild(card);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
    else show();
}());
