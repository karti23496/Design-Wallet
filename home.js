// ============================================================================
// Homepage (Figma 954:854, approved 2026-10-31): the star fields, the
// dashboard's scale, the What's inside tabs, and the Use cases accordion.
// ============================================================================
(function () {
    // ── Hero and testimonial stars (Figma 1030:1568) ────────────────────────
    // [x, y, size, opacity, glow?] on a 1440 × 600 stage. x becomes a share
    // of the stage, so the 390 phone stage keeps the same scatter.
    var SKY = [
        [484, 174, 2.7, 0.9, 1], [870, 279, 1.7, 0.69], [483, 368, 2.6, 0.9, 1], [1065, 103, 1.5, 0.59], [1381, 410, 1.9, 0.42],
        [923, 299, 2, 0.69], [334, 441, 1.7, 0.76], [852, 432, 3.4, 0.9, 1], [1410, 395, 2, 0.49], [1276, 144, 2.1, 0.49],
        [993, 488, 1.7, 0.36], [573, 532, 1.8, 0.67], [925, 346, 2.2, 0.71], [482, 411, 2, 0.54], [1357, 183, 1.6, 0.78],
        [980, 444, 1.7, 0.63], [101, 98, 2.2, 0.49], [1198, 223, 1.7, 0.79], [450, 369, 2.2, 0.56], [965, 513, 2.8, 0.9, 1],
        [829, 518, 1.6, 0.46], [813, 500, 2.1, 0.75], [429, 344, 2, 0.57], [405, 537, 1.5, 0.78], [205, 500, 2.9, 0.9, 1],
        [614, 365, 2.1, 0.53], [600, 584, 2.2, 0.64], [485, 232, 1.9, 0.58], [1213, 283, 1.9, 0.45], [286, 555, 1.9, 0.55],
        [608, 258, 1.8, 0.6], [668, 110, 1.5, 0.61], [658, 365, 2.8, 0.9, 1], [694, 158, 2, 0.68], [867, 461, 1.6, 0.6],
        [677, 146, 2.3, 0.46], [1059, 185, 3.1, 0.9, 1], [106, 453, 1.8, 0.78], [818, 240, 2.1, 0.59], [538, 568, 2.1, 0.43],
        [1112, 470, 1.9, 0.67], [152, 352, 1.8, 0.6], [1295, 357, 2.1, 0.52], [791, 141, 2, 0.35], [384, 396, 1.7, 0.44],
        [924, 287, 2.1, 0.54], [416, 417, 1.8, 0.48], [833, 392, 2.2, 0.37], [105, 371, 1.7, 0.48], [421, 155, 2.3, 0.67],
        [830, 172, 2.1, 0.68], [60, 410, 1.6, 0.43], [951, 223, 3.3, 0.9, 1], [1145, 409, 2, 0.49], [746, 502, 1.9, 0.54],
        [47, 578, 3.3, 0.9, 1], [366, 114, 2, 0.51], [74, 151, 1.8, 0.75], [520, 268, 2.1, 0.44], [39, 416, 2.1, 0.65],
        [428, 515, 2.8, 0.9, 1], [488, 470, 1.9, 0.67], [878, 564, 2.2, 0.76], [141, 368, 2, 0.6], [1413, 223, 2.2, 0.4],
        [495, 265, 1.5, 0.45], [302, 298, 2, 0.62], [978, 482, 2.3, 0.8], [719, 177, 1.9, 0.42], [380, 197, 2.1, 0.72],
        [519, 181, 3, 0.9, 1], [533, 454, 1.5, 0.43], [197, 298, 1.8, 0.43], [1107, 517, 2.2, 0.54], [906, 258, 1.5, 0.5],
        [1276, 544, 1.5, 0.6], [1130, 96, 1.6, 0.35], [1140, 578, 1.8, 0.45], [1299, 265, 3, 0.9, 1], [1147, 508, 1.9, 0.51],
        [1407, 305, 2.2, 0.42], [470, 505, 1.6, 0.63], [1211, 574, 2.1, 0.37], [1014, 548, 1.8, 0.36]
    ];
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function sky(shift) {
        return SKY.map(function (s, i) {
            return '<span class="home-star' + (s[4] ? " home-star--glow" : "") + '" style="left:' + (s[0] / 14.4).toFixed(3) +
                "%;top:" + (s[1] + shift) + "px;width:" + s[2] + "px;height:" + s[2] + "px;opacity:" + s[3] +
                (s[4] ? ";--d:-" + (i % 7) * 0.6 + "s" : "") + '"></span>';
        }).join("");
    }
    // data-stars="drift" (the hero) gets a second copy one stage-height above,
    // so the CSS can slide the pair down and loop without a seam.
    document.querySelectorAll("[data-stars]").forEach(function (el) {
        el.innerHTML = el.getAttribute("data-stars") === "drift"
            ? '<div class="home-sky">' + sky(0) + sky(-600) + "</div>"
            : sky(0);
    });

    // ── A shooting star across the hero every 5s (Karthik, 2026-10-31) ─────
    // Random start in the upper sky, heading down-left or down-right at
    // 18–38°. Skipped while the tab is hidden or the hero is scrolled away.
    var stage = document.querySelector(".hx-stage");
    if (stage && !calm) {
        setInterval(function () {
            if (document.hidden || window.scrollY > 900) return;
            var right = Math.random() < 0.5;
            var w = stage.clientWidth;
            var star = document.createElement("span");
            star.className = "hx-shoot";
            star.style.setProperty("--x", Math.round((right ? 0.08 : 0.35) * w + Math.random() * 0.55 * w) + "px");
            star.style.setProperty("--y", Math.round(30 + Math.random() * 220) + "px");
            star.style.setProperty("--a", (right ? 1 : -1) * (18 + Math.random() * 20) + (right ? 0 : 180) + "deg");
            star.style.setProperty("--d", Math.round(w < 600 ? 160 : 300 + Math.random() * 160) + "px");
            stage.insertBefore(star, stage.querySelector(".hx-tile"));   // behind the logo tiles
            star.addEventListener("animationend", function () { star.remove(); });
        }, 5000);
    }

    // ── Hero logo tiles drift against the cursor (Karthik, 2026-10-31) ──────
    // Pointer left → tiles shift right, and so on, each by its own depth.
    var tiles = Array.prototype.slice.call(document.querySelectorAll(".hx-tile"));
    var DEPTH = [16, 12, 20, 10, 14, 18];
    if (tiles.length && !calm && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        var pending = null;
        var drift = function (dx, dy) {
            tiles.forEach(function (t, i) {
                t.style.setProperty("--px", (-dx * DEPTH[i]).toFixed(1) + "px");
                t.style.setProperty("--py", (-dy * DEPTH[i]).toFixed(1) + "px");
            });
        };
        window.addEventListener("mousemove", function (event) {
            if (pending) return;
            pending = requestAnimationFrame(function () {
                pending = null;
                if (window.scrollY > 1200) return;            // only while the hero's in view
                drift(event.clientX / window.innerWidth * 2 - 1, event.clientY / window.innerHeight * 2 - 1);
            });
        });
        document.documentElement.addEventListener("mouseleave", function () { drift(0, 0); });
    }

    // ── The dashboard preview's own star field (Figma 1008:3840) ────────────
    // [x, y, large?]: the frame's 70 stars, in the preview's own px. Two sizes,
    // each an exported asset (public/home/star.svg and star-lg.svg).
    var STARS = [
        [669.05, 327.15], [909.59, 158.1, 1], [900.62, 66.39], [530.42, 88.77], [551.03, 139.45],
        [224.36, 160.11], [354.77, 193.18], [703.57, 149.21], [672.18, 205.15], [415.69, 212.44],
        [900.18, 286.16, 1], [357.1, 265.38], [1098.89, 73.45, 1], [933.19, 74.68], [548.38, 284.83],
        [367.79, 104.5, 1], [968.29, 58.05, 1], [315.26, 286.21], [1149.12, 93.45], [1072.23, 69.78, 1],
        [959.42, 303.41], [873.71, 161.92], [855.58, 194.58], [1188.47, 269.82], [315.64, 324.71, 1],
        [244.82, 259.83], [826.57, 101.87], [364.44, 129.76], [824.25, 261.8], [295.95, 110.66],
        [840.83, 84.66], [661.45, 138.04], [703.74, 203.03], [548.79, 155.11], [688.52, 75.48],
        [265.33, 290.04], [392.48, 69.09], [367.73, 160.76], [710.96, 240.41, 1], [808.84, 323.33],
        [595.26, 333.71], [273.6, 114.69], [927.28, 231.42, 1], [309.23, 289.74, 1], [913.65, 160.44],
        [526.84, 318.96, 1], [1072.53, 139.6], [1091.97, 166.61], [661.15, 184.15], [228.89, 131.61],
        [332.63, 76.52], [603.43, 196.05], [837.88, 121.49], [769.9, 141.11], [825.48, 245.08],
        [703.97, 318.09], [355.71, 240.31], [905.45, 80.25], [893.39, 241.13], [244.92, 218.35],
        [687.44, 191.37], [424.67, 85.48], [457.24, 137.08, 1], [906.42, 316.66], [604.35, 255.63],
        [397.01, 208.27], [349.95, 201.64], [895.81, 92.5], [330.94, 308.66, 1], [789.36, 84.15]
    ];

    var field = document.getElementById("home-preview-stars");
    if (field) {
        field.innerHTML = STARS.map(function (s) {
            return '<img class="hp-star' + (s[2] ? " hp-star--lg" : "") + '" src="/public/home/star' + (s[2] ? "-lg" : "") +
                '.svg" alt="" style="left:' + s[0] + "px;top:" + s[1] + 'px">';
        }).join("");
    }

    // ── What's inside: tabs (Figma 995:2878) ────────────────────────────────
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".wi-tab"));
    function select(tab, focus) {
        tabs.forEach(function (t) {
            var on = t === tab;
            t.setAttribute("aria-selected", String(on));
            t.tabIndex = on ? 0 : -1;
            document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
        });
        if (focus) tab.focus();
        fitArt();
        play(document.getElementById(tab.getAttribute("aria-controls")));
    }

    // ── Illustrations that play when their tab shows (Karthik, 2026-10-31) ──
    // Know your money: the bars rise and the median counts up. MCP: the chat
    // plays out. Re-adding the class restarts the CSS animations.
    function restart(el) {
        el.classList.remove("is-playing");
        void el.offsetWidth;
        el.classList.add("is-playing");
    }
    function countUp(el) {
        var target = parseFloat(el.getAttribute("data-to") || el.textContent.replace(/[^\d.]/g, ""));
        el.setAttribute("data-to", target);
        if (calm) return;
        var start = null;
        var step = function (now) {
            if (start === null) start = now;
            var t = Math.min(1, (now - start) / 1200);
            el.textContent = "₹" + (target * (1 - Math.pow(1 - t, 3))).toFixed(1) + "L";
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
    function play(panel) {
        if (!panel) return;
        var salary = panel.querySelector(".wi-salary");
        if (salary) { restart(salary); countUp(salary.querySelector(".wi-salary-big")); }
        var chat = panel.querySelector(".wi-chat");
        if (chat) restart(chat);
    }
    tabs.forEach(function (tab, i) {
        tab.addEventListener("click", function () { select(tab, false); });
        // Arrow keys move between tabs, Home/End jump to the ends (WAI-ARIA tabs).
        tab.addEventListener("keydown", function (event) {
            var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            select(tabs[(next + tabs.length) % tabs.length], true);
        });
    });

    // ── Wallet Reads: the bookshelf (13 real titles from public_books) ───────
    // [title, author, x, y, w, h, base, light, dark, ink, font, letter-spacing]
    // Positions are the frame's, inside the 646×518 illustration.
    // Single quotes inside: these land in a style="" attribute.
    var SERIF = "400 {s}px 'Instrument Serif', serif", SERIF_I = "italic 400 {s}px 'Instrument Serif', serif", INTER = "{w} {s}px Inter, sans-serif";
    function f(tpl, s, w) { return tpl.replace("{s}", s).replace("{w}", w || 400); }
    var BOOKS = [
        ["Dieter Rams", "Klemp", 24, 137, 40, 300, "#ece6da", "#faf4e7", "#c2bdb3", "#1a1a1a", f(SERIF, 22)],
        ["THE DESIGN OF EVERYDAY THINGS", "Norman", 67, 93, 38, 344, "#d9452b", "#e6492e", "#b23923", "#ffffff", f(INTER, 12, 600), "0.04em"],
        ["Steal Like an Artist", "Kleon", 108, 159, 34, 278, "#141414", "#151515", "#101010", "#f5f5f5", f(INTER, 14, 700)],
        ["LAWS OF UX", "Yablonski", 145, 107, 44, 330, "#1d2f8f", "#1f3298", "#182775", "#ffffff", f(INTER, 20, 900), "-0.02em"],
        ["Why Fonts Matter", "Hyndman", 192, 175, 36, 262, "#f2a7c3", "#ffb1cf", "#c689a0", "#1a1a1a", f(SERIF_I, 20)],
        ["HOOKED", "Eyal", 249.25, 83.14, 54, 352, "#f2e33b", "#fff13f", "#c6ba30", "#111111", f(INTER, 34, 900), "-0.02em", true],
        ["LOGOTYPE", "Evamy", 324.5, 119, 42, 318, "#f5f5f5", "#ffffff", "#c9c9c9", "#111111", f(INTER, 24, 300), "0.04em"],
        ["GRIDS", "Ambrose", 369.5, 137, 46, 300, "#e8662c", "#f66c2f", "#be5424", "#fff4ee", f(INTER, 26, 900), "-0.02em"],
        ["Logos That Last", "Peters", 418.5, 101, 38, 336, "#39d353", "#3ce058", "#2fad44", "#0b0b0b", f(INTER, 15, 600)],
        ["THE TYPOGRAPHY IDEA BOOK", "Anderson", 459.5, 125, 36, 312, "#0f5c5c", "#106262", "#0c4b4b", "#e8f4f2", f(INTER, 11, 500), "0.04em"],
        ["Know Your Onions", "de Soto", 498.5, 167, 40, 270, "#6b4bd8", "#7150e5", "#583eb1", "#ffffff", f(INTER, 15, 700)],
        ["Pyjama Profit", "Chhikara", 541.5, 141, 34, 296, "#2a2a2a", "#2d2d2d", "#222222", "#f08a3c", f(INTER, 15, 600)],
        ["Design Your Thinking", "Soni", 578.5, 113, 42, 324, "#d8c7a6", "#e5d3b0", "#b1a388", "#1e1e1e", f(SERIF, 19)]
    ];
    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
    var shelf = document.getElementById("wi-shelf");
    if (shelf) {
        shelf.innerHTML = BOOKS.map(function (b) {
            return '<div class="wi-spine' + (b[12] ? " wi-spine--lean" : "") + '" style="--x:' + b[2] + "px;--y:" + b[3] + "px;--w:" + b[4] + "px;--h:" + b[5] +
                "px;--c:" + b[6] + ";--c2:" + b[7] + ";--c3:" + b[8] + ";--ink:" + b[9] + ";--font:" + b[10] + (b[11] ? ";--ls:" + b[11] : "") + '">' +
                '<span class="wi-spine-title">' + esc(b[0]) + '</span><span class="wi-spine-author">' + esc(b[1].toUpperCase()) + "</span></div>";
        }).join("");
    }

    // ── Premium collections: category chips swap the two cards ──────────────
    // The catalogue is the public `public_tools` view (publishable key, read
    // only), the same data tools.js shows. Fetched once, on the first chip
    // press; tools.js's own localStorage copy is used when it's there.
    var chipBox = document.querySelector('.wi-chips[aria-label="Filter by category"]');
    var cardBox = document.getElementById("wi-cards");
    if (chipBox && cardBox) {
        var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
        var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
        var allCards = cardBox.innerHTML;          // "All": the designed pair
        var explore = document.getElementById("wi-explore-cat");
        var catalogue = null;

        var slugify = function (v) { return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); };
        var priceOf = function (v) {
            var c = String(v || "").toLowerCase();
            if (c.indexOf("freemium") !== -1) return "freemium";
            if (c.indexOf("paid") !== -1 || c.indexOf("premium") !== -1) return "paid";
            return "free";
        };
        // Same ImageKit treatment as tools.js's iconUrl().
        var iconUrl = function (url) {
            if (!url || url.indexOf("ik.imagekit.io") === -1 || url.indexOf("tr=") !== -1) return url;
            return url + (url.indexOf("?") === -1 ? "?" : "&") + "tr=w-128,h-128,cm-pad_resize,bg-00000000";
        };
        var initials = function (t) { return String(t || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("") || "DW"; };
        var html = function (s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };

        var loadCatalogue = function () {
            if (catalogue) return Promise.resolve(catalogue);
            try {
                var cached = JSON.parse(localStorage.getItem("dw_tool_detail_cache_v4") || "null");
                if (cached && Array.isArray(cached.tools) && cached.tools.length) {
                    catalogue = cached.tools.map(function (t) {
                        return { slug: t.slug, title: t.title, desc: t.description || t.subtitle, cats: t.categories || [], price: t.price, icon: t.icon };
                    });
                    return Promise.resolve(catalogue);
                }
            } catch (e) { /* fall through to the network */ }
            return fetch(SUPABASE_URL + "/rest/v1/public_tools?select=slug,title,subtitle,description,pricing,categories,image&limit=5000", { headers: { apikey: SUPABASE_KEY } })
                .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
                .then(function (rows) {
                    catalogue = rows.map(function (r) {
                        return {
                            slug: r.slug, title: r.title, desc: r.description || r.subtitle || "Curated design resource.",
                            cats: String(r.categories || "").split(",").map(function (c) { return c.trim(); }).filter(Boolean),
                            price: priceOf(r.pricing), icon: r.image || ""
                        };
                    });
                    return catalogue;
                });
        };

        // Two picks per category, each with a crisp 160px logo kept on the site
        // (public/home/logos/<slug>.png). Many catalogue favicons are 16–64px and
        // blur at this size, so the showcase uses these (Karthik, 2026-10-30).
        // A pick that leaves the catalogue falls back to the automatic choice.
        var PICKS = {
            "ai-tools": ["kodo", "gamma-app"],
            "design-communities": ["interaction-design-foundation-ixdf", "creativemornings"],
            "color-palatte": ["coolors", "colorhunt"],
            "ai-creative-suites": ["higgsfield-ai-ai-native-creative-suite", "online-video-editor-video-creator-invideo"],
            "accessibility": ["use-contrast", "understandingaccessibility"],
            "mcp-connectors": ["connect-to-leonardo-ai-with-the-mcp-server", "connect-to-notion-mcp-notion-docs"],
            "vibe-coding": ["lovable", "replit"],
            "branding": ["logo-system", "rebrandgallery"],
            "3d-tools": ["blender-the-free-and-open-source-3d-creation-software-blender-org", "maxon-filmmaking-motion-design-animation-vfx-and-editing-software"]
        };
        var localLogo = {};
        Object.keys(PICKS).forEach(function (k) { PICKS[k].forEach(function (s) { localLogo[s] = "/public/home/logos/" + s + ".png"; }); });

        // Some catalogue descriptions were scraped with page markup still on
        // the end (e.g. CreativeMornings: "…community' property='og:title'> <meta…").
        // Cut at the first trace of it, and any stray quote left behind.
        var cleanDesc = function (d) {
            return String(d || "").replace(/\s*(property\s*=|<).*$/i, "").replace(/['"\s|]+$/, "").trim() || "Curated design resource.";
        };

        var cardHtml = function (t) {
            var logo = localLogo[t.slug] || iconUrl(t.icon);
            var tile = logo
                ? '<span class="wi-tile wi-tile--live"><img src="' + html(logo) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
                : '<span class="wi-tile wi-tile--initials">' + html(initials(t.title)) + "</span>";
            var price = t.price === "paid" || t.price === "freemium" ? " wi-price--" + t.price : "";
            return '<div class="wi-card"><div class="wi-card-top">' + tile +
                '<span class="wi-price' + price + '">$ <b>' + html(String(t.price).toUpperCase()) + "</b></span></div>" +
                '<p class="wi-card-name">' + html(t.title) + '</p><p class="wi-card-desc">' + html(cleanDesc(t.desc)) + "</p></div>";
        };

        var showCategory = function (slug) {
            if (explore) explore.href = slug ? "/category/" + slug + "/" : "/category/";
            if (!slug) { cardBox.innerHTML = allCards; return; }
            loadCatalogue().then(function (tools) {
                if (chipBox.querySelector(".is-on").getAttribute("data-cat") !== slug) return;   // a later click won
                var chosen = (PICKS[slug] || []).map(function (s) {
                    return tools.filter(function (t) { return t.slug === s; })[0];
                }).filter(Boolean);
                if (chosen.length === 2) { cardBox.innerHTML = chosen.map(cardHtml).join(""); return; }
                var picks = tools.filter(function (t) {
                    return t.cats.some(function (c) { return slugify(c) === slug; });
                });
                // Tools with their own logo first, so the cards look like the catalogue.
                picks.sort(function (a, b) { return (b.icon ? 1 : 0) - (a.icon ? 1 : 0); });
                cardBox.innerHTML = picks.slice(0, 2).map(cardHtml).join("") || allCards;
            }).catch(function () { cardBox.innerHTML = allCards; });
        };

        var pick = function (chip) {
            chipBox.querySelectorAll(".wi-chip").forEach(function (c) {
                var on = c === chip;
                c.classList.toggle("is-on", on);
                c.setAttribute("aria-pressed", String(on));
            });
            showCategory(chip.getAttribute("data-cat"));
        };
        var autoplay = !calm;
        chipBox.addEventListener("click", function (event) {
            var chip = event.target.closest(".wi-chip");
            if (!chip || chip.classList.contains("is-on")) return;
            autoplay = false;                        // they've taken over
            pick(chip);
        });

        // Autoplay (Karthik, 2026-10-31): step through the chips every 3.2s
        // while the panel is on screen, nobody is pointing at it, and the
        // visitor hasn't picked a chip themselves.
        var catPanel = document.getElementById("wi-panel-1");
        var catArt = catPanel.querySelector(".wi-art");
        var inView = false, hovering = false;
        catArt.addEventListener("mouseenter", function () { hovering = true; });
        catArt.addEventListener("mouseleave", function () { hovering = false; });
        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; }, { threshold: 0.4 }).observe(catArt);
        }
        setInterval(function () {
            if (!autoplay || !inView || hovering || catPanel.hidden || document.hidden) return;
            var chips = Array.prototype.slice.call(chipBox.querySelectorAll(".wi-chip"));
            var next = chips[(chips.indexOf(chipBox.querySelector(".is-on")) + 1) % chips.length];
            pick(next);
        }, 3200);
    }

    // The salary and chat panels also play the first time the section
    // scrolls into view with one of them showing.
    var wiSection = document.querySelector(".wi");
    if (wiSection && "IntersectionObserver" in window) {
        new IntersectionObserver(function (entries, observer) {
            if (!entries[0].isIntersecting) return;
            play(document.querySelector(".wi-panel:not([hidden])"));
            observer.disconnect();
        }, { threshold: 0.3 }).observe(wiSection);
    }

    // ── Wall of Portfolios: the card deck ───────────────────────────────────
    // Three slots: front, left, right. Clicking (or Enter/Space on) a back
    // card swaps it with the front one. While nobody is pointing at or
    // focused in the deck, it moves the next card forward every 3.5s; the
    // timer only runs while the tab is showing, and never with reduced motion.
    var deck = document.querySelector(".wi-deck");
    if (deck) {
        var SLOTS = ["is-front", "is-left", "is-right"];
        var cards = Array.prototype.slice.call(deck.querySelectorAll(".wi-pf"));
        var slotOf = function (card) { return SLOTS.filter(function (s) { return card.classList.contains(s); })[0]; };
        var sync = function () {
            cards.forEach(function (card) {
                var front = card.classList.contains("is-front");
                card.tabIndex = front ? -1 : 0;
                if (front) card.removeAttribute("role"); else card.setAttribute("role", "button");
            });
        };
        var bringForward = function (card) {
            var from = slotOf(card);
            if (from === "is-front") return;
            var front = cards.filter(function (c) { return c.classList.contains("is-front"); })[0];
            card.classList.replace(from, "is-front");
            front.classList.replace("is-front", from);
            sync();
        };
        cards.forEach(function (card) {
            card.addEventListener("click", function () { bringForward(card); });
            card.addEventListener("keydown", function (event) {
                if ((event.key === "Enter" || event.key === " ") && !card.classList.contains("is-front") && event.target === card) {
                    event.preventDefault();
                    bringForward(card);
                }
            });
        });
        sync();

        var paused = false;
        deck.addEventListener("mouseenter", function () { paused = true; });
        deck.addEventListener("mouseleave", function () { paused = false; });
        deck.addEventListener("focusin", function () { paused = true; });
        deck.addEventListener("focusout", function () { paused = false; });
        if (!calm) {
            setInterval(function () {
                if (paused || deck.parentNode.hidden || document.hidden) return;
                // A three-way turn, so every card gets its go: left comes
                // forward, front goes to the back right, right moves to left.
                var turn = { "is-left": "is-front", "is-front": "is-right", "is-right": "is-left" };
                cards.forEach(function (c) { var s = slotOf(c); c.classList.replace(s, turn[s]); });
                sync();
            }, 3500);
        }
    }

    // ── Below 1240px the illustration sits under the copy: zoom it to fit ──
    var arts = Array.prototype.slice.call(document.querySelectorAll(".wi-art"));
    function fitArt() {
        arts.forEach(function (art) {
            var panel = art.parentNode;
            if (panel.hidden) return;
            var zoom = window.innerWidth <= 1240 ? Math.min(1, (panel.clientWidth) / 646) : 1;
            art.style.setProperty("--wi-zoom", zoom);
        });
    }
    fitArt();
    window.addEventListener("resize", fitArt);

    // ── Use cases: one card open at a time (Figma 1023:5392) ────────────────
    var ucItems = Array.prototype.slice.call(document.querySelectorAll(".uc-item"));
    ucItems.forEach(function (item) {
        item.querySelector(".uc-hit").addEventListener("click", function () {
            ucItems.forEach(function (other) {
                var on = other === item;
                other.classList.toggle("is-open", on);
                other.querySelector(".uc-hit").setAttribute("aria-expanded", String(on));
                other.querySelector(".uc-panel").setAttribute("aria-hidden", String(!on));
            });
        });
    });

    // ── FAQ: the whole item toggles, and the answer slides open and shut ────
    // (Karthik, 2026-10-31). <details> keeps it working without JS; this
    // takes over the click so the height can animate.
    document.querySelectorAll(".faq-item").forEach(function (item) {
        var answer = item.querySelector(".faq-a");
        var running = null;
        var ease = { duration: calm ? 0 : 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
        item.addEventListener("click", function (event) {
            if (event.target.closest("a")) return;            // links in an answer still work
            event.preventDefault();
            if (running) running.cancel();
            var opening = !item.classList.contains("is-open");
            item.classList.toggle("is-open", opening);
            if (opening) item.open = true;
            var full = answer.scrollHeight + "px";
            running = answer.animate(
                opening ? [{ height: "0px", opacity: 0 }, { height: full, opacity: 1 }]
                        : [{ height: full, opacity: 1 }, { height: "0px", opacity: 0 }], ease);
            running.onfinish = function () {
                running = null;
                if (!opening) item.open = false;
            };
        });
    });

    // ── Scale the hero's 1180px bezel to its wrapper, and the Product Hunt
    //    listing to its card once the bento stacks ──────────────────────────
    var deviceWrap = document.querySelector(".hx-device-wrap");
    var phCard = document.querySelector(".tm-ph");
    var ucAcc = document.querySelector(".uc-acc");
    function fitDevice() {
        if (ucAcc) ucAcc.style.setProperty("--uc-fit", ucAcc.clientWidth / 792);
        if (deviceWrap) deviceWrap.style.setProperty("--hx-s", deviceWrap.clientWidth / 1180);
        if (phCard) phCard.style.setProperty("--tm-ph-s", Math.min(1, phCard.clientWidth / 451.4));
    }
    fitDevice();
    window.addEventListener("resize", fitDevice);
}());
