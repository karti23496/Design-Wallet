# Design Wallet Background Remover — Project Spec

**A free, private background remover for designers, at `designwallet.in/dw-tools/background-remover/`.**

This document is the spec for the sub-project. `.claude/DECISIONS.md` remains the site-wide
source of truth — where the two overlap, DECISIONS wins, and anything agreed here is mirrored
into its `§ 16. Background Remover` section.

- **Status:** `✅ BUILT` — v1 on `remove-paywall`, not deployed. Written and built 2026-09-20.
- **Read §17 first.** Building it disproved four things this document asserted, including the
  model file, the browser story and the download size. The sections below are corrected, but §17
  is where the reasoning lives.
- **Status key:** matches DECISIONS.md — `✅ DONE` = shipped · `DECIDED` = agreed, not built · `PENDING` = needs Karthik's call · `SUPERSEDED`
- **Reference explored:** [remove.bg](https://www.remove.bg/) — product surface and API docs read 2026-09-20.

---

## 1. Why this exists

"Remove the background" is the single most searched-for thing a designer does with an image, and
every tool that does it well makes you pay at exactly the moment you have the result in front of
you. remove.bg gives you a **0.25 MP preview** for free and charges a credit for the file you can
actually use. Canva, Photoroom and Adobe Express all gate it behind an account.

The cutout itself is no longer the hard part — open models are at or past remove.bg's quality, and
they run in a browser tab. What nobody free has fixed is the *deal*: full resolution, no account,
no credits, no watermark, no upload.

**The wedge, and it is a real one:** the image never leaves the device. Every competitor uploads
your client's unreleased product shot to their server. This tool runs the model in the tab — which
is also why it can afford to be free forever, and why it fits a static site with no backend
(DECISIONS §3, §4).

**The bar Karthik set:** *"accurate even on complex edges like hair."* That is the whole product.
A tool that clips hair into a helmet is worse than useless — a designer will just go back to
remove.bg. §6 is how we actually hit it, and it is the section to read twice.

---

## 2. What it is, in three claims

These three lines are the page's promise, the marketing copy, and the acceptance criteria. If any
one of them is not true at ship, it does not ship.

1. **Any image, any background.** Drop it in, get a cutout. No settings to understand first.
2. **Hair-accurate.** Soft alpha, not a hard cut. Flyaway strands, fur and motion blur survive, and
   there is no coloured halo from the old background.
3. **Free at full resolution, and private.** Original pixel dimensions, transparent PNG, no
   watermark, no sign-up, no credit counter, and no upload — the file is never sent anywhere.

---

## 3. Decisions on record

Proposed 2026-09-20. Nothing here is agreed with Karthik yet — the `PENDING` rows are the ones that
need his call before a line of code is written. See §16.

| # | Decision | Status |
|---|---|---|
| 1 | The tool ships at `/dw-tools/background-remover/`, as the third entry in `DW_TOOLS` | `DECIDED` — follows DECISIONS §2 |
| 2 | **The model runs in the browser. No backend, no API key, no per-image cost.** | `✅ BUILT` — still the right call, see §5.1 |
| 3 | **BiRefNet-lite (MIT) is the model.** RMBG-1.4 / RMBG-2.0 and `@imgly/background-removal` are ruled out on licence grounds | `✅ BUILT` — licence reasoning held exactly. **Two builds of it are needed, not one** — §17.1 |
| 4 | Weights load on **first use**, never on page load, and are cached for the next visit | `DECIDED` — required by DECISIONS §7 |
| 5 | Full-resolution download is free. **No preview-resolution trap.** | `DECIDED` — follows DECISIONS §1 |
| 6 | Per-tool CSS and JS in the tool's own folder, never bolted onto `style.css` | `DECIDED` — the §11 glass-generator precedent |
| 7 | Stateless. Nothing persisted, no accounts, no history | `DECIDED` — matches the glass generator |
| 8 | A manual **erase / restore brush** ships in v1, not v2 | `✅ BUILT` — Restore means "make opaque", not "back to the model's value", §17.4 |
| 9 | Weights are served from the Hugging Face CDN, not committed to the repo | `✅ BUILT` — pinned by revision hash, and stale copies are pruned |
| 10 | Name is "Background Remover" — literal, because this is a search-traffic page | `✅ BUILT` |
| 11 | **The runtime version is pinned by measurement, not by "latest"** | `✅ BUILT` — a wrong version returns an empty mask *silently*, §17.2 |
| 12 | **`?engine=cpu` / `?engine=gpu` force a backend** | `✅ BUILT` — added because a GPU can produce a wrong mask without erroring, §17.3 |

---

## 4. What remove.bg does — and what we take

Read off the product and the API docs, 2026-09-20.

**Their surface:** auto removal on upload; a "Magic Brush" for manual erase/restore; background
replacement with colour or image; white-background export for e-commerce; type detection
(`auto / person / product / car / animal / graphic / transportation`); crop, scale, position and
region-of-interest; shadow generation; semitransparency handling; PNG / JPG / WebP / ZIP output;
12 MB and 50 MP input ceilings; API, Photoshop extension, desktop and Android apps.

**Their business model, which is the thing to beat:** free gives you a low-resolution preview. The
full-resolution file costs a credit. Output resolution is metered — `small` / `medium` / `large` /
`50MP` — and PNG is capped at 10 MP even when you pay.

| remove.bg feature | Us | Why |
|---|---|---|
| One-click auto removal | ✅ v1 | The whole product |
| Magic Brush (erase / restore) | ✅ v1, called **Touch up** | No model is right 100% of the time. Without it, a 95%-good cutout is a dead end |
| Background: solid colour | ✅ v1 | Trivial once alpha exists, and it is what e-commerce shots need |
| Background: your own image | ✅ v1 | Same compositor, one more source |
| Background: blur the original | ✅ v1 | Cheap, and the most-used "portrait" look |
| Semitransparency / edge handling | ✅ v1, as **Edge controls** | This is the hair promise, see §6 |
| Auto-crop to subject + margin | ✅ v1.1 | We get the subject bounding box free from the alpha |
| PNG / JPG / WebP output | ✅ v1 | PNG for transparency, JPG when a background is set, WebP for weight |
| Type detection (person/car/…) | ❌ | BiRefNet is class-agnostic — it segments the salient object whatever it is. Their type switch exists because their older models were class-specific |
| Shadow generation | ⏳ v2 | Real work to do well, and faked shadows look faked |
| Batch upload | ⏳ v2 | Straightforward once v1 is stable — queue + client-side ZIP |
| Image URL input | ⏳ v2 | Needs a CORS proxy, which means a backend. See §15 |
| API, Photoshop plugin, desktop app | ❌ | Not what Design Wallet is |
| Credits, preview-resolution cap, watermark | ❌ **Never** | This is the point |

---

## 5. Architecture

### 5.1 The call: in-browser inference

| | In-browser (recommended) | Hosted API behind a proxy |
|---|---|---|
| Marginal cost per image | **₹0** | ~₹2–18, unbounded, paid by us |
| Backend | none — stays a static site | a serverless function + key management + rate limiting + abuse handling |
| Privacy claim | **"never leaves your browser"** | "we upload your image to a third party" |
| First-use cost | ~95 MB of weights, once | none |
| Speed after load | 1–4 s on WebGPU, 10–40 s on the WASM fallback | 2–5 s, always |
| Fits DECISIONS §1/§3/§4 | yes | no — reintroduces the backend we just deleted |

**Recommendation: in-browser.** A free site with no per-user revenue cannot carry a per-image bill
that scales with its own success; the first time this page gets traffic, an API bill arrives. The
privacy line is also the only thing here that remove.bg structurally cannot copy.

**The honest cost:** a ~95 MB download the first time someone uses it, and a slow path on browsers
without WebGPU. §10 is how that is made survivable. If Karthik will not accept the 95 MB, the
answer is not a smaller, worse model — it is the API, and then the tool is not free forever. That
is the trade, and it is his call.

### 5.2 The model, and the licence trap

The three obvious candidates are not equally usable. **The repo is going open source
(DECISIONS §1, §8), and the site is commercial** — that rules out two of them outright:

| Model | Licence | Verdict |
|---|---|---|
| **BiRefNet-lite** (`ZhengPeng7/BiRefNet_lite`) | **MIT** | ✅ **Use this.** Commercial use fine, open-source-repo-safe, attribution only |
| BRIA RMBG-1.4 / RMBG-2.0 | CC BY-NC 4.0 | ❌ Non-commercial. Commercial use needs a BRIA agreement |
| `@imgly/background-removal` (the easy npm drop-in) | AGPL-3.0 | ❌ AGPL would reach the whole site's source. Their commercial licence is paid |

This is not a nuance to discover after the tool is built. **Ship the MIT notice and the BiRefNet
citation on the page** (a line in the FAQ/credits block is enough) and the obligation is met.

BiRefNet is also simply the right model for the brief — it is built for *dichotomous* high-
resolution segmentation, which is the task where hair, fur and thin structures are the benchmark,
rather than for cheap portrait masking.

**Weights to use:** ONNX, fp16, 1024×1024 input (~94–110 MB). A 512×512 variant (~94 MB fp16)
is the low-memory fallback. Exact file, revision hash and SHA are pinned at build time — a model
repo can move under you.

### 5.3 The pipeline

Steps 4–6 are where "a mask" becomes "a cutout you can hand a client." Skipping them is how a tool
ends up with a helmet of hair and a grey fringe.

1. **Decode.** File → `createImageBitmap`, honouring EXIF orientation. Keep the full-resolution
   bitmap; every later step composites against it.
2. **Prepare.** Resize to the model's input square and normalise with ImageNet mean/std.
   **Corrected during the build: the resize is a flat stretch, not a letterbox.** This model's own
   `ViTFeatureExtractor` config resizes to a square without preserving aspect, so letterboxing
   would feed it padding it was never trained on. Match the model's preprocessing, not your
   instincts.
3. **Infer.** ONNX Runtime Web, WebGPU execution provider, in a **Web Worker** so the UI never
   freezes. Output: single-channel logits at 1024×1024.
4. **Sigmoid, and do NOT threshold.** `alpha = sigmoid(logits)`, kept as continuous 0–1.
   **Thresholding to a binary mask here is the single mistake that destroys hair** — every soft
   strand is exactly the semi-transparent pixel a threshold deletes.
5. **Upsample, edge-aware.** Bilinear back to native resolution first, then a **guided filter**
   using the original image as guide. This is what snaps the soft 1024-px alpha back onto real
   pixel edges and recovers strand detail the model saw but could not resolve.
6. **Decontaminate.** At every pixel where `0 < alpha < 1`, the RGB is a blend of subject *and* old
   background — composite it unchanged onto white and you get the old background's colour as a
   halo. Estimate the true foreground colour (a multi-level foreground-estimation pass) and write
   that into the RGB. **This is the step that makes a cutout look professional**, and the step most
   free tools skip.
7. **Compose and export.** Alpha + decontaminated RGB → the chosen background → canvas → encode.

Steps 5 and 6 run on the full-resolution image, so they get their own progress state on large
files; consider a WebGL/WebGPU path for the guided filter if the CPU pass is slow over ~12 MP.

### 5.4 Where the weights live

- **Recommended:** the Hugging Face CDN, pinned to a revision hash. Free, fast, CORS-enabled, and
  it keeps ~95 MB out of the repo.
- **Not the repo.** GitHub rejects files over 100 MB outright, and a 95 MB blob would sit in git
  history forever — which is exactly the mistake DECISIONS §7 already records with the 124 MB of
  testimonial JPEGs.
- **The risk to accept:** a third-party host means a third-party outage. Mitigate with a jsDelivr
  mirror as a documented fallback URL, and a clear error state (§7.5) rather than a spinner that
  never ends.

### 5.5 Browser matrix, and one gotcha that will bite

| Path | Support | Speed on a 12 MP image |
|---|---|---|
| **WebGPU** | Chrome/Edge 113+, Safari 26+, Firefox 141+ (verify current state at build) | 1–4 s |
| **WASM, multi-threaded** | everywhere — **but see below** | 6–15 s |
| **WASM, single-threaded** | everywhere | 15–40 s |

**⚠️ The gotcha: multi-threaded WASM needs cross-origin isolation (`COOP` + `COEP` headers), and
GitHub Pages cannot set response headers.** So on our host the WASM fallback is single-threaded and
slow unless a `coi-serviceworker`-style shim is added to synthesise the headers — which then also
has to be reconciled with the Hugging Face CDN fetch, because COEP blocks cross-origin resources
that do not opt in. **Decide this before building the fallback, not after.** Simplest honest v1:
WebGPU fast path, single-threaded WASM fallback with an upfront "this will take ~30 seconds on this
browser" warning, and the service-worker shim parked as a v1.1 optimisation.

**Mobile:** iOS Safari kills tabs that spike memory. On a device reporting
`navigator.deviceMemory <= 4` or on iOS, run the 512 variant and cap the working image at ~8 MP.
A slightly softer matte is better than a crashed tab.

---

## 6. The quality bar — how we actually get hair right

Karthik's brief is a quality requirement, so it gets measured, not asserted.

**The benchmark set: 20 images, committed to the repo** (or a documented public set), covering the
cases that break background removers:

1. Curly / afro hair against a busy background · 2. Blonde flyaway strands on a bright background ·
3. Dark hair on a dark background · 4. Fur (a dog or cat) · 5. A glass bottle or wine glass ·
6. A chain-link fence or bicycle spokes · 7. Motion-blurred limbs · 8. A veil or lace ·
9. Smoke or steam · 10. Fine jewellery chains · 11. A person holding an object ·
12. Two people overlapping · 13. Plant leaves against foliage · 14. A white product on white ·
15. A screenshot / flat graphic · 16. Low-light phone photo with noise · 17. A car ·
18. Heavy JPEG compression artefacts · 19. Soft studio shadow under a product ·
20. A subject at the very edge of the frame.

**Acceptance, per image:** composite the result onto **both a pure white and a pure black ground**
and inspect at 100%. A halo that is invisible on white is obvious on black — checking only one is
how fringing ships. Pass = no coloured fringe, no visible stair-stepping on a soft edge, and hair
that reads as strands rather than as a silhouette.

**Compare against remove.bg on the same 20**, side by side, before ship. If we lose badly on more
than three, the pipeline is wrong — revisit steps 5 and 6 before revisiting the model.

**The user-facing escape hatches, for the cases no model gets right:**

- **Touch up** — erase / restore brush (§8.4). The universal fallback.
- **Edge controls** — Feather (blur the alpha, 0–5 px), Shift edge (erode/dilate, −5…+5 px),
  Decontaminate (on by default). Three sliders that fix nine tenths of the near-misses.

---

## 7. The interface

### 7.1 Layout

Follows the glass generator's shape: compact hero, then the tool, then SEO copy.

```
┌──────────────────────────────────────────────────────────┐
│  site-header (header.js, unchanged)                      │
├──────────────────────────────────────────────────────────┤
│  HERO — h1, one line of sub-copy, 3 trust pills:         │
│  "Free · Full resolution"  "No sign-up"  "Never uploaded"│
├──────────────────────────────────────────────────────────┤
│  DROPZONE (empty state)                                  │
│   Drag an image, click to browse, or paste (⌘V)          │
│   4 sample images, click to try                          │
├──────────────────────────────────────────────────────────┤
│  WORKSPACE (after a file is chosen)                      │
│  ┌────────────────────────────┬───────────────────────┐  │
│  │  CANVAS                    │  RAIL                 │  │
│  │  checkerboard ground       │  Background           │  │
│  │  hold-to-compare           │   ○ Transparent       │  │
│  │  zoom / pan                │   ○ Colour  [swatches]│  │
│  │                            │   ○ Blur original     │  │
│  │                            │   ○ Image  [upload]   │  │
│  │                            │  Edges                │  │
│  │                            │   Feather   ──○──     │  │
│  │                            │   Shift     ──○──     │  │
│  │                            │   Decontaminate  [on] │  │
│  │                            │  Touch up             │  │
│  │                            │   [Erase][Restore]    │  │
│  │                            │   Size ──○── Undo Redo│  │
│  │                            │  ───────────────────  │  │
│  │                            │  [ Download PNG ▾ ]   │  │
│  │                            │  [ Copy ] [ New image]│  │
│  └────────────────────────────┴───────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│  HOW IT WORKS · FAQ (FAQPage schema) · model credit       │
└──────────────────────────────────────────────────────────┘
```

Below ~900 px the rail moves under the canvas as a horizontal control strip; the canvas keeps at
least 55% of viewport height.

### 7.2 States

| State | What the user sees |
|---|---|
| `idle` | Dropzone + samples. **No weights fetched yet.** |
| `loading-model` | "Getting the model ready — 42 MB / 94 MB". Honest, with a note that it happens once. Thumbnail already visible behind it |
| `processing` | Indeterminate progress on the thumbnail, "Cutting out…" |
| `refining` | Only on large images: "Refining edges…" (the §5.3 step 5–6 pass) |
| `ready` | Result on checkerboard, rail live, download enabled |
| `editing` | Brush cursor on canvas, undo stack active |
| `error` | Named cause + a way forward (§7.5) |

### 7.3 Compare

Hold **space** (or press and hold the compare button) to show the original in place. A draggable
before/after slider is the alternative; the hold gesture is faster to build and better for judging
edges, since your eye does not have to cross a divider. Slider is a v1.1 addition if asked for.

### 7.4 Input

- Drag and drop anywhere on the page, not only on the dropzone.
- Click to browse (`accept="image/png,image/jpeg,image/webp"`).
- **Paste from clipboard** (`⌘V` / `Ctrl+V`) — the fastest path from a screenshot, and the one most
  free tools forget.
- Four sample images, so the tool can be judged without uploading anything.
- **Accepted:** JPEG, PNG, WebP. **Rejected with a clear message:** HEIC (Safari-only decode), SVG,
  GIF, PDF, AVIF (decode support is uneven).
- **Limits:** soft-warn over 25 MP or 20 MB ("this may be slow on your device"), hard-stop over
  50 MP. Our ceiling is device memory, not a business rule — say so.

### 7.5 Errors, named

Never a bare "something went wrong". Each of these is a distinct message with a next step:

| Cause | Message |
|---|---|
| Weights failed to download | "Couldn't load the model. Check your connection and try again." + Retry |
| WebGPU unavailable | Not an error — a notice: "Your browser will use the slower path (~30 s)." |
| Out of memory / tab pressure | "This image is too large for this device. Try an image under 8 MP." |
| Unsupported file type | "PNG, JPEG or WebP, please. [type] isn't supported." |
| Decode failure | "This file looks corrupted — it couldn't be opened." |
| No subject found (alpha is ~empty) | "Nothing clearly stood out from the background. Try an image with a distinct subject." |

---

## 8. Feature inventory

### 8.1 v1 — must ship

- Drag / click / paste / sample input (§7.4)
- Automatic removal, no settings required first
- Soft-alpha pipeline with guided-filter refinement and decontamination (§5.3)
- Checkerboard preview, zoom, pan, hold-to-compare
- **Backgrounds:** transparent · solid colour (10 swatches + hex field) · blurred original
  (radius slider) · your own image (cover-fit, draggable)
- **Edge controls:** feather, shift edge, decontaminate toggle
- **Touch up:** erase / restore brush, size slider, undo / redo (≥20 steps)
- **Export:** PNG (transparent) · JPG (quality slider, forces a background) · WebP · copy to
  clipboard — all at original resolution, no watermark
- Privacy note on the page, stated plainly
- Model credit + MIT notice
- Full keyboard and screen-reader support (§11)

### 8.2 v1.1 — fast follows

Auto-crop to subject with a margin control · before/after slider · "Download @2x / @1x / original"
size menu · remembered background choice within a session · the COOP/COEP service-worker shim for
a faster WASM fallback · drop a second image directly onto the canvas to replace the background.

### 8.3 v2 — candidates

Batch (queue + client-side ZIP) · shadow generation · image-URL input (needs a proxy, §15) ·
save cutouts to the wallet (needs the favourites decision in DECISIONS §6 resolved first) ·
a higher-quality "slow mode" running the full BiRefNet instead of lite.

### 8.4 The brush, specified

Because it is the safety net for every case the model misses, it is worth pinning down:

- Two modes: **Erase** (alpha → 0) and **Restore** (alpha → the model's original value, *not* 1 —
  restoring to opaque white-hot alpha reintroduces the hard edge we worked to avoid).
- Round brush, size 4–200 px in *image* pixels (so it scales with zoom), soft falloff.
- `[` / `]` resize, `E` / `R` switch mode, `⌘Z` / `⌘⇧Z` undo/redo, hold `Alt` to temporarily invert
  the mode.
- Strokes paint into an edit layer composited over the model's alpha, so changing Feather or Shift
  afterwards does not wipe the user's work.

---

## 9. Export, exactly

| Format | Contains | Default when |
|---|---|---|
| PNG | RGBA, original dimensions | background is Transparent |
| JPG | RGB, flattened, quality slider (default 92) | a background is set |
| WebP | RGBA, quality slider | user chooses it (smallest) |

- **Filename:** `<original-name>-nobg.png`, so downloads stay sortable next to the source.
- **Clipboard:** `navigator.clipboard.write` with an `image/png` blob. Silently unsupported on some
  browsers — feature-detect and hide the button rather than fail on click.
- **No metadata is written** beyond what the canvas encoder emits; EXIF from the source (including
  GPS) is dropped by the canvas round-trip. That is a privacy feature — say it in the FAQ.

---

## 10. Performance budget

DECISIONS §7 is the standing rule: measure the payload, don't hand-wave it.

| Asset | Budget | When it loads |
|---|---|---|
| `index.html` | < 25 KB | page load |
| `background-remover.css` | < 20 KB | page load |
| `background-remover.js` | < 60 KB | page load |
| ONNX Runtime Web (WebGPU + WASM) | ~10–25 MB | **first use only** |
| Model weights (fp16) | ~94–110 MB | **first use only** |
| Sample images | < 60 KB each, WebP | lazily, below the fold |

**Rules this page must obey:**

1. **Nothing heavy on page load.** Landing on the page costs under ~110 KB. The runtime and the
   weights are fetched when the first image is dropped — never before, not even on hover.
2. **Cache the weights** in the Cache Storage API under a versioned key (`bgremover-model-v1`), so
   the second visit skips the download entirely. Bump the key when the model revision changes.
3. **Stream the download with a real byte counter.** A 95 MB fetch behind a spinner reads as broken.
4. **Warn before you spend someone's data.** On `navigator.connection.saveData` or a `2g`/`3g`
   effective type, ask first: "This needs a 94 MB one-time download. Continue?"
5. **Inference in a Worker.** A frozen tab during a 20-second WASM pass is indistinguishable from a
   crash.
6. Targets: **p50 under 5 s** on WebGPU for a 12 MP image, and **time-to-first-result under 60 s**
   on a cold cache over a normal connection.

---

## 11. Conventions this project must follow

Non-negotiable, from DECISIONS.md and Karthik's standing preferences:

- **HTML, CSS and JS in separate files. No inline `<script>` blocks** beyond the existing gtag
  snippet that every page carries.
- Per-tool CSS and JS live in the tool folder (`background-remover.css`, `background-remover.js`),
  **not** appended to the 209 KB site-wide `style.css` — the §11 glass-generator precedent.
- `<body class="dw-tool-page background-remover-page">`, `<header class="site-header"></header>`,
  `header.js` renders the nav. Do not hand-write nav markup.
- **The `DW_TOOLS` entry needs all four fields** — `name`, `href`, `description`, `icon` (the inner
  markup of a 24×24 stroked SVG, house style). A missing field renders a blank cell in both the nav
  panel and the `/dw-tools/` index.
- Adding the entry updates the nav panel **and** `/dw-tools/` automatically — they are rendered from
  the same array by construction. Check the index still centres correctly at three cards.
- Full `<head>` block copied from the glass generator: gtag, canonical, OG tags, both Google Fonts
  links, the three favicons, `style.css?v=…` then the tool's own stylesheet with its own `?v=`.
- Add the URL to `sitemap.xml`.
- Run `/update-change-log` when it ships, and bump `DW_VERSION` in `header.js`.
- Mirror the agreed decisions into `DECISIONS.md` as a new `§ 16`.
- **Accessibility:** every control reachable by keyboard; sliders are real `<input type="range">`
  with `aria-valuetext`; state changes announced through an `aria-live="polite"` region (the
  progress states especially); the canvas carries a meaningful `aria-label`; the brush is the one
  thing that cannot be keyboard-driven — say so rather than faking it.

---

## 12. Files

```
dw-tools/background-remover/
  index.html                  page shell, hero, dropzone, workspace, FAQ
  background-remover.css      all tool styling
  background-remover.js       UI, state machine, canvas, brush, export
  bg-worker.js                Worker: ORT session, inference, refinement
  samples/                    4 sample images, WebP, < 60 KB each
public/icons/                 (nothing new — the DW_TOOLS icon is inline SVG markup)
header.js                     + one DW_TOOLS entry
sitemap.xml                   + one URL
.claude/DECISIONS.md          + § 16
```

Model weights are **not** in the repo (§5.4). The URL and its pinned revision hash live in one
`const` at the top of `bg-worker.js`, commented with where it came from and its licence.

---

## 13. Build order

Each step ends somewhere demonstrable — no step is "wire up everything, then test".

1. **Spike, thrown away after.** A bare HTML page: load ORT + BiRefNet-lite, one hard-coded image,
   dump the raw alpha to a canvas. **Answers the only question that matters — does the quality
   clear the bar on the §6 hair cases?** Do not build the UI before this passes.
2. **Refinement pipeline.** Guided filter + decontamination on top of the spike. Re-run §6 on white
   *and* black. This is where the tool is won or lost.
3. **Worker + state machine.** Move inference off the main thread; implement the §7.2 states with a
   fake timer before real weights are wired in, so every state is reachable on demand.
4. **Page shell.** `index.html`, CSS, hero, dropzone, all four input paths, sample images.
5. **Canvas.** Checkerboard, zoom, pan, hold-to-compare.
6. **Backgrounds.** Transparent → colour → blur → image, in that order.
7. **Edge controls.** Feather, shift, decontaminate — each re-composites without re-running
   inference. Verify: moving a slider must not cost another 4 seconds.
8. **Touch up.** Edit layer, brush, undo stack.
9. **Export.** All three formats + clipboard, checked at original resolution.
10. **Caching + progress + the data warning** (§10 rules 2–4).
11. **Errors** (§7.5), every one triggerable in a test harness.
12. **Register.** `DW_TOOLS`, sitemap, FAQ copy, model credit, changelog.

---

## 14. Verification, before it goes near `main`

- [ ] **The §6 benchmark, all 20, on white and on black**, side by side with remove.bg's output.
- [ ] Page-load payload measured and under budget (§10) — with DevTools, not by estimate.
- [ ] Second visit uses the cached weights: **zero** model bytes on the wire.
- [ ] WebGPU path and WASM fallback both produce a correct cutout — force the fallback explicitly.
- [ ] iPhone Safari and Android Chrome: a 12 MP photo completes without the tab dying.
- [ ] Every §7.5 error triggerable and correctly worded.
- [ ] Nav panel and `/dw-tools/` both show three tools; the new card links correctly at 1440, 1100
      and 390 px.
- [ ] Keyboard-only run through the whole flow, and a screen-reader pass over the state changes.
- [ ] Downloaded PNG opens in Figma and Photoshop with alpha intact at original dimensions.
- [ ] **Network tab shows no request carrying image data.** The privacy claim is verified, not
      assumed — and it is the claim we will be held to.
- [ ] MIT / BiRefNet attribution present on the page.

---

## 15. Out of scope for v1

Accounts, saving, history · batch · API · Figma/Photoshop plugins · video · shadow generation ·
generative background *creation* (a different model, and a much bigger download) · upscaling ·
object removal · **image-URL input** (browser CORS makes it impossible without a proxy, and a proxy
means a backend — if it is wanted, it is a deliberate reversal of §5.1, not a small feature) ·
type detection switches (§4 explains why they are unnecessary here).

---

## 16. Open questions for Karthik

1. **In-browser or API?** (§5.1) Recommendation: in-browser. The whole spec assumes it — an API
   changes the cost model, the privacy claim, and the architecture.
2. **Is a one-time ~95 MB download acceptable** for the first use, cached thereafter? This is the
   price of "free forever and private". If not, §5.1's other column is the answer.
3. **Does the Touch up brush ship in v1?** It roughly doubles the canvas work. Recommendation: yes
   — a cutout you cannot fix is a cutout you cannot use.
4. **Weights on the Hugging Face CDN** (recommended) or mirrored somewhere we control?
5. **Name:** "Background Remover", plain, for search. Anything more clever costs traffic — but it is
   your call whether it sits oddly next to "Color Code Converter" and "Glassmorphism CSS Generator".
6. **One promise to re-read:** the page will say *"your image never leaves your browser."* That is
   true only while §5.1 stays as specified. It is a hard commitment to make in public and a costly
   one to walk back — worth agreeing deliberately, not by default.

---

## 17. Built — what reality changed

Everything below was **measured on 2026-09-20** in headless Chrome on Apple Silicon (Metal), by
running real photographs through the finished tool. Where this section contradicts anything above
it, this section is right.

### 17.1 One model was not enough — and the stock export fails on every Mac

The spec said "BiRefNet-lite, fp16, ~94–110 MB, WebGPU fast path, WASM fallback." Three of those
turned out to be wrong together:

| What was tried | Result |
|---|---|
| Stock fp16 export, **WebGPU** | ❌ *"The number of storage buffers (17) in the Compute stage exceeds the maximum per-stage limit (8)."* |
| Stock fp16 export, **WASM** | ❌ Aborts the runtime — ORT's CPU kernels do not cover fp16 |
| Stock fp32 export @1024, **WASM** | ❌ `std::bad_alloc` — the activations do not fit in wasm32's address space |
| **Patched** fp16 export @1024, **WebGPU** | ✅ ~3 s inference, full detail |
| 512px fp32 export, **WASM** | ✅ ~5.7 s inference single-threaded, softer edges |

**The storage-buffer limit is the important one.** BiRefNet's decoder has a Concat that binds 17
storage buffers in a single compute stage. WebGPU's floor is 8, and **Apple's Metal adapter reports
10** — verified by querying `adapter.limits` directly. So the obvious model file fails on exactly
the machines most of this site's audience uses. It is not a headless artefact and it is not fixable
by choosing a newer runtime.

The fix is a **graph-patched export** — `BRPOD123/birefnet-lite-1024-webgpu`, MIT, same upstream
weights, binding ≤8 buffers. So the tool ships **two builds of one network**: patched 1024 fp16
(114.8 MB) on WebGPU, and stock 512 fp32 (191.9 MB) on CPU. Both pinned by revision hash.

### 17.2 A wrong runtime version returns an empty mask, silently

The runtime pin is **load-bearing**, and this is the trap worth remembering:

| onnxruntime-web | Result on a real photo |
|---|---|
| 1.22.0 | **All-zero alpha. No exception, no warning, no console error.** |
| 1.23.2 / 1.24.3 / 1.26.0 / **1.30.0** | Correct — 5.6 s / 4.3 s / 3.7 s / **3.7 s** |

I pinned 1.22.0 first and it "passed" a smoke test, because the smoke test asked *did it throw?*
The answer was no — it just produced nothing. It was only caught by compositing the output and
looking at it. **Any check of this pipeline has to assert on pixels: feed a real photo, sigmoid the
logits, and require mean alpha ≈ 1 over the subject.** "It didn't throw" proves nothing here.

### 17.3 Two features the spec did not ask for

- **`?engine=cpu` / `?engine=gpu`.** Once you know a GPU backend can return a wrong answer without
  erroring, an escape hatch stops being a debug affordance and becomes a support tool.
- **Stale-model pruning.** The cache is keyed by URL, so changing a pinned revision would silently
  leave the old weights — 100–200 MB — on the user's disk forever. The worker now deletes anything
  in its cache that is not one of the two current URLs.

### 17.4 Restore had to mean something different

§8.4 specified Restore as "return alpha to the model's original value, never to 1", to avoid hard
edges. Built that way it is **useless for the case people actually need it for** — when the model
has cut off an arm, the model's value there is 0, so restoring to it does nothing. Restore now
paints alpha toward opaque, with a soft brush falloff to keep the edge from going hard.

### 17.5 Corrected numbers

| | Spec said | Actually |
|---|---|---|
| First-use download | ~95 MB | **114.8 MB** (WebGPU) / **191.9 MB** (CPU) |
| Runtime payload | ~10–25 MB | ~14 MB (CPU) / ~28 MB (WebGPU jsep) |
| Time to result, cached model | p50 < 5 s | **6.7–8.1 s** click-to-ready, incl. ~2.5 s session start |
| Inference alone | 1–4 s WebGPU | **~3 s** WebGPU, **~5.7 s** CPU @512 |
| CPU fallback | "single-threaded, 15–40 s" | **~6 s** — much better than feared, because the fallback is 512px |

### 17.6 Verified

Nine automated checks pass against the running page: both engines reach a result; edge controls
recompose without re-running inference; the cached model is reused with zero bytes on the wire; an
unsupported file type gets its own message; no page errors; no horizontal overflow at 390px with
the workspace open. **Quality was checked by eye, as §6 requires** — the flyaway-hair portrait
composited on white and on black at 100%, with individual strands surviving and no halo from the
original light wall; and the fur case on a dark ground with no green fringe from the grass.

**Not verified, and honestly cannot be from here:** any browser other than Chromium, any GPU other
than Apple's, real iOS and Android devices, and the 18 remaining images of §6's benchmark set.
