document.addEventListener("DOMContentLoaded", function () {
    var SHEET_ID = "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";
    var SHEET_GID = "0";
    var CACHE_KEY = "dw_listings_cache";
    var CACHE_TTL = 10 * 60 * 1000;

    var loadingEl = document.getElementById("tool-loading");
    var contentEl = document.getElementById("tool-content");
    var notFoundEl = document.getElementById("tool-not-found");

    function getSlugFromUrl() {
        var params = new URLSearchParams(window.location.search);
        return (params.get("t") || "").trim().toLowerCase();
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

            var slug = (record.slug || "").replace(/^\//, "").trim().toLowerCase();
            return {
                title: record.title || record.name || "",
                subtitle: record.subtitle || record.description || "",
                categories: parseCategories(record.categories),
                price: normalizePrice(record.pricing || record.price),
                link: record.link || "",
                icon: record.image || record.logo || "",
                thumbnail: record.thumbnails || record.thumbnail || record.banner_image || "",
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
            if (tool.thumbnail) {
                screenshotEl.innerHTML = '<img src="' + escapeHtml(tool.thumbnail) + '" alt="' + escapeHtml(tool.title) + ' screenshot" loading="lazy">';
                screenshotEl.hidden = false;
            } else {
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
            prevLink.href = "/tools/?t=" + encodeURIComponent(prevTool.slug);
            prevName.textContent = prevTool.title;
            prevLink.style.visibility = "";
        } else if (prevLink) {
            prevLink.style.visibility = "hidden";
        }

        if (nextLink && nextName && nextTool) {
            nextLink.href = "/tools/?t=" + encodeURIComponent(nextTool.slug);
            nextName.textContent = nextTool.title;
            nextLink.style.visibility = "";
        } else if (nextLink) {
            nextLink.style.visibility = "hidden";
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

    function getCachedRows() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var cached = JSON.parse(raw);
            if (Date.now() - cached.timestamp > CACHE_TTL) return null;
            return Array.isArray(cached.rows) ? cached.rows : null;
        } catch (e) { return null; }
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

    function init() {
        var slug = getSlugFromUrl();
        if (!slug) { showNotFound(); return; }

        function processRows(rows) {
            try {
                var tools = buildTools(rows);
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

        var cachedRows = getCachedRows();
        if (cachedRows) {
            processRows(cachedRows);
            return;
        }

        var sheetUrl = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json&gid=" + SHEET_GID;

        requestSheetData(sheetUrl, function (payload) {
            var rows = payload && payload.table && payload.table.rows ? payload.table.rows : [];
            processRows(rows);
        }, function () {
            showNotFound("Could not load this tool", "Please refresh the page or try another listing.");
        });
    }

    init();
});
