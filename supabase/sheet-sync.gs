/**
 * Design Wallet — Google Sheet → Supabase sync
 * ============================================
 *
 * Paste this into a Google Apps Script project BOUND TO THE CATALOGUE
 * SPREADSHEET (Extensions → Apps Script from inside the sheet). It reads the
 * tabs listed in TABS and upserts them into Supabase. The sheet stays the
 * source of truth; Supabase is a published copy.
 *
 * SETUP — two Script Properties (Project Settings → Script Properties):
 *   SUPABASE_URL          https://xxxxxxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  the service_role key
 *
 * The service_role key bypasses every RLS policy. It belongs HERE and nowhere
 * else — never in the website, never in the repo. If it ever leaks, rotate it
 * in Supabase (Settings → API) and update the property.
 *
 * RUN ORDER, first time:
 *   1. Run schema.sql in the Supabase SQL editor.
 *   2. Run dryRun() — reads the tabs, writes nothing, prints the counts.
 *   3. Set MIN_ROWS from what it printed.
 *   4. Run syncAll() once by hand and check the counts in Supabase.
 *   5. Run installTriggers().
 *
 * HOW REAL TIME WORKS, after step 5:
 *   onSheetEdit    an edit → that table in Supabase, in a couple of seconds
 *   onSheetChange  a row added or deleted → a full sync
 *   syncAll        every 10 minutes, a safety net for what edit events miss
 *
 * What an edit event CANNOT see, which is why the safety net exists: a cell
 * whose value came from a formula or IMPORTRANGE recalculating, and anything
 * written by another script or by the Sheets API. Those appear within 10
 * minutes rather than seconds.
 */

/* ── Configuration ──────────────────────────────────────────────────────── */

// Must stay in step with SHEET_TABS in tools/tools.js. A numeric entry is a
// gid, anything else is a tab name — the same convention the site already uses.
// Unlike gviz, this script FAILS LOUDLY on a tab it cannot find, which is the
// whole reason the sheet's silent-wrong-tab trap (DECISIONS §8c) disappears
// once the site reads Supabase instead.
var TABS = {
    tools: ["0", "1218813985", "MCP Connectors", "AI creative suites", "AI voiceover"],
    books: ["1540089306"],
    portfolios: ["Wall of portfolio"]
};

// A sync that finds fewer rows than this writes NOTHING and deletes nothing.
// Without the guard, one bad read — a renamed tab, a half-saved edit, an API
// blip — empties the table and blanks the website.
//
// Set at ~80% of what dryRun() reported on 2026-10-04: 430 tools, 21 books,
// 145 portfolios. Raise these as the catalogue grows; if a sync ever fails
// saying "only N rows read", check the sheet BEFORE assuming the floor is too
// high — that message is the guard doing its job.
var MIN_ROWS = {
    tools: 340,
    books: 16,
    portfolios: 115
};

var CHUNK = 500; // rows per request; Supabase handles this comfortably

// Table name → the function that reads its tabs. Used by the real-time path to
// sync only the table that was actually edited.
var READERS = {
    tools: function (batch) { return readTools(batch); },
    books: function (batch) { return readBooks(batch); },
    portfolios: function (batch) { return readPortfolios(batch); }
};

/* ── Entry points ───────────────────────────────────────────────────────── */

/**
 * REAL TIME — this is the one that matters.
 *
 * Installed by installTriggers() as an INSTALLABLE onEdit trigger, so an edit
 * in the sheet reaches Supabase in a couple of seconds.
 *
 * It must be installable, not a simple `onEdit(e)` function: simple triggers
 * run without authorization and CANNOT call UrlFetchApp, so a simple trigger
 * here would fail silently on every edit.
 *
 * It syncs the WHOLE affected table rather than the edited row. That sounds
 * wasteful and is not: one table is a single HTTP request and a few seconds of
 * runtime, and doing it whole means a renamed slug, a deleted row and a pasted
 * block all just work, with no second code path to keep correct.
 */
