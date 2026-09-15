# Design Wallet — Decision Log

**This file is the source of truth for every product and technical decision we've agreed on.**

### How this file is maintained

1. **Before changing anything on the website**, check this file first and confirm the change is
   aligned with what's recorded here. If a request contradicts a decision below, say so before acting.
2. **At the end of every conversation where something is agreed**, write the final agreed decision
   into this file — as a pointer, with a status tag. This is not optional and does not need to be
   re-requested each time. Discussion that ends without agreement is not recorded.
3. **Supersede, don't delete.** When a decision is reversed, move it to the *Superseded* section with
   a note on what replaced it, so the reasoning stays traceable.
4. **Strike off what ships.** When a decision is implemented, change its tag to `✅ DONE` and strike
   the headline, so done and not-done stay visible at a glance.

- **Status key:** `✅ DONE` = shipped · `DECIDED` = agreed, not built yet · `PENDING` = needs Karthik's call · `SUPERSEDED` = no longer true, kept for history
- Last updated: **2026-09-13**

---

## 1. Direction & Business Model

- **`✅ DONE`** ~~The website becomes free for everyone.~~ No subscriber paywall, no user accounts required to browse. **LIVE on `designwallet.in` since 2026-09-01** (`main` at `b3a466b`). Verified in production: `/pricing/` and `/account/` return 404, and the homepage carries zero `dw-gate-pending` / `DWAuth` / `supabase` / `join-waitlist` references.
- **`DECIDED` Revenue comes from paid tool listings, not user subscriptions.** `list-your-tool/` is the business model: free for designers, paid for tools that want placement. *(Standing direction, not a build task.)*
- **`DECIDED` The repository will be open sourced.** "Free" and "open source" are two separate decisions and we're doing both. **Not yet done — blocked on a `LICENSE` file, see §8.**
- **`⚠️ HELD` `list-your-tool/` is temporarily off the live site.** Karthik's call on 2026-09-01 — *"we have to work on the list your tool page"*. **This is a hold while it is reworked, not a reversal of the business-model decision above**, which still stands. The page is intact on `remove-paywall`; only `main` is missing it. Restore by reverting the hold-back commit (see the implementation log). **The rework landed 2026-09-11**: the page is now a book-a-call page (§13). It is still held off `main` until Karthik says to ship it.
- **`PENDING` Listing prices are on hold.** As of 2026-09-11 **no listing price appears anywhere on the site.** The ₹1,499 card went with the pricing page when `/list-your-tool/` became a book-a-call page (§13), at Karthik's request, and pricing is now discussed on the call. Karthik will still set the figures. Do not publish listing prices without being asked.
- **Noted:** `curated.design` — cited as a layout reference — is *not* free. It runs a $9/month freemium paywall ("16 free of 2,229 sections"). It's a reference for **layout only**, not for the business model.
- **Open question:** the value of a curation site is the curated data, not the code. The catalog lives in a public Google Sheet, so open-sourcing means anyone can clone site + data. Accepted as a deliberate trade-off.

## 2. Site Structure

- **`✅ DONE`** ~~The catalogue becomes the front door.~~ `/` now renders the catalogue dashboard. *Brought forward from §5 step 4 at Karthik's request — done on the current stack rather than waiting for Astro.*
- **`✅ DONE`** ~~The marketing homepage is removed~~ — hero, designer-roles strip, bento cards, testimonials and the category-cloud teaser are all gone. `index.html` was rebuilt from the catalogue shell.
- **Important correction:** the homepage never contained the catalogue. It has a category *name cloud* teaser linking to the old pricing page. **The real catalogue lives inside `404.html`** (GitHub Pages serves it for unmatched routes), which hand-rolls three views — category index, category list, tool detail — via `hidden` toggles.
- **`✅ DONE`** ~~Moving the catalogue out of `404.html` and onto `/` is the actual task.~~ `index.html`, `404.html` and `tools/index.html` now share one dashboard shell. **This also fixed a live bug** — see the implementation log.
- **`✅ DONE`** ~~Layout reference is Good Design Tools~~ (`gooddesigntools.com`) — persistent category sidebar, a compact first fold (badge → headline → sub-copy → email capture), then straight into the card grid. **Supersedes the earlier `curations.supply` "no marketing preamble" call** — a short hero is back, deliberately, because it carries the newsletter signup.
- **`✅ DONE`** ~~Keep a short About surface~~ — the first-fold headline and sub-copy on `/` now explain what the site is.
- **`DECIDED` Once open source, the GitHub link and licence go in the header**, visible upfront.
- **`✅ DONE`** ~~Blog goes in the primary nav.~~ Nav is `BROWSE → /category/` · `TOOLS ▾` · `BLOG → /blog/`, identical on every page.
- **`✅ DONE`** ~~A TOOLS dropdown lists Design Wallet's own tools.~~ Driven by the `DW_TOOLS` array at the top of `header.js` — adding a tool is one line. **Two tools now:** Color Code Converter and the Glassmorphism CSS Generator (§11).
- **`✅ DONE`** ~~The Mini Tools dropdown is a wide panel, FigmaFy-style.~~ Karthik's call, 2026-09-11, against a figmafy.com screenshot. Up to 1120px wide and centred on the header. Each tool shows an icon, its name with an arrow, and a one-line description. The right-hand block reads **"All mini tools → Explore the tools"** and links to the `/dw-tools/` index (below). It first shipped as "Run a design tool? → Book a call" and was replaced the same day (see *Superseded*). **Only Mini Tools became a panel.** Karthik chose that over a dropdown on every link, so Books, Know your money, Good deals and Blog stay plain links.
- **`DECIDED` A `DW_TOOLS` entry now carries `description` and `icon`** (the inner markup of a 24×24 stroked SVG), as well as `name` and `href`. Adding a tool is still one entry in `header.js`, but it needs all four fields, or the panel renders a blank icon and description.
- **`DECIDED` The panel anchors to `.site-header`, not the trigger.** "Mini Tools" sits near the right of the nav, so a panel this wide centred on it would run off-screen. `.nav-dropdown--wide` is `position: static`, which makes the header the containing block. The header is sticky on normal pages, and **`relative` on the dashboard, changed from `static` in `tools/dashboard.css`**. If that line goes back to `static`, the panel positions against the page.
- **`DECIDED` The hover bridge lives on the panel** (`.nav-mega::before`, 32px). The trigger's hit area is padded 16px vertically, with a matching negative margin so the header doesn't grow. The base `.nav-dropdown::after` bridge is sized to the trigger, so it's switched off for this variant. **Checked with a pointer walk in headless Chrome:** 20 steps from the trigger into the first tool on `/`, `/good-deals/` and `/blog/`, at 1440px and 1100px. The panel never closed.
- **`⚠️ GOTCHA` Text colour sits on the panel's inner `<span>`s, never on its `<a>`s.** `.blog-index-page .site-nav a` and its `:hover` come later in `style.css` at equal specificity. On the blog they would paint the CTA button's label white on its white button. Verified: the label computes to `rgb(7,7,7)` on `/blog/`, and again on `/good-deals/` after it became "Explore the tools".
- **`✅ DONE`** ~~`/dw-tools/` lists every mini tool.~~ Karthik's call, 2026-09-11: the panel's CTA should be "Explore the tools", leading to a page where all the mini tools are listed. The page is a starfield hero plus a card grid, built from `dw-tools/index.html`, `dw-tools.css` and `dw-tools.js`. Each card shows the tool's icon, its name with an arrow, and its description, the same as the panel items.
- **`DECIDED` The cards are rendered from `DW_TOOLS`, not written into the HTML.** That way the nav panel and the index cannot drift apart: add a tool to `DW_TOOLS` and it appears in both. **Trade-off:** the card links exist only after JS runs. The nav is already injected by `header.js` on the same terms, so this adds no new dependency. A static version belongs in the §5 Astro pass.
- **`DECIDED` The URL is `/dw-tools/`, not `/tools/`.** `/tools/` is the catalogue shell, and the mini tools already live at `/dw-tools/<slug>/`.
- **`DECIDED` The cards centre in the grid** (`auto-fit`, tracks capped at 356px, `justify-content: center`). With two tools, a fill-the-row grid left an empty third column beside the centred hero.
- **`DECIDED` `/dw-tools/` is in `sitemap.xml`.** **Watch the glass generator when this ships:** it is still held off `main`. If it is held back again, its `DW_TOOLS` entry has to go with it, as the original hold-back commit did. The index then can't show a card that 404s.
- **`PENDING` The hamburger does nothing on 9 pages.** Its click handler lives in `script.js`, and `index.html`, `404.html`, `tools/index.html`, `privacy/`, `terms/`, `salary/submit/`, `good-deals/`, `list-your-tool/` and the new `dw-tools/` index don't load `script.js`. Found while testing the panel: at 390px, tapping the toggle on `/good-deals/` opened nothing, while `/books/` opened the sheet. **This predates the panel.** The likely fix is moving the toggle handler into `header.js`, which every page loads. Not done, because it wasn't asked for.
- **Note:** `tools/category/*` are eleven 6-line redirect stubs pointing at `/category/*`. They disappear with file-based routing.

## 3. Data & Backend

