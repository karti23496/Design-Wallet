/* Background Remover — inference worker.

   Everything expensive happens in here: the model download, the ONNX session,
   inference, and the two passes that turn a 1024px mask into a full-resolution
   cutout. The page thread only ever handles UI, so a 30-second WASM run can
   never freeze the tab.

   The pipeline, and why each step exists (spec §5.3):

     1. stretch-resize to 1024×1024 and normalise   — matches the model's own
        ViTFeatureExtractor, which does NOT preserve aspect ratio. Letterboxing
        here would feed the model padding it was never trained on.
     2. sigmoid, kept CONTINUOUS                    — the soft 0–1 alpha *is*
        the hair. Thresholding to a binary mask deletes exactly the
        semi-transparent pixels this tool exists to keep.
     3. colour guided filter, full-res guide        — snaps the soft 1024px
        alpha onto real pixel edges and recovers strand detail.
     4. foreground decontamination                  — at every pixel where
        0 < a < 1 the RGB is a blend of subject AND old background. Composite
        it unchanged and the old background shows up as a halo. We invert the
        compositing equation to recover the true foreground colour.

   Steps 3 and 4 run in ONE full-resolution pass that writes back into the
   source pixel buffer, so a 25MP image costs one RGBA buffer, not four. */

/* Pinned, and the pin is load-bearing — verified against a real photograph,
   not a synthetic input, because the failure mode here is a SILENTLY EMPTY
   mask rather than an error:

     1.22.0  returns all-zero alpha for this model. No exception, no warning.
     1.23.2  correct, 5.6s      1.24.3  correct, 4.3s
     1.26.0  correct, 3.7s      1.30.0  correct, 3.7s   ← pinned

   Measured on Apple Metal, 1024×1024. Before changing this, re-run the check:
   feed a real photo, sigmoid the logits, and assert mean alpha ≈ 1 over the
   subject. "It didn't throw" proves nothing. */
const ORT_VERSION = "1.30.0";
const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@" + ORT_VERSION + "/dist/";

/* BiRefNet-lite, MIT licensed — https://github.com/ZhengPeng7/BiRefNet
   Two builds of the same network, because no single file serves both backends.
   Both pinned to a revision hash: a model repo can move under you.

   webgpu — a graph-patched 1024px export. The stock export has a Concat that
     binds 17 storage buffers in one compute stage; WebGPU's per-stage limit is
     8 and Apple's Metal adapter reports 10, so the stock model fails on every
     Mac ("the number of storage buffers (17) ... exceeds the maximum
     per-stage limit"). Measured here, not assumed. The patched export runs in
     ~3s at full 1024px detail.
   wasm   — the 512px export, at fp32. Two constraints force this one:
     the fp16 files abort the WASM runtime outright (ORT's CPU kernels do not
     cover fp16), and the 1024px fp32 model dies with std::bad_alloc, because
     its activations do not fit in wasm32's address space. 512px fp32 fits and
     takes ~6s single-threaded. Its edges are softer than the GPU path's —
     that is the honest cost of having a fallback at all. */

const MODEL_VARIANTS = {
    webgpu: {
        url:
            "https://huggingface.co/BRPOD123/birefnet-lite-1024-webgpu/resolve/" +
            "e2502930a1097a72a68e2b309f20059ea687a44c/onnx/model_fp16.onnx",
        bytes: 114834127,
        size: 1024
    },
    wasm: {
        url:
            "https://huggingface.co/BRPOD123/birefnet-lite-512/resolve/" +
            "4e21021f6c94fa7ec2d117a0785b0c1300bef459/onnx/model.onnx",
        bytes: 191877254,
        size: 512
    }
};

const CACHE_NAME = "dw-bgremover-model-v1";
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

var ort = null;
var session = null;
var sessionEP = "";

function post(message, transfer) {
    self.postMessage(message, transfer || []);
}

function describe(thrown) {
    if (!thrown) return "";
    // ORT's WASM build throws a raw number — a C++ exception pointer — so
    // reading `.message` off it loses the only clue there is.
    if (typeof thrown === "number") return "abort code " + thrown;
    return String(thrown.message || thrown);
}

