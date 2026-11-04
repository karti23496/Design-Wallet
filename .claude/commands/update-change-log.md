---
description: Add a new consolidated version to the Design Wallet changelog (/changelog/)
argument-hint: "[major | vX.Y] [optional notes on what to highlight]"
---

Add ONE new version to the Design Wallet changelog, covering everything that changed on the website since the previous version. This is the only time the changelog gets updated — never add small entries as individual changes are made.

**The changelog is written in Notion** (the Changelog database inside the "Versions-log" page; Karthik, 2026-11-01). `changelog/index.html` is generated from it by `npm run build-changelog`; never edit the versions on that page by hand, the next build overwrites them. A new version goes into Notion as a **Draft**, Karthik reviews and edits it there, and it appears on the site once he sets Status to **Published** and the build runs.

Arguments: $ARGUMENTS

## 1. Work out the version number

- Read the first `<li class="cl-entry">` inside the first `<section class="cl-major" id="version-…">` in `changelog/index.html` (or the newest row in Notion, which may be a Draft not yet on the page). Its `.cl-version` is the current version, and its `data-through` is the last day it covers.
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
- **Description**: one plain-language sentence or two, then a list of 3–6 bullets. Each bullet opens with a bold phrase naming the change.
- If one update in the window deserves to stand out on its own, give it a block inside the same entry: a subhead, a sentence, and bullets, after the main list (see Hot trends in v2.1).
- Write for designers visiting the site, not for developers. No file names, class names or internal jargon.
- Show the draft title, description and version to the user and get their OK before adding it to Notion.

## 4. Take the screenshot

Bump `DW_VERSION` in `header.js` (step 5) **before** capturing, or the screenshot's nav capsule shows the previous version.


Pick the one page that best shows the release's headline change, then run:

```
npm run changelog-shot -- <route> <version>
```

e.g. `npm run changelog-shot -- /salary/ v2.2`. This writes `public/changelog/v2-2.webp` (1440×900). Open the image and check it shows the right thing: not a "not found" state, a loading spinner or an empty grid. Retake it if it does.

## 5. Add the version to Notion

Write the version as JSON in the scratchpad, in the shape described at the top of `scripts/changelog-lib.js`, then run `node scripts/changelog-add.js <file.json>`. It creates the row as a Draft and prints its Notion link.

```json
{
  "version": "v3.1", "majorName": "Pegasus", "date": "2026-11-20", "through": "2026-11-20",
  "title": "…",
  "shot": { "src": "/public/changelog/v3-1.webp", "href": "/salary/", "label": "Open Know your money", "alt": "…" },
  "blocks": [
    { "type": "p", "rich": [{ "text": "One or two plain sentences." }] },
    { "type": "ul", "items": [[{ "text": "Bold phrase.", "bold": true }, { "text": " The rest of the bullet." }]] },
    { "type": "h4", "rich": [{ "text": "A subhead" }] }
  ]
}
```

- **majorName**: the major's constellation. For a version inside an existing major, copy the name already used for it; for a **new major** (v3.x → v4.0), take the next name from the list below. The page renders the heading as `V<major>.0 <name>`.
- **shot**: the screenshot from step 4 (always 1440×900), the route it opens, an `aria-label` ("Open …") and a descriptive alt. Leave `shot` out for a version without one.
- Links inside text are site paths (`"href": "/submit-portfolio/"`).
- Then preview it: `npm run build-changelog -- --drafts` rebuilds the page with drafts included. **Don't leave a drafts build in the working tree for a commit**: run `npm run build-changelog` (published only) before committing, unless Karthik has published it.
- Give Karthik the Notion link to review. He edits there and sets Status to Published.

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

Also:

- Bump the `changelog.css?v=` cache-buster only if the CSS changed.
- **Update the nav capsule:** set `DW_VERSION` at the top of `header.js` to the new version, then bump the `header.js?v=` cache-buster in every page's HTML and in `scripts/build-blog.js`, or visitors keep seeing the old number from cache.

## Publishing (after Karthik sets Status to Published)

Visitors see it straight away: `/changelog/` redraws itself from Notion on every visit through the `changelog-feed` function, about 30 seconds after the edit. The built HTML (for search engines and no-JS visitors) catches up on the daily **Build Changelog from Notion** run. To bring it in sooner, run `npm run build-changelog` locally and commit `changelog/` (and `public/changelog/`), or start that workflow from GitHub's Actions tab.

## 6. Verify and record

- After the drafts build, load `/changelog/` in headless Chrome at 1440px and 390px: the new entry is at the top of the right Version group, the image loads, and there is no horizontal overflow.
- Add a dated `✅ DONE` line to `.claude/DECISIONS.md` recording the version, its date, and the window it covers.
- Do not commit unless the user asks.
