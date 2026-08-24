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

- **Status key:** `DECIDED` = agreed, act on it · `PENDING` = needs Karthik's call · `SUPERSEDED` = no longer true, kept for history
- Last updated: **2026-08-24**

---

## 1. Direction & Business Model

- **`DECIDED` The website becomes free for everyone.** No subscriber paywall, no user accounts required to browse.
- **`DECIDED` Revenue comes from paid tool listings, not user subscriptions.** `list-your-tool/` is the business model: free for designers, paid for tools that want placement.
- **`DECIDED` The repository will be open sourced.** "Free" and "open source" are two separate decisions and we're doing both.
- **`DECIDED` `list-your-tool/` stays.** It has no payment integration (a `mailto:` only) and no dependency on the paywall, so it survives untouched.
- **`PENDING` Listing prices are on hold.** The ₹2,999 Spotlight figure is removed for now; ₹1,499 stays visible. Karthik will revisit and give the call. Do not change listing prices without being asked.
- **Noted:** `curated.design` — cited as a layout reference — is *not* free. It runs a $9/month freemium paywall ("16 free of 2,229 sections"). It's a reference for **layout only**, not for the business model.
- **Open question:** the value of a curation site is the curated data, not the code. The catalog lives in a public Google Sheet, so open-sourcing means anyone can clone site + data. Accepted as a deliberate trade-off.

## 2. Site Structure

