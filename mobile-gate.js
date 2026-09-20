/* Mobile gate — the panel a phone sees instead of the site.

   The decision about WHEN to show this lives in mobile-gate.css, as a media
   query, so the page never flashes before the gate covers it. This file only
   supplies the panel and its one action.

   `GATE_SCOPE` is the single lever: "all" gates the whole site, "tools" gates
   only the interactive pages and leaves the catalogue, blog and salary pages
   reachable on a phone — which is what search traffic lands on. Change this
   one line rather than editing 21 pages. */

(function (global) {
    "use strict";

    var GATE_SCOPE = "all"; // "all" | "tools"

    var TOOL_PATHS = ["/dw-tools/", "/salary/submit/", "/submit-portfolio/", "/favourites"];

    function inScope() {
        if (GATE_SCOPE === "all") return true;
        var path = location.pathname;
        for (var i = 0; i < TOOL_PATHS.length; i++) {
            if (path.indexOf(TOOL_PATHS[i]) === 0) return true;
        }
        return false;
    }

    /* The homepage's orbiting starfield, behind the panel.

       It is the SHARED field from stars.js — not a copy of its loop — so the
       two cannot drift. What the gate passes is size: the defaults' 120-1020px
       orbits are drawn for a 1300px hero, and on a 390px phone the big ones
       would spend most of their revolution off-screen while the field itself
       looked like a tight knot in the middle. Sizing the orbits off the
       viewport's own diagonal instead is what makes the field cover the
       screen, corner to corner, at any phone size.

       If stars.js is missing the gate simply has no field. It is decoration;
       nothing here is allowed to take the panel down with it. */
    function stars(gate) {
        var field = document.createElement("div");
        field.className = "dw-gate-stars";
        field.setAttribute("aria-hidden", "true");
        gate.insertBefore(field, gate.firstChild);

        var diagonal = Math.sqrt(
            window.innerWidth * window.innerWidth + window.innerHeight * window.innerHeight
        );

        var options = {
            // The widest orbit clears the corners; the tightest still reads as
            // a core rather than a single point.
            minSize: Math.round(diagonal * 0.12),
            maxSize: Math.round(diagonal * 1.15)
        };

        function paint() {
            if (global.DWStars && typeof global.DWStars.populate === "function") {
                global.DWStars.populate(field, options);
            }
        }

        if (global.DWStars) {
            paint();
            return;
        }

        // Only 8 of the 22 gated pages carry stars.js. Rather than load it on
        // the other 14 — where desktop would pay for it and never see it —
        // pull it in here, once the gate is already on screen.
        var script = document.createElement("script");
        script.src = "/stars.js?v=20260920-1";
        script.onload = paint;
        script.onerror = function () {};
        document.head.appendChild(script);
    }

    /* The 3D wallet mark at the foot of the screen. It sits outside
       .dw-gate-inner so it anchors to the screen rather than to the centred
       column, and it is served as a 15KB WebP derivative rather than the
       249KB source PNG. */
    function mark(gate) {
        var image = document.createElement("img");
        image.className = "dw-gate-mark";
        image.src = "/public/images/dw-element.webp?v=20260920-1";
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.width = 578;
        image.height = 493;
        image.decoding = "async";
        gate.appendChild(image);
    }

    var decorated = false;

    /* Both decorations cost bytes, and the panel is built on every viewport —
       so neither is created until the stylesheet has actually put the gate on
       screen. Asking for the computed style reads that decision rather than
       duplicating the media query in here, where it would drift. */
    function decorate(gate) {
        if (decorated) return;
        if (getComputedStyle(gate).display === "none") return;
        decorated = true;
        stars(gate);
        mark(gate);
    }

    function build() {
        if (document.getElementById("dw-mobile-gate")) return;
        if (!inScope()) {
            // Out of scope: undo the stylesheet's hiding for this page.
            document.documentElement.classList.add("dw-gate-off");
            var style = document.createElement("style");
            style.textContent =
                ".dw-gate-off, .dw-gate-off body { overflow: visible !important; height: auto !important; }" +
                ".dw-gate-off body > * { display: revert !important; }" +
                ".dw-gate-off body::after { content: none !important; }";
            document.head.appendChild(style);
            return;
        }

        var gate = document.createElement("div");
        gate.id = "dw-mobile-gate";
        gate.setAttribute("role", "dialog");
        gate.setAttribute("aria-modal", "true");
        gate.setAttribute("aria-labelledby", "dw-gate-title");
        gate.innerHTML =
            '<div class="dw-gate-inner">' +
                '<img class="dw-gate-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet" width="162" height="30">' +
                /* Karthik's copy, verbatim. The kicker went with it — the
                   headline is a punchline and a preamble only softens it. */
                '<h1 class="dw-gate-title" id="dw-gate-title">Size matters. This site <br> got big-screen <br> energy. 🔥 </h1>' +
            '</div>';

        document.body.appendChild(gate);
        document.body.classList.add("dw-gate-ready");

        decorate(gate);
    }

    function boot() {
        build();
        var gate = document.getElementById("dw-mobile-gate");
        if (!gate) return;
        window.addEventListener("resize", function () {
            decorate(gate);
        });
        window.addEventListener("orientationchange", function () {
            decorate(gate);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})(window);
