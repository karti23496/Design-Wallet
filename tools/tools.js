document.addEventListener("DOMContentLoaded", function () {
    var SHEET_ID = "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";
    var SHEET_GIDS = ["0", "1218813985"];
    var CACHE_KEY = "dw_tool_detail_cache_v4";
    var CACHE_TTL = 10 * 60 * 1000;
    var SHEET_REFRESH_INTERVAL = 5000;

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

    function isToolsRoute() {
        var pathParts = getPathParts();
        var params = new URLSearchParams(window.location.search);
        return pathParts.indexOf("tools") !== -1 ||
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
            ? '<span class="logo-badge has-image"><img src="' + escapeHtml(tool.icon) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
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

    function hideAllViews() {
        if (loadingEl) loadingEl.hidden = true;
        if (categoryIndexEl) categoryIndexEl.hidden = true;
        if (categoryListEl) categoryListEl.hidden = true;
        if (contentEl) contentEl.hidden = true;
        if (notFoundEl) notFoundEl.hidden = true;
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
                iconEl.innerHTML = '<img src="' + escapeHtml(tool.icon) + '" alt="' + escapeHtml(tool.title) + '">';
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

    function buildSheetUrl(gid) {
        return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json&gid=" + encodeURIComponent(gid) + "&cachebust=" + Date.now();
    }

    function loadAllTools(onSuccess, onError) {
        var remaining = SHEET_GIDS.length;
        var allTools = [];

        SHEET_GIDS.forEach(function (gid) {
            requestSheetData(buildSheetUrl(gid), function (payload) {
                var rows = payload && payload.table && payload.table.rows ? payload.table.rows : [];
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
                    if (categorySlug) {
                        var categoryGroup = findCategoryGroup(tools, categorySlug);
                        if (categoryGroup) {
                            renderCategoryList(categoryGroup);
                        } else {
                            showNotFound("Category not found", "This category does not exist yet.");
                        }
                    } else {
                        renderCategoryIndex(tools);
                    }
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

                var implicitCategoryGroup = findCategoryGroup(tools, slug);
                if (implicitCategoryGroup) {
                    renderCategoryList(implicitCategoryGroup);
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
