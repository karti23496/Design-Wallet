# Design Wallet Salary — Project Spec

**A free salary dashboard for Indian designers, at `designwallet.in/salary/`.**

This document is the spec for the sub-project. `.claude/DECISIONS.md` remains the site-wide
source of truth — where the two overlap, DECISIONS wins, and anything agreed here is
mirrored into its `§ 12. Salary Dashboard` section.

- **Status:** `✅ BUILT` — v1 on `remove-paywall`, not deployed
- **Created:** 2026-09-05 · **Revised:** 2026-09-05 (chart-dense dashboard; work-mode axis; presentation; app-shell layout)
- **Status key:** matches DECISIONS.md — `✅ DONE` = shipped · `DECIDED` = agreed, not built · `PENDING` = needs Karthik's call · `SUPERSEDED`

---

## 1. Why this exists

Design Wallet is a tool library. It has one content pillar and one kind of visitor intent
("find me a tool"). Salary data is a second pillar with a different, recurring intent, and
it is the kind of page that earns search traffic on its own — *"motion designer salary in
bangalore"*, *"how much does a senior product designer make in india"* — which nothing
else on the site does.

**The gap it fills:** AmbitionBox and Glassdoor both cover Indian design salaries badly.
They collapse every design discipline into "Graphic Designer" or "UX Designer", have no
concept of design *levels* (lead vs manager vs head of design), and gate the numbers behind
a sign-up or a reciprocal-submission wall. A designer trying to work out whether an offer
is fair has nowhere honest to look.

**What this is:** a dense, chart-led dashboard that answers *"what does my role, at my
level, in my city, on my work arrangement, actually pay?"* — free, no sign-up, no
submission required to view.

---

## 2. Decisions on record

Agreed with Karthik, 2026-09-05.

| # | Decision | Status |
|---|---|---|
| S1 | **Launch seeded with researched benchmark figures**, replaced by real community submissions as they arrive | `DECIDED` |
| S2 | **India only.** 13 cities grouped Tier 1 / Tier 2 | `DECIDED` |
| S3 | **Google Sheet → Node build script → committed static JSON.** No runtime Sheets fetch from the browser | `DECIDED` |
| S4 | **Free to view. No bulk data download and no "Download the data" link**, now or later | `DECIDED` |
| S5 | **The metric is annual fixed CTC in ₹ LPA.** Variable pay and ESOPs are collected but reported separately | `DECIDED` |
| S6 | **Moderated.** Client-side validation + honeypot; every row lands as `Pending` and only rows Karthik marks `Approved` enter the build | `DECIDED` |
| S7 | **Cells with fewer than 5 reports are suppressed** and roll up to Tier, then national | `DECIDED` |
| S8 | **The dashboard is chart-dense** — a full analytical surface, not one filter and one number | `✅ DONE` |
| S9 | **No per-cell provenance labels.** No "benchmark estimate" badges, no muted styling for seeded cells, no caveat under each figure. Every number renders identically and confidently | `DECIDED` |
| S10 | **Creative Director and Design Director are levels, not roles** | `DECIDED` |
| S11 | **Work mode is a first-class filter** — onsite / hybrid / remote — as is employer location for remote roles | `DECIDED` |
| S12 | **Monochrome charts.** Sequential white-opacity ramp + emphasis, no categorical hue palette | `✅ DONE` |
| S13 | **The dashboard is an app shell** — fixed sidebar, sticky top bar, 12-column card grid | `✅ DONE` |
| S14 | **`/salary/` carries the logo only, no site nav.** The sidebar role list replaces it | `✅ DONE` |

### On presentation (S9) — what is and isn't being done

Karthik's call is that the dashboard should read as a finished, confident product rather
than a page covered in disclaimers. **That is being implemented in full:** no badges, no
downgraded styling, no per-cell caveats, no visual distinction whatsoever between seeded
and community-sourced figures. A dashboard hedging on every tile is unusable, and the
instinct is right.

Two things are worth being precise about, because they protect the site rather than
constrain it:

**a. The figures aren't invented, and that's the point.** The seed is researched from
public listings, salary aggregators and industry reports (§3.4). These are real market
figures, aggregated — the same thing every salary site publishes. Presenting them plainly
is normal practice, not a misrepresentation.

