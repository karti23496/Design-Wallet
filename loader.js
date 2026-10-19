/* Entry loader — script half. The look and the first half of the timeline are in
   loader.css.

   This file loads synchronously in <head>, BEFORE first paint, because the skip
   decision has to be made before the loader can flash on a repeat visit.

   Nothing is really loading. The counter, bottom right, is the clock:

     0 → COUNT_MS      the counter runs 0 → 100 while the CSS draws the box
     COUNT_MS          on 100
     + DWELL_MS        a pause on 100
     + OPEN_MS         `is-opening`: the box opens out to fill the screen
     + FADE_MS         `is-done`: a last short fade onto the page, then removal

   COUNT_MS + DWELL_MS + OPEN_MS + FADE_MS is how long a visitor waits: 5.2s. It was
   3.8s until Karthik said it was too fast (2026-10-22); the 1s pause on 100 stays. OPEN_MS and
   FADE_MS must match --dw-lo-open and --dw-lo-fade in loader.css. */

(function () {
    "use strict";

    var COUNT_MS = 3000;
    var DWELL_MS = 1000;
    var OPEN_MS = 900;
    var FADE_MS = 300;
    var root = document.documentElement;

    // Every load of the homepage, refresh and hard refresh included. Other
    // pages never show it.
    var isHome = location.pathname === "/" || location.pathname === "/index.html";
    if (!isHome) {
        root.classList.add("dw-loader-skip");
        return;
    }

    root.classList.add("dw-loading");

    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var start = performance.now();
    var pct = null;

    function loader() {
        return document.getElementById("dw-loader");
    }

    function leave() {
        var el = loader();
        if (el) el.classList.add("is-done");
        setTimeout(function () {
            root.classList.remove("dw-loading");
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }, FADE_MS);
    }

    function open() {
        var el = loader();
        // With reduced motion the square does not travel: just fade out.
        if (reduced || !el) { leave(); return; }
        el.classList.add("is-opening");
        setTimeout(leave, OPEN_MS);
    }

    // On 100 nothing flashes: it simply holds for DWELL_MS, then opens.
    function full() {
        setTimeout(open, DWELL_MS);
    }

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
        if (t < 1) requestAnimationFrame(tick); else full();
    }

    requestAnimationFrame(tick);
}());
