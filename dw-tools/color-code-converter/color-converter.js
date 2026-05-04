document.addEventListener("DOMContentLoaded", function () {
    var DEFAULT_COLOR = "#FF6B3D";
    var input = document.getElementById("color-code-input");
    var convertButton = document.getElementById("convert-color-button");
    var randomButton = document.getElementById("random-color-button");
    var resetButton = document.getElementById("reset-color-button");
    var error = document.getElementById("converter-error");
    var colorPlane = document.getElementById("converter-color-space");
    var colorPlaneHandle = document.getElementById("converter-color-space-handle");
    var hueSlider = document.getElementById("converter-hue-slider");
    var hueHandle = document.getElementById("converter-hue-handle");
    var currentColorSwatch = document.getElementById("converter-current-color");
    var shadeStrip = document.getElementById("converter-shade-strip");
    var shadeDetailToggle = document.getElementById("shade-detail-toggle");
    var shadeDetailGrid = document.getElementById("converter-shade-detail-grid");
    var exportButton = document.getElementById("export-palette-button");
    var exportModal = document.getElementById("converter-export-modal");
    var exportPrefixInput = document.getElementById("converter-export-prefix");
    var exportPalette = document.getElementById("converter-export-palette");
    var exportCodeOutput = document.getElementById("converter-export-code");
    var exportCopyButton = document.getElementById("converter-copy-export");
    var exportDownloadButton = document.getElementById("converter-export-download");
    var toast = document.getElementById("converter-toast");
    var toastTimer = 0;
    var currentRgb = null;
    var currentPalette = [];
    var currentExportType = "figma";
    var currentExportFormat = "hex";
    var currentPickerHsv = { h: 14, s: 76, v: 100 };
    var previousModalFocus = null;
    var SHADE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

    if (!input) return;

    var outputs = {
        hex: document.getElementById("hex-output"),
        rgb: document.getElementById("rgb-output"),
        hsl: document.getElementById("hsl-output"),
        hsv: document.getElementById("hsv-output"),
        oklch: document.getElementById("oklch-output"),
        cmyk: document.getElementById("cmyk-output"),
        css: document.getElementById("css-output")
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function normalizeHue(value) {
        var normalized = value % 360;
        return normalized < 0 ? normalized + 360 : normalized;
    }

    function formatNumber(value, places) {
        var next = Number(value);
        if (!Number.isFinite(next)) return "0";
        return parseFloat(next.toFixed(places)).toString();
    }

    function toHexPart(value) {
        return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
    }

    function rgbToHex(rgb) {
        return "#" + toHexPart(rgb.r) + toHexPart(rgb.g) + toHexPart(rgb.b);
    }

    function splitArgs(value) {
        return String(value || "")
            .trim()
            .replace(/\s*\/\s*/g, " ")
            .replace(/,/g, " ")
            .split(/\s+/)
            .filter(Boolean);
    }

    function parsePercentOrNumber(value, max) {
        var raw = String(value || "").trim();
        if (!raw) return NaN;
        if (raw.endsWith("%")) {
            return parseFloat(raw) / 100 * max;
        }
        return parseFloat(raw);
    }

    function parsePercent(value) {
        var parsed = parsePercentOrNumber(value, 100);
        return Number.isFinite(parsed) ? clamp(parsed, 0, 100) : NaN;
    }

    function parseHue(value) {
        var raw = String(value || "").trim().toLowerCase();
        var parsed = parseFloat(raw);
        if (!Number.isFinite(parsed)) return NaN;
        if (raw.endsWith("turn")) parsed *= 360;
        if (raw.endsWith("rad")) parsed *= 180 / Math.PI;
        if (raw.endsWith("grad")) parsed *= 0.9;
        return normalizeHue(parsed);
    }

    function parseRgbChannel(value) {
        var parsed = parsePercentOrNumber(value, 255);
        return Number.isFinite(parsed) ? clamp(Math.round(parsed), 0, 255) : NaN;
    }

    function parseHex(value) {
        var raw = String(value || "").trim();
        if (!raw) return null;
        raw = raw.replace(/^#/, "").replace(/^0x/i, "");

        if (/^[0-9a-f]{3,4}$/i.test(raw)) {
            raw = raw.slice(0, 3).split("").map(function (part) {
                return part + part;
            }).join("");
        }

        if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(raw)) {
            raw = raw.slice(0, 6);
            return {
                r: parseInt(raw.slice(0, 2), 16),
                g: parseInt(raw.slice(2, 4), 16),
                b: parseInt(raw.slice(4, 6), 16)
            };
        }

        return null;
    }

    function parseRgb(value) {
        var match = String(value || "").trim().match(/^rgba?\((.+)\)$/i);
        if (!match) return null;
        var parts = splitArgs(match[1]);
        if (parts.length < 3) return null;

        var rgb = {
            r: parseRgbChannel(parts[0]),
            g: parseRgbChannel(parts[1]),
            b: parseRgbChannel(parts[2])
        };

        return [rgb.r, rgb.g, rgb.b].every(Number.isFinite) ? rgb : null;
    }

    function parseLooseRgb(value) {
        var raw = String(value || "").trim();
        if (!/^[0-9.\s,%/]+$/.test(raw)) return null;
        var parts = splitArgs(raw);
        if (parts.length < 3) return null;

        var rgb = {
            r: parseRgbChannel(parts[0]),
            g: parseRgbChannel(parts[1]),
            b: parseRgbChannel(parts[2])
        };

        return [rgb.r, rgb.g, rgb.b].every(Number.isFinite) ? rgb : null;
    }

    function hslToRgb(h, s, l) {
        h = normalizeHue(h) / 360;
        s = clamp(s, 0, 100) / 100;
        l = clamp(l, 0, 100) / 100;

        if (s === 0) {
            var gray = Math.round(l * 255);
            return { r: gray, g: gray, b: gray };
        }

        function hueToRgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        return {
            r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
            g: Math.round(hueToRgb(p, q, h) * 255),
            b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
        };
    }

    function hsvToRgb(h, s, v) {
        h = normalizeHue(h);
        s = clamp(s, 0, 100) / 100;
        v = clamp(v, 0, 100) / 100;

        var c = v * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = v - c;
        var r1 = 0;
        var g1 = 0;
        var b1 = 0;

        if (h < 60) {
            r1 = c; g1 = x;
        } else if (h < 120) {
            r1 = x; g1 = c;
        } else if (h < 180) {
            g1 = c; b1 = x;
        } else if (h < 240) {
            g1 = x; b1 = c;
        } else if (h < 300) {
            r1 = x; b1 = c;
        } else {
            r1 = c; b1 = x;
        }

        return {
            r: Math.round((r1 + m) * 255),
            g: Math.round((g1 + m) * 255),
            b: Math.round((b1 + m) * 255)
        };
    }

    function cmykToRgb(c, m, y, k) {
        c = clamp(c, 0, 100) / 100;
        m = clamp(m, 0, 100) / 100;
        y = clamp(y, 0, 100) / 100;
        k = clamp(k, 0, 100) / 100;

        return {
            r: Math.round(255 * (1 - c) * (1 - k)),
            g: Math.round(255 * (1 - m) * (1 - k)),
            b: Math.round(255 * (1 - y) * (1 - k))
        };
    }

    function parseHsl(value) {
        var match = String(value || "").trim().match(/^hsla?\((.+)\)$/i);
        if (!match) return null;
        var parts = splitArgs(match[1]);
        if (parts.length < 3) return null;

        var h = parseHue(parts[0]);
        var s = parsePercent(parts[1]);
        var l = parsePercent(parts[2]);
        return [h, s, l].every(Number.isFinite) ? hslToRgb(h, s, l) : null;
    }

    function parseHsv(value) {
        var match = String(value || "").trim().match(/^hs[vb]\((.+)\)$/i);
        if (!match) return null;
        var parts = splitArgs(match[1]);
        if (parts.length < 3) return null;

        var h = parseHue(parts[0]);
        var s = parsePercent(parts[1]);
        var v = parsePercent(parts[2]);
        return [h, s, v].every(Number.isFinite) ? hsvToRgb(h, s, v) : null;
    }

    function parseCmyk(value) {
        var match = String(value || "").trim().match(/^cmyk\((.+)\)$/i);
        if (!match) return null;
        var parts = splitArgs(match[1]);
        if (parts.length < 4) return null;

        var c = parsePercent(parts[0]);
        var m = parsePercent(parts[1]);
        var y = parsePercent(parts[2]);
        var k = parsePercent(parts[3]);
        return [c, m, y, k].every(Number.isFinite) ? cmykToRgb(c, m, y, k) : null;
    }

    function parseCanvasColor(value) {
        if (!document.createElement) return null;

        var raw = String(value || "").trim();
        if (!raw || raw.toLowerCase() === "transparent") return null;

        var canvas = parseCanvasColor.canvas || document.createElement("canvas");
        var context = parseCanvasColor.context || canvas.getContext("2d");
        parseCanvasColor.canvas = canvas;
        parseCanvasColor.context = context;

        if (!context) return null;

        context.fillStyle = "#123456";
        context.fillStyle = raw;

        if (context.fillStyle === "#123456" && raw.toLowerCase() !== "#123456") {
            return null;
        }

        return parseHex(context.fillStyle) || parseRgb(context.fillStyle);
    }

    function parseColor(value) {
        return parseHex(value) ||
            parseRgb(value) ||
            parseHsl(value) ||
            parseHsv(value) ||
            parseCmyk(value) ||
            parseLooseRgb(value) ||
            parseCanvasColor(value);
    }

    function rgbToHsl(rgb) {
        var r = rgb.r / 255;
        var g = rgb.g / 255;
        var b = rgb.b / 255;
        var max = Math.max(r, g, b);
        var min = Math.min(r, g, b);
        var h = 0;
        var s = 0;
        var l = (max + min) / 2;

        if (max !== min) {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                default:
                    h = (r - g) / d + 4;
                    break;
            }
            h *= 60;
        }

        return {
            h: normalizeHue(h),
            s: s * 100,
            l: l * 100
        };
    }

    function rgbToHsv(rgb) {
        var r = rgb.r / 255;
        var g = rgb.g / 255;
        var b = rgb.b / 255;
        var max = Math.max(r, g, b);
        var min = Math.min(r, g, b);
        var d = max - min;
        var h = 0;

        if (d !== 0) {
            switch (max) {
                case r:
                    h = 60 * (((g - b) / d) % 6);
                    break;
                case g:
                    h = 60 * ((b - r) / d + 2);
                    break;
                default:
                    h = 60 * ((r - g) / d + 4);
                    break;
            }
        }

        return {
            h: normalizeHue(h),
            s: max === 0 ? 0 : d / max * 100,
            v: max * 100
        };
    }

    function rgbToCmyk(rgb) {
        var r = rgb.r / 255;
        var g = rgb.g / 255;
        var b = rgb.b / 255;
        var k = 1 - Math.max(r, g, b);

        if (k === 1) {
            return { c: 0, m: 0, y: 0, k: 100 };
        }

        return {
            c: (1 - r - k) / (1 - k) * 100,
            m: (1 - g - k) / (1 - k) * 100,
            y: (1 - b - k) / (1 - k) * 100,
            k: k * 100
        };
    }

    function srgbToLinear(value) {
        var channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    }

    function rgbToOklch(rgb) {
        var r = srgbToLinear(rgb.r);
        var g = srgbToLinear(rgb.g);
        var b = srgbToLinear(rgb.b);

        var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
        var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
        var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

        var lRoot = Math.cbrt(l);
        var mRoot = Math.cbrt(m);
        var sRoot = Math.cbrt(s);

        var L = 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot;
        var a = 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot;
        var bValue = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot;
        var C = Math.sqrt(a * a + bValue * bValue);
        var H = Math.atan2(bValue, a) * 180 / Math.PI;

        return {
            l: L * 100,
            c: C,
            h: normalizeHue(H)
        };
    }

    function oklchToLinearRgb(lightness, chroma, hue) {
        var L = clamp(lightness, 0, 100) / 100;
        var h = normalizeHue(hue) * Math.PI / 180;
        var a = chroma * Math.cos(h);
        var bValue = chroma * Math.sin(h);

        var lRoot = L + 0.3963377774 * a + 0.2158037573 * bValue;
        var mRoot = L - 0.1055613458 * a - 0.0638541728 * bValue;
        var sRoot = L - 0.0894841775 * a - 1.2914855480 * bValue;

        var l = lRoot * lRoot * lRoot;
        var m = mRoot * mRoot * mRoot;
        var s = sRoot * sRoot * sRoot;

        return {
            r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        };
    }

    function linearToSrgb(value) {
        var channel = clamp(value, 0, 1);
        if (channel <= 0.0031308) {
            channel = channel * 12.92;
        } else {
            channel = 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
        }

        return clamp(Math.round(channel * 255), 0, 255);
    }

    function linearRgbToRgb(linear) {
        return {
            r: linearToSrgb(linear.r),
            g: linearToSrgb(linear.g),
            b: linearToSrgb(linear.b)
        };
    }

    function isLinearRgbInGamut(linear) {
        return linear.r >= 0 && linear.r <= 1 &&
            linear.g >= 0 && linear.g <= 1 &&
            linear.b >= 0 && linear.b <= 1;
    }

    function oklchToRgb(lightness, chroma, hue) {
        var nextChroma = Math.max(0, chroma);
        var linear = oklchToLinearRgb(lightness, nextChroma, hue);
        var attempts = 0;

        while (!isLinearRgbInGamut(linear) && attempts < 14) {
            nextChroma *= 0.86;
            linear = oklchToLinearRgb(lightness, nextChroma, hue);
            attempts += 1;
        }

        return linearRgbToRgb(linear);
    }

    function relativeLuminance(rgb) {
        var r = srgbToLinear(rgb.r);
        var g = srgbToLinear(rgb.g);
        var b = srgbToLinear(rgb.b);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function contrastRatio(luminanceA, luminanceB) {
        var lighter = Math.max(luminanceA, luminanceB);
        var darker = Math.min(luminanceA, luminanceB);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function getReadableTextColor(rgb) {
        var luminance = relativeLuminance(rgb);
        return contrastRatio(luminance, 0) >= contrastRatio(1, luminance) ? "#050505" : "#ffffff";
    }

    function getFormattedValues(rgb) {
        var hsl = rgbToHsl(rgb);
        var hsv = rgbToHsv(rgb);
        var cmyk = rgbToCmyk(rgb);
        var oklch = rgbToOklch(rgb);
        var rgbRaw = rgb.r + " " + rgb.g + " " + rgb.b;
        var hslRaw = formatNumber(hsl.h, 1) + " " + formatNumber(hsl.s, 1) + "% " + formatNumber(hsl.l, 1) + "%";
        var hsvRaw = formatNumber(hsv.h, 1) + " " + formatNumber(hsv.s, 1) + "% " + formatNumber(hsv.v, 1) + "%";
        var cmykRaw = formatNumber(cmyk.c, 1) + "% " + formatNumber(cmyk.m, 1) + "% " + formatNumber(cmyk.y, 1) + "% " + formatNumber(cmyk.k, 1) + "%";
        var oklchRaw = formatNumber(oklch.l, 2) + "% " + formatNumber(oklch.c, 4) + " " + formatNumber(oklch.h, 1);

        return {
            hex: rgbToHex(rgb),
            rgb: "rgb(" + rgbRaw + ")",
            hsl: "hsl(" + hslRaw + ")",
            hsv: "hsv(" + hsvRaw + ")",
            cmyk: "cmyk(" + cmykRaw + ")",
            oklch: "oklch(" + oklchRaw + ")",
            rgbRaw: rgbRaw,
            hslRaw: hslRaw,
            oklchRaw: oklchRaw
        };
    }

    function updateColorControls(rgb) {
        var hsv = rgbToHsv(rgb);
        var hex = rgbToHex(rgb);
        currentPickerHsv = hsv;

        if (colorPlane) {
            colorPlane.style.backgroundColor = "hsl(" + formatNumber(hsv.h, 1) + " 100% 50%)";
            colorPlane.setAttribute("aria-valuenow", String(Math.round(hsv.s)));
            colorPlane.setAttribute("aria-valuetext", "Saturation " + Math.round(hsv.s) + "%, brightness " + Math.round(hsv.v) + "%");
        }

        if (colorPlaneHandle) {
            colorPlaneHandle.style.left = hsv.s + "%";
            colorPlaneHandle.style.top = (100 - hsv.v) + "%";
        }

        if (hueSlider) {
            hueSlider.setAttribute("aria-valuenow", String(Math.round(hsv.h)));
        }

        if (hueHandle) {
            hueHandle.style.left = (hsv.h / 360 * 100) + "%";
        }

        if (currentColorSwatch) {
            currentColorSwatch.style.backgroundColor = hex;
        }

    }

    function setColorFromRgb(rgb) {
        input.value = rgbToHex(rgb);
        renderColor(rgb);
    }

    function buildShade(step, rgb) {
        return {
            step: step,
            rgb: rgb,
            textColor: getReadableTextColor(rgb),
            values: getFormattedValues(rgb)
        };
    }

    function generatePalette(rgb) {
        var base = rgbToOklch(rgb);
        var baseLightness = clamp(base.l, 8, 94);
        var darkestLightness = Math.max(7, Math.min(baseLightness - 52, 13));
        var lightestLightness = 98;

        return SHADE_STEPS.map(function (step, index) {
            if (step === 500) {
                return buildShade(step, rgb);
            }

            var nextLightness;
            var nextChroma;

            if (index < 5) {
                var lightDistance = (5 - index) / 5;
                nextLightness = baseLightness + (lightestLightness - baseLightness) * lightDistance;
                nextChroma = base.c * (1 - lightDistance * 0.82);
            } else {
                var darkDistance = (index - 5) / 5;
                nextLightness = baseLightness - (baseLightness - darkestLightness) * darkDistance;
                nextChroma = base.c * (1 - darkDistance * 0.56);
            }

            return buildShade(step, oklchToRgb(nextLightness, nextChroma, base.h));
        });
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sanitizePrefix(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "color";
    }

    function getShadeValue(shade, format) {
        return shade.values[format] || shade.values.hex;
    }

    function renderShadeStrip() {
        if (!shadeStrip || !currentPalette.length) return;

        shadeStrip.innerHTML = currentPalette.map(function (shade) {
            return '<button type="button" class="converter-shade-swatch' +
                (shade.step === 500 ? " is-selected" : "") +
                '" data-shade-hex="' + escapeHtml(shade.values.hex) +
                '" style="background:' + escapeHtml(shade.values.hex) +
                '; color:' + shade.textColor +
                '" aria-label="Use shade ' + shade.step + ', ' + escapeHtml(shade.values.hex) +
                '" title="' + shade.step + ' · ' + escapeHtml(shade.values.hex) + '">' +
                '<span>' + shade.step + '</span>' +
                '</button>';
        }).join("");

        if (shadeDetailGrid) {
            shadeDetailGrid.innerHTML = currentPalette.map(function (shade) {
                return '<button type="button" data-shade-hex="' + escapeHtml(shade.values.hex) + '">' +
                    '<span>' + shade.step + '</span>' +
                    '<code>' + escapeHtml(shade.values.hex) + '</code>' +
                    '</button>';
            }).join("");
        }
    }

    function renderExportPalette() {
        if (!exportPalette || !currentPalette.length) return;

        exportPalette.innerHTML = currentPalette.map(function (shade) {
            var value = getShadeValue(shade, currentExportFormat);
            return '<div class="converter-export-palette-row" style="background:' +
                escapeHtml(shade.values.hex) + '; color:' + shade.textColor + '">' +
                '<span>' + shade.step + '</span>' +
                '<code>' + escapeHtml(value) + '</code>' +
                '<button type="button" data-copy-shade="' + escapeHtml(value) +
                '" aria-label="Copy shade ' + shade.step + '">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                '</button>' +
                '</div>';
        }).join("");
    }

    function buildExportCode() {
        var prefix = sanitizePrefix(exportPrefixInput ? exportPrefixInput.value : "");
        var entries = currentPalette.map(function (shade) {
            return {
                step: shade.step,
                value: getShadeValue(shade, currentExportFormat)
            };
        });

        if (currentExportType === "tailwind-v4") {
            return ["@theme {", entries.map(function (entry) {
                return "  --color-" + prefix + "-" + entry.step + ": " + entry.value + ";";
            }).join("\n"), "}"].join("\n");
        }

        if (currentExportType === "tailwind-v3") {
            return [
                "module.exports = {",
                "  theme: {",
                "    extend: {",
                "      colors: {",
                '        "' + prefix + '": {',
                entries.map(function (entry) {
                    return '          ' + entry.step + ': "' + entry.value + '",';
                }).join("\n"),
                "        }",
                "      }",
                "    }",
                "  }",
                "};"
            ].join("\n");
        }

        if (currentExportType === "css-prefixes") {
            return [":root {", entries.map(function (entry) {
                return "  --" + prefix + "-" + entry.step + ": " + entry.value + ";";
            }).join("\n"), "}"].join("\n");
        }

        if (currentExportType === "codes") {
            return entries.map(function (entry) {
                return entry.value;
            }).join("\n");
        }

        return ['"' + prefix + '": {', entries.map(function (entry, index) {
            var comma = index === entries.length - 1 ? "" : ",";
            return '  ' + entry.step + ': "' + entry.value + '"' + comma;
        }).join("\n"), "}"].join("\n");
    }

    function getExportTypeLabel() {
        var labels = {
            "tailwind-v4": "Tailwind v4",
            "tailwind-v3": "Tailwind v3",
            "figma": "Figma",
            "css-prefixes": "CSS prefixes",
            "codes": "Just the codes"
        };

        return labels[currentExportType] || "Figma";
    }

    function escapePdfText(value) {
        return String(value || "")
            .replace(/\\/g, "\\\\")
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)")
            .replace(/[\r\n]+/g, " ");
    }

    function pdfColor(rgb) {
        return formatNumber(rgb.r / 255, 3) + " " +
            formatNumber(rgb.g / 255, 3) + " " +
            formatNumber(rgb.b / 255, 3) + " rg\n";
    }

    function pdfRect(x, y, width, height, rgb) {
        return pdfColor(rgb) + x + " " + y + " " + width + " " + height + " re f\n";
    }

    function pdfText(x, y, size, value, font, rgb) {
        return pdfColor(rgb || { r: 255, g: 255, b: 255 }) +
            "BT /" + (font || "F1") + " " + size + " Tf " +
            x + " " + y + " Td (" + escapePdfText(value) + ") Tj ET\n";
    }

    function wrapPdfLine(value, maxLength) {
        var text = String(value || "");
        var lines = [];

        if (!text) return [""];

        while (text.length > maxLength) {
            lines.push(text.slice(0, maxLength));
            text = text.slice(maxLength);
        }

        lines.push(text);
        return lines;
    }

    function buildPdfBlob(content) {
        var objects = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
            "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
            "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
            "6 0 obj\n<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\nendobj\n"
        ];
        var pdf = "%PDF-1.4\n";
        var offsets = [0];

        objects.forEach(function (object) {
            offsets.push(pdf.length);
            pdf += object;
        });

        var xrefOffset = pdf.length;
        pdf += "xref\n0 " + (objects.length + 1) + "\n";
        pdf += "0000000000 65535 f \n";

        for (var index = 1; index < offsets.length; index += 1) {
            pdf += String(offsets[index]).padStart(10, "0") + " 00000 n \n";
        }

        pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\n";
        pdf += "startxref\n" + xrefOffset + "\n%%EOF";

        return new Blob([pdf], { type: "application/pdf" });
    }

    function buildColorSheetPdfBlob() {
        if (!currentPalette.length) {
            convert(input.value, false);
        }

        var margin = 42;
        var content = "";
        var text = { r: 246, g: 246, b: 246 };
        var muted = { r: 150, g: 150, b: 150 };
        var panel = { r: 22, g: 22, b: 22 };
        var panelSoft = { r: 29, g: 29, b: 29 };
        var baseHex = currentRgb ? rgbToHex(currentRgb) : input.value;
        var prefix = sanitizePrefix(exportPrefixInput ? exportPrefixInput.value : "");
        var codeLines = [];

        buildExportCode().split("\n").forEach(function (line) {
            codeLines = codeLines.concat(wrapPdfLine(line, 82));
        });

        content += pdfRect(0, 0, 612, 792, { r: 8, g: 8, b: 8 });
        content += pdfText(margin, 744, 24, "Design Wallet Color Sheet", "F1", text);
        content += pdfText(margin, 720, 9, "BASE " + baseHex + "  |  PREFIX " + prefix + "  |  " + getExportTypeLabel() + " / " + currentExportFormat.toUpperCase(), "F2", muted);

        content += pdfRect(margin, 676, 528, 34, panel);
        content += pdfText(84, 688, 8, "STEP", "F2", muted);
        content += pdfText(124, 688, 8, "HEX", "F2", muted);
        content += pdfText(194, 688, 8, "RGB", "F2", muted);
        content += pdfText(318, 688, 8, "HSL", "F2", muted);
        content += pdfText(448, 688, 8, "OKLCH", "F2", muted);

        currentPalette.forEach(function (shade, index) {
            var y = 646 - (index * 28);
            content += pdfRect(margin, y - 8, 528, 24, index % 2 ? panel : panelSoft);
            content += pdfRect(margin + 12, y - 3, 22, 14, shade.rgb);
            content += pdfText(84, y, 8, shade.step, "F2", text);
            content += pdfText(124, y, 8, shade.values.hex, "F2", text);
            content += pdfText(194, y, 8, shade.values.rgb, "F2", text);
            content += pdfText(318, y, 8, shade.values.hsl, "F2", text);
            content += pdfText(448, y, 8, shade.values.oklch, "F2", text);
        });

        var codeTop = 314;
        var lineY = codeTop - 34;
        content += pdfText(margin, codeTop, 12, "Export code", "F1", text);
        content += pdfRect(margin, 48, 528, 246, panel);

        codeLines.forEach(function (line) {
            if (lineY < 64) return;
            content += pdfText(margin + 18, lineY, 8, line, "F2", text);
            lineY -= 11;
        });

        return buildPdfBlob(content);
    }

    function downloadColorSheetPdf() {
        if (typeof Blob === "undefined" || !window.URL || !window.URL.createObjectURL) {
            showToast("PDF export unavailable");
            return;
        }

        var blob = buildColorSheetPdfBlob();
        var link = document.createElement("a");
        var baseHex = currentRgb ? rgbToHex(currentRgb).replace("#", "").toLowerCase() : "color";
        link.href = window.URL.createObjectURL(blob);
        link.download = "design-wallet-color-sheet-" + baseHex + ".pdf";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.setTimeout(function () {
            window.URL.revokeObjectURL(link.href);
        }, 500);

        showToast("PDF downloaded");
    }

    function renderExportCode() {
        if (!exportCodeOutput) return;
        renderExportPalette();
        exportCodeOutput.textContent = buildExportCode();
    }

    function renderPalette(rgb) {
        currentRgb = rgb;
        currentPalette = generatePalette(rgb);
        renderShadeStrip();
        renderExportCode();
    }

    function setError(message) {
        if (!error) return;
        error.textContent = message || "";
        error.hidden = !message;
    }

    function setCopyText(element, value) {
        if (!element) return;
        element.textContent = value;
    }

    function renderColor(rgb) {
        var values = getFormattedValues(rgb);

        setCopyText(outputs.hex, values.hex);
        setCopyText(outputs.rgb, values.rgb);
        setCopyText(outputs.hsl, values.hsl);
        setCopyText(outputs.hsv, values.hsv);
        setCopyText(outputs.oklch, values.oklch);
        setCopyText(outputs.cmyk, values.cmyk);

        setCopyText(outputs.css, [
            "--dw-color: " + values.hex + ";",
            "--dw-color-rgb: " + values.rgbRaw + ";",
            "--dw-color-hsl: " + values.hslRaw + ";",
            "--dw-color-oklch: " + values.oklchRaw + ";",
            "color: " + values.hex + ";",
            "background-color: rgb(var(--dw-color-rgb));"
        ].join("\n"));

        updateColorControls(rgb);
        document.body.style.setProperty("--converter-active-color", values.hex);
        document.body.style.setProperty("--converter-active-color-rgb", values.rgbRaw);
        renderPalette(rgb);
        setError("");
    }

    function convert(value, shouldNormalizeInput) {
        var parsed = parseColor(value);

        if (!parsed) {
            setError("Use HEX, RGB, HSL, HSV, or CMYK.");
            return false;
        }

        renderColor(parsed);

        if (shouldNormalizeInput) {
            input.value = rgbToHex(parsed);
        }

        return true;
    }

    function showToast(message) {
        if (!toast) return;
        clearTimeout(toastTimer);
        toast.textContent = message || "Copied";
        toast.hidden = false;
        toastTimer = window.setTimeout(function () {
            toast.hidden = true;
        }, 1600);
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }

        var textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand("copy");
            document.body.removeChild(textarea);
            return Promise.resolve();
        } catch (error) {
            document.body.removeChild(textarea);
            return Promise.reject(error);
        }
    }

    function showCopiedState(button) {
        if (!button) return;

        if (!button.dataset.copyDefaultHtml) {
            button.dataset.copyDefaultHtml = button.innerHTML;
        }

        window.clearTimeout(Number(button.dataset.copyResetTimer || 0));
        button.classList.add("is-copied");
        button.textContent = "copied!";

        var timer = window.setTimeout(function () {
            button.classList.remove("is-copied");
            button.innerHTML = button.dataset.copyDefaultHtml;
            delete button.dataset.copyResetTimer;
        }, 1400);

        button.dataset.copyResetTimer = String(timer);
    }

    function openExportModal() {
        if (!exportModal) return;

        if (!currentPalette.length) {
            convert(input.value, false);
        }

        previousModalFocus = document.activeElement;
        renderExportCode();
        exportModal.hidden = false;
        document.body.classList.add("converter-export-open");

        window.setTimeout(function () {
            if (exportDownloadButton) exportDownloadButton.focus();
        }, 30);
    }

    function closeExportModal() {
        if (!exportModal) return;
        exportModal.hidden = true;
        document.body.classList.remove("converter-export-open");

        if (previousModalFocus && typeof previousModalFocus.focus === "function") {
            previousModalFocus.focus();
        }
    }

    function setExportType(type) {
        currentExportType = type || "figma";
        document.querySelectorAll("[data-export-type]").forEach(function (button) {
            button.classList.toggle("is-active", button.getAttribute("data-export-type") === currentExportType);
        });
        renderExportCode();
    }

    function setExportFormat(format) {
        currentExportFormat = format || "hex";
        document.querySelectorAll("[data-export-format]").forEach(function (button) {
            button.classList.toggle("is-active", button.getAttribute("data-export-format") === currentExportFormat);
        });
        renderExportCode();
    }

    function updateColorFromPlaneEvent(event) {
        if (!colorPlane) return;

        var rect = colorPlane.getBoundingClientRect();
        var saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100;
        var value = (1 - clamp((event.clientY - rect.top) / rect.height, 0, 1)) * 100;
        setColorFromRgb(hsvToRgb(currentPickerHsv.h, saturation, value));
    }

    function updateColorFromHueEvent(event) {
        if (!hueSlider) return;

        var rect = hueSlider.getBoundingClientRect();
        var huePosition = clamp((event.clientX - rect.left) / rect.width, 0, 0.999);
        var hue = huePosition * 360;
        setColorFromRgb(hsvToRgb(hue, currentPickerHsv.s, currentPickerHsv.v));
    }

    function bindPointerDrag(element, onMove) {
        if (!element) return;

        element.addEventListener("pointerdown", function (event) {
            event.preventDefault();
            element.setPointerCapture(event.pointerId);
            onMove(event);
        });

        element.addEventListener("pointermove", function (event) {
            if (!element.hasPointerCapture(event.pointerId)) return;
            event.preventDefault();
            onMove(event);
        });
    }

    function handleColorPlaneKeydown(event) {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;

        event.preventDefault();
        var amount = event.shiftKey ? 5 : 1;
        var saturation = currentPickerHsv.s;
        var value = currentPickerHsv.v;

        if (event.key === "ArrowLeft") saturation -= amount;
        if (event.key === "ArrowRight") saturation += amount;
        if (event.key === "ArrowDown") value -= amount;
        if (event.key === "ArrowUp") value += amount;

        setColorFromRgb(hsvToRgb(currentPickerHsv.h, clamp(saturation, 0, 100), clamp(value, 0, 100)));
    }

    function handleHueKeydown(event) {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;

        event.preventDefault();
        var amount = event.shiftKey ? 15 : 1;
        var hue = currentPickerHsv.h;

        if (event.key === "ArrowLeft" || event.key === "ArrowDown") hue -= amount;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") hue += amount;
        if (event.key === "Home") hue = 0;
        if (event.key === "End") hue = 359.6;

        setColorFromRgb(hsvToRgb(normalizeHue(hue), currentPickerHsv.s, currentPickerHsv.v));
    }

    input.addEventListener("input", function () {
        convert(input.value, false);
    });

    if (convertButton) {
        convertButton.addEventListener("click", function () {
            convert(input.value, true);
        });
    }

    bindPointerDrag(colorPlane, updateColorFromPlaneEvent);
    bindPointerDrag(hueSlider, updateColorFromHueEvent);

    if (colorPlane) {
        colorPlane.addEventListener("keydown", handleColorPlaneKeydown);
    }

    if (hueSlider) {
        hueSlider.addEventListener("keydown", handleHueKeydown);
    }

    if (randomButton) {
        randomButton.addEventListener("click", function () {
            var next = {
                r: Math.floor(Math.random() * 256),
                g: Math.floor(Math.random() * 256),
                b: Math.floor(Math.random() * 256)
            };
            input.value = rgbToHex(next);
            renderColor(next);
        });
    }

    if (resetButton) {
        resetButton.addEventListener("click", function () {
            input.value = DEFAULT_COLOR;
            convert(DEFAULT_COLOR, false);
            input.focus();
        });
    }

    if (shadeStrip) {
        shadeStrip.addEventListener("click", function (event) {
            var shadeButton = event.target.closest("[data-shade-hex]");
            if (!shadeButton) return;
            var hex = shadeButton.getAttribute("data-shade-hex");
            input.value = hex;
            convert(hex, false);
        });
    }

    if (shadeDetailGrid) {
        shadeDetailGrid.addEventListener("click", function (event) {
            var shadeButton = event.target.closest("[data-shade-hex]");
            if (!shadeButton) return;
            var hex = shadeButton.getAttribute("data-shade-hex");
            input.value = hex;
            convert(hex, false);
        });
    }

    if (shadeDetailToggle && shadeDetailGrid) {
        shadeDetailToggle.addEventListener("click", function () {
            var isOpening = shadeDetailGrid.hidden;
            shadeDetailGrid.hidden = !isOpening;
            shadeDetailToggle.setAttribute("aria-expanded", String(isOpening));
            shadeDetailToggle.classList.toggle("is-active", isOpening);
        });
    }

    if (exportButton) {
        exportButton.addEventListener("click", openExportModal);
    }

    if (exportDownloadButton) {
        exportDownloadButton.addEventListener("click", downloadColorSheetPdf);
    }

    document.querySelectorAll("[data-export-close]").forEach(function (button) {
        button.addEventListener("click", closeExportModal);
    });

    document.querySelectorAll("[data-export-type]").forEach(function (button) {
        button.addEventListener("click", function () {
            setExportType(button.getAttribute("data-export-type"));
        });
    });

    document.querySelectorAll("[data-export-format]").forEach(function (button) {
        button.addEventListener("click", function () {
            setExportFormat(button.getAttribute("data-export-format"));
        });
    });

    if (exportPrefixInput) {
        exportPrefixInput.addEventListener("input", renderExportCode);
    }

    if (exportPalette) {
        exportPalette.addEventListener("click", function (event) {
            var copyButton = event.target.closest("[data-copy-shade]");
            if (!copyButton) return;
            copyText(copyButton.getAttribute("data-copy-shade")).then(function () {
                showCopiedState(copyButton);
                showToast("Copied shade");
            }).catch(function () {
                showToast("Copy failed");
            });
        });
    }

    if (exportCopyButton) {
        exportCopyButton.addEventListener("click", function () {
            var value = exportCodeOutput ? exportCodeOutput.textContent.trim() : "";
            if (!value) return;
            copyText(value).then(function () {
                showToast("Copied codes");
            }).catch(function () {
                showToast("Copy failed");
            });
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && exportModal && !exportModal.hidden) {
            closeExportModal();
        }
    });

    document.querySelectorAll("[data-copy-target]").forEach(function (button) {
        button.addEventListener("click", function () {
            var target = document.getElementById(button.getAttribute("data-copy-target"));
            var value = target ? target.textContent.trim() : "";
            if (!value) return;

            copyText(value).then(function () {
                showCopiedState(button);
                showToast("Copied");
            }).catch(function () {
                showToast("Copy failed");
            });
        });
    });

    convert(DEFAULT_COLOR, false);
});
