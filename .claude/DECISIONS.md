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
- Last updated: **2026-09-01**

---

## 1. Direction & Business Model

- **`✅ DONE`** ~~The website becomes free for everyone.~~ No subscriber paywall, no user accounts required to browse. *Shipped on branch `remove-paywall`.*
- **`DECIDED` Revenue comes from paid tool listings, not user subscriptions.** `list-your-tool/` is the business model: free for designers, paid for tools that want placement. *(Standing direction, not a build task.)*
- **`DECIDED` The repository will be open sourced.** "Free" and "open source" are two separate decisions and we're doing both. **Not yet done — blocked on a `LICENSE` file, see §8.**
- **`✅ DONE`** ~~`list-your-tool/` stays.~~ Verified untouched by the paywall removal and still serving.
- **`PENDING` Listing prices are on hold.** The ₹2,999 Spotlight figure **has been removed** (card now reads "Pricing on request"); ₹1,499 stays visible. Karthik will revisit and give the call. Do not change listing prices without being asked.
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

- **`✅ DONE`** ~~Paywall removal happens on a branch, not `main`.~~ Branch `remove-paywall`, two commits, not merged.

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
- **`PENDING` 124 MB of original JPEGs remain in `public/testimonial images/`**, unreferenced. Now committed to git history as of the preservation commit. Deleting them going forward won't shrink history.
- **`PENDING` Font typo:** `style.css` reads `font-family: 'giest'` — should be `'Geist'`. Silently falling back to sans-serif today. *Deliberately not fixed during the paywall removal — it changes rendering, and shouldn't be buried in a large deletion diff.*
- **`PENDING` Two separate Google Fonts stylesheet requests** could be merged into one round trip. *(Partly improved: the Geist Mono family is no longer requested on 12 of 13 pages.)*
- **`PENDING` Dead code:** the billing-toggle script in `list-your-tool/index.html` references `.pr-billing-toggle`, which doesn't exist in the markup. It early-returns and does nothing.
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
- **`DECIDED` `stars.js` is shared with `/list-your-tool/`** — both pages carry a `#stars-field`. Do not tune its constants for one page; add a per-element option instead.
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

---

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

## Superseded

- **`SUPERSEDED` Four switchable preview backgrounds** (mesh · texture · solid · night), generated as CSS gradients plus an SVG `feTurbulence` tile, with a thumbnail picker under the preview — the PRD's §5.2. Replaced within hours of shipping by Karthik's "use only this background" instruction (§11). The zero-image-payload argument was sound and lost to a direct product call; the §7 discipline survives in the WebP derivative, which is 16 KB rather than 899 KB.
- **`SUPERSEDED` Annual ₹2,999/year subscription** (Supabase + Lemon Squeezy, UI-only gate, `/pricing/` takeover). Replaced by the go-free decision in §1.
- **`SUPERSEDED` Monthly ₹1,499/month subscription.** Implemented 2026-08-24 across `auth/config.js`, `pricing/index.html`, and `account/account.js`, then superseded within the same session by the go-free decision. **The code carrying it was deleted wholesale in the paywall removal** — it lives on only in commit `ba59688`.
- **Lesson worth keeping:** `auth/config.js` was the single source of truth for the displayed price — `pricing.js` overwrote the HTML at runtime, so editing the HTML alone did nothing. Worth remembering if any other value turns out to be JS-injected.