function fail(code, detail) {
    var error = new Error(detail || code);
    error.code = code;
    return error;
}

/* ── Model loading ───────────────────────────────────────────────────────── */

async function pickExecutionProvider() {
    if (typeof navigator === "undefined" || !navigator.gpu) return "wasm";
    try {
        var adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return "wasm";
        // The patched model needs 8 storage buffers in one compute stage. That
        // is WebGPU's own floor, so this should always pass — but an adapter
        // reporting less would fail deep inside a shader after a 110MB
        // download, which is a miserable way to find out.
        var limit = adapter.limits ? adapter.limits.maxStorageBuffersPerShaderStage : 0;
        return limit >= 8 ? "webgpu" : "wasm";
    } catch (e) {
        return "wasm";
    }
}

async function fetchModel(url, expectedBytes) {
    var cache = null;
    try {
        cache = await caches.open(CACHE_NAME);
    } catch (e) {
        cache = null; // private mode, or storage blocked — just download it
    }

    if (cache) {
        /* Drop anything this cache is holding that is not one of the two
           current model URLs. Without this, changing a pinned revision leaves
           the old weights — hundreds of megabytes — on the user's disk
           forever, and they have no way to know they are there. */
        try {
            var current = [MODEL_VARIANTS.webgpu.url, MODEL_VARIANTS.wasm.url];
            var stored = await cache.keys();
            for (var k = 0; k < stored.length; k++) {
                if (current.indexOf(stored[k].url) === -1) await cache.delete(stored[k]);
            }
        } catch (e) {
            /* Pruning is housekeeping; never fail a cutout over it. */
        }

        var hit = await cache.match(url);
        if (hit) {
            post({ type: "progress", phase: "model", loaded: expectedBytes, total: expectedBytes, cached: true });
            return new Uint8Array(await hit.arrayBuffer());
        }
    }

    var response;
    try {
        response = await fetch(url);
    } catch (e) {
        throw fail("model-fetch", describe(e));
    }
    if (!response.ok) throw fail("model-fetch", "HTTP " + response.status);

    var total = Number(response.headers.get("content-length")) || expectedBytes;
    var chunks = [];
    var loaded = 0;
    var lastPost = 0;

    if (response.body && response.body.getReader) {
        var reader = response.body.getReader();
        for (;;) {
            var step = await reader.read();
            if (step.done) break;
            chunks.push(step.value);
            loaded += step.value.byteLength;
            var now = Date.now();
            if (now - lastPost > 120) {
                lastPost = now;
                post({ type: "progress", phase: "model", loaded: loaded, total: total });
            }
        }
    } else {
        var buffer = await response.arrayBuffer();
        chunks.push(new Uint8Array(buffer));
        loaded = buffer.byteLength;
    }
    post({ type: "progress", phase: "model", loaded: total, total: total });

    var bytes = new Uint8Array(loaded);
    var offset = 0;
    for (var i = 0; i < chunks.length; i++) {
        bytes.set(chunks[i], offset);
        offset += chunks[i].byteLength;
    }

    if (cache) {
        try {
            await cache.put(url, new Response(bytes));
        } catch (e) {
            /* Over quota, or Safari being Safari. The tool still works — it
               just pays the download again next visit. Not worth failing on. */
        }
    }
    return bytes;
}

async function ensureSession(preferredEP, allowFallback) {
    var ep = preferredEP || (await pickExecutionProvider());
    if (session && sessionEP === ep) return ep;

    post({ type: "stage", stage: "runtime" });
    try {
        ort = await import(ORT_BASE + (ep === "webgpu" ? "ort.webgpu.min.mjs" : "ort.wasm.min.mjs"));
    } catch (e) {
        throw fail("runtime-fetch", describe(e));
    }
    ort.env.wasm.wasmPaths = ORT_BASE;
    /* Multi-threaded WASM needs COOP/COEP headers and GitHub Pages cannot set
       them, so threads would silently fail to spawn. Ask for one and be honest
       about the speed instead. */
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = "error";

    var variant = MODEL_VARIANTS[ep];
    post({ type: "stage", stage: "model", ep: ep, bytes: variant.bytes });
    var weights = await fetchModel(variant.url, variant.bytes);

    post({ type: "stage", stage: "session" });
    try {
        session = await ort.InferenceSession.create(weights, {
            executionProviders: [ep],
            graphOptimizationLevel: "all"
        });
    } catch (e) {
        session = null;
        /* A GPU that advertises itself but can't compile the model leaves the
           user stranded on an error, so drop to the CPU path once rather than
           give up. It is a bigger download and much slower, which is why the
           page says so while it happens. */
        if (ep === "webgpu" && allowFallback !== false) {
            post({ type: "stage", stage: "fallback" });
            return ensureSession("wasm", false);
        }
        throw fail("session", describe(e));
    }
    sessionEP = ep;
    return ep;
}

