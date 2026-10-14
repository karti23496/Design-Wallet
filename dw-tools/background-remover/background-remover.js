/* Background Remover — page controller.

   The worker owns the model and returns ONE thing: a full-resolution RGBA
   buffer whose colour is the decontaminated foreground and whose alpha is the
   refined matte. Everything on this side is derived from that buffer plus a
   settings object, so nothing the user sees can drift from what downloads.

   Two resolutions, on purpose:
     • preview  — capped at ~1.6MP, recomputed on every slider drag and brush
                  stroke, so the controls feel instant.
     • work     — the real image, recomputed once, on export.
   Both run the same alpha pipeline (shift → feather → brush strokes), so the
   preview is a faithful thumbnail of the file you get.

   Brush strokes are recorded as geometry in work-resolution coordinates, not
   painted into a bitmap. That is what makes undo, redo and a full-resolution
   replay at export time all fall out for free. */

document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("bgr-app");
    if (!root) return;

    var PREVIEW_PIXELS = 1600000;
    var MAX_PIXELS_DESKTOP = 25000000;
    var MAX_PIXELS_LIMITED = 8000000;
    var ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

    var dropzone = document.getElementById("bgr-dropzone");
    var fileInput = document.getElementById("bgr-file");
    var browseButton = document.getElementById("bgr-browse");
    var workspace = document.getElementById("bgr-workspace");
    var viewCanvas = document.getElementById("bgr-canvas");
    var viewCtx = viewCanvas.getContext("2d");
    var stage = document.getElementById("bgr-stage");
    var statusPanel = document.getElementById("bgr-status");
    var statusTitle = document.getElementById("bgr-status-title");
    var statusDetail = document.getElementById("bgr-status-detail");
    var statusBar = document.getElementById("bgr-status-bar");
    var statusFill = document.getElementById("bgr-status-fill");
    var statusAction = document.getElementById("bgr-status-action");
    var live = document.getElementById("bgr-live");
    var splitWrap = document.getElementById("bgr-split");
    var splitHandle = document.getElementById("bgr-split-handle");
    var exportButton = document.getElementById("bgr-export");
    var newImageButton = document.getElementById("bgr-new");
    var downloadButton = document.getElementById("bgr-download");
    var formatSelect = document.getElementById("bgr-format");
    var copyButton = document.getElementById("bgr-copy");
    var colourRow = document.getElementById("bgr-colour-row");
    var colourInput = document.getElementById("bgr-colour");
    var colourHex = document.getElementById("bgr-colour-hex");
    var blurRow = document.getElementById("bgr-blur-row");
    var blurInput = document.getElementById("bgr-blur");
    var bgImageRow = document.getElementById("bgr-bg-image-row");
    var bgImageInput = document.getElementById("bgr-bg-image");
    var featherInput = document.getElementById("bgr-feather");
    var shiftInput = document.getElementById("bgr-shift");
    var decontaminateInput = document.getElementById("bgr-decontaminate");
    var brushSizeInput = document.getElementById("bgr-brush-size");
    var undoButton = document.getElementById("bgr-undo");
    var redoButton = document.getElementById("bgr-redo");
    var toast = document.getElementById("bgr-toast");

    var worker = null;
    /* ?engine=cpu forces the CPU path, ?engine=gpu forces WebGPU. A GPU
       backend can produce a wrong mask without raising an error, so there has
       to be a way to say "use the other one" without waiting for a fix. */
    var forcedEngine = (function () {
        var match = /[?&]engine=(cpu|gpu)/.exec(location.search);
        return match ? (match[1] === "cpu" ? "wasm" : "webgpu") : null;
    })();
    var toastTimer = 0;
    var frameRequest = 0;

    var settings = {
        background: "transparent",
        colour: "#ffffff",
        blur: 24,
        feather: 0,
        shift: 0,
        decontaminate: true,
        brushMode: "erase",
        brushSize: 48
    };

    var state = {
        phase: "idle",
        fileName: "image",
        source: null,
        backgroundImage: null,
        work: null,
        preview: null,
        strokes: [],
        redoStack: [],
        activeStroke: null,
        /* How much of the frame, from the left, shows the ORIGINAL: 0 is the
           finished cutout, 1 is the untouched photo. It starts at 0 because
           the cutout is the working view — the slider is for checking the
           result, not for living in. Before on the left, after on the right,
           the way every comparison slider does it. */
        split: 0,
        painting: false,
        draggingSplit: false,
        plan: null
    };

    /* ── Status and messaging ────────────────────────────────────────────── */

    var ERRORS = {
        "model-fetch": ["Couldn't load the model", "Check your connection and try again — nothing was uploaded."],
        "runtime-fetch": ["Couldn't load the runtime", "The AI runtime failed to download. Check your connection and try again."],
        session: ["This browser couldn't start the model", "Try Chrome, Edge, or Safari 26 and up."],
        inference: ["The cutout failed", "The model ran out of room on this device. Try a smaller image."],
        decode: ["This file couldn't be opened", "It may be corrupted, or saved in a format this browser can't read."],
        "no-subject": ["Nothing clearly stood out", "Try an image where the subject is distinct from its background."],
        unknown: ["Something went wrong", "Try again, or try a different image."]
    };

    function say(message) {
        if (live) live.textContent = message;
    }

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove("is-visible");
        }, 2200);
    }

    function setPhase(phase) {
        state.phase = phase;
        root.setAttribute("data-phase", phase);
        var busy = phase === "loading" || phase === "working";
        if (downloadButton) downloadButton.disabled = phase !== "ready";
        if (exportButton) exportButton.disabled = phase !== "ready";
        if (copyButton) copyButton.disabled = phase !== "ready";
        if (splitWrap) splitWrap.hidden = phase !== "ready";
        root.classList.toggle("is-busy", busy);
    }

    function showStatus(title, detail, options) {
        options = options || {};
        statusPanel.hidden = false;
        statusTitle.textContent = title;
        statusDetail.textContent = detail || "";
        statusBar.hidden = !options.progress;
        statusFill.style.width = (options.percent || 0) + "%";
        statusAction.hidden = !options.action;
        if (options.action) {
            statusAction.textContent = options.action;
            statusAction.onclick = options.onAction || null;
        } else {
            statusAction.onclick = null;
        }
        say(title + ". " + (detail || ""));
    }

    function hideStatus() {
        statusPanel.hidden = true;
        statusAction.onclick = null;
    }

    function showError(code, detail) {
        var copy = ERRORS[code] || ERRORS.unknown;
        setPhase(state.work ? "ready" : "idle");
        showStatus(copy[0], copy[1], {
            action: "Try again",
            onAction: function () {
                hideStatus();
                if (!state.work) root.setAttribute("data-phase", "idle");
            }
        });
        if (detail && window.console) console.warn("[background-remover]", code, detail);
    }

    function formatBytes(bytes) {
        return Math.round(bytes / 1048576) + " MB";
    }

    /* ── Worker plumbing ─────────────────────────────────────────────────── */

    function ensureWorker() {
        if (worker) return worker;
        worker = new Worker("/dw-tools/background-remover/bg-worker.js?v=20260920-1", { type: "module" });
        worker.onmessage = onWorkerMessage;
        worker.onerror = function (event) {
            showError("runtime-fetch", event.message);
        };
        return worker;
    }

    var STAGE_COPY = {
        runtime: ["Getting things ready", "Loading the AI runtime."],
        model: ["Getting the model ready", "This happens once — it's cached for next time."],
        session: ["Starting the model", "Almost there."],
        decoding: ["Reading your image", ""],
        inferring: ["Cutting out the subject", "This is the slow bit."],
        refining: ["Refining the edges", "Recovering hair and fine detail."],
        fallback: ["Switching to the CPU path", "This browser's GPU couldn't run the model. The CPU version is larger and slower, but it works."]
    };

    function onWorkerMessage(event) {
        var message = event.data;

        if (message.type === "plan") {
            state.plan = message;
            var meta = document.getElementById("bgr-drop-meta");
            if (meta && !message.cached) {
                meta.textContent =
                    "PNG, JPEG or WebP · up to 25 megapixels · first run downloads a " +
                    formatBytes(message.bytes) + " model, once";
            }
            return;
        }

        if (message.type === "stage") {
            var copy = STAGE_COPY[message.stage] || ["Working", ""];
            var detail = copy[1];
            if (message.stage === "model" && message.bytes) {
                detail = "One-time download, about " + formatBytes(message.bytes) + ". It's cached for next time.";
            }
            showStatus(copy[0], detail, { progress: message.stage === "model" });
            return;
        }

        if (message.type === "progress" && message.phase === "model") {
            var percent = message.total ? (message.loaded / message.total) * 100 : 0;
            showStatus("Getting the model ready", formatBytes(message.loaded) + " of " + formatBytes(message.total) + " — cached for next time.", {
                progress: true,
                percent: percent
            });
            return;
        }

        if (message.type === "result") {
            receiveResult(message);
            return;
        }

        if (message.type === "error") {
            showError(message.code, message.detail);
        }
    }

    function maxPixelsForDevice() {
        var limited =
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.deviceMemory && navigator.deviceMemory <= 4);
        return limited ? MAX_PIXELS_LIMITED : MAX_PIXELS_DESKTOP;
    }

    /* ── Intake ──────────────────────────────────────────────────────────── */

    function acceptFile(file) {
        if (!file) return;
        // The worker handles one image at a time; a second run queued behind
        // the first would land out of order and overwrite the newer result.
        if (state.phase === "loading" || state.phase === "working") {
            showToast("Still working on the last image");
            return;
        }
        if (ACCEPTED.indexOf(file.type) === -1) {
            workspace.hidden = false;
            sizeCanvas();
            showStatus("PNG, JPEG or WebP, please", (file.type || "That file type") + " isn't supported.", {
                action: "OK",
                onAction: function () {
                    hideStatus();
                    if (!state.work) workspace.hidden = true;
                }
            });
            return;
        }
        state.fileName = (file.name || "image").replace(/\.[^.]+$/, "");
        startRun(file);
    }

    function needsConsent() {
        var plan = state.plan;
        if (!plan || plan.cached || plan.ready) return false;
        var connection = navigator.connection || {};
        var metered = connection.saveData === true || /^[23]g$/.test(connection.effectiveType || "");
        return metered || plan.ep === "wasm";
    }

    async function startRun(blob) {
        setPhase("loading");
        hideStatus();

        if (needsConsent()) {
            var plan = state.plan;
            var why =
                plan.ep === "wasm"
                    ? "This browser has no WebGPU, so it needs the larger CPU model and each cutout takes about half a minute."
                    : "You appear to be on a metered or slow connection.";
            workspace.hidden = false;
            sizeCanvas();
            showStatus("One-time download of " + formatBytes(plan.bytes), why + " It's cached afterwards.", {
                action: "Continue",
                onAction: function () {
                    state.plan = { cached: true, ep: plan.ep, bytes: plan.bytes };
                    hideStatus();
                    startRun(blob);
                }
            });
            return;
        }

        try {
            state.source = await createImageBitmap(blob, { imageOrientation: "from-image" });
        } catch (e) {
            showError("decode", e.message);
            return;
        }

        root.setAttribute("data-phase", "loading");
        workspace.hidden = false;
        sizeCanvas();
        resetEdits();
        state.work = null;
        state.preview = null;
        state.split = 0;
        draw();

        showStatus("Reading your image", "", {});
        ensureWorker().postMessage({
            type: "run",
            blob: blob,
            ep: forcedEngine,
            maxPixels: maxPixelsForDevice()
        });
        setPhase("working");
    }

    function receiveResult(message) {
        state.work = {
            width: message.width,
            height: message.height,
            pixels: new Uint8ClampedArray(message.pixels.buffer || message.pixels),
            naturalWidth: message.naturalWidth,
            naturalHeight: message.naturalHeight
        };
        state.work.baseAlpha = new Uint8ClampedArray(state.work.width * state.work.height);
        for (var i = 0, p = 3; i < state.work.baseAlpha.length; i++, p += 4) {
            state.work.baseAlpha[i] = state.work.pixels[p];
        }

        buildPreview();
        hideStatus();
        setPhase("ready");
        state.split = 0;
        recompose();
        var note = message.ep === "webgpu" ? "" : " (slower CPU path)";
        say("Background removed" + note + ". " + state.work.naturalWidth + " by " + state.work.naturalHeight + " pixels, ready to download.");
    }

    /* ── Preview buffers ─────────────────────────────────────────────────── */

    function buildPreview() {
        var work = state.work;
        var scale = Math.min(1, Math.sqrt(PREVIEW_PIXELS / (work.width * work.height)));
        var width = Math.max(1, Math.round(work.width * scale));
        var height = Math.max(1, Math.round(work.height * scale));

        var cut = document.createElement("canvas");
        cut.width = work.width;
        cut.height = work.height;
        cut.getContext("2d").putImageData(new ImageData(work.pixels, work.width, work.height), 0, 0);

        var small = document.createElement("canvas");
        small.width = width;
        small.height = height;
        var smallCtx = small.getContext("2d", { willReadFrequently: true });
        smallCtx.imageSmoothingQuality = "high";
        smallCtx.drawImage(cut, 0, 0, width, height);
        var cleanData = smallCtx.getImageData(0, 0, width, height);

        // The untouched colours, for when decontamination is switched off.
        smallCtx.clearRect(0, 0, width, height);
        smallCtx.drawImage(state.source, 0, 0, width, height);
        var rawData = smallCtx.getImageData(0, 0, width, height);

        var base = new Float32Array(width * height);
        for (var i = 0, p = 3; i < base.length; i++, p += 4) base[i] = cleanData.data[p] / 255;

        state.preview = {
            width: width,
            height: height,
            scale: width / work.width,
            clean: cleanData.data,
            raw: rawData.data,
            base: base,
            paint: new Float32Array(width * height),
            alpha: new Float32Array(width * height),
            canvas: document.createElement("canvas"),
            image: new ImageData(width, height)
        };
        state.preview.canvas.width = width;
        state.preview.canvas.height = height;
        rebuildPaint();
    }

    /* ── The alpha pipeline (shared by preview and export) ───────────────── */

    function boxBlur(src, width, height, radius) {
        if (radius < 1) return src;
        var tmp = new Float32Array(src.length);
        var out = new Float32Array(src.length);
        var window = radius * 2 + 1;
        var x, y, i;

        for (y = 0; y < height; y++) {
            var row = y * width;
            var sum = 0;
            for (i = -radius; i <= radius; i++) sum += src[row + Math.min(width - 1, Math.max(0, i))];
            for (x = 0; x < width; x++) {
                tmp[row + x] = sum / window;
                var add = Math.min(width - 1, x + radius + 1);
                var drop = Math.max(0, x - radius);
                sum += src[row + add] - src[row + drop];
            }
        }
        for (x = 0; x < width; x++) {
            var colSum = 0;
            for (i = -radius; i <= radius; i++) colSum += tmp[Math.min(height - 1, Math.max(0, i)) * width + x];
            for (y = 0; y < height; y++) {
                out[y * width + x] = colSum / window;
                var addRow = Math.min(height - 1, y + radius + 1);
                var dropRow = Math.max(0, y - radius);
                colSum += tmp[addRow * width + x] - tmp[dropRow * width + x];
            }
        }
        return out;
    }

    /* Separable erode (shift < 0) or dilate (shift > 0). Small radii only, so
       the naive sliding window is cheaper than van Herk's trick. */
    function morph(src, width, height, radius, dilate) {
        if (radius < 1) return src;
        var tmp = new Float32Array(src.length);
        var out = new Float32Array(src.length);
        var x, y, k;

        for (y = 0; y < height; y++) {
            var row = y * width;
            for (x = 0; x < width; x++) {
                var best = src[row + x];
                for (k = -radius; k <= radius; k++) {
                    var sx = x + k;
                    if (sx < 0 || sx >= width) continue;
                    var v = src[row + sx];
                    if (dilate ? v > best : v < best) best = v;
                }
                tmp[row + x] = best;
            }
        }
        for (x = 0; x < width; x++) {
            for (y = 0; y < height; y++) {
                var top = tmp[y * width + x];
                for (k = -radius; k <= radius; k++) {
                    var sy = y + k;
                    if (sy < 0 || sy >= height) continue;
                    var value = tmp[sy * width + x];
                    if (dilate ? value > top : value < top) top = value;
                }
                out[y * width + x] = top;
            }
        }
        return out;
    }

    /* base → shift → feather → brush strokes. One function, two resolutions. */
    function composeAlpha(base, paint, width, height, scale) {
        var alpha = base;
        var shift = Math.round(Math.abs(settings.shift) * scale);
        if (shift >= 1) alpha = morph(alpha, width, height, shift, settings.shift > 0);

        var feather = Math.round(settings.feather * scale);
        if (feather >= 1) alpha = boxBlur(alpha, width, height, feather);

        var out = alpha === base ? new Float32Array(base) : alpha;
        if (alpha === base) out.set(base);

        if (paint) {
            for (var i = 0; i < out.length; i++) {
                var v = out[i] + paint[i];
                out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
        }
        return out;
    }

    /* ── Brush strokes ───────────────────────────────────────────────────── */

    function stampStroke(target, width, height, stroke, scale) {
        var radius = Math.max(1, stroke.size * 0.5 * scale);
        var sign = stroke.mode === "restore" ? 1 : -1;
        var inner = radius * 0.55;
        var falloff = Math.max(0.0001, radius - inner);

        for (var s = 0; s < stroke.points.length; s++) {
            var point = stroke.points[s];
            var cx = point.x * scale;
            var cy = point.y * scale;
            var x0 = Math.max(0, Math.floor(cx - radius));
            var x1 = Math.min(width - 1, Math.ceil(cx + radius));
            var y0 = Math.max(0, Math.floor(cy - radius));
            var y1 = Math.min(height - 1, Math.ceil(cy + radius));

            for (var y = y0; y <= y1; y++) {
                var dy = y - cy;
                var row = y * width;
                for (var x = x0; x <= x1; x++) {
                    var dx = x - cx;
                    var distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > radius) continue;
                    var coverage = distance <= inner ? 1 : 1 - (distance - inner) / falloff;
                    if (coverage <= 0) continue;
                    var value = coverage * sign;
                    var current = target[row + x];
                    // Within a stroke, take the strongest touch rather than
                    // accumulating — otherwise a slow drag burns a hole.
                    if (sign > 0 ? value > current : value < current) target[row + x] = value;
                }
            }
        }
    }

    function rebuildPaint() {
        if (!state.preview) return;
        state.preview.paint.fill(0);
        for (var i = 0; i < state.strokes.length; i++) {
            stampStroke(state.preview.paint, state.preview.width, state.preview.height, state.strokes[i], state.preview.scale);
        }
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        if (undoButton) undoButton.disabled = state.strokes.length === 0;
        if (redoButton) redoButton.disabled = state.redoStack.length === 0;
    }

    function resetEdits() {
        state.strokes = [];
        state.redoStack = [];
        state.activeStroke = null;
        updateHistoryButtons();
    }

    /* ── Compositing ─────────────────────────────────────────────────────── */

    function paintBackground(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        if (settings.background === "colour") {
            ctx.fillStyle = settings.colour;
            ctx.fillRect(0, 0, width, height);
            return;
        }
        if (settings.background === "blur" && state.source) {
            var radius = Math.max(1, settings.blur * (width / state.work.width));
            ctx.save();
            if ("filter" in ctx) {
                ctx.filter = "blur(" + radius + "px)";
                ctx.drawImage(state.source, -radius * 2, -radius * 2, width + radius * 4, height + radius * 4);
                ctx.filter = "none";
            } else {
                // No ctx.filter: fake it by round-tripping through a tiny canvas.
                var small = document.createElement("canvas");
                small.width = Math.max(1, Math.round(width / (radius * 0.75)));
                small.height = Math.max(1, Math.round(height / (radius * 0.75)));
                small.getContext("2d").drawImage(state.source, 0, 0, small.width, small.height);
                ctx.drawImage(small, 0, 0, width, height);
            }
            ctx.restore();
            return;
        }
        if (settings.background === "image" && state.backgroundImage) {
            var image = state.backgroundImage;
            var cover = Math.max(width / image.width, height / image.height);
            var w = image.width * cover;
            var h = image.height * cover;
            ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
        }
    }

    function recompose() {
        if (!state.preview || !state.work) return;
        var preview = state.preview;
        var alpha = composeAlpha(preview.base, preview.paint, preview.width, preview.height, preview.scale);
        var source = settings.decontaminate ? preview.clean : preview.raw;
        var out = preview.image.data;

        for (var i = 0, p = 0; i < alpha.length; i++, p += 4) {
            out[p] = source[p];
            out[p + 1] = source[p + 1];
            out[p + 2] = source[p + 2];
            out[p + 3] = alpha[i] * 255;
        }

        var ctx = preview.canvas.getContext("2d");
        paintBackground(ctx, preview.width, preview.height);
        var layer = document.createElement("canvas");
        layer.width = preview.width;
        layer.height = preview.height;
        layer.getContext("2d").putImageData(preview.image, 0, 0);
        ctx.drawImage(layer, 0, 0);

        draw();
    }

    function scheduleRecompose() {
        if (frameRequest) return;
        frameRequest = requestAnimationFrame(function () {
            frameRequest = 0;
            recompose();
        });
    }

    /* ── The view ────────────────────────────────────────────────────────── */

    function sizeCanvas() {
        var rect = stage.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        viewCanvas.width = Math.max(1, Math.round(rect.width * dpr));
        viewCanvas.height = Math.max(1, Math.round(rect.height * dpr));
        viewCanvas.style.width = rect.width + "px";
        viewCanvas.style.height = rect.height + "px";
        viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function contentSize() {
        if (state.work) return { width: state.work.width, height: state.work.height };
        if (state.source) return { width: state.source.width, height: state.source.height };
        return { width: 1, height: 1 };
    }

    /* The image always fits the frame. There is no zoom and no pan — the frame
       is for judging the cutout, and the file you download is full resolution
       whatever this shows. */
    function layout() {
        var rect = stage.getBoundingClientRect();
        var size = contentSize();
        var scale = Math.min((rect.width - 48) / size.width, (rect.height - 48) / size.height);
        if (!(scale > 0)) scale = 1;
        var w = size.width * scale;
        var h = size.height * scale;
        return { rect: rect, scale: scale, w: w, h: h, x: (rect.width - w) / 2, y: (rect.height - h) / 2 };
    }

    function drawCheckerboard(x, y, w, h) {
        var size = 12;
        viewCtx.save();
        viewCtx.beginPath();
        viewCtx.rect(x, y, w, h);
        viewCtx.clip();
        // Light, like every other design tool — a dark checkerboard reads as
        // part of the artwork rather than as "nothing is here".
        viewCtx.fillStyle = "#ffffff";
        viewCtx.fillRect(x, y, w, h);
        viewCtx.fillStyle = "#e4e4e4";
        for (var row = Math.floor(y / size) * size; row < y + h; row += size) {
            for (var col = Math.floor(x / size) * size; col < x + w; col += size) {
                if ((row / size + col / size) % 2 === 0) viewCtx.fillRect(col, row, size, size);
            }
        }
        viewCtx.restore();
    }

    function draw() {
        var L = layout();
        viewCtx.clearRect(0, 0, L.rect.width, L.rect.height);
        viewCtx.imageSmoothingQuality = "high";

        if (!state.preview) {
            if (state.source) viewCtx.drawImage(state.source, L.x, L.y, L.w, L.h);
            positionSplit(L);
            return;
        }

        var splitX = L.x + L.w * state.split;

        // Right of the handle: the cutout, over whatever background is set.
        viewCtx.save();
        viewCtx.beginPath();
        viewCtx.rect(splitX, 0, L.rect.width - splitX, L.rect.height);
        viewCtx.clip();
        if (settings.background === "transparent") drawCheckerboard(L.x, L.y, L.w, L.h);
        viewCtx.drawImage(state.preview.canvas, L.x, L.y, L.w, L.h);
        viewCtx.restore();

        // Left of the handle: the untouched original.
        if (state.split > 0.001 && state.source) {
            viewCtx.save();
            viewCtx.beginPath();
            viewCtx.rect(0, 0, splitX, L.rect.height);
            viewCtx.clip();
            viewCtx.drawImage(state.source, L.x, L.y, L.w, L.h);
            viewCtx.restore();
        }

        if (state.split > 0.001 && state.split < 0.999) {
            viewCtx.save();
            viewCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            viewCtx.lineWidth = 1.5;
            viewCtx.beginPath();
            viewCtx.moveTo(splitX, L.y);
            viewCtx.lineTo(splitX, L.y + L.h);
            viewCtx.stroke();
            viewCtx.restore();
        }

        positionSplit(L);
    }

    /* The grab handle is a DOM element, not something painted on the canvas:
       it can then be tabbed to and driven with the arrow keys, and dragging it
       never gets confused with a brush stroke. */
    function positionSplit(L) {
        if (!splitWrap || splitWrap.hidden) return;
        L = L || layout();
        var splitX = L.x + L.w * state.split;
        splitHandle.style.left = splitX + "px";
        splitHandle.style.top = L.y + "px";
        splitHandle.style.height = L.h + "px";
        splitWrap.style.setProperty("--split-left", L.x + "px");
        splitWrap.style.setProperty("--split-right", L.rect.width - (L.x + L.w) + "px");
        splitWrap.style.setProperty("--split-top", L.y + "px");
        splitWrap.classList.toggle("is-open", state.split > 0.005);
        var percent = Math.round(state.split * 100);
        splitHandle.setAttribute("aria-valuenow", String(percent));
        splitHandle.setAttribute(
            "aria-valuetext",
            percent <= 1 ? "Showing the cutout" : percent >= 99 ? "Showing the original" : percent + "% original"
        );
    }

    function setSplit(value, announce) {
        state.split = Math.min(1, Math.max(0, value));
        draw();
        if (announce) say(splitHandle.getAttribute("aria-valuetext"));
    }

    function splitFromPointer(clientX) {
        var L = layout();
        if (L.w <= 0) return state.split;
        return (clientX - L.rect.left - L.x) / L.w;
    }

    function viewToImage(clientX, clientY) {
        var L = layout();
        return { x: (clientX - L.rect.left - L.x) / L.scale, y: (clientY - L.rect.top - L.y) / L.scale };
    }

    /* ── Export ──────────────────────────────────────────────────────────── */

    function buildFullResolution(forceWhite) {
        var work = state.work;
        var base = new Float32Array(work.width * work.height);
        for (var i = 0; i < base.length; i++) base[i] = work.baseAlpha[i] / 255;

        var paint = null;
        if (state.strokes.length) {
            paint = new Float32Array(base.length);
            for (var s = 0; s < state.strokes.length; s++) {
                stampStroke(paint, work.width, work.height, state.strokes[s], 1);
            }
        }

        var alpha = composeAlpha(base, paint, work.width, work.height, 1);

        var canvas = document.createElement("canvas");
        canvas.width = work.width;
        canvas.height = work.height;
        var ctx = canvas.getContext("2d");
        if (forceWhite) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, work.width, work.height);
        } else {
            paintBackground(ctx, work.width, work.height);
        }

        var pixels;
        if (settings.decontaminate) {
            pixels = new Uint8ClampedArray(work.pixels);
        } else {
            var rawCanvas = document.createElement("canvas");
            rawCanvas.width = work.width;
            rawCanvas.height = work.height;
            var rawCtx = rawCanvas.getContext("2d", { willReadFrequently: true });
            rawCtx.drawImage(state.source, 0, 0, work.width, work.height);
            pixels = rawCtx.getImageData(0, 0, work.width, work.height).data;
        }
        for (var p = 0, a = 0; a < alpha.length; a++, p += 4) pixels[p + 3] = alpha[a] * 255;

        var layer = document.createElement("canvas");
        layer.width = work.width;
        layer.height = work.height;
        layer.getContext("2d").putImageData(new ImageData(pixels, work.width, work.height), 0, 0);
        ctx.drawImage(layer, 0, 0);
        return canvas;
    }

    function exportBlob() {
        var format = formatSelect ? formatSelect.value : "png";
        var canvas = buildFullResolution(format === "jpg" && settings.background === "transparent");
        var type = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
        var quality = format === "png" ? undefined : 0.92;
        return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
                resolve({ blob: blob, type: type, format: format });
            }, type, quality);
        });
    }

    async function download() {
        if (state.phase !== "ready") return;
        downloadButton.disabled = true;
        showStatus("Building your file", "At full resolution — " + state.work.naturalWidth + " × " + state.work.naturalHeight + ".", {});
        try {
            var result = await exportBlob();
            var extension = result.format === "jpg" ? "jpg" : result.format;
            var link = document.createElement("a");
            link.href = URL.createObjectURL(result.blob);
            link.download = state.fileName + "-nobg." + extension;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function () {
                URL.revokeObjectURL(link.href);
            }, 4000);
            showToast("Downloaded at full resolution");
            say("Downloaded " + link.download);
        } catch (e) {
            showError("unknown", e.message);
        }
        hideStatus();
        downloadButton.disabled = false;
    }

    async function copyToClipboard() {
        if (state.phase !== "ready") return;
        try {
            var canvas = buildFullResolution();
            var blob = await new Promise(function (resolve) {
                canvas.toBlob(resolve, "image/png");
            });
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            showToast("Copied to clipboard");
        } catch (e) {
            showToast("This browser blocked the copy — use Download");
        }
    }

    /* ── Controls ────────────────────────────────────────────────────────── */

    function setBackground(mode) {
        settings.background = mode;
        var buttons = root.querySelectorAll("[data-bg]");
        for (var i = 0; i < buttons.length; i++) {
            var active = buttons[i].getAttribute("data-bg") === mode;
            buttons[i].classList.toggle("is-active", active);
            buttons[i].setAttribute("aria-pressed", active ? "true" : "false");
        }
        colourRow.hidden = mode !== "colour";
        blurRow.hidden = mode !== "blur";
        bgImageRow.hidden = mode !== "image";
        scheduleRecompose();
    }

    function setBrushMode(mode) {
        settings.brushMode = mode;
        var buttons = root.querySelectorAll("[data-brush]");
        for (var i = 0; i < buttons.length; i++) {
            var active = buttons[i].getAttribute("data-brush") === mode;
            buttons[i].classList.toggle("is-active", active);
            buttons[i].setAttribute("aria-pressed", active ? "true" : "false");
        }
    }

    root.addEventListener("click", function (event) {
        var bgButton = event.target.closest("[data-bg]");
        if (bgButton) {
            setBackground(bgButton.getAttribute("data-bg"));
            return;
        }
        var brushButton = event.target.closest("[data-brush]");
        if (brushButton) {
            setBrushMode(brushButton.getAttribute("data-brush"));
            return;
        }
        var swatch = event.target.closest("[data-swatch]");
        if (swatch) {
            settings.colour = swatch.getAttribute("data-swatch");
            colourInput.value = settings.colour;
            colourHex.value = settings.colour.toUpperCase();
            setBackground("colour");
            return;
        }
        var sample = event.target.closest("[data-sample]");
        if (sample) {
            event.preventDefault();
            loadSample(sample.getAttribute("data-sample"));
        }
    });

    async function loadSample(url) {
        try {
            var response = await fetch(url);
            var blob = await response.blob();
            state.fileName = url.split("/").pop().replace(/\.[^.]+$/, "");
            startRun(blob);
        } catch (e) {
            showError("decode", e.message);
        }
    }

    if (browseButton) {
        browseButton.addEventListener("click", function () {
            fileInput.click();
        });
    }
    fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files[0]) acceptFile(fileInput.files[0]);
        fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach(function (name) {
        document.addEventListener(name, function (event) {
            event.preventDefault();
            dropzone.classList.add("is-dragging");
        });
    });
    ["dragleave", "drop"].forEach(function (name) {
        document.addEventListener(name, function (event) {
            event.preventDefault();
            if (name === "dragleave" && event.relatedTarget) return;
            dropzone.classList.remove("is-dragging");
        });
    });
    document.addEventListener("drop", function (event) {
        if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
            acceptFile(event.dataTransfer.files[0]);
        }
    });
    document.addEventListener("paste", function (event) {
        if (!event.clipboardData) return;
        var items = event.clipboardData.items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image/") === 0) {
                acceptFile(items[i].getAsFile());
                return;
            }
        }
    });

    colourInput.addEventListener("input", function () {
        settings.colour = colourInput.value;
        colourHex.value = settings.colour.toUpperCase();
        setBackground("colour");
    });
    colourHex.addEventListener("change", function () {
        var value = colourHex.value.trim();
        if (!/^#?[0-9a-fA-F]{6}$/.test(value)) {
            colourHex.value = settings.colour.toUpperCase();
            return;
        }
        settings.colour = value[0] === "#" ? value : "#" + value;
        colourInput.value = settings.colour;
        colourHex.value = settings.colour.toUpperCase();
        setBackground("colour");
    });
    blurInput.addEventListener("input", function () {
        settings.blur = Number(blurInput.value);
        blurInput.setAttribute("aria-valuetext", settings.blur + " pixels");
        scheduleRecompose();
    });
    bgImageInput.addEventListener("change", async function () {
        if (!bgImageInput.files || !bgImageInput.files[0]) return;
        try {
            state.backgroundImage = await createImageBitmap(bgImageInput.files[0]);
            setBackground("image");
        } catch (e) {
            showToast("That background image couldn't be read");
        }
    });

    featherInput.addEventListener("input", function () {
        settings.feather = Number(featherInput.value);
        featherInput.setAttribute("aria-valuetext", settings.feather + " pixels");
        document.getElementById("bgr-feather-value").textContent = settings.feather;
        scheduleRecompose();
    });
    shiftInput.addEventListener("input", function () {
        settings.shift = Number(shiftInput.value);
        shiftInput.setAttribute("aria-valuetext", settings.shift + " pixels");
        document.getElementById("bgr-shift-value").textContent = settings.shift > 0 ? "+" + settings.shift : String(settings.shift);
        scheduleRecompose();
    });
    decontaminateInput.addEventListener("change", function () {
        settings.decontaminate = decontaminateInput.checked;
        scheduleRecompose();
    });
    brushSizeInput.addEventListener("input", function () {
        settings.brushSize = Number(brushSizeInput.value);
        document.getElementById("bgr-brush-value").textContent = settings.brushSize;
    });

    undoButton.addEventListener("click", function () {
        if (!state.strokes.length) return;
        state.redoStack.push(state.strokes.pop());
        rebuildPaint();
        recompose();
        say("Undid one brush stroke.");
    });
    redoButton.addEventListener("click", function () {
        if (!state.redoStack.length) return;
        state.strokes.push(state.redoStack.pop());
        rebuildPaint();
        recompose();
        say("Redid one brush stroke.");
    });

    newImageButton.addEventListener("click", function () {
        state.work = null;
        state.preview = null;
        state.source = null;
        resetEdits();
        workspace.hidden = true;
        hideStatus();
        setPhase("idle");
        fileInput.click();
    });

    /* ── The comparison slider ───────────────────────────────────────────── */

    splitHandle.addEventListener("pointerdown", function (event) {
        if (state.phase !== "ready") return;
        event.preventDefault();
        state.draggingSplit = true;
        splitWrap.classList.add("is-dragging");
        splitHandle.setPointerCapture(event.pointerId);
    });

    splitHandle.addEventListener("pointermove", function (event) {
        if (!state.draggingSplit) return;
        setSplit(splitFromPointer(event.clientX));
    });

    ["pointerup", "pointercancel"].forEach(function (name) {
        splitHandle.addEventListener(name, function (event) {
            if (!state.draggingSplit) return;
            state.draggingSplit = false;
            splitWrap.classList.remove("is-dragging");
            if (splitHandle.hasPointerCapture && splitHandle.hasPointerCapture(event.pointerId)) {
                splitHandle.releasePointerCapture(event.pointerId);
            }
            say(splitHandle.getAttribute("aria-valuetext"));
        });
    });

    splitHandle.addEventListener("keydown", function (event) {
        var step = event.shiftKey ? 0.1 : 0.02;
        if (event.key === "ArrowLeft") setSplit(state.split - step, true);
        else if (event.key === "ArrowRight") setSplit(state.split + step, true);
        else if (event.key === "Home") setSplit(0, true);
        else if (event.key === "End") setSplit(1, true);
        else return;
        event.preventDefault();
    });

    downloadButton.addEventListener("click", download);
    exportButton.addEventListener("click", download);
    copyButton.addEventListener("click", copyToClipboard);
    if (!navigator.clipboard || !window.ClipboardItem) copyButton.hidden = true;

    /* ── Pointer on the canvas: painting ─────────────────────────────────── */

    viewCanvas.addEventListener("pointerdown", function (event) {
        if (state.phase !== "ready") return;
        var point = viewToImage(event.clientX, event.clientY);
        state.activeStroke = {
            mode: settings.brushMode,
            size: settings.brushSize,
            points: [point]
        };
        state.strokes.push(state.activeStroke);
        state.redoStack = [];
        state.painting = true;
        viewCanvas.setPointerCapture(event.pointerId);
        stampStroke(state.preview.paint, state.preview.width, state.preview.height, state.activeStroke, state.preview.scale);
        updateHistoryButtons();
        scheduleRecompose();
    });

    viewCanvas.addEventListener("pointermove", function (event) {
        if (!state.painting || !state.activeStroke) return;
        var point = viewToImage(event.clientX, event.clientY);
        var last = state.activeStroke.points[state.activeStroke.points.length - 1];
        var step = { mode: state.activeStroke.mode, size: state.activeStroke.size, points: [] };

        // Interpolate, or a fast drag leaves gaps between samples.
        var dx = point.x - last.x;
        var dy = point.y - last.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        var spacing = Math.max(1, settings.brushSize * 0.2);
        var steps = Math.min(64, Math.floor(distance / spacing));
        for (var i = 1; i <= steps; i++) {
            step.points.push({ x: last.x + (dx * i) / steps, y: last.y + (dy * i) / steps });
        }
        step.points.push(point);
        for (var j = 0; j < step.points.length; j++) state.activeStroke.points.push(step.points[j]);

        stampStroke(state.preview.paint, state.preview.width, state.preview.height, step, state.preview.scale);
        scheduleRecompose();
    });

    ["pointerup", "pointercancel"].forEach(function (name) {
        viewCanvas.addEventListener(name, function (event) {
            if (state.painting) {
                state.painting = false;
                state.activeStroke = null;
                recompose();
            }
            if (viewCanvas.hasPointerCapture && viewCanvas.hasPointerCapture(event.pointerId)) {
                viewCanvas.releasePointerCapture(event.pointerId);
            }
        });
    });

    /* ── Keyboard ────────────────────────────────────────────────────────── */

    document.addEventListener("keydown", function (event) {
        var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
        if (typing) return;

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            (event.shiftKey ? redoButton : undoButton).click();
            return;
        }
        if (event.key === "[" || event.key === "]") {
            var next = settings.brushSize + (event.key === "]" ? 8 : -8);
            settings.brushSize = Math.min(200, Math.max(4, next));
            brushSizeInput.value = settings.brushSize;
            document.getElementById("bgr-brush-value").textContent = settings.brushSize;
            return;
        }
        if (event.key === "e" || event.key === "E") setBrushMode("erase");
        if (event.key === "r" || event.key === "R") setBrushMode("restore");
    });

    window.addEventListener("resize", function () {
        sizeCanvas();
        if (state.phase === "ready" || state.source) {
            draw();
        }
    });

    /* ── Boot ────────────────────────────────────────────────────────────── */

    sizeCanvas();
    setPhase("idle");
    draw();
    setBackground("transparent");
    setBrushMode("erase");
    updateHistoryButtons();
    ensureWorker().postMessage({ type: "plan", ep: forcedEngine });
});