- **`DECIDED` The catalogue becomes the front door.** `/` *is* the catalogue.
- **`DECIDED` The marketing homepage is removed** — hero, designer-roles strip, bento cards, testimonials, and the waitlist modal all go.
- **Important correction:** the homepage never contained the catalogue. It has a category *name cloud* teaser ([index.html:229](index.html#L229)) linking to `/pricing/`. **The real catalogue lives inside `404.html`** (GitHub Pages serves it for unmatched routes), which hand-rolls three views — category index, category list, tool detail — via `hidden` toggles.
- **`DECIDED` Moving the catalogue out of `404.html` and onto `/` is the actual task.** It is not a deletion job.
- **`DECIDED` Layout reference is `curations.supply`** — title, one line of context, then straight into the links. No marketing preamble.
- **`DECIDED` Keep a short About surface** (a page, or a line in the header) so first-time visitors know what this is.
- **`DECIDED` Once open source, the GitHub link and licence go in the header**, visible upfront.
- **`DECIDED` Blog goes in the primary nav.** Added as `BLOG → /blog/` in `header.js`.
- **Note:** `tools/category/*` are eleven 6-line redirect stubs pointing at `/category/*`. They disappear with file-based routing.

## 3. Data & Backend

- **`DECIDED` Google Sheets stays as the database.** The Sheet remains the editing surface.
- **`DECIDED` Supabase is dropped entirely.** It only ever existed for the paywall (auth + subscription state), not for the catalog.
- **`DECIDED` `scripts/sync-catalog.js` (Sheet → Supabase) is deleted.** It solves a problem we're no longer having.
- **`DECIDED` The Sheet is read at build time, not in the browser.** This removes the per-visitor round trip, makes rate limits irrelevant, and means a Google outage can't break the live site.
- **`DECIDED` The build validates catalog rows and fails loudly on bad data** — this buys back the schema validation we give up by not using a real database.
- **Catalog schema** (from [sync-catalog.js:71-82](scripts/sync-catalog.js#L71-L82)): `slug, title, subtitle, description, categories[], pricing, link, image, thumbnails[]`.
- **Accepted trade-off:** Sheet edits won't be live instantly — up to an hour on a schedule, ~2 minutes via a manual "Publish now" trigger.

## 4. Tech Stack

- **`DECIDED` Migrate to Astro, with React only for interactive islands.** Not a bare React SPA.
- **Reasoning on record:** React was originally proposed to make the site "smooth." That was the wrong diagnosis — the slowness was a 124 MB image payload, and React would have shipped the same images plus ~45 KB of runtime. The real justifications are: a hand-rolled router living in `404.html`, JSONP fetch logic duplicated in 4+ places, and 2,070 lines of imperative DOM code in one file.
- **`DECIDED` The real win is build-time static generation, not the framework.** Today the catalogue is client-rendered inside a 404 page and indexes badly. For a directory that lives on search traffic, that is the problem worth solving.
- **`DECIDED` Carry `style.css` (9,363 lines) over wholesale, unchanged.** Do **not** migrate to Tailwind or CSS modules at the same time — two simultaneous migrations is how rewrites fail.
- **`DECIDED` Keep the old site live until the new one is finished.** Build on a branch, deploy to a preview URL, compare, then switch.
- **Note:** JSONP is only used to dodge browser CORS. At build time in Node, a plain `fetch()` works — all four copies collapse into one module.

## 5. Sequencing

Agreed order. Do not jump ahead — step 1 removes ~40% of the code before Astro starts.

1. **Rip out the paywall** on the current HTML/CSS/JS stack (see §6)
2. **Astro scaffold** — empty shell that deploys, `style.css` copied in untouched
3. **Static pages** — privacy, terms, books, list-your-tool, submit-portfolio, colour converter
4. **Catalogue → build-time static generation** (the SEO and speed win)
5. **Blog** — the Notion pipeline last

- **`DECIDED` Paywall removal happens on a branch, not `main`**, so the full diff can be reviewed before going live.

## 6. Paywall Removal — Manifest

**Delete outright:** `pricing/` · `get-access/` · `account/` · `auth/` · `supabase/` (schema + all 7 edge functions) · `join-waitlist/` · `scripts/seed-user.js` · `scripts/sync-catalog.js`

**Edit, don't delete:**

| File | Change |
|---|---|
| `404.html` | remove `gate.js` + `dw-gate-pending` — **this is the catalogue, handle with care** |
| `tools/index.html` | same |
| `index.html` | strip waitlist modal; repoint "Explore collections" off `/pricing/` |
| `script.js` | delete waitlist logic ([176-294](script.js#L176-L294)) |
| `header.js` | remove `JOIN WAITLIST` + `GET ACCESS`; remove `updateAccessLink()` and the subscriber profile menu |
| `style.css` | drop `.dw-gate-pending` |
| `privacy/`, `terms/` | **rewrite** — subscription/refund clauses become false |

- **`DECIDED` `privacy/` and `terms/` are rewritten, never deleted.** Analytics still runs, so a privacy policy is still required.
- **`PENDING` Favourites.** Recommendation on record: move to `localStorage` and delete the Google login. `favourites.html` has a *second, separate* auth system ([favourites.html:60-65](favourites.html#L60-L65)) unrelated to the Supabase paywall. Trade-off: bookmarks won't sync across devices. Awaiting Karthik's call.
- **`PENDING` Cancel the Lemon Squeezy product and delete the Supabase project** — only *after* the site is confirmed working without them.
- **`DECIDED` `admin/index.html` survives.** Resolved from `README.md`: it's a lightweight helper page that links out to the Google Sheet for managing listings. It's catalog tooling, unrelated to subscribers, so the paywall removal doesn't touch it.

## 7. Performance Standards

Established while fixing a real incident — the homepage was shipping **127 MB** of images. Now **296 KB** (~440× smaller).

- **`DECIDED` No raw source images in the served path.** Ten testimonial avatars were full-resolution DSLR photos (up to 20.1 MB each) rendered as 42×42 circles — 124 MB to draw ten thumbnails.
- **`DECIDED` Avatars are 128×128 WebP** (3× for retina), square-cropped, in `public/avatars/`. Total: 23.4 KB for all ten.
- **`DECIDED` Photos are never PNG.** The waitlist modal image was a 2.57 MB PNG holding a 515k-colour photo → 125 KB WebP.
- **`DECIDED` Below-the-fold images get `loading="lazy"` + `decoding="async"`; every image gets explicit `width`/`height`** to prevent layout shift.
- **`DECIDED` Framework choice is not a performance strategy.** Measure the payload first.

### Known issues, not yet fixed

- **`PENDING` Five hero avatars load from `i.pravatar.cc`** ([index.html:55-59](index.html#L55-L59)) — a third-party demo service, **above the fold**, gating hero paint. Biggest remaining perf win. Replacing them changes who appears in the hero, so it's a content decision.
- **`PENDING` 124 MB of original JPEGs remain in `public/testimonial images/`**, unreferenced. Doesn't affect visitors; bloats every clone and deploy. Deleting won't shrink git history (already ~150 MB).
- **`PENDING` Font typo:** [style.css:170](style.css#L170) reads `font-family: 'giest'` — should be `'Geist'`. Silently falling back to sans-serif today.
- **`PENDING` Two separate Google Fonts stylesheet requests** could be merged into one round trip.
- **`PENDING` Dead code:** the billing-toggle script in `list-your-tool/index.html` (~line 300) references `.pr-billing-toggle`, which doesn't exist in the markup. It early-returns and does nothing.

## 8. Open Source Readiness

- **`PENDING` No `LICENSE` file exists.** Without one, "open source" isn't legally true — default copyright applies and nobody may fork it. Required before publishing.
- **`PENDING` A real `README.md`** — current one is minimal.
- **Verified clean:** `.env` is gitignored, was **never committed**, and holds only Notion keys. A history scan found no service-role keys, Lemon Squeezy secrets, or webhook secrets. **Do not break this.**
- **Note:** the Supabase anon key in `auth/config.js` is safe to expose by design, and dies with the paywall anyway.

---

## Superseded

- **`SUPERSEDED` Annual ₹2,999/year subscription** (Supabase + Lemon Squeezy, UI-only gate, `/pricing/` takeover). Replaced by the go-free decision in §1.
- **`SUPERSEDED` Monthly ₹1,499/month subscription.** Implemented 2026-08-24 across `auth/config.js`, `pricing/index.html`, and `account/account.js`, then superseded within the same session by the go-free decision. **The code still carries this change** — it gets deleted wholesale in §6, so it was not reverted.
- **Note for whoever removes it:** [auth/config.js](auth/config.js) was the single source of truth for the displayed price — `pricing.js` overwrote the HTML at runtime, so editing the HTML alone did nothing. Worth remembering if any other value turns out to be JS-injected.
