// ============================================================================
// Favourites (Karthik, 2026-10-30). The heart on every tool, book and
// portfolio, and how many people have hearted it.
//
// Pages only draw `<button class="dw-fav" data-fav="<key>">` into their cards
// (tools.js, the books grid in script.js, wall.js); everything else happens
// here. `data-fav-kind` says what the key is: "tool" (the default) and "book"
// use slugs, "portfolio" uses the portfolio's link. New buttons are picked up
// by a MutationObserver, so any card drawn, now or later, just works.
//
// Data: `public.favourites` and `favourite_counts()` (supabase/favourites.sql).
// Both need a signed-in user's token. Signed out, the heart shows but has no
// count, and clicking it goes to /sign-in/ (Karthik: counts are signed-in only).
//
// The session is Supabase's own localStorage entry, as in header.js. This page
// doesn't load the Supabase library, so an expired access token is renewed
// here by hand with the refresh token, and written back where the library
// will find it on the portal pages.
//
// Exposes window.DWFavourites for tools.js's Favourites view, and fires a
// "dw:favourites" event on document whenever the set changes.
// ============================================================================
(function () {
    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
    var AUTH_KEY = "sb-ugjtyuikvdeymwsfsgfl-auth-token";
    var MINE_KEY = "dw_favourites_v2";          // localStorage: this user's "kind|key" ids
    var COUNTS_KEY = "dw_favourite_counts_v2";  // sessionStorage: everyone's totals
    var COUNTS_TTL = 5 * 60 * 1000;

    var HEART = '<svg class="dw-fav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';

    // Both are keyed by id(kind, key), so a book and a tool can share a slug.
    var mine = {};
    var counts = {};
    var loaded = false;

    function id(kind, key) {
        return (kind || "tool") + "|" + key;
    }

    function kindOf(button) {
        return button.getAttribute("data-fav-kind") || "tool";
    }

    // ── Session ─────────────────────────────────────────────────────────────

    function readSession() {
        try {
            var session = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
            return session && session.user && session.refresh_token ? session : null;
        } catch (e) {
            return null;
        }
    }

    var refreshing = null;
    function accessToken() {
        var session = readSession();
        if (!session) return Promise.reject(new Error("signed out"));
        if (session.expires_at && session.expires_at * 1000 > Date.now() + 60000) {
            return Promise.resolve(session.access_token);
        }
        // One refresh at a time: refresh tokens are single-use.
        if (!refreshing) {
            refreshing = fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
                method: "POST",
                headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: session.refresh_token })
            }).then(function (response) {
                if (!response.ok) throw new Error("refresh failed");
                return response.json();
            }).then(function (fresh) {
                if (!fresh.expires_at && fresh.expires_in) fresh.expires_at = Math.floor(Date.now() / 1000) + fresh.expires_in;
                try { localStorage.setItem(AUTH_KEY, JSON.stringify(fresh)); } catch (e) { /* private mode */ }
                return fresh.access_token;
            }).finally(function () { refreshing = null; });
        }
        return refreshing;
    }

    function api(path, options) {
        options = options || {};
        return accessToken().then(function (token) {
            return fetch(SUPABASE_URL + "/rest/v1/" + path, {
                method: options.method || "GET",
                headers: Object.assign({
                    apikey: SUPABASE_KEY,
                    Authorization: "Bearer " + token,
                    "Content-Type": "application/json"
                }, options.headers || {}),
                body: options.body
            });
        }).then(function (response) {
            // 409: already favourited (a double click, or another tab). Fine.
            if (!response.ok && response.status !== 409) throw new Error("Supabase responded " + response.status);
            return response.status === 204 || response.status === 201 || response.status === 409 ? null : response.json();
        });
    }

    // ── State and caches ────────────────────────────────────────────────────

    function saveMine(userId) {
        try { localStorage.setItem(MINE_KEY, JSON.stringify({ user: userId, ids: Object.keys(mine) })); } catch (e) { /* private mode */ }
    }

    function seedFromCache(userId) {
        try {
            var cached = JSON.parse(localStorage.getItem(MINE_KEY) || "null");
            if (cached && cached.user === userId) cached.ids.forEach(function (key) { mine[key] = true; });
            var c = JSON.parse(sessionStorage.getItem(COUNTS_KEY) || "null");
            if (c && Date.now() - c.at < COUNTS_TTL) counts = c.counts || {};
        } catch (e) { /* junk in storage */ }
    }

    // ── Drawing ─────────────────────────────────────────────────────────────

    function paint(button) {
        var key = button.getAttribute("data-fav");
        if (!key) return;
        if (!button.querySelector(".dw-fav-icon")) {
            button.innerHTML = HEART + '<span class="dw-fav-count"></span>';
        }
        var itemId = id(kindOf(button), key);
        var on = !!mine[itemId];
        var signedIn = !!readSession();
        var n = signedIn ? (counts[itemId] || 0) : 0;
        var name = button.getAttribute("data-fav-name") || "this " + kindOf(button);
        var countEl = button.querySelector(".dw-fav-count");

        button.setAttribute("aria-pressed", String(on));
        button.setAttribute("aria-label", (on ? "Remove " + name + " from favourites" : "Save " + name + " to favourites") +
            (n ? " (" + n + (n === 1 ? " person has" : " people have") + " saved it)" : ""));
        button.title = on ? "Saved to favourites" : "Save to favourites";
        countEl.textContent = n ? String(n) : "";
        // Hidden at 0, so day one isn't a wall of zeros (Karthik's call).
        countEl.hidden = !n;
    }

    function paintAll() {
        document.querySelectorAll(".dw-fav[data-fav]").forEach(paint);
    }

    function changed() {
        paintAll();
        document.dispatchEvent(new CustomEvent("dw:favourites"));
    }

    // ── Clicks ──────────────────────────────────────────────────────────────

    // Capture phase: the heart sits on cards that are links, and must win.
    document.addEventListener("click", function (event) {
        var button = event.target.closest && event.target.closest(".dw-fav[data-fav]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();

        if (!readSession()) {
            location.href = "/sign-in/?next=" + encodeURIComponent(location.pathname + location.search);
            return;
        }

        var kind = kindOf(button);
        var key = button.getAttribute("data-fav");
        var itemId = id(kind, key);
        var on = !mine[itemId];

        // Optimistic: the heart fills now and rolls back if the save fails.
        if (on) mine[itemId] = true; else delete mine[itemId];
        counts[itemId] = Math.max(0, (counts[itemId] || 0) + (on ? 1 : -1));
        changed();

        var request = on
            ? api("favourites", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ kind: kind, item_key: key }) })
            : api("favourites?kind=eq." + encodeURIComponent(kind) + "&item_key=eq." + encodeURIComponent(key), { method: "DELETE" });

        request.then(function () {
            var session = readSession();
            if (session) saveMine(session.user.id);
            try { sessionStorage.removeItem(COUNTS_KEY); } catch (e) { /* private mode */ }
            if (typeof window.gtag === "function") window.gtag("event", on ? "favourite_add" : "favourite_remove", { kind: kind, item: key });
        }).catch(function () {
            if (on) delete mine[itemId]; else mine[itemId] = true;
            counts[itemId] = Math.max(0, (counts[itemId] || 0) + (on ? -1 : 1));
            changed();
            button.classList.add("is-error");
            setTimeout(function () { button.classList.remove("is-error"); }, 1200);
        });
    }, true);

    // ── Start ───────────────────────────────────────────────────────────────

    function load() {
        var session = readSession();
        if (!session) {
            loaded = true;
            changed();
            return;
        }
        var userId = session.user.id;
        seedFromCache(userId);
        changed();

        Promise.all([
            api("favourites?select=kind,item_key&limit=1500"),
            api("rpc/favourite_counts", { method: "POST", body: "{}" })
        ]).then(function (results) {
            mine = {};
            (results[0] || []).forEach(function (row) { mine[id(row.kind, row.item_key)] = true; });
            counts = {};
            (results[1] || []).forEach(function (row) { counts[id(row.kind, row.item_key)] = Number(row.favourites) || 0; });
            saveMine(userId);
            try { sessionStorage.setItem(COUNTS_KEY, JSON.stringify({ at: Date.now(), counts: counts })); } catch (e) { /* private mode */ }
        }).catch(function () {
            // Keep whatever the cache gave us; the hearts still work on click.
        }).finally(function () {
            loaded = true;
            changed();
        });
    }

    // `kind` defaults to "tool" everywhere, so tools.js's tool calls read as before.
    window.DWFavourites = {
        signedIn: function () { return !!readSession(); },
        has: function (key, kind) { return !!mine[id(kind, key)]; },
        keys: function (kind) {
            var prefix = id(kind, "");
            return Object.keys(mine).filter(function (itemId) { return itemId.indexOf(prefix) === 0; })
                .map(function (itemId) { return itemId.slice(prefix.length); });
        },
        count: function () { return Object.keys(mine).length; },
        loaded: function () { return loaded; }
    };

    var queued = false;
    new MutationObserver(function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
            queued = false;
            document.querySelectorAll(".dw-fav[data-fav]:not([aria-pressed])").forEach(paint);
        });
    }).observe(document.documentElement, { childList: true, subtree: true });

    load();
}());
