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

    // The curated wall comes from Supabase. The Google Sheet is still where the
    // rows are edited; a sync job pushes the "Wall of portfolio" tab here within
    // seconds of a change. See DECISIONS §20a.
    //
    // The whole §8c trap goes with it: gviz answered a renamed or deleted tab
    // with `status: ok` and SOME OTHER tab's rows, which is why this file used
    // to carry a recorded content signature as a tripwire. A table either
    // exists or the request fails.
    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";

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

    // Plain fetch, because Supabase sends CORS headers. requestJsonp above is
    // still needed for the Apps Script submissions feed, which does not.
    function fetchSupabase(path, onSuccess, onError) {
        var done = false;
        var timeoutId = window.setTimeout(function () {
            if (done) return;
            done = true;
            onError();
        }, REQUEST_TIMEOUT_MS);

        function settle(fn, value) {
            if (done) return;
            done = true;
            window.clearTimeout(timeoutId);
            fn(value);
        }

        fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: { apikey: SUPABASE_KEY } })
            .then(function (response) {
                if (!response.ok) throw new Error("Supabase responded " + response.status);
                return response.json();
            })
            .then(function (rows) { settle(onSuccess, Array.isArray(rows) ? rows : []); })
            .catch(function () { settle(onError); });
    }

    /* ── Parsing ─────────────────────────────────────────────────────────── */

    // One Supabase row → the raw entry normalizeEntry() expects. The sheet's
    // header row, its aliases and its positional fallback were all resolved by
    // the sync job before the row was stored, so none of that lives here now.
    function toEntry(row) {
        return {
            name: row.title || "",
            subtitle: row.subtitle || "",
            image: row.image || "",
            thumbnail: row.thumbnail || "",
            link: row.link || "",
            slug: row.slug || ""
        };
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

    // The role tabs. Nothing in the data says what kind of designer someone is,
    // so each portfolio is matched on the words in its own title and
    // description. A portfolio can sit under several roles, or none: about half
    // match none (2026-10-19), and those show only under "All".
    var ROLES = {
        product: /product design/,
        visual: /visual design|graphic design|brand|illustrat|art direct|typograph/,
        uiux: /\bui\s*\/?\s*ux\b|\bux\s*\/?\s*ui\b|\bux\b|\bui designer|user experience|interaction design/,
        motion: /motion|animat|\b3d\b|video|after effects/
    };

    function rolesOf(text) {
        return Object.keys(ROLES).filter(function (role) { return ROLES[role].test(text); });
    }

    function normalizeEntry(raw) {
        var link = String(raw.link || "").trim();
        if (!isHttpUrl(link)) return null;

        var name = displayName(raw.name) || hostOf(link);
        if (!name) return null;

        var subtitle = String(raw.subtitle || "").trim();
        var text = (String(raw.name || "") + " " + subtitle).toLowerCase();

        return {
            name: name,
            host: hostOf(link),
            subtitle: subtitle,
            image: isHttpUrl(raw.image) ? raw.image.trim() : "",
            thumbnail: isHttpUrl(raw.thumbnail) ? raw.thumbnail.trim() : "",
            link: link,
            key: (raw.slug || hostOf(link) || link).toLowerCase(),
            roles: rolesOf(text),
            haystack: text + " " + hostOf(link)
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

    /* ── Filters ─────────────────────────────────────────────────────────── */

    var searchEl = document.getElementById("wop-search");
    var tabEls = Array.prototype.slice.call(document.querySelectorAll(".wop-tab"));
    var allEntries = [];
    var loaded = false;
    var filter = { role: "all", query: "" };

    function matches(entry) {
        if (filter.role !== "all" && entry.roles.indexOf(filter.role) === -1) return false;
        if (!filter.query) return true;
        // Every word typed has to appear somewhere, in any order.
        return filter.query.split(/\s+/).every(function (word) {
            return entry.haystack.indexOf(word) !== -1;
        });
    }

    function draw() {
        if (!loaded) return;
        var entries = allEntries.filter(matches);

        if (!allEntries.length) {
            gridEl.innerHTML = "";
            setStatus("No portfolios to show yet. Check back soon.", false);
            if (countEl) countEl.textContent = "";
            return;
        }

        gridEl.innerHTML = entries.map(cardHtml).join("");
        setStatus(entries.length ? "" : "No portfolios match that. Try another role or search.", false);
        if (countEl) {
            countEl.textContent = entries.length + (entries.length === 1 ? " portfolio" : " portfolios");
        }
    }

    function render(entries) {
        allEntries = entries;
        loaded = true;
        draw();
    }

    tabEls.forEach(function (tab) {
        tab.addEventListener("click", function () {
            filter.role = tab.getAttribute("data-role") || "all";
            tabEls.forEach(function (other) {
                var on = other === tab;
                other.classList.toggle("is-active", on);
                other.setAttribute("aria-pressed", on ? "true" : "false");
            });
            draw();
        });
    });

    if (searchEl) {
        searchEl.addEventListener("input", function () {
            filter.query = searchEl.value.trim().toLowerCase();
            draw();
        });
        searchEl.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && searchEl.value) {
                searchEl.value = "";
                filter.query = "";
                draw();
            }
        });
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

        fetchSupabase("public_portfolios?select=*&limit=2000", function (rows) {
            var curated = dedupe(rows.map(toEntry).map(normalizeEntry).filter(Boolean));

            render(curated);

            loadApproved(function (approved) {
                if (!approved.length) return;
                render(dedupe(approved.concat(curated)));
            });
        }, function () {
            loaded = false;
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
