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
- Last updated: **2026-08-24**

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
- **`✅ DONE`** ~~A TOOLS dropdown lists Design Wallet's own tools.~~ Driven by the `DW_TOOLS` array at the top of `header.js` — adding a tool is one line. **Currently only one tool exists** (Color Code Converter).
- **Note:** `tools/category/*` are eleven 6-line redirect stubs pointing at `/category/*`. They disappear with file-based routing.

## 3. Data & Backend

- **`DECIDED` Google Sheets stays as the database.** The Sheet remains the editing surface.
- **`✅ DONE`** ~~Supabase is dropped entirely.~~ All Supabase code deleted (schema + 7 edge functions + client). **The hosted Supabase project itself still exists** — see the `PENDING` item in §6.
- **`✅ DONE`** ~~`scripts/sync-catalog.js` (Sheet → Supabase) is deleted.~~
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

## 9. Newsletter & Theme

- **`✅ DONE`** ~~Newsletter signup lives in the nav.~~ `SUBSCRIBE` opens a modal that `newsletter.js` injects on every page, so no per-page markup is needed.
- **`✅ DONE`** ~~The homepage first fold carries an inline signup~~ — same handler as the modal.
- **`DECIDED` Newsletter posts to the original Google Apps Script endpoint** recovered from the deleted waitlist code, so existing subscribers keep landing in the same sheet. *(That endpoint is now only recorded in `newsletter.js` and commit `ba59688`.)*
- **`✅ DONE`** ~~Dark/light mode toggle, top-right of the nav.~~ Respects `prefers-color-scheme`, remembers an explicit choice in `localStorage`, and follows the OS only until the visitor chooses.
- **`DECIDED` Theming is token-only.** ~480 hardcoded colours were replaced with tokens whose **dark value is the original literal**, so dark mode is provably unchanged and light mode is purely a re-definition. Never reintroduce a raw hex or `rgba(255,255,255,…)` — use `var(--fg-rgb)`, `var(--pure)` or a `--surface-*` token.
- **Gotcha on record:** custom properties do **not** resolve inside `url("data:image/svg+xml,…")`. Colours inside SVG data-URIs must stay literal; one was caught doing exactly this.
- **`✅ DONE`** ~~Light mode is cool, never pure white.~~ Every light surface leans blue (+4 to +20 blue-over-red); `--fg-rgb` is a cool near-black so all translucent borders inherit the same temperature. **Do not reset any light surface to `#ffffff`.**
- **`✅ DONE`** ~~The brand logo is black in light mode, white in dark.~~ Done with `filter: invert(1)` — the mark is a white-filled SVG loaded via `<img>`, so CSS cannot recolour its paths.
- **Gotcha on record:** the **footer** logo has no `.brand-logo` class (`footer.js` emits a bare `<img>`), so it must be targeted separately as `.footer-brand img`. Miss it and the footer mark stays white and vanishes in light mode.
- **`DECIDED` `theme.js` loads synchronously before every `<link>`.** A sync script placed *after* a stylesheet is blocked until that CSS downloads, which would reintroduce the flash of wrong theme.
- **`PENDING` Light-mode visual polish.** The token layer is complete (zero un-tokenised whites remain), but ~100 hex literals survive — brand accents, gradients, and 29 black shadows that correctly stay black. Light mode needs a real visual pass in a browser; contrast on the core palette checks out (body 19:1 AAA, muted 5.3:1 AA).
- **Note:** `muted` text in **dark** mode is 3.55:1 — below WCAG AA for body copy. Pre-existing, not introduced here, but worth fixing.

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
- **`✅ DONE`** ~~The sidebar shows real icons instead of the generic hash glyph.~~ Live for **`3d-tools`** and **`accessibility`**; the other 35 categories keep the hash fallback.
- **`DECIDED` Adding a category icon is two steps:** drop a transparent monochrome PNG at `/public/icons/<slug>.png`, then add the slug to `CATEGORY_ICON_SLUGS` in `tools.js`. The path is derived from the slug — there is no separate path map to keep in sync.
- **`DECIDED` Category icons are painted as CSS masks filled with `currentColor`**, not as `<img>`. One monochrome asset then works in both themes automatically, matching the inline SVGs which use `stroke="currentColor"`.
- **`DECIDED` Icon exports must be checked before use — two failure modes seen so far, both silent:**
  1. **Opaque ground** (`3d Software.png`): alpha 100% everywhere with `#0D0D0D` baked in. Blends into dark mode, shows as a black tile in light mode.
  2. **Half-opaque artwork** (`accessibility.png` as supplied): genuinely transparent, but peaked at 50% alpha, so the mask rendered washed out against the nav text.
  Fix for both is the same: normalise alpha to the full range (stripping an opaque ground first if present). **Originals are committed before processing** so the raw export stays recoverable.
- **Gotcha on record:** the supplied `3d Software.png` was **fully opaque with a `#0D0D0D` background baked in** — no real transparency. Dropped in as-is it blends into dark mode but shows as a black tile in light mode. `public/icons/3d-tools.png` is derived from it by taking alpha from normalised luminance. **Any future category icon needs the same treatment** unless it is exported with a genuine alpha channel.
- **Note:** there are **37 categories** in the sheet; **2 have icons**. Full coverage is 35 more assets, each needing a transparent, full-opacity monochrome export.
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

**Newly dead as a result:** `renderCategoryIndex()` and `renderCategoryList()` in `tools.js` (defined, never called, and their markup no longer exists anywhere); the optimised testimonial avatars in `public/avatars/` and the two illustration WebPs are now unreferenced (~175 KB, harmless); the homepage-only sections of `script.js` (hero shine, category cloud, featured section) no longer run anywhere, though `script.js` is still used by 7 other pages.

---

## Superseded

- **`SUPERSEDED` Annual ₹2,999/year subscription** (Supabase + Lemon Squeezy, UI-only gate, `/pricing/` takeover). Replaced by the go-free decision in §1.
- **`SUPERSEDED` Monthly ₹1,499/month subscription.** Implemented 2026-08-24 across `auth/config.js`, `pricing/index.html`, and `account/account.js`, then superseded within the same session by the go-free decision. **The code carrying it was deleted wholesale in the paywall removal** — it lives on only in commit `ba59688`.
- **Lesson worth keeping:** `auth/config.js` was the single source of truth for the displayed price — `pricing.js` overwrote the HTML at runtime, so editing the HTML alone did nothing. Worth remembering if any other value turns out to be JS-injected.