/* ── Small numeric helpers ───────────────────────────────────────────────── */

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* Summed-area table in float64 — float32 loses too much precision once the
   running sum passes a few hundred thousand. */
function integral(src, w, h) {
    var I = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) {
        var rowSum = 0;
        var srcRow = y * w;
        var cur = (y + 1) * (w + 1);
        var prev = y * (w + 1);
        for (var x = 0; x < w; x++) {
            rowSum += src[srcRow + x];
            I[cur + x + 1] = I[prev + x + 1] + rowSum;
        }
    }
    return I;
}

/* Mean over a (2r+1)² window, clamped at the edges, O(1) per pixel. */
function boxMean(src, w, h, r) {
    var I = integral(src, w, h);
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
        var y0 = Math.max(0, y - r);
        var y1 = Math.min(h, y + r + 1);
        var top = y0 * (w + 1);
        var bottom = y1 * (w + 1);
        for (var x = 0; x < w; x++) {
            var x0 = Math.max(0, x - r);
            var x1 = Math.min(w, x + r + 1);
            var area = (x1 - x0) * (y1 - y0);
            out[y * w + x] = (I[bottom + x1] - I[bottom + x0] - I[top + x1] + I[top + x0]) / area;
        }
    }
    return out;
}

function multiply(a, b) {
    var out = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] * b[i];
    return out;
}

/* ── The full-resolution pass ────────────────────────────────────────────── */

/* Colour guided filter (He et al.), in its "fast" form: the per-window linear
   coefficients are solved on a subsampled grid, then applied at full
   resolution against the full-resolution guide. The edge detail therefore
   comes from the original pixels, not from the subsampled grid — which is the
   whole reason this is affordable on a 25MP photo.

   Returns the four coefficient planes at low resolution. */
function solveGuidedCoefficients(lr, lg, lb, lp, w2, h2, radius, eps) {
    var meanR = boxMean(lr, w2, h2, radius);
    var meanG = boxMean(lg, w2, h2, radius);
    var meanB = boxMean(lb, w2, h2, radius);
    var meanP = boxMean(lp, w2, h2, radius);

    var covRP = boxMean(multiply(lr, lp), w2, h2, radius);
    var covGP = boxMean(multiply(lg, lp), w2, h2, radius);
    var covBP = boxMean(multiply(lb, lp), w2, h2, radius);

    var varRR = boxMean(multiply(lr, lr), w2, h2, radius);
    var varRG = boxMean(multiply(lr, lg), w2, h2, radius);
    var varRB = boxMean(multiply(lr, lb), w2, h2, radius);
    var varGG = boxMean(multiply(lg, lg), w2, h2, radius);
    var varGB = boxMean(multiply(lg, lb), w2, h2, radius);
    var varBB = boxMean(multiply(lb, lb), w2, h2, radius);

    var aR = new Float32Array(w2 * h2);
    var aG = new Float32Array(w2 * h2);
    var aB = new Float32Array(w2 * h2);
    var bb = new Float32Array(w2 * h2);

    for (var i = 0; i < aR.length; i++) {
        var mr = meanR[i], mg = meanG[i], mb = meanB[i], mp = meanP[i];

        // Symmetric 3×3 covariance of the guide, ridge-regularised by eps.
        var s11 = varRR[i] - mr * mr + eps;
        var s12 = varRG[i] - mr * mg;
        var s13 = varRB[i] - mr * mb;
        var s22 = varGG[i] - mg * mg + eps;
        var s23 = varGB[i] - mg * mb;
        var s33 = varBB[i] - mb * mb + eps;

        var c11 = s22 * s33 - s23 * s23;
        var c12 = s13 * s23 - s12 * s33;
        var c13 = s12 * s23 - s13 * s22;
        var det = s11 * c11 + s12 * c12 + s13 * c13;

        var pr = covRP[i] - mr * mp;
        var pg = covGP[i] - mg * mp;
        var pb = covBP[i] - mb * mp;

        if (det > 1e-12 || det < -1e-12) {
            var c22 = s11 * s33 - s13 * s13;
            var c23 = s13 * s12 - s11 * s23;
            var c33 = s11 * s22 - s12 * s12;
            var inv = 1 / det;
            aR[i] = (c11 * pr + c12 * pg + c13 * pb) * inv;
            aG[i] = (c12 * pr + c22 * pg + c23 * pb) * inv;
            aB[i] = (c13 * pr + c23 * pg + c33 * pb) * inv;
        }
        bb[i] = mp - aR[i] * mr - aG[i] * mg - aB[i] * mb;
    }

    return {
        aR: boxMean(aR, w2, h2, radius),
        aG: boxMean(aG, w2, h2, radius),
        aB: boxMean(aB, w2, h2, radius),
        b: boxMean(bb, w2, h2, radius)
    };
}

