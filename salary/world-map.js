/**
 * world-map.js — the dotted maps on /salary/: the world (foreign employer) and
 * India (everything else).
 *
 * Draws a dot-map JSON in the shared shape written by scripts/build-world-map.js
 * and scripts/build-india-map.js:
 *
 *   { w, h, cell, dot, groups: [{ id, name }], dots: [x, y, groupIndex, ...] }
 *
 * x and y are in viewBox units, `cell` is the dot spacing, `dot` the drawn
 * diameter. A "group" is a country (world) or a state (India). Every group is
 * one <g> holding two paths, so pointing at one lights all of its dots:
 *
 *   hit    the same cells as solid squares, transparent. The gaps between dots
 *          belong to no dot, so without this the tooltip would flicker off every
 *          time the pointer crossed one. A group of only a few dots that HAS
 *          figures gets a wider hit area so it can be found (see update()).
 *   dots   the visible round dots.
 *
 * This file knows nothing about salaries. salary.js tells it which groups have
 * figures (update) and what to say about one on hover (options.tip).
 *
 *   DWWorldMap.mount(container, {
 *       url,                         the dot-map JSON
 *       title,                       the SVG's accessible name
 *       tip(id, name) -> html|null,  hover text; null hides the tooltip
 *       label(id, name) -> text      aria-label for a focusable group
 *   }) -> Promise<{ data, update({ kinds: { id: "primary" | "secondary" }, selected: id|null }) }>
 *
 * "primary" groups are keyboard-focusable; "secondary" ones are hover-only (a
 * hundred and forty tab stops would be worse than none).
 */

var DWWorldMap = (function () {
    "use strict";

    var SVG_NS = "http://www.w3.org/2000/svg";
    var SMALL_GROUP = 3;     // at most this many dots (and with figures): give it a bigger hit area
    var SMALL_HIT = 2.6;     // ...this many cells across

    var requests = {};

    function load(url) {
        if (!requests[url]) {
            requests[url] = fetch(url).then(function (response) {
                if (!response.ok) throw new Error("map data " + response.status);
                return response.json();
            });
        }
        return requests[url];
    }

    function svgEl(tag, attrs) {
        var node = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
        return node;
    }

    // "M x y h.01" is a zero-length segment: a round cap paints it as a dot,
    // a square cap as a square cell.
    function cellsPath(cells) {
        return cells.map(function (cell) {
            return "M" + cell[0] + " " + cell[1] + "h.01";
        }).join("");
    }

    function mount(container, options) {
        return load(options.url).then(function (map) {
            var perGroup = map.groups.map(function () { return []; });
            for (var i = 0; i < map.dots.length; i += 3) {
                perGroup[map.dots[i + 2]].push([map.dots[i], map.dots[i + 1]]);
            }

            var svg = svgEl("svg", {
                "class": "sal-map-svg",
                viewBox: "0 0 " + map.w + " " + map.h,
                role: "group",
                "aria-label": options.title
            });
            var groups = [];

            map.groups.forEach(function (group, index) {
                var cells = perGroup[index];
                if (!cells.length) return;
                var node = svgEl("g", { "class": "sal-map-country", "data-country": group.id, "data-name": group.name });
                node.appendChild(svgEl("path", {
                    "class": "sal-map-hit", d: cellsPath(cells), "stroke-width": map.cell
                }));
                node.appendChild(svgEl("path", {
                    "class": "sal-map-dots", d: cellsPath(cells), "stroke-width": map.dot
                }));
                node.small = cells.length <= SMALL_GROUP;
                svg.appendChild(node);
                groups.push(node);
            });

            function groupOf(target) {
                return target && target.closest ? target.closest(".sal-map-country") : null;
            }

            function describe(node, event) {
                var html = options.tip(node.getAttribute("data-country"), node.getAttribute("data-name"));
                if (html) DWCharts.showTip(html, event); else DWCharts.hideTooltip();
            }

            svg.addEventListener("pointermove", function (event) {
                var node = groupOf(event.target);
                if (node) describe(node, event); else DWCharts.hideTooltip();
            });
            svg.addEventListener("pointerleave", DWCharts.hideTooltip);

            // Keyboard: the same tooltip, placed over the focused group.
            svg.addEventListener("focusin", function (event) {
                var node = groupOf(event.target);
                if (!node) return;
                var box = node.getBoundingClientRect();
                describe(node, { clientX: box.left + box.width / 2, clientY: box.top });
            });
            svg.addEventListener("focusout", DWCharts.hideTooltip);

            container.textContent = "";
            container.appendChild(svg);

            return {
                data: map,
                update: function (state) {
                    groups.forEach(function (node) {
                        var id = node.getAttribute("data-country");
                        var kind = state.kinds[id] || null;
                        node.classList.toggle("is-primary", kind === "primary");
                        node.classList.toggle("is-secondary", kind === "secondary");
                        node.classList.toggle("is-selected", id === state.selected);

                        // A group of a few dots is hard to point at, so one WITH figures gets a
                        // wider hit area, stacked beneath every other group: the margin only ever
                        // covers empty space, never a neighbour's own dots. (Giving it to every small
                        // group made Latvia, Estonia and Lithuania take each other's dots.)
                        var halo = node.small && kind === "primary";
                        node.querySelector(".sal-map-hit").setAttribute("stroke-width", halo ? map.cell * SMALL_HIT : map.cell);
                        if (halo) svg.insertBefore(node, svg.firstChild);
                        if (kind === "primary") {
                            node.setAttribute("tabindex", "0");
                            node.setAttribute("role", "img");
                            node.setAttribute("aria-label", options.label(id, node.getAttribute("data-name")));
                        } else {
                            node.removeAttribute("tabindex");
                            node.removeAttribute("role");
                            node.removeAttribute("aria-label");
                        }
                    });
                }
            };
        });
    }

    return { mount: mount };
})();