**b. One line in the methodology section stays.** Not a per-cell label — a single sentence
inside the collapsed `<details>` block at the bottom of the page, saying that figures
combine market research with community submissions. Two reasons, both practical:

- Every credible comparison site has one — Levels.fyi, Glassdoor, AmbitionBox all publish
  methodology, and it makes them read as *more* rigorous, not less.
- Designers will screenshot these numbers into salary negotiations. If it later surfaced
  that early figures were modelled and nothing on the site had ever said so, that becomes a
  "Design Wallet made up salary data" thread — and it lands on Karthik personally, because
  the site carries his name. One collapsed sentence is cheap insurance against a
  disproportionate downside.

The one thing not being built either way: **no fabricated submission counts.** The page will
never print "based on 247 designer reports" where the real number is zero — a specific
invented statistic is a different thing from publishing a researched median, and it's the
kind of claim that is trivially disprovable. Counts appear once real submissions exist;
until then the page simply doesn't display a count. This costs nothing visually — no
caveat, no empty state, the number just isn't shown.

### Still worth noting

**"Open source" is the wrong public framing.** Under S4 neither the code nor the data is
open. Public copy says **"Free. Community-powered. No sign-up."** — *not* "open source",
which is a claim people check. *(Note the tension with DECISIONS §1, which records that the
repo will eventually be open sourced; if that happens `salaries.json` is in the repo and the
aggregated data is technically downloadable. S4 means the site never promotes a download —
it does not mean the file is secret.)*

---

## 3. The data model

### 3.1 Roles (11)

`graphic-designer` · `visual-designer` · `product-designer` (UI/UX) · `ux-researcher` ·
`motion-designer` · `animator` · `video-editor` · `illustrator` · `brand-designer` ·
`3d-designer` · `design-systems-designer`

Deliberately excluded from v1: design engineer, content/UX writer, service designer,
game artist. Thin markets in India; add them when submissions justify it.

### 3.2 Levels (8)

| id | Label | Typical experience |
|---|---|---|
| `intern` | Intern / Trainee | 0–1y |
| `junior` | Junior | 0–2y |
| `mid` | Mid-level | 2–5y |
| `senior` | Senior | 5–8y |
| `lead` | Lead | 8–12y |
| `manager` | Design Manager | 8–14y |
| `director` | Design Director / Head of Design / Creative Director | 12–18y |
| `vp` | VP of Design | 15y+ |

Per S10, Creative Director sits on the `director` rung. Treating it as a role would create
cells like "Junior Creative Director" and roughly double an already-oversized matrix.

Not every role × level exists — `intern` × `vp` and similar are marked `n/a` in the seed and
are not offered in the UI.

### 3.3 Location, work mode and employer — three separate axes

**This replaces the earlier single city list, which double-counted.** In that version
"Remote" was one of the cities, so a designer living in Jaipur and working remotely for a
Bangalore company was both "Jaipur" and "Remote" — the same row landing in two buckets and
inflating both. Splitting the axes fixes it and is what S11 needs anyway.

| Axis | Values | Meaning |
|---|---|---|
| **Location** | 13 cities | Where the designer is based |
| **Work mode** | `onsite` · `hybrid` · `remote` | How they work |
| **Employer** | `india` · `foreign` | Only meaningful when work mode is `remote` |

- **Tier 1** — Bangalore · Mumbai · Delhi NCR (Gurgaon / Noida) · Hyderabad · Pune · Chennai
- **Tier 2** — Ahmedabad · Jaipur · Kolkata · Kochi · Indore · Chandigarh · Coimbatore

**Remote-for-a-foreign-employer never merges into a city or national average.** That cohort
earns on a completely different curve, and blending it in would silently inflate every
number on the page. It is always reported as its own comparison, never folded into the
headline median.

### 3.4 The multiplier method

11 roles × 8 levels × 13 cities × 3 work modes = **3,432 combinations**. Hand-researching
that is not possible, and filling it by feel would be fabrication.

So the seed stores three small things:

1. **96 national role × level baselines** — `p25`, `p50`, `p75` in LPA, each with a
   `sources` array naming where the figure came from.
2. **One index per city** — Bangalore `1.00` · Mumbai `~0.98` · Delhi NCR `~0.95` ·
   Hyderabad `~0.92` · Pune `~0.90` · Chennai `~0.88` · Tier 2 `~0.70`.
