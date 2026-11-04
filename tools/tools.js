document.addEventListener("DOMContentLoaded", function () {
    // ── Where the catalogue comes from ──────────────────────────────────────
    // Supabase, not the Google Sheet. The Sheet is still where Karthik edits;
    // an Apps Script pushes it here within seconds of an edit. See
    // `supabase/README.md` and DECISIONS §20a.
    //
    // The key is PUBLISHABLE and belongs in the browser. It can only read the
    // three `public_*` views: row-level security refuses it the base tables,
    // and refuses every write. Verified 21/21 on 2026-10-04.
    //
    // Duplicated in `script.js` and `wall-of-portfolios/wall.js`, exactly as
    // the sheet id was before it. One shared config file would mean a script
    // tag on a dozen pages and a load-order dependency that fails silently.
    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";

    // PostgREST caps a response; ask for more than the catalogue will plausibly
    // hold and warn if we ever hit the ceiling, because the failure is silent
    // truncation rather than an error.
    var ROW_LIMIT = 5000;

    var CACHE_KEY = "dw_tool_detail_cache_v4";
    var CACHE_TTL = 10 * 60 * 1000;
    var REQUEST_TIMEOUT_MS = 12000;

    // ── "Hot trends": a promoted shortcut list above the category nav ───────
    // Edit this array to change what appears there; nothing else needs touching.
    //
    // Each entry resolves against the LIVE sheet data, in this order:
    //   1. a category whose slug matches `slug`  -> links to that category
    //   2. otherwise `query`                     -> links to that search
    // and a trend that matches no tools at all is not rendered, so this list
    // can name a trend before the catalogue has anything to put under it —
    // the row appears on its own once tools are tagged for it.
    var DW_TRENDS = [
        { label: "MCP Connectors",    slug: "mcp-connectors",    query: "mcp" },
        // Slug is the sheet's own category ("Vibe Coding"), not a slug of the
        // label — this resolves to the real category view, icon and count.
        { label: "Vibe Coding Tools", slug: "vibe-coding",      query: "vibe coding" },
        { label: "AI Creative Suites", slug: "ai-creative-suites", query: "creative suite" }
    ];

    // ── "Featured": the row at the top of the All view ──────────────────────
    // Tool slugs, in display order. Edit this array to change it. A slug that
    // isn't in the live catalogue is skipped, and the section hides itself if
    // none are left, so a typo or a removed tool can't leave a hole.
    var DW_FEATURED = [
        "claude",
        "chatgpt",
        "midjourney",
        "lovable",
        "figmamake",
        "cursorai",
        "mobbin",
        "framer"
    ];

    // The All view groups tools by category, most tools first. A category with
    // fewer tools than this is left to the sidebar: a carousel of one or two
    // cards reads as a mistake. Each carousel shows at most CATEGORY_ROW_LIMIT
    // cards, and "View category" leads to the rest.
    var CATEGORY_ROW_MIN = 4;
    var CATEGORY_ROW_LIMIT = 12;

    var loadingEl = document.getElementById("tool-loading");
    var contentEl = document.getElementById("tool-content");
    var notFoundEl = document.getElementById("tool-not-found");
    var categoryIndexEl = document.getElementById("category-index-content");
    var categoryListEl = document.getElementById("category-list-content");
    var categoryGridEl = document.getElementById("category-grid");
    var categoryToolGridEl = document.getElementById("category-tool-grid");
    var categoryTitleEl = document.getElementById("category-title");
    var categoryCountEl = document.getElementById("category-count");
    var categorySearchModal = document.getElementById("category-search-modal");
    var categorySearchInput = document.getElementById("category-search-input");
    var categorySearchResults = document.getElementById("category-search-results");
    var categorySearchOpeners = document.querySelectorAll("[data-category-search-open]");
    var categorySearchClosers = document.querySelectorAll("[data-category-search-close]");
    var dashboardViewEl = document.getElementById("dashboard-view");
    var dashNavEl = document.getElementById("dash-nav");
    var dashTrendsEl = document.getElementById("dash-trends");
    var dashTrendsSectionEl = document.getElementById("dash-trends-section");
    var dashGridEl = document.getElementById("dash-grid");
    var dashTitleEl = document.getElementById("dash-title");
    var dashCountEl = document.getElementById("dash-count");
    var dashSearchEl = document.getElementById("dash-search");
    var dashSearchInputEl = document.getElementById("dash-search-input");
    var dashMainEl = document.getElementById("dash-main");
    var dashContextEl = dashTitleEl && dashTitleEl.closest(".dash-context");
    // Created here rather than written into the three catalogue shells
    // (index.html, 404.html, tools/index.html), which would otherwise all need
    // the same markup by hand.
    var dashSectionsEl = null;
    if (dashGridEl) {
        dashSectionsEl = document.createElement("div");
        dashSectionsEl.className = "dash-sections";
        dashSectionsEl.id = "dash-sections";
        dashSectionsEl.hidden = true;
        dashGridEl.parentNode.insertBefore(dashSectionsEl, dashContextEl || dashGridEl);
    }
    var dashState = { selected: "", base: [], all: [] };
    var categorySearchGroups = [];
    var categorySearchPreviousFocus = null;
    var CATEGORY_SLUG_ALIASES = {
        "learning": "learn-design",
        "inspiration": "design-inspirations",
        "community": "design-communities",
        "color-tools": "color-palatte",
        "mockups-kits": "ui-kits",
        "web-builders": "website-builder-tools"
    };

    function getPathParts() {
        return window.location.pathname.split("/").filter(Boolean).map(function (part) {
            return slugify(decodeURIComponent(part));
        });
    }

    function getRouteSlugFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var querySlug = slugify(params.get("t") || "");

        if (querySlug) {
            return querySlug;
        }

        var pathParts = getPathParts();
        var categoryIndex = pathParts.indexOf("category");
        if (categoryIndex !== -1 && pathParts[categoryIndex + 2]) {
            return pathParts[categoryIndex + 2];
        }

        var toolsIndex = pathParts.indexOf("tools");
        if (toolsIndex !== -1 && pathParts[toolsIndex + 1] && pathParts[toolsIndex + 1] !== "category") {
            return pathParts[toolsIndex + 1];
        }

        return "";
    }

    // The site root is the catalogue: "/" renders the same dashboard as
    // /category/. Checked before slugify so "/index.html" matches too.
    function isRootRoute() {
        var path = window.location.pathname.replace(/\/index\.html?$/i, "/");
        return path === "/" || path === "";
    }

    function isToolsRoute() {
        var pathParts = getPathParts();
        var params = new URLSearchParams(window.location.search);
        return isRootRoute() ||
            pathParts.indexOf("tools") !== -1 ||
            pathParts.indexOf("category") !== -1 ||
            Boolean(params.get("t") || params.get("category"));
    }

    function getCategorySlugFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var queryCategory = slugify(params.get("category") || "");
        if (queryCategory) return normalizeCategorySlug(queryCategory);

        var pathParts = getPathParts();
        var categoryIndex = pathParts.indexOf("category");
        if (categoryIndex !== -1 && pathParts[categoryIndex + 1]) {
            return normalizeCategorySlug(pathParts[categoryIndex + 1]);
        }

        var toolsIndex = pathParts.indexOf("tools");
        if (toolsIndex !== -1 && pathParts[toolsIndex + 1] === "category" && pathParts[toolsIndex + 2]) {
            return normalizeCategorySlug(pathParts[toolsIndex + 2]);
        }

        return "";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function parseCategories(value) {
        return String(value || "").split(/[,;]/).map(function (p) { return p.trim(); }).filter(Boolean);
    }

    function slugify(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function normalizeCategorySlug(slug) {
        return CATEGORY_SLUG_ALIASES[slug] || slug;
    }

    function categoryHref(categorySlug) {
        return "/category/" + encodeURIComponent(normalizeCategorySlug(slugify(categorySlug))) + "/";
    }

    function getToolCategorySlug(tool, fallbackSlug) {
        if (fallbackSlug) return normalizeCategorySlug(slugify(fallbackSlug));
        if (tool && tool.categories && tool.categories.length) {
            return normalizeCategorySlug(slugify(tool.categories[0]));
        }
        return "tools";
    }

    function toolHref(tool, categorySlug) {
        return categoryHref(getToolCategorySlug(tool, categorySlug)) + encodeURIComponent(tool.slug) + "/";
    }

    function splitThumbnailLinks(value) {
        return String(value || "").split(/\n+|,\s*(?=https?:\/\/)/).map(function (p) { return p.trim(); }).filter(Boolean);
    }

    function normalizePrice(value) {
        var cleaned = String(value || "").trim().toLowerCase();
        if (!cleaned) return "free";
        if (cleaned.indexOf("freemium") !== -1) return "freemium";
        if (cleaned.indexOf("paid") !== -1 || cleaned.indexOf("premium") !== -1) return "paid";
        if (cleaned.indexOf("free") !== -1) return "free";
        return cleaned;
    }

    function formatPrice(value) {
        return String(value || "").replace(/-/g, " ").toUpperCase();
    }

    function getInitials(title) {
        return String(title || "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(function (part) { return part.charAt(0).toUpperCase(); })
            .join("") || "DW";
    }

    // One referral tag per outbound link: ref=designwallet, the same tag the
    // Sheet's links already carry. It is added only when a link has no ref of
    // its own, so a partner's affiliate ref is never overwritten, and the old
    // via=designwallet is dropped — adding it on top of the Sheet's ref gave
    // every link two tags ("?ref=designwallet&via=designwallet").
    function addReferralParam(link) {
        try {
            var url = new URL(link);
            if (!url.searchParams.has("ref")) url.searchParams.set("ref", "designwallet");
            url.searchParams.delete("via");
            return url.toString();
        } catch (e) {
            return link;
        }
    }

    /**
     * One Supabase row → the tool object the rest of this file renders.
     *
     * The shape is unchanged from the Google Sheet era, deliberately: every
     * renderer, filter and search path downstream still receives exactly what
     * it did before. What disappeared is the parsing — header aliases, missing
     * header rows, comma-splitting of column names — because the sync job in
     * `supabase/sheet-sync.gs` resolved all of that before the row was stored.
     */
    function toTool(row) {
        var thumbnails = splitThumbnailLinks(row.thumbnails);
        var price = normalizePrice(row.pricing);

        return {
            title: row.title || "",
            subtitle: row.subtitle || row.description || "",
            description: row.description || row.subtitle || "Curated design resource.",
            categories: parseCategories(row.categories),
            price: price,
            priceLabel: formatPrice(price),
            link: row.link || "",
            icon: row.image || "",
            thumbnail: thumbnails[0] || "",
            thumbnails: thumbnails,
            slug: row.slug || "",
            initials: getInitials(row.title)
        };
    }

    function dedupeTools(tools) {
        var bySlug = {};
        var merged = [];

        tools.forEach(function (tool) {
            if (!bySlug[tool.slug]) {
                bySlug[tool.slug] = tool;
                merged.push(tool);
                return;
            }

            var existing = bySlug[tool.slug];
            existing.categories = Array.from(new Set(
                existing.categories.concat(tool.categories || []).filter(Boolean)
            ));

            if (!existing.thumbnail && tool.thumbnail) existing.thumbnail = tool.thumbnail;
            if (!existing.icon && tool.icon) existing.icon = tool.icon;
            if (!existing.link && tool.link) existing.link = tool.link;
            if (!existing.subtitle && tool.subtitle) existing.subtitle = tool.subtitle;

            var thumbnails = (existing.thumbnails || []).concat(tool.thumbnails || []).filter(Boolean);
            existing.thumbnails = Array.from(new Set(thumbnails));
        });

        return merged;
    }

    function getCategoryGroups(tools) {
        var groups = {};
        tools.forEach(function (tool) {
            tool.categories.forEach(function (category) {
                var slug = slugify(category);
                if (!slug) return;
                if (!groups[slug]) {
                    groups[slug] = { title: category, slug: slug, tools: [], previewImage: "" };
                }
                groups[slug].tools.push(tool);
                if (!groups[slug].previewImage) {
                    groups[slug].previewImage = tool.thumbnail || tool.icon || "";
                }
            });
        });

        return Object.keys(groups)
            .map(function (key) { return groups[key]; })
            .sort(function (left, right) { return left.title.localeCompare(right.title); });
    }

    function findCategoryGroup(tools, categorySlug) {
        var groups = getCategoryGroups(tools);
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].slug === categorySlug) return groups[i];
        }
        return null;
    }

    function renderCategorySearchResults(query) {
        if (!categorySearchResults) return;

        var normalizedQuery = String(query || "").trim().toLowerCase();
        var matches = categorySearchGroups.filter(function (group) {
            var haystack = [
                group.title,
                group.slug,
                group.tools.map(function (tool) { return tool.title; }).join(" ")
            ].join(" ").toLowerCase();
            return !normalizedQuery || haystack.indexOf(normalizedQuery) !== -1;
        }).slice(0, 12);

        if (!categorySearchGroups.length) {
            categorySearchResults.innerHTML = '<p class="category-search-empty">Categories are still loading...</p>';
            return;
        }

        if (!matches.length) {
            categorySearchResults.innerHTML = '<p class="category-search-empty">No categories match that search.</p>';
            return;
        }

        categorySearchResults.innerHTML = matches.map(function (group) {
            var sampleTools = group.tools.slice(0, 3).map(function (tool) {
                return escapeHtml(tool.title);
            }).join(", ");

            return [
                '<a class="category-search-result" href="',
                categoryHref(group.slug),
                '">',
                '<span>',
                '<strong>',
                escapeHtml(group.title),
                '</strong>',
                '<small>',
                escapeHtml(sampleTools || "View category tools"),
                '</small>',
                '</span>',
                '<em>',
                group.tools.length,
                ' tool',
                group.tools.length === 1 ? '' : 's',
                '</em>',
                '</a>'
            ].join("");
        }).join("");
    }

    function openCategorySearch() {
        if (!categorySearchModal) return;
        categorySearchPreviousFocus = document.activeElement;
        categorySearchModal.hidden = false;
        document.body.classList.add("category-search-open");
        renderCategorySearchResults(categorySearchInput ? categorySearchInput.value : "");

        window.setTimeout(function () {
            if (categorySearchInput) {
                categorySearchInput.focus();
                categorySearchInput.select();
            }
        }, 30);
    }

    function closeCategorySearch() {
        if (!categorySearchModal) return;
        categorySearchModal.hidden = true;
        document.body.classList.remove("category-search-open");

        if (categorySearchInput) {
            categorySearchInput.value = "";
        }

        if (categorySearchPreviousFocus && typeof categorySearchPreviousFocus.focus === "function") {
            categorySearchPreviousFocus.focus();
        }
    }

    function attachCategorySearchListeners() {
        categorySearchOpeners.forEach(function (opener) {
            opener.addEventListener("click", openCategorySearch);
        });

        categorySearchClosers.forEach(function (closer) {
            closer.addEventListener("click", closeCategorySearch);
        });

        if (categorySearchInput) {
            categorySearchInput.addEventListener("input", function () {
                renderCategorySearchResults(categorySearchInput.value);
            });
        }

        if (categorySearchResults) {
            categorySearchResults.addEventListener("click", function (event) {
                var link = event.target.closest ? event.target.closest("a") : null;
                if (link) closeCategorySearch();
            });
        }

        document.addEventListener("keydown", function (event) {
            var isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
            if (isSearchShortcut) {
                event.preventDefault();
                openCategorySearch();
                return;
            }

            if (event.key === "Escape" && categorySearchModal && !categorySearchModal.hidden) {
                closeCategorySearch();
            }
        });
    }

    // The heart. tools/favourites.js fills it in, paints its state and count,
    // and handles the click; this only says which tool it belongs to.
    function favButtonMarkup(tool, extraClass) {
        return '<button class="dw-fav' + (extraClass ? " " + extraClass : "") + '" type="button" data-fav="' +
            escapeHtml(tool.slug) + '" data-fav-name="' + escapeHtml(tool.title) + '"></button>';
    }

    function createToolCardMarkup(tool, categorySlug) {
        var logo = tool.icon
            ? '<span class="logo-badge has-image"><img src="' + escapeHtml(iconUrl(tool.icon)) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
            : '<span class="logo-badge">' + escapeHtml(tool.initials || getInitials(tool.title)) + '</span>';
        var priceBadgeClass = "price-badge";
        if (tool.price === "free") priceBadgeClass += " price-free";
        if (tool.price === "freemium") priceBadgeClass += " price-freemium";

        return [
            '<a class="resource-card" href="',
            toolHref(tool, categorySlug),
            '" aria-label="Open ',
            escapeHtml(tool.title),
            '">',
            '<div class="card-shell">',
            '<div class="card-top">',
            logo,
            '<h3>',
            escapeHtml(tool.title),
            '</h3>',
            '<span class="',
            priceBadgeClass,
            '">',
            escapeHtml(tool.priceLabel || formatPrice(tool.price)),
            '</span>',
            favButtonMarkup(tool),
            '</div>',
            tool.thumbnail
                ? '<div class="card-thumb-wrap"><img class="card-thumb" src="' + escapeHtml(tool.thumbnail) + '" alt="" loading="lazy"></div>'
                : '',
            '<div class="card-divider" aria-hidden="true"></div>',
            '<div class="card-footer"><div class="card-footer-actions"><span class="card-action" aria-hidden="true">',
            '<svg class="card-action-arrow" width="16" height="16" viewBox="0 0 24 24" stroke-width="1.5" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.00005 19L19 5.99996M19 5.99996V18.48M19 5.99996H6.52005" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
            '</span></div></div>',
            '</div>',
            '</a>'
        ].join("");
    }

    function priceClassName(price) {
        if (price === "free") return "price-free";
        if (price === "freemium") return "price-freemium";
        return "price-paid";
    }

    // Tool logos are favicons, and they are ALREADY 1:1 — measured across a
    // 24-icon sample, 23 are exact squares (the one exception is a .jpg, not a
    // favicon). So the job here is simply "deliver that square at a usable
    // size", nothing more.
    //
    // DO NOT REINTRODUCE `t-true`. Trimming looks like the right idea — strip
    // each logo's padding so they all read at one scale — but it strips a
    // uniform border of ANY colour, which on a favicon is usually the brand
    // plate itself. 10kdesigners is the worked example: a 64x64 purple tile
    // with "10k" on it, trimmed down to the 41x14 bounding box of the white
    // text, then upscaled 3x to fill 128 — arriving as a giant blurry wordmark
    // on a white band, which reads as a badly cropped image. It destroyed the
    // logo it was meant to normalise.
    //
    //   w-128,h-128     a square source stays square and is untouched but for
    //                   scaling. 128 is 2x the 52px holder, so it stays crisp.
    //   cm-pad_resize   the rare non-square source is letterboxed, never
    //                   cropped, and pad_resize UPSCALES (c-at_max does not).
    //   bg-00000000     pad with TRANSPARENT, not ImageKit's default white —
    //                   a white band inside a dark tile is exactly the "white
    //                   space" this is meant to avoid.
    //
    // Sources below 128px are upscaled and will look soft — that is a
    // source-image limit no transform can fix; those need better favicons in
    // the Sheet.
    //
    // Non-ImageKit URLs are returned untouched.
    function iconUrl(url) {
        if (!url || url.indexOf("ik.imagekit.io") === -1) return url;
        if (url.indexOf("tr=") !== -1) return url;          // already transformed
        return url + (url.indexOf("?") === -1 ? "?" : "&") + "tr=w-128,h-128,cm-pad_resize,bg-00000000";
    }

    function createDashCardMarkup(tool, categorySlug) {
        var detailUrl = toolHref(tool, categorySlug);
        var logo = tool.icon
            ? '<span class="dash-card-logo"><img src="' + escapeHtml(iconUrl(tool.icon)) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
            : '<span class="dash-card-logo">' + escapeHtml(tool.initials || getInitials(tool.title)) + '</span>';
        var dollar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
        var primaryCat = (tool.categories && tool.categories[0]) || "";
        var catSlug = primaryCat ? normalizeCategorySlug(slugify(primaryCat)) : "";
        var catHref = primaryCat ? "/category/?category=" + encodeURIComponent(catSlug) : "/category/";
        var arrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H8M17 7V16"/></svg>';
        var tagIcon = categoryIconMarkup(catSlug, 13,
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>');

        return [
            '<div class="dash-card">',
            '<a class="dash-card-hit" href="', detailUrl, '" aria-label="Open ', escapeHtml(tool.title), '"></a>',
            '<div class="dash-card-top">',
            logo,
            '<div class="dash-card-badges">', favButtonMarkup(tool), '<span class="dash-badge ', priceClassName(tool.price), '">', dollar, escapeHtml(tool.priceLabel || formatPrice(tool.price)), '</span></div>',
            '</div>',
            '<h3 class="dash-card-title">', escapeHtml(tool.title), '</h3>',
            '<p class="dash-card-desc">', escapeHtml(tool.description), '</p>',
            '<div class="dash-card-footer">',
            primaryCat
                ? '<a class="dash-card-tag" href="' + catHref + '">' + tagIcon + '<span>' + escapeHtml(primaryCat) + '</span></a>'
                : '<span></span>',
            '<a class="dash-card-visit" href="', escapeHtml(addReferralParam(tool.link)), '" target="_blank" rel="noopener noreferrer" aria-label="Visit ', escapeHtml(tool.title), '">', arrow, '</a>',
            '</div>',
            '</div>'
        ].join("");
    }

    // Categories that ship their own icon (sidebar rows AND card footer tags).
    //
    // To add one: drop the file in /public/icons/ named after the category
    // slug, then add a "slug": "filename" entry here. Slugs not listed fall
    // back to the generic hash glyph.
    //
    // The file is painted as a CSS mask filled with currentColor (see
    // .dash-icon-mask), so one asset covers both themes and only its ALPHA
    // matters — the artwork's own colours are discarded.
    //   - SVG (preferred): stroke/fill artwork on a transparent canvas. Scales
    //     cleanly and needs no preprocessing.
    //   - PNG: must be genuinely transparent AND reach full opacity. A baked-in
    //     background masks as a solid block; a half-opaque export renders faint.
    //
    // Filenames are listed in full because the set mixes .svg and .png. Once
    // everything is SVG this can collapse back to a bare list of slugs.
    var CATEGORY_ICONS = {
        "3d-tools":                   "3d-tools.png",
        "accessibility":              "accessibility.png",
        "ad-design":                  "ad-design.svg",
        "ai-creative-suites":         "ai-creative-suites.svg",
        "ai-tools":                   "ai-tools.svg",
        "ai-voiceover":               "ai-voiceover.svg",
        "branding":                   "branding.svg",
        "color-palatte":              "color-palatte.svg",
        "design-communities":         "design-communities.svg",
        "design-courses":             "design-courses.svg",
        "design-inspirations":        "design-inspirations.svg",
        "design-jobs":                "design-jobs.svg",
        "design-podcasts":            "design-podcasts.svg",
        "design-portfolios":          "design-portfolios.svg",
        "design-softwares":           "design-softwares.svg",
        "design-systems":             "design-systems.svg",
        "email-builder":              "email-builder.svg",
        "figma-kit":                  "figma-kit.svg",
        "framer-components":          "framer-components.svg",
        "gradients":                  "gradients.svg",
        "icons":                      "icons.svg",
        "illustrations":              "illustrations.svg",
        "img-gen":                    "img-gen.svg",
        "landing-pages-inspirations": "landing-pages-inspirations.svg",
        "learn-design":               "learn-design.svg",
        "logo-inspirations":          "logo-inspirations.svg",
        "mcp-connectors":             "mcp-connectors.svg",
        "mockup-websites":            "mockup-websites.svg",
        "presentation-design":        "presentation-design.svg",
        "prototyping-tools":          "prototyping-tools.svg",
        "stock-images":               "stock-images.svg",
        "typography":                 "typography.svg",
        "ugc-ads":                    "ugc-ads.svg",
        "ui-ux-inspirations":         "ui-ux-inspirations.svg",
        "ux-tools":                   "ux-tools.svg",
        "vibe-coding":                "vibe-coding.svg",
        "vid-gen":                    "vid-gen.svg",
        "website-builder-tools":      "website-builder-tools.svg",
        "youtube-channels":           "youtube-channels.svg"
    };

    function categoryIconUrl(slug) {
        var file = CATEGORY_ICONS[slug];
        return file ? "/public/icons/" + file : "";
    }

    // Returns the category's own icon as a currentColor mask, or `fallback`
    // when that category has no icon. Used by both the sidebar rows and the
    // card footer tags, which differ only in size.
    function categoryIconMarkup(slug, size, fallback) {
        var url = slug ? categoryIconUrl(slug) : "";
        if (!url) return fallback;
        return '<span class="dash-icon-mask" style="width:' + size + 'px;height:' + size +
            'px;-webkit-mask-image:url(\'' + url + '\');mask-image:url(\'' + url + '\')"></span>';
    }

    // On a phone the sidebar is one sideways-scrolling row of chips
    // (dashboard.css, max-width 767px). Scroll it so the selected category's
    // chip is in view, rather than leaving it off to the right. The sidebar
    // only scrolls sideways at that width, so this is a no-op on desktop.
    function revealActiveChip() {
        var sidebar = dashNavEl && dashNavEl.closest(".dash-sidebar");
        if (!sidebar || sidebar.scrollWidth <= sidebar.clientWidth) return;
        var active = sidebar.querySelector('.dash-nav [aria-current="true"]');
        if (!active || active.textContent.indexOf("All") === 0) return;
        sidebar.scrollLeft += active.getBoundingClientRect().left - sidebar.getBoundingClientRect().left - 16;
    }

    function dashNavRowMarkup(label, href, count, isActive, isAll, slug) {
        var icon;
        if (slug === FAVOURITES_SLUG) {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
        } else if (isAll) {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
        } else {
            icon = categoryIconMarkup(slug, 16, '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>');
        }
        return [
            '<a class="dash-nav-row"', (isActive ? ' aria-current="true"' : ''), ' href="', href, '">',
            '<span class="dash-nav-icon">', icon, '</span>',
            '<span class="dash-nav-label">', escapeHtml(label), '</span>',
            '<span class="dash-nav-count">', count, '</span>',
            '</a>'
        ].join("");
    }

    // Builds the "Hot trends" rows from DW_TRENDS against the live tool set.
    // Rows are visually identical to the category rows — same icon, label and
    // count — because a trend IS a category shortcut; giving it its own visual
    // language would just make the sidebar noisier.
    function renderTrendsNav(tools, selectedSlug, activeQuery) {
        if (!dashTrendsEl) return;

        var groups = getCategoryGroups(tools);
        var bySlug = {};
        groups.forEach(function (g) { bySlug[g.slug] = g; });

        var rows = [];
        DW_TRENDS.forEach(function (trend) {
            var group = bySlug[trend.slug];
            if (group) {
                rows.push(dashNavRowMarkup(
                    trend.label,
                    "/category/?category=" + encodeURIComponent(group.slug),
                    group.tools.length,
                    group.slug === selectedSlug,
                    false,
                    group.slug
                ));
                return;
            }

            // No such category yet — fall back to the search that best stands
            // in for it, and skip the row entirely when that finds nothing.
            var words = String(trend.query || "").toLowerCase().split(/\s+/).filter(Boolean);
            if (!words.length) return;
            var count = tools.filter(function (tool) { return toolMatchesQuery(tool, words); }).length;
            if (!count) return;

            rows.push(dashNavRowMarkup(
                trend.label,
                "/category/?q=" + encodeURIComponent(trend.query),
                count,
                !selectedSlug && activeQuery === trend.query,
                false,
                trend.slug
            ));
        });

        dashTrendsEl.innerHTML = rows.join("");
        // Hide the whole block, heading included, rather than leaving an
        // orphan "Hot trends" label above nothing.
        if (dashTrendsSectionEl) dashTrendsSectionEl.hidden = rows.length === 0;
    }

    // ── Favourites view: /category/favourites/ ──────────────────────────────
    // A pseudo-category, so it reuses the whole dashboard: sidebar, search,
    // grid. It holds everything this person hearted (tools/favourites.js),
    // split into sections: their tools grouped by category, then Books, then
    // Portfolios (Karthik, 2026-10-31).
    var FAVOURITES_SLUG = "favourites";

    function favourites() {
        return window.DWFavourites || null;
    }

    // Books and portfolios aren't in the tool data, so the view fetches them
    // the first time it needs them, once per page load. Both views are public
    // reads with the publishable key, as on /books/ and the Wall.
    var savedExtras = {
        book: { path: "public_books?select=slug,title,author,rating,thumbnail,link&limit=1000", rows: null, loading: false },
        portfolio: { path: "public_portfolios?select=link,title,image&limit=2000", rows: null, loading: false }
    };

    function loadSavedExtras(kind) {
        var extra = savedExtras[kind];
        if (extra.rows || extra.loading) return;
        extra.loading = true;
        fetchSupabase(extra.path, function (rows) {
            extra.rows = rows;
            extra.loading = false;
            if (dashState.selected === FAVOURITES_SLUG) renderDashboard(dashState.all, dashState.selected);
        }, function () {
            // Show the tools anyway; the next visit tries again.
            extra.rows = [];
            extra.loading = false;
            if (dashState.selected === FAVOURITES_SLUG) renderDashboard(dashState.all, dashState.selected);
        });
    }

    // The saved books or portfolios this person still has, in the order the
    // data has them. `null` while their data is on its way.
    function savedExtraRows(kind) {
        var fav = favourites();
        var keys = fav ? fav.keys(kind) : [];
        if (!keys.length) return [];
        var extra = savedExtras[kind];
        if (!extra.rows) {
            loadSavedExtras(kind);
            return null;
        }
        var wanted = {};
        keys.forEach(function (key) { wanted[key] = true; });
        return extra.rows.filter(function (row) {
            return wanted[kind === "book" ? row.slug : row.link];
        });
    }

    // The same cleaning wall.js does: the Sheet's portfolio titles are page
    // titles ("Tanmay Kashyap • UX/UI Designer • Portfolio"), so keep the name.
    function portfolioName(title) {
        var cleaned = String(title || "").split(/\s*[•|·]\s*| [-–—] |\s*,\s*/)[0].trim();
        cleaned = cleaned.replace(/\s*[-–—|]\s*(home|portfolio)$/i, "").trim();
        return cleaned.length >= 2 ? cleaned : String(title || "").trim();
    }

    function hostOf(link) {
        try { return new URL(link).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
    }

    var SAVED_KIND = {
        book: { label: "Books", tag: "Book", href: "/books/", icon: "/public/icons/nav/wallet-reads.svg" },
        portfolio: { label: "Portfolios", tag: "Portfolio", href: "/wall-of-portfolios/", icon: "/public/icons/nav/wall-of-portfolios.svg" }
    };

    // A saved book is the same card as on /books/ (books/book-card.js), with
    // the Best Seller tag if it's in the books list's first five, as there.
    // A saved portfolio is drawn as a dash card and opens its own link.
    function savedExtraCardMarkup(kind, row) {
        if (kind === "book" && typeof window.DWBookCard === "function") {
            return window.DWBookCard(row, savedExtras.book.rows.indexOf(row));
        }
        var meta = SAVED_KIND[kind];
        var isBook = kind === "book";
        var key = isBook ? row.slug : row.link;
        var title = isBook ? row.title : (portfolioName(row.title) || hostOf(row.link));
        var desc = isBook ? row.author : hostOf(row.link);
        var image = isBook ? row.thumbnail : row.image;
        var link = row.link || meta.href;
        var external = /^https?:\/\//i.test(link);
        var target = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        var arrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H8M17 7V16"/></svg>';
        var tagIcon = '<span class="dash-icon-mask" style="width:13px;height:13px;-webkit-mask-image:url(\'' + meta.icon + '\');mask-image:url(\'' + meta.icon + '\')"></span>';
        var logo = '<span class="dash-card-logo' + (isBook ? ' dash-card-logo--book' : '') + '">' +
            (image ? '<img src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : escapeHtml(getInitials(title))) +
            '</span>';

        return [
            '<div class="dash-card">',
            '<a class="dash-card-hit" href="', escapeHtml(link), '"', target, ' aria-label="Open ', escapeHtml(title), '"></a>',
            '<div class="dash-card-top">',
            logo,
            '<div class="dash-card-badges"><button class="dw-fav" type="button" data-fav-kind="', kind, '" data-fav="', escapeHtml(key),
            '" data-fav-name="', escapeHtml(title), '"></button></div>',
            '</div>',
            '<h3 class="dash-card-title">', escapeHtml(title), '</h3>',
            '<p class="dash-card-desc">', escapeHtml(desc), '</p>',
            '<div class="dash-card-footer">',
            '<a class="dash-card-tag" href="', meta.href, '">', tagIcon, '<span>', meta.tag, '</span></a>',
            external
                ? '<a class="dash-card-visit" href="' + escapeHtml(link) + '"' + target + ' aria-label="Open ' + escapeHtml(title) + '">' + arrow + '</a>'
                : '<span></span>',
            '</div>',
            '</div>'
        ].join("");
    }

    function savedExtraMatches(kind, row, words) {
        if (!words.length) return true;
        var haystack = (kind === "book"
            ? [row.title, row.author, "book"]
            : [row.title, hostOf(row.link), "portfolio"]).join(" ").toLowerCase();
        return words.every(function (word) { return haystack.indexOf(word) !== -1; });
    }

    // Which section the chips above the Favourites view show: "all", or a
    // section's id ("cat:<category>", "book", "portfolio").
    var favFilter = "all";

    function savedSectionMarkup(section) {
        return [
            '<section class="dash-section">',
            '<div class="dash-section-head">',
            '<h2 class="dash-section-title">', escapeHtml(section.title), '<span class="dash-fav-count">', section.cards.length, '</span></h2>',
            '</div>',
            carouselMarkup(section.title, section.cards, 1, section.kind),
            '</section>'
        ].join("");
    }

    function favFilterChipMarkup(id, label, count) {
        return '<button type="button" class="dash-fav-chip" data-fav-filter="' + escapeHtml(id) + '" aria-pressed="' +
            String(favFilter === id) + '">' + escapeHtml(label) + '<span>' + count + '</span></button>';
    }

    // The Favourites grid: a row of filter chips (Karthik, 2026-10-31), then
    // one sideways-scrolling row per section: each category the saved tools
    // belong to (by each tool's first category, so a tool appears once), then
    // the saved books and portfolios. Returns the number of items shown.
    function renderFavouritesGrid(tools, words) {
        var byCategory = {};
        tools.forEach(function (tool) {
            var category = (tool.categories && tool.categories[0]) || "Other";
            (byCategory[category] = byCategory[category] || []).push(tool);
        });
        var sections = Object.keys(byCategory).sort().map(function (category) {
            var list = byCategory[category].sort(function (a, b) { return a.title.localeCompare(b.title); });
            return {
                id: "cat:" + category,
                title: category,
                kind: "tool",
                cards: list.map(function (tool) { return createDashCardMarkup(tool, FAVOURITES_SLUG); })
            };
        });

        var pending = false;
        ["book", "portfolio"].forEach(function (kind) {
            var rows = savedExtraRows(kind);
            if (rows === null) { pending = true; return; }
            rows = rows.filter(function (row) { return savedExtraMatches(kind, row, words); });
            if (!rows.length) return;
            sections.push({
                id: kind,
                title: SAVED_KIND[kind].label,
                kind: kind,
                cards: rows.map(function (row) { return savedExtraCardMarkup(kind, row); })
            });
        });

        var fav = favourites();
        var total = sections.reduce(function (sum, section) { return sum + section.cards.length; }, 0);
        if (!total) {
            dashGridEl.innerHTML = pending || (fav && !fav.loaded())
                ? '<div class="dash-empty"><p>Loading your favourites…</p></div>'
                : words.length
                    ? '<div class="dash-empty"><p>No favourites match your search.</p>' +
                      '<button type="button" class="dash-empty-clear" data-dash-clear>Clear search</button></div>'
                    : '<div class="dash-empty"><p>No favourites yet. Tap the heart on any tool, book or portfolio to save it here.</p>' +
                      '<a class="dash-empty-clear" href="/category/">Browse all tools</a></div>';
            return 0;
        }

        // A filter whose section has gone (un-hearted, or searched away) falls back to All.
        if (!sections.some(function (section) { return section.id === favFilter; })) favFilter = "all";
        var shown = favFilter === "all" ? sections : sections.filter(function (section) { return section.id === favFilter; });

        var chips = [favFilterChipMarkup("all", "All", total)].concat(sections.map(function (section) {
            return favFilterChipMarkup(section.id, section.title, section.cards.length);
        }));

        dashGridEl.innerHTML =
            '<div class="dash-fav-filters" role="group" aria-label="Filter favourites">' + chips.join("") + '</div>' +
            shown.map(savedSectionMarkup).join("");
        updateCarouselButtons();
        return shown.reduce(function (sum, section) { return sum + section.cards.length; }, 0);
    }

    // Everything saved, of every kind: the sidebar's Favourites count.
    function favouritesTotal(tools) {
        var fav = favourites();
        return fav ? favouritesGroup(tools).tools.length + fav.keys("book").length + fav.keys("portfolio").length : 0;
    }

    function favouritesGroup(tools) {
        var fav = favourites();
        return {
            title: "Your favourites",
            slug: FAVOURITES_SLUG,
            tools: fav ? tools.filter(function (tool) { return fav.has(tool.slug); }) : []
        };
    }

    // When the set changes: the Favourites view re-renders (so un-hearting
    // removes the card); anywhere else only the sidebar count moves. A full
    // re-render there would throw away the carousels' scroll position.
    document.addEventListener("dw:favourites", function () {
        if (!dashState.all.length || (dashboardViewEl && dashboardViewEl.hidden)) return;
        if (dashState.selected === FAVOURITES_SLUG) {
            renderDashboard(dashState.all, dashState.selected);
            return;
        }
        var count = dashNavEl && dashNavEl.querySelector('.dash-nav-row[href="/category/' + FAVOURITES_SLUG + '/"] .dash-nav-count');
        if (count) count.textContent = favouritesTotal(dashState.all);
    });

    function renderDashboard(tools, categorySlug) {
        var groups = getCategoryGroups(tools);
        categorySearchGroups = groups;

        var selected = categorySlug || "";
        var group = selected === FAVOURITES_SLUG
            ? favouritesGroup(tools)
            : (selected ? findCategoryGroup(tools, selected) : null);
        if (selected && !group) {
            showNotFound("Category not found", "This category does not exist yet.");
            return;
        }

        var gridTools = group
            ? group.tools.slice()
            : tools.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
        var title = group ? group.title : "All Tools";

        // At the root the authored homepage title/description are the better
        // SEO surface, so leave them alone; only route-specific views override.
        if (!isRootRoute() || group) {
            document.title = (group ? group.title + (selected === FAVOURITES_SLUG ? "" : " Tools") : "Tool Categories") + " — Design Wallet™";
            var metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                metaDesc.setAttribute("content", group
                    ? "Browse " + group.title + " tools on Design Wallet."
                    : "Browse Design Wallet tools by category.");
            }
        }

        if (dashNavEl) {
            var rows = [dashNavRowMarkup("All", "/category/", tools.length, !selected, true)];
            var fav = favourites();
            if (fav && fav.signedIn()) {
                rows.push(dashNavRowMarkup("Favourites", "/category/" + FAVOURITES_SLUG + "/",
                    favouritesTotal(tools), selected === FAVOURITES_SLUG, false, FAVOURITES_SLUG));
            }
            groups.forEach(function (g) {
                rows.push(dashNavRowMarkup(g.title, "/category/?category=" + encodeURIComponent(g.slug), g.tools.length, g.slug === selected, false, g.slug));
            });
            dashNavEl.innerHTML = rows.join("");
        }

        renderTrendsNav(tools, selected, new URLSearchParams(window.location.search).get("q") || "");
        revealActiveChip();

        if (dashTitleEl) dashTitleEl.textContent = title;

        dashState.selected = selected;
        dashState.base = gridTools;
        dashState.all = tools;
        if (window.DWQuickSearch) window.DWQuickSearch.refresh();

        hideAllViews();
        if (dashboardViewEl) dashboardViewEl.hidden = false;
        document.body.classList.add("is-dashboard");

        // Apply any query already in the URL / search box (keeps the query across
        // the silent 5s data refresh too).
        var params = new URLSearchParams(window.location.search);
        var initialQ = (dashSearchInputEl && dashSearchInputEl.value) || params.get("q") || "";
        if (dashSearchInputEl && dashSearchInputEl.value !== initialQ) dashSearchInputEl.value = initialQ;
        applyDashSearch(initialQ);
    }

    // Live search: matches the query words against title, subtitle, description,
    // category names, and price ("free" / "paid" / "freemium"). Combined AND with
    // the selected category (dashState.base is already the category's tool set).
    function toolMatchesQuery(tool, words) {
        if (!words.length) return true;
        var haystack = [
            tool.title,
            tool.subtitle,
            tool.description,
            (tool.categories || []).join(" "),
            tool.priceLabel,
            tool.price
        ].join(" ").toLowerCase();
        for (var i = 0; i < words.length; i++) {
            if (haystack.indexOf(words[i]) === -1) return false;
        }
        return true;
    }

    function renderDashGrid(list) {
        if (!dashGridEl) return;
        if (!list.length) {
            dashGridEl.innerHTML =
                '<div class="dash-empty"><p>No tools match your search.</p>' +
                '<button type="button" class="dash-empty-clear" data-dash-clear>Clear search</button></div>';
            return;
        }
        dashGridEl.innerHTML = list.map(function (tool) {
            return createDashCardMarkup(tool, dashState.selected);
        }).join("");
    }

    // ── All view: Featured, then one carousel per category ───────────────────
    var FEATURED_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/></svg>';
    var CHEVRON_RIGHT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

    // `cards` is an array of card markup, so any kind of card can ride in a
    // carousel. `kind` (optional) lets the CSS size a track's columns.
    function carouselMarkup(label, cards, rows, kind) {
        var arrow = function (dir, path) {
            return '<button type="button" class="dash-carousel-btn" data-carousel-dir="' + dir + '" aria-label="' +
                (dir < 0 ? "Previous" : "Next") + ' ' + escapeHtml(label) + '">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg></button>';
        };
        return [
            '<div class="dash-carousel" data-carousel>',
            '<div class="dash-carousel-track" data-rows="', rows, '"', kind ? ' data-kind="' + kind + '"' : '', '>',
            cards.join(""),
            '</div>',
            '<div class="dash-carousel-nav">',
            arrow(-1, "M19 12H5M5 12l6-6M5 12l6 6"),
            arrow(1, "M5 12h14M19 12l-6-6M19 12l-6 6"),
            '</div>',
            '</div>'
        ].join("");
    }

    function renderDashSections(tools) {
        if (!dashSectionsEl) return;

        var bySlug = {};
        tools.forEach(function (tool) { bySlug[tool.slug] = tool; });
        var featured = DW_FEATURED.map(function (slug) { return bySlug[slug]; }).filter(Boolean);

        var groups = getCategoryGroups(tools)
            .filter(function (g) { return g.tools.length >= CATEGORY_ROW_MIN; })
            .sort(function (a, b) { return b.tools.length - a.tools.length || a.title.localeCompare(b.title); });

        var html = [];
        if (featured.length) {
            html.push(
                '<section class="dash-section dash-section--featured" aria-labelledby="dash-featured-title">',
                '<div class="dash-section-head">',
                '<h2 class="dash-section-title" id="dash-featured-title"><span class="dash-section-icon">', FEATURED_ICON, '</span>Featured</h2>',
                '</div>',
                carouselMarkup("Featured", featured.map(function (tool) { return createDashCardMarkup(tool, ""); }), 1),
                '</section>'
            );
        }

        if (groups.length) {
            html.push('<h2 class="dash-sections-heading">Popular categories</h2>');
            groups.forEach(function (g) {
                var href = "/category/?category=" + encodeURIComponent(g.slug);
                var icon = categoryIconMarkup(g.slug, 18, "");
                var list = g.tools.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
                html.push(
                    '<section class="dash-section">',
                    '<div class="dash-section-head">',
                    '<h3 class="dash-section-title">', icon ? '<span class="dash-section-icon">' + icon + '</span>' : '', escapeHtml(g.title), '</h3>',
                    '<a class="dash-section-link" href="', href, '">View category', CHEVRON_RIGHT, '</a>',
                    '</div>',
                    carouselMarkup(g.title, list.slice(0, CATEGORY_ROW_LIMIT).map(function (tool) { return createDashCardMarkup(tool, ""); }), 2),
                    '</section>'
                );
            });
        }

        dashSectionsEl.innerHTML = html.join("");
        updateCarouselButtons();
    }

    // Disables an arrow when its track can't scroll that way any further, and
    // hides both when everything already fits.
    function updateCarouselButtons(track) {
        var tracks = track ? [track] : document.querySelectorAll("#dash-sections .dash-carousel-track, #dash-grid .dash-carousel-track");
        Array.prototype.forEach.call(tracks, function (t) {
            var carousel = t.closest("[data-carousel]");
            var max = t.scrollWidth - t.clientWidth;
            carousel.classList.toggle("is-static", max <= 1);
            carousel.querySelector('[data-carousel-dir="-1"]').disabled = t.scrollLeft <= 1;
            carousel.querySelector('[data-carousel-dir="1"]').disabled = t.scrollLeft >= max - 1;
        });
    }

    // On the All view's sections and on the Favourites grid, which has its own
    // carousels.
    function attachCarouselListeners() {
        [dashSectionsEl, dashGridEl].forEach(function (root) {
            if (root) attachCarouselListenersTo(root);
        });

        var resizeTimer;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(function () { updateCarouselButtons(); }, 150);
        });
    }

    function attachCarouselListenersTo(root) {
        var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        root.addEventListener("click", function (event) {
            var btn = event.target.closest ? event.target.closest("[data-carousel-dir]") : null;
            if (!btn) return;
            var track = btn.closest("[data-carousel]").querySelector(".dash-carousel-track");
            // A page is the visible width less one card's peek, so the last
            // card on screen becomes the first on the next.
            var step = Math.max(track.clientWidth * 0.85, 200);
            track.scrollBy({ left: Number(btn.getAttribute("data-carousel-dir")) * step, behavior: reduceMotion ? "auto" : "smooth" });
        });

        // scroll doesn't bubble, so listen in the capture phase.
        root.addEventListener("scroll", function (event) {
            if (event.target.classList && event.target.classList.contains("dash-carousel-track")) {
                updateCarouselButtons(event.target);
            }
        }, true);
    }

    function applyDashSearch(query) {
        var q = String(query || "").trim();
        var words = q.toLowerCase().split(/\s+/).filter(Boolean);
        var filtered = dashState.base.filter(function (tool) { return toolMatchesQuery(tool, words); });

        // The All view with no search shows the grouped sections; a category
        // or a search shows the flat grid as before.
        var showSections = !!dashSectionsEl && !dashState.selected && !words.length;
        if (dashSectionsEl) dashSectionsEl.hidden = !showSections;
        if (dashContextEl) dashContextEl.hidden = showSections;
        if (dashGridEl) dashGridEl.hidden = showSections;
        var saved = -1;
        if (dashGridEl) dashGridEl.classList.toggle("is-favourites", dashState.selected === FAVOURITES_SLUG);
        if (showSections) {
            renderDashSections(dashState.all);
        } else if (dashState.selected === FAVOURITES_SLUG) {
            if (dashGridEl) saved = renderFavouritesGrid(filtered, words);
        } else {
            renderDashGrid(filtered);
        }

        if (dashCountEl && saved >= 0) {
            dashCountEl.textContent = words.length
                ? "Showing " + saved + " result" + (saved === 1 ? "" : "s") + " for “" + q + "”"
                : saved ? saved + " saved" : "";
        } else if (dashCountEl) {
            dashCountEl.textContent = words.length
                ? "Showing " + filtered.length + " result" + (filtered.length === 1 ? "" : "s") + " for “" + q + "”"
                : dashState.base.length + " tool" + (dashState.base.length === 1 ? "" : "s");
        }

        try {
            var url = new URL(window.location.href);
            if (words.length) url.searchParams.set("q", q); else url.searchParams.delete("q");
            window.history.replaceState(null, "", url.toString());
        } catch (e) {}
    }

    function hideAllViews() {
        if (loadingEl) loadingEl.hidden = true;
        if (dashboardViewEl) dashboardViewEl.hidden = true;
        if (contentEl) contentEl.hidden = true;
        if (notFoundEl) notFoundEl.hidden = true;
        document.body.classList.remove("is-dashboard");
    }

    function renderCategoryIndex(tools) {
        var groups = getCategoryGroups(tools);
        categorySearchGroups = groups;
        renderCategorySearchResults("");
        document.title = "Tool Categories — Design Wallet™";
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", "Browse Design Wallet tools by category.");

        if (categoryGridEl) {
            categoryGridEl.innerHTML = groups.map(function (group) {
                var previewTools = group.tools.slice(0, 3).map(function (tool) {
                    return '<span>' + escapeHtml(tool.title) + '</span>';
                }).join("");

                return [
                    '<a class="category-card" href="',
                    categoryHref(group.slug),
                    '" aria-label="Browse ',
                    escapeHtml(group.title),
                    ' tools">',
                    '<div class="category-card-image">',
                    group.previewImage ? '<img src="' + escapeHtml(group.previewImage) + '" alt="Preview for ' + escapeHtml(group.title) + ' category" loading="lazy">' : '<div class="category-card-image-fallback">' + escapeHtml(group.title.charAt(0)) + '</div>',
                    '</div>',
                    '<div class="category-card-top">',
                    '<h2>',
                    escapeHtml(group.title),
                    '</h2>',
                    '<span>',
                    group.tools.length,
                    '</span>',
                    '</div>',
                    '<div class="category-card-preview">',
                    previewTools || '<span>View tools</span>',
                    '</div>',
                    '<div class="category-card-action">View category',
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H8M17 7V16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    '</div>',
                    '</a>'
                ].join("");
            }).join("");
        }

        hideAllViews();
        if (categoryIndexEl) categoryIndexEl.hidden = false;
    }

    function renderCategoryList(group) {
        document.title = group.title + " Tools — Design Wallet™";
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", "Browse " + group.title + " tools on Design Wallet.");

        if (categoryTitleEl) categoryTitleEl.textContent = group.title;
        if (categoryCountEl) {
            categoryCountEl.textContent = group.tools.length + " tool" + (group.tools.length === 1 ? "" : "s") + " mapped to this category.";
        }
        if (categoryToolGridEl) {
            categoryToolGridEl.innerHTML = group.tools.map(function (tool) {
                return createToolCardMarkup(tool, group.slug);
            }).join("");
        }

        hideAllViews();
        if (categoryListEl) categoryListEl.hidden = false;
    }

    function renderTool(tool, allTools) {
        var currentCategorySlug = getCategorySlugFromUrl();
        var routeCategorySlug = getToolCategorySlug(tool, currentCategorySlug);
        document.title = tool.title + " — Design Wallet™";
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", tool.subtitle || "Discover " + tool.title + " on Design Wallet.");

        // Icon
        var iconEl = document.getElementById("tool-icon");
        if (iconEl) {
            if (tool.icon) {
                iconEl.innerHTML = '<img src="' + escapeHtml(iconUrl(tool.icon)) + '" alt="' + escapeHtml(tool.title) + '">';
            } else {
                var initials = tool.title.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("");
                iconEl.textContent = initials || "DW";
                iconEl.classList.add("tool-icon-fallback");
            }
        }

        // Title & subtitle
        var titleEl = document.getElementById("tool-title");
        var subtitleEl = document.getElementById("tool-subtitle");
        if (titleEl) titleEl.textContent = tool.title;
        if (subtitleEl) subtitleEl.textContent = tool.subtitle;

        // Visit button
        var visitBtn = document.getElementById("tool-visit-btn");
        if (visitBtn) visitBtn.href = addReferralParam(tool.link);

        // The heart, beside Visit. Rebuilt per tool so favourites.js paints
        // it fresh (it only paints buttons it hasn't seen).
        if (visitBtn) {
            var oldFav = document.getElementById("tool-fav-btn");
            if (oldFav) oldFav.remove();
            visitBtn.insertAdjacentHTML("afterend", favButtonMarkup(tool, "dw-fav--large").replace("<button ", '<button id="tool-fav-btn" '));
        }

        var backLink = document.getElementById("tool-back-link");
        if (backLink) {
            backLink.href = currentCategorySlug ? categoryHref(routeCategorySlug) : "/category/";
        }

        // Categories
        var categoriesEl = document.getElementById("tool-categories");
        if (categoriesEl) {
            categoriesEl.innerHTML = tool.categories.map(function (cat) {
                return '<span class="tool-tag">' + escapeHtml(cat) + '</span>';
            }).join("");
        }

        // Screenshot
        var screenshotEl = document.getElementById("tool-screenshot");
        if (screenshotEl) {
            var thumbnails = Array.isArray(tool.thumbnails) && tool.thumbnails.length ? tool.thumbnails : (tool.thumbnail ? [tool.thumbnail] : []);
            screenshotEl.classList.toggle("is-gallery", thumbnails.length > 1);

            if (thumbnails.length) {
                screenshotEl.innerHTML = thumbnails.map(function (src, index) {
                    var alt = index === 0
                        ? tool.title + " screenshot"
                        : tool.title + " screenshot " + (index + 1);
                    return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="lazy">';
                }).join("");
                screenshotEl.hidden = false;
            } else {
                screenshotEl.innerHTML = "";
                screenshotEl.hidden = true;
            }
        }

        // Prev/Next navigation
        var currentIndex = -1;
        for (var i = 0; i < allTools.length; i++) {
            if (allTools[i].slug === tool.slug) { currentIndex = i; break; }
        }

        var prevTool = currentIndex > 0 ? allTools[currentIndex - 1] : null;
        var nextTool = currentIndex < allTools.length - 1 ? allTools[currentIndex + 1] : null;

        var prevLink = document.getElementById("tool-prev");
        var nextLink = document.getElementById("tool-next");
        var prevName = document.getElementById("tool-prev-name");
        var nextName = document.getElementById("tool-next-name");

        if (prevLink && prevName && prevTool) {
            prevLink.href = toolHref(prevTool, routeCategorySlug);
            prevName.textContent = prevTool.title;
            prevLink.style.visibility = "";
        } else if (prevLink) {
            prevLink.style.visibility = "hidden";
        }

        if (nextLink && nextName && nextTool) {
            nextLink.href = toolHref(nextTool, routeCategorySlug);
            nextName.textContent = nextTool.title;
            nextLink.style.visibility = "";
        } else if (nextLink) {
            nextLink.style.visibility = "hidden";
        }

        if (nextLink && tool.slug === "saasframe") {
            nextLink.style.display = "none";
        } else if (nextLink) {
            nextLink.style.display = "";
        }

        // Show content
        hideAllViews();
        if (contentEl) contentEl.hidden = false;
    }

    function showNotFound(title, message) {
        hideAllViews();
        if (notFoundEl) {
            var heading = notFoundEl.querySelector("h2");
            var copy = notFoundEl.querySelector("p");
            if (heading && title) heading.textContent = title;
            if (copy && message) copy.textContent = message;
            notFoundEl.hidden = false;
        }
    }

    function getCachedTools() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var cached = JSON.parse(raw);
            if (Date.now() - cached.timestamp > CACHE_TTL) return null;
            return Array.isArray(cached.tools) ? cached.tools : null;
        } catch (e) { return null; }
    }

    function setCachedTools(tools) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), tools: tools }));
        } catch (e) {}
    }

    /**
     * One request, plain `fetch`. The Sheet needed JSONP — neither gviz nor
     * Apps Script sends CORS headers — which meant injecting a <script> tag,
     * a global callback and a manual timeout. Supabase sends CORS headers, so
     * all of that machinery is gone.
     */
    function fetchSupabase(path, onSuccess, onError) {
        var settled = false;
        var timer = window.setTimeout(function () {
            if (settled) return;
            settled = true;
            onError();
        }, REQUEST_TIMEOUT_MS);

        function finish(fn, value) {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            fn(value);
        }

        fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: { apikey: SUPABASE_KEY } })
            .then(function (response) {
                if (!response.ok) throw new Error("Supabase responded " + response.status);
                return response.json();
            })
            .then(function (rows) { finish(onSuccess, Array.isArray(rows) ? rows : []); })
            .catch(function () { finish(onError); });
    }

    /**
     * Was five JSONP requests, one per sheet tab, merged and de-duplicated in
     * the browser. It is now a single call: the tabs are merged by the sync
     * job, so `public_tools` is already the whole catalogue.
     *
     * `dedupeTools` is still called on the result. It is a no-op on clean data
     * — the sync merges duplicate slugs before storing — but it is also what
     * de-duplicates the cached copy from a previous version of this file, and
     * it costs nothing.
     */
    function loadAllTools(onSuccess, onError) {
        fetchSupabase("public_tools?select=*&limit=" + ROW_LIMIT, function (rows) {
            if (rows.length >= ROW_LIMIT) {
                console.warn("Catalogue hit the " + ROW_LIMIT + "-row ceiling; raise ROW_LIMIT.");
            }

            var tools = dedupeTools(rows.map(toTool).filter(function (tool) {
                return tool.title && tool.slug;
            }));

            if (!tools.length) {
                onError();
                return;
            }

            setCachedTools(tools);
            onSuccess(tools);
        }, onError);
    }

    function init() {
        var slug = getRouteSlugFromUrl();
        var categorySlug = getCategorySlugFromUrl();

        attachCategorySearchListeners();
        attachCarouselListeners();

        if (dashMainEl && dashSearchEl) {
            dashMainEl.addEventListener("scroll", function () {
                dashSearchEl.classList.toggle("is-stuck", dashMainEl.scrollTop > 4);
            });
        }

        // The search bar opens the pop-up (tools/quick-search.js). It searches
        // the whole catalogue, so "See all" leaves a category for the All view,
        // where the grid can show every match.
        if (dashSearchInputEl && window.DWQuickSearch) {
            window.DWQuickSearch.attach({
                trigger: dashSearchInputEl,
                getTools: function () { return dashState.all; },
                getGroups: getCategoryGroups,
                categoryHref: categoryHref,
                toolHref: toolHref,
                iconMarkup: categoryIconMarkup,
                logoUrl: iconUrl,
                onSearch: function (q) {
                    var onAllView = !dashState.selected && dashboardViewEl && !dashboardViewEl.hidden;
                    if (q && !onAllView) {
                        window.location.href = "/tools/?q=" + encodeURIComponent(q);
                        return;
                    }
                    dashSearchInputEl.value = q;
                    applyDashSearch(q);
                    if (dashMainEl) dashMainEl.scrollTop = 0;
                }
            });
        }

        if (dashSearchInputEl) {
            var searchDebounce;
            dashSearchInputEl.addEventListener("input", function () {
                clearTimeout(searchDebounce);
                searchDebounce = window.setTimeout(function () {
                    applyDashSearch(dashSearchInputEl.value);
                }, 150);
            });
        }

        if (dashGridEl) {
            dashGridEl.addEventListener("click", function (event) {
                var chip = event.target.closest ? event.target.closest("[data-fav-filter]") : null;
                if (chip) {
                    favFilter = chip.getAttribute("data-fav-filter");
                    applyDashSearch(dashSearchInputEl ? dashSearchInputEl.value : "");
                    return;
                }
                var clear = event.target.closest ? event.target.closest("[data-dash-clear]") : null;
                if (clear && dashSearchInputEl) {
                    dashSearchInputEl.value = "";
                    applyDashSearch("");
                    dashSearchInputEl.focus();
                }
            });
        }

        if (!isToolsRoute()) {
            showNotFound("Page not found", "The page you're looking for doesn't exist or has been moved.");
            return;
        }

        function processTools(tools) {
            try {
                tools = dedupeTools(tools);
                categorySearchGroups = getCategoryGroups(tools);
                renderCategorySearchResults("");

                if (!slug) {
                    renderDashboard(tools, categorySlug);
                    return;
                }

                var tool = null;
                for (var i = 0; i < tools.length; i++) {
                    if (tools[i].slug === slug) { tool = tools[i]; break; }
                }
                if (tool) {
                    renderTool(tool, tools);
                    return;
                }

                if (findCategoryGroup(tools, slug)) {
                    renderDashboard(tools, slug);
                } else {
                    showNotFound();
                }
            } catch (error) {
                console.error("Could not render tool details:", error);
                showNotFound("Could not load this tool", "Please refresh the page or try another listing.");
            }
        }

        var cachedTools = getCachedTools();
        if (cachedTools) {
            processTools(cachedTools);
        }

        // Fetched once per page load, not on a timer. The old 5-second poll
        // re-read the entire catalogue 720 times an hour per open tab, to catch
        // an edit that now reaches the database within seconds of being typed —
        // so anyone opening or refreshing the page sees it. DECISIONS §20a.
        loadAllTools(processTools, function () {
            if (!cachedTools) {
                showNotFound("Could not load this tool", "Please refresh the page or try another listing.");
            }
        });
    }

    init();
});