function onSheetEdit(e) {
    var sheet = e && e.range ? e.range.getSheet() : null;
    syncNow(tableFor(sheet));
}

/**
 * Structural changes — a row inserted or deleted, a tab added. onEdit does not
 * fire for these. The event does not say WHERE it happened, so this syncs
 * everything.
 */
function onSheetChange(e) {
    syncNow(null);
}

/**
 * Coalescing wrapper. A burst of edits — holding delete, pasting 50 rows,
 * dragging a fill handle — would otherwise start a sync per event and they
 * would race each other, with the slowest finishing last and writing the
 * OLDEST data.
 *
 * So: one sync runs at a time. Anything arriving while it runs sets a dirty
 * flag instead of starting, and the running sync loops once more to pick up
 * whatever changed. The last write always reflects the newest sheet.
 */
function syncNow(table) {
    if (table === "none") return; // edit in a tab that feeds nothing

    var props = PropertiesService.getScriptProperties();
    var lock = LockService.getScriptLock();

    if (!lock.tryLock(2000)) {
        // Widen rather than narrow: if two different tables are waiting, the
        // pending scope has to cover both.
        var pending = props.getProperty("DIRTY");
        props.setProperty("DIRTY", (pending && pending !== table) ? "all" : (table || "all"));
        return;
    }

    try {
        var scope = table;
        for (var pass = 0; pass < 5; pass++) {
            props.deleteProperty("DIRTY");
            runSync(scope);

            var again = props.getProperty("DIRTY");
            if (!again) return;
            scope = again === "all" ? null : again;
        }
        // Five passes and the sheet is still changing. Stop; the reconcile
        // trigger below will catch up. This only bounds pathological cases.
        Logger.log("syncNow: gave up after 5 passes, reconcile will catch up.");
    } finally {
        lock.releaseLock();
    }
}

function runSync(table) {
    var batch = "b" + Date.now();

    if (!table) {
        syncAll();
        return;
    }

    Logger.log(syncTable(table, batch, READERS[table]));
}

/**
 * Safety net, not the main path. Installed on a 10-minute timer to catch what
 * onEdit cannot see: formula results, IMPORTRANGE refreshes, and anything
 * written by another script or by the Sheets API — none of which fire an edit
 * event. Also reconciles if a trigger ever errors.
 */
function syncAll() {
    var batch = "b" + Date.now();
    var report = [];

    report.push(syncTable("tools", batch, readTools));
    report.push(syncTable("books", batch, readBooks));
    report.push(syncTable("portfolios", batch, readPortfolios));

    Logger.log("── sync " + batch + " ──");
    report.forEach(function (line) { Logger.log(line); });
    return report.join("\n");
}

/** Which table a given tab feeds, or null if the tab is not synced at all. */
function tableFor(sheet) {
    if (!sheet) return null;

    var name = sheet.getName().trim().toLowerCase();
    var gid = String(sheet.getSheetId());

    var tables = Object.keys(TABS);
    for (var i = 0; i < tables.length; i++) {
        var match = TABS[tables[i]].some(function (entry) {
            return /^\d+$/.test(String(entry))
                ? String(entry) === gid
                : String(entry).trim().toLowerCase() === name;
        });
        if (match) return tables[i];
    }

    // An edit in a tab nobody syncs — notes, drafts, a scratch tab. Returning
    // null makes syncNow() sync everything, which is wrong and wasteful, so
    // the caller checks for it.
    return "none";
}

