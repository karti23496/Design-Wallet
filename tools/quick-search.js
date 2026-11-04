// Quick search pop-up — Figma 1135:1959. Clicking the dashboard search bar opens
// it. tools.js owns the catalogue and calls DWQuickSearch.attach() with it, so
// this file holds no data of its own.
//
// Keyword search only: "just ask" strips the question words and searches what
// is left. There is no AI behind it. See DECISIONS, "Quick search pop-up".
(function () {
    // Hand-picked, not from search logs (none are kept). A term or question
    // with no live matches is not shown, so none can be a dead end.
    var SEARCH_TERMS = [
        "logo", "icons", "mockup", "3d", "color", "gradient", "fonts", "video", "portfolio",
        "pattern", "motion", "design system", "illustration", "landing page"
    ];

    // `q` is what actually gets searched. `href` goes straight to a page.
    var QUESTIONS = [
        { text: "Where do I find free icons?", q: "free icons" },
        { text: "Which AI tools help me design UI?", q: "ai ui" },
        { text: "Which illustrations suit a SaaS landing page?", q: "illustrations saas" },
        { text: "Where can I see real app UI patterns?", q: "ui patterns" },
        { text: "What should a senior product designer earn?", href: "/salary/" }
    ];

    // Sheet slugs, in the order of the Figma grid. A slug not in the live data
    // is skipped.
    var CATEGORY_TILES = [
        "ai-tools", "icons", "design-inspirations", "illustrations", "color-palatte", "typography",
        "landing-pages-inspirations", "ui-ux-inspirations", "design-communities", "youtube-channels", "design-podcasts", "branding",
        "img-gen", "vibe-coding", "mcp-connectors", "design-jobs", "design-portfolios"
    ];

    // The Sheet's spelling is "Color Palatte"; the slug has to stay as it is.
    var LABEL_FIXES = { "color-palatte": "Color Palette" };

    var STOP_WORDS = ("a an and are best can do does find for from get good help i in is it me my of on or see " +
        "should show some suit that the to tools use what where which who why with").split(" ");

    var MAX_TOOLS = 4;
    var MAX_CATEGORIES = 2;

    var SEARCH_ICON = '<svg class="qs-field-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 21l-4.3-4.3"/><path d="M11 4.2A7 7 0 1 0 18 11"/><path d="M18 2.5l.75 2.25L21 5.5l-2.25.75L18 8.5l-.75-2.25L15 5.5l2.25-.75L18 2.5Z"/></svg>';
    var HASH_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>';

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function tokens(text) {
        return String(text || "").toLowerCase().split(/[^a-z0-9+#.-]+/)
            .map(function (w) { return w.replace(/^[.-]+|[.-]+$/g, ""); })
            .filter(Boolean);
    }

    // Question words are dropped, unless that would leave nothing to search.
    function queryTerms(text) {
        var preset = QUESTIONS.filter(function (item) { return item.text === text && item.q; })[0];
        var words = tokens(preset ? preset.q : text);
        var kept = words.filter(function (w) { return STOP_WORDS.indexOf(w) === -1; });
        return kept.length ? kept : words;
    }

    // A short term must start a word, or "ui" finds "build" and "ai" finds
    // "email". A longer one may sit anywhere ("icons" finds "Boxicons"), and
    // loses a plural so "fonts" also finds "font".
    function termMatcher(term) {
        if (term.length <= 3) {
            var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            var pattern = new RegExp("(^|[^a-z0-9])" + escaped);
            return function (text) { return pattern.test(text); };
        }
        var stem = term.length >= 5 ? term.replace(/s$/, "") : term;
        return function (text) { return text.indexOf(stem) !== -1; };
    }

    function toolFields(tool) {
        return {
            title: String(tool.title || "").toLowerCase(),
            categories: (tool.categories || []).join(" ").toLowerCase(),
            subtitle: String(tool.subtitle || "").toLowerCase(),
            description: String(tool.description || "").toLowerCase(),
            price: String(tool.priceLabel || "").toLowerCase()
        };
    }

    // A title with the term as a whole word ("Huge Icons") beats one that merely
    // contains it ("Akaricons").
    function scoreField(match, fields, term) {
        if ((" " + fields.title + " ").indexOf(" " + term + " ") !== -1) return 10;
        if (match(fields.title)) return 8;
        if (match(fields.categories)) return 5;
        if (match(fields.subtitle)) return 3;
        if (match(fields.description) || match(fields.price)) return 1;
        return 0;
    }

    // Every term must match. If that finds nothing and there was more than one
    // term, the closest partial matches come back with `partial: true`.
    function searchTools(tools, terms) {
        var matchers = terms.map(termMatcher);
        var strict = [];
        var loose = [];
        tools.forEach(function (tool) {
            var fields = toolFields(tool);
            var hits = 0;
            var score = 0;
            matchers.forEach(function (match, i) {
                var s = scoreField(match, fields, terms[i]);
                if (s) hits++;
                score += s;
            });
            if (!hits) return;
            (hits === matchers.length ? strict : loose).push({ tool: tool, hits: hits, score: score });
        });
        var order = function (a, b) {
            return b.hits - a.hits || b.score - a.score ||
                (b.tool.subtitle ? 1 : 0) - (a.tool.subtitle ? 1 : 0) ||
                String(a.tool.title).localeCompare(String(b.tool.title));
        };
        var partial = !strict.length;
        var list = (partial ? loose : strict).sort(order);
        return { tools: list.map(function (r) { return r.tool; }), partial: partial };
    }

    // Categories naming every term win outright, so "design system" is Design
    // Systems and not every "Design ..." category.
    function searchCategories(groups, terms) {
        var matchers = terms.map(termMatcher);
        var all = [];
        var some = [];
        groups.forEach(function (group) {
            var title = String(group.title || "").toLowerCase();
            var hits = matchers.filter(function (match) { return match(title); }).length;
            if (hits === matchers.length) all.push(group);
            else if (hits) some.push(group);
        });
        return (all.length ? all : some)
            .sort(function (a, b) { return b.tools.length - a.tools.length; })
            .slice(0, MAX_CATEGORIES);
    }

    var options = null;
    var backdrop, dialog, input, body, status;
    var opener = null;
    var isOpen = false;
    var renderedWithData = false;
    var showAllCategories = false;
    var activeIndex = -1;
    var canSeeAll = false;

    function groupLabel(group) {
        return LABEL_FIXES[group.slug] || group.title;
    }

    function tileMarkup(group) {
        return '<a class="qs-tile" href="' + escapeHtml(options.categoryHref(group.slug)) + '">' +
            options.iconMarkup(group.slug, 22, HASH_ICON) +
            '<span>' + escapeHtml(groupLabel(group)) + '</span></a>';
    }

    function suggestionsMarkup(tools, groups) {
        var html = [];
        var terms = SEARCH_TERMS.filter(function (term) {
            return !searchTools(tools, queryTerms(term)).partial;
        });
        if (terms.length) {
            html.push('<section class="qs-group"><h3 class="qs-label">People search for</h3><div class="qs-chips">');
            terms.forEach(function (term) {
                html.push('<button type="button" class="qs-chip" data-qs-fill="', escapeHtml(term), '">', escapeHtml(term), '</button>');
            });
            html.push('</div></section>');
        }

        var questions = QUESTIONS.filter(function (item) {
            return item.href || !searchTools(tools, queryTerms(item.text)).partial;
        });
        if (questions.length) {
            html.push('<section class="qs-group"><h3 class="qs-label">People ask for</h3><div class="qs-chips">');
            questions.forEach(function (item) {
                html.push(item.href
                    ? '<a class="qs-chip" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.text) + '</a>'
                    : '<button type="button" class="qs-chip" data-qs-fill="' + escapeHtml(item.text) + '">' + escapeHtml(item.text) + '</button>');
            });
            html.push('</div></section>');
        }

        var bySlug = {};
        groups.forEach(function (group) { bySlug[group.slug] = group; });
        var tiles = showAllCategories
            ? groups
            : CATEGORY_TILES.map(function (slug) { return bySlug[slug]; }).filter(Boolean);
        if (tiles.length) {
            html.push('<section class="qs-group"><h3 class="qs-label">Jump to a category</h3><div class="qs-grid">');
            tiles.forEach(function (group) { html.push(tileMarkup(group)); });
            if (!showAllCategories) {
                html.push(
                    '<button type="button" class="qs-tile" data-qs-all-categories>',
                    '<span class="dash-icon-mask" style="width:22px;height:22px;-webkit-mask-image:url(\'/public/icons/all-categories.svg\');mask-image:url(\'/public/icons/all-categories.svg\')"></span>',
                    '<span>All ', groups.length, ' categories</span></button>'
                );
            }
            html.push('</div></section>');
        }
        return html.join("");
    }

    function categoryRowMarkup(group) {
        return '<a class="qs-row" role="option" data-qs-item href="' + escapeHtml(options.categoryHref(group.slug)) + '">' +
            '<span class="qs-row-icon">' + options.iconMarkup(group.slug, 20, HASH_ICON) + '</span>' +
            '<span class="qs-row-text"><span class="qs-row-name">' + escapeHtml(groupLabel(group)) + '</span></span>' +
            '<span class="qs-row-count">' + group.tools.length + (group.tools.length === 1 ? ' tool' : ' tools') + '</span></a>';
    }

    function toolRowMarkup(tool) {
        var logo = tool.icon
            ? '<img src="' + escapeHtml(options.logoUrl(tool.icon)) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '';
        return '<a class="qs-row" role="option" data-qs-item href="' + escapeHtml(options.toolHref(tool)) + '">' +
            '<span class="qs-row-logo">' + escapeHtml(tool.initials || String(tool.title).charAt(0)) + logo + '</span>' +
            '<span class="qs-row-text"><span class="qs-row-name">' + escapeHtml(tool.title) + '</span>' +
            '<span class="qs-row-desc">' + escapeHtml(tool.subtitle) + '</span></span>' +
            '<span class="qs-row-meta">' + escapeHtml(tool.priceLabel) + '</span></a>';
    }

    function resultsMarkup(query, tools, groups) {
        var terms = queryTerms(query);
        var found = searchTools(tools, terms);
        var categories = searchCategories(groups, terms);
        // Several tools share a title ("Icons" is four of them). One row each
        // here; "See all" still lists every one.
        var seenTitles = {};
        var shown = found.tools.filter(function (tool) {
            var key = String(tool.title).toLowerCase();
            if (seenTitles[key]) return false;
            seenTitles[key] = true;
            return true;
        }).slice(0, MAX_TOOLS);
        canSeeAll = !found.partial && found.tools.length > 0;

        if (!shown.length && !categories.length) {
            status.textContent = "No matches";
            return '<p class="qs-empty">Nothing matches “' + escapeHtml(query) + '” yet.</p>';
        }

        var html = ['<div class="qs-results" id="qs-results" role="listbox" aria-label="Search results">'];
        if (categories.length) {
            html.push('<section class="qs-group"><h3 class="qs-label">', categories.length === 1 ? 'Category' : 'Categories', '</h3><div class="qs-list" role="presentation">');
            categories.forEach(function (group) { html.push(categoryRowMarkup(group)); });
            html.push('</div></section>');
        }
        if (shown.length) {
            html.push('<section class="qs-group"><h3 class="qs-label">', found.partial ? 'Closest matches' : 'Tools', '</h3><div class="qs-list" role="presentation">');
            shown.forEach(function (tool) { html.push(toolRowMarkup(tool)); });
            html.push('</div></section>');
        }
        html.push('</div>');
        status.textContent = found.tools.length + (found.tools.length === 1 ? " tool" : " tools") + " found";
        return html.join("");
    }

    function rows() {
        return Array.prototype.slice.call(body.querySelectorAll("[data-qs-item]"));
    }

    // The first row is lit as the top match (as in the Figma), while Enter means
    // "See all" as the footer says. The first arrow press hands Enter to the
    // highlighted row and takes the footer's key away.
    function paintActive() {
        var list = rows();
        var lit = activeIndex < 0 ? 0 : activeIndex;
        list.forEach(function (row, i) {
            row.classList.toggle("is-active", i === lit);
            row.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
            row.id = "qs-row-" + i;
        });
        if (activeIndex >= 0 && list[activeIndex]) {
            input.setAttribute("aria-activedescendant", list[activeIndex].id);
            list[activeIndex].scrollIntoView({ block: "nearest" });
        } else {
            input.removeAttribute("aria-activedescendant");
        }
        var all = dialog.querySelector(".qs-all");
        if (all) all.classList.toggle("is-row-active", activeIndex >= 0);
    }

    function render() {
        var tools = options.getTools() || [];
        var groups = options.getGroups(tools);
        var query = input.value.trim();
        var old = dialog.querySelector(".qs-all");
        if (old) old.remove();

        renderedWithData = tools.length > 0;
        activeIndex = -1;
        canSeeAll = false;
        body.classList.toggle("is-results", !!query);

        if (!tools.length) {
            status.textContent = "";
            body.innerHTML = '<p class="qs-empty">Loading the catalogue…</p>';
            return;
        }
        if (!query) {
            status.textContent = "";
            body.innerHTML = suggestionsMarkup(tools, groups);
            body.scrollTop = 0;
            return;
        }

        body.innerHTML = resultsMarkup(query, tools, groups);
        body.scrollTop = 0;
        if (canSeeAll) {
            var all = document.createElement("button");
            all.type = "button";
            all.className = "qs-all";
            all.innerHTML = '<span class="qs-all-text">See all results for “' + escapeHtml(query) + '”</span><span class="qs-key">enter</span>';
            all.addEventListener("click", seeAll);
            dialog.appendChild(all);
        }
        paintActive();
    }

    function seeAll() {
        var q = queryTerms(input.value).join(" ");
        close(true);
        options.onSearch(q);
    }

    function focusable() {
        return Array.prototype.slice.call(dialog.querySelectorAll("input, button, a[href]"));
    }

    function onDialogKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key === "Tab") {
            var items = focusable();
            var first = items[0];
            var last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
            return;
        }
        if (event.target !== input) return;

        var list = rows();
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!list.length) return;
            event.preventDefault();
            var step = event.key === "ArrowDown" ? 1 : -1;
            activeIndex = activeIndex < 0
                ? (step > 0 ? 0 : list.length - 1)
                : (activeIndex + step + list.length) % list.length;
            paintActive();
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            if (activeIndex >= 0 && list[activeIndex]) list[activeIndex].click();
            else if (canSeeAll) seeAll();
            else if (list[0]) list[0].click();
            else if (!input.value.trim()) close();
        }
    }

    function onBodyClick(event) {
        var target = event.target.closest ? event.target : event.target.parentElement;
        var fill = target.closest("[data-qs-fill]");
        if (fill) {
            input.value = fill.getAttribute("data-qs-fill");
            render();
            input.focus();
            return;
        }
        if (target.closest("[data-qs-all-categories]")) {
            showAllCategories = true;
            render();
            input.focus();
        }
    }

    function build() {
        backdrop = document.createElement("div");
        backdrop.className = "qs-backdrop";
        backdrop.hidden = true;
        backdrop.innerHTML =
            '<div class="qs-dialog" role="dialog" aria-modal="true" aria-label="Quick search">' +
                '<div class="qs-field">' + SEARCH_ICON +
                    '<input class="qs-input" type="search" role="combobox" aria-expanded="true" aria-controls="qs-results" aria-autocomplete="list" ' +
                        'placeholder="Quickly search or just ask" aria-label="Search tools and categories" autocomplete="off" spellcheck="false">' +
                    '<button type="button" class="qs-key" data-qs-close aria-label="Close search"><span class="qs-key-desk">esc</span><span class="qs-key-touch">Close</span></button>' +
                '</div>' +
                '<div class="qs-body"></div>' +
                '<span class="qs-sr" role="status" aria-live="polite"></span>' +
            '</div>';
        document.body.appendChild(backdrop);

        dialog = backdrop.querySelector(".qs-dialog");
        input = backdrop.querySelector(".qs-input");
        body = backdrop.querySelector(".qs-body");
        status = backdrop.querySelector(".qs-sr");

        var debounce;
        input.addEventListener("input", function () {
            clearTimeout(debounce);
            debounce = window.setTimeout(render, 80);
        });
        backdrop.addEventListener("click", function (event) {
            if (event.target === backdrop || event.target.closest("[data-qs-close]")) close();
        });
        // A broken favicon leaves the tool's initial showing underneath.
        body.addEventListener("error", function (event) {
            if (event.target.tagName === "IMG") event.target.remove();
        }, true);
        body.addEventListener("click", onBodyClick);
        dialog.addEventListener("keydown", onDialogKeydown);
    }

    function open() {
        if (isOpen) return;
        if (!backdrop) build();
        isOpen = true;
        opener = document.activeElement;
        showAllCategories = false;
        input.value = options.trigger.value;
        backdrop.hidden = false;
        document.body.classList.add("qs-open");
        render();
        input.focus();
        input.select();
    }

    // Emptying the box and leaving means "clear my search" on the page behind.
    function close(keepPageSearch) {
        if (!isOpen) return;
        isOpen = false;
        backdrop.hidden = true;
        document.body.classList.remove("qs-open");
        if (keepPageSearch !== true && !input.value.trim() && options.trigger.value) options.onSearch("");
        if (opener && opener.focus) opener.focus();
    }

    function attach(config) {
        options = config;
        var trigger = config.trigger;
        var field = trigger.closest(".dash-search-field") || trigger;

        // The bar now only opens the pop-up and shows the current search.
        trigger.readOnly = true;
        trigger.setAttribute("aria-haspopup", "dialog");
        field.classList.add("has-quick-search");
        field.addEventListener("click", function () {
            open();
        });
        trigger.addEventListener("keydown", function (event) {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            // Opening on keydown moves focus first, so a typed letter lands in the pop-up.
            if (event.key === "Enter" || event.key === "ArrowDown" || event.key.length === 1) {
                if (event.key === "Enter" || event.key === "ArrowDown" || event.key === " ") event.preventDefault();
                open();
            }
        });
        document.addEventListener("keydown", function (event) {
            if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === "k") {
                event.preventDefault();
                open();
            }
        });
    }

    // Called when the catalogue arrives, in case the pop-up opened before it did.
    function refresh() {
        if (isOpen && !renderedWithData) render();
    }

    window.DWQuickSearch = { attach: attach, refresh: refresh };
})();
