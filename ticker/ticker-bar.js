/* Renders the ticker bar. The words live in edit-ticker.js — edit that, not this.

   The marquee is CSS, driven by two custom properties this file measures and
   sets: how far the track has to travel, and how long that should take. The
   track holds two identical groups and slides left by exactly one group's
   width, so the loop closes with no seam and no jump.

   The number of copies in a group is measured rather than guessed: a short
   update on a wide monitor needs more copies to fill the bar than a long one
   on a laptop, and a fixed count leaves a visible gap on one or the other. */

(function (global) {
    "use strict";

    var SPEED = 100; // pixels per second — slow enough to read in passing.
    var HOVER_RATE = 0.25; // a quarter speed while the pointer is on the bar.
    var SEPARATOR = "•";

    function item(text) {
        var span = document.createElement("span");
        span.className = "dw-ticker-item";
        span.textContent = text;
        var dot = document.createElement("span");
        dot.className = "dw-ticker-dot";
        dot.textContent = SEPARATOR;
        span.appendChild(dot);
        return span;
    }

    function fill(track, text) {
        track.textContent = "";

        // Measure one copy, then work out how many it takes to cover the
        // viewport. Done on a real node because font loading and letter
        // spacing make any calculated guess wrong.
        var sample = item(text);
        track.appendChild(sample);
        var width = sample.getBoundingClientRect().width;
        if (!width) return; // fonts not ready yet; the resize pass will retry

        var copies = Math.max(2, Math.ceil(window.innerWidth / width) + 1);
        track.textContent = "";

        var group = document.createElement("span");
        group.className = "dw-ticker-group";
        for (var i = 0; i < copies; i++) group.appendChild(item(text));
        track.appendChild(group);
        track.appendChild(group.cloneNode(true));

        var distance = group.getBoundingClientRect().width;
        track.style.setProperty("--dw-ticker-distance", distance + "px");
        track.style.setProperty("--dw-ticker-duration", distance / SPEED + "s");
    }

    /* Slow down under the pointer instead of freezing. Rewriting
       `animation-duration` would re-time the running animation and make it
       jump; setting the playback rate keeps its current position and simply
       advances it more slowly. Browsers without the Web Animations API just
       keep scrolling at full speed, which is the harmless outcome. */
    function slowOnHover(bar, track) {
        if (!track.getAnimations) return;

        function rate(value) {
            var running = track.getAnimations();
            for (var i = 0; i < running.length; i++) {
                if (running[i].updatePlaybackRate) running[i].updatePlaybackRate(value);
                else running[i].playbackRate = value;
            }
        }

        bar.addEventListener("mouseenter", function () { rate(HOVER_RATE); });
        bar.addEventListener("mouseleave", function () { rate(1); });
        // Keyboard users get the same courtesy when the link takes focus.
        bar.addEventListener("focusin", function () { rate(HOVER_RATE); });
        bar.addEventListener("focusout", function () { rate(1); });
    }

    function build() {
        var config = global.DW_TICKER;
        if (!config || config.show === false || !config.text) return;
        if (document.querySelector(".dw-ticker")) return;

        var bar = document.createElement("div");
        bar.className = "dw-ticker";

        var link = document.createElement("a");
        link.className = "dw-ticker-link";
        link.href = config.href || "/changelog/";
        // The marquee repeats itself, so the link carries the sentence once
        // for screen readers and the moving copies are hidden from them.
        link.setAttribute("aria-label", config.text);
        if (/^https?:/i.test(config.href || "")) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }

        var track = document.createElement("span");
        track.className = "dw-ticker-track";
        track.setAttribute("aria-hidden", "true");

        link.appendChild(track);
        bar.appendChild(link);
        document.body.insertBefore(bar, document.body.firstChild);

        fill(track, config.text);
        slowOnHover(bar, track);

        var pending;
        window.addEventListener("resize", function () {
            clearTimeout(pending);
            pending = setTimeout(function () {
                fill(track, config.text);
            }, 150);
        });

        // A web font landing after this runs changes the measured width, so
        // re-measure once it has.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () {
                fill(track, config.text);
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", build);
    } else {
        build();
    }
})(window);
