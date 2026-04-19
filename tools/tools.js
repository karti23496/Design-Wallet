document.addEventListener("DOMContentLoaded", function () {
    var SHEET_ID = "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";
    var SHEET_GIDS = ["0", "1218813985"];
    var CACHE_KEY = "dw_tool_detail_cache_v3";
    var CACHE_TTL = 10 * 60 * 1000;

    var loadingEl = document.getElementById("tool-loading");
    var contentEl = document.getElementById("tool-content");
    var notFoundEl = document.getElementById("tool-not-found");

    function getSlugFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var querySlug = slugify(params.get("t") || "");

        if (querySlug) {
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, "", "/tools/" + encodeURIComponent(querySlug));
            }
            return querySlug;
        }

        var pathParts = window.location.pathname.split("/").filter(Boolean);
        var toolsIndex = pathParts.indexOf("tools");
        if (toolsIndex !== -1 && pathParts[toolsIndex + 1]) {
            return slugify(decodeURIComponent(pathParts[toolsIndex + 1]));
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

    function splitThumbnailLinks(value) {
        return String(value || "").split(/[,\n]+/).map(function (p) { return p.trim(); }).filter(Boolean);
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
                categories: parseCategories(record.categories || record.category),
                price: normalizePrice(record.pricing || record.price),
                link: record.link || record.url || "",
                icon: record.image || record.logo || "",
                thumbnail: thumbnails[0] || "",
                thumbnails: thumbnails,
                slug: slug
            };
        }).filter(function (item) { return item.title && item.slug; });
    }

    function renderTool(tool, allTools) {
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
            prevLink.href = "/tools/" + encodeURIComponent(prevTool.slug);
            prevName.textContent = prevTool.title;
            prevLink.style.visibility = "";
        } else if (prevLink) {
            prevLink.style.visibility = "hidden";
        }

        if (nextLink && nextName && nextTool) {
            nextLink.href = "/tools/" + encodeURIComponent(nextTool.slug);
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
        if (loadingEl) loadingEl.hidden = true;
        if (contentEl) contentEl.hidden = false;
    }

    function showNotFound(title, message) {
        if (loadingEl) loadingEl.hidden = true;
        if (contentEl) contentEl.hidden = true;
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
        return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json&gid=" + encodeURIComponent(gid);
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
        var slug = getSlugFromUrl();
        if (!slug) { showNotFound(); return; }

        function processTools(tools) {
            try {
                var tool = null;
                for (var i = 0; i < tools.length; i++) {
                    if (tools[i].slug === slug) { tool = tools[i]; break; }
                }
                if (tool) {
                    renderTool(tool, tools);
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
            return;
        }

        loadAllTools(processTools, function () {
            showNotFound("Could not load this tool", "Please refresh the page or try another listing.");
        });
    }

    init();
});
