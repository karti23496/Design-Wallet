/**
 * charts.js — chart primitives for the salary dashboard.
 *
 * Hand-built bars, a step line, a histogram and a heatmap. No charting library:
 * every form here is a rectangle or a polyline, and a library would be pure
 * payload on a site whose DECISIONS §7 says framework choice is not a
 * performance strategy.
 *
 * Colour is monochrome and sequential — every chart on this page does the same
 * job (compare magnitude, low to high), which takes one hue at rising lightness
 * rather than identity colours. Selection is shown by EMPHASIS: the selected
 * mark at --sal-ramp-5, everything else receding to --sal-ramp-2. All steps come
 * from tokens in salary.css; nothing here writes a colour.
 *
 * Split from salary.js deliberately — eight chart forms plus a filter state
 * machine in one file is how script.js reached 70 KB.
 */

var DWCharts = (function () {
    "use strict";

    var SVG_NS = "http://www.w3.org/2000/svg";

    // ── tooltip ─────────────────────────────────────────────────────────────
    // One shared element for the whole page. Follows the pointer, clamps to the
    // viewport so it never causes a horizontal scrollbar.

    var tooltipEl = null;

    function ensureTooltip() {
        if (tooltipEl) return tooltipEl;
        tooltipEl = document.createElement("div");
        tooltipEl.className = "sal-tooltip";
        tooltipEl.setAttribute("role", "status");
        tooltipEl.hidden = true;
        document.body.appendChild(tooltipEl);
        return tooltipEl;
    }

    function showTooltip(html, event) {
        var el = ensureTooltip();
        el.innerHTML = html;
        el.hidden = false;

        var pad = 12;
        var rect = el.getBoundingClientRect();
        var x = event.clientX + pad;
        var y = event.clientY + pad;

        if (x + rect.width > window.innerWidth - pad) {
            x = event.clientX - rect.width - pad;
        }
        if (y + rect.height > window.innerHeight - pad) {
            y = event.clientY - rect.height - pad;
        }

        el.style.transform = "translate(" + Math.max(pad, x) + "px," + Math.max(pad, y) + "px)";
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.hidden = true;
    }

    /** Wire hover + keyboard focus on a mark. Focus reuses the mark's own box so
        keyboard users get the same tooltip without a pointer event. */
    function bindTip(node, html) {
        node.addEventListener("mousemove", function (event) {
            showTooltip(html, event);
        });
        node.addEventListener("mouseleave", hideTooltip);
        node.addEventListener("focus", function () {
            var box = node.getBoundingClientRect();
            showTooltip(html, { clientX: box.left + box.width / 2, clientY: box.top });
        });
        node.addEventListener("blur", hideTooltip);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    function el(tag, className, parent) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (parent) parent.appendChild(node);
        return node;
    }

    function svgEl(tag, attrs) {
        var node = document.createElementNS(SVG_NS, tag);
        for (var key in attrs) {
            if (Object.prototype.hasOwnProperty.call(attrs, key)) {
                node.setAttribute(key, attrs[key]);
            }
        }
        return node;
    }

    function clear(container) {
        while (container.firstChild) container.removeChild(container.firstChild);
    }

    /** ₹12.5 L — the unit Indian designers actually quote. */
    function lpa(value) {
        if (value === null || value === undefined) return "—";
        var rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
        return "₹" + rounded + " L";
    }

    // ── range bar ───────────────────────────────────────────────────────────
    // P25 → P75 as a filled span with the median marked. The headline figure.

    function rangeBar(container, options) {
        clear(container);

        var min = options.min;
        var max = options.max;
        var span = max - min || 1;
        var pct = function (value) {
            return ((value - min) / span) * 100;
        };

        var track = el("div", "sal-range-track", container);
        var fill = el("div", "sal-range-fill", track);
        fill.style.left = pct(options.p25) + "%";
        fill.style.width = Math.max(2, pct(options.p75) - pct(options.p25)) + "%";

        var median = el("div", "sal-range-median", track);
        median.style.left = pct(options.p50) + "%";

        bindTip(
            track,
            "<strong>" + lpa(options.p50) + "</strong> median<br>" +
            lpa(options.p25) + " – " + lpa(options.p75) + " middle 50%"
        );

        var scale = el("div", "sal-range-scale", container);
        el("span", null, scale).textContent = lpa(options.p25);
        el("span", "sal-range-scale-mid", scale).textContent = lpa(options.p50);
        el("span", null, scale).textContent = lpa(options.p75);

        track.setAttribute("role", "img");
        track.setAttribute(
            "aria-label",
            "Median " + lpa(options.p50) + ", middle 50% from " +
            lpa(options.p25) + " to " + lpa(options.p75)
        );
    }

    // ── horizontal bars ─────────────────────────────────────────────────────
    // items: [{ id, label, value, sub }]. The item whose id matches
    // options.selected renders emphasised; the rest recede.

    function barChart(container, options) {
        clear(container);

        var items = options.items.filter(function (item) {
            return item.value !== null && item.value !== undefined;
        });
        if (!items.length) return;

        var max = Math.max.apply(
            null,
            items.map(function (item) {
                return item.value;
            })
        );

        var list = el("ul", "sal-bars", container);
        list.setAttribute("role", "list");

        items.forEach(function (item) {
            var row = el("li", "sal-bar-row", list);
            if (item.id === options.selected) row.classList.add("is-selected");

            el("span", "sal-bar-label", row).textContent = item.label;

            var track = el("span", "sal-bar-track", row);
            var fill = el("span", "sal-bar-fill", track);
            fill.style.width = Math.max(1.5, (item.value / max) * 100) + "%";

            el("span", "sal-bar-value", row).textContent = lpa(item.value);

            row.tabIndex = 0;
            bindTip(
                row,
                "<strong>" + item.label + "</strong><br>" +
                lpa(item.value) + " median" +
                (item.sub ? "<br>" + item.sub : "")
            );
        });
    }

    // ── step chart ──────────────────────────────────────────────────────────
    // The experience ladder. Points are ordered levels; nulls break the line
    // rather than interpolating across a level that does not exist.

    function stepChart(container, options) {
        clear(container);

        var points = options.points;
        var defined = points.filter(function (point) {
            return point.value !== null && point.value !== undefined;
        });
        if (defined.length < 2) return;

        var width = 100;
        var height = 42;
        var padY = 5;
        // Inset horizontally, or the first and last markers are sliced in half
        // by the container edge — they sit at x=0 and x=100% otherwise.
        var padX = 4;

        var max = Math.max.apply(
            null,
            defined.map(function (point) {
                return point.value;
            })
        );
        var min = 0;

        var x = function (index) {
            return padX + (index / (points.length - 1)) * (width - padX * 2);
        };
        var y = function (value) {
            return height - padY - ((value - min) / (max - min || 1)) * (height - padY * 2);
        };

        var svg = svgEl("svg", {
            viewBox: "0 0 " + width + " " + height,
            preserveAspectRatio: "none",
            class: "sal-step-svg",
            "aria-hidden": "true"
        });

        var path = "";
        points.forEach(function (point, index) {
            if (point.value === null || point.value === undefined) return;
            path += (path ? " L" : "M") + x(index) + " " + y(point.value);
        });
        svg.appendChild(
            svgEl("path", { d: path, class: "sal-step-line", "vector-effect": "non-scaling-stroke" })
        );

        container.appendChild(svg);

        // Markers and labels sit in an HTML overlay rather than in the SVG, so
        // text never inherits the non-uniform scale from preserveAspectRatio.
        var overlay = el("div", "sal-step-overlay", container);

        points.forEach(function (point, index) {
            if (point.value === null || point.value === undefined) return;

            var node = el("button", "sal-step-node", overlay);
            node.type = "button";
            node.style.left = x(index) + "%";
            node.style.top = (y(point.value) / height) * 100 + "%";
            if (point.id === options.selected) node.classList.add("is-selected");

            var jump = "";
            if (index > 0) {
                var previous = points[index - 1];
                if (previous.value) {
                    var delta = Math.round(((point.value - previous.value) / previous.value) * 100);
                    if (delta > 0) jump = "<br>+" + delta + "% from " + previous.label;
                }
            }

            node.setAttribute("aria-label", point.label + ": " + lpa(point.value) + " median");
            bindTip(
                node,
                "<strong>" + point.label + "</strong><br>" + lpa(point.value) + " median" + jump
            );

            if (point.onSelect) {
                node.addEventListener("click", point.onSelect);
            }
        });

        // Ticks are positioned on the same x as the markers rather than being
        // spread with flex — an equal-width flex slice centres each label in its
        // own eighth, which drifts away from the inset marker positions.
        var axis = el("div", "sal-step-axis", container);
        points.forEach(function (point, index) {
            var tick = el("span", "sal-step-tick", axis);
            tick.textContent = point.short || point.label;
            tick.style.left = x(index) + "%";
            if (point.id === options.selected) tick.classList.add("is-selected");
        });
    }

    // ── histogram ───────────────────────────────────────────────────────────
    // Normalized density, not counts. The build only produces real counts once
    // there are enough reports, so the axis is labelled "where people land" and
    // no number is ever printed against a bin.

    function histogram(container, options) {
        clear(container);

        var bins = options.bins;
        if (!bins || !bins.length) return;

        var span = options.max - options.min || 1;
        var wrap = el("div", "sal-hist", container);
        wrap.setAttribute("role", "img");
        wrap.setAttribute(
            "aria-label",
            "Distribution of salaries from " + lpa(options.min) + " to " + lpa(options.max)
        );

        bins.forEach(function (value, index) {
            var binMin = options.min + (span / bins.length) * index;
            var binMax = binMin + span / bins.length;

            var column = el("span", "sal-hist-bin", wrap);
            column.style.height = Math.max(2, value * 100) + "%";

            var inRange = options.p25 !== undefined && binMax >= options.p25 && binMin <= options.p75;
            if (inRange) column.classList.add("is-mid");

            bindTip(column, lpa(binMin) + " – " + lpa(binMax));
        });

        var scale = el("div", "sal-hist-scale", container);
        el("span", null, scale).textContent = lpa(options.min);
        el("span", null, scale).textContent = lpa(options.max);
    }

    // ── heatmap ─────────────────────────────────────────────────────────────
    // Role × level. The browse-everything view: five sequential steps, so a
    // reader can find the bright corner without reading a single number.

    function heatmap(container, options) {
        clear(container);

        var values = [];
        options.rows.forEach(function (row) {
            options.cols.forEach(function (col) {
                var value = options.valueAt(row.id, col.id);
                if (value !== null && value !== undefined) values.push(value);
            });
        });
        if (!values.length) return;

        var max = Math.max.apply(null, values);

        var grid = el("div", "sal-heat", container);
        grid.style.gridTemplateColumns = "var(--sal-heat-label) repeat(" + options.cols.length + ", 1fr)";

        el("span", "sal-heat-corner", grid);
        options.cols.forEach(function (col) {
            el("span", "sal-heat-colhead", grid).textContent = col.short || col.label;
        });

        options.rows.forEach(function (row) {
            var head = el("span", "sal-heat-rowhead", grid);
            head.textContent = row.short || row.label;
            if (row.id === options.selectedRow) head.classList.add("is-selected");

            options.cols.forEach(function (col) {
                var value = options.valueAt(row.id, col.id);
                var cell = el("button", "sal-heat-cell", grid);
                cell.type = "button";

                if (value === null || value === undefined) {
                    cell.classList.add("is-empty");
                    cell.disabled = true;
                    cell.setAttribute("aria-label", row.label + ", " + col.label + ": no data");
                    return;
                }

                // Five discrete steps rather than a continuous alpha: banding
                // makes the ladder readable, and each step is a validated token.
                var step = Math.min(5, Math.max(1, Math.ceil((value / max) * 5)));
                cell.classList.add("sal-heat-s" + step);

                if (row.id === options.selectedRow && col.id === options.selectedCol) {
                    cell.classList.add("is-selected");
                }

                // Bare Math.round prints "0" for an intern stipend of 0.45 L —
                // a salary of zero. Anything under 10 L keeps a decimal.
                cell.textContent = value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value));
                cell.setAttribute("aria-label", row.label + ", " + col.label + ": " + lpa(value));
                bindTip(
                    cell,
                    "<strong>" + row.label + "</strong><br>" + col.label + "<br>" + lpa(value) + " median"
                );

                if (options.onSelect) {
                    cell.addEventListener("click", function () {
                        options.onSelect(row.id, col.id);
                    });
                }
            });
        });
    }

    // ── meter ───────────────────────────────────────────────────────────────
    // A single ratio against a limit — same-ramp track, never a two-slice pie.

    function meter(container, options) {
        clear(container);
        var track = el("div", "sal-meter", container);
        var fill = el("div", "sal-meter-fill", track);
        fill.style.width = Math.round(options.value * 100) + "%";
        track.setAttribute("role", "img");
        track.setAttribute("aria-label", options.label + ": " + Math.round(options.value * 100) + "%");
        bindTip(track, options.label + "<br><strong>" + Math.round(options.value * 100) + "%</strong>");
    }

    return {
        lpa: lpa,
        rangeBar: rangeBar,
        barChart: barChart,
        stepChart: stepChart,
        histogram: histogram,
        heatmap: heatmap,
        meter: meter,
        hideTooltip: hideTooltip
    };
})();
