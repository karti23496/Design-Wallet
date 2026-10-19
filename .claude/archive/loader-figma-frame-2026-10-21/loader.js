/* Entry loader — script half. The look is in loader.css.

   This file loads synchronously in <head>, BEFORE first paint, because the
   skip decision has to be made before the loader can flash on a repeat visit.
   Nothing is really loading. The counter, bottom right, is the clock: it runs
   0 → 100 over COUNT_MS, stays on 100 for DWELL_MS, and only then does the
   loader fade out onto the home page.
   COUNT_MS + DWELL_MS + FADE_MS is how long a visitor waits: 3.6s, which keeps
   Karthik's 3-4s with the 1s pause on 100 he asked for.
   FADE_MS must match the fade in loader.css (--dw-lo-fade). */

(function () {
    "use strict";

    var COUNT_MS = 2000;
    var DWELL_MS = 1000;   // the pause on 100 before the home page shows
    var FADE_MS = 600;
    var root = document.documentElement;

    // Every load of the homepage, refresh and hard refresh included. Other
    // pages never show it.
    var isHome = location.pathname === "/" || location.pathname === "/index.html";
    if (!isHome) {
        root.classList.add("dw-loader-skip");
        return;
    }

    root.classList.add("dw-loading");

    var start = performance.now();
    var pct = null;

    // Gentle ease so it feels like work, not a stopwatch. The clock starts when
    // this script runs, not when the markup exists, so the loader's length does
    // not depend on how long the page takes to parse; the number is simply
    // painted from the first frame in which its element exists.
    function tick(now) {
        var t = Math.min((now - start) / COUNT_MS, 1);
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var value = Math.round(eased * 0.4 * 100 + t * 0.6 * 100);
        if (!pct) pct = document.getElementById("dw-lo-pct");
        if (pct) pct.textContent = value;
        if (t < 1) requestAnimationFrame(tick); else setTimeout(finish, DWELL_MS);
    }

    function finish() {
        var loader = document.getElementById("dw-loader");
        if (loader) loader.classList.add("is-done");
        setTimeout(function () {
            root.classList.remove("dw-loading");
            if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
        }, FADE_MS);
    }

    requestAnimationFrame(tick);
}());
