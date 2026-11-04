/* ============================================================================
   Design Wallet MCP page — pixel bands, app tabs, prompt showcase, copy
   buttons, and Google Analytics events for each (the clicks are the
   conversions we can count; the connection itself happens inside the AI app).
   ============================================================================ */

(function () {
    // ── Pixel bands ───────────────────────────────────────────────────────
    // "column,row,opacity" for each filled 30px cell, exported from the Figma
    // bands (887:67 for the hero, 885:366 for the fill-only decoration).
    var BANDS = {
        hero: "0,0,0.14 16,0,0.14 20,0,0.32 31,0,0.32 38,0,0.14 44,0,0.14 32,1,0.6 38,1,0.32 39,1,0.14 41,1,0.32 18,2,0.14 19,2,0.14 21,2,0.32 24,2,1 25,2,0.32 27,2,0.32 28,2,1 31,2,1 32,2,1 35,2,0.14 36,2,0.32 37,2,0.6 13,3,0.14 18,3,0.32 24,3,0.6 26,3,0.14 27,3,1 29,3,0.6 31,3,0.6 32,3,0.14 33,3,1 38,3,0.32 39,3,0.14 5,4,0.14 13,4,0.14 19,4,0.32 23,4,0.14 24,4,0.14 25,4,0.14 26,4,1 27,4,0.14 28,4,0.6 29,4,0.32 31,4,0.6 33,4,0.32 34,4,0.14 37,4,0.6 39,4,0.14 41,4,0.14",
        deco: "20,0,0.32 31,0,0.32 38,0,0.14 44,0,0.14 32,1,0.6 38,1,0.32 39,1,0.14 41,1,0.32 18,2,0.14 19,2,0.14 21,2,0.32 24,2,1 25,2,0.32 27,2,0.32 28,2,1 31,2,1 32,2,1 35,2,0.14 36,2,0.32 37,2,0.6 18,3,0.32 24,3,0.6 26,3,0.14 27,3,1 29,3,0.6 31,3,0.6 32,3,0.14 33,3,1 38,3,0.32 39,3,0.14 19,4,0.32 23,4,0.14 24,4,0.14 25,4,0.14 26,4,1 27,4,0.14 28,4,0.6 29,4,0.32 31,4,0.6 33,4,0.32 34,4,0.14 37,4,0.6 39,4,0.14 41,4,0.14"
    };

    Array.prototype.forEach.call(document.querySelectorAll("[data-band]"), function (band) {
        var cells = document.createElement("div");
        cells.className = "mcp-band-cells";
        BANDS[band.getAttribute("data-band")].split(" ").forEach(function (cell) {
            var p = cell.split(",");
            var i = document.createElement("i");
            i.style.left = (p[0] * 30) + "px";
            i.style.top = (p[1] * 30) + "px";
            i.style.setProperty("--o", p[2]);
            // Glitter about half the cells, each on its own rhythm.
            if (Math.random() < 0.5) {
                i.className = "is-glitter";
                i.style.setProperty("--d", (2.5 + Math.random() * 3.5).toFixed(2) + "s");
                i.style.setProperty("--delay", (-Math.random() * 6).toFixed(2) + "s");
            }
            cells.appendChild(i);
        });
        band.insertBefore(cells, band.firstChild);
    });

    // ── Headline typewriter ───────────────────────────────────────────────
    // Types each phrase from the Figma list (Section 2, 885:679), pauses,
    // deletes it and types the next. Screen readers get the static copy
    // beside it; reduced motion keeps the first phrase.
    var typed = document.querySelector(".mcp-typed");
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typed && !reduceMotion) {
        var words = typed.getAttribute("data-words").split("|");
        var word = 0;
        var chars = words[0].length;
        var deleting = true;

        var tick = function () {
            var current = words[word];
            if (deleting) {
                chars--;
                typed.textContent = current.slice(0, chars);
                if (chars === 0) {
                    deleting = false;
                    word = (word + 1) % words.length;
                    setTimeout(tick, 280);
                    return;
                }
                setTimeout(tick, 38);
            } else {
                current = words[word];
                chars++;
                typed.textContent = current.slice(0, chars);
                if (chars === current.length) {
                    deleting = true;
                    setTimeout(tick, 1800);
                    return;
                }
                setTimeout(tick, 75);
            }
        };
        setTimeout(tick, 1800);
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    var toast = document.querySelector(".mcp-toast");
    var toastTimer = null;
    var urlEl = document.querySelector("[data-mcp-url]");
    var MCP_URL = urlEl ? (urlEl.getAttribute("data-mcp-url") || urlEl.textContent).trim() : "";

    function track(name, params) {
        if (typeof window.gtag === "function") window.gtag("event", name, params || {});
    }

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.hidden = true; }, 2400);
    }

    function copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        // Older browsers and non-secure contexts: a hidden textarea.
        return new Promise(function (resolve, reject) {
            var area = document.createElement("textarea");
            area.value = text;
            area.setAttribute("readonly", "");
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            var ok = document.execCommand("copy");
            document.body.removeChild(area);
            if (ok) resolve(); else reject(new Error("copy failed"));
        });
    }

    // ── Copy buttons ──────────────────────────────────────────────────────
    document.addEventListener("click", function (event) {
        var button = event.target.closest("[data-copy]");
        if (!button) return;
        event.stopPropagation();

        var kind = button.getAttribute("data-copy");
        var text = "";
        if (kind === "url") {
            text = MCP_URL;
        } else if (kind === "code") {
            var code = button.parentNode.querySelector("pre");
            text = code ? code.textContent : "";
        } else if (kind === "prompt") {
            var prompt = button.parentNode.querySelector("[data-prompt]");
            text = prompt ? prompt.textContent.trim() : "";
        }
        if (!text) return;

        copy(text).then(function () {
            showToast(kind === "prompt" ? "Prompt copied. Paste it into Claude." : "Copied.");
            var label = button.querySelector("[data-label]");
            if (label) {
                var original = label.textContent;
                label.textContent = "Copied";
                setTimeout(function () { label.textContent = original; }, 1600);
            }
            track("mcp_copy", { kind: kind });
        }, function () {
            showToast("Couldn't copy. Select the text and copy it by hand.");
        });
    }, true);

    // "Connect to Claude": copy the URL first, so it's ready to paste in the
    // connector form the link opens.
    var connect = document.querySelector('[data-connect="claude"]');
    if (connect) {
        connect.addEventListener("click", function () {
            copy(MCP_URL).then(function () {
                showToast("Connector URL copied. Paste it in Claude.");
            }, function () {});
            track("mcp_connect_click", { app: "claude" });
        });
    }

    // ── Remembered selection ──────────────────────────────────────────────
    // The page starts fresh on every load, so a reload (back/forward, a
    // discarded background tab) used to drop the reader back on Claude. The
    // chosen app and prompt are kept for the browser session; ?app=cursor
    // also opens straight on an app, for links shared with setup help.
    var STORE_APP = "dw-mcp-app";
    var STORE_PROMPT = "dw-mcp-prompt";

    function remember(key, value) {
        try { sessionStorage.setItem(key, value); } catch (e) { /* private mode: fine */ }
    }

    function recall(key) {
        try { return sessionStorage.getItem(key); } catch (e) { return null; }
    }

    // ── App tabs (WAI-ARIA tabs: arrow keys move between tabs) ───────────
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".mcp-tab"));

    function selectTab(tab, focus, restoring) {
        tabs.forEach(function (t) {
            var on = t === tab;
            t.setAttribute("aria-selected", on ? "true" : "false");
            t.tabIndex = on ? 0 : -1;
            var panel = document.getElementById(t.getAttribute("aria-controls"));
            if (panel) panel.hidden = !on;
        });
        var app = tab.id.replace(/^tab-/, "");
        remember(STORE_APP, app);
        if (restoring) {
            // Bring the tab into view inside the strip without moving the page.
            var strip = tab.parentNode;
            strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
            return;
        }
        if (focus) tab.focus();
        tab.scrollIntoView({ block: "nearest", inline: "nearest" });
        track("mcp_tab", { app: app });
    }

    tabs.forEach(function (tab, i) {
        tab.addEventListener("click", function () { selectTab(tab, false); });
        tab.addEventListener("keydown", function (event) {
            var next = null;
            if (event.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
            else if (event.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
            else if (event.key === "Home") next = tabs[0];
            else if (event.key === "End") next = tabs[tabs.length - 1];
            if (next) {
                event.preventDefault();
                selectTab(next, true);
            }
        });
    });

    // ── Prompt showcase ───────────────────────────────────────────────────
    // Desktop picks with the card list, mobile with the capsules; both drive
    // the same Ask → Search → Answer flow and the mobile prompt box.
    var cards = Array.prototype.slice.call(document.querySelectorAll(".mcp-card"));
    var caps = Array.prototype.slice.call(document.querySelectorAll(".mcp-cap"));
    var flows = Array.prototype.slice.call(document.querySelectorAll(".mcp-flow"));
    var boxPrompt = document.querySelector(".mcp-pbox [data-prompt]");

    function selectFlow(index, focusCard, restoring) {
        cards.forEach(function (card, i) {
            var on = i === index;
            card.setAttribute("aria-selected", on ? "true" : "false");
            card.tabIndex = on ? 0 : -1;
        });
        caps.forEach(function (cap, i) {
            cap.setAttribute("aria-pressed", i === index ? "true" : "false");
        });
        flows.forEach(function (flow, i) { flow.hidden = i !== index; });
        var prompt = cards[index] && cards[index].querySelector("[data-prompt]");
        if (boxPrompt && prompt) boxPrompt.textContent = prompt.textContent;
        remember(STORE_PROMPT, String(index));
        if (restoring) {
            // Scroll the card list and capsule row to the choice, not the page.
            var card = cards[index], cap = caps[index];
            if (card) card.parentNode.scrollTop = card.offsetTop - 20;
            if (cap) cap.parentNode.scrollLeft = cap.offsetLeft - 16;
            return;
        }
        if (focusCard && cards[index]) cards[index].focus();
        track("mcp_prompt", { index: index });
    }

    cards.forEach(function (card, i) {
        card.addEventListener("click", function () { selectFlow(i, false); });
        card.addEventListener("keydown", function (event) {
            var next = null;
            if (event.key === "ArrowDown") next = (i + 1) % cards.length;
            else if (event.key === "ArrowUp") next = (i - 1 + cards.length) % cards.length;
            else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectFlow(i, false); return; }
            if (next !== null) {
                event.preventDefault();
                selectFlow(next, true);
            }
        });
    });

    caps.forEach(function (cap, i) {
        cap.addEventListener("click", function () {
            selectFlow(i, false);
            cap.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
        });
    });

    // ── FAQ: smooth open and close ────────────────────────────────────────
    // <details> opens instantly by default. Each answer is wrapped so its
    // height can be animated; the summary click is handled here instead.
    Array.prototype.forEach.call(document.querySelectorAll(".mcp-faq"), function (item) {
        var summary = item.querySelector("summary");
        var answer = item.querySelector("p");
        if (!summary || !answer) return;

        var icon = document.createElement("span");
        icon.className = "mcp-faq-icon";
        icon.setAttribute("aria-hidden", "true");
        summary.appendChild(icon);

        var body = document.createElement("div");
        body.className = "mcp-faq-body";
        item.insertBefore(body, answer);
        body.appendChild(answer);

        var animation = null;

        function finish(open) {
            animation = null;
            item.open = open;
            body.style.height = "";
            body.style.opacity = "";
        }

        summary.addEventListener("click", function (event) {
            event.preventDefault();
            var opening = !item.classList.contains("is-open");
            item.classList.toggle("is-open", opening);
            track("mcp_faq", { open: opening });

            if (reduceMotion || !body.animate) {
                item.open = opening;
                return;
            }

            // Start from wherever a running animation left off. A closed
            // <details> still reports its content's height, so from fully
            // closed the slide starts at 0.
            var from = item.open ? body.getBoundingClientRect().height : 0;
            if (animation) animation.cancel();
            if (opening) item.open = true;
            var to = opening ? body.scrollHeight : 0;

            animation = body.animate(
                [
                    { height: from + "px", opacity: opening ? 0 : 1 },
                    { height: to + "px", opacity: opening ? 1 : 0 }
                ],
                { duration: 320, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
            );
            animation.onfinish = function () { finish(opening); };
        });
    });

    // ── Restore on load ───────────────────────────────────────────────────
    var askedApp = new URLSearchParams(location.search).get("app");
    var savedApp = document.getElementById("tab-" + (askedApp || recall(STORE_APP)));
    if (savedApp && tabs.indexOf(savedApp) !== -1) selectTab(savedApp, false, true);

    var savedPrompt = parseInt(recall(STORE_PROMPT), 10);
    if (savedPrompt > 0 && savedPrompt < flows.length) selectFlow(savedPrompt, false, true);
}());
