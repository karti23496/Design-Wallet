---
description: Add a new consolidated version to the Design Wallet changelog (/changelog/)
argument-hint: "[major | vX.Y] [optional notes on what to highlight]"
---

Add ONE new version to the changelog page at `changelog/index.html`, covering everything that changed on the Design Wallet website since the previous version. This is the only time the changelog gets updated — never add small entries as individual changes are made.

Arguments: $ARGUMENTS

## 1. Work out the version number

- Read the first `<li class="cl-entry">` inside the first `<section class="cl-major">` in `changelog/index.html`. Its `.cl-version` is the current version, and its `data-through` is the last day it covers.
- Default: bump the minor number (v2.1 → v2.2).
- If the arguments say `major`, bump the major number and reset minor (v2.1 → v3.0).
- If the arguments give an explicit version (e.g. `v3.0`), use it, as long as it is higher than the current one.
- The date is today's date.

## 2. Gather what changed since the previous version

Everything after the previous entry's `data-through` date:

- `git log --since=<day after data-through> --format="%ad %s" --date=short`, plus uncommitted work in `git status`.
- `.claude/DECISIONS.md`: entries marked `✅ DONE` with dates in the window, and the Implementation Log.
- Only include what a visitor can see or use: new pages, tools, features, content and visible improvements. Leave out internal work such as refactors, build scripts, cache-busters, decision-log edits and bug fixes nobody would notice.

## 3. Write one consolidated entry

The format is always **Version · Date · Title · Description**:

- **Title**: one short headline for the release's biggest change, in sentence case (e.g. "Know your money: what designers actually earn").
- **Description**: one plain-language sentence or two, then a `<ul>` of 3–6 bullets. Each bullet opens with a `<strong>` phrase naming the change.
- If one update in the window deserves to stand out on its own, give it a block inside the same entry: `<h4 class="cl-subhead">…</h4>`, a sentence, and bullets, after the main list (see Hot trends in v2.1).
- Write for designers visiting the site, not for developers. No file names, class names or internal jargon.
- Show the draft title, description and version to the user and get their OK before editing the page.

## 4. Take the screenshot

Bump `DW_VERSION` in `header.js` (step 5) **before** capturing, or the screenshot's nav capsule shows the previous version.


Pick the one page that best shows the release's headline change, then run:

```
npm run changelog-shot -- <route> <version>
```

e.g. `npm run changelog-shot -- /salary/ v2.2`. This writes `public/changelog/v2-2.webp` (1440×900). Open the image and check it shows the right thing: not a "not found" state, a loading spinner or an empty grid. Retake it if it does.

## 5. Insert the entry

The page is grouped by major version: one `<section class="cl-major" id="version-N">` per major, headed `<h2 class="cl-major-title">`, with the newest major first. Inside each group, the `<ol class="cl-list">` holds that major's releases, newest first.

- **Same major** (v2.1 → v2.2): insert the new `<li>` as the FIRST child of that group's `.cl-list`. **The heading is not touched** — the constellation name belongs to the major, not the release.
- **New major** (v2.x → v3.0): add a new `<section class="cl-major" id="version-3" aria-labelledby="version-3-title">` above all the others, with a `.cl-list` holding just the new `<li>`, and a heading carrying **the next constellation name from the list below**:

The heading format is **`V<major>.0 <constellation>`** — no "Version", no separator, and always `.0` even though the group holds v3.1, v3.2 and so on:

```html
<h2 class="cl-major-title" id="version-3-title">V3.0 <span class="cl-major-name">Lyra</span></h2>
```

### Constellation names (Karthik's call, 2026-09-16)

Every major version is named after a constellation. Take the next unused name in
order — do not invent one, and do not reorder the list:

| Heading | Name | |
|---|---|---|
| V1.0 | **Orion** | the hunter — the constellation everyone learns first |
| V2.0 | **Ursa** | the great bear; its Plough points to the pole star |
| V3.0 | **Lyra** | the lyre, carrying Vega |
| V4.0 | **Cygnus** | the swan, flying down the Milky Way |
| V5.0 | **Carina** | the keel, carrying Canopus |
| V6.0 | **Draco** | the dragon, coiled around the pole |
| V7.0 | **Aquila** | the eagle, carrying Altair |
| V8.0 | **Phoenix** | the bird that returns |
| V9.0 | **Perseus** | the rescuer |
| V10.0 | **Andromeda** | holding the nearest spiral galaxy |

If Version 11 is ever reached, pick another well-known constellation, add it to
this table first, and say which one you chose and why.

Copy the structure of the existing top entry (the title is an `<h3 class="cl-title">`):

- `id` and the title's `href`: the version with a dash, e.g. `v2-2` / `#v2-2`.
- `data-through` and `<time datetime>`: today, `YYYY-MM-DD`. Displayed date as `Sep 15, 2026`.
- Wrap the `<img>` in `<a class="cl-shot-link" href="<the route you screenshotted>" aria-label="Open …">`, so the screenshot opens the page it shows.
- `<img>`: `src="/public/changelog/v2-2.webp"`, a descriptive `alt`, `width="1440" height="900"`, and NO `loading="lazy"` (it is the first image on the page).
- Add `loading="lazy"` to the image of the entry that used to be first on the page.
- Bump the `changelog.css?v=` cache-buster only if the CSS changed.
- **Update the nav capsule:** set `DW_VERSION` at the top of `header.js` to the new version, then bump the `header.js?v=` cache-buster in every page's HTML and in `scripts/build-blog.js`, or visitors keep seeing the old number from cache.

## 6. Verify and record

- Load `/changelog/` in headless Chrome at 1440px and 390px: the new entry is at the top of the right Version group, the image loads, and there is no horizontal overflow.
- Add a dated `✅ DONE` line to `.claude/DECISIONS.md` recording the version, its date, and the window it covers.
- Do not commit unless the user asks.
