/* Hero headline tiles — Figma 857:4471.

   Each [data-hero-mark] slot holds a set of .dash-hero-tile squares stacked in
   the same place. Every beat one of them becomes .is-active, in a shuffled
   order: the whole set plays once before it is reshuffled, and a new round
   never opens on the tile just shown. The two slots change half a beat apart
   so the headline never jumps twice at once.

   The first tile is active in the markup, so with no JS (or reduced motion)
   the headline is the design's still frame. */

(function () {
    "use strict";

    var BEAT = 2400;   // ms each tile stays up

    function shuffle(list) {
        for (var i = list.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = list[i]; list[i] = list[j]; list[j] = t;
        }
        return list;
    }

    function start(slot, delay) {
        var tiles = Array.prototype.slice.call(slot.querySelectorAll(".dash-hero-tile"));
        if (tiles.length < 2) return;

        var current = tiles.filter(function (t) { return t.classList.contains("is-active"); })[0] || tiles[0];
        var queue = [];

        function next() {
            if (!queue.length) {
                queue = shuffle(tiles.slice());
                if (queue[0] === current) queue.push(queue.shift());   // never repeat back-to-back
            }
            var tile = queue.shift();
            current.classList.remove("is-active");
            tile.classList.add("is-active");
            current = tile;
        }

        setTimeout(function () {
            next();
            setInterval(next, BEAT);
        }, delay);
    }

    function init() {
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        var slots = document.querySelectorAll("[data-hero-mark]");
        for (var i = 0; i < slots.length; i++) {
            start(slots[i], BEAT + i * BEAT / 2);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