function installTriggers() {
    var handlers = ["onSheetEdit", "onSheetChange", "syncAll"];
    ScriptApp.getProjectTriggers().forEach(function (t) {
        if (handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
    });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ScriptApp.newTrigger("onSheetEdit").forSpreadsheet(ss).onEdit().create();
    ScriptApp.newTrigger("onSheetChange").forSpreadsheet(ss).onChange().create();
    ScriptApp.newTrigger("syncAll").timeBased().everyMinutes(10).create();

    Logger.log("Installed: onEdit (real time), onChange (rows added/removed), syncAll every 10 min (safety net).");
}

/* ── The sync itself ────────────────────────────────────────────────────── */

function syncTable(table, batch, read) {
    var rows = read(batch);

    if (rows.length < MIN_ROWS[table]) {
        // Upsert nothing and delete nothing. The table keeps its last good
        // contents and the site stays up while you investigate.
        throw new Error(
            table + ": only " + rows.length + " rows read, minimum is " +
            MIN_ROWS[table] + ". Nothing was written. Check the tabs in TABS."
        );
    }

    for (var i = 0; i < rows.length; i += CHUNK) {
        upsert(table, rows.slice(i, i + CHUNK));
    }

    var removed = deleteStale(table, batch);
    return table + ": " + rows.length + " upserted, " + removed + " stale deleted";
}

function upsert(table, rows) {
    var res = supabase("POST", "/rest/v1/" + table + "?on_conflict=" + pk(table), rows, {
        // merge-duplicates makes this an UPSERT rather than an INSERT, so a
        // re-run updates rows instead of failing on the primary key.
        "Prefer": "resolution=merge-duplicates,return=minimal"
    });
    if (res.getResponseCode() >= 300) {
        throw new Error("upsert " + table + " failed: " + res.getResponseCode() + " " + res.getContentText());
    }
}

// Rows deleted from the sheet would otherwise live in Supabase forever. Every
// synced row carries this run's batch id, so anything still holding an older id
// is a row the sheet no longer has.
function deleteStale(table, batch) {
    var res = supabase("DELETE", "/rest/v1/" + table + "?sync_batch=neq." + encodeURIComponent(batch), null, {
        "Prefer": "return=representation"
    });
    if (res.getResponseCode() >= 300) {
        throw new Error("delete " + table + " failed: " + res.getResponseCode() + " " + res.getContentText());
    }
    try {
        return JSON.parse(res.getContentText()).length;
    } catch (e) {
        return 0;
    }
}

function supabase(method, path, body, extraHeaders) {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty("SUPABASE_URL");
    var key = props.getProperty("SUPABASE_SERVICE_KEY");

    if (!url || !key) {
        throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Project Settings → Script Properties.");
    }

    var headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json"
    };
    Object.keys(extraHeaders || {}).forEach(function (k) { headers[k] = extraHeaders[k]; });

    return UrlFetchApp.fetch(url.replace(/\/+$/, "") + path, {
        method: method,
        headers: headers,
        payload: body ? JSON.stringify(body) : undefined,
        muteHttpExceptions: true
    });
}

function pk(table) {
    return table === "portfolios" ? "link" : "slug";
}

/* ── Reading the sheet ──────────────────────────────────────────────────── */

// Resolves a TABS entry — numeric gid or tab name — to a Sheet, and throws if
// it is not there. Tab names match case-insensitively, as gviz did.
function sheetFor(entry) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();

    if (/^\d+$/.test(String(entry))) {
        for (var i = 0; i < sheets.length; i++) {
            if (String(sheets[i].getSheetId()) === String(entry)) return sheets[i];
        }
        throw new Error("No tab with gid " + entry + " in this spreadsheet.");
    }

    var wanted = String(entry).trim().toLowerCase();
    for (var j = 0; j < sheets.length; j++) {
        if (sheets[j].getName().trim().toLowerCase() === wanted) return sheets[j];
    }
    throw new Error('No tab named "' + entry + '" in this spreadsheet.');
}

function values(entry) {
    var data = sheetFor(entry).getDataRange().getDisplayValues();
    return data.filter(function (row) {
        return row.some(function (cell) { return String(cell).trim() !== ""; });
    });
}

