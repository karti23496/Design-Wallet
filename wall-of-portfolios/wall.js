/* Wall of Portfolios — designer portfolios, read live from two sources.
 *
 * 1. The public database Sheet, tab "Wall of portfolio" — the curated wall.
 *    Read over gviz JSONP, exactly like the tool catalogue. Add a row there and
 *    it shows up here on the next load, with no deploy.
 * 2. Approved submissions from /submit-portfolio/, which land in the PRIVATE
 *    spreadsheet and so cannot be read over gviz. They come from the portfolio
 *    Apps Script's doGet, which returns approved rows only.
 *
 * Source 2 is strictly additive: if the script is unreachable, or has not been
 * redeployed since the Approved/Rejected statuses landed, the curated wall
 * still renders. Never let it block the page.
 */
(function () {
    "use strict";

    var SHEET_ID = "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";

    // WARNING: gviz NEVER errors on a tab that isn't there — a typo, a rename
    // or a dead gid all answer `status: ok` carrying some OTHER tab's rows.
    // See DECISIONS §8c. `sig` is checked below as the defence.
    var SHEET_TAB = "Wall of portfolio";

    // Recorded the first time the real tab answered, so a silent fallback to
    // another tab can be spotted. A legitimate edit to the tab changes this, so
    // a mismatch only warns — it never discards rows.
    var EXPECTED_SIG = "1628441740";

    var REQUEST_TIMEOUT_MS = 12000;

    var gridEl = document.getElementById("wop-grid");
    var statusEl = document.getElementById("wop-status");
    var countEl = document.getElementById("wop-count");

    if (!gridEl) return;

    /* ── Loading ─────────────────────────────────────────────────────────── */

    // Neither gviz nor Apps Script sends CORS headers, so fetch() is not an
    // option for either — JSONP it is. They disagree on how the callback is
    // named (gviz wants `tqx=...;responseHandler:x`, Apps Script wants
    // `callback=x`), so the caller builds the URL from the generated name.
    function requestJsonp(buildUrl, onSuccess, onError) {
        var callbackName = "dwWall" + Date.now() + Math.floor(Math.random() * 1e6);
        var script = document.createElement("script");
        var timeoutId;
        var done = false;

        function cleanup() {
            window.clearTimeout(timeoutId);
            try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
            if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[callbackName] = function (payload) {
            if (done) return;
            done = true;
            cleanup();
            onSuccess(payload);
        };

        script.async = true;
        script.src = buildUrl(callbackName);
        script.onerror = function () {
            if (done) return;
            done = true;
            cleanup();
            onError();
        };
        timeoutId = window.setTimeout(function () {
            if (done) return;
            done = true;
            cleanup();
            onError();
        }, REQUEST_TIMEOUT_MS);

        document.body.appendChild(script);
    }

    function sheetUrl(callbackName) {
        return "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
            "/gviz/tq?tqx=out:json;responseHandler:" + callbackName +
            "&sheet=" + encodeURIComponent(SHEET_TAB) +
            "&cachebust=" + Date.now();
    }

    /* ── Parsing ─────────────────────────────────────────────────────────── */

    function cellValue(row, index) {
        var cell = row && row.c ? row.c[index] : null;
        return cell && cell.v != null ? String(cell.v).trim() : "";
    }

    function normalizeHeader(value) {
        return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    // The tab carries its own header row as data (gviz reports no typed header
    // here), so the columns are resolved by name rather than by position — a
    // reordered column then costs nothing.
    function columnMap(headerRow) {
        var map = {};
        var aliases = {
            image: "image", profileimage: "image", favicon: "image", logo: "image",
            title: "title", name: "title",
            subtitle: "subtitle", description: "subtitle",
            categories: "categories", category: "categories",
            pricing: "pricing",
            link: "link", url: "link", website: "link",
            thumbnails: "thumbnail", thumbnail: "thumbnail", banner: "thumbnail",
            bannerimage: "thumbnail",
            slug: "slug"
        };

        (headerRow.c || []).forEach(function (cell, index) {
            var key = aliases[normalizeHeader(cell && cell.v)];
            if (key && map[key] === undefined) map[key] = index;
        });

        return map;
    }

    function looksLikeHeaderRow(row) {
        var first = normalizeHeader(cellValue(row, 0));
        var second = normalizeHeader(cellValue(row, 1));
        return (first === "image" || first === "title") && (second === "title" || second === "subtitle");
    }

    function rowsToEntries(rows) {
        if (!rows.length) return [];

        var map = looksLikeHeaderRow(rows[0])
            ? columnMap(rows[0])
            : { image: 0, title: 1, subtitle: 2, categories: 3, pricing: 4, link: 5, thumbnail: 6, slug: 7 };
        var body = looksLikeHeaderRow(rows[0]) ? rows.slice(1) : rows;

        return body.map(function (row) {
            function at(key) {
                return map[key] === undefined ? "" : cellValue(row, map[key]);
            }

            return {
                name: at("title"),
                subtitle: at("subtitle"),
                image: at("image"),
                thumbnail: at("thumbnail"),
                link: at("link"),
                slug: at("slug")
            };
        });
    }

    /* ── Cleaning ────────────────────────────────────────────────────────── */

    // Sheet titles are scraped page titles: "Tanmay Kashyap • UX/UI Designer •
    // Portfolio", "Utkarsh Chaturvedi, Product Designer - Home". Keep the part
    // before the first separator, which is the person's name almost every time.
    function displayName(title) {
        var cleaned = String(title || "").split(/\s*[•|·]\s*| [-–—] |\s*,\s*/)[0].trim();
        cleaned = cleaned.replace(/\s*[-–—|]\s*(home|portfolio)$/i, "").trim();
        return cleaned.length >= 2 ? cleaned : String(title || "").trim();
    }

    function hostOf(link) {
        try {
            return new URL(link).hostname.replace(/^www\./, "");
        } catch (e) {
            return "";
        }
    }

    function initialOf(name) {
        var match = String(name || "").trim().match(/[A-Za-z0-9]/);
        return match ? match[0].toUpperCase() : "?";
    }

    function isHttpUrl(value) {
        return /^https?:\/\//i.test(String(value || "").trim());
    }

    function normalizeEntry(raw) {
        var link = String(raw.link || "").trim();
        if (!isHttpUrl(link)) return null;

        var name = displayName(raw.name) || hostOf(link);
        if (!name) return null;

        return {
            name: name,
            host: hostOf(link),
            subtitle: String(raw.subtitle || "").trim(),
            image: isHttpUrl(raw.image) ? raw.image.trim() : "",
            thumbnail: isHttpUrl(raw.thumbnail) ? raw.thumbnail.trim() : "",
            link: link,
            key: (raw.slug || hostOf(link) || link).toLowerCase()
        };
    }

    function dedupe(entries) {
        var seen = {};
        return entries.filter(function (entry) {
            if (!entry || seen[entry.key]) return false;
            seen[entry.key] = true;
            return true;
        });
    }

    /* ── Rendering ───────────────────────────────────────────────────────── */

    var ARROW =
        '<svg class="wop-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function cardHtml(entry) {
        var avatar = entry.image
            ? '<img class="wop-avatar-img" src="' + escapeHtml(entry.image) + '" alt="" loading="lazy" ' +
              'referrerpolicy="no-referrer" onerror="this.closest(\'.wop-avatar\').classList.add(\'is-fallback\')">'
            : "";

        var thumb = entry.thumbnail
            ? '<img class="wop-thumb-img" src="' + escapeHtml(entry.thumbnail) + '" alt="" loading="lazy" ' +
              'referrerpolicy="no-referrer" onerror="this.closest(\'.wop-thumb\').classList.add(\'is-fallback\')">'
            : "";

        // The whole card is one <a>, so everything inside has to be inline-level.
        return '<a class="wop-card" href="' + escapeHtml(entry.link) + '" target="_blank" rel="noopener" ' +
            'aria-label="' + escapeHtml(entry.name) + ' — open portfolio">' +
                '<span class="wop-card-head">' +
                    '<span class="wop-avatar' + (entry.image ? "" : " is-fallback") + '" aria-hidden="true">' +
                        avatar +
                        '<span class="wop-avatar-letter">' + escapeHtml(initialOf(entry.name)) + '</span>' +
                    '</span>' +
                    '<span class="wop-identity">' +
                        '<span class="wop-name">' + escapeHtml(entry.name) + '</span>' +
                        (entry.host ? '<span class="wop-host">' + escapeHtml(entry.host) + '</span>' : "") +
                    '</span>' +
                    ARROW +
                '</span>' +
                '<span class="wop-thumb' + (entry.thumbnail ? "" : " is-fallback") + '">' +
                    thumb +
                    '<span class="wop-thumb-fallback">' + escapeHtml(entry.name) + '</span>' +
                '</span>' +
            '</a>';
    }

    function setStatus(message, isError) {
        if (!statusEl) return;
        statusEl.textContent = message || "";
        statusEl.hidden = !message;
        statusEl.classList.toggle("is-error", Boolean(isError));
    }

    function render(entries) {
        if (!entries.length) {
            gridEl.innerHTML = "";
            setStatus("No portfolios to show yet. Check back soon.", false);
            if (countEl) countEl.textContent = "";
            return;
        }

        gridEl.innerHTML = entries.map(cardHtml).join("");
        setStatus("", false);
        if (countEl) {
            countEl.textContent = entries.length + (entries.length === 1 ? " portfolio" : " portfolios");
        }
    }

    /* ── Approved submissions (private sheet, via Apps Script) ───────────── */

    function loadApproved(onDone) {
        var endpoint = window.DESIGN_WALLET_PORTFOLIO_SUBMISSION_URL || "";
        if (!endpoint) { onDone([]); return; }

        requestJsonp(function (callbackName) {
            // `type=portfolios` picks the portfolio branch of the shared
            // script; without it the endpoint answers with salary figures.
            return endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") +
                "type=portfolios" +
                "&callback=" + encodeURIComponent(callbackName) +
                "&cachebust=" + Date.now();
        }, function (payload) {
            // A payload with no `items` is not an empty approved list — it means
            // the URL is answering with something that isn't this script. That
            // is exactly the 2026-09-16 fault, where it served the salary
            // payload. Say so in the console; the page carries on regardless.
            if (payload && !payload.items && window.console && console.warn) {
                console.warn("[wall] the portfolio endpoint answered without `items` — " +
                    "it is probably running a different Apps Script. Keys: " +
                    Object.keys(payload).join(", "));
            }

            var items = payload && payload.ok && payload.items ? payload.items : [];
            onDone(items.map(function (item) {
                return normalizeEntry({
                    name: item.fullName,
                    subtitle: item.description,
                    image: item.profileImage,
                    thumbnail: item.thumbnail,
                    link: item.portfolioUrl,
                    slug: ""
                });
            }).filter(Boolean));
        }, function () {
            // The script may simply not be redeployed yet. The curated wall is
            // the page either way, so this is never surfaced to the reader.
            onDone([]);
        });
    }

    /* ── Boot ────────────────────────────────────────────────────────────── */

    function start() {
        setStatus("Loading portfolios…", false);

        requestJsonp(sheetUrl, function (payload) {
            if (payload && payload.sig && EXPECTED_SIG && payload.sig !== EXPECTED_SIG) {
                // Either the tab was edited (fine) or gviz silently served a
                // different tab (not fine). Loud in the console, quiet on screen.
                if (window.console && console.warn) {
                    console.warn("[wall] tab signature changed: expected " + EXPECTED_SIG +
                        ", got " + payload.sig + ". Check the \"" + SHEET_TAB + "\" tab still exists.");
                }
            }

            var rows = payload && payload.table && payload.table.rows ? payload.table.rows : [];
            var curated = dedupe(rowsToEntries(rows).map(normalizeEntry).filter(Boolean));

            render(curated);

            loadApproved(function (approved) {
                if (!approved.length) return;
                render(dedupe(approved.concat(curated)));
            });
        }, function () {
            gridEl.innerHTML = "";
            setStatus("We couldn't load the portfolios just now. Please refresh the page.", true);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