/* Local background colour, for decontamination: a box blur of the image
   weighted by (1 - alpha), so only background-ish pixels contribute. */
function solveBackgroundColour(lr, lg, lb, lp, w2, h2, radius) {
    var weight = new Float32Array(w2 * h2);
    for (var i = 0; i < weight.length; i++) weight[i] = 1 - lp[i];
    return {
        r: boxMean(multiply(lr, weight), w2, h2, radius),
        g: boxMean(multiply(lg, weight), w2, h2, radius),
        b: boxMean(multiply(lb, weight), w2, h2, radius),
        w: boxMean(weight, w2, h2, radius)
    };
}

/* Bilinear read from a low-resolution plane, in full-resolution coordinates. */
function sampleLow(plane, w2, h2, fx, fy) {
    var x0 = Math.floor(fx);
    var y0 = Math.floor(fy);
    var tx = fx - x0;
    var ty = fy - y0;
    if (x0 < 0) { x0 = 0; tx = 0; }
    if (y0 < 0) { y0 = 0; ty = 0; }
    var x1 = x0 + 1 < w2 ? x0 + 1 : w2 - 1;
    var y1 = y0 + 1 < h2 ? y0 + 1 : h2 - 1;
    if (x0 > w2 - 1) x0 = w2 - 1;
    if (y0 > h2 - 1) y0 = h2 - 1;
    var r0 = y0 * w2;
    var r1 = y1 * w2;
    var top = plane[r0 + x0] + (plane[r0 + x1] - plane[r0 + x0]) * tx;
    var bottom = plane[r1 + x0] + (plane[r1 + x1] - plane[r1 + x0]) * tx;
    return top + (bottom - top) * ty;
}

/* Refine the model's mask against the real pixels and write the finished
   cutout back into `pixels` in place. `coarse` is the 1024×1024 alpha.

   Nothing full-resolution is allocated here beyond the pixel buffer we were
   given: the guide is downsampled straight out of it, and the model's alpha is
   read from the 1024² mask at the low-resolution grid. Materialising full-res
   float planes first would cost ~400MB on a 25MP photo, which is how a browser
   tab dies on a phone. */
