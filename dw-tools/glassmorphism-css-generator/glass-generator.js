/* Glassmorphism CSS Generator — Design Wallet
   One settings object is the single source of truth. The preview styles and all
   three code strings are derived from it by pure functions (toCSS, toTailwind,
   toStyledComponents), so nothing can drift between what you see and what you copy. */

document.addEventListener("DOMContentLoaded", function () {
    var previewCard = document.getElementById("glass-preview-card");
    if (!previewCard) return;

    var codeOutput = document.getElementById("glass-code-output");
    var codePanel = document.getElementById("glass-code-panel");
    var copyButton = document.getElementById("glass-copy");
    var randomizeButton = document.getElementById("glass-randomize");
    var resetButton = document.getElementById("glass-reset");
    var glowSwitch = document.getElementById("glass-glow");
    var glowIntensityField = document.getElementById("glass-glow-intensity-field");
    var tintPicker = document.getElementById("glass-tint");
    var tintHexInput = document.getElementById("glass-tint-hex");
    var toast = document.getElementById("glass-toast");

    var toastTimer = 0;
    var copyResetTimer = 0;
    var frameRequest = 0;
    var currentFormat = "css";
    // settings key -> true while that control is pinned against Randomize.
    var locked = {};
    var codeCache = { css: "", tailwind: "", react: "" };

    var SELECTOR = ".glass-card";

    var DEFAULTS = {
        blur: 20,
        transparency: 0.15,
        saturation: 180,
        tint: "#FFFFFF",
        radius: 20,
        borderWidth: 1,
        borderOpacity: 0.3,
        depth: 10,
        dropShadow: 0,
        glow: true,
        glowIntensity: 0.5
    };

    var settings = clone(DEFAULTS);

    /* Every slider: the element id, the settings key it writes, how its readout
       is formatted, and the sub-range Randomize is allowed to pick from. Adding a
       slider means adding a row here and the markup — nothing else. */
    var SLIDERS = [
        { id: "glass-blur", key: "blur", unit: "px", places: 0, random: [10, 30] },
        { id: "glass-transparency", key: "transparency", unit: "", places: 2, random: [0.05, 0.25] },
        { id: "glass-saturation", key: "saturation", unit: "%", places: 0, random: [120, 200] },
        { id: "glass-radius", key: "radius", unit: "px", places: 0, random: [8, 36] },
        { id: "glass-border-width", key: "borderWidth", unit: "px", places: 2, random: [1, 2] },
        { id: "glass-border-opacity", key: "borderOpacity", unit: "", places: 2, random: [0.15, 0.45] },
        { id: "glass-depth", key: "depth", unit: "", places: 0, random: [4, 20] },
        { id: "glass-drop-shadow", key: "dropShadow", unit: "px", places: 2, random: [0, 10] },
        { id: "glass-glow-intensity", key: "glowIntensity", unit: "", places: 2, random: [0.3, 0.8] }
    ];

    // ── Small helpers ────────────────────────────────────────────────────────

    function clone(source) {
        var copy = {};
        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) copy[key] = source[key];
        }
        return copy;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function expandHex(hex) {
        var value = String(hex || "").trim().replace(/^#/, "");
        if (/^[0-9a-fA-F]{3}$/.test(value)) {
            value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
        }
        return /^[0-9a-fA-F]{6}$/.test(value) ? "#" + value.toUpperCase() : null;
    }

    function hexToRgb(hex) {
        var normalized = expandHex(hex) || "#FFFFFF";
        return {
            r: parseInt(normalized.slice(1, 3), 16),
            g: parseInt(normalized.slice(3, 5), 16),
            b: parseInt(normalized.slice(5, 7), 16)
        };
    }

    // 0.30 → "0.3", 1 → "1". Keeps generated rgba() values tidy.
    function alphaText(value) {
        return String(Math.round(clamp(value, 0, 1) * 1000) / 1000);
    }

    function rgba(hex, alpha) {
        var rgb = hexToRgb(hex);
        return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alphaText(alpha) + ")";
    }

    function formatValue(value, places, unit) {
        var text = places > 0 ? Number(value).toFixed(places) : String(Math.round(value));
        return text + unit;
    }

    // ── Derived style pieces (shared by the preview and all three formatters) ──

    function backdropFilter(state) {
        var parts = [];
        if (state.blur > 0) parts.push("blur(" + state.blur + "px)");
        if (state.saturation !== 100) parts.push("saturate(" + state.saturation + "%)");
        return parts.join(" ");
    }

    function backgroundFill(state) {
        return rgba(state.tint, state.transparency);
    }

    function borderValue(state) {
        if (state.borderWidth <= 0) return "";
        return state.borderWidth + "px solid " + rgba(state.tint, state.borderOpacity);
    }

    /* Depth scales the outer shadow as 0 (0.8×depth)px (3.2×depth)px — so the
       default depth of 10 lands on the reference's 0 8px 32px. */
    function shadowLayers(state) {
        var layers = [];
        if (state.depth > 0) {
            layers.push("0 " + Math.round(state.depth * 0.8) + "px " + Math.round(state.depth * 3.2) + "px rgba(0, 0, 0, 0.1)");
        }
        if (state.glow && state.glowIntensity > 0) {
            layers.push("inset 0 1px 0 " + rgba(state.tint, state.glowIntensity));
        }
        return layers;
    }

    /* Drop shadow is a real filter: drop-shadow(), not another box-shadow — it
       follows the card's alpha shape rather than its border box, which is the
       whole reason to have it alongside Depth. The Y offset tracks the blur so a
       single slider still reads like a shadow rather than a blur radius. */
    function dropShadowFilter(state) {
        if (!state.dropShadow) return "";
        return "drop-shadow(0 " + (state.dropShadow * 0.34).toFixed(2) + "px " +
            state.dropShadow.toFixed(2) + "px rgba(0, 0, 0, 0.35))";
    }

    // The lit-glass edge: a gradient stroke masked to the border box.
    function edgeGradient(state) {
        return "linear-gradient(135deg, " + rgba(state.tint, state.glowIntensity * 0.7) + " 0%, " +
            rgba(state.tint, 0) + " 45%, " + rgba(state.tint, 0) + " 55%, " +
            rgba(state.tint, state.glowIntensity * 0.25) + " 100%)";
    }

    function sheenGradient(state) {
        return "linear-gradient(160deg, " + rgba(state.tint, state.glowIntensity * 0.16) + " 0%, " +
            rgba(state.tint, 0) + " 55%)";
    }

    function edgeThickness(state) {
        return Math.max(state.borderWidth, 1);
    }

    // ── Rule building ────────────────────────────────────────────────────────

    /* Declarations are built once as structured blocks, then rendered by both the
       CSS and styled-components formatters. Keeping them structured is what lets
       React nest the pseudo-elements as `&::before` without re-parsing CSS text. */

    var EDGE_COMMENT = "/* Edge highlight — a gradient stroke masked to the border box. */";
    var SHEEN_COMMENT = "/* Top-left sheen. */";

    function baseDeclarations(state) {
        var filter = backdropFilter(state);
        var border = borderValue(state);
        var shadows = shadowLayers(state);
        var declarations = [];

        // Required by the ::before/::after highlight layers below.
        if (state.glow) declarations.push("position: relative;");
        declarations.push("background: " + backgroundFill(state) + ";");
        if (filter) {
            declarations.push("backdrop-filter: " + filter + ";");
            declarations.push("-webkit-backdrop-filter: " + filter + ";");
        }
        declarations.push("border-radius: " + state.radius + "px;");
        if (border) declarations.push("border: " + border + ";");
        if (shadows.length === 1) {
            declarations.push("box-shadow: " + shadows[0] + ";");
        } else if (shadows.length > 1) {
            declarations.push("box-shadow:\n" + shadows.map(function (layer) {
                return "  " + layer;
            }).join(",\n") + ";");
        }
        var drop = dropShadowFilter(state);
        if (drop) declarations.push("filter: " + drop + ";");
        return declarations;
    }

    function edgeDeclarations(state) {
        return [
            "content: \"\";",
            "position: absolute;",
            "inset: 0;",
            "padding: " + edgeThickness(state) + "px;",
            "border-radius: inherit;",
            "background: " + edgeGradient(state) + ";",
            "-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);",
            "-webkit-mask-composite: xor;",
            "mask-composite: exclude;",
            "pointer-events: none;"
        ];
    }

    function sheenDeclarations(state) {
        return [
            "content: \"\";",
            "position: absolute;",
            "inset: 0;",
            "border-radius: inherit;",
            "background: " + sheenGradient(state) + ";",
            "pointer-events: none;"
        ];
    }

    // Indents a declaration by `pad`, carrying continuation lines with it.
    function pushDeclarations(target, declarations, pad) {
        declarations.forEach(function (declaration) {
            target.push(declaration.split("\n").map(function (part) {
                return part ? pad + part : part;
            }).join("\n"));
        });
    }

    function renderRule(selector, declarations, indent) {
        var lines = [indent + selector + " {"];
        pushDeclarations(lines, declarations, indent + "  ");
        lines.push(indent + "}");
        return lines.join("\n");
    }

    // ── Formatters ───────────────────────────────────────────────────────────

    function toCSS(state) {
        var lines = [renderRule(SELECTOR, baseDeclarations(state), "")];
        if (state.glow) {
            lines.push("");
            lines.push(EDGE_COMMENT);
            lines.push(renderRule(SELECTOR + "::before", edgeDeclarations(state), ""));
            lines.push("");
            lines.push(SHEEN_COMMENT);
            lines.push(renderRule(SELECTOR + "::after", sheenDeclarations(state), ""));
        }
        return lines.join("\n");
    }

    /* Tailwind can't express the ::before/::after edge highlights as utilities, so
       everything expressible is folded into one arbitrary shadow-[…] value and a
       comment points at the CSS tab for exact parity. */
    function toTailwind(state) {
        var rgb = hexToRgb(state.tint);
        var isWhite = rgb.r === 255 && rgb.g === 255 && rgb.b === 255;
        var isBlack = rgb.r === 0 && rgb.g === 0 && rgb.b === 0;
        var classes = [];

        function colorClass(prefix, alpha) {
            var percent = Math.round(clamp(alpha, 0, 1) * 100);
            if (isWhite) return prefix + "-white/" + percent;
            if (isBlack) return prefix + "-black/" + percent;
            return prefix + "-[rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alphaText(alpha) + ")]";
        }

        if (state.blur > 0) classes.push("backdrop-blur-[" + state.blur + "px]");
        if (state.saturation !== 100) classes.push("backdrop-saturate-[" + (state.saturation / 100) + "]");
        classes.push(colorClass("bg", state.transparency));
        classes.push("rounded-[" + state.radius + "px]");

        if (state.borderWidth > 0) {
            classes.push(state.borderWidth === 1 ? "border" : "border-[" + state.borderWidth + "px]");
            classes.push(colorClass("border", state.borderOpacity));
        }

        var shadows = shadowLayers(state);
        if (shadows.length) {
            classes.push("shadow-[" + shadows.join(",").replace(/, /g, ",").replace(/ /g, "_") + "]");
        }

        var drop = dropShadowFilter(state);
        if (drop) {
            classes.push("drop-shadow-[" + drop.slice("drop-shadow(".length, -1).replace(/, /g, ",").replace(/ /g, "_") + "]");
        }

        // Wrap the class list so a long line stays readable when pasted.
        var wrapped = [];
        var line = "";
        classes.forEach(function (name) {
            if (line && (line.length + name.length + 1) > 58) {
                wrapped.push(line);
                line = name;
                return;
            }
            line = line ? line + " " + name : name;
        });
        if (line) wrapped.push(line);

        var indent = "\n            ";
        var out = "";
        if (state.glow) {
            out += "<!-- Note: ::before/::after edge highlights omitted — see CSS tab for full effect -->\n";
        }
        out += "<div class=\"" + wrapped.join(indent) + "\">\n</div>";
        return out;
    }

    function toStyledComponents(state) {
        var lines = ["const GlassCard = styled.div`"];
        pushDeclarations(lines, baseDeclarations(state), "  ");
        if (state.glow) {
            lines.push("");
            lines.push("  " + EDGE_COMMENT);
            lines.push(renderRule("&::before", edgeDeclarations(state), "  "));
            lines.push("");
            lines.push("  " + SHEEN_COMMENT);
            lines.push(renderRule("&::after", sheenDeclarations(state), "  "));
        }
        lines.push("`;");
        return lines.join("\n");
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    function applyPreview(state) {
        var filter = backdropFilter(state) || "none";
        var shadows = shadowLayers(state);

        previewCard.style.setProperty("--g-background", backgroundFill(state));
        previewCard.style.setProperty("--g-backdrop", filter);
        previewCard.style.setProperty("--g-radius", state.radius + "px");
        previewCard.style.setProperty("--g-border", borderValue(state) || "0 solid transparent");
        previewCard.style.setProperty("--g-shadow", shadows.length ? shadows.join(", ") : "none");
        previewCard.style.setProperty("--g-filter", dropShadowFilter(state) || "none");
        previewCard.style.setProperty("--g-edge", edgeGradient(state));
        previewCard.style.setProperty("--g-sheen", sheenGradient(state));
        previewCard.style.setProperty("--g-edge-width", edgeThickness(state) + "px");
        previewCard.setAttribute("data-glow", state.glow ? "on" : "off");
    }

    function renderCode(state) {
        codeCache.css = toCSS(state);
        codeCache.tailwind = toTailwind(state);
        codeCache.react = toStyledComponents(state);
        codeOutput.textContent = codeCache[currentFormat];
    }

    /* Coalesced into one frame so dragging a slider never queues more work than
       the browser can paint. */
    function render() {
        if (frameRequest) return;
        // Latch before scheduling: assigning the handle after the fact would let a
        // synchronously-invoked frame clear the flag first and jam it on forever.
        frameRequest = 1;
        window.requestAnimationFrame(function () {
            frameRequest = 0;
            applyPreview(settings);
            renderCode(settings);
        });
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    function syncSlider(config) {
        var input = document.getElementById(config.id);
        var readout = document.getElementById(config.id + "-value");
        if (!input) return;
        input.value = settings[config.key];
        if (readout) readout.textContent = formatValue(settings[config.key], config.places, config.unit);
    }

    SLIDERS.forEach(function (config) {
        var input = document.getElementById(config.id);
        var readout = document.getElementById(config.id + "-value");
        if (!input) return;

        input.addEventListener("input", function () {
            settings[config.key] = Number(input.value);
            if (readout) readout.textContent = formatValue(settings[config.key], config.places, config.unit);
            render();
        });
    });

    function setTint(hex, syncPicker, syncText) {
        var normalized = expandHex(hex);
        if (!normalized) {
            tintHexInput.setAttribute("aria-invalid", "true");
            return;
        }
        tintHexInput.removeAttribute("aria-invalid");
        settings.tint = normalized;
        if (syncPicker) tintPicker.value = normalized;
        if (syncText) tintHexInput.value = normalized;
        render();
    }

    tintPicker.addEventListener("input", function () {
        setTint(tintPicker.value, false, true);
    });

    tintHexInput.addEventListener("input", function () {
        setTint(tintHexInput.value, true, false);
    });

    // A half-typed hex leaves the field invalid; restore the live value on blur.
    tintHexInput.addEventListener("blur", function () {
        tintHexInput.value = settings.tint;
        tintHexInput.removeAttribute("aria-invalid");
    });

    function setGlow(on) {
        settings.glow = on;
        glowSwitch.setAttribute("aria-checked", on ? "true" : "false");
        glowIntensityField.classList.toggle("is-disabled", !on);
        var intensityInput = document.getElementById("glass-glow-intensity");
        if (intensityInput) intensityInput.disabled = !on;
        render();
    }

    glowSwitch.addEventListener("click", function () {
        setGlow(glowSwitch.getAttribute("aria-checked") !== "true");
    });

    function syncAllControls() {
        SLIDERS.forEach(syncSlider);
        tintPicker.value = settings.tint;
        tintHexInput.value = settings.tint;
        tintHexInput.removeAttribute("aria-invalid");
        setGlow(settings.glow);
    }

    // ── Locks ────────────────────────────────────────────────────────────────

    /* A lock only pins a control against Randomize — it never stops you dragging
       the slider yourself. That is the point: pin what already looks right, then
       keep rolling the rest. */
    var lockButtons = Array.prototype.slice.call(document.querySelectorAll(".glass-lock"));

    function setLock(button, on) {
        locked[button.getAttribute("data-lock")] = on;
        button.setAttribute("aria-pressed", on ? "true" : "false");
        var field = button.closest(".glass-field");
        if (field) field.classList.toggle("is-locked", on);
    }

    lockButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            setLock(button, button.getAttribute("aria-pressed") !== "true");
        });
    });

    // ── Randomize ────────────────────────────────────────────────────────────

    function randomInRange(min, max, places) {
        var value = min + Math.random() * (max - min);
        var factor = Math.pow(10, places);
        return Math.round(value * factor) / factor;
    }

    randomizeButton.addEventListener("click", function () {
        SLIDERS.forEach(function (config) {
            if (locked[config.key]) return;
            settings[config.key] = randomInRange(config.random[0], config.random[1], config.places);
        });
        // Mostly white glass, occasionally a light tint — the extremes rarely look good.
        if (!locked.tint) {
            settings.tint = Math.random() < 0.65
                ? "#FFFFFF"
                : expandHex("#" + ("00000" + Math.floor(Math.random() * 0xffffff).toString(16)).slice(-6));
        }
        if (!locked.glow) settings.glow = Math.random() < 0.8;
        syncAllControls();
        render();
    });

    // Reset is the start-over button: defaults back, and every lock released.
    resetButton.addEventListener("click", function () {
        settings = clone(DEFAULTS);
        lockButtons.forEach(function (button) {
            setLock(button, false);
        });
        syncAllControls();
        render();
    });

    // ── Code tabs ────────────────────────────────────────────────────────────

    var tabs = Array.prototype.slice.call(document.querySelectorAll(".glass-code-tabs [role=\"tab\"]"));

    function selectTab(tab, focus) {
        tabs.forEach(function (other) {
            var active = other === tab;
            other.classList.toggle("is-active", active);
            other.setAttribute("aria-selected", active ? "true" : "false");
            other.tabIndex = active ? 0 : -1;
        });
        currentFormat = tab.getAttribute("data-format");
        codePanel.setAttribute("aria-labelledby", tab.id);
        codeOutput.textContent = codeCache[currentFormat];
        if (focus) tab.focus();
    }

    tabs.forEach(function (tab, index) {
        tab.addEventListener("click", function () {
            selectTab(tab, false);
        });
        tab.addEventListener("keydown", function (event) {
            var next = null;
            if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
            if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
            if (event.key === "Home") next = tabs[0];
            if (event.key === "End") next = tabs[tabs.length - 1];
            if (!next) return;
            event.preventDefault();
            selectTab(next, true);
        });
    });

    // ── Copy ─────────────────────────────────────────────────────────────────

    function showToast(message) {
        if (!toast) return;
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.hidden = false;
        toastTimer = window.setTimeout(function () {
            toast.hidden = true;
        }, 1600);
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var helper = document.createElement("textarea");
            helper.value = text;
            helper.setAttribute("readonly", "");
            helper.style.position = "fixed";
            helper.style.opacity = "0";
            document.body.appendChild(helper);
            helper.select();
            try {
                document.execCommand("copy");
                resolve();
            } catch (error) {
                reject(error);
            } finally {
                document.body.removeChild(helper);
            }
        });
    }

    copyButton.addEventListener("click", function () {
        copyText(codeCache[currentFormat]).then(function () {
            clearTimeout(copyResetTimer);
            copyButton.classList.add("is-copied");
            showToast("Copied " + currentFormat.toUpperCase());
            copyResetTimer = window.setTimeout(function () {
                copyButton.classList.remove("is-copied");
            }, 1600);
        }).catch(function () {
            showToast("Copy failed — select the code and copy manually");
        });
    });

    syncAllControls();
    applyPreview(settings);
    renderCode(settings);
});
