/* Website Brandkit Generator.

   A page here cannot read another site's HTML or CSS, so the text is fetched by
   a relay (supabase/functions/brandkit-fetch). Everything after that — finding
   the colours, finding the fonts — happens in this file, in the browser.

   Honest limits, on purpose: this reads what the site's CSS and HTML DECLARE.
   It does not run the site's JavaScript, so a page that paints itself entirely
   from script or images yields little, and the palette is a ranked guess at the
   brand, not a measurement of pixels. */

(function () {
    "use strict";

    // Same publishable key the catalogue uses; it can only reach public functions.
    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
    var IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var RELAY = IS_LOCAL ? "http://localhost:8787/" : SUPABASE_URL + "/functions/v1/brandkit-fetch";

    var PALETTE_SIZE = 5;
    // Big sites split their CSS into dozens of small files (linear.app: 48, with the
    // font tokens in the 36th), so the cap is generous and the fetch is pooled.
    var MAX_STYLESHEETS = 60;
    var FETCH_POOL = 8;
    var RELAY_TIMEOUT_MS = 15000;
    var BYTES_TIMEOUT_MS = 25000;

    // Design assets. Every one found goes in the zip; the widget shows a handful.
    var MAX_ASSETS = 40;     // collected for the download
    var PROBE_COUNT = 40;    // tried in the browser, to find ones that actually load
    var MAX_ICON_TILES = 3;  // anonymous UI icons crowd out everything else if left unchecked
    var SHOW_ASSETS = 10;    // tiles in the widget
    var MAX_FONT_FILES = 14;
    var DOWNLOAD_POOL = 6;

    var app = document.getElementById("bk-app");
    var form = document.getElementById("bk-form");
    var input = document.getElementById("bk-url");
    var errorEl = document.getElementById("bk-error");
    var paletteEl = document.getElementById("bk-palette");
    var typeEl = document.getElementById("bk-type");
    var shotEl = document.getElementById("bk-shot");
    var previewEmptyEl = document.getElementById("bk-preview-empty");
    var previewFrameEl = document.getElementById("bk-preview");
    var downloadEl = document.getElementById("bk-download");
    var assetsEl = document.getElementById("bk-assets");
    var assetsCountEl = document.getElementById("bk-assets-count");
    var toastEl = document.getElementById("bk-toast");
    var scrollCueEl = document.getElementById("bk-scroll-cue");

    var state = { run: 0, host: "", colors: [], fonts: null, assets: [], bundle: null, busy: false };
    var toastTimer = 0;

    // ── Small helpers ───────────────────────────────────────────────────────

    function setPhase(phase) {
        app.setAttribute("data-phase", phase);
    }

    function showError(message) {
        errorEl.textContent = message || "";
        errorEl.hidden = !message;
    }

    function toast(message) {
        toastEl.textContent = message;
        toastEl.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 1600);
    }

    function normalizeUrl(raw) {
        var text = String(raw || "").trim();
        if (!text) return null;
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "https://" + text;
        var url;
        try { url = new URL(text); } catch (e) { return null; }
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (url.hostname.indexOf(".") === -1) return null;
        return url;
    }

    function absolute(href, base) {
        try { return new URL(href, base).href; } catch (e) { return ""; }
    }

    // ── Fetching ────────────────────────────────────────────────────────────

    function relayGet(url) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, RELAY_TIMEOUT_MS);
        return fetch(RELAY + "?url=" + encodeURIComponent(url), {
            headers: { apikey: SUPABASE_KEY },
            signal: controller.signal
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok || data.error) throw new Error(data.error || "Could not fetch that link.");
                return data;
            });
        }, function () {
            throw new Error("Could not reach the fetcher. Check your connection and try again.");
        }).then(function (data) {
            clearTimeout(timer);
            return data;
        }, function (err) {
            clearTimeout(timer);
            throw err;
        });
    }

    // The same relay in raw mode: bytes in, a Blob out. Used only for the download.
    // `asFont` asks the relay to turn a web font (.woff / .woff2) back into the
    // installable .ttf / .otf inside it. Without it the bytes come back as served.
    function relayBytes(url, asFont) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, BYTES_TIMEOUT_MS);
        return fetch(RELAY + "?url=" + encodeURIComponent(url) + "&raw=1" + (asFont ? "&font=sfnt" : ""), {
            headers: { apikey: SUPABASE_KEY },
            signal: controller.signal
        }).then(function (res) {
            if (res.ok) return res.blob();
            return res.json().catch(function () { return {}; }).then(function (data) {
                throw new Error(data.error || "Could not fetch that file.");
            });
        }).then(function (blob) {
            clearTimeout(timer);
            return blob;
        }, function (err) {
            clearTimeout(timer);
            throw err;
        });
    }

    // Run `worker` over `items`, a few at a time, keeping order. A failure becomes
    // null rather than rejecting, so one dead file cannot sink the whole kit.
    function pool(items, limit, worker) {
        var results = new Array(items.length);
        var next = 0;
        function lane() {
            var i = next++;
            if (i >= items.length) return Promise.resolve();
            return Promise.resolve().then(function () { return worker(items[i], i); }).then(function (r) {
                results[i] = r;
            }, function () { results[i] = null; }).then(lane);
        }
        var lanes = [];
        for (var l = 0; l < Math.min(limit, items.length); l++) lanes.push(lane());
        return Promise.all(lanes).then(function () { return results; });
    }

    // ── Colour ──────────────────────────────────────────────────────────────

    var colorCanvas = document.createElement("canvas");
    colorCanvas.width = colorCanvas.height = 1;
    var colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });
    var colorCache = {};

    function hex2(n) { return (n < 16 ? "0" : "") + n.toString(16); }

    // Any CSS colour -> [r, g, b, a], or null. Hex is parsed by hand so it stays
    // exact; everything else (rgb, hsl, oklch, lab, color()) goes through the
    // canvas, which is the browser's own colour parser.
    function toRGBA(token) {
        var key = token.toLowerCase();
        if (colorCache.hasOwnProperty(key)) return colorCache[key];
        var out = null;
        var m = /^#([0-9a-f]{3,8})$/.exec(key);
        if (m) {
            var h = m[1];
            if (h.length === 3 || h.length === 4) {
                h = h.split("").map(function (c) { return c + c; }).join("");
            }
            if (h.length === 6 || h.length === 8) {
                out = [
                    parseInt(h.slice(0, 2), 16),
                    parseInt(h.slice(2, 4), 16),
                    parseInt(h.slice(4, 6), 16),
                    h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
                ];
            }
        } else if (colorCtx) {
            var sentinel = "#010203";
            colorCtx.fillStyle = sentinel;
            colorCtx.fillStyle = key;
            if (colorCtx.fillStyle !== sentinel) {
                colorCtx.clearRect(0, 0, 1, 1);
                colorCtx.fillRect(0, 0, 1, 1);
                var d = colorCtx.getImageData(0, 0, 1, 1).data;
                out = [d[0], d[1], d[2], d[3] / 255];
            }
        }
        colorCache[key] = out;
        return out;
    }

    function toHex(rgb) {
        return ("#" + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2])).toUpperCase();
    }

    function luminance(rgb) {
        var c = rgb.slice(0, 3).map(function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    // Black or white ink, whichever reads better on this colour.
    function inkFor(rgb) {
        return luminance(rgb) > 0.4 ? "#000000" : "#ffffff";
    }

    function isNeutral(rgb) {
        return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) < 28;
    }

    var COLOR_TOKEN = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi;
    var COLOR_PROPS = /^(?:color|background|background-color|background-image|fill|stroke|stop-color|accent-color|caret-color|outline|outline-color|text-decoration-color|border(?:-(?:top|right|bottom|left))?(?:-color)?)$/;
    var BRAND_VAR = /primary|brand|accent|main|theme|secondary|tertiary|highlight|cta/i;
    var SURFACE_VAR = /background|surface|foreground|\bbg\b|-bg|ink|text/i;

    // ── Parsing the CSS ─────────────────────────────────────────────────────

    // One flat list of style rules and @font-face rules across every sheet.
    function parseSheets(sources) {
        var bundle = { rules: [], faces: [], vars: {} };

        function walk(rules, base) {
            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                if (rule.type === 1) {
                    bundle.rules.push({ selector: rule.selectorText || "", style: rule.style, base: base });
                    if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules, base);
                } else if (rule.type === 5) {
                    bundle.faces.push({
                        family: rule.style.getPropertyValue("font-family"),
                        src: rule.style.getPropertyValue("src"),
                        weight: rule.style.getPropertyValue("font-weight"),
                        style: rule.style.getPropertyValue("font-style"),
                        base: base
                    });
                } else if (rule.cssRules) {
                    walk(rule.cssRules, base); // @media, @supports, @layer
                }
            }
        }

        sources.forEach(function (source) {
            try {
                var sheet = new CSSStyleSheet();
                sheet.replaceSync(source.text);
                walk(sheet.cssRules, source.base);
            } catch (e) { /* one unreadable sheet should not sink the rest */ }
        });

        // Custom properties. :root / html / body win; a component-level override
        // only fills a name nothing global defined.
        var rootish = /^(?::root|html|body|\*)$/;
        bundle.rules.forEach(function (r) {
            var global = r.selector.split(",").some(function (s) { return rootish.test(s.trim()); });
            for (var i = 0; i < r.style.length; i++) {
                var name = r.style[i];
                if (name.indexOf("--") !== 0) continue;
                if (global || !bundle.vars.hasOwnProperty(name)) {
                    bundle.vars[name] = r.style.getPropertyValue(name).trim();
                }
            }
        });
        return bundle;
    }

    function resolveVars(value, vars, depth) {
        if (!value || value.indexOf("var(") === -1 || (depth || 0) > 5) return value;
        var out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, function (all, name, fallback) {
            if (vars.hasOwnProperty(name)) return vars[name];
            return fallback !== undefined ? fallback : "";
        });
        return out === value ? out : resolveVars(out, vars, (depth || 0) + 1);
    }

    // ── Palette ─────────────────────────────────────────────────────────────

    function extractPalette(doc, bundle) {
        var tally = {}; // "#RRGGBB" -> weight

        function add(token, weight) {
            var rgba = toRGBA(token);
            if (!rgba || rgba[3] < 0.5) return; // a translucent overlay is not a brand colour
            var key = toHex(rgba);
            tally[key] = (tally[key] || 0) + weight;
        }

        function addFrom(value, weight) {
            if (!value) return;
            var found = value.match(COLOR_TOKEN);
            if (found) found.forEach(function (t) { add(t, weight); });
        }

        bundle.rules.forEach(function (r) {
            if (/scrollbar|::selection|placeholder/.test(r.selector)) return;
            var interactive = /:(hover|focus|active|disabled)/.test(r.selector) ? 0.5 : 1;
            var globalSurface = r.selector.split(",").some(function (s) {
                return /^(?::root|html|body)$/.test(s.trim());
            });
            for (var i = 0; i < r.style.length; i++) {
                var prop = r.style[i];
                var isVar = prop.indexOf("--") === 0;
                if (!isVar && !COLOR_PROPS.test(prop)) continue;
                var value = resolveVars(r.style.getPropertyValue(prop), bundle.vars);
                var weight = isVar ? 2 : (/^border|^outline/.test(prop) ? 0.6 : 1.5);
                if (isVar && BRAND_VAR.test(prop)) weight *= 4;
                else if (isVar && SURFACE_VAR.test(prop)) weight *= 2;
                if (globalSurface && /^(?:color|background|background-color)$/.test(prop)) weight += 12;
                addFrom(value, weight * interactive);
            }
        });

        // What the HTML itself says: theme-color is the site naming its own brand.
        doc.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { addFrom(m.getAttribute("content"), 12); });
        doc.querySelectorAll('meta[name="msapplication-TileColor"]').forEach(function (m) { addFrom(m.getAttribute("content"), 6); });
        doc.querySelectorAll("[style]").forEach(function (el) { addFrom(el.getAttribute("style"), 1); });
        doc.querySelectorAll("[fill], [stop-color], [stroke]").forEach(function (el) {
            addFrom(el.getAttribute("fill"), 0.6);
            addFrom(el.getAttribute("stop-color"), 0.6);
            addFrom(el.getAttribute("stroke"), 0.4);
        });

        return pickPalette(tally);
    }

    // Merge near-duplicates, then choose: a dark and a light neutral (the
    // canvas and the ink) plus the strongest chromatic colours.
    function pickPalette(tally) {
        var clusters = [];
        Object.keys(tally)
            .map(function (hex) { return { hex: hex, rgb: toRGBA(hex), weight: tally[hex] }; })
            .sort(function (a, b) { return b.weight - a.weight; })
            .forEach(function (c) {
                for (var i = 0; i < clusters.length; i++) {
                    var k = clusters[i].rgb;
                    var dist = Math.sqrt(
                        Math.pow(k[0] - c.rgb[0], 2) + Math.pow(k[1] - c.rgb[1], 2) + Math.pow(k[2] - c.rgb[2], 2)
                    );
                    if (dist < 30) { clusters[i].weight += c.weight; return; }
                }
                clusters.push({ hex: c.hex, rgb: c.rgb, weight: c.weight });
            });

        var chromatic = clusters.filter(function (c) { return !isNeutral(c.rgb); });
        var neutrals = clusters.filter(function (c) { return isNeutral(c.rgb); });
        chromatic.sort(function (a, b) { return b.weight - a.weight; });
        neutrals.sort(function (a, b) { return b.weight - a.weight; });

        var topChromatic = chromatic.length ? chromatic[0].weight : 0;
        var floor = topChromatic * 0.15;
        var dark = neutrals.filter(function (c) { return luminance(c.rgb) < 0.2 && c.weight >= floor; })[0];
        var light = neutrals.filter(function (c) { return luminance(c.rgb) >= 0.2 && c.weight >= floor; })[0];
        var anchors = [dark, light].filter(Boolean);

        var picked = chromatic.slice(0, Math.max(0, PALETTE_SIZE - anchors.length));
        picked = picked.concat(anchors);
        if (picked.length < PALETTE_SIZE) {
            neutrals.forEach(function (c) {
                if (picked.length < PALETTE_SIZE && picked.indexOf(c) === -1) picked.push(c);
            });
        }
        return picked.map(function (c) { return c.hex; });
    }

    // ── Fonts ───────────────────────────────────────────────────────────────

    var GENERIC_FONT = /^(?:-apple-system|blinkmacsystemfont|system-ui|ui-[\w-]+|segoe ui|sans-serif|serif|monospace|cursive|fantasy|emoji|math|fangsong|inherit|initial|unset|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji)$/i;

    function splitFamilies(value) {
        var out = [];
        var current = "";
        var quote = "";
        for (var i = 0; i < value.length; i++) {
            var ch = value.charAt(i);
            if (quote) {
                if (ch === quote) quote = ""; else current += ch;
            } else if (ch === '"' || ch === "'") {
                quote = ch;
            } else if (ch === ",") {
                out.push(current); current = "";
            } else {
                current += ch;
            }
        }
        out.push(current);
        return out.map(function (s) { return s.trim(); }).filter(Boolean);
    }

    // next/font ships "__Inter_a1b2c3d4" and "__Inter_Fallback_a1b2c3d4"; Framer
    // ships "Inter Placeholder". None of those are the font a designer would name.
    function cleanFamily(name) {
        var next = /^__(.+?)_([0-9a-f]{6,})$/i.exec(name);
        if (next) name = next[1].replace(/_/g, " ");
        if (/fallback|placeholder/i.test(name)) return "";
        return name.replace(/^["']|["']$/g, "").trim();
    }

    function pickFamily(value) {
        if (!value) return "";
        var names = splitFamilies(value).map(cleanFamily).filter(Boolean);
        for (var i = 0; i < names.length; i++) {
            if (!GENERIC_FONT.test(names[i])) return names[i];
        }
        return "";
    }

    function familyOfStyle(style, vars) {
        var value = style.getPropertyValue("font-family");
        if (!value) {
            // `font: 300 16px/1.5 var(--x)` hides the family inside the shorthand.
            var shorthand = style.getPropertyValue("font");
            var m = /(?:\d*\.?\d+(?:px|rem|em|pt|%)|(?:x-)?(?:small|large)|medium)(?:\s*\/\s*[\w.%]+)?\s+(.+)$/i.exec(shorthand || "");
            value = m ? m[1] : "";
        }
        return pickFamily(resolveVars(value, vars));
    }

    // The last-resort scoring, for pages with no <h1> or <p> in their static HTML
    // (single-page apps). BARE tag selectors only: ".blog-content p" is a rule for
    // one corner of a site, and letting it stand in for the whole site's body
    // font is how designwallet.in once came back as "Georgia".
    var HEADING_SCORE = [[/^h1$/i, 10], [/^h2$/i, 8], [/^h3$/i, 6]];
    var BODY_SCORE = [[/^(?:body )?p$/i, 10], [/^body$/i, 8], [/^html$/i, 6], [/^:root$/i, 4], [/^\*$/, 2]];

    function scoreSelector(selector, table) {
        var best = 0;
        selector.split(",").forEach(function (part) {
            part = part.trim();
            table.forEach(function (row) { if (row[0].test(part)) best = Math.max(best, row[1]); });
        });
        return best;
    }

    function fontByTag(bundle, table) {
        var best = { score: 0, family: "" };
        bundle.rules.forEach(function (r) {
            var score = scoreSelector(r.selector, table);
            if (!score) return;
            var family = familyOfStyle(r.style, bundle.vars);
            if (family && score >= best.score) best = { score: score, family: family };
        });
        return best.family;
    }

    // Rough CSS specificity, enough to rank two rules that both match an element.
    function specificity(selector) {
        var ids = (selector.match(/#[\w-]+/g) || []).length;
        var classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:[a-z-]+/gi) || []).length;
        var tags = (selector.replace(/\.[\w-]+|#[\w-]+|\[[^\]]*\]|:[a-z-]+/gi, " ").match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length;
        return ids * 10000 + classes * 100 + tags;
    }

    // What the cascade says this very element uses: its own rules, else its
    // nearest ancestor's (font-family inherits). Rules are matched against the
    // real parsed document, so a selector scoped to some other part of the site
    // simply does not match.
    function fontOfElement(el, bundle) {
        if (!el) return "";
        if (!bundle.fontRules) {
            bundle.fontRules = bundle.rules.map(function (r, order) {
                var family = familyOfStyle(r.style, bundle.vars);
                return family ? { selectors: r.selector.split(","), family: family, order: order } : null;
            }).filter(Boolean);
        }
        for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
            var inline = node.getAttribute("style");
            var m = inline && /font-family\s*:\s*([^;]+)/i.exec(inline);
            if (m && pickFamily(resolveVars(m[1], bundle.vars))) return pickFamily(resolveVars(m[1], bundle.vars));

            var best = null;
            for (var i = 0; i < bundle.fontRules.length; i++) {
                var rule = bundle.fontRules[i];
                for (var j = 0; j < rule.selectors.length; j++) {
                    var sel = rule.selectors[j].trim();
                    if (!sel || /::|:(?:hover|focus|active|visited|disabled|checked)/.test(sel)) continue;
                    var hit = false;
                    try { hit = node.matches(sel); } catch (e) { /* a selector the parser rejects */ }
                    if (!hit) continue;
                    var spec = specificity(sel);
                    if (!best || spec > best.spec || (spec === best.spec && rule.order > best.order)) {
                        best = { spec: spec, order: rule.order, family: rule.family };
                    }
                }
            }
            if (best) return best.family;
        }
        return "";
    }

    function googleFontHints(doc) {
        var names = [];
        doc.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach(function (link) {
            var href = link.getAttribute("href") || "";
            var re = /family=([^:&]+)/g;
            var m;
            while ((m = re.exec(href))) {
                var name = decodeURIComponent(m[1].replace(/\+/g, " "));
                if (names.indexOf(name) === -1) names.push(name);
            }
        });
        return names;
    }

    function extractFonts(doc, bundle) {
        var hints = googleFontHints(doc);

        var h = doc.querySelector("h1") || doc.querySelector("h2");
        var paragraph = Array.prototype.filter.call(doc.querySelectorAll("p"), function (p) {
            return p.textContent.trim().length > 40;
        })[0] || doc.querySelector("p");

        var primary = fontOfElement(h, bundle) || fontByTag(bundle, HEADING_SCORE) || hints[0] || "";
        var body = fontOfElement(paragraph, bundle) || fontOfElement(doc.body, bundle) ||
            fontByTag(bundle, BODY_SCORE) || hints[1] || hints[0] || "";

        return { primary: primary || body, paragraph: body || primary };
    }

    // Load a family so it can be shown in its own style. Google Fonts first (it
    // covers most of the web), then the site's own @font-face files, else give
    // up honestly and let the caller say the preview is a stand-in.
    var fontJobs = {};

    function ensureFont(name, bundle) {
        if (!name) return Promise.resolve({ css: "", real: false });
        if (fontJobs[name]) return fontJobs[name];

        var job = loadFromGoogle(name).then(function (ok) {
            if (ok) return { css: '"' + name + '"', real: true };
            return loadFromSite(name, bundle).then(function (alias) {
                return alias ? { css: '"' + alias + '"', real: true } : { css: '"' + name + '"', real: false };
            });
        });
        fontJobs[name] = job;
        return job;
    }

    function loadStylesheet(href) {
        return new Promise(function (resolve) {
            var link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.onload = function () { resolve(true); };
            link.onerror = function () { link.remove(); resolve(false); };
            document.head.appendChild(link);
        });
    }

    function fontLoaded(family) {
        return document.fonts.load('48px "' + family + '"').then(function (faces) {
            return faces.length > 0;
        }, function () { return false; });
    }

    function loadFromGoogle(name) {
        var q = encodeURIComponent(name).replace(/%20/g, "+");
        var base = "https://fonts.googleapis.com/css2?family=" + q;
        // Ask for weights first; a family without them 400s, so retry plain.
        return loadStylesheet(base + ":wght@300;400;500;600;700&display=swap").then(function (ok) {
            return ok || loadStylesheet(base + "&display=swap");
        }).then(function (ok) {
            return ok ? fontLoaded(name) : false;
        });
    }

    // Show the site's own font in the specimen. A browser may not load another
    // origin's font file (no CORS header — Stripe's, for one), but the relay can
    // fetch it, so try the direct URL first and the relay's copy second.
    function loadFromSite(name, bundle) {
        var wanted = name.toLowerCase();
        var faces = (bundle ? bundle.faces : []).filter(function (f) {
            return cleanFamily(splitFamilies(f.family)[0] || "").toLowerCase() === wanted;
        });
        if (!faces.length) return Promise.resolve("");

        function inject(alias, srcFor) {
            var css = faces.map(function (f, i) {
                var src = srcFor(f, i);
                if (!src) return "";
                return '@font-face{font-family:"' + alias + '";src:' + src + ";" +
                    (f.weight ? "font-weight:" + f.weight + ";" : "") +
                    (f.style ? "font-style:" + f.style + ";" : "") + "font-display:swap}";
            }).join("\n");
            var tag = document.createElement("style");
            tag.textContent = css;
            document.head.appendChild(tag);
            return tag;
        }

        var direct = "BK " + name;
        var tag = inject(direct, function (f) {
            return f.src.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (all, q, href) {
                return href.indexOf("data:") === 0 ? all : 'url("' + absolute(href, f.base) + '")';
            });
        });
        return fontLoaded(direct).then(function (ok) {
            if (ok) return direct;
            tag.remove();
            return pool(faces, 4, function (f) {
                var best = bestFontSource(f.src, f.base);
                return best ? relayBytes(best.url).then(function (blob) { return URL.createObjectURL(blob); }) : null;
            }).then(function (urls) {
                var relayed = "BK " + name + " (relay)";
                inject(relayed, function (f, i) { return urls[i] ? 'url("' + urls[i] + '")' : ""; });
                return fontLoaded(relayed).then(function (loaded) { return loaded ? relayed : ""; });
            });
        });
    }

    // ── Design assets ───────────────────────────────────────────────────────

    var IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(?:$|[?#])/i;
    var NOISE = /pixel|analytics|doubleclick|facebook\.com\/tr|googletagmanager|beacon|1x1|spacer/i;
    var LOGOISH = /logo|brand|wordmark/i;
    var SVG_SHAPES = "path, circle, rect, polygon, polyline, line, ellipse, text, image";

    // next/image serves "/_next/image?url=%2Fhero.png&w=1200"; the real file is the url= part.
    function cleanAssetUrl(href, base) {
        var abs = absolute(href, base);
        if (!abs || !/^https?:/i.test(abs)) return "";
        try {
            var u = new URL(abs);
            if (/\/_next\/image$/.test(u.pathname) && u.searchParams.get("url")) {
                abs = absolute(u.searchParams.get("url"), u.href);
            }
        } catch (e) { return ""; }
        return /^https?:/i.test(abs) ? abs : "";
    }

    // "a.png 400w, b.png 800w" -> the biggest one.
    function bestOfSrcset(srcset) {
        var best = "";
        var bestSize = -1;
        String(srcset || "").split(",").forEach(function (part) {
            var bits = part.trim().split(/\s+/);
            if (!bits[0]) return;
            var size = parseFloat(bits[1]) || 1;
            if (size > bestSize) { bestSize = size; best = bits[0]; }
        });
        return best;
    }

    function assetType(url) {
        var m = IMAGE_EXT.exec(url);
        if (!m) return "";
        return m[1].toLowerCase().replace("jpeg", "jpg");
    }

    function extractAssets(doc, bundle, base) {
        var list = [];
        var seen = {};
        var order = 0;

        function push(item) {
            var key = item.url || item.svg;
            if (!key || seen[key]) return;
            seen[key] = true;
            item.order = order++;
            list.push(item);
        }
        function pushUrl(href, score, why) {
            var url = cleanAssetUrl(href, base);
            if (!url || NOISE.test(url)) return;
            push({ kind: "url", url: url, type: assetType(url), score: score, why: why });
        }

        // The site naming its own face: the social image and the app icons.
        doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(function (m) {
            pushUrl(m.getAttribute("content"), 90, "social");
        });
        var icons = doc.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"], link[rel="shortcut icon"]');
        Array.prototype.slice.call(icons, 0, 2).forEach(function (l) { pushUrl(l.getAttribute("href"), 72, "icon"); });

        doc.querySelectorAll("img").forEach(function (img) {
            var w = parseInt(img.getAttribute("width"), 10);
            var h = parseInt(img.getAttribute("height"), 10);
            if ((w && w <= 2) || (h && h <= 2)) return;
            var href = bestOfSrcset(img.getAttribute("srcset")) || img.getAttribute("src") ||
                img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || "";
            if (/^data:/i.test(href)) return;
            var logo = LOGOISH.test([img.getAttribute("alt"), img.getAttribute("class"), img.getAttribute("id"), href].join(" "));
            pushUrl(href, 50 + (logo ? 30 : 0), logo ? "logo" : "image");
        });
        doc.querySelectorAll("picture source[srcset]").forEach(function (src) {
            pushUrl(bestOfSrcset(src.getAttribute("srcset")), 45, "image");
        });

        // Inline <svg>: logos and icons that have no file of their own.
        doc.querySelectorAll("svg").forEach(function (svg) {
            if (svg.closest("[hidden]") || svg.querySelector("symbol") || !svg.querySelector(SVG_SHAPES)) return;
            var clone = svg.cloneNode(true);
            if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            var markup = clone.outerHTML;
            if (markup.length < 80 || markup.length > 120000) return;
            if (/<use[\s>]/i.test(markup) && !clone.querySelector("path, circle, rect")) return;
            // A logo is named like one, or is the link back to the home page. Merely
            // sitting in the header is not enough: that is where every chevron lives.
            var home = svg.closest("a");
            var logo = LOGOISH.test([svg.getAttribute("class"), svg.getAttribute("aria-label"), svg.getAttribute("id")].join(" ")) ||
                !!(home && svg.closest("header, nav") && /^(?:\/?|https?:\/\/[^/]+\/?)$/.test(home.getAttribute("href") || ""));

            // The same glyph is often repeated with only ids and classes changed.
            var signature = markup.replace(/\s(?:id|class|style|data-[\w-]+)="[^"]*"/g, "");
            if (seen["sig:" + signature]) return;
            seen["sig:" + signature] = true;
            push({ kind: "svg", svg: markup, type: "svg", score: 35 + (logo ? 55 : 0), why: logo ? "logo" : "icon" });
        });

        // Images the stylesheets paint: backgrounds, masks, list bullets.
        bundle.rules.forEach(function (r) {
            for (var i = 0; i < r.style.length; i++) {
                var prop = r.style[i];
                if (!/^(?:background|background-image|mask|mask-image|-webkit-mask-image|list-style-image|content)$/.test(prop)) continue;
                var value = resolveVars(r.style.getPropertyValue(prop), bundle.vars);
                var re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
                var m;
                while ((m = re.exec(value))) {
                    if (/^data:/i.test(m[2]) || !IMAGE_EXT.test(m[2])) continue;
                    var url = cleanAssetUrl(m[2], r.base);
                    if (url && !NOISE.test(url)) push({ kind: "url", url: url, type: assetType(url), score: 40, why: "background" });
                }
            }
        });

        list.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
        return list.slice(0, MAX_ASSETS);
    }

    function assetSrc(item) {
        return item.kind === "svg" ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(item.svg) : item.url;
    }

    // Which assets actually load in a browser? Hotlink protection and dead links
    // are common, and a blank tile is worse than none.
    function probeAsset(item) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.referrerPolicy = "no-referrer";
            var timer = setTimeout(function () { resolve(false); }, 8000);
            img.onload = function () {
                clearTimeout(timer);
                resolve(item.kind === "svg" || (img.naturalWidth > 8 && img.naturalHeight > 8));
            };
            img.onerror = function () { clearTimeout(timer); resolve(false); };
            img.src = assetSrc(item);
        });
    }

    // Best-ranked first, but at most a few bare icons: a page full of 24px UI
    // glyphs would otherwise fill every tile and hide the logos and pictures.
    function pickTiles(loaded) {
        var picked = [];
        var rest = [];
        var icons = 0;
        loaded.forEach(function (item) {
            var isIcon = item.kind === "svg" && item.why === "icon";
            if (picked.length < SHOW_ASSETS && (!isIcon || icons < MAX_ICON_TILES)) {
                picked.push(item);
                if (isIcon) icons++;
            } else {
                rest.push(item);
            }
        });
        return picked.concat(rest.slice(0, SHOW_ASSETS - picked.length));
    }

    // ── Font files ──────────────────────────────────────────────────────────

    var FONT_RANK = { woff2: 0, woff: 1, ttf: 2, otf: 3 };

    function fontExt(url, format) {
        var m = /\.(woff2|woff|ttf|otf)(?:$|[?#])/i.exec(url);
        if (m) return m[1].toLowerCase();
        var f = String(format || "").toLowerCase();
        return f === "truetype" ? "ttf" : f === "opentype" ? "otf" : FONT_RANK.hasOwnProperty(f) ? f : "";
    }

    // A face's `src` lists several formats of one font; keep the best single one.
    function bestFontSource(src, base) {
        var re = /url\(\s*(['"]?)([^'")]+)\1\s*\)(?:\s*format\(\s*['"]?([\w-]+)['"]?\s*\))?/g;
        var best = null;
        var m;
        while ((m = re.exec(src || ""))) {
            if (/^data:/i.test(m[2])) continue;
            var ext = fontExt(m[2], m[3]);
            if (!ext) continue;
            var url = absolute(m[2], base);
            if (url && (!best || FONT_RANK[ext] < FONT_RANK[best.ext])) best = { url: url, ext: ext };
        }
        return best;
    }

    function siteFontFiles(family, bundle) {
        var wanted = family.toLowerCase();
        var out = [];
        bundle.faces.forEach(function (f) {
            if (cleanFamily(splitFamilies(f.family)[0] || "").toLowerCase() !== wanted) return;
            var best = bestFontSource(f.src, f.base);
            if (best) out.push({ family: family, weight: f.weight || "400", style: f.style || "normal", url: best.url, ext: best.ext });
        });
        return out;
    }

    // A family the site pulls from Google Fonts has no @font-face of its own to
    // read. Ask Google's CSS for it; a non-browser client is answered with plain
    // .ttf files, one per weight — exactly what a designer wants to install.
    function googleFontFiles(family) {
        var q = encodeURIComponent(family).replace(/%20/g, "+");
        var base = "https://fonts.googleapis.com/css2?family=" + q;
        function parse(css) {
            var out = [];
            var re = /@font-face\s*\{([^}]*)\}/g;
            var m;
            while ((m = re.exec(css.body))) {
                var weight = /font-weight:\s*([^;]+)/.exec(m[1]);
                var style = /font-style:\s*([^;]+)/.exec(m[1]);
                var best = bestFontSource(m[1], css.url);
                if (best) out.push({ family: family, weight: weight ? weight[1].trim() : "400", style: style ? style[1].trim() : "normal", url: best.url, ext: best.ext });
            }
            return out;
        }
        return relayGet(base + ":wght@300;400;500;600;700&display=swap").then(parse, function () {
            return relayGet(base + "&display=swap").then(parse);
        }).catch(function () { return []; });
    }

    function collectFontFiles(fonts, bundle) {
        var families = [];
        [fonts.primary, fonts.paragraph].forEach(function (f) { if (f && families.indexOf(f) === -1) families.push(f); });
        return Promise.all(families.map(function (family) {
            var own = siteFontFiles(family, bundle);
            return own.length ? own : googleFontFiles(family);
        })).then(function (groups) {
            var seen = {};
            var files = [];
            groups.forEach(function (g) {
                g.forEach(function (f) { if (!seen[f.url]) { seen[f.url] = true; files.push(f); } });
            });
            return { files: files.slice(0, MAX_FONT_FILES), families: families, found: groups.map(function (g) { return g.length > 0; }) };
        });
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // A blank dark field the size of what will fill it. A message is only for
    // a real outcome ("no colors found"); the idle and error states stay blank.
    function renderEmpty(container, message) {
        container.textContent = "";
        var kind = container === paletteEl ? "palette" : container === assetsEl ? "assets" : "type";
        container.appendChild(el("div", "bk-placeholder bk-placeholder--" + kind, message));
    }

    function renderLoading(container) {
        container.textContent = "";
        container.appendChild(el("div", "bk-skeleton"));
    }

    function renderAssets(shown, total) {
        assetsEl.textContent = "";
        assetsCountEl.textContent = "";
        if (!shown.length) {
            renderEmpty(assetsEl, "No images or SVGs found on this page.");
            return;
        }
        shown.forEach(function (item) {
            var tile = el("button", "bk-asset");
            tile.type = "button";
            tile.setAttribute("aria-label", item.kind === "svg" ? "Copy this SVG's code" : "Copy this asset's link");
            tile.title = item.kind === "svg" ? "Copy SVG code" : item.url;
            var img = document.createElement("img");
            img.alt = "";
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            img.src = assetSrc(item);
            tile.appendChild(img);
            tile.appendChild(el("span", "bk-asset-type", (item.type || "img").toUpperCase()));
            tile.addEventListener("click", function () { copy(item.kind === "svg" ? item.svg : item.url, null, item.kind === "svg" ? "SVG code" : "link"); });
            assetsEl.appendChild(tile);
        });
        assetsCountEl.textContent = "Showing " + shown.length + " of " + total + " found";
    }

    function renderPalette(colors) {
        paletteEl.textContent = "";
        if (!colors.length) {
            renderEmpty(paletteEl, "No colors found in this site's CSS. Sites that paint themselves with scripts or images can't be read.");
            return;
        }
        colors.forEach(function (hex) {
            var rgb = toRGBA(hex);
            var swatch = el("button", "bk-swatch");
            swatch.type = "button";
            swatch.setAttribute("aria-label", "Copy " + hex);
            swatch.style.setProperty("--swatch", hex);
            swatch.style.setProperty("--ink", inkFor(rgb));
            swatch.appendChild(el("span", "bk-swatch-hex", hex));
            var icon = el("span", "bk-swatch-copy");
            icon.setAttribute("aria-hidden", "true");
            swatch.appendChild(icon);
            swatch.addEventListener("click", function () { copy(hex, swatch); });
            paletteEl.appendChild(swatch);
        });
    }

    function renderTypes(fonts, shown) {
        typeEl.textContent = "";
        if (!fonts.primary && !fonts.paragraph) {
            renderEmpty(typeEl, "No fonts found in this site's CSS.");
            return;
        }
        var card = el("div", "bk-type-card");

        var primary = el("p", "bk-type-primary", fonts.primary);
        primary.style.fontFamily = shown.primary.css + ", sans-serif";
        var primaryLabel = el("span", "bk-type-label", "Primary font");

        var para = el("p", "bk-type-para", fonts.paragraph + " for paragraph.");
        para.style.fontFamily = shown.paragraph.css + ", sans-serif";
        var paraLabel = el("span", "bk-type-label", "Paragraph font");

        card.appendChild(primaryLabel);
        card.appendChild(primary);
        card.appendChild(paraLabel);
        card.appendChild(para);

        var missing = [];
        if (!shown.primary.real) missing.push(fonts.primary);
        if (!shown.paragraph.real && fonts.paragraph !== fonts.primary) missing.push(fonts.paragraph);
        if (missing.length) {
            card.appendChild(el("p", "bk-type-note",
                missing.join(" and ") + " is not on Google Fonts and its files could not be loaded, so it is shown in a stand-in."));
        }
        typeEl.appendChild(card);
    }

    // The cue says "this scrolls". It shows only while there is more page below
    // and the reader is still at the top; scrolling away fades it out for good.
    function updateScrollCue() {
        var scrollable = !shotEl.hidden && previewFrameEl.scrollHeight > previewFrameEl.clientHeight + 40;
        scrollCueEl.hidden = !scrollable;
        scrollCueEl.classList.toggle("is-away", previewFrameEl.scrollTop > 40);
    }

    previewFrameEl.addEventListener("scroll", updateScrollCue);
    scrollCueEl.addEventListener("click", function () {
        previewFrameEl.scrollBy({ top: previewFrameEl.clientHeight * 0.8, behavior: "smooth" });
    });

    function showPreview(url) {
        var host = new URL(url).hostname;
        previewFrameEl.scrollTop = 0;
        scrollCueEl.hidden = true;
        previewFrameEl.classList.add("is-loading");
        previewEmptyEl.hidden = true;
        shotEl.hidden = true;
        shotEl.alt = "Preview of " + host;

        // The whole page, not just the fold: the frame scrolls like a mini browser.
        // Microlink first: it fails loudly (a non-image error), so the next source
        // gets its turn. thum.io is the spare — keyless, but it answers a refusal
        // with a 200 "Image not authorized" picture, so it can never be first.
        var sources = [
            "https://api.microlink.io/?url=" + encodeURIComponent(url) +
                "&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1200&viewport.height=1228&viewport.deviceScaleFactor=1" +
                "&screenshot.fullPage=true&screenshot.type=jpeg&screenshot.quality=70",
            "https://image.thum.io/get/fullpage/width/1200/noanimate/" + url
        ];
        var index = 0;
        shotEl.onload = function () {
            previewFrameEl.classList.remove("is-loading");
            shotEl.hidden = false;
            updateScrollCue();
        };
        shotEl.onerror = function () {
            index += 1;
            if (index < sources.length) { shotEl.src = sources[index]; return; }
            previewFrameEl.classList.remove("is-loading");
            previewEmptyEl.textContent = "A preview isn't available for this site.";
            previewEmptyEl.hidden = false;
        };
        shotEl.src = sources[0];
    }

    // ── Copy and export ─────────────────────────────────────────────────────

    function copy(text, swatch, label) {
        function done() {
            toast("Copied " + (label || text));
            if (swatch) {
                swatch.classList.add("is-copied");
                setTimeout(function () { swatch.classList.remove("is-copied"); }, 1200);
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else {
            fallbackCopy(text);
            done();
        }
    }

    function fallbackCopy(text) {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try { document.execCommand("copy"); } catch (e) { /* nothing more to try */ }
        area.remove();
    }

    function buildExport(format) {
        var colors = state.colors;
        var fonts = state.fonts || {};
        if (format === "json") {
            return {
                ext: "json", type: "application/json",
                text: JSON.stringify({
                    source: state.host,
                    colors: colors,
                    fonts: { primary: fonts.primary || null, paragraph: fonts.paragraph || null }
                }, null, 2) + "\n"
            };
        }
        if (format === "svg") {
            var w = 200, h = 240;
            var rects = colors.map(function (hex, i) {
                var ink = inkFor(toRGBA(hex));
                return '  <rect x="' + (i * w) + '" y="0" width="' + w + '" height="' + h + '" fill="' + hex + '"/>\n' +
                    '  <text x="' + (i * w + 16) + '" y="' + (h - 18) + '" font-family="Inter, Arial, sans-serif" font-size="16" fill="' + ink + '">' + hex + "</text>";
            }).join("\n");
            return {
                ext: "svg", type: "image/svg+xml",
                text: '<svg xmlns="http://www.w3.org/2000/svg" width="' + (w * colors.length) + '" height="' + h +
                    '" viewBox="0 0 ' + (w * colors.length) + " " + h + '">\n' + rects + "\n</svg>\n"
            };
        }
        var lines = colors.map(function (hex, i) { return "  --brand-" + (i + 1) + ": " + hex + ";"; });
        if (fonts.primary) lines.push('  --font-primary: "' + fonts.primary + '";');
        if (fonts.paragraph) lines.push('  --font-paragraph: "' + fonts.paragraph + '";');
        return { ext: "css", type: "text/css", text: "/* " + state.host + " */\n:root {\n" + lines.join("\n") + "\n}\n" };
    }

    function bytesOf(text) { return new TextEncoder().encode(text); }

    function safeName(text) {
        return String(text).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
    }

    // Unique file names inside the zip: "logo.png", "logo-2.png", ...
    function makeNamer() {
        var used = {};
        return function (folder, base, ext) {
            var name = safeName(base);
            var full = folder + "/" + name + "." + ext;
            var n = 2;
            while (used[full.toLowerCase()]) full = folder + "/" + name + "-" + (n++) + "." + ext;
            used[full.toLowerCase()] = true;
            return full;
        };
    }

    var TYPE_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
        "image/avif": "avif", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/bmp": "bmp" };

    function setDownloadLabel(text) {
        downloadEl.querySelector("span").textContent = text;
    }

    function setDownloadEnabled(enabled) {
        downloadEl.disabled = !enabled;
    }

    // Everything in one zip: the colour sheet, the fonts the site declares, and the
    // images and SVGs found on the page. Each file is fetched through the relay
    // (a browser cannot save another site's files itself) a few at a time.
    function downloadBrandkit() {
        if (state.busy || !state.fonts) return;
        state.busy = true;
        setDownloadEnabled(false);
        setDownloadLabel("Packing…");

        var name = makeNamer();
        var files = [];
        var report = { colors: state.colors.length, fonts: 0, assets: 0, skipped: 0, fontsMissing: [] };
        var total = 0;
        var done = 0;
        function tick() { done++; setDownloadLabel("Packing " + done + "/" + total); }

        ["css", "json", "svg"].forEach(function (format) {
            if (!state.colors.length) return;
            var f = buildExport(format);
            files.push({ name: name("colors", "palette", f.ext), data: bytesOf(f.text) });
        });

        collectFontFiles(state.fonts, state.bundle).then(function (fontPlan) {
            fontPlan.families.forEach(function (family, i) { if (!fontPlan.found[i]) report.fontsMissing.push(family); });
            var assets = state.assets;
            total = fontPlan.files.length + assets.length;

            var fontJob = pool(fontPlan.files, DOWNLOAD_POOL, function (f) {
                return relayBytes(f.url, true).then(function (blob) {
                    tick();
                    return blob.arrayBuffer().then(function (buf) {
                        var data = new Uint8Array(buf);
                        // Name the file for what it is, whatever the site called it:
                        // "OTTO" marks a CFF-flavoured OpenType font, anything else is TrueType.
                        var magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
                        // An older relay ignores font=sfnt and returns the .woff2 untouched.
                        // Never label that as installable: refuse it, and it is skipped and counted.
                        if (magic !== "OTTO" && magic !== "true" && magic !== "ttcf" && magic !== "\x00\x01\x00\x00") {
                            throw new Error("not an installable font");
                        }
                        var ext = magic === "OTTO" ? "otf" : "ttf";
                        return { f: f, data: data, ext: ext };
                    });
                });
            });
            var assetJob = pool(assets, DOWNLOAD_POOL, function (item) {
                if (item.kind === "svg") { tick(); return { item: item, ext: "svg", data: bytesOf(item.svg) }; }
                return relayBytes(item.url).then(function (blob) {
                    tick();
                    return blob.arrayBuffer().then(function (buf) {
                        var ext = item.type || TYPE_EXT[blob.type.split(";")[0]] || "bin";
                        return { item: item, ext: ext, data: new Uint8Array(buf) };
                    });
                });
            });
            return Promise.all([fontJob, assetJob]);
        }).then(function (results) {
            results[0].forEach(function (r) {
                if (!r) { report.skipped++; return; }
                var style = /italic|oblique/i.test(r.f.style) ? "-italic" : "";
                files.push({ name: name("fonts", r.f.family + "-" + r.f.weight.replace(/\s+/g, "-") + style, r.ext), data: r.data });
                report.fonts++;
            });
            var inline = 0;
            results[1].forEach(function (r) {
                if (!r) { report.skipped++; return; }
                var base;
                if (r.item.kind === "svg") base = "inline-svg-" + (++inline);
                else {
                    try { base = decodeURIComponent(new URL(r.item.url).pathname.split("/").pop() || "image").replace(/\.[a-z0-9]+$/i, ""); }
                    catch (e) { base = "image"; }
                }
                files.push({ name: name("assets", base, r.ext), data: r.data });
                report.assets++;
            });

            var lines = [
                "Brandkit for " + state.host,
                "Made with Design Wallet — https://designwallet.in/dw-tools/brandkit-generator/",
                "Date: " + new Date().toISOString().slice(0, 10),
                "",
                "colors/  " + report.colors + " colors, as CSS variables, JSON and an SVG swatch strip.",
                "fonts/   " + report.fonts + " installable font file(s) (.ttf / .otf)" + (report.fontsMissing.length ? " (no files found for: " + report.fontsMissing.join(", ") + ")" : "") + ".",
                "assets/  " + report.assets + " image and SVG file(s) found on the page.",
                report.skipped ? "\n" + report.skipped + " file(s) could not be downloaded and were skipped." : "",
                "",
                "Notes",
                "- Colors are ranked from what the site's CSS declares, not measured from pixels.",
                "- Fonts and assets belong to their owners and foundries. Check the licence",
                "  before using any of them in your own work.",
                ""
            ];
            files.push({ name: "README.txt", data: bytesOf(lines.join("\n")) });

            var root = "brandkit-" + safeName(state.host);
            var blob = DWZip.build(files.map(function (f) { return { name: root + "/" + f.name, data: f.data }; }));
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = root + ".zip";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(link.href); }, 4000);
            toast("Downloaded " + report.colors + " colors, " + report.fonts + " fonts, " + report.assets + " assets" +
                (report.skipped ? " (" + report.skipped + " skipped)" : ""));
        }).catch(function () {
            toast("Could not build the brandkit. Try again.");
        }).then(function () {
            state.busy = false;
            setDownloadLabel("Download brandkit");
            setDownloadEnabled(true);
        });
    }

    // Fetch stylesheets a few at a time, keeping page order: later rules win in
    // the cascade, so the order they are parsed in has to be the order they load in.
    function fetchSheets(hrefs) {
        var results = new Array(hrefs.length);
        var next = 0;
        function worker() {
            var i = next++;
            if (i >= hrefs.length) return Promise.resolve();
            return relayGet(hrefs[i]).then(function (css) {
                results[i] = { text: css.body, base: css.url };
            }, function () { /* a sheet that fails is skipped, not fatal */ }).then(worker);
        }
        var workers = [];
        for (var w = 0; w < Math.min(FETCH_POOL, hrefs.length); w++) workers.push(worker());
        return Promise.all(workers).then(function () { return results; });
    }

    // ── Run ─────────────────────────────────────────────────────────────────

    function generate(url) {
        var run = ++state.run;
        state.host = url.hostname.replace(/^www\./, "");
        state.colors = [];
        state.fonts = null;
        state.assets = [];
        state.bundle = null;
        showError("");
        setDownloadEnabled(false);
        setPhase("loading");
        renderLoading(paletteEl);
        renderLoading(typeEl);
        renderLoading(assetsEl);
        assetsCountEl.textContent = "";
        showPreview(url.href);

        relayGet(url.href).then(function (page) {
            if (run !== state.run) return null;
            var doc = new DOMParser().parseFromString(page.body, "text/html");
            var sources = [];
            doc.querySelectorAll("style").forEach(function (s) { sources.push({ text: s.textContent, base: page.url }); });

            var hrefs = [];
            doc.querySelectorAll('link[rel~="stylesheet"], link[rel="preload"][as="style"]').forEach(function (l) {
                var href = absolute(l.getAttribute("href") || "", page.url);
                if (href && !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(href) && hrefs.indexOf(href) === -1) hrefs.push(href);
            });

            return fetchSheets(hrefs.slice(0, MAX_STYLESHEETS)).then(function (sheets) {
                sheets.forEach(function (s) { if (s) sources.push(s); });
                return { doc: doc, bundle: parseSheets(sources), base: page.url };
            });
        }).then(function (parsed) {
            if (!parsed || run !== state.run) return null;
            var colors = extractPalette(parsed.doc, parsed.bundle);
            var fonts = extractFonts(parsed.doc, parsed.bundle);
            var assets = extractAssets(parsed.doc, parsed.bundle, parsed.base);
            state.colors = colors;
            state.fonts = fonts;
            state.assets = assets;
            state.bundle = parsed.bundle;
            renderPalette(colors);
            setDownloadEnabled(colors.length > 0 || assets.length > 0);

            // Tiles: try the best-ranked candidates, show the first few that load.
            Promise.all(assets.slice(0, PROBE_COUNT).map(probeAsset)).then(function (ok) {
                if (run !== state.run) return;
                renderAssets(pickTiles(assets.slice(0, PROBE_COUNT).filter(function (_, i) { return ok[i]; })), assets.length);
            });
            return Promise.all([ensureFont(fonts.primary, parsed.bundle), ensureFont(fonts.paragraph, parsed.bundle)])
                .then(function (shown) {
                    if (run !== state.run) return;
                    renderTypes(fonts, { primary: shown[0], paragraph: shown[1] });
                    setPhase("ready");
                });
        }).catch(function (err) {
            if (run !== state.run) return;
            setPhase("error");
            showError(err && err.message ? err.message : "Something went wrong reading that site.");
            renderEmpty(paletteEl);
            renderEmpty(typeEl);
            renderEmpty(assetsEl);
        });
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        var url = normalizeUrl(input.value);
        if (!url) {
            showError("Enter a website link, like designwallet.in");
            input.focus();
            return;
        }
        input.value = url.hostname + (url.pathname !== "/" ? url.pathname : "");
        generate(url);
    });

    downloadEl.addEventListener("click", downloadBrandkit);

    // A shared link like /dw-tools/brandkit-generator/?url=lovable.dev runs itself.
    var preset = new URLSearchParams(location.search).get("url");
    if (preset) {
        var presetUrl = normalizeUrl(preset);
        if (presetUrl) {
            input.value = presetUrl.hostname;
            generate(presetUrl);
        }
    }
})();