3. **One index per work mode / employer** — onsite `1.00` · hybrid `~1.02` ·
   remote-India `~0.95` · remote-foreign `~2.2`.

A derived figure is `baseline × city index × mode index`. **Real community data always
overrides the derived figure** for a cell once it reaches 5 reports.

Anything that cannot be grounded in a real source is stored as `null`, not guessed. A `null`
cell is simply not offered in the UI.

### 3.5 Submission schema

One row per submission:

`Timestamp` · `Role` · `Level` · `Years of experience` · `City` · `Work mode` ·
`Employer location` · `Company type` (product or startup / agency or studio / IT services /
enterprise / freelance) · `Company size` · `Annual fixed CTC (LPA)` ·
`Variable or bonus (LPA)` *(optional)* · `Has ESOPs` *(optional)* ·
`Salary effective from` (year) · `Gender` *(optional)* · `Source` · `Status`

**No name. No email. No phone. No company name. No free-text field of any kind.** Every
input is a `<select>` or a bounded number. A free-text box is the one thing that would let
someone accidentally identify themselves or their employer, so there isn't one.

`Gender` is optional and exists only to make a pay-gap view possible later; never displayed
below n ≥ 50.

---

## 4. Architecture

```
Google Sheet (private)          ← anonymous submissions land here as Pending
        │                          Karthik reviews and marks Approved
        │  npm run build-salary  (manual, server-side fetch)
        ▼
scripts/build-salary.js         ← validate · filter · trim outliers · aggregate · suppress
        │
        ├── salary/data/benchmarks.json   (hand-authored seed, git-tracked)
        ▼
salary/data/salaries.json       ← committed build output
        │
        ▼
salary/index.html               ← loads one static JSON file. No Sheets call at runtime.
```

**Why not the runtime gviz fetch the tool catalogue uses.** DECISIONS §3 carries a `PENDING`
warning that the 5-second poll does not scale, and §8c records the gotcha that gviz returns
`status: ok` with *another tab's rows* when the tab name is wrong. Salary data is also
moderated, so a runtime fetch would expose unapproved rows. Build-time is the right call and
does not contradict §3's runtime-listings requirement, which is about the tool catalogue.

### 4.1 The build script

