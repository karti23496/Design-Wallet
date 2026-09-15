/**
 * pdf-writer.js — a minimal PDF generator.
 *
 * Enough of PDF 1.4 to lay out a report: pages, rectangles, lines, polylines,
 * circles and text. No library, for the same reason charts.js hand-builds its
 * bars — a PDF is a text format with an offset table, and the alternative was a
 * 460 KB dependency for five pages of rectangles.
 *
 * Coordinates are top-left origin, in points (72 per inch), because laying out
 * a page downward is easier to reason about. They are flipped to PDF's
 * bottom-left origin on the way out.
 *
 * FONTS. Pass `fonts` to embed Design Wallet's own typeface. Two faces, each
 * { metrics, bytes }: `text` for body copy and `display` for titles and big
 * figures — the display face is LIGHTER, not heavier, so the slot is named for
 * its role rather than its weight. Metrics come from
 * salary/fonts/inter-metrics.js and the bytes from the matching .ttf. Without
 * them the document falls back to Helvetica, which every reader has but which
 * is not the brand face.
 *
 * Text is CP1252. The rupee sign has no slot in that encoding, so an embedded
 * font remaps 0x80 (normally the euro, which this report never prints) to the
 * rupee glyph through /Differences. On the Helvetica fallback there is no such
 * glyph at all, so "₹" degrades to "INR" instead.
 */

