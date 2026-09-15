/**
 * report.js — the five-page salary report, drawn with DWPdf.
 *
 * Presentation only. Every figure arrives in the model that salary.js builds
 * from the same read functions the dashboard renders from, so a number in the
 * download can never disagree with the number on screen.
 *
 * TYPE. Inter throughout, in two embedded faces: Regular for body copy and
 * Light for titles and the big figures — Karthik's call, 2026-09-13. Nothing is
 * bold, so **emphasis is carried by colour**: a selected bar, row or marker
 * goes full white while the rest recede, which is the same rule the on-screen
 * charts use (DECISIONS §12). Body copy is 11pt, up from the 9.5pt first draft.
 *
 * The pages are Design Wallet black. Charts stay monochrome: magnitude by bar
 * length, selection by emphasis, never by hue.
 */

var DWReport = (function () {
    "use strict";

    var PAGE = { width: 842, height: 595, margin: 52 };
    var TOTAL_PAGES = 5;

    // The site's dark tokens, as print-safe values. --muted (#686868) is below
    // AA even on screen, so body and caption greys are lifted here rather than
    // copied across; everything else mirrors style.css.
    var BG = [0.039, 0.039, 0.039];      // --bg  #0a0a0a
    var INK = [0.96, 0.96, 0.96];        // --text #f5f5f5
    var BODY = [0.78, 0.78, 0.78];
    var MUTED = [0.58, 0.58, 0.58];
    var FAINT = [0.50, 0.50, 0.50];
    var RULE = [0.16, 0.16, 0.16];
    var PANEL = [0.078, 0.078, 0.078];   // --panel #141414
    var TRACK = [0.13, 0.13, 0.13];
    var BAR = [0.32, 0.32, 0.32];
    var BAR_ON = [1, 1, 1];              // selection is full white, as on screen

    // One place for the type scale, so the whole report moves together.
    var TYPE = {
        eyebrow: 8.5,
        footer: 8,
        body: 11,
        lead: 11.5,
        caption: 9,
        row: 9.5,
        pageTitle: 19,
        coverTitle: 34,
        hero: 42,
        tile: 18,
        feature: 24
    };

    /** Same as DWCharts.lpa. The embedded Inter carries the rupee glyph; on the
        Helvetica fallback pdf-writer degrades "₹" to "INR" on its own. */
    function money(value) {
        // Follow the page's INR/USD toggle, so the download matches the screen.
        if (typeof DWCharts !== "undefined") return DWCharts.lpa(value);
        if (value === null || value === undefined) return "—";
        var rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
        return "₹" + rounded + " LPA";
    }

    function plain(value) {
        if (value === null || value === undefined) return "—";
        return String(value >= 100 ? Math.round(value) : Math.round(value * 10) / 10);
    }

    function formatDate(value) {
        var date = value ? new Date(value) : new Date();
        if (isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    }

    // ── page furniture ──────────────────────────────────────────────────────

    function frame(page, model, title, index) {
        var left = PAGE.margin;
        var right = PAGE.width - PAGE.margin;

        // Painted first, so every later mark sits on the black ground.
        page.rect(0, 0, PAGE.width, PAGE.height, BG);

        // The real mark when it loaded, the wordmark set in type when it did not.
        if (model.logo && model.logo.paths.length) {
            var logoHeight = 17;
            var scale = logoHeight / model.logo.viewBox[3];
            model.logo.paths.forEach(function (data) {
                page.path(data, { x: left, y: 33, scale: scale, color: INK });
            });
        } else {
            page.text("DESIGN WALLET", left, 46, { size: TYPE.footer, color: INK, charSpace: 1.4 });
        }
        page.text("Know your money", right, 46, { size: TYPE.footer, color: FAINT, align: "right" });
        page.line(left, 58, right, 58, RULE, 0.7);

        if (title) {
            page.text(title, left, 96, { size: TYPE.pageTitle, display: true, color: INK });
        }

        page.line(left, PAGE.height - 52, right, PAGE.height - 52, RULE, 0.7);
        page.text(
            (model.usd ? "Annual pay in US dollars, converted from ₹ lakh." : "Annual fixed CTC in ₹ lakh per annum.") +
                " Variable pay and equity are reported separately.",
            left, PAGE.height - 34, { size: TYPE.footer, color: FAINT }
        );
        page.text(
            "designwallet.in/salary  ·  " + index + " of " + TOTAL_PAGES,
            right, PAGE.height - 34, { size: TYPE.footer, color: FAINT, align: "right" }
        );
    }

    function eyebrow(page, text, x, y) {
        page.text(text.toUpperCase(), x, y, { size: TYPE.eyebrow, color: MUTED, charSpace: 1.2 });
    }

    // ── chart primitives ────────────────────────────────────────────────────

    /**
     * Horizontal bars: label column, track, value column. The selected row is
     * drawn in full white while the rest recede — emphasis by colour, since no
     * face here is bolder than another.
     */
    function barList(page, options) {
        var items = options.items.filter(function (item) {
            return item.value !== null && item.value !== undefined;
        });
        if (!items.length) return options.y;

        var max = Math.max.apply(null, items.map(function (item) {
            return item.value;
        }));

        var rowHeight = options.rowHeight || 21;
        var labelWidth = options.labelWidth || 110;
        var valueWidth = 80;
        var trackX = options.x + labelWidth + 12;
        var trackWidth = options.width - labelWidth - valueWidth - 24;
        var cursor = options.y;

        items.forEach(function (item) {
            var selected = !!item.selected;
            var barWidth = Math.max(1.5, (item.value / max) * trackWidth);

            page.text(item.label, options.x, cursor + 10, {
                size: TYPE.row, color: selected ? INK : BODY
            });

            page.rect(trackX, cursor + 2, trackWidth, 10, TRACK);
            page.rect(trackX, cursor + 2, barWidth, 10, selected ? BAR_ON : BAR);

            page.text(money(item.value), options.x + options.width, cursor + 10, {
                size: TYPE.row, color: selected ? INK : BODY, align: "right"
            });

            cursor += rowHeight;
        });

        return cursor;
    }

    /** p25–p75 span with the median marked: the headline visual. */
    function rangeBar(page, options) {
        var cell = options.cell;
        var pad = (cell[2] - cell[0]) * 0.35 || 1;
        var min = Math.max(0, cell[0] - pad);
        var max = cell[2] + pad;
        var span = max - min || 1;
        var at = function (value) {
            return options.x + ((value - min) / span) * options.width;
        };

        page.rect(options.x, options.y, options.width, 12, TRACK);
        page.rect(at(cell[0]), options.y, Math.max(2, at(cell[2]) - at(cell[0])), 12, [0.45, 0.45, 0.45]);
        page.rect(at(cell[1]) - 1.5, options.y - 5, 3, 22, BAR_ON);

        page.text(money(cell[0]), options.x, options.y + 34, { size: TYPE.caption, color: MUTED });
        page.text(money(cell[1]), at(cell[1]), options.y + 34, {
            size: TYPE.caption + 1.5, display: true, color: INK, align: "center"
        });
        page.text(money(cell[2]), options.x + options.width, options.y + 34, {
            size: TYPE.caption, color: MUTED, align: "right"
        });

        return options.y + 48;
    }

    /** Normalised density, same shape as the dashboard histogram. */
    function histogram(page, options) {
        var shape = options.shape;
        if (!shape || !shape.bins || !shape.bins.length) return options.y;

        var bins = shape.bins;
        var span = shape.max - shape.min || 1;
        var binWidth = options.width / bins.length;
        var baseline = options.y + options.height;

        bins.forEach(function (value, index) {
            var binMin = shape.min + (span / bins.length) * index;
            var binMax = binMin + span / bins.length;
            var inRange = binMax >= options.p25 && binMin <= options.p75;
            var barHeight = Math.max(1.5, value * options.height);

            page.rect(
                options.x + index * binWidth + 0.6,
                baseline - barHeight,
                binWidth - 1.2,
                barHeight,
                inRange ? [0.82, 0.82, 0.82] : [0.26, 0.26, 0.26]
            );
        });

        page.line(options.x, baseline, options.x + options.width, baseline, RULE, 0.7);
        page.text(money(shape.min), options.x, baseline + 14, { size: TYPE.caption, color: FAINT });
        page.text(money(shape.max), options.x + options.width, baseline + 14, {
            size: TYPE.caption, color: FAINT, align: "right"
        });

        return baseline + 24;
    }

    /** The experience ladder: a line over the levels that exist for this role. */
    function ladder(page, options) {
        var points = options.points.filter(function (point) {
            return point.value !== null && point.value !== undefined;
        });
        if (points.length < 2) return options.y;

        var max = Math.max.apply(null, points.map(function (point) {
            return point.value;
        }));

        var plotHeight = options.height;
        var stepX = options.width / (points.length - 1);
        var at = function (point, index) {
            return [
                options.x + index * stepX,
                options.y + plotHeight - (point.value / max) * (plotHeight - 28)
            ];
        };

        page.polyline(points.map(at), [0.42, 0.42, 0.42], 1.2);

        points.forEach(function (point, index) {
            var position = at(point, index);
            var selected = !!point.selected;

            page.circle(position[0], position[1], selected ? 4.6 : 3, selected ? BAR_ON : [0.48, 0.48, 0.48]);
            page.text(plain(point.value), position[0], position[1] - 12, {
                size: TYPE.caption, display: true, color: selected ? INK : MUTED, align: "center"
            });
            page.text(point.short || point.label, position[0], options.y + plotHeight + 17, {
                size: TYPE.caption, color: selected ? INK : FAINT, align: "center"
            });
        });

        return options.y + plotHeight + 28;
    }

    function statTile(page, x, y, width, label, value, note) {
        page.rect(x, y, width, 72, PANEL);
        eyebrow(page, label, x + 16, y + 21);
        page.text(value, x + 16, y + 47, { size: TYPE.tile, display: true, color: INK });
        if (note) page.text(note, x + 16, y + 62, { size: TYPE.caption - 0.5, color: FAINT });
    }

    // ── pages ───────────────────────────────────────────────────────────────

    function coverPage(doc, model) {
        var page = doc.addPage();
        var left = PAGE.margin;
        var width = PAGE.width - PAGE.margin * 2;

        frame(page, model, null, 1);

        page.text("Designer salary report", left, 150, { size: TYPE.coverTitle, display: true, color: INK });
        page.text(model.summary, left, 182, { size: 13.5, color: BODY });

        page.line(left, 208, left + width, 208, RULE, 0.7);

        eyebrow(page, "Median annual fixed CTC", left, 236);
        page.text(money(model.cell[1]), left, 288, { size: TYPE.hero, display: true, color: INK });
        page.text(
            "Middle 50% of this group earns " + money(model.cell[0]) + " to " + money(model.cell[2]) + ".",
            left, 314, { size: TYPE.lead, color: BODY }
        );

        var tileWidth = (width - 24) / 3;
        statTile(page, left, 336, tileWidth, "Middle 50% range",
            model.usd ? money(model.cell[0]) + " – " + money(model.cell[2]) : plain(model.cell[0]) + " – " + plain(model.cell[2]),
            model.usd ? "In US dollars per year" : "In ₹ lakh per annum");
        statTile(page, left + tileWidth + 12, 336, tileWidth, "Junior to senior growth",
            model.growth || "—", "Across this discipline");
        statTile(page, left + (tileWidth + 12) * 2, 336, tileWidth, "Highest-paying city",
            model.topCity ? model.topCity.label : "—",
            model.topCity ? money(model.topCity.value) + " median" : "");

        eyebrow(page, "What this report covers", left, 438);
        var cursor = page.paragraph(
            "Five pages: where this figure sits in the spread, how it varies by city, how it grows with " +
            "experience, and how work arrangement and company type move it. Every chart reflects the " +
            "filters selected when the report was generated.",
            left, 458, width * 0.64, { size: TYPE.body, color: BODY }
        );

        if (model.filters.length) {
            cursor = page.paragraph(
                "Filters applied: " + model.filters.map(function (pair) {
                    return pair[0] + " — " + pair[1];
                }).join("  ·  "),
                left, cursor + 2, width * 0.64, { size: TYPE.caption + 0.5, color: MUTED }
            );
        }

        page.text(
            "Prepared " + formatDate(model.downloadedAt) + "  ·  Data updated " + formatDate(model.generatedAt),
            left, cursor + 6, { size: TYPE.caption, color: FAINT }
        );

        return page;
    }

    function spreadPage(doc, model) {
        var page = doc.addPage();
        var left = PAGE.margin;
        var width = PAGE.width - PAGE.margin * 2;
        var colWidth = (width - 44) / 2;

        frame(page, model, "Where the number sits", 2);
        page.text(
            "A median on its own hides the spread. This is the band most of this group lands in.",
            left, 120, { size: TYPE.body, color: MUTED }
        );

        eyebrow(page, "The middle 50%", left, 158);
        var cursor = rangeBar(page, { x: left, y: 182, width: colWidth, cell: model.cell });

        page.paragraph(
            "Half of designers in this group earn inside this band. A quarter earn less than " +
            money(model.cell[0]) + ", and a quarter earn more than " + money(model.cell[2]) + ". " +
            "It is a fairer guide than an average, which a handful of very large salaries can drag upwards.",
            left, cursor + 16, colWidth, { size: TYPE.body, color: BODY }
        );

        var rightX = left + colWidth + 44;
        eyebrow(page, "Where people land", rightX, 158);

        if (model.distribution) {
            var after = histogram(page, {
                x: rightX, y: 178, width: colWidth, height: 100,
                shape: model.distribution, p25: model.cell[0], p75: model.cell[2]
            });
            page.paragraph(
                "The shaded columns are the middle 50%. The long tail to the right is real: a small number of " +
                "designers earn far above the median, which is exactly why the median is quoted here rather than " +
                "the mean.",
                rightX, after + 14, colWidth, { size: TYPE.body, color: BODY }
            );
        } else {
            page.text("No distribution shape for this combination.", rightX, 186, { size: TYPE.body, color: MUTED });
        }

        if (model.extras) {
            eyebrow(page, "Beyond fixed pay", left, 396);
            var tileWidth = (width - 24) / 3;
            statTile(page, left, 414, tileWidth, "Report variable pay",
                model.extras.variableShare + "%", model.extras.variableNote);
            statTile(page, left + tileWidth + 12, 414, tileWidth, "Report ESOPs or equity",
                model.extras.esopShare + "%", "More common at product companies than agencies");
            statTile(page, left + (tileWidth + 12) * 2, 414, tileWidth, "Sample",
                model.cell[3] ? String(model.cell[3]) + " reports" : "Benchmark",
                model.cell[3] ? "Community submissions" : "Market research baseline");
        }

        return page;
    }

    function cityPage(doc, model) {
        var page = doc.addPage();
        var left = PAGE.margin;
        var width = PAGE.width - PAGE.margin * 2;
        var chartWidth = width * 0.56;

        frame(page, model, "What the city changes", 3);
        page.text(
            "Median for " + model.level.toLowerCase() + " " + model.role.toLowerCase() + "s, city by city.",
            left, 120, { size: TYPE.body, color: MUTED }
        );

        barList(page, { x: left, y: 148, width: chartWidth, items: model.cities, labelWidth: 112 });

        var asideX = left + chartWidth + 46;
        var asideWidth = width - chartWidth - 46;

        if (model.topCity) {
            eyebrow(page, "Highest paying", asideX, 156);
            page.text(model.topCity.label, asideX, 190, { size: TYPE.feature, display: true, color: INK });
            page.text(money(model.topCity.value) + " median", asideX, 212, { size: TYPE.lead, color: BODY });
            page.paragraph(
                model.topCity.label + " pays about " + model.topCity.pct + "% above the national figure for this " +
                "role and level. Weigh that against rent and commute before treating it as a raise.",
                asideX, 238, asideWidth, { size: TYPE.body, color: BODY }
            );
        }

        page.line(asideX, 320, asideX + asideWidth, 320, RULE, 0.7);
        page.paragraph(
            "Cities are grouped Tier 1 and Tier 2. A city figure is only published once at least five people have " +
            "reported it; below that it falls back to the wider tier or the national figure, both to keep the " +
            "number meaningful and so nobody can be identified from a thinly populated cell.",
            asideX, 344, asideWidth, { size: TYPE.body, color: BODY }
        );

        return page;
    }

    function experiencePage(doc, model) {
        var page = doc.addPage();
        var left = PAGE.margin;
        var width = PAGE.width - PAGE.margin * 2;
        var chartWidth = width * 0.54;

        frame(page, model, "How pay grows with experience", 4);
        page.text(
            "Every level of " + model.role.toLowerCase() + ", national median.",
            left, 120, { size: TYPE.body, color: MUTED }
        );

        ladder(page, { x: left + 22, y: 156, width: chartWidth - 44, height: 146, points: model.levels });

        var asideX = left + chartWidth + 46;
        var asideWidth = width - chartWidth - 46;

        eyebrow(page, "The ladder", asideX, 156);

        var cursor = 180;
        model.levels.forEach(function (level) {
            if (level.value === null || level.value === undefined) return;
            page.text(level.label, asideX, cursor, {
                size: TYPE.row, color: level.selected ? INK : BODY
            });
            page.text(money(level.value), asideX + asideWidth, cursor, {
                size: TYPE.row, color: level.selected ? INK : BODY, align: "right"
            });
            page.line(asideX, cursor + 7, asideX + asideWidth, cursor + 7, RULE, 0.6);
            cursor += 21;
        });

        page.paragraph(
            model.growth
                ? "Moving from junior to senior in this discipline is worth " + model.growth + " on the median. " +
                  "The steepest jumps are usually mid to senior; past that, pay depends more on scope and company than title."
                : "Level-to-level growth needs both a junior and a senior figure for this role.",
            left, 348, chartWidth, { size: TYPE.body, color: BODY }
        );

        eyebrow(page, "By discipline, at this level", left, 414);
        barList(page, {
            x: left, y: 428, width: width, items: model.roles.slice(0, 6),
            labelWidth: 156, rowHeight: 18
        });

        return page;
    }

    function arrangementPage(doc, model) {
        var page = doc.addPage();
        var left = PAGE.margin;
        var width = PAGE.width - PAGE.margin * 2;
        var colWidth = (width - 44) / 2;

        frame(page, model, "Arrangement, employer and company", 5);
        page.text(
            "National figures for this role and level — these are not sliced by city as well.",
            left, 120, { size: TYPE.body, color: MUTED }
        );

        eyebrow(page, "On-site, hybrid or remote", left, 158);
        barList(page, { x: left, y: 174, width: colWidth, items: model.modes, labelWidth: 100 });

        eyebrow(page, "By type of company", left + colWidth + 44, 158);
        barList(page, { x: left + colWidth + 44, y: 174, width: colWidth, items: model.companies, labelWidth: 116 });

        var noteY = 296;

        if (model.remote) {
            page.rect(left, noteY, width, 66, PANEL);
            eyebrow(page, "Remote for a foreign employer", left + 16, noteY + 21);
            page.paragraph(
                "About " + model.remote.multiple + "x the Indian median for this role — " +
                money(model.remote.foreign) + " against " + money(model.remote.india) + ". It is kept out of every " +
                "city and national figure in this report, because folding it in would lift numbers most designers " +
                "here will never be offered.",
                left + 16, noteY + 40, width - 32, { size: TYPE.body - 0.5, color: BODY, leading: 14.5 }
            );
            noteY += 86;
        }

        eyebrow(page, "How these figures are put together", left, noteY + 16);

        var cursor = page.paragraph(
            "Figures combine market research with salaries submitted anonymously by designers. The research base is " +
            "drawn from public job listings, salary aggregators and published Indian design and startup compensation " +
            "reports; community submissions replace it for a given role, level and city once enough have come in. " +
            "Submissions older than 24 months are dropped, and extreme outliers trimmed before any median is calculated.",
            left, noteY + 38, width, { size: TYPE.body, color: BODY }
        );

        page.paragraph(
            "Treat these as a reference range for a negotiation, not a guarantee. Company, funding stage and how well " +
            "you interview all move the number more than any table can capture.",
            left, cursor + 6, width, { size: TYPE.body, color: MUTED }
        );

        return page;
    }

    // ── entry point ─────────────────────────────────────────────────────────

    /** fonts is optional: { text: {metrics, bytes}, display: {metrics, bytes} }.
        Without it the document falls back to Helvetica — see pdf-writer.js. */
    function build(model, fonts) {
        var doc = DWPdf.create({
            width: PAGE.width,
            height: PAGE.height,
            fonts: fonts || null,
            title: "Designer salary report — " + model.summary,
            author: "Design Wallet",
            subject: "Median annual fixed CTC for " + model.role + " (" + model.level + ") in India"
        });

        coverPage(doc, model);
        spreadPage(doc, model);
        cityPage(doc, model);
        experiencePage(doc, model);
        arrangementPage(doc, model);

        return doc.toBytes();
    }

    return { build: build, money: money };
})();

if (typeof module !== "undefined" && module.exports) module.exports = DWReport;
