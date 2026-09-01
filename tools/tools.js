document.addEventListener("DOMContentLoaded", function () {
    var SHEET_ID = "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";
    // ── Sheet tabs the catalogue reads ──────────────────────────────────────
    // Every tab is fetched, parsed with the same 8-column schema, and merged
    // into one tool list (duplicates are collapsed by slug), so a tool's
    // category still comes from its `categories` COLUMN, not from which tab it
    // sits in. Tabs are just how the data is organised for editing.
    //
    // An entry is either a TAB NAME — exactly as it reads in the Sheet's tab
    // bar, matched case-insensitively — or a numeric gid. Prefer the name: it
    // is readable, and it survives a tab being deleted and recreated, which
    // changes the gid.
    //
    // Adding a category tab is one line here. See the note on request cost in
    // DECISIONS.md before adding many: every tab is one JSONP request, on load
    // and on every refresh tick.
    // WARNING: a wrong entry here does NOT fail loudly. gviz answers an unknown
    // tab name or a dead gid with `status: ok` and ANOTHER tab's rows. The
    // signature check in loadAllTools() catches that, but keep this list
    // accurate — delete an entry when its tab goes.
    var SHEET_TABS = [
        "0",                 // main tab (legacy gid; being emptied during the 2026-09 cleanup)
        "1218813985",        // secondary legacy tab
        "MCP Connectors",
        "AI creative suites",
        "AI voiceover"
    ];
    var CACHE_KEY = "dw_tool_detail_cache_v4";
    var CACHE_TTL = 10 * 60 * 1000;
    var SHEET_REFRESH_INTERVAL = 5000;

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
    var dashState = { selected: "", base: [] };
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

    function normalizeHeader(value) {
        return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }

    function getCellValue(cell) {
        if (!cell || typeof cell.v === "undefined" || cell.v === null) return "";
        return String(cell.v).trim();
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

    function collectThumbnailLinks(record) {
        var links = [];

        Object.keys(record).forEach(function (key) {
            if (key.indexOf("thumbnail") === -1 && key.indexOf("banner") === -1) {
                return;
            }

            links = links.concat(splitThumbnailLinks(record[key]));
        });

        return Array.from(new Set(links));
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

    function addReferralParam(link) {
        try {
            var url = new URL(link);
            url.searchParams.set("via", "designwallet");
            return url.toString();
        } catch (e) {
            return link;
        }
    }

    function buildTools(rows) {
        if (!Array.isArray(rows) || !rows.length) return [];
        var headers = (rows[0].c || []).map(function (cell) { return normalizeHeader(getCellValue(cell)); });

        // A tab mid-edit can lose its header row, in which case row 0 is a data
        // row and every key built from it is nonsense — the tab then yields
        // titleless junk that gets merged into the catalogue. Require a
        // recognisable header before trusting the tab; skipping it entirely
        // means one broken tab cannot poison the others.
        if (headers.indexOf("title") === -1 && headers.indexOf("name") === -1) return [];

        return rows.slice(1).map(function (row) {
            var cells = row.c || [];
            var record = {};
            headers.forEach(function (header, index) {
                if (header) record[header] = getCellValue(cells[index]);
            });

            var title = record.title || record.name || "";
            var slug = slugify(record.slug || title);
            var thumbnails = collectThumbnailLinks(record);
            return {
                title: title,
                subtitle: record.subtitle || record.description || "",
                description: record.description || record.subtitle || "Curated design resource.",
                categories: parseCategories(record.categories || record.category),
                price: normalizePrice(record.pricing || record.price),
                priceLabel: formatPrice(normalizePrice(record.pricing || record.price)),
                link: record.link || record.url || "",
                icon: record.image || record.logo || "",
                thumbnail: thumbnails[0] || "",
                thumbnails: thumbnails,
                slug: slug,
                initials: getInitials(title)
            };
        }).filter(function (item) { return item.title && item.slug; });
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
            '<div class="dash-card-badges"><span class="dash-badge ', priceClassName(tool.price), '">', dollar, escapeHtml(tool.priceLabel || formatPrice(tool.price)), '</span></div>',
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

    function dashNavRowMarkup(label, href, count, isActive, isAll, slug) {
        var icon;
        if (isAll) {
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

    function renderDashboard(tools, categorySlug) {
        var groups = getCategoryGroups(tools);
        categorySearchGroups = groups;

        var selected = categorySlug || "";
        var group = selected ? findCategoryGroup(tools, selected) : null;
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
            document.title = (group ? group.title + " Tools" : "Tool Categories") + " — Design Wallet™";
            var metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                metaDesc.setAttribute("content", group
                    ? "Browse " + group.title + " tools on Design Wallet."
                    : "Browse Design Wallet tools by category.");
            }
        }

        if (dashNavEl) {
            var rows = [dashNavRowMarkup("All", "/category/", tools.length, !selected, true)];
            groups.forEach(function (g) {
                rows.push(dashNavRowMarkup(g.title, "/category/?category=" + encodeURIComponent(g.slug), g.tools.length, g.slug === selected, false, g.slug));
            });
            dashNavEl.innerHTML = rows.join("");
        }

        renderTrendsNav(tools, selected, new URLSearchParams(window.location.search).get("q") || "");

        if (dashTitleEl) dashTitleEl.textContent = title;

        dashState.selected = selected;
        dashState.base = gridTools;

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

    function applyDashSearch(query) {
        var q = String(query || "").trim();
        var words = q.toLowerCase().split(/\s+/).filter(Boolean);
        var filtered = dashState.base.filter(function (tool) { return toolMatchesQuery(tool, words); });

        renderDashGrid(filtered);

        if (dashCountEl) {
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

    function addResponseHandler(url, callbackName) {
        if (url.indexOf("tqx=") !== -1) {
            return url.replace(/tqx=([^&]*)/, function (match, value) {
                return "tqx=" + value + ";responseHandler:" + callbackName;
            });
        }

        return url + (url.indexOf("?") === -1 ? "?" : "&") + "tqx=out:json;responseHandler:" + callbackName;
    }

    function requestSheetData(url, onSuccess, onError) {
        var script = document.createElement("script");
        var timeoutId = 0;
        var callbackName = "__dwToolSheetCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);

        function cleanup() {
            clearTimeout(timeoutId);
            script.remove();
            delete window[callbackName];
        }

        window[callbackName] = function (payload) {
            cleanup();
            onSuccess(payload);
        };

        script.async = true;
        script.src = addResponseHandler(url, callbackName);
        script.onerror = function () { cleanup(); onError(); };
        timeoutId = window.setTimeout(function () { cleanup(); onError(); }, 12000);
        document.body.appendChild(script);
    }

    // A numeric entry is a gid; anything else is a tab name. gviz accepts
    // either, and matches the name case-insensitively.
    function buildSheetUrl(tab) {
        var selector = /^\d+$/.test(String(tab))
            ? "gid=" + encodeURIComponent(tab)
            : "sheet=" + encodeURIComponent(tab);
        return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json&" + selector + "&cachebust=" + Date.now();
    }

    function loadAllTools(onSuccess, onError) {
        var remaining = SHEET_TABS.length;
        var allTools = [];
        var seenSignatures = {};

        SHEET_TABS.forEach(function (tab) {
            requestSheetData(buildSheetUrl(tab), function (payload) {
                var rows = payload && payload.table && payload.table.rows ? payload.table.rows : [];

                // gviz NEVER errors on a tab that isn't there — a renamed tab,
                // a typo, or a deleted gid all come back `status: ok` carrying
                // some other tab's rows. `sig` is a per-tab content signature,
                // so a repeat means this entry resolved to a tab already loaded
                // and merging it would quietly import the wrong data. Drop it.
                var signature = payload && payload.sig;
                if (signature) {
                    if (seenSignatures[signature]) rows = [];
                    else seenSignatures[signature] = true;
                }

                allTools = allTools.concat(buildTools(rows));
                remaining -= 1;
                if (remaining === 0) {
                    allTools = dedupeTools(allTools);
                    if (allTools.length) {
                        setCachedTools(allTools);
                        onSuccess(allTools);
                    } else {
                        onError();
                    }
                }
            }, function () {
                remaining -= 1;
                if (remaining === 0) {
                    allTools = dedupeTools(allTools);
                    if (allTools.length) {
                        setCachedTools(allTools);
                        onSuccess(allTools);
                    } else {
                        onError();
                    }
                }
            });
        });
    }

    function init() {
        var slug = getRouteSlugFromUrl();
        var categorySlug = getCategorySlugFromUrl();

        attachCategorySearchListeners();

        if (dashMainEl && dashSearchEl) {
            dashMainEl.addEventListener("scroll", function () {
                dashSearchEl.classList.toggle("is-stuck", dashMainEl.scrollTop > 4);
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

        loadAllTools(processTools, function () {
            if (!cachedTools) {
                showNotFound("Could not load this tool", "Please refresh the page or try another listing.");
            }
        });
        window.setInterval(function () {
            loadAllTools(processTools, function () {});
        }, SHEET_REFRESH_INTERVAL);
    }

    init();
});