function refine(pixels, w, h, coarse, coarseSize) {
    var n = w * h;

    // Keep the low-resolution grid near 1MP whatever we were handed.
    var s = Math.max(1, Math.min(8, Math.round(Math.sqrt(n / 1000000))));
    var w2 = Math.max(1, Math.ceil(w / s));
    var h2 = Math.max(1, Math.ceil(h / s));
    var radius = 4;
    var eps = 1e-5;

    var lr = new Float32Array(w2 * h2);
    var lg = new Float32Array(w2 * h2);
    var lb = new Float32Array(w2 * h2);
    var lp = new Float32Array(w2 * h2);

    var toCoarseX = coarseSize / w;
    var toCoarseY = coarseSize / h;

    for (var y2 = 0; y2 < h2; y2++) {
        var sy0 = y2 * s;
        var sy1 = Math.min(sy0 + s, h);
        for (var x2 = 0; x2 < w2; x2++) {
            var sx0 = x2 * s;
            var sx1 = Math.min(sx0 + s, w);
            var sumR = 0, sumG = 0, sumB = 0, count = 0;
            for (var yy = sy0; yy < sy1; yy++) {
                var base = yy * w;
                for (var xx = sx0; xx < sx1; xx++) {
                    var o = (base + xx) * 4;
                    sumR += pixels[o];
                    sumG += pixels[o + 1];
                    sumB += pixels[o + 2];
                    count++;
                }
            }
            var index = y2 * w2 + x2;
            if (count) {
                lr[index] = sumR / count / 255;
                lg[index] = sumG / count / 255;
                lb[index] = sumB / count / 255;
            }
            // The model's alpha, read at this cell's centre.
            var centreX = (sx0 + sx1) * 0.5;
            var centreY = (sy0 + sy1) * 0.5;
            lp[index] = clamp01(sampleLow(coarse, coarseSize, coarseSize, centreX * toCoarseX - 0.5, centreY * toCoarseY - 0.5));
        }
    }

    var coeff = solveGuidedCoefficients(lr, lg, lb, lp, w2, h2, radius, eps);
    var back = solveBackgroundColour(lr, lg, lb, lp, w2, h2, radius * 3);
    lr = lg = lb = lp = null;

    var covered = 0;
    for (var y = 0; y < h; y++) {
        var ly = (y + 0.5) / s - 0.5;
        var row = y * w;
        for (var x = 0; x < w; x++) {
            var offset = (row + x) * 4;
            var lx = (x + 0.5) / s - 0.5;

            var cr = pixels[offset] / 255;
            var cg = pixels[offset + 1] / 255;
            var cb = pixels[offset + 2] / 255;

            // q = a·I + b, with I at full resolution. This is the step that
            // puts the hair back.
            var a =
                sampleLow(coeff.aR, w2, h2, lx, ly) * cr +
                sampleLow(coeff.aG, w2, h2, lx, ly) * cg +
                sampleLow(coeff.aB, w2, h2, lx, ly) * cb +
                sampleLow(coeff.b, w2, h2, lx, ly);
            a = clamp01(a);
            if (a > 0.004) covered++;

            if (a > 0.02 && a < 0.985) {
                var bw = sampleLow(back.w, w2, h2, lx, ly);
                if (bw > 0.02) {
                    var br = sampleLow(back.r, w2, h2, lx, ly) / bw;
                    var bg = sampleLow(back.g, w2, h2, lx, ly) / bw;
                    var bb = sampleLow(back.b, w2, h2, lx, ly) / bw;
                    // C = aF + (1-a)B  ⇒  F = (C - (1-a)B) / a
                    var inv = 1 / a;
                    var rest = 1 - a;
                    pixels[offset] = clamp01((cr - rest * br) * inv) * 255;
                    pixels[offset + 1] = clamp01((cg - rest * bg) * inv) * 255;
                    pixels[offset + 2] = clamp01((cb - rest * bb) * inv) * 255;
                }
            }
            pixels[offset + 3] = a * 255;
        }
    }

    return covered / n;
}

/* ── Inference ───────────────────────────────────────────────────────────── */

/* The model input: a flat stretch to size², matching the model's own
   ViTFeatureExtractor, which does not preserve aspect ratio. */
function buildTensor(bitmap, size) {
    var input = new OffscreenCanvas(size, size);
    var inputCtx = input.getContext("2d", { willReadFrequently: true });
    inputCtx.imageSmoothingEnabled = true;
    inputCtx.imageSmoothingQuality = "high";
    inputCtx.drawImage(bitmap, 0, 0, size, size);
    var pixels = inputCtx.getImageData(0, 0, size, size).data;

    var plane = size * size;
    var tensor = new Float32Array(plane * 3);
    for (var i = 0, p = 0; i < plane; i++, p += 4) {
        tensor[i] = (pixels[p] / 255 - MEAN[0]) / STD[0];
        tensor[plane + i] = (pixels[p + 1] / 255 - MEAN[1]) / STD[1];
        tensor[plane * 2 + i] = (pixels[p + 2] / 255 - MEAN[2]) / STD[2];
    }
    return tensor;
}