- **`DECIDED` Google Sheets stays as the database.** The Sheet remains the editing surface.
- **`✅ DONE`** ~~Supabase is dropped entirely.~~ All Supabase code deleted (schema + 7 edge functions + client). **The hosted Supabase project itself still exists** — see the `PENDING` item in §6.
- **`✅ DONE`** ~~`scripts/sync-catalog.js` (Sheet → Supabase) is deleted.~~
- **`PENDING` ⚠️ Conflict: Karthik requires listings to appear at runtime.** Stated 2026-08-26: *"I want the website to be updated with runtime when I add list on it."* **That is how it works today** — the browser polls the Sheet every 5s, so a new row shows within seconds. But it directly contradicts the build-time decision below, which would delay new listings by up to an hour.
  **Proposed resolution (needs Karthik's call): do both.** Generate static pages at build time for SEO and instant first paint, then have the page re-fetch the Sheet on load and patch in anything newer. Crawlers get real HTML; editors still see changes immediately. Until this is settled, **do not remove the client-side fetch.**
- **`PENDING` The 5s poll is aggressive.** Every open tab makes 2 requests (one per tab of the Sheet) every 5 seconds — ~1,440/hour per visitor. Google's gviz endpoint is unmetered but not unlimited; being throttled would empty the catalogue for everyone. 30–60s would still satisfy the runtime requirement.
- **`DECIDED` The Sheet is read at build time, not in the browser.** Removes the per-visitor round trip, makes rate limits irrelevant, and means a Google outage can't break the live site. **Lands in §5 step 4.**
- **`DECIDED` The build validates catalog rows and fails loudly on bad data** — buys back the schema validation we give up by not using a real database.
- **Catalog schema:** `slug, title, subtitle, description, categories[], pricing, link, image, thumbnails[]`. *(Recorded from `sync-catalog.js` before deletion — this is now the only surviving record of it.)*
- **Accepted trade-off:** Sheet edits won't be live instantly — up to an hour on a schedule, ~2 minutes via a manual "Publish now" trigger.

- **`✅ DONE`** ~~Outbound tool links carry exactly one referral tag: `ref=designwallet`.~~ Fixed 2026-09-15 after Karthik saw `https://xiangyidesign.com/?ref=designwallet&via=designwallet`. **Cause:** all 401 main-tab links in the Sheet already end in `?ref=designwallet`, and `addReferralParam()` in `tools/tools.js` appended `via=designwallet` on top. It now **adds `ref=designwallet` only when a link has no `ref`**, so a partner's own affiliate `ref` is never overwritten, and it **deletes `via`**. Other params pass through untouched (one link carries `aff=kzPjR`). So links typed into the Sheet without a tag still get one, and links with one aren't doubled. `tools.js?v=` → `20260915-1` on the three catalogue shells. Verified in headless Chrome: 428 card links plus the tool-page Visit button, **0 with `via` or a second `ref`**.

## 4. Tech Stack

- **`DECIDED` Migrate to Astro, with React only for interactive islands.** Not a bare React SPA. **Not started.**
- **Reasoning on record:** React was originally proposed to make the site "smooth." That was the wrong diagnosis — the slowness was a 124 MB image payload, and React would have shipped the same images plus ~45 KB of runtime. The real justifications are: a hand-rolled router living in `404.html`, JSONP fetch logic duplicated in 4+ places, and 2,070 lines of imperative DOM code in one file.
- **`DECIDED` The real win is build-time static generation, not the framework.** Today the catalogue is client-rendered inside a 404 page and indexes badly. For a directory that lives on search traffic, that is the problem worth solving.
- **`DECIDED` Carry `style.css` over wholesale, unchanged.** Do **not** migrate to Tailwind or CSS modules at the same time — two simultaneous migrations is how rewrites fail.
- **`DECIDED` Keep the old site live until the new one is finished.** Build on a branch, deploy to a preview URL, compare, then switch.
- **Note:** JSONP is only used to dodge browser CORS. At build time in Node, a plain `fetch()` works — all four copies collapse into one module.

## 5. Sequencing

1. **`✅ DONE`** ~~Rip out the paywall on the current HTML/CSS/JS stack~~ (see §6)
2. **Astro scaffold** — empty shell that deploys, `style.css` copied in untouched
3. **Static pages** — privacy, terms, books, list-your-tool, submit-portfolio, colour converter
4. **Catalogue → build-time static generation** (the SEO and speed win) — also delivers §2's "`/` is the catalogue"
5. **Blog** — the Notion pipeline last

- **`✅ DONE`** ~~Paywall removal happens on a branch, not `main`.~~ Branch `remove-paywall`. **Merged and published 2026-09-01** after 57 commits — see the go-live entry in the implementation log.

## 6. Paywall Removal — Manifest

**`✅ DONE` Deleted:** `pricing/` · `get-access/` · `account/` · `auth/` · `supabase/` · `join-waitlist/` · `scripts/seed-user.js` · `scripts/sync-catalog.js`

**`✅ DONE` Edited:**

| File | Change |
|---|---|
| `404.html` | ✅ un-gated — `dw-gate-pending` + 3 auth scripts removed |
| `tools/index.html` | ✅ same |
| `index.html` | ✅ waitlist modal removed; both CTAs repointed at `/category/`; auth scripts dropped |
| `script.js` | ✅ 117 lines of waitlist logic removed |
| `header.js` | ✅ rewritten — nav unified across all pages; profile menu + `updateAccessLink()` gone |
| `style.css` | ✅ `dw-gate-pending` rule removed |
| `privacy/`, `terms/` | ✅ audited — **no payment clauses existed to remove**; one line fixed in `terms` |

- **`✅ DONE`** ~~`privacy/` and `terms/` are rewritten, never deleted.~~ **Finding: the rewrite was almost unnecessary.** Both pages predate the paywall and contain zero subscription, refund, or billing language. Only "visitors, users, and subscribers" in `terms` §1 needed fixing. **`terms` §3 "User Accounts" is still accurate** because it describes the *favourites* Google Sign-In, which is untouched — it will need updating if favourites moves to `localStorage`.
- **`PENDING` Favourites.** Untouched by the paywall removal — `favourites.html` still uses its own Google Sign-In, separate from the deleted Supabase auth. Recommendation on record: move to `localStorage`, delete the login. Trade-off: bookmarks won't sync across devices. **Awaiting Karthik's call.** Coupled to `terms` §3 above.
- **`PENDING` Cancel the Lemon Squeezy product and delete the Supabase project.** Both still exist and still cost/bill. The code is gone, so nothing references them — safe to cancel whenever.
- **`✅ DONE`** ~~`admin/index.html` survives.~~ Verified untouched and serving.

## 7. Performance Standards

Established while fixing a real incident — the homepage was shipping **127 MB** of images. Now **296 KB** (~440× smaller).

- **`✅ DONE`** ~~No raw source images in the served path.~~
- **`✅ DONE`** ~~Avatars are 128×128 WebP~~ (3× for retina), square-cropped, in `public/avatars/`. 23.4 KB for all ten.
- **`✅ DONE`** ~~Photos are never PNG.~~ Waitlist modal image: 2.57 MB PNG → 125 KB WebP.
- **`✅ DONE`** ~~Below-the-fold images get `loading="lazy"` + `decoding="async"`; every image gets explicit `width`/`height`.~~
- **`DECIDED` Framework choice is not a performance strategy.** Measure the payload first. *(Standing rule.)*

### Known issues, not yet fixed

- **`✅ DONE`** ~~Five hero avatars load from `i.pravatar.cc`.~~ Resolved by deletion — the hero is gone, so the five third-party requests went with it.
- **`✅ DONE`** ~~124 MB of original JPEGs in `public/testimonial images/`.~~ Deleted 2026-09-01 on Karthik's call, in commit `ce6573d`. Verified unreferenced first — nothing outside this file mentioned them, and the ten faces actually in use are the optimised WebPs in `public/avatars/` (23 KB for the set). **The deployed site is 124 MB lighter; the repo is not** — they stay in history and remain recoverable, exactly as noted when they were preserved.
- **`PENDING` Font typo:** `style.css` reads `font-family: 'giest'` — should be `'Geist'`. Silently falling back to sans-serif today. *Deliberately not fixed during the paywall removal — it changes rendering, and shouldn't be buried in a large deletion diff.*
- **`PENDING` Two separate Google Fonts stylesheet requests** could be merged into one round trip. *(Partly improved: the Geist Mono family is no longer requested on 12 of 13 pages.)*
- **`✅ DONE`** ~~Dead code: the billing-toggle script in `list-your-tool/index.html` references `.pr-billing-toggle`, which doesn't exist in the markup.~~ Deleted 2026-09-11 with the pricing page, along with every `.pr-*` rule in `style.css` (§13).
- **`PENDING` Dead CSS:** `.nav-profile*`, `.nav-pricing-link`, `.nav-waitlist-button` rules survive in `style.css` with no consumers. Harmless; left alone because `style.css` is carried over wholesale in §4.

## 8. Open Source Readiness

- **`PENDING` No `LICENSE` file exists.** Without one, "open source" isn't legally true — default copyright applies and nobody may fork it. **This blocks §1's open-source decision.** Needs Karthik to pick a licence (MIT is the usual default for this kind of project).
- **`PENDING` A real `README.md`** — current one is minimal, though it now links to this file.
- **Verified clean:** `.env` is gitignored, was **never committed**, and holds only Notion keys. A history scan found no service-role keys, Lemon Squeezy secrets, or webhook secrets. **Do not break this.**
- **`✅ DONE`** ~~The Supabase anon key dies with the paywall.~~ `auth/config.js` deleted; no keys remain in the working tree.

## 8b. Footer

- **`✅ DONE`** ~~The site footer is removed from every page.~~ Requested 2026-09-01 as not needed. Deleted `footer.js`, the `<footer class="site-footer">` element and its `<script>` on **all 14 pages**, the footer emit in `scripts/build-blog.js` (both the element and the tag, so a rebuild cannot bring it back), ~35 rules of footer CSS, and the now-dead `body.is-dashboard .site-footer { display: none }` in `dashboard.css`.
- **Gotcha on record — three shared selector lists contained a footer selector** and had to be trimmed, not deleted: `.site-header, .hero, .divider-strip, .catalog-section, .submit-strip, .site-footer`; `.hero-copy, .section-copy p, …, .site-footer p`; and `.blog-index-page .brand-logo, .blog-index-page .footer-brand img`. Deleting those rules wholesale would have stripped the content-width cap from five layout containers and the muted colour from four text styles. **This is exactly the trap recorded in the dashboard section** — the removal was done by parsing rules and dropping selectors from lists, then verified with a comment- and whitespace-normalised rule-by-rule diff: 35 rules removed, **0 of them non-footer**, 3 rules rewritten with only the footer selector gone.
- **`PENDING` `/terms/` and `/privacy/` are now unlinked from anywhere on the site.** The footer held the **only** links to them; there is no `sitemap.xml` either. Both pages still serve 200, but nothing on the site points at them and nothing tells a crawler they exist. Karthik was told; a link needs a new home (nav, or a slim legal line) if these are to stay discoverable.
- **`PENDING` The site-wide affiliate disclosure went with it.** "Partner links may be affiliate links, which help support Design Wallet at no extra cost." lived only in the footer. Catalogue outbound links carry `?ref=designwallet`, so the disclosure was doing real work on every page. **Only `books/index.html` still has one** (its own tooltip: "Some links are affiliate links…"). Every other page — including the whole tool catalogue — now carries none.

## 8c. Sheet tabs (the 2026-09 database cleanup)

- **`DECIDED` One Sheet tab per category, all merged into one catalogue.** Karthik is reorganising the database into a tab per category, starting with **3D Tools**. Every tab in `SHEET_TABS` (`tools.js`) is fetched, parsed with the same 8-column schema, and merged; **a tool's category still comes from its `categories` COLUMN, not from which tab it sits in.** Tabs are an authoring convenience, nothing more — no code reads meaning into the tab name.
- **`DECIDED` Tabs are referenced by NAME, not gid.** `SHEET_GIDS` became `SHEET_TABS`; gviz takes `sheet=<name>` as readily as `gid=<n>` and matches the name **case-insensitively**. A name is readable and survives a tab being recreated. Numeric entries still work, so the two legacy tabs stay as gids.
- **`⚠️ GOTCHA — the one to remember` gviz NEVER errors on a tab that isn't there.** An unknown tab name, a typo, or a dead gid all return **`status: ok` carrying some OTHER tab's rows**. Proved three ways: `sheet=3D Tools` (deleted), `sheet=bogus-name` (invented) and `gid=2103254490` (dead) all returned byte-identical payloads — the 2-row tab `1218813985`. There is no error, no empty result, and nothing in the payload naming the sheet. **A typo in `SHEET_TABS` silently imports the wrong data.**
- **`✅ DONE`** ~~Defended with the `sig` field.~~ Every gviz response carries `sig`, a per-tab content signature. `loadAllTools()` now records each signature and **drops any payload whose signature it has already seen this cycle**, since that means the entry resolved to a tab already loaded. Measured with a deliberately broken list (a deleted tab plus a typo): **365 rows merged without the guard, 363 with it** — the two bogus entries contribute nothing instead of quietly duplicating the fallback tab.
- **`3D Tools` tab was deleted** by Karthik after the MCP move; its rows live in the main tab again (still 8 under that category), so the entry was removed from `SHEET_TABS`. Its gid `2103254490` is dead.
- **Migration is safe to do gradually.** `dedupeTools()` merges by slug and unions categories, so a tool sitting in *both* the main tab and its new category tab appears **once**. Copy a category into its own tab and delete it from the main tab whenever — there is no window where rows double up or vanish. (Right now 3D Tools' 6 rows are duplicates of main-tab rows, so the new tab added 0 net tools, exactly as expected mid-migration.)
- **`✅ DONE`** ~~A tab that loses its header row can no longer poison the catalogue.~~ `buildTools()` treats row 0 as the header; a tab mid-edit can briefly have no header, making every key nonsense and yielding titleless junk that merged into the tool list. It now **requires a recognisable `title`/`name` header and skips the tab otherwise**, so one tab being edited cannot corrupt the others. **This is not theoretical** — while wiring this up, gid 0 was observed live at 10 rows with no header row, mid-save, before recovering to 356.
- **Tabs wired so far (2026-09-01):** `0` (main), `1218813985` (legacy), **`MCP Connectors`** (9), **`AI creative suites`** (3), **`AI voiceover`** (1). `3D Tools` was created then deleted; its rows are back in the main tab.
- **`PENDING` The `AI voiceover` tab's one row is mis-categorised.** **Wispr Flow** sits in that tab but its `categories` cell reads **"AI Creative Suites"**. Because a tool's category comes from the **column, never the tab name**, Wispr Flow lands under AI Creative Suites (taking it to 4) and **AI Voiceover still shows only Lovo AI**. Fix is one cell in the Sheet — no code change. Worth a sweep as tabs multiply: **a tab name and its rows' category column can drift apart silently, and the tab name always loses.**
- **`✅ DONE`** ~~`build-icons.js` reads the tab list from `tools.js`.~~ It used to keep its **own** `SHEET_GIDS = ["0", "1218813985"]`. The moment categories moved into their own tabs that copy went stale: the script could no longer see `mcp-connectors` or `ai-creative-suites` as live categories, and since it **rebuilds** `CATEGORY_ICONS` from what it can match, the next `--write` would have **deleted both icons** — silently, while reporting success. It now parses `SHEET_TABS` out of `tools.js`, so there is one source of truth. **Any future tooling that reads the Sheet must do the same.**
- **`PENDING` Request cost does not scale to ~39 tabs.** Every tab is **one JSONP request** (gviz sends no CORS headers, so `fetch` is not an option and the browser **cannot enumerate tabs** — hence the hardcoded list). `loadAllTools()` fires them all on load **and again every `SHEET_REFRESH_INTERVAL` = 5s**. At **4 tabs that is 48 req/min** per open page; at 39 tabs it is **~470 req/min**, which will hit Google's rate limiting. **Fix before the tab count gets far past ~10.** Cheapest option that keeps the 5s feel: refresh **one tab per tick, round-robin**, holding the request rate flat regardless of tab count.
- **Note:** the browser cannot list the Sheet's tabs, so `SHEET_TABS` must be maintained by hand — one line per new category tab. `pubhtml` (which does list them) returns 401 and is not JSONP, so it is unusable from the page.

## 9. Newsletter & Theme

- **`✅ DONE`** ~~Newsletter signup lives in the nav.~~ `SUBSCRIBE` opens a modal that `newsletter.js` injects on every page, so no per-page markup is needed.
- **`SUPERSEDED` The homepage first fold carries an inline signup.** Removed 2026-08-26 — the fold is headline + sub-copy only; signup lives in the nav modal.
- **`DECIDED` Newsletter posts to the original Google Apps Script endpoint** recovered from the deleted waitlist code, so existing subscribers keep landing in the same sheet. *(That endpoint is now only recorded in `newsletter.js` and commit `ba59688`.)*
- **`DECIDED` The site is dark-only.** Light mode was removed 2026-09-01 — it was never wanted yet and had never been seen rendered in a browser. Removed: `theme.js` (deleted), its `<script>` on all 10 pages, the nav toggle (`THEME_ICONS` / `themeToggleMarkup` / `wireThemeToggle` in `header.js`, `.nav-theme-toggle` in `style.css`), the `:root[data-theme="light"]` token block, and the `filter: invert(1)` logo rule. Nothing now reads `data-theme`, `DWTheme` or `prefers-color-scheme`.
- **`DECIDED` Theming stays token-only even though there is only one theme.** ~480 hardcoded colours are still tokens, and **that layer is deliberately kept** — it is the entire cost of bringing a second theme back, so a rebuild is a token block plus a toggle, not another 480-substitution pass. Never reintroduce a raw hex or `rgba(255,255,255,…)` — use `var(--fg-rgb)`, `var(--pure)` or a `--surface-*` token.
- **How to bring light mode back:** re-add a `:root[data-theme="light"]` block redefining the tokens, plus a toggle that sets the attribute. The removed versions of both are in git as of commit `93d6b43`. The `filter: invert(1)` logo rule must come back with it, **and the footer mark needs its own selector** (`footer.js` emits a bare `<img>` with no `.brand-logo` class, so `.footer-brand img` must be listed separately or the footer logo stays white and vanishes).
- **`DECIDED` If a theme toggle returns, its script loads synchronously before every `<link>`.** A sync script placed *after* a stylesheet is blocked until that CSS downloads, which reintroduces the flash of wrong theme. This is why `theme.js` sat where it did.
- **Gotcha on record:** custom properties do **not** resolve inside `url("data:image/svg+xml,…")`. Colours inside SVG data-URIs must stay literal; one was caught doing exactly this.
- **Note:** `muted` text is 3.55:1 — below WCAG AA for body copy. Pre-existing and now the only theme, so it is worth fixing.
- **`SUPERSEDED`** ~~Dark/light mode toggle, light-mode cool palette, black brand logo in light mode, light-mode visual polish pending.~~ All folded into the dark-only decision above.

---

**2026-08-24 — Newsletter, first fold, dark/light theme** · commit `37221b6`

New files: `theme.js`, `newsletter.js`. Reference: Good Design Tools.

**Theme conversion was done so it could not break dark mode:** each of ~480 substitutions used the original literal as the token's dark value, then a script re-resolved every token and diffed the result against a backup — confirming byte-identical output. That diff is what caught an `rgba()` trapped inside an SVG data-URI, where variables never resolve.

**Verified:** 11 routes 200 · every asset resolves · 6 JS files pass `node --check` · both stylesheets brace-balanced · `theme.js` precedes every `<link>` on all 12 pages · contrast measured in both themes.

**Not verified:** no browser was available in this environment, so **light mode has not been seen rendered**. The token architecture and contrast are sound, but expect visual snags where the ~100 remaining hex literals live.

## 10. Typography & Layout

- **`✅ DONE`** ~~Geist Mono is replaced by Geist across the site.~~ 34 declarations changed. **One deliberate exception:** the colour converter's code output (`.converter-output-row code`, `.converter-css-panel pre`) keeps a real monospace face, because hex values need aligned character widths. Geist Mono is therefore still requested on that page only.
- **`✅ DONE`** ~~The nav is full width on every screen.~~ `.site-header` is `width: 100%` with `max-width: var(--content-width)`, centred; the dashboard override clears the cap so it stays edge-to-edge.
- **Root cause on record:** the nav was stuck at half width because `.site-header` carried a hardcoded `width:50%`, which had **replaced** `max-width: var(--content-width)` in the never-committed work. It only looked correct on the dashboard, where an override forced `width:100%`.
- **`✅ DONE`** ~~Category icons show in the sidebar **and** on the card footer tags.~~ **All 37 categories** have icons — full coverage, verified against the live sheet.
- **`✅ DONE`** ~~`scripts/build-icons.js` automates adding icons.~~ Drop files in `public/icons/`, run `node scripts/build-icons.js` (dry run) then `--write`. It kebab-cases filenames, matches each to a **real slug from the live sheet**, pins `currentColor`, and rewrites the `CATEGORY_ICONS` block.
- **`DECIDED` Unmatchable filenames become explicit `ALIASES` in `build-icons.js`, never hand-renames.** The script refuses to guess when no unique category matches; recording the decision in the script keeps the mapping visible and the run idempotent. Five are on record: `image-generation`→`img-gen`, `video-genration`→`vid-gen`, `mockup-inspitations`→`mockup-websites`, `prototype`→`prototyping-tools`, `uiux`→`ui-ux-inspirations` (two are typos in the export).
- **`DECIDED` Never derive a category slug from a filename.** Exports are routinely singular where the category is plural — `design course` → `design-courses`, `design community` → `design-communities`, `design inspiration` → `design-inspirations`. The script fuzzy-matches against the sheet and refuses to guess when ambiguous.
- **`DECIDED` SVG is the preferred icon format** — scales cleanly and needs no alpha preprocessing, unlike PNG.
- **`DECIDED` One helper renders both:** `categoryIconMarkup(slug, size, fallback)` — sidebar at 16px, card tag at 13px. Add an icon once and it appears in both places.
- **`DECIDED` Adding a category icon is two steps:** drop a transparent monochrome PNG at `/public/icons/<slug>.png`, then add the slug to `CATEGORY_ICON_SLUGS` in `tools.js`. The path is derived from the slug — there is no separate path map to keep in sync.
- **`DECIDED` Category icons are painted as CSS masks filled with `currentColor`**, not as `<img>`. One monochrome asset then works in both themes automatically, matching the inline SVGs which use `stroke="currentColor"`.
- **`DECIDED` Icon exports must be checked before use — three failure modes seen so far, all silent:**
  1. **Opaque ground** (`3d Software.png`): alpha 100% everywhere with `#0D0D0D` baked in. Blends into dark mode, shows as a black tile in light mode.
  2. **Half-opaque artwork** (`accessibility.png` as supplied): genuinely transparent, but peaked at 50% alpha, so the mask rendered washed out against the nav text.
  3. **`stroke="currentColor"`** (the SVG batch): through a CSS mask only alpha is read, and `currentColor` in an isolated SVG-as-image context is unreliable — ImageMagick renders these as a **completely empty mask**. Pinned to `#000000` by the build script; visually identical, since CSS fills the mask with `currentColor` anyway.

  Fixes: normalise alpha for PNGs (stripping an opaque ground first), pin `currentColor` for SVGs. **Originals are committed before processing** so the raw export stays recoverable.
- **Gotcha on record:** the supplied `3d Software.png` was **fully opaque with a `#0D0D0D` background baked in** — no real transparency. Dropped in as-is it blends into dark mode but shows as a black tile in light mode. `public/icons/3d-tools.png` is derived from it by taking alpha from normalised luminance. **Any future category icon needs the same treatment** unless it is exported with a genuine alpha channel.
- **Gotcha on record:** icons dropped into `public/icons/` get swept into commits by `git add -A` **without being processed** — spaced filenames sit there unregistered and coverage silently under-reports. Always run `node scripts/build-icons.js` after any icon lands, not just when asked.
- **`✅ DONE`** ~~The orbiting starfield is back, behind the hero title.~~ Lost when the marketing homepage was replaced; restored inside `.dash-hero`. 100 orbits, 133–1020px, 20–90s, both directions.
- **`DECIDED` `stars.js` is shared by every hero that carries a `#stars-field`** — the three catalogue shells, `/list-your-tool/` and, since 2026-09-01, `/good-deals/`. **Do not tune its constants for one page; add a per-element option instead.** The pressure to do so grows with each page that adopts it.
- **Note:** the original hero was full-viewport; the new one is ~400px tall with `overflow: hidden`, so the larger orbits are clipped and the field reads sparser than before. Tunable if it looks wrong in a browser.
- **`✅ DONE`** ~~The email signup is removed from the first fold on every catalogue view.~~ The newsletter is reached through `SUBSCRIBE` in the nav, which opens the injected modal. Supersedes the earlier "first fold carries an inline signup" decision — the fold is now just headline + sub-copy.
- **`✅ DONE`** ~~A "Loved by" avatar row sits in the first fold.~~ Ten overlapping 36px avatars under the sub-copy, identical on all three shells. Reuses the optimised `/public/avatars/` set (23 KB total) that had been orphaned since the marketing hero was removed — no new image weight. Ring uses `var(--pure)` so it reads in both themes; caps at six avatars below 700px.
- **Note:** those avatars are the **stock portraits from the old testimonials section**, not real users. Fine as placeholder social proof, but worth swapping for real faces (or real logos) before making a stronger claim than "Loved by".
- **`✅ DONE`** ~~A "Hot trends" section sits above the category nav.~~ Driven by **`DW_TRENDS` in `tools.js`** — edit that array and nothing else. Rows reuse `.dash-nav-row`, so a trend is visually identical to a category; it is a shortcut, not a new visual language. The block is pinned (`flex: 0 0 auto`), so `.dash-nav` keeps `flex: 1` and stays the only scrolling part of the sidebar.
- **`DECIDED` A trend resolves against live sheet data, and hides itself when empty.** Order: a category whose slug matches `slug` → else the `query` search → else **the row is not rendered at all**, and the whole block (heading included) hides when no row survives. This means the list can name a trend *before* the catalogue has anything under it — the row appears on its own the moment tools are tagged. It also means a trend can never be a dead link.
- **`✅ DONE`** ~~"MCP Connectors" renders.~~ Karthik added **Higgsfield MCP** to the Sheet under a new `MCP Connectors` category on 2026-09-01 and the row appeared **with no code change** — the trend resolved from the search fallback to a real category link on the next data refresh. This is the data-driven design paying off exactly as intended; all three requested trends now render. Categories went 37 → 38.
- **`✅ DONE`** ~~`mcp-connectors` has its own icon.~~ Authored as `public/icons/mcp-connectors.svg` in the house style (24×24, `fill="none"`, `stroke="#000000"`, stroke-width 1.5) — a four-node hub, which reads as "connectors" at 16px. Without it the new category was the **only** one of 38 falling back to the generic hash glyph, in both the trends block and the category list. Registered via `node scripts/build-icons.js --write`; the re-run reports "already in sync", so it is idempotent.
- **Fixed a script bug in `build-icons.js`:** it printed `! CATEGORY_ICONS block not found in tools.js — registry NOT updated` on every **clean** run. The check was `updated === js`, which is true both when the regex misses *and* when the regenerated block is byte-identical — the healthy steady state. Those are now three distinct messages ("not found" / "already in sync" / "OUT OF DATE — pass --write"). It had been crying wolf; a real failure would have been indistinguishable from a no-op.
- **`✅ DONE`** ~~The "Hot trends" heading carries the flame mark.~~ `public/icons/hot-trends.webp`, painted as a **CSS mask filled with `currentColor`** at 13px, so it takes the label's own muted colour rather than sitting there as a full-black bitmap — the same treatment as the category icons. Verified as mask-safe before use: 300×300 RGBA, alpha min 0 / max 255, **62% fully transparent ground and 36% fully opaque artwork**, which is exactly what the mask rule requires.
- **`DECIDED` The flame is a section-heading asset, not a category icon.** It is deliberately **not** in `CATEGORY_ICONS` — `hot-trends` is not a category, and `build-icons.js` handles only `.svg`/`.png` so it ignores the file entirely (confirmed: the script still reports "already in sync"). It is referenced straight from `dashboard.css` instead.
- **Renamed `Hot Trends.webp` → `hot-trends.webp`** on arrival, matching every other file in the folder and avoiding a URL-encoded space in the CSS. `build-icons.js` kebab-cases `.svg`/`.png` automatically; **`.webp` drops through that net**, so it has to be done by hand.
- **`✅ DONE`** ~~Both sidebar headings carry an icon.~~ "Hot trends" gets the flame; "Categories" gets `all-categories.svg`, the same four-square mark the "All" nav row uses. Still **no markup change** — the two headings share `.dash-sidebar-label` and are told apart structurally: the trends heading is nested in `.dash-trends-section`, "Categories" is the only one that is a **direct child** of `.dash-sidebar`, so `>` separates them.
- **`DECIDED` `all-categories.svg` is a UI mark, not a category icon**, so it is listed in `KEEP_AS_SOURCE` in `build-icons.js`. Without that the script reports it as an unmatched category on every run.
- **Gotcha on record — an icon mask needs `display:flex` on its parent.** `.dash-sidebar-label::before` is a `content: ""` box sized only by `width`/`height`, and **width and height are silently ignored on an inline box**. When the parent lost `display: flex`, the mark did not shrink or misalign, it vanished completely with no error anywhere.
- **Gotcha on record — the grouped-selector trap, hit again, from the other direction.** The flame block was inserted by string-matching on `.dash-sidebar-label {`, which also matched the **tail of** `.dash-trends-section:not([hidden]) + .dash-sidebar-label {`. The insert landed mid-selector, leaving `... + /* comment */ .dash-trends-section .dash-sidebar-label` — legal CSS matching nothing — and orphaned the divider's declarations onto a bare `.dash-sidebar-label`, so **both** headings drew a top border. Brace-balance and the layout check both passed. The existing rule was "confirm the match is a whole rule, not the tail of a selector list" when **deleting**; it applies just as much when **inserting**. Anchor on something unique, and re-read the region afterwards.
- **`✅ DONE`** ~~All three trends have real icons.~~ `mcp-connectors.svg` (Karthik's plug mark, which replaced the placeholder), `vibe-coding.svg`, and `ai-creative-suites.svg` — all registered in `CATEGORY_ICONS` by `build-icons.js`, because **all three are now genuine sheet categories**. No bespoke icon map is needed; an earlier `TREND_ICONS` fallback was written and then removed once `ai-creative-suites` turned out to be a real category.
- **Gotcha on record — Noun Project SVGs carry their credit as `<text>` INSIDE the artwork.** `ai-creative-suites.svg` arrived with a `0 0 100 125` viewBox where the bottom 25 units held two `<text>` credit lines. Icons are painted as **alpha masks**, so those glyphs would have rendered as garbled marks under the sparkle. Stripped the text and tightened the viewBox to `0 0 100 100`. **The original is preserved in the scratchpad only — the attribution requirement still stands** unless the icon is licensed; it now needs crediting somewhere else on the site.
- **Gotcha on record:** a trend's `slug` is the **Sheet's own category slug, not a slug of the label**. "Vibe Coding Tools" points at `vibe-coding` (the real category, with its icon and count); slugging the label would have given `vibe-coding-tools`, which matches no category and would have silently downgraded it to a search link.
- **Gotcha on record:** `.dash-trends-section + .dash-sidebar-label` needed `:not([hidden])`. The section stays in the DOM when empty, and an adjacent-sibling selector still matches a hidden element — so the "Categories" divider would have been drawn above nothing.
- **`PENDING` Dead CSS:** `.dash-hero-form` / `.dash-hero-note` rules survive in `dashboard.css` with no markup using them. Harmless; left for the Astro pass.
- **`✅ DONE`** ~~The first fold persists on every catalogue view.~~ Same h1, subline and email signup on `/`, `/category/*` and `/tools/*`; only the grid below changes with the category. It is static markup inside `#dashboard-view` — no JS toggling — so it also survives search.
- **`SUPERSEDED` Trim the logo padding with `t-true`.** The premise was wrong and the transform was actively destructive — see the no-trim decision below.
- **Gotcha on record:** the transform originally used `c-at_max`, which **only ever shrinks**. A wordmark trimmed to 128x59 kept a 59px short side, so the browser upscaled it 1.8x to fill the 104px tile — that was the blur. Never cap with `c-at_max` on an image that must fill a box.
- **`SUPERSEDED` Normalise logo scale by trimming, then padding back to square.** Replaced 2026-09-01 by the no-trim decision below, once the trim was measured rather than assumed.
- **`✅ DONE`** ~~The "Loved by" row uses six specified avatars~~ — `aarav-nair, isha-kapoor, kabir-sheikh, priya-menon, nikhil-varma, meera-iyer`, identical on all three shells.
- **`✅ DONE`** ~~Blog cover images are downloaded locally.~~ **Notion serves file URLs as pre-signed S3 links with `X-Amz-Expires=3600`** — they die one hour after each build. Author photos and inline images already went through `syncImageAsset()`; the cover did not, so every cover 404'd an hour after publishing. Fixed in `build-blog.js`; both posts regenerated with local covers.
- **`PENDING` Blog covers are unoptimised PNGs.** `the-leadership-lesson…-cover.png` is **2.0 MB** (would be ~124 KB as WebP); the other is 352 KB (~180 KB). This breaks the §7 rule that photos are never PNG. Not fixed manually because **the next `build-blog` run would re-download the PNG and silently undo it** — the conversion has to happen inside `syncImageAsset()`, which needs an image library (`sharp`) added to the project.
- **`PENDING` Ten source images are too small to fill the tile sharply** and no transform can fix that — the pixels aren't there. Worst: `viewport-ui.design` (26x26), `collectui.com` (25x30), `drams.framer.website` (32x32), `builtformars.com` (30x40), `appshots.design` and `pushkeen.ai` (48x48). These need higher-resolution logos in the **Sheet**, not code changes.
- **`SUPERSEDED` `object-fit: cover` with a crop-to-square transform.** Replaced by the pad-and-fill decision below — cropping was reversed once the wordmark cost was measured.
- **`✅ DONE`** ~~Logo tiles fill edge to edge with no CSS padding.~~ The `padding: 7px` on `.dash-card-logo img` and `padding: 6px` on `.logo-badge.has-image img` are gone; both are now `object-fit: cover` with no inset. `iconUrl()` has already trimmed and scaled each logo to a 128 square, so the artwork itself reaches the tile edges at one uniform scale. `cover` rather than `contain` so a non-ImageKit URL (which skips the transform and may not be square) still fills instead of letterboxing.
- **`DECIDED` Non-square logos letterbox rather than crop.** Measured over a **78-logo live sample** (every 4th of 327 unique icons): **68% are square** (≤5% off) and fill the tile exactly; **17% are near-square** (5–20%) and show a hairline band; **6% moderate**; **9% are wide wordmarks** that stay visibly letterboxed. Closing that last 15% requires switching `cm-pad_resize` to a crop-to-square, which costs Brand Archive 72% of its width, saasui.design 71%, Ecomm Design 44%, Coolicons 43%, SaaS Landing Page 42%, SaaSFrame 42% and s11s 39% — unreadable centre slices. **Karthik chose the letterbox over the crop on 2026-09-01.** Fixing the rest properly means squarer source logos in the Sheet, not a code change.
- **`✅ DONE`** ~~Tool logos use the source favicon's own 1:1, uncropped.~~ **`tr=w-128,h-128,cm-pad_resize,bg-00000000`.** The favicons are *already square* — measured across a 24-icon sample, **23 of 24 are exact squares** (the exception is a `.jpg`, not a favicon). So there is nothing to normalise: scale the square to 128 (2× the 52px holder) and stop.
- **`DECIDED` NEVER reintroduce `t-true`. It was the bug, not the fix.** Trimming sounds right — strip each logo's padding so they all read at one scale — but it strips a uniform border of **any colour**, and on a favicon that border is usually the brand plate itself. **Measured: the trim turned 11 of 24 already-square sources into non-squares.** Worked example, `10kdesigners`: a 64×64 purple tile reading "10k" → trimmed to the **41×14** bounding box of the white text → upscaled ~3× to fill 128 → delivered as a giant blurry wordmark on a white band. It read as a badly cropped image, and it destroyed the very logo it was meant to normalise. The earlier "22% fill" measurements that justified the trim were measuring *artwork inside its plate*, not wasted padding.
- **`DECIDED` `bg-00000000`, not ImageKit's default pad colour.** `cm-pad_resize` pads with **white** by default. A white band inside a dark tile is precisely the "white space" complaint; the 8-digit hex makes the pad transparent, so the holder shows through. Confirmed by response type: with the flag ImageKit returns `image/png` with alpha, without it `image/jpeg` with none.
- **Why `cm-pad_resize` at all, if sources are square?** It only ever acts on the rare non-square source, where it letterboxes instead of cropping — and `pad_resize` upscales, which `c-at_max` does not (see the blur gotcha above). For a square source it is a no-op.
- **`DECIDED` All tool icons go through `iconUrl()`.** All 339 come from ImageKit (one stray on `media.licdn.com`, passed through untouched). Any new render site must use it or the gaps come back.
- **Known trade-off:** the trim removes a uniform border of **any colour**, so a logo drawn on a white plate loses that plate and sits on the holder background. Spot-checked 12 in situ and all stayed legible (the plate between strokes is interior and survives), but it is a visual change worth watching as the catalog grows.
- **`✅ DONE`** ~~`scripts/check-layout.js` guards the dashboard's load-bearing CSS.~~ Run it after touching `dashboard.css`. It asserts the sidebar isn't hidden at top level, `.dashboard` keeps its two-column grid, `.dash-main` children stay unshrinkable, and no bare selector shares a block with pseudo-element rules.
- **Gotcha on record — editing grouped selectors.** Consolidating rules by string-matching once removed the `.dash-main { … }` half of `.dash-sidebar,\n.dash-main { … }`, leaving `.dash-sidebar,` dangling in front of the next rule. It merged into that selector list and gave the sidebar `display: none`; `.dash-main` then fell into the sidebar's 280px grid column. **This is legal CSS** — brace-balance and syntax checks all passed. When deleting a rule, confirm the match is a whole rule, not the tail of a selector list.
- **Gotcha on record:** `.dash-main` is a **fixed-height flex column**, so every child defaults to `flex-shrink: 1` and gets compressed when content exceeds the panel. Combined with `.dash-hero`'s `overflow: hidden` (needed to clip the starfield), that silently *sliced* the headline instead of overflowing. `.dash-main > * { flex: 0 0 auto; }` pins children to their natural height so the panel scrolls. **Anything added to `.dash-main` inherits this trap.**
- **Root cause on record:** the fold lived only in `index.html`, but category URLs are served by `404.html`. Anything that must appear on a category page has to be in **all three** catalogue shells, or it silently vanishes on navigation.
- **`✅ DONE`** ~~The "+N tools for digital designers / Add yours" capsule is removed.~~
- **`✅ DONE`** ~~Nav uses the category sidebar's type~~ — 0.9rem / weight 400 / `--muted-strong`, sentence case, replacing 12px / weight 200 / uppercase. Every `.site-nav` child is an inline-flex row so the dropdown `<div>` aligns with its `<a>` siblings; the hover `translateY` that made the row look uneven is gone.
- **`✅ DONE`** ~~Nav is Books · Good deals · Tools ▾ · Blog · Subscribe~~ (BROWSE removed).
- **`✅ DONE`** ~~The sidebar has a pinned "List your tool" CTA; only the category list scrolls.~~
- **`PENDING` `/good-deals/` is a placeholder.** Created because the new nav item needed a destination — it has the right chrome and an email capture, but **no real deals**. Content still needed.
- **`✅ DONE`** ~~The value cards under the Good deals hero ("Only tools we list", "Checked before posting", "Run a design tool?") are removed.~~ Karthik's call, 2026-09-13. The `.ga-value` section and all its `.ga-value-*` styles are gone, so the page ends at the email form. This also drops Good deals' inbound link to `/list-your-tool/`.
- **`✅ DONE`** ~~The starfield sits behind the Good deals hero.~~ Same treatment as the dashboard and list-your-tool heroes: a `#stars-field` div, `.ga-hero` given `position: relative` to anchor it and `overflow: hidden` to clip the wider orbits. `stars.js` untouched.
- **Gotcha on record — `.stars-field` paints *over* hero copy unless the copy is lifted.** It is `position: absolute` with `z-index: 0`, and a positioned element at z-index 0 paints above non-positioned in-flow siblings. The dashboard solves this with a `.dash-hero-content` wrapper; Good deals had no wrapper, so `.ga-hero > :not(.stars-field) { position: relative; z-index: 1 }` does it without restructuring the markup. **Any new page adopting the field needs one or the other, or the text sits behind the stars.**
- **Gotcha on record:** `.ga-*` classes came from `pricing/pricing.css`, deleted with the paywall. Any page reusing that old markup must bring its own stylesheet.
- **`✅ DONE`** ~~Panel scrollbars are hidden but still scroll.~~ `.dash-sidebar` and `.dash-main` set `scrollbar-width` (Firefox), `-ms-overflow-style` (legacy Edge) and `::-webkit-scrollbar` (Chrome/Safari) — all three are needed; the webkit rule alone is not enough.

---

**2026-08-24 — Nav width, hidden scrollbars, Geist Mono removal** · commit `0198017`

Three fixes from a screenshot review. The nav-width bug was a regression, not a design choice — `width:50%` had replaced `max-width: var(--content-width)` in the uncommitted work, so every non-dashboard page (blog, privacy, terms, list-your-tool, books, converter) had a half-width nav.

**Verified:** both stylesheets brace-balanced · 7 routes 200 · font URLs still valid after stripping the Geist Mono family · no stray `width:50%` left on the header.

---

**2026-08-25 — Sidebar category icon** · commit `db8210a`

`3d-tools` (slug verified against the live sheet, not assumed) renders the supplied 3D icon in the sidebar. Mechanism is a slug-keyed map plus a `currentColor` CSS mask, so it extends to any category.

The supplied PNG had an opaque dark background baked in, so a transparent mask was derived from it; the original is kept untouched as the source asset. **The derived file is required — deleting `public/icons/3d-tools.png` removes the icon.**

---

**2026-08-25 — Accessibility icon + icon list refactor** · commits `efc98e6`, `f74ba92`

Second icon wired. `CATEGORY_ICONS` (slug → path map) became `CATEGORY_ICON_SLUGS` (plain list) with the path derived from the slug, so there is no longer a map to keep in sync with the filenames.

This export had the opposite problem to the first: real transparency, but only 50% peak alpha, which renders faint as a `currentColor` mask. Normalised in place, original preserved in `efc98e6`.

**Verified:** both masks have healthy alpha range · both serve 200 · listed slugs all have files · unlisted slugs fall back to the hash glyph · rendered in both themes.

---

**2026-08-25 — Icon batch + build script** · commits `15a1411`, `1092610`

Eight more icons wired (10 of 37). Icons arrived in batches during the session, so the manual loop was replaced with `scripts/build-icons.js`.

Three things worth remembering: filenames do **not** reliably give slugs (three exports were singular where the category is plural); the supplied SVGs' `stroke="currentColor"` renders as an empty mask in an isolated context; and a partial `.crdownload` download got swept into a commit — now gitignored.

**Verified:** all 10 registry entries have files · all 10 rasterise to a non-empty alpha mask · all serve 200 · rendered in both themes · `tools.js` passes `node --check`.

---

**2026-08-26 — 7 more icons + starfield restored** · commits `002d44c`, `7aaa7a3`

Icons now 17 of 37, all processed by `scripts/build-icons.js`; it fuzzy-matched four more singular exports to plural slugs without intervention.

Starfield restored behind the hero `h1`. Its glow was hardcoded white and would have been invisible in light mode — now `rgba(var(--fg-rgb), …)`.

**Verified:** all 17 registry entries resolve and rasterise to a non-empty mask · `stars.js` simulated against a DOM stub (100 orbits / 100 stars, both directions, theme-aware glow) · script ordering confirmed after the markup · pages serve 200.

---

**2026-08-26 — Icon coverage to 34 of 37** · commits `7234641`, `ca5823c`

Seventeen more icons. The script auto-matched twelve (including `ux toolsd` and `framer component`) and correctly **refused** five whose filenames map to nothing — those became explicit aliases.

**Verified:** all 34 registry entries resolve, rasterise to a non-empty alpha mask, and serve 200 · coverage diffed against the live sheet (37 categories, 34 covered, 0 registered that aren't real) · re-running the script reports 0 pending changes, so it is idempotent.

---

**2026-08-26 — First fold persistence, nav rework, sidebar CTA** · commit `c4ebe86`

Six changes. The reported "missing h1 / missing signup" was not a regression in `index.html` — the markup was intact there. Category pages are served by `404.html`, which never had the fold. Fixed by making all three shells carry it and deleting the toggling logic entirely.

**Verified:** all 5 JS files pass `node --check` · 3 stylesheets brace-balanced · every asset reference across every page resolves · 8 routes serve 200 including the new `/good-deals/` · h1 + form + sidebar CTA confirmed present on all three catalogue shells · hero confirmed nested inside `#dashboard-view` so it still hides on tool-detail · every `.ga-*` class used by the new page is defined.

---

**2026-09-01 — "List your tool" CTA uses the card arrow, right-aligned**

The sidebar CTA's `+` glyph is replaced by the same out-and-up arrow every resource card uses
(`M6.00005 19L19 5.99996…`), and the label is right-aligned (`justify-content: flex-end` +
`text-align: right`). The arrow gets the card's `translate(2px, -2px)` hover nudge.

It does **not** reuse the `.card-action-arrow` class — that class hardcodes `color: #f5f1ea`, which
would be invisible in light theme. The CTA's own `.dash-sidebar-cta-arrow` inherits `currentColor`
instead. Applied to all three catalogue shells (`index.html`, `404.html`, `tools/index.html`);
`dashboard.css` cache-buster bumped to `?v=20260901-1` on all three.

---

**2026-09-01 — Heading icons; two self-inflicted bugs found and fixed**

Karthik reported the flame missing from "Hot trends" and asked for an "All" mark beside "Categories".
Both headings now carry an icon, still with no markup change.

**Why the flame was invisible — my bug.** I had inserted that block by string-matching on
`.dash-sidebar-label {`, which also matches the **tail of**
`.dash-trends-section:not([hidden]) + .dash-sidebar-label {`. The insert landed mid-selector, so the
divider rule became `... + /* comment */ .dash-trends-section .dash-sidebar-label` — legal CSS that
matches nothing — which cost the heading its `display: flex`. The `::before` then became an inline
box, and **width/height are silently ignored on inline boxes**, so the mark vanished entirely. The
divider's own declarations were orphaned onto a bare `.dash-sidebar-label`, giving *both* headings a
top border. Brace-balance and `check-layout.js` both passed throughout. This is the grouped-selector
trap already on record for deletions — it applies to insertions too.

**A worse one found while fixing it.** `build-icons.js` kept its own copy of the tab list. Once
categories moved into their own tabs, it could no longer see `mcp-connectors` or `ai-creative-suites`,
and because it *rebuilds* `CATEGORY_ICONS` from what it matches, **the next `--write` would have
deleted both icons while reporting success**. Since the standing rule is to run that script after any
icon lands, this was live. It now parses `SHEET_TABS` out of `tools.js` — one source of truth.

**Verified:** region rebuilt and re-read in full · zero orphaned selectors · braces balanced ·
`check-layout.js` passes · `build-icons.js` reports "already in sync" (39 icons) with no unmatched
categories · both mask assets serve 200 · `all-categories.svg` rasterised and eyeballed ·
cache-buster `dashboard.css?v=20260901-6`.

**Not verified:** no browser here, so neither mark has been seen rendered.

---

**2026-09-01 — "AI voiceover" tab wired; a mis-categorised row found**

Fifth tab. Verified real against the fallback signature (`411392040` vs the fallback's `1045922795`).
Merged catalogue: **358 tools across 39 categories**.

**Found a data bug worth more than the tab itself.** Cross-checking each tab's name against the
`categories` column of the rows inside it — a check worth repeating as tabs multiply — showed
`MCP Connectors` and `AI creative suites` agree with their contents, but **`AI voiceover` does not**:
its single row, Wispr Flow, is tagged `AI Creative Suites`. So it lands there (4) and AI Voiceover
still shows only Lovo AI (1). **Category comes from the column, never the tab name**, so this is a
one-cell Sheet fix, not a code change. Deliberately not "fixed" in code — inferring category from the
tab name would have to override an explicitly filled column, which is worse than the bug.

**Verified:** five tabs, five distinct signatures, all headers valid (347 + 1 + 9 + 3 + 1 → 358) ·
`tools.js` parses · `check-layout.js` passes · `/` and both category routes serve 200 ·
cache-buster `tools.js?v=20260901-7`.

---

**2026-09-01 — "AI creative suites" tab wired**

Fourth tab added. Merged catalogue: **357 tools across 39 categories**; AI Creative Suites reads 3
(the tab gained a row mid-check — Karthik was editing as I read it).

**Confirmed the tab is real before trusting it**, using the fallback signature discovered earlier:
fetched a deliberately bogus sheet name to learn what "missing" looks like (`sig 1045922795`), then
checked the new tab against it — `sig 1305016979`, distinct, so a genuine tab and not gviz's silent
fallback. The same check re-confirmed `3D Tools` is still gone. **This is now the way to verify any
new tab name.**

**Verified:** all four tabs load with distinct signatures and valid headers (347 + 1 + 9 + 3 merging
to 357) · `tools.js` parses · `check-layout.js` passes · `/` and both category routes serve 200 ·
cache-buster `tools.js?v=20260901-6`.

---

**2026-09-01 — MCP Connectors tab wired; gviz's silent-fallback trap**

Added the `MCP Connectors` tab (9 tools). Merged catalogue is now **354 tools across 39 categories**,
MCP Connectors reading 9.

**The important find is not the tab, it is how gviz fails.** While wiring it up, `sheet=3D Tools`
started returning 2 rows instead of 7. It turns out the 3D Tools tab had been **deleted** — and gviz
does not say so. An unknown name, a typo, and a dead gid all return `status: ok` with **another
tab's rows**, byte-identical payloads, nothing naming the sheet. So the tab list I added last session
was one typo away from silently serving wrong data, with no error anywhere.

Defended using the `sig` field, a per-tab content signature: `loadAllTools()` drops any payload whose
signature it has already seen this cycle. Verified against a deliberately broken list containing a
deleted tab and a typo — **365 rows merged without the guard, 363 with it**, the bogus entries
contributing nothing rather than duplicating the fallback.

Removed the dead `3D Tools` entry; those rows are back in the main tab and the category still reads 8.

**Verified:** the full load path re-implemented and run against the live Sheet — three tabs, three
distinct signatures, all headers valid, 345 + 1 + 9 tools merging to 354 · guard demonstrated on/off ·
`tools.js` parses · `check-layout.js` passes · `/`, `/tools/` and both category routes serve 200 ·
cache-buster `tools.js?v=20260901-5`.

---

**2026-09-01 — Per-category Sheet tabs; "3D Tools" wired in**

`SHEET_GIDS` → `SHEET_TABS`, now accepting tab **names** as well as gids, with `3D Tools` added.
Adding the next category tab is one line.

**Verified against the live Sheet** by re-implementing the parser and running it over all three tabs:
gid 0 → 347 tools, gid 1218813985 → 1, `3D Tools` → 6; merged and deduped to **353 tools across 39
categories**, with 3D Tools reading 8. Tab-name lookup confirmed case-insensitive.

**Caught mid-flight:** gid 0 was observed at **10 rows with no header row** while Karthik was saving,
then recovered to 356. Harmless in itself, but it is exactly the state that made `buildTools()`
generate garbage keys and merge titleless junk — so `buildTools()` now requires a recognisable
header and skips the tab otherwise. One tab being edited can no longer corrupt the rest.

**Flagged, not fixed:** the 5s refresh fires one JSONP request per tab. Fine at 3 tabs, ~470 req/min
at 39. Recommended fix is round-robin (one tab per tick) — left alone because it changes polling
behaviour and was not asked for.

**Verified:** `tools.js` parses · `check-layout.js` passes · `/`, `/tools/` and
`/category/?category=3d-tools` serve 200 · cache-buster `tools.js?v=20260901-4`.

---

**2026-09-01 — The logo crop was the trim all along**

Karthik reported square logos rendering cropped. **The cause was `t-true`**, the trim added days
earlier to *fix* logo padding. Measured across 24 live icons: 23 sources are exact squares, and the
trim turned **11 of them non-square**, after which pad-and-upscale made them look cropped and put a
white band behind them. `10kdesigners` is the case to remember — 64×64 purple tile → trimmed to a
41×14 strip of its own white text → upscaled 3×.

Fix is one transform string: `t-true:w-128,h-128,cm-pad_resize` → `w-128,h-128,cm-pad_resize,bg-00000000`.
Squares now pass through untouched but for scaling; `bg-00000000` makes the pad transparent instead
of ImageKit's default white.

**Also this session:** `ai-creative-suites.svg` added and registered — its Noun Project credit `<text>`
had to be stripped first or the mask would have rendered it. Karthik replaced `mcp-connectors.svg`
with his own plug mark. The sheet grew to 361 rows / 39 categories, and MCP Connectors is up from
1 tool to 8.

**Verified:** old vs new transform compared side by side over the 24-icon sample, every source and
delivered size measured · both new icons rasterised and eyeballed · `build-icons.js --write` then
re-run reports "already in sync" (39 icons) · `tools.js` parses · `check-layout.js` passes ·
stylesheets balanced · all icon files and `/category/?category=ai-creative-suites` serve 200 ·
cache-buster `tools.js?v=20260901-3`.

**Not verified:** no browser here — the tiles have not been seen rendered.

---

**2026-09-01 — Flame mark on the "Hot trends" heading**

Wired in the icon Karthik dropped into `public/icons/`. Renamed to `hot-trends.webp` and applied as
a `currentColor` mask on the heading, CSS-only — scoping to `.dash-trends-section` meant **no HTML
changed in any of the three shells**.

**Checked before trusting it:** decoded the file's alpha channel by hand (no image library in this
project) — 300×300 RGBA, alpha spans a full 0–255, 62% transparent ground, 36% fully opaque artwork.
That is the test the icon rules require, and it passes, so it masks cleanly rather than rendering as
a grey block.

**Only one icon was actually added** — "Hot Trends.webp". The three per-trend rows keep their
category icons (`mcp-connectors`, `vibe-coding`) or the generic glyph (`ai-creative-suites`, which is
a search shortcut, not a category, so it has no icon to inherit).

**Verified:** `check-layout.js` passes · stylesheet brace-balanced · `/`, `/tools/` and both icon
files serve 200 · `build-icons.js` still reports "already in sync", confirming the webp sits outside
the category registry by design · cache-buster `dashboard.css?v=20260901-5`.

**Not verified:** no browser here, so the flame has not been seen rendered at 13px.

---

**2026-09-01 — Footer removed site-wide**

`footer.js` deleted; element, script and CSS gone from all 14 pages and from the blog generator.

**Two things went with it that were not obviously part of "the footer":** the only links to
`/terms/` and `/privacy/` anywhere on the site (there is no sitemap either), and the site-wide
affiliate disclosure, which mattered because catalogue links carry `?ref=designwallet`. Both are
logged as `PENDING` above — flagged before removing, removed as asked.

**The risky part was the CSS.** Three shared selector lists contained a footer selector; string-
matching them away would have silently broken five layout containers and four text styles — the
same class of bug already on record from `.dash-sidebar`. Removal was done by parsing rules and
dropping selectors from lists, then verified by normalising away comments and whitespace and diffing
rule-by-rule: **1330 → 1298 rules, 35 removed, 0 of them non-footer**, 3 rewritten with only the
footer selector dropped. Raw diff is 33 insertions / 290 deletions and near-identical under `-w`,
so there is no formatting churn hiding anything.

**Verified:** 12 routes serve 200 and `/footer.js` 404s · `check-layout.js` passes · stylesheets
brace-balanced · JS parses · `.page-shell` is a plain padded box, so nothing expected a footer child
and no layout hole is left · cache-busters `style.css?v=20260901-2`, `dashboard.css?v=20260901-4`,
`assetVersion` 20260901-2.

**Not verified:** no browser here — the bottom of the pages has not been seen rendered.

---

**2026-09-01 — MCP Connectors goes live**

Karthik added **Higgsfield MCP** (category `MCP Connectors`, free) to the Sheet. **No code change was
needed** — `DW_TRENDS` resolved it from search-fallback to a real category link on its own, and the
row appeared. All three trends now render: MCP Connectors (1), Vibe Coding Tools (7),
AI Creative Suites (2, still via search).

**What did need doing:** the new category was the only one of 38 with no icon, so it fell back to the
generic glyph beside 37 real ones. Added `public/icons/mcp-connectors.svg` and registered it.

**Verified:** live sheet re-fetched (354 rows, 38 categories) and the resolution simulated before
touching anything · icon rasterised and eyeballed at 96px · `tools.js` passes `node --check` ·
`check-layout.js` passes · `/`, `/category/?category=mcp-connectors` and the icon file all 200 ·
`build-icons.js` re-run reports "already in sync" · cache-buster `tools.js?v=20260901-2`.

**Watch out:** searching the raw sheet for `mcp` also hits *Bring Your Own Laptop* — the letters
appear inside its thumbnail URL. Harmless here, because `toolMatchesQuery` hashes only title,
subtitle, description, categories and price, **not** image URLs. Worth remembering before widening
that haystack.

---

**2026-09-01 — "Hot trends" sidebar section**

New block above the category nav on all three shells, fed by `DW_TRENDS` in `tools.js`.

**Delivered 2 of the 3 requested rows.** `Vibe Coding Tools` → the real `vibe-coding` category
(7 tools, own icon); `AI Creative Suites` → search `creative suite` (2 tools, Freepik AI and Krea AI).
`MCP Connectors` renders nothing because **the catalogue has no MCP tools at all** — verified by
searching title, subtitle, categories and price across all 352 sheet rows for `mcp`: zero hits. The
registry entry is in place, so the row appears by itself once such tools are tagged.

**Verified against live sheet data:** the resolution order was simulated over all 352 rows and 37
categories before writing the renderer — that is where the `vibe-coding` vs `vibe-coding-tools` slug
mismatch and the empty MCP result were both found. 7 JS files pass `node --check` · stylesheets
brace-balanced · `scripts/check-layout.js` passes · `/`, `/tools/`, `/category/`,
`/category/?category=vibe-coding` and `/category/?q=creative%20suite` all 200 on `dev-server.js`
(a plain static server 404s the `/category/*` routes — that is the GitHub Pages `404.html` fallback
working as designed, not a break) · cache-busters bumped to `tools.js?v=20260901-1`,
`dashboard.css?v=20260901-3`.

**Not verified:** no browser here, so the section has not been seen rendered.

---

**2026-09-01 — Search-bar focus ring**

The grey rectangle on the focused search bar was **not** a stray border — `.dash-search-input`
already had `border: none; outline: none; appearance: none`. It was the global
`a:focus-visible, button:focus-visible, input:focus-visible` ring in `style.css`
(`outline: 2px; outline-offset: 3px`). `input:focus-visible` is specificity **(0,1,1)** and outranks
`.dash-search-input`'s **(0,1,0)**, so the global rule won and drew a sharp-cornered rectangle inset
inside the rounded field. Killed with `.dash-search-input:focus-visible` — **(0,2,0)**.

**Gotcha on record:** `outline: none` on a plain class selector does **not** suppress that global
ring on any `<a>`, `<button>` or `<input>`. It needs a `:focus-visible` selector of its own.
`.hero-email-input:focus-visible { outline: none; }` in `style.css` is the same fix applied earlier.

**Accessibility kept:** focus is still visible — `.dash-search-field:focus-within` brightens the
container border from `--border` to `--border-strong`, and that rounded container is the shape that
actually reads as the search bar. The ring was not removed without a replacement.

---

**2026-09-01 — Sidebar footer, dark-only, logo tiles fill**

Three changes.

**Sidebar footer.** The CTA is now wrapped in `.dash-sidebar-foot` — a strip ruled off with a
`border-top` so it reads as its own section, carrying `© Design Wallet` on the left and the CTA on
the right. The rule sits inside the sidebar's 12px side padding so it lines up with the nav rows.
**Caught in passing:** side by side the two need ~235px, but `--sidebar-width` drops to **220px**
below 1024px and `.dash-sidebar` clips its overflow — the CTA would have run under the panel edge.
A `@media (max-width: 1023px)` rule wraps them onto two rows, CTA on top and still right-aligned.

**Light mode removed** — see §9 for what came out and how to bring it back. The token layer stays.

**Logo tiles.** CSS padding removed from both holders so the artwork reaches the tile edges. The
non-square minority letterboxes rather than crops — the aspect-ratio census and the reasoning are
in the logo section above.

**Verified:** 7 JS files pass `node --check` · 3 stylesheets brace-balanced · `scripts/check-layout.js`
passes · 11 routes serve 200 and `/theme.js` correctly 404s · zero surviving references to `theme.js`,
`DWTheme`, `data-theme` or `prefers-color-scheme` · cache-busters bumped to `?v=20260901-1` on
`style.css`, `header.js`, `stars.js` and `tools/dashboard.css` across all 12 pages.

**Not verified: no browser is available in this environment**, so none of the three changes has been
seen rendered. The 235px-vs-220px overflow above was caught by arithmetic on the CSS, not by looking
at it — the wrap breakpoint is the one thing most worth eyeballing.

---

- **`✅ DONE`** ~~The sidebar's "List your tool" CTA opens a drop-up of ways to contribute.~~ Karthik's call, 2026-09-15. It holds **List your tool** (`/list-your-tool/`), **Submit your portfolio** (`/submit-portfolio/`) and **Add your salary** (`/salary/submit/`), on all three catalogue shells (`index.html`, `404.html`, `tools/index.html`). It opens on hover or keyboard focus (`:focus-within`). The trigger still links to `/list-your-tool/`, so a tap on touch screens isn't a dead end. **`⚠️ GOTCHA` `.dash-sidebar` clips overflow**, so the menu opens **upward and right-aligned** (`bottom: calc(100% + 8px); right: 0`) to stay inside the sidebar; a drop-down, or a menu wider than the panel, would be cut off. A 10px `::after` bridge covers the 8px gap so it doesn't close mid-move. Styles are in `tools/dashboard.css` (`.dash-sidebar-menu`, `.dash-dropup`, `.dash-dropup-link`), with the cache-buster at `20260915-1`. Verified in headless Chrome on `/` and a category view: hidden at rest, open on hover, inside the sidebar, still open with the pointer over the last link, closed on leave, and "Add your salary" navigates. **Two of the three destinations aren't on `main` yet** (`/list-your-tool/` is held back; `/salary/` is branch-only), so this must ship in the same deploy or it links to 404s.

## 11. Glassmorphism CSS Generator

Built 2026-09-01 from Karthik's PRD (v1, "ready to build"). Second tool in `DW_TOOLS`, so the nav dropdown is no longer a list of one.

- **`✅ DONE`** ~~The Glassmorphism CSS Generator ships at `/dw-tools/glassmorphism-css-generator/`.~~ Nine live controls → live preview → copy as CSS, Tailwind or React. Stateless, client-side, no network calls.
- **`DECIDED` One settings object is the single source of truth.** The preview writes CSS custom properties and the three code strings come from pure formatters (`toCSS`, `toTailwind`, `toStyledComponents`) over the same object, so **what you see and what you copy cannot drift.** Adding a control is a row in the `SLIDERS` table plus the markup — nothing else.
- **`DECIDED` Per-tool CSS gets its own stylesheet**, `glass-generator.css`, not another ~690 lines bolted onto the 209 KB `style.css` that every page loads. Follows the `dashboard.css` precedent. **This differs from the colour converter**, whose CSS does live in `style.css` — worth normalising in the Astro pass, not before.
- **`✅ DONE`** ~~One fixed background, supplied by Karthik.~~ Requested 2026-09-01: *"use this background… dont use any other background use only this background."* The four generated grounds and the whole background picker are gone — markup, CSS and JS. §5.2's switchable presets are **superseded**; the preview has one ground and no chooser.
- **`DECIDED` The background is served as an optimised WebP derivative, not the source JPEG.** `public/images/glassmorphism_background.jpg` is **5120×2880 / 899 KB** for a frame that never renders wider than ~800 CSS px. `glassmorphism-background.webp` is 1600×900 / **16 KB — 55× smaller, RMSE 0.55%** (imperceptible; the image is a smooth gradient, which is why it compresses so hard). The original stays in the repo untouched, exactly as §7 requires.
- **⚠️ Gotcha worth knowing — swapping the JPEG will not change the page.** The page references the `.webp` derivative. Replacing the source image means re-running the convert step, or the preview keeps the old ground with no error anywhere.
- **Known trade-off, accepted:** the supplied ground is a **smooth, low-frequency gradient**, so blur reads far more subtly on it than on high-frequency detail — there is little fine texture for `blur()` to destroy. Saturation and tint still read clearly against the amber. This is the cost of one fixed background and it was an explicit instruction, not an oversight.
- **`✅ DONE`** ~~Border width is a 0.01px slider.~~ Was 0–4 in whole pixels; now 0–4 in hundredths, with a 2-decimal readout. Sub-pixel borders reach the generated code intact (`border: 1.47px solid …`, `border-[1.47px]`).
- **`✅ DONE`** ~~"Drop shadow" is a real `filter: drop-shadow()`, not another box-shadow.~~ **Karthik's call from three options on 2026-09-01**, over splitting Depth into offset+blur or adding a spread value. It follows the card's alpha shape rather than its border box, which is the only reason to carry it alongside Depth. One 0.01px slider drives the blur; the Y offset tracks it at **0.34×**, so a single control still reads like a shadow.
- **`DECIDED` Drop shadow defaults to 0, so the tool's default output is unchanged.** At the defaults the CSS tab still reproduces the PRD's §5.3 sample; the filter line only appears once you dial it in, and disappears again at 0 rather than emitting an inert `drop-shadow(0 0px 0px …)`.
- **Note:** `filter` and `backdrop-filter` on the **same** element is safe — a `filter` creates a backdrop root for its *descendants*, not for itself, so the card's own `backdrop-filter` still samples the page behind it. Putting a `filter` on an **ancestor** would break it.
- **`✅ DONE`** ~~Every control can be locked against Randomize.~~ Requested 2026-09-01, so a user can pin what already looks right and keep rolling the rest. A padlock sits on each row; locked rows keep their value when Randomize fires.
- **`DECIDED` A lock pins against Randomize only — it never disables the control.** You can still drag a locked slider by hand. That is why the locked row is drawn *brighter* (filled padlock, white readout) rather than dimmed: greying it out would read as "disabled", which is the opposite of what it means.
- **`DECIDED` Locks cover the tint picker and the glow switch too, not just the sliders.** The ask said "all the sliders", but Randomize also rerolls tint and glow — leaving those two out would mean a user who locked all nine sliders still had the colour and the glow jump on every click, which defeats the stated purpose. **11 locks, one per randomizable control.** A build-time check asserts the two sets match exactly, so a future control cannot be added without one.
- **`DECIDED` Reset releases every lock as well as restoring defaults.** It is the start-over button; leaving locks engaged after a reset is the more surprising of the two options.
- **`✅ DONE`** ~~The h1 sits on one line.~~ It was wrapping to two. Now `white-space: nowrap` with `font-size: clamp(1.35rem, 5.2vw, 3.6rem)`, and the `max-width: 720px` on `.glass-hero-copy` — which was what forced the wrap — is gone.
- **Gotcha on record — `min-width: 0` on a flex item holding a `nowrap` heading clips it.** The first fix for the wrap set `min-width: 0` to drop the 720px cap. Flex items default to `min-width: auto`, which refuses to shrink below min-content and makes the *sibling* wrap instead; setting it to 0 licenses the browser to shrink the copy column and slice the heading. Use `flex: 1 1 auto` and let the pills wrap.
- **Title fit was measured, not eyeballed:** 14.06 em raw advance, 12.63 em after the -0.055em tracking, checked at nine viewport widths from 360px to 1920px against the real padding box. Worst case is 360px — 273px of text in 320px of room. Measured with Helvetica metrics, which over-estimate, since Geist Light is narrower.
- **`DECIDED` Tailwind's glow limitation is fold-and-comment**, as the PRD settled. Everything expressible folds into one arbitrary `shadow-[…]`; the `::before`/`::after` edges cannot be utilities, so the snippet carries `<!-- Note: … see CSS tab for full effect -->`.
- **`DECIDED` No persistence in v1.** Generate-and-copy only. Saving glass presets to the wallet is the PRD's own headline v2 candidate and stays parked.
- **Deviation from the PRD's sample CSS, deliberate:** the generated rule adds `position: relative` when Glow is on. §5.3's sample omits it, but `::before`/`::after` are absolutely positioned — without it the highlights escape to the nearest positioned ancestor. The sample's `background` / `backdrop-filter` / `box-shadow` lines are reproduced **byte-for-byte** at the defaults.
- **Added beyond the PRD:** a `Reset` button next to `Randomize`. Randomize with no way back to the defaults is a trap. It is not an "apply" action, so §6's "everything is real-time" still holds.
- **Gotcha on record — a `requestAnimationFrame` guard must latch before it schedules.** The coalescing flag was written as `frameRequest = rAF(cb)` with `cb` clearing it. Under async rAF that is fine; the moment a frame runs synchronously the callback clears the flag *first* and the handle is assigned *after*, so `frameRequest` stays truthy and **every subsequent render returns early — the tool freezes silently, with no error.** Caught by the DOM smoke test, not by reading it. Set the flag, then schedule.
- **Note:** `-webkit-mask-composite: xor` / `mask-composite: exclude` are both required for the edge highlight — the standard property alone does not cover Safari, and the prefixed one uses a different keyword for the same operation.

## 12. Salary Dashboard (`/salary/`)

Scoped 2026-09-05, **v1 built the same day** (see the implementation log). **Full spec lives in `.claude/SALARY-PROJECT.md`** — this section is the pointer and the decision record; the spec carries the data model, the role/level/location/work-mode taxonomy, the full chart inventory and the build order.

- **`DECIDED` A designer salary dashboard is the site's second content pillar.** Free, no sign-up, at `/salary/`. The intent is different from the tool catalogue's ("what does my role pay?" vs "find me a tool") and it is the only surface on the site that earns recurring search traffic on its own.
- **`DECIDED` It launches seeded with researched benchmark figures**, progressively replaced by real community submissions.
- **`DECIDED` No per-cell provenance labels.** Karthik's call, 2026-09-05: no "benchmark estimate" badges, no muted styling for seeded cells, no caveat under each figure. Every number renders identically and confidently — a dashboard hedging on every tile is unusable. The seed is researched market data, not invented, so presenting it plainly is normal practice. Cells still carry `source` in the JSON for debugging; it is simply never surfaced.
- **`DECIDED` One methodology sentence stays, in the collapsed `<details>` at the bottom.** Not a per-cell label — one line saying figures combine market research with community submissions. Every credible comparison site publishes methodology and reads as *more* rigorous for it; the downside case is a "Design Wallet made up salary data" thread landing on Karthik personally, since the site carries his name. Cheap insurance, invisible to anyone just checking their salary.
- **`DECIDED` No fabricated submission counts.** The page never prints "based on N designer reports" where N is zero. A specific invented statistic is trivially disprovable in a way a published median is not. Counts appear once real submissions exist; until then no count is shown — which costs nothing visually, since there is no caveat or empty state either.
- **`DECIDED` No "Download the data" link, now or later.** Karthik's call, 2026-09-05 — supersedes the earlier `PENDING` on whether to embrace a public dataset if the repo is open sourced. The answer is no. *(If §1's open-sourcing happens, `salaries.json` is still committed and therefore technically readable; this decision means the site never promotes a download, not that the file is secret.)*
- **`DECIDED` India only in v1.** 13 cities grouped Tier 1 / Tier 2.
- **`DECIDED` The metric is annual fixed CTC in ₹ LPA.** Variable pay and ESOPs are collected but reported separately, never blended into the headline.
- **`DECIDED` Build-time data, not runtime.** Google Sheet → `scripts/build-salary.js` → committed `salary/data/salaries.json`. The page never calls Sheets. This does **not** contradict §3's runtime-listings requirement, which is about the tool catalogue: salary rows are moderated, so a runtime fetch would expose unapproved submissions.
- **`DECIDED` The build asserts the Sheet header row and aborts if it doesn't match.** Direct defence against the §8c gviz gotcha — never write a `salaries.json` from an unverified response.
- **`DECIDED` Submissions are moderated.** Honeypot + client validation; rows land as `Pending` and only rows marked `Approved` enter the build. Needs its **own spreadsheet and its own Apps Script deployment** — do not append to the portfolio sheet.
- **`DECIDED` Nothing identifying is collected.** No name, email, phone, company name, **and no free-text field of any kind** — every input is a `<select>` or a bounded number. Free text is the one thing that would let someone deanonymise themselves.
- **`DECIDED` Cells with fewer than 5 reports are suppressed** and roll up to Tier, then national, then benchmark. Protects both anonymity and credibility.
- **`DECIDED` Creative Director and Design Director are levels, not roles.** Treating them as roles creates cells like "Junior Creative Director" and roughly doubles the matrix.
- **`DECIDED` Work mode is a first-class axis, separate from location.** Karthik's call, 2026-09-05. **This fixed a double-count in the first draft**, where "Remote" was one of the *cities* — so a designer living in Jaipur working remotely for a Bangalore company landed in two buckets and inflated both. Three independent axes now: **location** (where they live), **work mode** (onsite / hybrid / remote), **employer** (India / foreign, only meaningful when remote). Filters for all three.
- **`DECIDED` Remote-for-a-foreign-employer never merges into a city or national average.** That cohort is on a ~2.2× curve; blending it in would silently inflate every figure on the page. Always its own comparison.
- **`DECIDED` Filters compose, but charts aggregate at deliberately different grains.** Role × level × city × work mode × company type is 3,432+ combinations and would put nearly every cell under the suppression threshold. So work mode and company type are shown as **national breakdowns for the selected role × level**, never sliced by city as well. Six grains, precomputed in the build. **Do not "improve" this by crossing all axes — the page would show almost nothing.**
- **`DECIDED` The dashboard is chart-dense.** Karthik's call, 2026-09-05 — a full analytical surface, not one filter and one number. Eighteen sections: KPI row, hero figure, distribution histogram, city comparison, experience ladder, role comparison, role × level heatmap, work-mode and company-type breakdowns, variable/ESOP tiles, a top-10 leaderboard, and a table view.
- **`DECIDED` Charts are monochrome — sequential white-opacity ramp plus emphasis, no categorical hue palette.** Every chart here does the same job (compare magnitude, low→high), which takes a sequential encoding, not identity colours. Keeps the site's black-and-white identity intact; a rainbow salary dashboard would look like a different product. Selection is shown by **emphasis** — the selected bar at full white, the rest receding to `--sal-ramp-2`. Multi-series cases use **small multiples**, never generated hues.
- **`DECIDED` The ramp is validated, not eyeballed.** Five `--sal-ramp-*` tokens (alpha 0.25→1.00 over `--panel`, resolving `#4d4d4d` → `#ffffff`). `node scripts/validate_palette.js` in dark ordinal mode against surface `#121212` returns ALL PASS — monotone lightness, adjacent ΔL ≥ 0.06, light-end contrast 2.22:1 against the 2:1 ordinal floor. **Re-run it if the ramp is ever retuned.**
- **`DECIDED` No charting library.** Bars, a step line, a histogram and a grid, hand-built in CSS and inline SVG. Chart primitives live in `salary/charts.js`, split from `salary.js` — eight chart forms plus a filter state machine in one file is how `script.js` got to 70 KB.
- **`DECIDED` Hover tooltips on every mark.** Per-mark on bars, dots and heatmap cells; crosshair on the ladder. Plus a table view toggle carrying every figure on the page — accessibility requirement, not optional.
- **`DECIDED` Geist Mono is justified on this page** for tabular figures in the heatmap, leaderboard and table view, where digits must align. Same reasoning that earned the colour converter its §10 exception.
- **`DECIDED` "Open source" is not the framing for this page.** Karthik's call is free-to-view with no bulk download, so neither the code nor the data is open. Public copy says **"Free. Community-powered. No sign-up."** — *not* "open source", which is a claim people check.
- **`DECIDED` `sitemap.xml` and `robots.txt` get built as part of this, site-wide.** Neither exists today. §8b already flags `/terms/` and `/privacy/` as unlinked and unindexed with no sitemap to catch them; a page that lives on search traffic makes it worth fixing for the whole site, not just `/salary/`.
- **`✅ DONE`** ~~The dashboard exports a five-page PDF report.~~ Karthik's call, 2026-09-13: an **Export PDF** button beside the Charts/Table toggle that downloads whatever the visitor is currently looking at. The five pages are the cover and headline figure, where the number sits (middle 50% + distribution), what the city changes, how pay grows with experience, and arrangement / company type / methodology. **Asked for as PPT slides first, changed to PDF the same day.**
- **`DECIDED` The PDF is hand-written — no library.** `salary/pdf-writer.js` emits PDF 1.4 (pages, rectangles, lines, polylines, Béziers and Helvetica text) and `salary/report.js` composes the five pages from it. Same reasoning as `charts.js`: the alternative was a **460 KB** dependency (PptxGenJS, which is also not on cdnjs) for five pages of rectangles. No build step and no network call.
- **`DECIDED` `report.js` does no data work.** `salary.js` builds the model through the very functions the screen renders from — `headline()`, `national()`, `cityCell()`, `breakdown()` — so a figure in the download can never disagree with the figure on the page. `report.js` is presentation only.
- **`✅ DONE`** ~~The report is Design Wallet black.~~ Karthik's call, 2026-09-13, replacing the light first draft (see *Superseded*). Ground `#0a0a0a`, text `#f5f5f5`, panels `#141414`, selected bar at full white — the site's own tokens. **`--muted` (#686868) is deliberately not carried across**: it is already below AA on screen, so the document's body and caption greys are lifted. Charts stay monochrome as §12 requires: magnitude by bar length, selection by emphasis, never by hue.
- **`✅ DONE`** ~~The standard 14 PDF fonts have no ₹ glyph, so figures read "INR 24 LPA".~~ Fixed 2026-09-13 by embedding Geist. `DWReport.money()` emits "₹24 LPA", the same string `DWCharts.lpa()` puts on screen, and **`pdf-writer.js` degrades "₹" to "INR" on its own** if the font files fail to load, so the fallback stays readable.
- **`✅ DONE`** ~~The report is set in Inter, the site's body typeface.~~ Karthik's call, 2026-09-13 — *"everything should be inter font"*, replacing the Geist pass of the same afternoon (see *Superseded*). A PDF cannot reference a web font, so the outlines are embedded: `salary/fonts/inter-regular.ttf` and `inter-light.ttf`, **36 KB subsets** (196 glyphs each), fetched on the first export rather than at page load and reused for the session.
- **`DECIDED` Two faces, named for their role: `text` and `display`.** The second face is Inter **Light**, not a bold — Karthik's call: the title is not bold and the big figures are light. So `pdf-writer.js` selects a face by `display: true`, never by "bold", because the slot no longer means heavier.
- **`DECIDED` Nothing in the report is bold, so emphasis is carried by colour.** A selected bar, row or marker goes full white while the rest recede — exactly the rule the on-screen charts use (§12), now doing double duty as the only available emphasis.
- **`DECIDED` Body copy is 11pt, up from 9.5pt.** Karthik's call — *"the paragraph fonts should be little more bigger"*. The whole scale lives in one `TYPE` table in `report.js` so it moves together, and the page rhythm was re-spaced to keep the larger text clear of the footer rule.
- **`DECIDED` The font files and `inter-metrics.js` are one artefact, regenerated together.** The metrics file carries advance widths and descriptor values so the browser never parses a TTF. Re-cut the fonts without rebuilding the metrics and text is measured against widths that no longer match the embedded outlines — wrapping and alignment drift **with no error anywhere**. Source URL and commands are in `salary/fonts/README.md`.
- **`⚠️ GOTCHA` Do not fetch a font from `fonts.googleapis.com` to embed.** Requesting it with an old user agent — the usual trick for getting TTF instead of WOFF2 — returns **EOT**, which fontTools rejects with "bad sfntVersion". Hit while doing this with Geist; it applies to any face. The subsets come from `google/fonts`' variable `Inter[opsz,wght].ttf`, instanced at **wght 400 / opsz 14** for text and **wght 300 / opsz 28** for display — Inter has an optical-size axis, so the display face takes the large-size cut as well as the lighter weight.
- **`DECIDED` The rupee sign lives in CP1252 slot `0x80`** (normally the euro) via `/Encoding /Differences [128 /uni20B9]`, because a single-byte encoding has nowhere else to put it. **The report can therefore never print a euro.**
- **Licence on record:** Inter is SIL OFL 1.1, which permits embedding in a document; `salary/fonts/OFL.txt` ships beside the files (Inter's own copy, swapped in when Geist came out). This is the first third-party asset in the repo carrying its own licence — relevant to §8.
- **`✅ DONE`** ~~The Design Wallet logo sits at the top left of every page.~~ Karthik's call, 2026-09-13. Drawn as **vector paths, not an image**: the mark is two SVG paths of lines and cubics, which map straight onto PDF's `m` / `l` / `c` operators, so it stays crisp at any zoom and needs no image XObject, alpha channel or compression.
- **`DECIDED` The logo is read from `public/Logo/Website-logo.svg` at export time** — the same file the site renders, so there is no second copy of the artwork to keep in step. It is fetched alongside the fonts on the first export; a failure falls back to "DESIGN WALLET" set in type.
- **`⚠️ GOTCHA — the one to remember` SVG's default fill-rule is nonzero. PDF's `f*` is even-odd.** Filling the wordmark with `f*` **slashed a bar through both "e"s and broke the "t" crossbar**: even-odd punches a hole wherever two subpaths overlap in the *same* direction, while this artwork relies on nonzero to drop its counters out. Use `f`. **Every automated check passed while it was broken** — two header shapes, correct bounding boxes, no overflow, fallback text absent. It was visible only in a 600 dpi crop.
- **`DECIDED` The path converter handles `M L H V C Z` only**, absolute and relative, including implicit repeats. Arcs and quadratics are deliberately **not** supported: this mark has neither, and a half-implemented arc would fail silently. A future logo carrying one must be converted to cubics before it reaches the PDF.
- **Known cost, accepted:** the logo's path data is emitted on all five pages, taking the file from 100 KB to 149 KB. Drawing it once as a Form XObject and referencing it per page would claw back ~40 KB. Not done — 149 KB is unremarkable for a five-page report with two embedded faces.
- **`⚠️ GOTCHA` `Tc` (character spacing) is text STATE and survives `BT`/`ET`.** Emitting it only for the tracked small-caps labels leaked that tracking into every later line on the page, so text rendered wider than the metrics predicted and overshot its wrap width — body copy crossed the right margin on three of the five pages. It is now written on every text object and counted in `widthOf()`. **Caught by rendering the PDF to images, not by any parse check.**
- **`⚠️ GOTCHA` Info-dictionary strings are not read with the font's encoding.** WinAnsi bytes there turned the title's em dash into "Š" in readers. Metadata is now UTF-16BE with a byte order mark, which also lets it carry the ₹ the page text cannot.
- **`DECIDED` The filename carries the filters** (`design-wallet-salary-product-designer-senior-pune-agency.pdf`). With role and level alone, exporting a second, differently filtered report silently overwrote the first in the downloads folder — seen in testing.
- **`DECIDED` A completed export is reported to GA4 as `salary_report_download`**, with role and level.
- **`✅ DONE`** ~~The topbar carries a caption under the actions.~~ Karthik's call, 2026-09-13, right-aligned and small. It reads **"Charts update instantly with your filters."** The requested wording was *"all the data are real-time"* — **that is not true of this page.** §12 records build-time data from a committed `salaries.json` (last built 2026-09-05) that is moderated before it lands, so nothing here is live. The half that *is* true is that every chart redraws from the visitor's inputs, which is what the line says. Flagged rather than shipped as asked, because this page is quoted in salary negotiations and a checkable false claim is exactly the §12 credibility risk.
- **`✅ DONE`** ~~With **Foreign employer** selected, the City filter becomes a **Country** filter.~~ Karthik's call, 2026-09-13: *"when foreign employer is selected the city filter should not be from India"*. Indian cities and a foreign employer describe different markets, so the list swaps to eight markets: United States, Australia, United Kingdom, Netherlands, Singapore, Germany, UAE and Canada. Karthik asked for "Toronto", which is filed under Canada. Its "all" option reads **"From India (remote)"** and keeps the old 2.2× foreign-employer figure. Picking a country shows that market's own pay, and **the 2.2× premium is not applied on top**. `state.country` is separate from `state.city`, and `normalizeLocation()` keeps them from contradicting the employer. The URL carries `country=`. Title, summary, top-location KPI, the "By country" chart, ladder, disciplines, heatmap and table all read the country. Work mode and company type are India's national ratios scaled into the country, and the page says so.
- **`✅ DONE`** ~~The Employer filter is available for every work mode.~~ Karthik's call, 2026-09-13. It used to be disabled, and reset to "Any employer", unless Work mode was Remote or Any. The reasoning was that an on-site or hybrid job in India is on Indian payroll even at a foreign company's office. That stopped holding once the Country filter existed: on-site or hybrid abroad is how most relocated designers work. The `.sal-field.is-disabled` style and `#sal-employer-field` hook are gone. **Also Karthik's call:** "From India (remote)" stays in the Country list for every mode, and nothing defaults to the United States. **Known consequence:** On-site or Hybrid + Foreign employer + "From India (remote)" still applies the 2.2× remote premium on top of the on-site/hybrid ratio. That's a group the data doesn't really describe. It was accepted, not overlooked.
- **`DECIDED` Country figures are seed estimates, and the page says so.** They live in `benchmarks.json` under `international`: US product-designer **base salary** by level in USD, × a country index (US 1.00 … Canada 0.56), × a role index (graphic 0.62 … design systems 1.05). The build converts them to INR lakh (`country_cells`) so the page keeps one unit. No community data feeds them, because the submission form only collects Indian cities. The methodology card has a paragraph saying so, and a country selection relabels "fixed CTC" as "base salary". Spot checks: US lead $182K, Germany senior $91.6K. **Re-check these against Levels.fyi and Glassdoor before launch.** They came from a single research pass, and this page gets quoted in negotiations.
- **`✅ DONE`** ~~An **INR/USD** switch sits beside the hero figure.~~ Karthik's call, 2026-09-13. It is global: every figure on the page, and the PDF, follows it. It goes through `DWCharts.setCurrency()`, so **`DWCharts.lpa()` stays the one formatter** (USD prints `$182K`, `$39.7K`, `$1.2M`). `report.js`'s `money()` now delegates to it. The heatmap prints `DWCharts.compact()`, and its unit line switches between "in ₹ lakh" and "in US$ thousands". The rate is a fixed **₹95.6 = $1, as of 2026-09-12**, stored in `benchmarks.json` → `fx` and shown in the methodology card. **Update it when rebuilding the data.** A stale rate misstates every USD figure. The URL carries `currency=usd`, and the PDF filename gets `-usd`.
- **`✅ DONE`** ~~Charts animate between filter states.~~ Karthik's call, 2026-09-13: *"a smooth animation of the data visualization graphs"*. Charts still rebuild their DOM on every render, so charts.js adds a small **`Morph`** helper. Each chart remembers the geometry it drew, keyed by mark (city id, level id, bin index, heatmap cell). New marks start at that old geometry, a layout read commits it, and the CSS transitions carry them to the new values. What moves: range band and median marker, bar widths, bar rows re-sorting (FLIP slide), histogram heights and the middle-50% shade, the experience line (rAF path morph) and its markers, heatmap shades, meters. The hero figure and the KPI numbers count between values (`DWCharts.countTo`). Timing is **520ms ease-out**: `--sal-motion` / `--sal-ease` in salary.css, `DURATION` in charts.js, kept equal. The first load animates in, so the dashboard is un-hidden *before* the first render. **`prefers-reduced-motion` gets instant updates** in both the CSS and the JS. Verified in headless Chrome: 120ms into Mid→Director the hero read ₹45.4 LPA (13 → 68) with bars and bins mid-way, and reduced motion settled within 30ms.
- **`⚠️ GOTCHA` Keep keys stable when touching a chart.** Motion is matched by key, not by DOM position. A bar row without `data-key`, or a key that changes between renders, silently falls back to growing from zero.
- **`✅ DONE`** ~~USD figures read "$158K/year"; INR is unchanged ("₹151 LPA").~~ Karthik's call, 2026-09-15. "LPA" already means per annum, while a bare dollar figure didn't say it was yearly. The suffix lives in `DWCharts.lpa()`, so every USD figure gets it: hero, KPIs, range and histogram scales, bars, tooltips, notes and the PDF. The heatmap keeps bare numbers under its "in US$ thousands" unit line. **Bar value columns widen only in USD** (74→96px desktop, 62→84px under the breakpoint), via a `sal-currency-usd` class that salary.js puts on `<body>`. **`⚠️ GOTCHA` Keep that column a fixed width.** A `max-content` column let each row's track end at a different x (527 vs 524px), which quietly skews a bar comparison.
- **`⚠️ GOTCHA` The histogram shape is built around India's national median.** Any filtered figure has to slide it (`shiftedShape()`), or the middle-50% highlight lands off the scale. Before this fix, Foreign employer highlighted the far-right bars against a ₹12–63 LPA axis. The screen and the PDF share the function.
- **`PENDING` The PDF's prose still says "city"** on page 3 ("What the city changes", "city by city", "above the national figure") when a foreign employer lists countries. The figures, units and the list itself are correct. Only that copy is left.
- **`DECIDED` Salary submissions go live without approval, and the dashboard reads them at runtime.** Karthik's call, 2026-09-15: *"No approval needed from me"* and *"whenever an input is added … the dashboard should be updated automatically."* **This replaces two §12 rules:** "build-time data, not runtime" and rows landing as "Pending". How it works:
  - **Storage:** the **"Salary submissions"** tab of a separate private spreadsheet (see below; first planned in the database, moved the same day). `salary/submit/google-apps-script.js` `doPost` validates every select against the taxonomy ids, the CTC (0.5–200) and years (0–45), applies a 20-posts-a-minute flood guard, and writes the row as **Approved**. **Setting Status to Rejected is the only moderation.** It removes the row from the dashboard within a minute.
  - **Serving:** the same script's `doGet` returns **percentiles only**, per role/level at national, tier, city, work-mode, employer and company grain, and only for groups with **≥ 5 reports**. It applies the build's 24-month window and 1.5×IQR trim, and caches for 60s, busted on every new post. **Raw rows never reach the site.**
  - **Dashboard:** `salary.js` fetches that on load and **every 60s while the tab is visible**. It lays community cells over a pristine copy of the seed, using build-salary.js's cascade (city → tier → research). Research cells still in place are rescaled by the community-vs-research national ratio so they don't contradict it. Highest city and the leaderboard are recomputed, and the page redraws (animated) only when the figures actually changed. Any failure leaves the research figures up.
  - **One URL:** `salary/endpoint.js` → `DW_SALARY_ENDPOINT`, read by both the form and the dashboard. **Empty until Karthik deploys the script.** Until then the form says submissions aren't open and the dashboard shows research figures only.
  - **Verified:** the Apps Script run under Node against a fake sheet (6 posts → Approved rows; bad role and out-of-range CTC refused; `doGet` returns [24.3, 25.5, 26.8, 6]; one row Rejected → n 5, re-summarised; no raw fields in the output). The dashboard in headless Chrome against a mocked endpoint: seed ₹24 → community ₹25.5 on load, Bangalore rescaled 28.3 → 30.1, and a changed figure (₹31) redrew on the next poll without a reload.
- **`✅ DONE`** ~~Salary submissions live in their own **private** spreadsheet, not the public database.~~ Karthik's call, 2026-09-15, after the privacy issue was raised. The database is readable by anyone through gviz, so a tab there would have exposed every row. The Apps Script is now **bound to that private sheet** (`SPREADSHEET_ID = ""` → `getActiveSpreadsheet()`) and the sheet stays "Restricted". The web app's "Anyone" access lets visitors call `doPost`/`doGet`; it does not share the sheet. **Never set `SPREADSHEET_ID` to the database.** *(Original concern, kept for the reasoning:* **The database spreadsheet is publicly readable, so the raw salary rows are too.** The catalogue reads it through gviz with no login, and gviz serves any tab by name. So **anyone with the sheet ID** (it's in the public `script.js`) can read every submission row: role, level, city, company type and size, CTC, gender. That defeats the suppression threshold, which exists "so nobody can be identified from a thinly populated cell". **Recommended fix: a separate, private spreadsheet** for submissions, changing only `SPREADSHEET_ID` in the Apps Script. The dashboard never reads the sheet directly, so nothing else changes. Raised with Karthik 2026-09-15; awaiting his call.)
- **`DECIDED` The private sheet is the subscriber-responses spreadsheet (`1aKs9…`), tab "Salary Submission" (singular).** Karthik's call, 2026-09-15. It's restricted and shared with no one, and it's where he maintains form responses. That spreadsheet already takes **newsletter** sign-ups (their own Apps Script web app) and **portfolio** submissions (`submit-portfolio/google-apps-script.js` targets it by ID). So the salary script is a **standalone Apps Script project that opens the sheet by `SPREADSHEET_ID`**, not a project bound to the sheet. **`⚠️ GOTCHA` Pasting it into the sheet's Extensions → Apps Script project would replace the newsletter's `doPost`** and silently break sign-ups site-wide. `SHEET_NAME` must match the tab exactly: gviz ignores case, `getSheetByName` does not.
- **`✅ DONE`** ~~The salary web app is deployed and wired in.~~ 2026-09-15. It's a standalone Apps Script project **"Design Wallet – Salary"** in Karthik's account, deployment "Salary v1", execute as Karthik, access Anyone. The `/exec` URL is in `salary/endpoint.js`. **Verified live:** `doGet` returned the empty summary; one test POST moved `submission_count` 0 → 1; a POST with an unknown role was refused (count stayed 1). In headless Chrome `/salary/` fetched the endpoint cross-origin (200 via script.googleusercontent.com) and applied it with no errors, and `/salary/submit/` sees the endpoint. ~~Delete the test row~~ Done by Karthik, 2026-09-15. **`PENDING` Not on production** until `remove-paywall` deploys; until then real visitors can't reach the form.
- **`✅ DONE`** ~~Every field on `/salary/submit/` is required; the four personal ones accept NIL.~~ Karthik's call, 2026-09-15: *"all the fields should be mandatory … if they don't want to fill any of the field ask them to put NIL."* **Company size, ESOPs and gender** gained a "NIL — prefer not to say" option (value `NIL`). **Variable or bonus** became a text input taking a number (0–200) or NIL in any case, stored as `NIL`, with the hint "Type 0 if you don't get one, or NIL to skip". **The fields that form the figure do not take NIL:** role, level, years, city, work mode, employer, company type, fixed CTC and salary year. A submission without them can't be counted. **"Employer is based" is now always shown and required.** It used to appear only for Remote, defaulting to India, which no longer matches the dashboard (§12, Employer available for every work mode). The Apps Script enforces all of this (`COMPANY_SIZES`, `ESOP_ANSWERS`, `GENDERS`, variable number-or-NIL, year 2000–now), so a hand-crafted POST can't skip fields either. Stale copy removed too: "Submissions are reviewed before they appear" and "queued for review" were false once approval went. **Needs a new Apps Script deployment version to take effect server-side.** Verified: the empty form flags all 13 fields; a NIL submission posts `companySize=NIL…variableOrBonusLpa=NIL…gender=NIL`; the Node test refuses a missing gender and a non-numeric variable.
- **`PENDING` The live web app is still on the pre-NIL script version.** Checked 2026-09-15 after Karthik redeployed: a POST with no gender was still accepted. Karthik chose to leave it ("ignore it, let's get it going"; submissions are reaching the sheet). **Effect:** the website form enforces required fields and NIL, but the server doesn't, so a hand-crafted POST could skip company size, variable, ESOPs or gender. Role, city, CTC and the rest were already validated server-side. **Fix whenever:** paste the current `google-apps-script.js` into the project, save, then Manage deployments → Salary v1 → Edit → New version. The test rows it left were deleted by Karthik the same day.
- **`⚠️ GOTCHA` The option ids are duplicated in the Apps Script** (`ROLES`, `LEVELS`, `CITY_TIERS`, …). A new role, city or company type added to `benchmarks.json` and not there gets **refused at submit**. Checked equal on 2026-09-15.
- **Out of scope for v1:** ~~international salaries~~ (partly brought in 2026-09-13, see the Country filter above) · freelance day rates · the pay-gap view (needs volume; `Gender` is collected as optional and never shown below n ≥ 50) · per-role SEO landing pages like `/salary/motion-designer/` — a v2 once the data is real, since 11 pages of benchmark estimates would be thin content today.

## 13. List Your Tool — Book a Call (`/list-your-tool/`)

- **`✅ DONE`** ~~"List your tool" leads to a book-a-call page, not a pricing page.~~ Karthik's call, 2026-09-11: *"it shouldn't show the pricing page. It should show a book a call page."* The pricing cards, the Compare Plans table and the FAQ are gone. The page is now a starfield hero, a three-step "What we'll cover" card, and Calendly's inline embed. **Built on `remove-paywall`; still held off `main`** (§1).
- **`DECIDED` This does not reverse §1's business model.** Listings are still paid. The call is where a listing gets agreed and priced, instead of a price card.
- **`DECIDED` The FAQ went with the prices, deliberately.** It promised things nobody is currently offering: full refunds within 7 business days, UPI/card payments, 24h/12h review times, a free plan and bundle pricing. None of that stays on the page.
- **`DECIDED` The embed uses Karthik's existing event** `calendly.com/karthikskrishnan/design-mentorship-call` (30 min, Google Meet, no payment step), not a separate listing event type. Inside the widget it is titled **"1:1 Call with KK"**. The slug says "mentorship", but visitors never see the slug.
- **`DECIDED` Bookings from this page are pre-tagged "Design Wallet Enquiries".** The event's second custom question, *"Why do you want to book this call?"*, already has that option, and `a2=Design%20Wallet%20Enquiries` on the embed URL pre-selects it. That keeps listing calls distinguishable from mentorship and recruiting bookings.
- **`⚠️ GOTCHA` `a2` means "the second custom question", by position, not name.** If the questions are reordered in Calendly, or the option is renamed, the pre-fill silently lands on the wrong question or matches nothing. Nothing errors. **It is set in two places in `list-your-tool/index.html`**: the embed's `data-url` and the fallback link.
- **`DECIDED` `hide_event_type_details=1`** drops Calendly's left panel (host avatar, event name, duration) on wide screens. The hero already states 30 minutes · Google Meet · Free to book, and the calendar gets the width. At phone width Calendly still prints the event name above the calendar, which is fine.
- **`PENDING` The calendar renders white on the dark site.** The embed passes `background_color=121212&text_color=f5f5f5&primary_color=ffffff`, but **Calendly ignores colour parameters on the free plan**. The account is on the free plan: the widget shows a "Powered by Calendly" ribbon and the booking API reports `unbranded: false`. Confirmed in headless Chrome. Either upgrade Calendly (the parameters are already in place, so it goes dark with no code change) or accept the white panel. **Karthik's call.**
- **`DECIDED` A completed booking is reported to GA4 as `list_tool_call_booked`.** Calendly posts `calendly.event_scheduled` to the parent window. `list-your-tool/list-your-tool.js` listens for it, from `https://calendly.com` only, and fires the event. This is the site's only revenue funnel, so it's the one conversion worth counting.
- **`DECIDED` There is always a plain link out.** "Calendar not loading? Book on Calendly" sits under the embed, because blockers commonly stop `assets.calendly.com` and the page would otherwise show an empty box.
- **`DECIDED` The page's CSS and JS live in `list-your-tool/`** (`list-your-tool.css`, `list-your-tool.js`, `.lyt-` prefix), following the Good deals and glass-generator precedent. The GA4 block is the only inline script.
- **`✅ DONE`** ~~The `.pr-*` pricing CSS is removed from `style.css`.~~ 596 lines, from the `Pricing Page (DreamCut-style)` banner through its last media query, cut as one contiguous range. A script first asserted both boundaries and that every selector inside was `.pr-*` or `@media`. **The guard earned its keep**: its first version tripped on the colour stops inside `.pr-card-featured`'s `conic-gradient` and refused to cut, which is the right failure. Braces balanced before and after. `check-layout.js` passes. `shimmer-rotate` / `--shimmer-angle` are defined outside the block and were left alone.
- **Embed height is 700px, or 1000px below 700px wide.** At 390px the widget's own content measured 998px, so it fits without an inner scroll.
- **`✅ DONE`** ~~The embed, the "What we'll cover" card and the hero chips are gone; the page ends in a single "Book a call" button.~~ Karthik's call, 2026-09-13: *"Remove both the section and add just the button 'Book a call' and link the calendly link. Remove the '30 minutes' 'Google Meet' and 'Free to book' capsules."* The button (`.lyt-book-btn`) opens `design-mentorship-call?a2=Design%20Wallet%20Enquiries` in a new tab, so the `a2` pre-tag is now set in **one** place. `widget.js` is no longer loaded. **This supersedes** the embed-height, `hide_event_type_details`, white-calendar `PENDING`, and fallback-link entries above, which are kept for history.
- **`DECIDED` GA4 now counts the click, `list_tool_call_click`, not `list_tool_call_booked`.** With Calendly in its own tab the page can't hear `calendly.event_scheduled`, so completed bookings are no longer measurable from the site. Replaces the booking-event entry above.
- **`✅ DONE`** ~~The hero is personal: a circular photo of Karthik, then *"Hi👋 I'm Karthik. Let's list your tool."*, the subline *"Book a call with me to see where your design tool fits in. Let's work out together to find the best way to get it listed. 🙌"* (the earlier copy, restored at Karthik's request), then the button.~~ Karthik's call, 2026-09-13. Replaces the "Put your tool in front of designers" headline and the LinkedIn intro paragraph. The photo is `.lyt-avatar` (140px circle, `object-position: center 20%` to frame the face).
- **`✅ DONE`** ~~A LinkedIn badge sits on the bottom-right edge of the avatar, linking to https://www.linkedin.com/in/karthikskrishnan/ (new tab).~~ Karthik's call, 2026-09-13. `.lyt-avatar-linkedin`: 34px LinkedIn-blue circle with an inline SVG logo and a page-background ring; the image now clips itself (`border-radius` on the `img`) so the badge can overhang the circle.
- **`✅ DONE`** ~~The photo is in the repo.~~ `public/avatars/karthik.jpg`, 320×320 JPEG (36 KB, 2× the 140px circle), cropped square around the face from `~/Downloads/hf_20260630_100736_…png` (896×1200). Re-crop from that source if it ever needs a different framing.

---

## 14. Changelog (`/changelog/`)

- **`✅ DONE`** ~~A single-page changelog lists every Design Wallet release, newest at the top.~~ Karthik's call, 2026-09-15, modelled on pikaicons.com/changelog. A centred "Changelog" heading, then one row per version: version and date in a sticky left column, and title, screenshot and notes on the right. It stacks to one column under 860px. Files: `changelog/index.html` + `changelog/changelog.css` (`.cl-` prefix). No page JS; it loads only `content.js` and `header.js`.
- **`✅ DONE`** ~~Releases are grouped under major-version headings.~~ Karthik's call, 2026-09-15: "Version 2" holds v2.1 and v2.0, then "Version 1" holds v1.2, v1.1 and v1.0. Each group is a `<section class="cl-major" id="version-N">` with an `<h2 class="cl-major-title">`, and entry titles moved to `<h3>`. **Newest first at both levels.** Karthik's sketch listed v2.1 above v2.2, but that was read as showing the nesting, not a change to his earlier "latest at the top" rule. A new major gets a new section at the top; `/update-change-log` knows both cases.
- **`✅ DONE`** ~~Dividers only between major versions.~~ Karthik's call, 2026-09-15. The rule under each "Version N" heading is the only divider; releases inside a group are separated by space alone (`.cl-entry + .cl-entry` has no border).
- **`✅ DONE`** ~~The latest version sits beside the logo in the nav as a capsule linking to `/changelog/`.~~ Karthik's call, 2026-09-15. The text comes from **`DW_VERSION`** at the top of `header.js`, so it shows on every page that uses the shared header. Styled as `.brand-version`: a 1px `--border-strong` pill in Inter 0.7rem, with **no hover state, as asked**. The logo and capsule are wrapped in `.brand-group`, so the header's space-between flex still has three children. `/update-change-log` bumps `DW_VERSION` and the `header.js?v=` cache-buster, which went to `20260915-1` on all 16 pages and in `build-blog.js`'s `assetVersion`. **`/salary/` has no shared header (§12), so it shows no capsule.** Verified at 1440px on `/`, `/good-deals/` and `/changelog/` and at 390px, where it sits beside the logo with the hamburger. A click lands on `/changelog/`.
- **`✅ DONE`** ~~Hot trends gets its own block inside the v2.1 entry~~ (Karthik's call, 2026-09-15, chosen over splitting it into its own version and renumbering Know your money to v2.2): an `<h4 class="cl-subhead">New Hot trends collections</h4>` with a paragraph and one bullet per collection, under the Know your money notes. `/update-change-log` may use the same pattern for any standout update within a release.
- **`✅ DONE`** ~~The Hot trends collections (MCP Connectors, AI Creative Suites, Vibe Coding Tools) are announced in v2.1, not v2.0.~~ Karthik's call, 2026-09-15. The mention was taken out of v2.0's homepage bullet so it isn't listed twice. **The git and decision history put these live in the 2026-09-01 go-live** (§10, "MCP Connectors goes live"). Karthik chose to announce them in v2.1.
- **`✅ DONE`** ~~Every changelog screenshot links to the page it shows~~ (Karthik's call, 2026-09-15): v2.1 → `/salary/`, v2.0 → `/`, v1.2 → `/submit-portfolio/`, v1.1 → `/blog/`, v1.0 → `/tools/spline/`. An `<a class="cl-shot-link">` wraps the `<img>`, same tab, no hover state. **`/salary/` isn't live yet**, so the v2.1 link 404s on production until that branch deploys, the same hold-back as the entry itself.
- **`✅ DONE`** ~~v2.2 "Mini Tools: free tools for everyday design work", Sep 15, 2026.~~ Karthik's call, 2026-09-15. He asked for "v2.3" and "three mini tools". Two answers settled it: **v2.2** (no gap after v2.1) and **only the two tools that exist** (Color Code Converter and Glassmorphism CSS Generator; there's no third). It has one `cl-subhead` block per tool plus "All in one place" (the nav panel and the `/dw-tools/` page), and the screenshot of `/dw-tools/` links there. **The "Mini Tools, grouped" bullet was removed from v2.1** so it isn't announced twice. `DW_VERSION` → `v2.2`, `header.js?v=` → `20260915-2` on all 16 pages and in `build-blog.js`. **`⚠️ GOTCHA` The first capture still showed "v2.1" in its nav**, because it was taken before the bump. Recaptured, and `/update-change-log` now bumps `DW_VERSION` before step 4. **The Glassmorphism generator is held back from `main`,** so this entry ships with the branch like v2.1.
- **`✅ DONE`** ~~The orbiting starfield sits behind the Changelog heading.~~ Karthik's call, 2026-09-15. It's the shared `stars.js` field, with no page-specific tuning, as §10 requires. `.cl-hero` gets `position: relative; overflow: hidden`, and its children are lifted to z-index 1 (the same fix as Good deals). The hero got `padding-block: 72px` (24px on mobile) so the orbits have room to show; its outer margin shrank to keep the page length about the same. `stars.js` hides the field below 760px via the global rule. Verified: 100 orbits render, the heading paints above them, and there's no horizontal overflow at 1440 or 390px.
- **`DECIDED` Every entry is Version · Date · Title · Description, plus one screenshot.** The description is one plain sentence and a short bullet list, written for visitors, not developers.
- **`DECIDED` Consolidated releases only.** Nothing gets added as individual changes happen. The changelog changes only when Karthik runs **`/update-change-log`** (`.claude/commands/update-change-log.md`). That command turns everything since the previous entry's `data-through` date into one new version (minor bump by default, `major` or an explicit `vX.Y` as an argument), shows the draft for approval, screenshots the headline page, and inserts the entry at the top.
- **`DECIDED` Entries are static HTML, not rendered from JSON.** The page is read by search engines and changes a few times a year, so a data file plus a renderer would be pure overhead.
- **`DECIDED` Screenshots come from `npm run changelog-shot -- <route> <version>`** (`scripts/changelog-screenshot.js`). It starts the dev server, captures 1440×900 in headless Chrome and writes `public/changelog/vX-Y.webp` (~25–85 KB each).
- **Initial history (backfilled from git and this file), all written 2026-09-15:** v1.0 Apr 19 launch · v1.1 May 20 blog and homepage refresh · v1.2 Jun 14 portfolio submissions · v2.0 Sep 1 the free relaunch (go-live) · v2.1 Sep 15 Know your money, Mini Tools, List your tool.
- **`⚠️ GOTCHA` v2.1 describes work on `remove-paywall` that is not deployed** (salary dashboard, Mini Tools panel and index, List your tool, the glass generator). Ship the changelog in the same deploy as that work, or cut v2.1 back to what is live first.
- **`⚠️ GOTCHA` The older entries' screenshots show today's site**, not the site as it looked at each release: there are no archived captures. v1.0 uses a tool page, v1.1 the blog, v1.2 the portfolio form, all as they look now.
- **`PENDING` Nothing links to `/changelog/` yet** apart from `sitemap.xml`. There is no footer (removed 2026-09-01), and the nav wasn't touched.
- **`⚠️ GOTCHA` The sticky version column sits at `top: 128px`** to clear the sticky site header. At 32px it slid under the header.

## Implementation Log

**2026-08-24 — Paywall removal** · branch `remove-paywall`, not merged to `main`

| | |
|---|---|
| `ba59688` | **Preservation commit.** 26 paywall files (`auth/`, `account/`, `supabase/`, `pricing/`, `get-access/`) had **never been committed**. Deleting them would have destroyed them permanently and left no diff to review, so the working tree was snapshotted first. |
| `9e92d07` | **The removal.** 29 files deleted, 7 edited. |

**Verified after the change:** all 12 surviving routes return 200 · all 4 deleted routes return 404 · every asset reference across every HTML file resolves · all 6 JS files pass `node --check` · zero surviving references to `/pricing/`, `/account/`, `/auth/`, `/join-waitlist`, `dw-gate-pending`, `DWAuth`, or `supabase`.

**Not merged.** Review the diff with `git diff main` before merging.

**2026-08-24 — Catalogue becomes the homepage + TOOLS dropdown** · commit `eddc84b`

- `/` now renders the catalogue dashboard; the marketing homepage is gone.
- `tools.js` gained `isRootRoute()`; `/` and `/index.html` are catalogue routes. Verified against 9 route cases — real 404s still show "Page not found".
- Nav gained a `TOOLS` dropdown backed by `DW_TOOLS` in `header.js`.

**Bug found and fixed in passing:** `404.html` still carried the *old* `category-index-content` markup, but `tools.js` only ever calls `renderDashboard()`, which needs `#dashboard-view`. GitHub Pages serves `404.html` for every `/category/*` deep link — so **the main browsing path was rendering a blank page in production**. All three shells now share the same markup.

**Newly dead as a result:** `renderCategoryIndex()` and `renderCategoryList()` in `tools.js` (defined, never called, and their markup no longer exists anywhere); the two illustration WebPs are now unreferenced (~150 KB, harmless); the `public/avatars/` set is back in use by the "Loved by" row; the homepage-only sections of `script.js` (hero shine, category cloud, featured section) no longer run anywhere, though `script.js` is still used by 7 other pages.

---

**2026-09-01 — Glassmorphism CSS Generator** · `/dw-tools/glassmorphism-css-generator/`

Three new files — `index.html`, `glass-generator.js` (541 lines), `glass-generator.css` (688 lines) — plus one line in `DW_TOOLS`. HTML, CSS and JS stay in separate files; no inline script.

**Verified:** all 12 routes still 200 · every asset reference on the new page resolves · all 7 JS files pass `node --check` · `check-layout.js` still passes · `glass-generator.css` brace-balanced (94/94) · the turbulence data URI parses as valid XML.

**Formatter output checked against the PRD samples** at the defaults and at five edge cases (glow off · blur 0 + saturation 100 + border 0 + depth 0 · custom tint · 3px and 4px borders · black tint). Degenerate values drop their property rather than emitting a no-op — `blur(0px)` and an invisible `border: 0px solid` never reach the clipboard.

**A DOM stub drives the real script through 26 assertions** — initial render, slider drag, glow toggle, tab switch, hex entry (including invalid and 3-digit), 300 randomizes bounds-checked, and reset. It found the rAF latch bug above, which no amount of reading the code had.

**Cache-buster `header.js?v=20260901-2` on all 12 pages**, since `header.js` itself changed. The three generated blog pages were already stale at `-1` while `build-blog.js` emits `-2`; they now agree, so the next rebuild is a no-op rather than a surprise diff.

---

**2026-09-01 — Glass generator: fixed background, sub-pixel border, drop shadow**

Three changes requested after the first build.

| | |
|---|---|
| Background | Picker deleted; one ground, from Karthik's image. `glassmorphism-background.webp` (1600×900, 16 KB) derived from the 899 KB source. |
| Border width | `step="1"` → `step="0.01"`, readout to 2dp. |
| Drop shadow | New `filter: drop-shadow()` control, 0.01px, default 0. |

**Verified:** every JS hook still resolves against the markup · **no dead CSS left by the deleted picker** (checked both directions — no rule without markup, no class without a rule) · CSS brace-balanced · all routes 200 · the WebP serves at 16,812 B · `check-layout.js` passes.

**The DOM smoke test now runs 36 assertions**, including the two new controls and a hardened randomize loop: 300 random states × 3 formats = **900 renders**, each checked for emptiness, `NaN`/`undefined` leaks, brace balance and a format-specific shape marker. Both failures it reported this round were the test's own stale tab state, not product bugs — worth noting, because a test that lies in that direction is the kind you learn to ignore.

---

**2026-09-01 — Glass generator: per-control locks, single-line title**

**Locks.** 11 padlock toggles, one per randomizable control (9 sliders + tint + glow). `locked` is a key→bool map; Randomize consults it before rerolling each value; Reset clears it. Pinning against Randomize only — locked controls stay draggable.

**Title.** `white-space: nowrap` plus a re-tuned clamp; the 720px cap on `.glass-hero-copy` was the actual cause and is gone.

**Verified:** every JS hook resolves · **lock set and control set match exactly in both directions** (no control without a lock, no lock without a control) · no dead CSS · braces balanced · 15 routes 200 · `check-layout.js` passes.

**The smoke test is now 47 assertions.** The lock block proves the three things that actually matter: a locked control survives **120 consecutive randomizes**, an *unlocked* one still moves (a lock that silently froze everything would otherwise pass), and a locked slider is still draggable by hand. Locks on tint and glow are checked separately, since those are not sliders and take a different code path.

**The DOM stub grew a real parent chain** to support `Element.closest()`. It had been a flat list of tags; it now tracks open/close with a stack, which is what let the `is-locked` class assertion test the real code path rather than a stub of it.

---

**2026-09-01 — Branch pushed; `main` deliberately not merged** · `origin/remove-paywall`

Karthik asked to take the site live. **Going live turned out to mean far more than shipping the tool**, so it was split into two deliberate steps rather than one.

- **`DECIDED` Backup first, merge second.** `remove-paywall` was **54 commits ahead of `main` and had never left this laptop** — `git branch -r --contains` returned nothing. Pushing the branch costs nothing, backs up months of work, and gives a reviewable diff; **`designwallet.in` is untouched**, still served from `main` at `a7780c8`.
- **The merge is a clean fast-forward** (`git merge-base --is-ancestor main remove-paywall` passes), so no conflicts are possible and the go-live is one command whenever Karthik says so.
- **`DECIDED` GitHub Pages serves `main`, so a merge *is* the deploy.** There is no Pages workflow and no preview environment — `.github/workflows/` holds only the Notion blog build. **Merging to `main` publishes immediately, with no staging step to catch anything.** Worth knowing before the button is pressed.
- **Scope on record:** merging ships the entire go-free relaunch in one shot — paywall removal, catalogue-as-homepage, footer and theme-toggle removal, the icon set, the starfield, the newsletter — and the glass generator is a small slice of it. §5's "keep the old site live until the new one is finished" still applies to that call.

Three commits: `ce6573d` (delete the testimonial sources), `fdc39dd` (the tool), `ad9688f` (nav registration + the accumulated relaunch work).

**Gotcha on record — `git commit` after `git rm` sweeps up whatever was already staged.** `footer.js` and `theme.js` had been sitting **pre-staged** in the index before this session began, so the testimonial-deletion commit silently swallowed them and its message became a lie. Caught by diffing the commit against its own stated scope; unwound with `reset --soft` and re-made. **Check `git diff --cached --name-only` before committing, not after** — a scoped `git rm` does not imply a scoped commit.

**Still not verified: the tool has never been seen in a browser.** No headless browser is available here. It is now committed and pushed, but **not published** — nothing reaches `designwallet.in` until `main` moves.

---

**2026-09-01 — GO LIVE** · `designwallet.in` · `main` at `b3a466b`

The relaunch is published. 57 commits, from `a7780c8` to `b3a466b`, in one push.

**Verified in production, not locally:** 11 routes return 200 (`/`, `/404.html`, `/tools/`, `/blog/`, `/books/`, `/good-deals/`, `/privacy/`, `/terms/`, `/list-your-tool/`, `/favourites.html`, `/dw-tools/color-code-converter/`) · `/pricing/` and `/account/` 404 · the 124 MB of testimonial JPEGs 404 · the homepage renders the catalogue shell with no paywall or footer remnants · the TOOLS dropdown lists only the Color Code Converter. Pages took ~30 s to build.

- **`✅ DONE`** ~~The Glassmorphism CSS Generator is held back from the live site.~~ Karthik's call — everything else ships, that page does not, because **it has still never been seen rendered in a browser**. `/dw-tools/glassmorphism-css-generator/` 404s in production.
- **`DECIDED` The hold-back is a revert-shaped commit, not a deletion.** `b3a466b` removes the three page files, two images and the nav entry; `334f413` on `remove-paywall` reverts it straight back. So **`remove-paywall` sits exactly one commit ahead of `main`**, and shipping the tool is a plain fast-forward — `git push origin remove-paywall:main`. This deliberately avoids the delete-then-re-merge trap, where git would keep the deletion and the tool would silently never come back.
- **Mechanism on record: `main` is never checked out or merged into.** `git merge` and `git checkout -b` are both blocked by the sandbox here, so publishing is `git push origin remove-paywall:main` — pushing a branch straight onto the remote ref. Same result as a fast-forward, one fewer local state to get wrong. **Use this form for future deploys.**
- **Note:** `main` is now the deploy ref *and* one commit behind the working branch by design. Do not "tidy" that gap — it is the glass tool waiting to ship.

**Still true and still the blocker for that page:** nobody has looked at the glass generator in a browser. Everything about it is verified by parser, route check and a 47-assertion DOM harness; none of that is a pair of eyes.

---

**2026-09-01 — Good deals starfield; list-your-tool held back** · `main` at `685d7c3`

**Shipped:** the orbiting starfield behind the Good deals hero, and Karthik's two tweaks — the Subscribe nav pill widened to `12px 32px`, and the Good deals email form to 700px.

**Held back from live:** `list-your-tool/` joins the glass generator. Both are intact on `remove-paywall`; neither is on `main`.

- **`DECIDED` Holding a page back means removing its inbound links too, not just the page.** `list-your-tool/` was linked from four places — the pinned sidebar CTA on **all three** catalogue shells, and the "Run a design tool?" card on Good deals, which existed solely to point at it. Deleting only the page would have left four live links to a 404. Verified after deploy: **zero references to either held page across `/`, `/404.html`, `/tools/` and `/good-deals/`.**
- **The hold-back stays one revert-shaped commit** (`685d7c3`, reverted on the branch by `24d3b0a`), now covering both pages. `remove-paywall` remains exactly one commit ahead of `main`, so restoring either is still `git push origin remove-paywall:main` — but note that ships **both**, since they share the commit. Splitting them means reverting selectively first.
- **Note:** removing the Good deals value card leaves two cards in an `auto-fit` grid, so they simply widen. No layout fix was needed, and the revert restores the third exactly.

**Verified in production:** 10 routes 200 · `/list-your-tool/` and `/dw-tools/glassmorphism-css-generator/` both 404 · the starfield markup, script tag and `.ga-hero` rule all serve · no dead links anywhere. Pages took ~60 s.

---

**2026-09-05 — Salary dashboard v1 built** · branch `remove-paywall`, **not deployed**

`/salary/` and `/salary/submit/` built end to end. `main` is untouched — nothing is live.

| | |
|---|---|
| New | `salary/index.html`, `salary/salary.css`, `salary/salary.js`, `salary/charts.js`, `salary/data/benchmarks.json`, `salary/data/salaries.json`, `salary/submit/{index.html,submit-salary.js,google-apps-script.js}`, `scripts/build-salary.js`, `sitemap.xml`, `robots.txt` |
| Changed | `header.js` (Salary nav item), `package.json` (`build-salary`), `scripts/build-blog.js` + 13 pages (cache-buster `20260901-2` → `20260905-1`) |

- **`✅ DONE`** ~~The salary dashboard ships as a chart-dense, monochrome, build-time-data page.~~ Eighteen sections, eight chart forms, six filters, 1,053 city cells from an 88-cell seed.
- **`⚠️ GOTCHA — worth remembering` `form.<name>` is no longer safe for form fields.** `form.role` returns **null**, not the `<select name="role">`, because ARIA reflection added a `role` IDL attribute to `Element` and IDL properties beat the form's named-element getter. The form had no `role` attribute, so it answered null and the whole option-population step died in a `catch`. Same trap waits on `title`, `id`, `style`, `lang`, `dir`, `slot`. **Use `form.elements[name]`.** Caught by a DOM smoke test, not by reading it — and it would have shipped a permanently broken form.
- **`⚠️ GOTCHA` `Math.round` on a salary prints ₹0.** The heatmap rounded to whole lakhs, so intern illustrators/animators/video editors at 0.45 L rendered as **"0"**. Anything under 10 L keeps a decimal. Caught by looking at a screenshot, not by any test.
- **Also caught by rendering:** `history.replaceState` throws on opaque origins, and it was being called from inside `render()` — so one throw blanked the entire dashboard. Now wrapped. And the step chart clipped its first and last markers in half at the container edge; it now insets by 4% and positions axis ticks on the same x rather than spreading them with flex.
- **`DECIDED` The seed is 88 role×level baselines plus per-city / work-mode / employer / company indices, not 3,432 hand-written cells.** A derived figure is `baseline × city × mode × employer`. The dashboard's filter maths applies the same chain as ratios against national, so a filtered figure stays consistent with the comparison charts beside it instead of drifting.
- **The gviz guard was tested live and works.** Pointing `SALARY_SHEET_ID` at the tool-catalogue sheet with tab `"Salary submissions"` returned **the catalogue's rows with `status: ok`** — exactly the §8c gotcha. The header assertion caught it, exited 1, and left `salaries.json` untouched. This is the first place on the site where that gotcha is actively defended rather than just documented.
- **`DECIDED` JSON-LD is the one addition to the "no inline script" rule**, alongside the GA4 block. `<script type="application/ld+json">` is data, not executable script, and structured data cannot be externalised.
- **`DECIDED` `sitemap.xml` deliberately omits `/list-your-tool/` and the glass generator.** Both are held back from `main`, and "holding a page back means removing its inbound links too" applies to a sitemap entry as much as a nav link. A note in the file says to add them back in the same commit that restores them.
- **`PENDING` Submissions are not switched on** (still true 2026-09-15, but the setup is now: add the tab, paste and deploy the Apps Script, put the /exec URL in `salary/endpoint.js`; the `SPREADSHEET_ID` placeholder is gone). ~~Original note:~~ `SUBMISSION_URL` in `salary/submit/submit-salary.js` is empty until a salary spreadsheet exists and `google-apps-script.js` is deployed as a web app. The form validates fully and tells the visitor submissions aren't open yet. **`SPREADSHEET_ID` in the Apps Script is also a placeholder.**
- **`PENDING` The seed figures have not been reviewed by Karthik.** They are researched estimates for the Indian market as of 2026, and they are what every visitor will read as fact. Worth an eyes-on pass before this goes live.

**Verified:** 6 JS files pass `node --check` · `salary.css` brace-balanced (149/149) · `check-layout.js` passes · `sitemap.xml` well-formed · 14 routes 200 on the dev server · build produces 1,053 cells, 20.7 KB gzipped · the chart ramp passes the data-viz validator (`ALL PASS`, ordinal, dark, 2.22:1 light-end) · **37-assertion DOM harness on the dashboard and 14 on the form, both ALL PASS** · rendered in headless Chrome at 1440px and 390px with **no horizontal overflow and no JS errors**.


- **`✅ DONE` The dashboard is an app shell, not a document page.** Karthik's call, 2026-09-05, against a reference composition: fixed left sidebar (logo + role list + submit CTA + collapse), a sticky top bar carrying the level ladder and four filters, and a 12-column card grid. Replaces the stacked-sections layout shipped hours earlier.
- **`DECIDED` `/salary/` carries the logo only — no site nav.** Karthik's call. The page deliberately does **not** render `<header class="site-header">`, so `header.js` injects nothing into it; the role list in the sidebar does the nav's job. **This is the only page on the site without the shared nav** — if a future change assumes every page has one, this is the exception. `/salary/submit/` keeps the standard header, so there is still a way back into the site.
- **`DECIDED` The reference's light-and-green palette was not adopted, only its composition.** §9 records dark-only and token-only; a light green dashboard would contradict both and every other page. Layout copied, palette kept.
- **`DECIDED` Role abbreviations appear ONLY in the collapsed rail.** Karthik's call, 2026-09-05: no chips beside the role names in the expanded panel — the full name is enough there and a column of chips is noise. They stay in the collapsed rail (PD · UXR · DS · VD · BD · 3D · MD · GD · IL · AN · VE, from the seed's `abbr` field) because at 74px they are the **only** thing identifying a role; eleven identical dots would not be navigable and there are no per-role icons. Sidebar retuned 264px → **240px** once the chip stopped taking width.
- **`⚠️ GOTCHA — harness, not product` A jsdom harness that injects scripts and then dispatches `DOMContentLoaded` runs the page's init TWICE.** jsdom already fires the event when parsing ends, so every listener double-binds — idempotent renders hide it, but **a toggle fires twice and nets to zero**, which read as a broken feature for half an hour. Inline the page's own script tags into the HTML and let jsdom run them during parse. The product code was never wrong.
- **`⚠️ Lesson` Deleting a CSS block by line range takes rules you still need.** The shell rewrite removed `/* ── shell ─ */` through `/* ── histogram ─ */`, which silently included the range-bar rules — the bar vanished and its three scale labels collapsed into `₹19 L₹24 L₹30 L`. Same family as the grouped-selector trap recorded four times above: **confirm what a range actually spans before cutting it.** Caught by looking at a screenshot.

- **`DECIDED` The section is called "Know your money", not "Salary".** Karthik's call, 2026-09-05. Nav label, page `<h1>`, and the submit page's eyebrow all carry it. **The `<title>` keeps the descriptive half** — `Know Your Money — Designer Salaries in India | Design Wallet™` — because the brand name has no search volume and this page exists to be found by people typing "designer salary india". The URL stays `/salary/`: changing it would break the canonical, the sitemap and any link already shared.
- **`DECIDED` "Middle 50% range" carries an info icon** explaining percentiles in plain words. Any element with `data-info` gets the shared chart tooltip via `DWCharts.attachTip`, so explanatory copy lives in the markup beside what it explains and there is only ever one tooltip implementation on the page.
- **`DECIDED` The sidebar width is measured, not guessed.** 264px: the longest role label ("Design Systems Designer") needs 165px of text plus the abbr chip, gaps and three levels of padding = 257px, with headroom for a fallback font. Labels also carry `text-overflow: ellipsis` so a longer future role degrades instead of clipping mid-glyph. **It was 232px and silently cut that label off.**
- **`✅ DONE` The role list's scrollbar is hidden but it still scrolls.** Karthik's call, 2026-09-11. `.sal-role-nav` was `scrollbar-width: thin`, which still paints a bar beside the roles on macOS when scrollbars are set to always show. It now takes the same three rules as the tools dashboard (§ hidden scrollbars): `scrollbar-width: none`, `-ms-overflow-style: none`, and `::-webkit-scrollbar`. **The `.sal-scroll-y` card lists and the `.sal-level-ladder` still use `thin`.** Only the sidebar was asked about.
- **`DECIDED` Cards in a bento row are all the same height.** Karthik's call, 2026-09-11. `.sal-grid` was `align-items: start`, which left ragged gaps under the shorter cards (the stats and top-city cards sat well short of the hero). It is now `stretch`, so every card grows to its row's height. **Column spans are unchanged.** "Equally sized" was read as equal heights per row, not identical tiles. Verified at 1440 / 1100 / 390px: no row has mismatched heights and there is no horizontal overflow.
- **`DECIDED` A filter on its default reads grey; a chosen filter reads white.** Karthik's call, 2026-09-11. City / work mode / employer / company type selects render in `--muted` while on "All India" / "Any …", and switch to `--pure` once a value is picked. The `is-set` class is toggled in **`syncControls()`**, not in the `change` handlers, because values also change from chart clicks, URL params and the employer auto-reset. The open option list stays `--text` so it doesn't inherit the grey.
- **`DECIDED` Salary figures read "₹12.5 LPA", not "₹12.5 L".** Karthik's call, 2026-09-11. Every figure on `/salary/` goes through **`DWCharts.lpa()` in `salary/charts.js`**: KPIs, hero, range and histogram scales, bar values, tooltips, aria-labels, the leaderboard and the table view. That one function is the only place the suffix lives. **Don't hand-build a "₹… L" string anywhere else.** Prose that says "in ₹ lakh" was left alone: it's a word, not the abbreviation.
- **`DECIDED` The salary sidebar matches the home page's left panel.** Karthik's call, 2026-09-11. `.sal-sidebar` no longer has a card fill, border box or radius. It sits flush on the left edge at full viewport height, ruled off by a right border (a bottom border when it becomes the top rail under 1000px), the same as `.dash-sidebar` in `tools/dashboard.css`. Role rows copy `.dash-nav-row`: `--muted-strong` text, 0.9rem, 8px 12px padding, 10px radius, 8px gaps. The active row is a `rgba(fg, 0.1)` fill with white 500-weight text. **The white active-rail marker is gone.** The home panel has none, and the fill already marks the selection. The footer is ruled off with a top border like `.dash-sidebar-foot`. **The "Know a number we don't?" CTA card keeps its own card styling.** Only the panel itself was asked about.

**Seen in a browser this time** — headless Chrome screenshots at both widths, which is what caught the heatmap "₹0" and the clipped ladder markers. That is a change from the glass generator, which is still held back precisely because nobody has looked at it.


---

**2026-09-11 — List your tool becomes a book-a-call page** · branch `remove-paywall`, **not deployed**

| | |
|---|---|
| Rewritten | `list-your-tool/index.html`: hero + "What we'll cover" + Calendly inline embed |
| New | `list-your-tool/list-your-tool.css`, `list-your-tool/list-your-tool.js` |
| Removed | 596 lines of `.pr-*` rules from `style.css`; the page's two inline scripts (dead billing toggle, FAQ animation) |

**Verified:** `list-your-tool.js` passes `node --check` · `style.css` braces balanced · no `.pr-` selector left outside the stray `(1)` copies · `check-layout.js` passes · **rendered in headless Chrome** at 1440px and 390px with no JS errors and no horizontal overflow · the Calendly iframe loads at both widths, with `a2` and the hide flags on its URL · starfield (100 orbits) and nav render. The only failed request was the GA4 beacon from localhost.

**Not verified:** no real booking was made, so neither the `list_tool_call_booked` event nor the "Design Wallet Enquiries" pre-selection has been seen landing in GA4 or Calendly. **Book one test slot and check both before shipping.**

---

**2026-09-11 — Mini Tools becomes a wide panel** · branch `remove-paywall`, **not deployed**

| | |
|---|---|
| Changed | `header.js` (`DW_TOOLS` gains `description` and `icon`; panel and CTA markup) · `style.css` (`.nav-dropdown--wide` / `.nav-mega-*`, desktop and ≤980px) · `tools/dashboard.css` (header `static` → `relative`) |
| Cache-busters | `header.js`, `style.css` and `dashboard.css` → `?v=20260911-1` on every page. `build-blog.js` `assetVersion` → `20260911-1`, so a blog rebuild agrees |

**Verified:** `header.js` and `build-blog.js` pass `node --check` · `style.css` braces balanced · `check-layout.js` passes · in headless Chrome at 1440px and 1100px on `/`, `/good-deals/` and `/blog/`: the panel stays open along the whole pointer walk, stays inside the viewport, causes no horizontal overflow, and renders a dark CTA label · at 390px on `/books/`: the nav sheet opens, the panel stacks to one column inside it, and the CTA sits underneath.

**Cache-buster drift, fixed in passing:** `style.css?v=` was split across two versions (8 pages on `20260901-2`, 2 on `20260905-1`), and the pages linking a bare `/style.css` had no version at all. Those pages would have served the new nav markup against a cached old stylesheet. Every page now reads `20260911-1`.

---

**2026-09-11 — "Explore the tools" CTA and the `/dw-tools/` index** · branch `remove-paywall`, **not deployed**

| | |
|---|---|
| New | `dw-tools/index.html`, `dw-tools/dw-tools.css`, `dw-tools/dw-tools.js` |
| Changed | `header.js` (panel CTA now "Explore the tools" → `/dw-tools/`) · `sitemap.xml` (added `/dw-tools/`, 13 URLs) · `header.js` and `style.css` cache-busters → `?v=20260911-2` on every page, `build-blog.js` `assetVersion` to match |

**Verified:** `header.js`, `dw-tools.js` and `build-blog.js` pass `node --check` · `dw-tools.css` braces balanced · `sitemap.xml` well-formed (`xmllint`) · every page except the stray `(1)` copies is on the new versions · in headless Chrome, `/dw-tools/` renders 2 cards (matching `DW_TOOLS.length`) with correct hrefs at 1440px and 390px, with no JS errors, no 4xx and no horizontal overflow · on `/good-deals/` the panel shows the new block, the label computes dark, and clicking "Explore the tools" lands on `/dw-tools/` · `header.js` no longer references `/list-your-tool/`.

---

**2026-09-13 — Five-page PDF report export on `/salary/`** · branch `remove-paywall`, **not deployed**

| | |
|---|---|
| New | `salary/pdf-writer.js` (a small PDF 1.4 writer), `salary/report.js` (the five pages) |
| Changed | `salary/index.html` (Export button, topbar caption, two script tags, cache-busters) · `salary.css` (button + caption) · `salary.js` (report model, download, filename) |

**Verified:** the three JS files pass `node --check` · `salary.css` braces balanced (230/230) · `check-layout.js` passes · in headless Chrome the button downloads a **5-page, 25 KB PDF with no JS errors** · changing City and Company type produces a different report *and* a different filename, with both files coexisting · `pypdf` reads 5 pages and the title decodes with a proper em dash · a PyMuPDF render of all five pages shows **no text crossing the right margin**, and every page was eyeballed as an image.

**Not verified:** the file has only been opened by `pypdf` and MuPDF. Nobody has opened it in Acrobat, Preview, Google Slides or Keynote, so a reader-specific quirk is still possible. **Open one before this ships.**

---

**2026-09-13 — The report goes black, and gets the brand typeface** · branch `remove-paywall`, **not deployed**

Karthik's two notes on the first PDF. **The clipped lines he saw were the `Tc` bug above** — his copy was downloaded before that fix landed.

| | |
|---|---|
| New | `salary/fonts/`: `geist-regular.ttf`, `geist-semibold.ttf` (20 KB subsets), `geist-metrics.js` (generated), `OFL.txt`, `README.md` |
| Changed | `pdf-writer.js` (TrueType embedding — `/FontFile2`, descriptors, `/Differences` for ₹, widths from the metrics) · `report.js` (black palette, ₹ restored) · `salary.js` (fonts fetched on first export; export is async with a "Preparing…" state) · `index.html` (metrics script, cache-busters `20260913-2`) |

**Verified:** 4 JS files pass `node --check` · the dev server serves the `.ttf` (200) · the browser export embeds **both faces** — `/FontFile2` present, `Geist-Regular` and `Geist-SemiBold` on every page, **no `/Helvetica` anywhere**, so the fallback path was not silently taken · **₹ extracts as U+20B9 on all five pages**, proving the remapped slot round-trips · no text crosses the right margin · 5 pages, 68 KB · every page rendered and eyeballed on black.

**Still not verified:** nobody has opened the file in Acrobat, Preview or Keynote. Embedded-font PDFs are exactly where readers differ, so **open one before this ships.**

---

**2026-09-13 — Inter, a lighter type scale, and the logo in the PDF** · branch `remove-paywall`, **not deployed**

Karthik's feedback on the report, same afternoon as the black pass.

| | |
|---|---|
| Type | Geist → **Inter**, two embedded faces: Regular for body, **Light** for titles and the big figures. Nothing bold, so emphasis is colour. Body copy 9.5pt → **11pt** |
| Logo | `public/Logo/Website-logo.svg` drawn as vector paths, top left of every page, fetched at export time |
| Fonts | `salary/fonts/`: `inter-regular.ttf`, `inter-light.ttf` (36 KB subsets), `inter-metrics.js`, Inter's `OFL.txt`. The three Geist files are deleted |

**Verified:** 4 JS files pass `node --check` · the dev server serves both the `.ttf` and the `.svg` · the export embeds **Inter-Light and Inter-Regular and nothing else** — no Geist, and no `/Helvetica`, so the fallback path was not silently taken · ₹ still extracts as U+20B9 · 5 pages, 149 KB · no text past the right margin or below the footer rule · the header carries **two vector shapes and no fallback text** · every page rendered, plus a 600 dpi crop of the logo.

**The fill-rule bug is the lesson worth keeping.** Every check in that list passed while the wordmark had a bar slashed through both "e"s. Only the zoomed crop showed it. **Render and look at the size the detail actually lives at** — the same lesson the heatmap's "₹0" and the clipped ladder markers taught in §12.

**Still not verified:** nobody has opened the file in a real PDF reader.

---

**2026-09-15 — GO LIVE #2: everything on `remove-paywall`** · `designwallet.in`

Karthik: *"Take everything live."* This ships the salary dashboard (**Know your money**, live community figures, PDF export, countries, INR/USD, animations), `/salary/submit/` wired to the private-sheet Apps Script, the Mini Tools panel and `/dw-tools/` index, the **Glassmorphism CSS Generator** and **List your tool** (both held back since 2026-09-01), the changelog plus the nav version capsule (v2.2), the sidebar contribute drop-up, the single `ref=designwallet` fix, and Good deals minus its value cards.

- **Both hold-backs are lifted.** The glass generator was held back only because **it had never been seen in a browser**. It has now been rendered in headless Chrome: controls, preview and tabs all draw, with no JS errors. Both pages are back in `sitemap.xml`.
- **Pre-flight, all local against the dev server:** every JS file passes `node --check` · `check-layout.js` passes · `sitemap.xml` is well-formed · **19 routes load 200 with no page errors and no horizontal overflow** · **542 internal links, 0 broken** · 0 failed same-origin assets.
- **Deliberately left out of the commit:** the sync-duplicate `* (1).*` files (`index (1).html`, `style (1).css`, `header (1).js`, `.claude/DECISIONS (1).md`, …) and `public/testimonial images/` (124 MB, deleted on 2026-09-01 and reappeared on disk untracked).
- **`⚠️ GOTCHA` A duplicate ref, `.git/refs/heads/remove-paywall (1)`, breaks `git fetch`** ("bad object … did not send all necessary objects"). It looks like a file-sync copy, like the `(1)` files. `git ls-remote` works around it. Not deleted, since it wasn't part of the ask.
- **Mechanism unchanged:** `git push origin remove-paywall:main`, a fast-forward from `685d7c3` to **`90d7fbc`**, with `origin/remove-paywall` pushed first as a backup. Commits: `aaca641` (the release) and `90d7fbc` (untrack the duplicates).
- **`⚠️ GOTCHA` 8 sync-duplicate pages were already tracked** (`blog/index (1).html`, `books/index (1).html`, …), added by an earlier branch commit and never on `main`. The push would have published them as stray URLs, so they were `git rm --cached` first; the files stay on disk. **Before every deploy, check `git diff --name-status origin/main HEAD | grep "(1)"`.**
- **Verified in production:** 20 routes return 200, including `/salary/`, `/salary/submit/`, the glass generator, `/list-your-tool/`, `/changelog/` and its screenshots · the duplicate URLs 404 · the site ships `DW_VERSION = "v2.2"`. In headless Chrome on designwallet.in: the capsule reads v2.2, **483 tool links with 0 double-tagged**, the drop-up has its 3 links, and `/salary/` fetched the Apps Script cross-origin from the real domain (200) and applied it with no page errors. Pages took ~50s.

---

## Superseded

- **`SUPERSEDED` The salary report set in Geist**, with a Regular/SemiBold pair and bold titles. Replaced hours later on 2026-09-13 by Inter Regular + Light, on Karthik's call (§12). The embedding machinery was unchanged — only the faces and the type scale — but `geist-regular.ttf`, `geist-semibold.ttf` and `geist-metrics.js` were deleted rather than left as dead weight in the repo.
- **`SUPERSEDED` The salary report on light pages, set in Helvetica** with figures reading "INR 24 LPA". Replaced 2026-09-13 by Design Wallet black set in embedded Geist (§12), on Karthik's call. The light draft's reasoning — that a document printed for a negotiation wants a white ground — lost to brand consistency.
- **`SUPERSEDED` The Mini Tools panel's "Run a design tool? → Book a call" block** (linking `/list-your-tool/`). Replaced within hours on 2026-09-11 by "All mini tools → Explore the tools" (§2). Karthik wanted the panel's CTA to lead deeper into the tools, not out to the listing sales page.
- **`SUPERSEDED` "The nav CTA and `/list-your-tool/` ship together."** It no longer applies: the nav doesn't link to `/list-your-tool/` any more. The page's other inbound links (the sidebar CTA on the three catalogue shells, and the Good deals card) still follow the hold-back rule in §1.

- **`SUPERSEDED` The list-your-tool pricing page**: ₹1,499 lifetime-listing card, "Pricing on request" Spotlight card, Compare Plans table and a 9-question FAQ. Replaced 2026-09-11 by the book-a-call page (§13). Recoverable from `list-your-tool/index.html` at `ab79e60`.

- **`SUPERSEDED` Four switchable preview backgrounds** (mesh · texture · solid · night), generated as CSS gradients plus an SVG `feTurbulence` tile, with a thumbnail picker under the preview — the PRD's §5.2. Replaced within hours of shipping by Karthik's "use only this background" instruction (§11). The zero-image-payload argument was sound and lost to a direct product call; the §7 discipline survives in the WebP derivative, which is 16 KB rather than 899 KB.
- **`SUPERSEDED` Annual ₹2,999/year subscription** (Supabase + Lemon Squeezy, UI-only gate, `/pricing/` takeover). Replaced by the go-free decision in §1.
- **`SUPERSEDED` Monthly ₹1,499/month subscription.** Implemented 2026-08-24 across `auth/config.js`, `pricing/index.html`, and `account/account.js`, then superseded within the same session by the go-free decision. **The code carrying it was deleted wholesale in the paywall removal** — it lives on only in commit `ba59688`.
- **Lesson worth keeping:** `auth/config.js` was the single source of truth for the displayed price — `pricing.js` overwrote the HTML at runtime, so editing the HTML alone did nothing. Worth remembering if any other value turns out to be JS-injected.
