# Sheet → Supabase — runbook

**Decided 2026-10-04** (DECISIONS §20a). The Google Sheet stays the editing surface. An Apps Script
job copies it into Supabase **the moment you edit it**. The website reads **only** Supabase. The
spreadsheet then goes private.

**Do the steps in order.** Step 9 (restricting the sheet) is last for a reason: do it early and the
site goes blank, which is what happened on the first attempt.

| File | What it is | Who runs it |
|---|---|---|
| `schema.sql` | tables, RLS, published views | you, once, in the Supabase SQL editor |
| `sheet-sync.gs` | the Sheet → Supabase sync | you, pasted into Apps Script |
| the website code | reads Supabase instead of gviz | me |

**Measured against the live sheet, 2026-10-04** — these are the numbers every step below checks
against: **430 tools · 21 books · 145 portfolios.**

---

## Step 0 — check for the old project first

Supabase was in this project once and was removed deliberately, with 7 edge functions (DECISIONS
§6). **The hosted project may still exist and may still be billing.** Open
[supabase.com/dashboard](https://supabase.com/dashboard) and either reuse it or delete it. Do not end
up with two.

## Step 1 — create the project (~10 min, mostly waiting)

New project. Pick the region closest to your readers — **ap-south-1 (Mumbai)** for an India-first
audience; it is the single biggest lever on how fast the listings appear.

Then Settings → API, and copy three values:

| Value | Where it goes | |
|---|---|---|
| Project URL | the website **and** Apps Script | — |
| `anon` key | the website | **safe in the browser by design** — that is what step 2's RLS is for |
| `service_role` key | Apps Script Script Properties, nowhere else | **bypasses every rule.** Never in the repo, never in a page, never pasted into a chat |

## Step 2 — run the schema

SQL Editor → paste **all** of `schema.sql` → Run. It is idempotent; re-running it never touches your
rows.

What it does, in the order that matters: creates `tools`, `books`, `portfolios` → **turns RLS on
before any data exists** → grants `anon` nothing but `SELECT`, through three views that list their
columns explicitly → revokes the blanket table privileges Supabase hands `anon` by default.

That last part is the point of the whole migration: **a column you add to the sheet later is not
published until someone adds it to a view.** In the spreadsheet, a new column was public the moment
you typed it.

## Step 3 — prove the lock works (2 min, do not skip)

With `$URL` and `$ANON` as your project URL and anon key:

```sh
# 1. The published view must READ. Expect [] — the tables are still empty.
curl -s "$URL/rest/v1/public_tools?select=slug&limit=1" -H "apikey: $ANON"

# 2. The base table must be UNREACHABLE. Expect a permission error, not [].
curl -s "$URL/rest/v1/tools?select=slug&limit=1" -H "apikey: $ANON"

# 3. Writing must FAIL. Expect 401/403.
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/rest/v1/tools" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"slug":"pwned","title":"pwned","sync_batch":"x"}'
```

**If 2 returns `[]` or 3 returns `201`, stop and tell me.** Supabase with RLS misconfigured is worse
than the public sheet it replaces — the anon key ships to every visitor, whereas the sheet ID at
least had to be found.

## Step 4 — the sync job

1. Open the **catalogue** spreadsheet → Extensions → Apps Script.
2. Replace `Code.gs` with the contents of `sheet-sync.gs`.
3. Project Settings → Script Properties → add two:
   - `SUPABASE_URL` → your project URL
   - `SUPABASE_SERVICE_KEY` → the **service_role** key
4. Run **`dryRun()`**. It reads the tabs and prints counts **without writing anything**. First run
   asks for authorization — it needs your sheet and outbound requests. Expect:

   ```
   tools:      430 rows
   books:      21 rows
   portfolios: 145 rows
   ```

   **A wrong number here is the whole migration going wrong quietly, so check it.** Far too few
   means a renamed tab — `TABS` at the top of the file must stay in step with `SHEET_TABS` in
   `tools/tools.js`. Unlike gviz, this script throws on a tab it cannot find rather than silently
   serving another tab's rows (DECISIONS §8c).
5. Set `MIN_ROWS` to roughly 80% of what `dryRun()` reported. A sync that reads fewer than this
   **writes nothing and deletes nothing** — one bad read would otherwise empty the table and blank
   the site.
6. Run **`syncAll()`**. Expect `tools: 430 upserted, 0 stale deleted`, and the same for the others.
7. Table Editor → confirm the row counts match. Spot-check one tool you know.
8. Run **`installTriggers()`**. Three triggers go in:

   | Trigger | Fires on | Latency |
   |---|---|---|
   | `onSheetEdit` | any cell you edit | **~2 seconds** |
   | `onSheetChange` | a row inserted or deleted, a tab added | ~2 seconds |
   | `syncAll` | every 10 minutes | safety net |

9. **Test it.** Change a tool's subtitle in the sheet, count to five, refresh the row in Supabase's
   Table Editor. If it has not changed, open Apps Script → Executions and read the error.

### Why there is still a 10-minute timer

An edit event does not fire for everything. **It does not fire when a formula or `IMPORTRANGE`
recalculates, or when another script or the Sheets API writes a cell.** If any of your columns are
formulas, those changes arrive on the 10-minute pass rather than in seconds. The timer also
reconciles if a trigger ever errors.

### What happens when you paste 50 rows at once

One sync runs at a time. Anything arriving while a sync is in flight sets a flag instead of starting
its own, and the running sync loops once more to pick up the newer state — so **the last write is
always the newest sheet**, never a slow earlier sync finishing last and overwriting it with stale
data. Bounded at five passes; after that the timer catches up. *(Verified: 12 tests over the
coalescing logic, plus 8 over tab-to-table resolution.)*

### Quota, so it does not surprise you later

A consumer Google account allows **90 minutes of trigger runtime a day**. One table sync is a single
HTTP request and a few seconds, so that is roughly a thousand edits a day — far more than a human
editing a spreadsheet. Only a script hammering the sheet could exhaust it.

## Step 5 — the website (mine)

| File | Change |
|---|---|
| `script.js` | 4 fetch sites — listings, category cloud, featured grid, books |
| `tools/tools.js` | **5 JSONP requests become 1 REST call** |
| `wall-of-portfolios/wall.js` | same swap |
| `scripts/build-icons.js` | **easy to miss** — reads the sheet anonymously at build time, breaks the day you restrict it |
| both files' `SHEET_REFRESH_INTERVAL = 5000` | **your call — see below** |

`localStorage` caching stays exactly as it is. `admin/index.html` only *links* to the sheet — that
stays, it is your editing surface.

### Real time has a second half: getting it into the visitor's browser

Supabase being current in 2 seconds does nothing on its own — the page still has to find out. Three
options, and this is a decision, not a detail:

| | How a new listing appears | Cost |
|---|---|---|
| **Fetch on page load** *(recommended)* | anyone who opens or refreshes the page sees it, seconds after you type it | none; one request per visit |
| **Keep polling** | an already-open tab updates by itself | a request per tab per interval, forever — at 5s this was ~15 MB per 10-minute visit |
| **Supabase Realtime** | an already-open tab updates by itself, pushed | a websocket per visitor; free tier allows 200 concurrent and 2M messages/month |

**Fetch on load is almost certainly what you want.** The requirement on record (DECISIONS §3) is
*"a new listing is live immediately"* — that is about **publish** latency, which the edit trigger
now solves. It was never about a visitor who is already staring at the page getting a row injected
under their cursor. Polling every 5 seconds was paying a permanent bandwidth cost for a case that
does not happen.

## Step 6 — test before locking anything

`/` · `/tools/` · `/tools/?category=…` · a tool detail page · `/books/` · `/wall-of-portfolios/` ·
`/admin/`. Then **in a browser that has never opened the site** — stale `localStorage` has already
caused one false "no books found" panic.

## Step 7 — now restrict the sheet

Catalogue spreadsheet → Share → **Restricted**. Also File → Share → **Stop publishing**, which is a
separate setting; either one alone keeps the data readable.

Verify it actually closed:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://docs.google.com/spreadsheets/d/1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8/gviz/tq?tqx=out:json&gid=0"
```

**Expect 401/403. A 200 means it is still public.** The sync keeps working regardless — Apps Script
is bound to the sheet and runs as you.

## Step 8 — tidy up

- Delete the sheet IDs from client code; they address nothing public now.
- The **submissions** spreadsheet (`1aKs9XEJ…`, 381 email addresses) is a **separate, still-open
  problem** — DATA-SECURITY-PLAN §0. This migration does not touch it.

---

## What this does and does not buy you

**Does:** the whole spreadsheet stops being public, so the 6 email addresses sitting in subtitle
cells stop being public with it, and any tab you add later is no longer published the moment you
save it. `File → Make a copy` stops being the attack.

**Does not:** make the listings secret. They are rendered on a public website; anyone can still
collect them. The barrier moves from one click to writing code. That is the real, narrower win — and
**build-time generation (DECISIONS §3/§5) is still the stronger answer** to copying and the only one
that also fixes SEO. It composes with this: a build script would later read Supabase instead of the
Sheet, which is a one-line change.