async function decode(blob, maxPixels) {
    var bitmap;
    try {
        bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch (e) {
        throw fail("decode", describe(e));
    }

    var w = bitmap.width;
    var h = bitmap.height;
    if (!w || !h) throw fail("decode", "zero-sized image");

    // Only ever downscale, and only past the ceiling the page gave us.
    var scale = Math.min(1, Math.sqrt(maxPixels / (w * h)));
    var workW = Math.max(1, Math.round(w * scale));
    var workH = Math.max(1, Math.round(h * scale));

    var work = new OffscreenCanvas(workW, workH);
    var workCtx = work.getContext("2d", { willReadFrequently: true });
    workCtx.imageSmoothingEnabled = true;
    workCtx.imageSmoothingQuality = "high";
    workCtx.drawImage(bitmap, 0, 0, workW, workH);
    var image = workCtx.getImageData(0, 0, workW, workH);

    return { image: image, bitmap: bitmap, naturalWidth: w, naturalHeight: h };
}

async function run(message) {
    var ep = await ensureSession(message.ep);
    var size = MODEL_VARIANTS[ep].size;

    post({ type: "stage", stage: "decoding" });
    var prepared = await decode(message.blob, message.maxPixels || 25000000);

    try {
        post({ type: "stage", stage: "inferring" });
        var feeds = {};
        feeds.input_image = new ort.Tensor("float32", buildTensor(prepared.bitmap, size), [1, 3, size, size]);

        var output;
        try {
            output = await session.run(feeds);
        } catch (e) {
            /* A GPU can fail at run time as well as at session creation —
               which is exactly how the stock model failed on Apple hardware.
               Pay for the CPU model once rather than hand back an error. The
               input has to be rebuilt, because the two models take different
               input sizes. */
            if (ep === "webgpu") {
                post({ type: "stage", stage: "fallback" });
                session = null;
                sessionEP = "";
                ep = await ensureSession("wasm", false);
                size = MODEL_VARIANTS[ep].size;
                post({ type: "stage", stage: "inferring" });
                var retryFeeds = {};
                retryFeeds.input_image = new ort.Tensor("float32", buildTensor(prepared.bitmap, size), [1, 3, size, size]);
                try {
                    output = await session.run(retryFeeds);
                } catch (retryError) {
                    throw fail("inference", describe(retryError));
                }
            } else {
                throw fail("inference", describe(e));
            }
        }

        var logits = output.output_image ? output.output_image.data : output[Object.keys(output)[0]].data;

        // Sigmoid, and deliberately no threshold (see the file header).
        var coarse = new Float32Array(size * size);
        for (var i = 0; i < coarse.length; i++) coarse[i] = 1 / (1 + Math.exp(-logits[i]));

        post({ type: "stage", stage: "refining" });
        var covered = refine(prepared.image.data, prepared.image.width, prepared.image.height, coarse, size);

        if (covered < 0.0015) throw fail("no-subject");

        var buffer = prepared.image.data.buffer;
        post(
            {
                type: "result",
                pixels: prepared.image.data,
                width: prepared.image.width,
                height: prepared.image.height,
                naturalWidth: prepared.naturalWidth,
                naturalHeight: prepared.naturalHeight,
                ep: ep
            },
            [buffer]
        );
    } finally {
        prepared.bitmap.close();
    }
}

self.onmessage = async function (event) {
    var message = event.data;
    try {
        if (message.type === "plan") {
            var ep = message.ep || (await pickExecutionProvider());
            var cached = false;
            try {
                var cache = await caches.open(CACHE_NAME);
                cached = !!(await cache.match(MODEL_VARIANTS[ep].url));
            } catch (e) {
                cached = false;
            }
            post({ type: "plan", ep: ep, bytes: MODEL_VARIANTS[ep].bytes, cached: cached, ready: !!session });
            return;
        }
        if (message.type === "run") {
            await run(message);
            return;
        }
    } catch (error) {
        post({ type: "error", code: error.code || "unknown", detail: describe(error) });
    }
};