var DWPdf = (function () {
    "use strict";

    // Glyphs that live above 127 in CP1252 but not at their Unicode code point.
    var CP1252 = {
        "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133,
        "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138,
        "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146,
        "“": 147, "”": 148, "•": 149, "–": 150, "—": 151,
        "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156,
        "ž": 158, "Ÿ": 159
    };

    var RUPEE = "₹";
    var RUPEE_SLOT = 0x80;

    // Characters with no CP1252 home at all, rewritten before encoding.
    var REWRITE = [
        [/→/g, "->"],
        [/←/g, "<-"],
        [/ /g, " "]
    ];

    // Helvetica advance widths (AFM, per 1000 units) for ASCII 32–126 — the
    // fallback when no font is embedded. Both slots fall back to the same face:
    // there is no light weight among the standard 14.
    var W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

    function num(value) {
        return String(Math.round(value * 100) / 100);
    }

    function colorOp(color, stroke) {
        return num(color[0]) + " " + num(color[1]) + " " + num(color[2]) + " " + (stroke ? "RG" : "rg");
    }

    /** PDF date format: D:YYYYMMDDHHmmSS. */
    function pdfDate(date) {
        var pad = function (value) {
            return (value < 10 ? "0" : "") + value;
        };
        return "D:" + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
            pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
    }

    /**
     * Strings in the document information dictionary are NOT read with the
     * font's encoding — a reader treats them as PDFDocEncoded unless they open
     * with a UTF-16BE byte order mark. Writing CP1252 there turned the title's
     * em dash into "Š".
     */
    function encodeTextString(text) {
        var source = String(text === null || text === undefined ? "" : text);
        var bytes = [254, 255];

        for (var i = 0; i < source.length; i += 1) {
            var code = source.charCodeAt(i);
            var pair = [(code >> 8) & 0xff, code & 0xff];

            for (var half = 0; half < 2; half += 1) {
                if (pair[half] === 40 || pair[half] === 41 || pair[half] === 92) bytes.push(92);
                bytes.push(pair[half]);
            }
        }

        return bytes;
    }

    // ── page ────────────────────────────────────────────────────────────────

    function Page(doc) {
        this.doc = doc;
        this.ops = [];
    }

    /** PDF's origin is bottom-left; this API's is top-left. */
    Page.prototype.flip = function (y) {
        return this.doc.height - y;
    };

    Page.prototype.rect = function (x, y, width, height, color) {
        this.ops.push(
            colorOp(color, false) + " " +
            num(x) + " " + num(this.flip(y + height)) + " " + num(width) + " " + num(height) + " re f"
        );
        return this;
    };

    Page.prototype.line = function (x1, y1, x2, y2, color, thickness) {
        this.ops.push(
            colorOp(color, true) + " " + num(thickness || 1) + " w " +
            num(x1) + " " + num(this.flip(y1)) + " m " + num(x2) + " " + num(this.flip(y2)) + " l S"
        );
        return this;
    };

    /** points: [[x, y], …] in top-left coordinates. */
    Page.prototype.polyline = function (points, color, thickness) {
        if (points.length < 2) return this;

        var path = points.map(function (point, index) {
            return num(point[0]) + " " + num(this.flip(point[1])) + " " + (index ? "l" : "m");
        }, this).join(" ");

        this.ops.push(colorOp(color, true) + " " + num(thickness || 1) + " w 1 J 1 j " + path + " S");
        return this;
    };

    /**
     * Draws SVG path data as a filled PDF path — how the logo gets in without
     * an image XObject. Handles M L H V C Z in both cases, including implicit
     * repeats (a second coordinate pair after M continues as L, and C repeats
     * in triples). Arcs and quadratics are NOT handled: the Design Wallet mark
     * has neither, and a half-supported arc would fail silently.
     *
     * options: { x, y, scale, color } — x/y place the viewBox's top-left corner.
     */
    Page.prototype.path = function (data, options) {
        var opts = options || {};
        var scale = opts.scale || 1;
        var originX = opts.x || 0;
        var originY = opts.y || 0;
        var self = this;

        var px = function (value) {
            return num(originX + value * scale);
        };
        var py = function (value) {
            return num(self.flip(originY + value * scale));
        };

        var tokens = String(data).match(/[MmLlHhVvCcZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
        var ops = [];
        var index = 0;
        var command = null;
        var x = 0, y = 0, startX = 0, startY = 0;

        var nextNumber = function () {
            return parseFloat(tokens[index++]);
        };

        while (index < tokens.length) {
            if (/[MmLlHhVvCcZz]/.test(tokens[index])) {
                command = tokens[index++];
            } else if (command === "M") {
                command = "L";          // implicit lineto after a moveto
            } else if (command === "m") {
                command = "l";
            }

            var relative = command === command.toLowerCase();

            switch (command.toUpperCase()) {
            case "M":
                x = relative ? x + nextNumber() : nextNumber();
                y = relative ? y + nextNumber() : nextNumber();
                startX = x;
                startY = y;
                ops.push(px(x) + " " + py(y) + " m");
                break;
            case "L":
                x = relative ? x + nextNumber() : nextNumber();
                y = relative ? y + nextNumber() : nextNumber();
                ops.push(px(x) + " " + py(y) + " l");
                break;
            case "H":
                x = relative ? x + nextNumber() : nextNumber();
                ops.push(px(x) + " " + py(y) + " l");
                break;
            case "V":
                y = relative ? y + nextNumber() : nextNumber();
                ops.push(px(x) + " " + py(y) + " l");
                break;
            case "C":
                var c1x = relative ? x + nextNumber() : nextNumber();
                var c1y = relative ? y + nextNumber() : nextNumber();
                var c2x = relative ? x + nextNumber() : nextNumber();
                var c2y = relative ? y + nextNumber() : nextNumber();
                var endX = relative ? x + nextNumber() : nextNumber();
                var endY = relative ? y + nextNumber() : nextNumber();
                ops.push(
                    px(c1x) + " " + py(c1y) + " " + px(c2x) + " " + py(c2y) + " " +
                    px(endX) + " " + py(endY) + " c"
                );
                x = endX;
                y = endY;
                break;
            case "Z":
                ops.push("h");
                x = startX;
                y = startY;
                break;
            default:
                index += 1;             // unknown command: skip rather than hang
                break;
            }
        }

        if (ops.length) {
            // f, NOT f*. SVG's default fill-rule is nonzero, and this artwork
            // relies on it: counters are wound the opposite way, so nonzero
            // drops them out correctly. Even-odd instead punches a hole wherever
            // two subpaths overlap in the SAME direction, which slashed a bar
            // through both "e"s and broke the "t" crossbar in the wordmark.
            this.ops.push(colorOp(opts.color || [0, 0, 0], false) + " " + ops.join(" ") + " f");
        }

        return this;
    };

    Page.prototype.circle = function (cx, cy, radius, color) {
        // Four Béziers, the usual 0.5523 circle approximation.
        var k = radius * 0.5523;
        var y = this.flip(cy);
        this.ops.push(
            colorOp(color, false) + " " +
            num(cx - radius) + " " + num(y) + " m " +
            num(cx - radius) + " " + num(y + k) + " " + num(cx - k) + " " + num(y + radius) + " " + num(cx) + " " + num(y + radius) + " c " +
            num(cx + k) + " " + num(y + radius) + " " + num(cx + radius) + " " + num(y + k) + " " + num(cx + radius) + " " + num(y) + " c " +
            num(cx + radius) + " " + num(y - k) + " " + num(cx + k) + " " + num(y - radius) + " " + num(cx) + " " + num(y - radius) + " c " +
            num(cx - k) + " " + num(y - radius) + " " + num(cx - radius) + " " + num(y - k) + " " + num(cx - radius) + " " + num(y) + " c f"
        );
        return this;
    };

    /**
     * options: { size, bold, color, align: "left" | "center" | "right", charSpace }
     * y is the text baseline.
     */
    Page.prototype.text = function (text, x, y, options) {
        var opts = options || {};
        var size = opts.size || 10;
        var display = !!opts.display;
        var color = opts.color || [0, 0, 0];
        var left = x;

        if (opts.align === "center") left = x - this.doc.widthOf(text, size, display, opts.charSpace) / 2;
        if (opts.align === "right") left = x - this.doc.widthOf(text, size, display, opts.charSpace);

        // Tc is text STATE and survives BT/ET, so it is always written: setting
        // it only when tracking is wanted leaks that tracking into every later
        // run on the page, which widens the text past its measured wrap width.
        this.ops.push(
            "BT " + colorOp(color, false) + " /" + (display ? "F2" : "F1") + " " + num(size) + " Tf " +
            num(opts.charSpace || 0) + " Tc " +
            "1 0 0 1 " + num(left) + " " + num(this.flip(y)) + " Tm (" +
            String.fromCharCode.apply(null, this.doc.encode(text)) + ") Tj ET"
        );

        return this;
    };

    /** Word-wraps into `width`, returns the y after the last line. */
    Page.prototype.paragraph = function (text, x, y, width, options) {
        var opts = options || {};
        var size = opts.size || 9.5;
        var leading = opts.leading || size * 1.55;
        var words = this.doc.rewrite(text).split(/\s+/);
        var line = "";
        var cursor = y;

        for (var i = 0; i < words.length; i += 1) {
            var candidate = line ? line + " " + words[i] : words[i];
            if (this.doc.widthOf(candidate, size, !!opts.display, opts.charSpace) > width && line) {
                this.text(line, x, cursor, opts);
                cursor += leading;
                line = words[i];
            } else {
                line = candidate;
            }
        }

        if (line) {
            this.text(line, x, cursor, opts);
            cursor += leading;
        }

        return cursor;
    };

    Page.prototype.stream = function () {
        return this.ops.join("\n");
    };

    // ── document ────────────────────────────────────────────────────────────

    function Doc(options) {
        var opts = options || {};
        this.width = opts.width || 842;      // A4 landscape
        this.height = opts.height || 595;
        this.title = opts.title || "Report";
        this.author = opts.author || "";
        this.subject = opts.subject || "";
        this.fonts = (opts.fonts && opts.fonts.text && opts.fonts.display) ? opts.fonts : null;
        this.pages = [];
    }

    Doc.prototype.addPage = function () {
        var page = new Page(this);
        this.pages.push(page);
        return page;
    };

    /** Rewrites what the encoding cannot carry. Without an embedded font that
        includes the rupee sign, which has no Helvetica glyph. */
    Doc.prototype.rewrite = function (text) {
        var out = String(text === null || text === undefined ? "" : text);

        REWRITE.forEach(function (pair) {
            out = out.replace(pair[0], pair[1]);
        });

        if (!this.fonts) out = out.replace(/₹\s*/g, "INR ");

        return out;
    };

    /** One character → one CP1252 byte, with the rupee in its remapped slot. */
    Doc.prototype.byteFor = function (ch) {
        var code = ch.charCodeAt(0);

        if (this.fonts && ch === RUPEE) return RUPEE_SLOT;
        if (code < 128) return code;
        if (CP1252[ch] !== undefined) return CP1252[ch];
        if (code <= 255) return code;

        return 63;   // "?" — better than dropping silently
    };

    /** String → bytes, with PDF's own \ ( ) escapes applied. */
    Doc.prototype.encode = function (text) {
        var source = this.rewrite(text);
        var bytes = [];

        for (var i = 0; i < source.length; i += 1) {
            var byte = this.byteFor(source.charAt(i));
            if (byte === 40 || byte === 41 || byte === 92) bytes.push(92);
            bytes.push(byte);
        }

        return bytes;
    };

    Doc.prototype.widthOf = function (text, size, display, charSpace) {
        var source = this.rewrite(text);
        var embedded = this.fonts ? (display ? this.fonts.display.metrics.widths : this.fonts.text.metrics.widths) : null;
        var table = W_REG;
        var total = 0;

        for (var i = 0; i < source.length; i += 1) {
            var ch = source.charAt(i);

            if (embedded) {
                var byte = this.byteFor(ch);
                total += embedded[byte] || embedded[32];
            } else {
                var code = ch.charCodeAt(0);
                total += (code >= 32 && code <= 126) ? table[code - 32] : 556;
            }
        }

        // Tracking is added per glyph, so it has to be measured too — otherwise
        // wrapping and right-alignment are computed against the wrong width.
        return (total / 1000) * size + (charSpace || 0) * source.length;
    };

    Doc.prototype.toBytes = function () {
        var self = this;
        var bytes = [];
        var offsets = [];

        var pushAscii = function (text) {
            for (var i = 0; i < text.length; i += 1) bytes.push(text.charCodeAt(i) & 0xff);
        };
        var pushBytes = function (list) {
            for (var i = 0; i < list.length; i += 1) bytes.push(list[i]);
        };
        var startObject = function (number) {
            offsets[number] = bytes.length;
            pushAscii(number + " 0 obj\n");
        };
        var endObject = function () {
            pushAscii("endobj\n");
        };

        // 1 catalog, 2 page tree, 3–4 the two font dictionaries. An embedded
        // face then needs a descriptor and a file stream of its own.
        var embedded = !!this.fonts;
        var firstPageObj = embedded ? 9 : 5;
        var pageCount = this.pages.length;
        var infoObj = firstPageObj + pageCount * 2;

        pushAscii("%PDF-1.4\n");
        bytes.push(37, 226, 227, 207, 211, 10);   // binary marker: %âãÏÓ

        startObject(1);
        pushAscii("<< /Type /Catalog /Pages 2 0 R >>\n");
        endObject();

        var kids = this.pages.map(function (page, index) {
            return (firstPageObj + index * 2) + " 0 R";
        }).join(" ");

        startObject(2);
        pushAscii("<< /Type /Pages /Kids [" + kids + "] /Count " + pageCount + " >>\n");
        endObject();

        if (embedded) {
            [this.fonts.text, this.fonts.display].forEach(function (face, index) {
                var fontObj = 3 + index;
                var descriptorObj = 5 + index * 2;
                var fileObj = descriptorObj + 1;
                var metrics = face.metrics;

                startObject(fontObj);
                pushAscii(
                    "<< /Type /Font /Subtype /TrueType /BaseFont /" + metrics.postScriptName + " " +
                    "/FirstChar 32 /LastChar 255 /Widths [" +
                    metrics.widths.slice(32, 256).join(" ") + "] " +
                    "/FontDescriptor " + descriptorObj + " 0 R " +
                    // 0x80 is the euro in WinAnsi; the report never prints one,
                    // and it is the only free slot for the rupee.
                    "/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding " +
                    "/Differences [128 /uni20B9] >> >>\n"
                );
                endObject();

                startObject(descriptorObj);
                pushAscii(
                    "<< /Type /FontDescriptor /FontName /" + metrics.postScriptName + " /Flags 32 " +
                    "/FontBBox [" + metrics.bbox.join(" ") + "] " +
                    "/ItalicAngle " + metrics.italicAngle + " /Ascent " + metrics.ascent +
                    " /Descent " + metrics.descent + " /CapHeight " + metrics.capHeight +
                    " /StemV " + metrics.stemV + " /FontFile2 " + fileObj + " 0 R >>\n"
                );
                endObject();

                startObject(fileObj);
                pushAscii("<< /Length " + face.bytes.length + " /Length1 " + face.bytes.length + " >>\nstream\n");
                pushBytes(face.bytes);
                pushAscii("\nendstream\n");
                endObject();
            });
        } else {
            startObject(3);
            pushAscii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n");
            endObject();

            startObject(4);
            pushAscii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n");
            endObject();
        }

        this.pages.forEach(function (page, index) {
            var pageObj = firstPageObj + index * 2;
            var contentObj = pageObj + 1;
            var stream = page.stream();
            var streamBytes = [];

            for (var i = 0; i < stream.length; i += 1) streamBytes.push(stream.charCodeAt(i) & 0xff);

            startObject(pageObj);
            pushAscii(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + num(self.width) + " " + num(self.height) + "] " +
                "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + contentObj + " 0 R >>\n"
            );
            endObject();

            startObject(contentObj);
            pushAscii("<< /Length " + streamBytes.length + " >>\nstream\n");
            pushBytes(streamBytes);
            pushAscii("\nendstream\n");
            endObject();
        });

        startObject(infoObj);
        pushAscii("<< /Title (");
        pushBytes(encodeTextString(this.title));
        pushAscii(") /Author (");
        pushBytes(encodeTextString(this.author));
        pushAscii(") /Subject (");
        pushBytes(encodeTextString(this.subject));
        pushAscii(") /Creator (Design Wallet) /Producer (Design Wallet) /CreationDate (" + pdfDate(new Date()) + ") >>\n");
        endObject();

        var xrefStart = bytes.length;
        var total = infoObj + 1;

        pushAscii("xref\n0 " + total + "\n");
        pushAscii("0000000000 65535 f \n");

        for (var number = 1; number < total; number += 1) {
            var offset = String(offsets[number] || 0);
            while (offset.length < 10) offset = "0" + offset;
            pushAscii(offset + " 00000 n \n");
        }

        pushAscii(
            "trailer\n<< /Size " + total + " /Root 1 0 R /Info " + infoObj + " 0 R >>\n" +
            "startxref\n" + xrefStart + "\n%%EOF\n"
        );

        return new Uint8Array(bytes);
    };

    return {
        create: function (options) {
            return new Doc(options);
        }
    };
})();

if (typeof module !== "undefined" && module.exports) module.exports = DWPdf;
