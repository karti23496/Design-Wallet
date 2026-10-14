/* Entry loader — script half. The look and the 5s timeline are in loader.css.

   This file loads synchronously in <head>, BEFORE first paint, because the
   skip decision has to be made before the loader can flash on a repeat visit.
   The stars are painted later, on DOMContentLoaded, once the markup exists;
   the galaxy fades in over 0.9s, so nothing visibly pops in. */

(function () {
    "use strict";

    var COUNT_MS = 5000;
    var FADE_MS = 900;
    var root = document.documentElement;

    // Every load of the homepage, refresh and hard refresh included. Other
    // pages never show it.
    var isHome = location.pathname === "/" || location.pathname === "/index.html";
    if (!isHome) {
        root.classList.add("dw-loader-skip");
        return;
    }

    root.classList.add("dw-loading");

    // The counter is the clock: 0 → 99 over COUNT_MS, and only when it lands
    // on 99 does the loader fade and the page show. Nothing is really loading.
    function run() {
        var loader = document.getElementById("dw-loader");
        var pct = document.getElementById("dw-lo-pct");
        var start = performance.now();

        function finish() {
            if (loader) loader.classList.add("is-done");
            setTimeout(function () {
                root.classList.remove("dw-loading");
                if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
            }, FADE_MS);
        }

        function tick(now) {
            var t = Math.min((now - start) / COUNT_MS, 1);
            // Gentle ease so it feels like work, not a stopwatch.
            var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            var value = Math.round(eased * 0.4 * 99 + t * 0.6 * 99);
            if (pct) pct.textContent = value;
            if (t < 1) requestAnimationFrame(tick); else finish();
        }
        requestAnimationFrame(tick);
    }

    // ── Stars ────────────────────────────────────────────────────────────

    function gauss() {
        return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
    }

    // Pure white, like the homepage's star field. Only the opacity varies.
    function color(alpha) {
        return "rgba(255,255,255," + alpha.toFixed(2) + ")";
    }

    // Round dots of 1-3.5px, as on the homepage. A shadow's spread grows the
    // 1px dot into a circle of (1 + 2*spread) px; 0 gives the smallest stars,
    // `big` the brightest layer's larger ones.
    function dot(big) {
        return (big ? 0.4 + Math.random() * 1.0 : Math.random() * 0.5).toFixed(2);
    }

    // One box-shadow list = one layer. Offsets are from the layer's centre.
    function layer(el, shadows) {
        if (el) el.style.boxShadow = shadows.join(",");
    }

    // Two log-spiral arms plus a diffuse bulge. `r` is a fraction of the
    // disc's radius, `reach` the pixel radius it maps to.
    function arms(count, reach, spread, size, alphaMin) {
        var out = [];
        for (var i = 0; i < count; i++) {
            var r = Math.pow(Math.random(), 1.55);              // dense toward the middle
            var arm = (Math.random() < 0.5 ? 0 : Math.PI);
            var theta = arm + 3.1 * Math.log(0.06 + r) + gauss() * spread * (0.35 + r);
            var rad = r * reach + gauss() * 14;
            var x = Math.cos(theta) * rad;
            var y = Math.sin(theta) * rad;
            var a = alphaMin + Math.random() * (1 - alphaMin);
            out.push(x.toFixed(1) + "px " + y.toFixed(1) + "px 0 " + dot(size) + "px " + color(a));
        }
        return out;
    }

    function bulge(count, reach, size) {
        var out = [];
        for (var i = 0; i < count; i++) {
            var rad = Math.abs(gauss()) * reach;
            var theta = Math.random() * Math.PI * 2;
            out.push((Math.cos(theta) * rad).toFixed(1) + "px " + (Math.sin(theta) * rad).toFixed(1) +
                "px 0 " + dot(size) + "px " + color(0.5 + Math.random() * 0.5));
        }
        return out;
    }

    // Stars scattered evenly across the whole disc, arms or not — the loose
    // field the reference has between its arms.
    function scatter(count, reach, size, alphaMin) {
        var out = [];
        for (var i = 0; i < count; i++) {
            var rad = Math.pow(Math.random(), 0.75) * reach;
            var theta = Math.random() * Math.PI * 2;
            out.push((Math.cos(theta) * rad).toFixed(1) + "px " + (Math.sin(theta) * rad).toFixed(1) +
                "px 0 " + dot(size) + "px " + color(alphaMin + Math.random() * (1 - alphaMin)));
        }
        return out;
    }

    // Small tight knots of stars, like the wispy clumps in the reference.
    function clumps(count, perClump, reach, tight) {
        var out = [];
        for (var c = 0; c < count; c++) {
            var rad = Math.sqrt(Math.random()) * reach;
            var theta = Math.random() * Math.PI * 2;
            var cx = Math.cos(theta) * rad;
            var cy = Math.sin(theta) * rad;
            var n = perClump * (0.4 + Math.random());
            for (var i = 0; i < n; i++) {
                out.push((cx + gauss() * tight * 2).toFixed(1) + "px " + (cy + gauss() * tight).toFixed(1) +
                    "px 0 " + dot(Math.random() < 0.2) + "px " + color(0.4 + Math.random() * 0.6));
            }
        }
        return out;
    }

    function backdrop(el, count) {
        var w = Math.max(window.innerWidth, 800);
        var h = Math.max(window.innerHeight, 600);
        var out = [];
        for (var i = 0; i < count; i++) {
            out.push((Math.random() * w).toFixed(0) + "px " + (Math.random() * h).toFixed(0) +
                "px 0 " + dot(Math.random() < 0.12) + "px " + color(0.35 + Math.random() * 0.65));
        }
        layer(el, out);
    }

    function paint() {
        var loader = document.getElementById("dw-loader");
        if (!loader) return;

        // The disc is 112vw wide (capped), so its radius is 0.56 of that.
        var reach = Math.min(window.innerWidth * 1.12, 1700) * 0.5 * 0.96;
        function q(sel) { return loader.querySelector(sel); }

        // Arms: fine dust (many, dim), mid stars, then a few bright ones.
        layer(q(".dw-lo-stars--dust"), arms(8000, reach, 0.75, 0, 0.3)
            .concat(bulge(3000, reach * 0.62, 0))
            .concat(scatter(5000, reach, 0, 0.25))
            .concat(clumps(45, 40, reach, 18))
            .concat(bulge(2500, reach * 0.3, 0)));
        layer(q(".dw-lo-stars--mid"), arms(2600, reach, 0.5, 0, 0.55)
            .concat(bulge(2200, reach * 0.16, 0))
            .concat(scatter(2500, reach * 0.9, 0, 0.5)));
        layer(q(".dw-lo-stars--bright"), arms(500, reach, 0.26, 1, 0.85)
            .concat(bulge(700, reach * 0.1, 1))
            .concat(scatter(260, reach, 1, 0.8)));

        var back = loader.querySelectorAll(".dw-lo-field i");
        backdrop(back[0], 150);
        backdrop(back[1], 110);
    }

    function start() {
        paint();
        run();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
