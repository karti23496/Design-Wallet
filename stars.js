/* The orbiting starfield — shared by every hero that carries a `#stars-field`
   (the three catalogue shells, /list-your-tool/, /good-deals/, /changelog/)
   and, since 2026-09-20, by the mobile gate.

   §10 of DECISIONS.md: do NOT tune the constants below for one page. They are
   the look. A caller that needs different numbers passes options to
   `DWStars.populate` — which is what the gate does, because a phone's field
   has to reach the corners of a 390px viewport rather than a 1300px hero. */

(function (global) {
    "use strict";

    var DEFAULTS = {
        count: 100,
        minSize: 120,      // orbit diameter, px
        maxSize: 1020,
        minDuration: 20,   // seconds for one revolution
        maxDuration: 90
    };

    function populate(field, options) {
        if (!field) return;

        var opts = {};
        var key;
        for (key in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
                opts[key] = options && options[key] != null ? options[key] : DEFAULTS[key];
            }
        }

        var spread = opts.maxSize - opts.minSize;
        var span = opts.maxDuration - opts.minDuration;

        for (var i = 0; i < opts.count; i++) {
            var orbit = document.createElement("div");
            orbit.className = "star-orbit";
            var size = opts.minSize + Math.random() * spread;
            var duration = opts.minDuration + Math.random() * span;
            var delay = -(Math.random() * duration);
            var reverse = Math.random() > 0.5 ? "reverse" : "normal";
            orbit.style.width = size + "px";
            orbit.style.height = size + "px";
            orbit.style.animationDuration = duration + "s";
            orbit.style.animationDelay = delay + "s";
            orbit.style.animationDirection = reverse;

            var star = document.createElement("span");
            star.className = "star";
            var starSize = 1 + Math.random() * 2.5;
            var opacity = 0.2 + Math.random() * 0.7;
            star.style.width = starSize + "px";
            star.style.height = starSize + "px";
            star.style.marginLeft = -(starSize / 2) + "px";
            star.style.marginTop = -(starSize / 2) + "px";
            star.style.opacity = opacity;
            if (Math.random() > 0.7) {
                // Painted from --fg-rgb rather than a literal white, like the rest
                // of the palette.
                star.style.boxShadow = "0 0 " + (4 + Math.random() * 4) + "px rgba(var(--fg-rgb)," + (0.4 + Math.random() * 0.4) + ")";
            }

            orbit.appendChild(star);
            field.appendChild(orbit);
        }
    }

    global.DWStars = { populate: populate, DEFAULTS: DEFAULTS };

    // The original behaviour, unchanged: fill `#stars-field` with the defaults.
    populate(document.getElementById("stars-field"));
})(window);