// Same normalization the site uses, so the same header spellings keep working.
function normalizeHeader(value) {
    return String(value || "").trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function slugify(value) {
    return String(value || "").trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function text(value) {
    return String(value == null ? "" : value).trim();
}

/**
 * Tool tabs. Columns are resolved BY HEADER NAME with the same aliases the site
 * accepts (title|name, pricing|price, image|logo, description|subtitle), so a
 * reordered column costs nothing.
 *
 * A tab whose header row has neither `title` nor `name` is SKIPPED, exactly as
 * tools.js does: a tab mid-edit has no usable header, and every key built from
 * a data row would be nonsense. Skipping one tab must not poison the others.
 */
function readTools(batch) {
    var out = [];
    var seen = {};

    TABS.tools.forEach(function (entry) {
        var rows = values(entry);
        if (!rows.length) return;

        var headers = rows[0].map(normalizeHeader);
        if (headers.indexOf("title") === -1 && headers.indexOf("name") === -1) {
            Logger.log('Skipping tab "' + entry + '": no title/name header.');
            return;
        }

        var tabName = sheetFor(entry).getName();

        rows.slice(1).forEach(function (row) {
            var rec = {};
            headers.forEach(function (h, i) { if (h) rec[h] = text(row[i]); });

            var title = rec.title || rec.name;
            var slug = slugify(rec.slug || title);
            if (!title || !slug) return;

            // The site sweeps EVERY column whose name contains "thumbnail" or
            // "banner" and merges them, so a sheet with `thumbnail 1`,
            // `thumbnail 2` and `banner image` keeps all three. Reproduce that
            // here or those images silently disappear.
            var thumbs = [];
            Object.keys(rec).forEach(function (k) {
                if (k.indexOf("thumbnail") === -1 && k.indexOf("banner") === -1) return;
                String(rec[k]).split(/\n+|,\s*(?=https?:\/\/)/).forEach(function (part) {
                    var t = part.trim();
                    if (t && thumbs.indexOf(t) === -1) thumbs.push(t);
                });
            });

            var row = {
                slug: slug,
                title: title,
                subtitle: rec.subtitle || rec.description || "",
                description: rec.description || rec.subtitle || "",
                image: rec.image || rec.logo || "",
                link: rec.link || rec.url || "",
                pricing: rec.pricing || rec.price || "",
                categories: rec.categories || rec.category || "",
                thumbnails: thumbs.join(", "),
                source_tab: tabName,
                sync_batch: batch,
                updated_at: new Date().toISOString()
            };

            // The same tool legitimately appears in more than one tab, and
            // Postgres refuses an upsert whose payload hits the same primary key
            // twice ("cannot affect row a second time"), so duplicates must be
            // resolved HERE.
            //
            // They are MERGED, not dropped, because that is exactly what
            // dedupeTools() in tools.js does: categories and thumbnails are
            // unioned, and blank fields are filled from the duplicate. Keeping
            // only the first row would quietly delete a category from a tool
            // listed in two tabs, and it would vanish from that category page.
            if (seen[slug]) {
                mergeTool(seen[slug], row);
                return;
            }

            seen[slug] = row;
            out.push(row);
        });
    });

    return out;
}

// Mirrors dedupeTools() in tools/tools.js. Any change there belongs here too.
function mergeTool(into, extra) {
    into.categories = union(into.categories, extra.categories).join(", ");
    into.thumbnails = union(into.thumbnails, extra.thumbnails).join(", ");

    ["image", "link", "subtitle", "description", "pricing"].forEach(function (key) {
        if (!into[key] && extra[key]) into[key] = extra[key];
    });

    // Which tabs a merged tool came from, so build-icons.js still sees every
    // tab a row belongs to rather than just the first one.
    if (into.source_tab.indexOf(extra.source_tab) === -1) {
        into.source_tab = into.source_tab + ", " + extra.source_tab;
    }
}

function union(a, b) {
    var out = [];
    [a, b].forEach(function (value) {
        String(value || "").split(",").forEach(function (part) {
            var t = part.trim();
            if (t && out.indexOf(t) === -1) out.push(t);
        });
    });
    return out;
}

// Books tab: positional columns, matching script.js's parseBooks().
// 0 thumbnail · 1 title · 2 author · 3 rating · 4 link
function readBooks(batch) {
    var out = [];
    var seen = {};

    TABS.books.forEach(function (entry) {
        var rows = values(entry);
        if (!rows.length) return;

        // Drop a header row if there is one. getDisplayValues() has no notion of
        // typed headers, unlike gviz, so this has to be decided here.
        var start = normalizeHeader(rows[0][1]).match(/^(title|name|book|book_name)$/) ? 1 : 0;

        rows.slice(start).forEach(function (row) {
            var title = text(row[1]);
            if (!title) return;

            var slug = slugify(title);
            if (!slug || seen[slug]) return;
            seen[slug] = true;

            var rating = parseFloat(text(row[3]));

            out.push({
                slug: slug,
                title: title,
                author: text(row[2]),
                rating: isNaN(rating) ? 0 : rating,
                thumbnail: text(row[0]),
                link: text(row[4]),
                sync_batch: batch,
                updated_at: new Date().toISOString()
            });
        });
    });

    return out;
}

/**
 * Wall of portfolios. This tab carries its own header row as data and may also
 * have none at all, so wall.js resolves columns by name when row 0 looks like a
 * header and falls back to fixed positions otherwise. Same logic here.
 *
 * Rows without an http link are dropped, as wall.js drops them — and `link` is
 * this table's primary key, so a blank one could not be stored anyway.
 */
function readPortfolios(batch) {
    var ALIASES = {
        image: "image", profileimage: "image", favicon: "image", logo: "image",
        title: "title", name: "title",
        subtitle: "subtitle", description: "subtitle",
        link: "link", url: "link", website: "link",
        thumbnails: "thumbnail", thumbnail: "thumbnail", banner: "thumbnail",
        bannerimage: "thumbnail",
        slug: "slug"
    };
    var FALLBACK = { image: 0, title: 1, subtitle: 2, link: 5, thumbnail: 6, slug: 7 };

    var out = [];
    var seen = {};

    TABS.portfolios.forEach(function (entry) {
        var rows = values(entry);
        if (!rows.length) return;

        // wall.js's own test, kept identical.
        var squash = function (v) { return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); };
        var first = squash(rows[0][0]);
        var second = squash(rows[0][1]);
        var hasHeader = (first === "image" || first === "title") && (second === "title" || second === "subtitle");

        var map = FALLBACK;
        if (hasHeader) {
            map = {};
            rows[0].forEach(function (cell, i) {
                var key = ALIASES[squash(cell)];
                if (key && map[key] === undefined) map[key] = i;
            });
        }

        rows.slice(hasHeader ? 1 : 0).forEach(function (row) {
            function at(key) { return map[key] === undefined ? "" : text(row[map[key]]); }

            var link = at("link");
            if (!/^https?:\/\//i.test(link)) return;
            if (seen[link]) return;
            seen[link] = true;

            var title = at("title");
            if (!title) return;

            out.push({
                link: link,
                title: title,
                subtitle: at("subtitle"),
                image: at("image"),
                thumbnail: at("thumbnail"),
                slug: at("slug"),
                sync_batch: batch,
                updated_at: new Date().toISOString()
            });
        });
    });

    return out;
}

/* ── Diagnostics ────────────────────────────────────────────────────────── */

// Run this BEFORE the first sync. It reads the tabs and prints what it found
// without writing anything to Supabase — which is how you pick MIN_ROWS, and
// how you catch a renamed tab before it can fail a real run.
function dryRun() {
    var batch = "dry";
    var lines = [
        "tools:      " + readTools(batch).length + " rows",
        "books:      " + readBooks(batch).length + " rows",
        "portfolios: " + readPortfolios(batch).length + " rows"
    ];
    lines.forEach(function (l) { Logger.log(l); });
    return lines.join("\n");
}
