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

    // ── motion ──────────────────────────────────────────────────────────────
    // Every chart rebuilds its DOM on each render, which leaves CSS transitions
    // nothing to start from. So a chart records the geometry it drew, keyed by
    // mark; the next render places each new mark at its old geometry, flushes
    // styles, then sets the real value — and the transition in salary.css runs
    // from old to new. Durations match --sal-motion there.

    var DURATION = 520;
    var reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    function motionOff() {
        return !!(reducedMotion && reducedMotion.matches);
    }

    /** Ease-out cubic, the JS twin of --sal-ease. */
    function ease(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /** rAF tween owned by a node, so a newer render cancels an older one. */
    function tween(owner, step) {
        cancelTweens(owner);
        var started = null;
        var entry = { frame: 0 };
        var run = function (now) {
            if (started === null) started = now;
            var t = Math.min(1, (now - started) / DURATION);
            step(ease(t));
            if (t < 1) entry.frame = window.requestAnimationFrame(run);
        };
        entry.frame = window.requestAnimationFrame(run);
        owner.__dwTweens = [entry];
    }

    function cancelTweens(owner) {
        (owner.__dwTweens || []).forEach(function (entry) {
            window.cancelAnimationFrame(entry.frame);
        });
        owner.__dwTweens = [];
    }

    function lerp(from, to, t) {
        return from + (to - from) * t;
    }

    /**
     * Numbers that count from their last value to the new one. `values` is an
     * array so a range ("₹22 – ₹34") moves both ends together. Values are INR
     * lakh; a currency switch changes only the format, so it doesn't count.
     */
    function countTo(node, values, format) {
        var from = node.__dwShown;
        var same = from && from.length === values.length && from.every(function (value, index) {
            return value === values[index];
        });

        if (motionOff() || !from || from.length !== values.length || same) {
            cancelTweens(node);
            node.__dwShown = values.slice();
            node.textContent = format(values);
            return;
        }

        tween(node, function (t) {
            var current = values.map(function (value, index) {
                return lerp(from[index], value, t);
            });
            node.__dwShown = current;
            node.textContent = format(current);
        });
    }

    function Morph(container) {
        this.container = container;
        this.prev = container.__dwMorph || null;
        this.next = {};
        this.queue = [];
    }

    /** A numeric style (width, left, height, top). `initial` is where a mark
        with no history starts; leave it undefined to place it without motion. */
    Morph.prototype.style = function (node, key, prop, target, unit, initial) {
        var id = key + "|" + prop;
        this.next[id] = target;
        var start = this.prev && Object.prototype.hasOwnProperty.call(this.prev, id) ? this.prev[id] : initial;

        if (motionOff() || start === undefined || start === target) {
            node.style[prop] = target + unit;
            return;
        }
        node.style[prop] = start + unit;
        this.queue.push(function () {
            node.style[prop] = target + unit;
        });
    };

    /** A class that should cross-fade (a heatmap step, a selection). */
    Morph.prototype.cls = function (node, key, target) {
        var id = key + "|class";
        this.next[id] = target;
        var start = this.prev && Object.prototype.hasOwnProperty.call(this.prev, id) ? this.prev[id] : target;

        if (motionOff() || start === target) {
            if (target) node.classList.add(target);
            return;
        }
        if (start) node.classList.add(start);
        this.queue.push(function () {
            if (start) node.classList.remove(start);
            if (target) node.classList.add(target);
        });
    };

    Morph.prototype.run = function () {
        this.container.__dwMorph = this.next;
        if (!this.queue.length) return;
        // Reading layout commits the start values, so the targets transition.
        void this.container.offsetWidth;
        this.queue.forEach(function (apply) {
            apply();
        });
    };

    /** FLIP for rows a re-sort moves: note where each keyed row sat before the
        rebuild, then slide it from there to its new slot. */
    function rowPositions(container) {
        var positions = {};
        Array.prototype.forEach.call(container.querySelectorAll("[data-key]"), function (node) {
            positions[node.getAttribute("data-key")] = node.offsetTop;
        });
        return positions;
    }

    function slideRows(container, before, morph) {
        if (motionOff()) return;
        Array.prototype.forEach.call(container.querySelectorAll("[data-key]"), function (node) {
            var old = before[node.getAttribute("data-key")];
            if (old === undefined) return;
            var delta = old - node.offsetTop;
            if (!delta) return;
            node.style.transition = "none";
            node.style.transform = "translateY(" + delta + "px)";
            morph.queue.push(function () {
                node.style.transition = "";
                node.style.transform = "";
            });
        });
    }

    // Every value on the page is INR lakh. The INR/USD toggle only changes how
    // it is printed, so this is the one place a conversion happens.
    var currency = { code: "inr", usdInr: 1 };

    function setCurrency(code, usdInr) {
        currency.code = code === "usd" ? "usd" : "inr";
        if (usdInr) currency.usdInr = usdInr;
    }

    /** Value in the active currency, in thousands of dollars for USD. */
    function toUsdThousands(value) {
        return (value * 100000) / currency.usdInr / 1000;
    }

    /** ₹12.5 LPA — the unit Indian designers actually quote — or $158K. */
    function lpa(value) {
        if (value === null || value === undefined) return "—";
        if (currency.code === "usd") {
            var thousands = toUsdThousands(value);
            // "LPA" already says per annum; a bare dollar figure doesn't, so
            // USD carries the period explicitly. INR stays "₹12.5 LPA".
            var usd;
            if (thousands >= 1000) usd = "$" + Math.round(thousands / 100) / 10 + "M";
            else if (thousands < 1) usd = "$" + Math.round(thousands * 1000);
            else usd = "$" + (thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10) + "K";
            return usd + "/year";
        }
        var rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
        return "₹" + rounded + " LPA";
    }

    /** The bare number a heatmap cell prints: lakh, or $ thousands. */
    function compact(value) {
        var shown = currency.code === "usd" ? toUsdThousands(value) : value;
        // Bare Math.round prints "0" for an intern stipend of 0.45 L —
        // a salary of zero. Anything under 10 keeps a decimal.
        return shown < 10 ? String(Math.round(shown * 10) / 10) : String(Math.round(shown));
    }

    // ── range bar ───────────────────────────────────────────────────────────
    // P25 → P75 as a filled span with the median marked. The headline figure.

    function rangeBar(container, options) {
        clear(container);
        var morph = new Morph(container);

        var min = options.min;
        var max = options.max;
        var span = max - min || 1;
        var pct = function (value) {
            return ((value - min) / span) * 100;
        };

        var track = el("div", "sal-range-track", container);
        var fill = el("div", "sal-range-fill", track);
        var fillWidth = Math.max(2, pct(options.p75) - pct(options.p25));
        // First draw opens the band out from the median.
        morph.style(fill, "fill", "left", pct(options.p25), "%", pct(options.p50));
        morph.style(fill, "fill", "width", fillWidth, "%", 0);

        var median = el("div", "sal-range-median", track);
        morph.style(median, "median", "left", pct(options.p50), "%");

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

        morph.run();
    }

    // ── horizontal bars ─────────────────────────────────────────────────────
    // items: [{ id, label, value, sub }]. The item whose id matches
    // options.selected renders emphasised; the rest recede.

    function barChart(container, options) {
        var before = rowPositions(container);
        clear(container);
        var morph = new Morph(container);

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
            row.setAttribute("data-key", item.id);
            morph.cls(row, item.id, item.id === options.selected ? "is-selected" : "");

            el("span", "sal-bar-label", row).textContent = item.label;

            var track = el("span", "sal-bar-track", row);
            var fill = el("span", "sal-bar-fill", track);
            morph.style(fill, item.id, "width", Math.max(1.5, (item.value / max) * 100), "%", 0);

            el("span", "sal-bar-value", row).textContent = lpa(item.value);

            row.tabIndex = 0;
            bindTip(
                row,
                "<strong>" + item.label + "</strong><br>" +
                lpa(item.value) + " median" +
                (item.sub ? "<br>" + item.sub : "")
            );
        });

        slideRows(container, before, morph);
        morph.run();
    }

    // ── step chart ──────────────────────────────────────────────────────────
    // The experience ladder. Points are ordered levels; nulls break the line
    // rather than interpolating across a level that does not exist.

    function stepChart(container, options) {
        var previousYs = container.__dwStepYs || null;
        cancelTweens(container);
        clear(container);
        var morph = new Morph(container);

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

        var targetYs = points.map(function (point) {
            return point.value === null || point.value === undefined ? null : y(point.value);
        });
        var pathFor = function (ys) {
            var d = "";
            ys.forEach(function (value, index) {
                if (value === null) return;
                d += (d ? " L" : "M") + x(index) + " " + value;
            });
            return d;
        };

        var line = svgEl("path", { d: pathFor(targetYs), class: "sal-step-line", "vector-effect": "non-scaling-stroke" });
        svg.appendChild(line);
        container.appendChild(svg);
        container.__dwStepYs = targetYs;

        // The line morphs point by point when the ladder has the same shape of
        // gaps as before; the first draw rises from the baseline.
        var startYs = previousYs || targetYs.map(function (value) {
            return value === null ? null : height - padY;
        });
        var sameShape = startYs.length === targetYs.length && startYs.every(function (value, index) {
            return (value === null) === (targetYs[index] === null);
        });
        if (!motionOff() && sameShape) {
            line.setAttribute("d", pathFor(startYs));
            tween(container, function (t) {
                line.setAttribute("d", pathFor(targetYs.map(function (value, index) {
                    return value === null ? null : lerp(startYs[index], value, t);
                })));
            });
        }

        // Markers and labels sit in an HTML overlay rather than in the SVG, so
        // text never inherits the non-uniform scale from preserveAspectRatio.
        var overlay = el("div", "sal-step-overlay", container);

        points.forEach(function (point, index) {
            if (point.value === null || point.value === undefined) return;

            var node = el("button", "sal-step-node", overlay);
            node.type = "button";
            node.style.left = x(index) + "%";
            morph.style(node, point.id, "top", (y(point.value) / height) * 100, "%", ((height - padY) / height) * 100);
            morph.cls(node, point.id, point.id === options.selected ? "is-selected" : "");

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

        morph.run();
    }

    // ── histogram ───────────────────────────────────────────────────────────
    // Normalized density, not counts. The build only produces real counts once
    // there are enough reports, so the axis is labelled "where people land" and
    // no number is ever printed against a bin.

    function histogram(container, options) {
        clear(container);
        var morph = new Morph(container);

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
            morph.style(column, "b" + index, "height", Math.max(2, value * 100), "%", 2);

            var inRange = options.p25 !== undefined && binMax >= options.p25 && binMin <= options.p75;
            morph.cls(column, "b" + index, inRange ? "is-mid" : "");

            bindTip(column, lpa(binMin) + " – " + lpa(binMax));
        });

        var scale = el("div", "sal-hist-scale", container);
        el("span", null, scale).textContent = lpa(options.min);
        el("span", null, scale).textContent = lpa(options.max);

        morph.run();
    }

    // ── heatmap ─────────────────────────────────────────────────────────────
    // Role × level. The browse-everything view: five sequential steps, so a
    // reader can find the bright corner without reading a single number.

    function heatmap(container, options) {
        clear(container);
        var morph = new Morph(container);

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
                morph.cls(cell, row.id + "|" + col.id, "sal-heat-s" + step);

                if (row.id === options.selectedRow && col.id === options.selectedCol) {
                    cell.classList.add("is-selected");
                }

                cell.textContent = compact(value);
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

        morph.run();
    }

    // ── meter ───────────────────────────────────────────────────────────────
    // A single ratio against a limit — same-ramp track, never a two-slice pie.

    function meter(container, options) {
        clear(container);
        var track = el("div", "sal-meter", container);
        var fill = el("div", "sal-meter-fill", track);
        var morph = new Morph(container);
        morph.style(fill, "fill", "width", Math.round(options.value * 100), "%", 0);
        track.setAttribute("role", "img");
        track.setAttribute("aria-label", options.label + ": " + Math.round(options.value * 100) + "%");
        bindTip(track, options.label + "<br><strong>" + Math.round(options.value * 100) + "%</strong>");
        morph.run();
    }

    return {
        lpa: lpa,
        setCurrency: setCurrency,
        countTo: countTo,
        attachTip: bindTip,
        rangeBar: rangeBar,
        barChart: barChart,
        stepChart: stepChart,
        histogram: histogram,
        heatmap: heatmap,
        meter: meter,
        hideTooltip: hideTooltip
    };
})();