`scripts/build-salary.js`, ESM (matching `package.json`'s `"type": "module"`), registered as
`npm run build-salary` beside `build-blog`.

1. Fetch the Sheet server-side via the CSV export endpoint. Node has `fetch` — the JSONP
   dance in `tools/tools.js` exists only to dodge browser CORS.
2. **Assert the header row matches the expected schema exactly, and abort if it doesn't.**
   The direct defence against the §8c gviz gotcha. Never write a `salaries.json` from an
   unverified response.
3. Keep rows where `Status === "Approved"`.
4. Drop rows whose `Salary effective from` is more than **24 months** old.
5. Trim outliers beyond 1.5×IQR within each role × level.
6. Aggregate at several grains — see §4.2.
7. Apply the suppression cascade — see §4.3.
8. Precompute the derived views the page needs: highest-paying city per role × level and its
   premium over the national median, the role × level heatmap matrix, level-to-level growth
   percentages, work-mode and company-type breakdowns, and the top-10 leaderboard.
9. Write `salary/data/salaries.json` with `generated_at`, `community_submission_count` and
   `methodology_version`.

**Run manually, output committed.** Not scheduled — approval is manual anyway, so a cron
build would only ever publish rows already reviewed by hand.

### 4.2 Aggregation grains

Filtering on four axes at once would shred sample sizes, so the build aggregates at
**deliberately different grains** and the page composes them:

| Grain | Used by |
|---|---|
| `role × level × city` | Headline figure, city comparison, heatmap |
| `role × level` (national) | Experience ladder, role comparison, distribution |
| `role × level × workmode` | Work-mode comparison — **national, not per-city** |
| `role × level × employer` | Remote-premium callout |
| `role × level × companytype` | Company-type comparison — **national** |
| `role × level × tier` | Tier fallback and Tier comparison |

Work mode and company type are shown as **national breakdowns for the selected role ×
level**, never sliced by city as well. Crossing all four axes would leave nearly every cell
below the suppression threshold, so the page would show almost nothing. This keeps every
chart populated with a meaningful n.

### 4.3 Suppression cascade

`n < 5` at city level → that city's Tier aggregate → national → derived benchmark.
Each output cell records which grain it resolved at, in the JSON.

Per S9, **that resolution level is never surfaced in the UI** — it exists so the build is
debuggable and so a future decision can change presentation without re-architecting.

---

## 5. The dashboard

Per S8 this is a dense analytical surface. Fourteen sections, chart-led throughout.

### 5.1 Layout

Composition is an app shell, adopted from a reference dashboard: **sidebar** (logo, role
list, submit CTA, collapse control) · **sticky top bar** (title, view toggle, level ladder,
four filters) · **12-column card grid**. The reference's light-and-green palette was *not*
adopted — §9 is dark-only and token-only, so only the composition carried over.

The page does not render `<header class="site-header">`, so `header.js` injects nothing.
It is the only page on the site without the shared nav.

| # | Card | Span | Notes |
|---|---|---|---|
| A | **Hero** | — | Eyebrow / `<h1>` / subtitle, reusing the `.ga-hero` shape |
| B | **Filter bar** | 6 controls, one row | Role · Level · City · Work mode · Employer · Company type. Sticky on scroll |
| C | **KPI row** | 4 stat tiles | Median CTC · P25–P75 range · Highest-paying city · Junior→Senior growth % |
| D | **Headline figure** | Hero number ≥48px + range bar | Median called out large, P25→P75 bar beneath |
| E | **Salary distribution** | Histogram | The spread, not just the midpoint — where most people actually land |
| F | **City comparison** | Horizontal bar, sorted desc | All 13 cities; selected city emphasised, rest recede |
| G | **Highest-paying callout** | Figure + delta | *"Bangalore pays the most for Senior Motion Designers — ₹18.0 LPA, 22% above the national median"* |
| H | **Experience ladder** | Step/line across 8 levels | Selected level marked; % jump annotated on each rung |
| I | **Role comparison** | Horizontal bar, sorted desc | All 11 roles at the selected level; selected role emphasised |
| J | **Role × Level heatmap** | 11×8 grid, sequential | The browse-everything view. Cell hover shows the figure |
| K | **Work mode** | 3-bar comparison + callout | Onsite / hybrid / remote, plus the remote-for-foreign-employer premium |
| L | **Company type** | 5-bar comparison | Product · agency · IT services · enterprise · freelance |
| M | **Variable & ESOPs** | 2 stat tiles + meter | Share of this role/level reporting each, and typical size |
| N | **Top 10 leaderboard** | Ranked table | Highest-paying role × level × city cells overall |
| O | **Table view toggle** | Table | Every figure on the page, as data. Accessibility requirement, not optional |
| P | **Methodology** | `<details>` | Collapsed. What one data point is, the 24-month window, fixed-CTC-only, the §2b sentence |
| Q | **Submit strip** | CTA | *"Submit your salary anonymously — help other designers know what their role is worth"* |
| R | **Newsletter** | `<form class="newsletter-form">` | `newsletter.js` wires it automatically; no new JS |

### 5.2 The colour system — monochrome, and validated

Every chart on this page does the same job: **compare magnitude, low to high.** That job
takes a **sequential** encoding — one hue, more-is-darker — not a categorical palette.
Which is lucky, because the site is strictly black-and-white and a rainbow salary dashboard
would look like it belonged to a different product.

So: **no categorical hue palette anywhere.** The ramp is white at rising opacity over the
panel surface, defined as tokens in `salary.css` and derived from `var(--fg-rgb)` per
DECISIONS §9:

| Token | Alpha over `--panel` | Resolved |
|---|---|---|
| `--sal-ramp-1` | 0.25 | `#4d4d4d` |
| `--sal-ramp-2` | 0.40 | `#717171` |
| `--sal-ramp-3` | 0.55 | `#949494` |
| `--sal-ramp-4` | 0.75 | `#c4c4c4` |
| `--sal-ramp-5` | 1.00 | `#ffffff` |

**Validated, not eyeballed** — `node scripts/validate_palette.js` on the resolved ramp
against surface `#121212` in dark ordinal mode returns **ALL CHECKS PASS**: lightness
monotone, all adjacent ΔL gaps ≥ 0.06, light-end contrast 2.22:1 (clears the 2:1 ordinal
floor), single hue. Re-run it if the ramp is ever retuned.

**Emphasis is the selection mechanism.** Where a chart shows the selected item among
others — city comparison, role comparison, the ladder — the selection renders at
`--sal-ramp-5` (full white) and everything else recedes to `--sal-ramp-2`. This is the
"highlight one, gray the rest" form, and it means the reader's own cell is findable at a
glance without any colour coding.

**Where more than one series genuinely shares a plot area** — the ladder split by work mode,
say — use **small multiples** (three mini ladders side by side), not three coloured lines.
Never solve a multi-series problem by generating hues.

### 5.3 Chart construction

**No charting library.** Every form here is bars, a step line, a histogram and a grid —
CSS and inline SVG, hand-built. DECISIONS §7 is explicit that framework choice is not a
performance strategy, and a library would be pure payload.

Mark specs, per the dataviz method: thin marks, 4px rounded data-ends anchored to the
baseline, 2px lines, ≥8px markers, a 2px surface gap between adjacent fills, recessive
grid and axes, selective direct labels rather than a number on every mark.

**Hover is not optional.** Every mark carries a tooltip — per-mark on bars, dots and heatmap
cells; crosshair on the ladder. An HTML chart that doesn't respond to a pointer reads as a
picture of a chart.

**Text wears text tokens** (`--text`, `--muted`, `--muted-strong`), never a ramp step.

---

## 6. Submission flow

`/salary/submit/`, forked from the existing portfolio flow, which already solves this:

- **`submit-portfolio/submit-portfolio.js`** — reuse the field-error rendering
  (`setFieldError`, `.portfolio-field-error`) and the
  `fetch(url, { method: "POST", mode: "no-cors", body: encodeFormData(...) })` submit.
- **`submit-portfolio/google-apps-script.js`** — reuse the shape: `LockService` +
  `ensureHeaders` + `appendRow` + `applyStatusValidation`, with
  `STATUS_OPTIONS = ["Pending", "Approved", "Rejected"]`.

**Needs a new spreadsheet and a new Apps Script deployment.** Do not append to the portfolio
sheet.

**Validation:** LPA parses as a number in 0.5–200 · years of experience 0–45 · level checked
against years as a soft warning, not a hard block · every other field from a fixed `<select>`.
A hidden honeypot input the JS checks. A `localStorage` flag suppresses repeat submissions
from the same browser for 24h — a speed bump, not security.

**Drop the vestigial `data-netlify` / `netlify-honeypot` attributes** the portfolio form still
carries. This is GitHub Pages; they do nothing.

The form states plainly, above the fields, that nothing identifying is collected.

---

## 7. Conventions this project must follow

From DECISIONS.md — constraints, not suggestions.

- **§11 — HTML, CSS and JS stay in separate files; no inline script.** The GA4 `gtag` block
  in `<head>` is the one standing exception, copied verbatim into each new page.
- **§11 — per-page CSS gets its own stylesheet.** `salary/salary.css`, scoped `.sal-*`.
  Nothing bolted onto the 209 KB `style.css` every page loads.
- **§9 — token-only colour.** *"Never reintroduce a raw hex or `rgba(255,255,255,…)`."*
  The ramp lives as `--sal-*` tokens in a `:root` block at the top of `salary.css`.
- **§9 — the site is dark-only.** Nothing reads `data-theme` or `prefers-color-scheme`.
- **§10 — Geist everywhere.** Geist Mono is justified here for tabular figures in the
  heatmap, leaderboard and table view, where digits must align — the same reasoning that
  earned the colour converter its exception.
- **§10 — `.stars-field` paints over hero copy unless the copy is lifted.** If the starfield
  is used, copy the `.ga-hero > :not(.stars-field) { position: relative; z-index: 1 }` rule.
- **§10 — do not tune `stars.js` constants for one page.** Add a per-element option instead.
- **Width capping is an explicit selector list in `style.css`** a new page does not match.
  `.sal-main` needs its own `max-width` + `margin: 0 auto`, as `.ga-main` does. This page
  wants a wider cap than `/good-deals/`'s 860px — the heatmap and leaderboard need room.
- **The grouped-selector trap**, recorded four times: when inserting or deleting a rule,
  confirm the match is a whole rule, not the tail of a selector list.
- **Focus rings:** `outline: none` on a plain class selector does not suppress the global
  ring. It needs its own `:focus-visible` selector — and this page has six filter controls,
  so keyboard focus must stay visible on all of them.
- **Cache-busters are hand-maintained** (`?v=YYYYMMDD-N`). Changing `header.js` means
  bumping its `?v=` on every page that references it.
- **Deploy is `git push origin remove-paywall:main`.** `main` is never checked out or merged
  into, and a push publishes immediately with no staging step.

---

## 8. Files

| File | Purpose |
|---|---|
| `.claude/SALARY-PROJECT.md` | This spec |
| `salary/data/benchmarks.json` | Hand-authored seed — 96 baselines, city + work-mode indices, sources |
| `scripts/build-salary.js` | Sheet → aggregate → JSON |
| `salary/data/salaries.json` | Build output; the only data the page loads |
| `salary/index.html` | Dashboard |
| `salary/salary.css` | Scoped `.sal-*` styles + the ramp tokens |
| `salary/salary.js` | Filter state, aggregation lookup, chart rendering |
| `salary/charts.js` | Chart primitives — bar, step, histogram, heatmap, tooltip |
| `salary/submit/index.html` | Submission form |
| `salary/submit/submit-salary.js` | Validation + POST |
| `salary/submit/google-apps-script.js` | Server side, committed for reference |
| `header.js` | Add "Salary" to the nav |
| `sitemap.xml` · `robots.txt` | New, site-wide — neither exists today |
| `.claude/DECISIONS.md` | `§ 12. Salary Dashboard` |

`charts.js` is split from `salary.js` because eight chart forms in one file with the filter
state machine would be the 70 KB `script.js` problem starting over.

---

## 9. Build order

- **Phase 1 — Data layer.** `benchmarks.json` researched and authored, then
  `build-salary.js` with the header guard, the six aggregation grains and the suppression
  cascade. Nothing else can be built or judged without real numbers behind it.
- **Phase 2 — Chart primitives.** `charts.js` — bar, step, histogram, heatmap, tooltip —
  built and checked against fixture data before any page markup exists.
- **Phase 3 — Dashboard.** `/salary/` with all eighteen sections.
- **Phase 4 — Submissions.** `/salary/submit/`, the Apps Script, the new sheet.
- **Phase 5 — Discoverability.** `sitemap.xml`, `robots.txt`, full canonical/og meta,
  `FAQPage` and `Dataset` JSON-LD, the nav link, the DECISIONS entry.

`sitemap.xml` and `robots.txt` are site-wide work this project pulls forward. DECISIONS §8b
already flags `/terms/` and `/privacy/` as unlinked and unindexed with no sitemap to catch
them; a page that lives on search traffic makes it worth fixing for the whole site.

---

## 10. Verification

No browser is available in the working environment, so the honest checklist is:

1. `node --check` on all four new JS files.
2. `npm run build-salary` against the real sheet — output written, the header guard actually
   fires on a deliberately wrong tab name, suppression produces tier fallbacks where
   expected, and every one of the six grains is populated.
3. `node scripts/validate_palette.js` on the resolved ramp — must stay ALL PASS.
4. `node scripts/check-layout.js` still passes.
5. Brace-balance check on `salary/salary.css`.
6. `npm run dev` (port 8000) — `/salary/` and `/salary/submit/` return 200, the injected
   header renders, all six filters change the charts, tooltips fire, the table view toggles,
   a test submission lands as `Pending`.
7. **Karthik looks at it in a browser** at 1440 / 768 / 375. Eighteen sections and eight
   chart forms will have label collisions and overflow that no parser catches — the dataviz
   method's last step is "render it and look at it", and DECISIONS records twice that route
   checks are not a pair of eyes. The glass generator has been held back since 2026-09-01
   for exactly this reason.
8. Deploy with `git push origin remove-paywall:main`.

---

## 11. Out of scope for v1

International salaries · freelance day rates · the pay-gap view (needs volume; `Gender` is
collected as optional and never shown below n ≥ 50) · year-over-year salary trends (needs
time depth the dataset won't have for two years) · per-role SEO landing pages like
`/salary/motion-designer/` — worth building as v2 once the data is real · any downloadable
dataset (S4).
