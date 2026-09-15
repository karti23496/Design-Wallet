/**
 * salary.js — filter state and rendering for the salary dashboard.
 *
 * Loads one static JSON file (built by scripts/build-salary.js) and renders
 * every section from it. There is no network call to Google here: the data is
 * moderated and built ahead of time, per DECISIONS §12.
 *
 * One state object is the single source of truth; every section re-renders from
 * it through pure read functions. Same shape as glass-generator.js.
 */

(function () {
    "use strict";

    var DATA_URL = "/salary/data/salaries.json?v=20260913-1";
    var COLLAPSE_KEY = "dw_salary_sidebar_collapsed";

    var data = null;
    // The built file as loaded, before any community figures are laid over it.
    // Every refresh starts again from this, so a Rejected row drops back out.
    var seed = null;

    var COMMUNITY_REFRESH_MS = 60000;
    var communityStamp = null;

    var state = {
        role: "product-designer",
        level: "senior",
        city: "all",
        // Only meaningful with a foreign employer, when the City filter becomes
        // a Country filter. "all" there means working remotely from India.
        country: "all",
        workMode: "all",
        employer: "all",
        companyType: "all",
        currency: "inr",
        view: "charts"
    };

    var dom = {};

    // ── data reads ──────────────────────────────────────────────────────────
    // Every cell is [p25, p50, p75, n, grain]. Reads return that array or null.

    function national(role, level) {
        return data.national[role + "|" + level] || null;
    }

    function cityCell(role, level, city) {
        return data.cells[role + "|" + level + "|" + city] || null;
    }

    function breakdown(bucket, role, level, id) {
        return data[bucket][role + "|" + level + "|" + id] || null;
    }

    function countryCell(role, level, country) {
        return (data.country_cells || {})[role + "|" + level + "|" + country] || null;
    }

    /** A foreign employer swaps the Indian city list for country markets. */
    function foreignMode() {
        return state.employer === "foreign";
    }

    /** The market every comparison chart describes: the chosen country, or
        India's national figure. */
    function marketCell(role, level) {
        return state.country !== "all" ? countryCell(role, level, state.country) : national(role, level);
    }

    /** How far the chosen country sits from India's national figure. Scales the
        national-grain breakdowns (work mode, company type) into that market. */
    function marketFactor() {
        if (state.country === "all") return 1;
        var home = national(state.role, state.level);
        var abroad = countryCell(state.role, state.level, state.country);
        return home && abroad && home[1] ? abroad[1] / home[1] : 1;
    }

    /** The best-paying city — or, with a foreign employer, country — for the
        current role and level: { id, label, value, pct } against India's national. */
    function topLocation() {
        var reference = national(state.role, state.level);
        if (!foreignMode()) {
            var highest = data.highest_city[state.role + "|" + state.level];
            return highest
                ? { label: labelFor(data.cities, highest[0]), value: highest[1], pct: highest[2] }
                : null;
        }

        var best = null;
        (data.countries || []).forEach(function (country) {
            var cell = countryCell(state.role, state.level, country.id);
            if (cell && (!best || cell[1] > best.value)) {
                best = { label: country.label, value: cell[1] };
            }
        });
        if (best && reference && reference[1]) {
            best.pct = Math.round(((best.value - reference[1]) / reference[1]) * 100);
            best.multiple = Math.round((best.value / reference[1]) * 10) / 10;
        }
        return best;
    }

    /** Keeps city and country from contradicting the employer filter. */
    function normalizeLocation() {
        if (foreignMode()) {
            state.city = "all";
        } else {
            state.country = "all";
        }
    }

    /**
     * The headline figure for the current filters.
     *
     * Starts from the city (or national) cell, then applies each active
     * breakdown filter as a ratio against national. That reproduces exactly the
     * multiplier chain the benchmark was built from, so a filtered figure stays
     * consistent with the comparison charts beside it rather than drifting.
     */
    function headline() {
        var base;
        if (state.country !== "all") {
            base = countryCell(state.role, state.level, state.country);
        } else {
            base = state.city === "all"
                ? national(state.role, state.level)
                : cityCell(state.role, state.level, state.city);
        }
        if (!base) return null;

        var reference = national(state.role, state.level);
        if (!reference) return base;

        var factor = 1;
        var applyRatio = function (bucket, value) {
            if (value === "all") return;
            var cell = breakdown(bucket, state.role, state.level, value);
            if (cell && reference[1]) factor *= cell[1] / reference[1];
        };

        applyRatio("workmode", state.workMode);
        // A country figure is already that market's pay — the foreign-employer
        // premium only applies to working remotely from India.
        if (state.country === "all") applyRatio("employer", state.employer);
        applyRatio("company", state.companyType);

        if (factor === 1) return base;
        return [base[0] * factor, base[1] * factor, base[2] * factor, base[3], base[4]];
    }

    function labelFor(list, id) {
        for (var i = 0; i < list.length; i += 1) {
            if (list[i].id === id) return list[i].label;
        }
        return id;
    }

    /** Levels that actually exist for a role — nulls are never offered. */
    function levelsForRole(role) {
        return data.levels.filter(function (level) {
            return national(role, level.id) !== null;
        });
    }

    // ── rendering ───────────────────────────────────────────────────────────

    function renderSummaryLine() {
        var parts = [labelFor(data.levels, state.level), labelFor(data.roles, state.role) + "s"];
        if (state.country !== "all") {
            // "in the United States", not "in United States".
            var article = /^(united|netherlands)/.test(state.country) || state.country === "uae" ? "the " : "";
            parts.push("in " + article + labelFor(data.countries, state.country));
        } else {
            parts.push(state.city === "all" ? "across India" : "in " + labelFor(data.cities, state.city));
        }
        if (state.workMode !== "all") parts.push("· " + labelFor(data.work_modes, state.workMode));
        if (state.employer !== "all") parts.push("· " + labelFor(data.employers, state.employer));
        if (state.companyType !== "all") parts.push("· " + labelFor(data.company_types, state.companyType));
        dom.summary.textContent = parts.join(" ");
    }

    function renderKpis() {
        var cell = headline();
        if (!cell) return;

        var top = topLocation();

        DWCharts.countTo(dom.kpiMedian, [cell[1]], function (v) {
            return DWCharts.lpa(v[0]);
        });
        dom.kpiMedianLabel.textContent = state.country !== "all" ? "Median base salary" : "Median fixed CTC";
        DWCharts.countTo(dom.kpiRange, [cell[0], cell[2]], function (v) {
            return DWCharts.lpa(v[0]) + " – " + DWCharts.lpa(v[1]);
        });

        dom.kpiTopLabel.textContent = foreignMode() ? "Highest-paying country" : "Highest-paying city";
        if (top) {
            dom.kpiTopCity.textContent = top.label;
            DWCharts.countTo(dom.kpiTopCityNote, [top.value], function (v) {
                return DWCharts.lpa(v[0]) + " median";
            });
        }

        // Growth from junior to senior is the number people actually want when
        // they ask "is it worth staying in this discipline".
        var junior = marketCell(state.role, "junior");
        var senior = marketCell(state.role, "senior");
        if (junior && senior && junior[1]) {
            dom.kpiGrowth.textContent = "+" + Math.round(((senior[1] - junior[1]) / junior[1]) * 100) + "%";
        } else {
            dom.kpiGrowth.textContent = "—";
        }
    }

    function renderHeadline() {
        var cell = headline();
        if (!cell) return;

        DWCharts.countTo(dom.heroFigure, [cell[1]], function (v) {
            return DWCharts.lpa(v[0]);
        });
        dom.heroSub.textContent = state.country !== "all" ? "Median annual base salary" : "Median annual fixed CTC";

        var pad = (cell[2] - cell[0]) * 0.35 || 1;
        DWCharts.rangeBar(dom.rangeBar, {
            p25: cell[0],
            p50: cell[1],
            p75: cell[2],
            min: Math.max(0, cell[0] - pad),
            max: cell[2] + pad
        });
    }

    /** The national distribution shape, slid to the filtered median. The shape
        is built around India's national figure; a country or foreign-employer
        median would otherwise land off the right edge of its scale. */
    function shiftedShape(cell) {
        var shape = data.distribution[state.role + "|" + state.level];
        if (!shape || !cell) return null;
        var reference = national(state.role, state.level);
        var shift = reference && reference[1] ? cell[1] / reference[1] : 1;
        return { min: shape.min * shift, max: shape.max * shift, bins: shape.bins };
    }

    function renderDistribution() {
        var cell = headline();
        var shape = shiftedShape(cell);
        if (!shape) {
            dom.distribution.hidden = true;
            return;
        }
        dom.distribution.hidden = false;

        DWCharts.histogram(dom.histogram, {
            min: shape.min,
            max: shape.max,
            bins: shape.bins,
            p25: cell[0],
            p75: cell[2]
        });
    }

    function renderCities() {
        if (foreignMode()) {
            renderCountries();
            return;
        }

        dom.cityTitle.textContent = "By city";
        dom.citySub.textContent = "Median for this role and level";

        var items = data.cities.map(function (city) {
            var cell = cityCell(state.role, state.level, city.id);
            return {
                id: city.id,
                label: city.label,
                value: cell ? cell[1] : null,
                sub: city.tier === "tier-1" ? "Tier 1" : "Tier 2"
            };
        }).sort(function (a, b) {
            return (b.value || 0) - (a.value || 0);
        });

        DWCharts.barChart(dom.cityChart, { items: items, selected: state.city });

        var top = topLocation();
        if (top) {
            dom.topCityBody.textContent =
                top.label + " pays the most for " +
                labelFor(data.levels, state.level).toLowerCase() + " " +
                labelFor(data.roles, state.role).toLowerCase() + "s — " +
                DWCharts.lpa(top.value) + " median, " + top.pct +
                "% above the national figure.";
        }
    }

    function renderCountries() {
        dom.cityTitle.textContent = "By country";
        dom.citySub.textContent = "Median base salary for this role and level";

        var items = (data.countries || []).map(function (country) {
            var cell = countryCell(state.role, state.level, country.id);
            return { id: country.id, label: country.label, value: cell ? cell[1] : null, sub: "Market base salary" };
        }).sort(function (a, b) {
            return (b.value || 0) - (a.value || 0);
        });

        DWCharts.barChart(dom.cityChart, { items: items, selected: state.country });

        var top = topLocation();
        var reference = national(state.role, state.level);
        if (top && reference) {
            dom.topCityBody.textContent =
                top.label + " pays the most for " +
                labelFor(data.levels, state.level).toLowerCase() + " " +
                labelFor(data.roles, state.role).toLowerCase() + "s — " +
                DWCharts.lpa(top.value) + " median, about " + top.multiple +
                "× the Indian national figure of " + DWCharts.lpa(reference[1]) + ".";
        }
    }

    function renderLadder() {
        var points = data.levels.map(function (level) {
            var cell = marketCell(state.role, level.id);
            return {
                id: level.id,
                label: level.label,
                short: level.short || level.label,
                value: cell ? cell[1] : null,
                onSelect: function () {
                    setState({ level: level.id });
                }
            };
        });

        DWCharts.stepChart(dom.ladder, { points: points, selected: state.level });
    }

    function renderRoles() {
        var items = data.roles.map(function (role) {
            var cell = marketCell(role.id, state.level);
            return { id: role.id, label: role.label, value: cell ? cell[1] : null };
        }).sort(function (a, b) {
            return (b.value || 0) - (a.value || 0);
        });

        DWCharts.barChart(dom.roleChart, { items: items, selected: state.role });
    }

    function renderHeatmap() {
        dom.heatUnit.textContent = state.currency === "usd" ? "in US$ thousands" : "in ₹ lakh";
        DWCharts.heatmap(dom.heatmap, {
            rows: data.roles,
            cols: data.levels,
            selectedRow: state.role,
            selectedCol: state.level,
            valueAt: function (roleId, levelId) {
                var cell = marketCell(roleId, levelId);
                return cell ? cell[1] : null;
            },
            onSelect: function (roleId, levelId) {
                setState({ role: roleId, level: levelId });
            }
        });
    }

    function renderBreakdowns() {
        var factor = marketFactor();

        dom.modeSub.textContent = state.country !== "all"
            ? "Figures for " + labelFor(data.countries, state.country)
            : "National figures";

        DWCharts.barChart(dom.modeChart, {
            items: data.work_modes.map(function (mode) {
                var cell = breakdown("workmode", state.role, state.level, mode.id);
                return { id: mode.id, label: mode.label, value: cell ? cell[1] * factor : null };
            }),
            selected: state.workMode
        });

        var india = breakdown("employer", state.role, state.level, "india");
        var foreign = breakdown("employer", state.role, state.level, "foreign");
        if (state.country !== "all") {
            dom.remoteNote.textContent =
                "Country figures are base salary in that market, estimated from public " +
                "sources. Work mode and company type are scaled from India's pattern.";
        } else if (india && foreign && india[1]) {
            dom.remoteNote.textContent =
                "Working remotely for a company outside India pays about " +
                (Math.round((foreign[1] / india[1]) * 10) / 10) + "× the Indian median for this role — " +
                DWCharts.lpa(foreign[1]) + " against " + DWCharts.lpa(india[1]) +
                ". It is kept out of every city figure above, because folding it in would " +
                "lift numbers most people here will never be offered.";
        }

        DWCharts.barChart(dom.companyChart, {
            items: data.company_types.map(function (company) {
                var cell = breakdown("company", state.role, state.level, company.id);
                return { id: company.id, label: company.label, value: cell ? cell[1] * factor : null };
            }).sort(function (a, b) {
                return (b.value || 0) - (a.value || 0);
            }),
            selected: state.companyType
        });
    }

    function renderExtras() {
        var extras = data.extras[state.level];
        var cell = headline();
        if (!extras || !cell) return;

        DWCharts.meter(dom.variableMeter, { value: extras.variable_share, label: "Report variable pay" });
        DWCharts.meter(dom.esopMeter, { value: extras.esop_share, label: "Report ESOPs" });

        dom.variableValue.textContent = Math.round(extras.variable_share * 100) + "%";
        dom.esopValue.textContent = Math.round(extras.esop_share * 100) + "%";
        dom.variableNote.textContent = extras.variable_pct
            ? "Typically around " + DWCharts.lpa(cell[1] * extras.variable_pct) + " on top of fixed."
            : "Rare at this level.";
    }

    function renderLeaderboard() {
        var body = dom.leaderboard;
        while (body.firstChild) body.removeChild(body.firstChild);

        data.leaderboard.forEach(function (entry, index) {
            var row = document.createElement("tr");
            row.innerHTML =
                "<td>" + (index + 1) + "</td>" +
                "<td>" + labelFor(data.roles, entry.role) + "</td>" +
                "<td>" + labelFor(data.levels, entry.level) + "</td>" +
                "<td>" + labelFor(data.cities, entry.city) + "</td>" +
                "<td class='sal-num'>" + DWCharts.lpa(entry.median) + "</td>";
            body.appendChild(row);
        });
    }

    /** Every figure for the selected role, as data. The accessibility fallback
        for all eight chart forms, and the fastest surface for anyone who already
        knows what they are looking for. */
    function renderTable() {
        var head = dom.tableHead;
        var body = dom.tableBody;
        while (head.firstChild) head.removeChild(head.firstChild);
        while (body.firstChild) body.removeChild(body.firstChild);

        var levels = levelsForRole(state.role);

        var abroad = foreignMode();
        var places = abroad ? (data.countries || []) : data.cities;
        var cellAt = abroad ? countryCell : cityCell;

        var headRow = document.createElement("tr");
        headRow.innerHTML =
            "<th scope='col'>" + (abroad ? "Country" : "City") + "</th>" +
            levels.map(function (level) {
                return "<th scope='col' class='sal-num'>" + level.label + "</th>";
            }).join("");
        head.appendChild(headRow);

        var nationalRow = document.createElement("tr");
        nationalRow.className = "sal-table-national";
        nationalRow.innerHTML =
            "<th scope='row'>All India</th>" +
            levels.map(function (level) {
                var cell = national(state.role, level.id);
                return "<td class='sal-num'>" + (cell ? DWCharts.lpa(cell[1]) : "—") + "</td>";
            }).join("");
        body.appendChild(nationalRow);

        places.forEach(function (place) {
            var row = document.createElement("tr");
            row.innerHTML =
                "<th scope='row'>" + place.label + "</th>" +
                levels.map(function (level) {
                    var cell = cellAt(state.role, level.id, place.id);
                    return "<td class='sal-num'>" + (cell ? DWCharts.lpa(cell[1]) : "—") + "</td>";
                }).join("");
            body.appendChild(row);
        });

        dom.tableSub.textContent = "Every " + (abroad ? "country" : "city") + " and level for the selected role";
        dom.tableCaption.textContent =
            "Median annual " + (abroad ? "base salary" : "fixed CTC") + " for " +
            labelFor(data.roles, state.role).toLowerCase() +
            "s, by " + (abroad ? "country" : "city") + " and level.";
    }

    function render() {
        DWCharts.setCurrency(state.currency, data.fx && data.fx.usd_inr);
        document.body.classList.toggle("sal-currency-usd", state.currency === "usd");
        renderSummaryLine();
        renderKpis();
        renderHeadline();
        renderDistribution();
        renderCities();
        renderLadder();
        renderRoles();
        renderHeatmap();
        renderBreakdowns();
        renderExtras();
        renderLeaderboard();
        renderTable();
        syncUrl();
    }

    // ── state ───────────────────────────────────────────────────────────────

    function setState(patch) {
        Object.keys(patch).forEach(function (key) {
            state[key] = patch[key];
        });
        normalizeLocation();

        // A role change can strip the level out from under us — design systems
        // designers have no junior rung. Fall back to the nearest that exists.
        if (patch.role && !national(state.role, state.level)) {
            var available = levelsForRole(state.role);
            if (available.length) {
                state.level = available[Math.min(3, available.length - 1)].id;
            }
        }

        syncControls();
        render();
    }

    function syncControls() {
        Array.prototype.forEach.call(dom.roleNav.querySelectorAll("[data-role]"), function (button) {
            var active = button.getAttribute("data-role") === state.role;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-current", active ? "true" : "false");
        });

        dom.modeSelect.value = state.workMode;
        dom.employerSelect.value = state.employer;
        dom.companySelect.value = state.companyType;

        // Employer stays open for every work mode — on-site or hybrid abroad is
        // how most relocated designers work (Karthik's call, 2026-09-13).

        // Indian cities mean nothing to a foreign employer: the filter becomes
        // a country list. Its "all" option is the remote-from-India figure.
        var listKind = foreignMode() ? "countries" : "cities";
        if (dom.citySelect.getAttribute("data-list") !== listKind) {
            if (foreignMode()) {
                fillSelect(dom.citySelect, data.countries || [], "From India (remote)");
            } else {
                fillSelect(dom.citySelect, data.cities, "All India");
            }
            dom.citySelect.setAttribute("data-list", listKind);
            dom.cityLabel.textContent = foreignMode() ? "Country" : "City";
        }
        dom.citySelect.value = foreignMode() ? state.country : state.city;

        Array.prototype.forEach.call(dom.currencyToggle.querySelectorAll("[data-currency]"), function (button) {
            var active = button.getAttribute("data-currency") === state.currency;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });

        // A filter left on its "All …" option reads grey; a chosen one reads white.
        [dom.citySelect, dom.modeSelect, dom.employerSelect, dom.companySelect].forEach(function (select) {
            select.classList.toggle("is-set", select.value !== "all");
        });

        var levels = levelsForRole(state.role);
        var buttons = dom.levelLadder.querySelectorAll("[data-level]");
        Array.prototype.forEach.call(buttons, function (button) {
            var id = button.getAttribute("data-level");
            var exists = levels.some(function (level) {
                return level.id === id;
            });
            button.disabled = !exists;
            button.classList.toggle("is-active", id === state.level);
            button.setAttribute("aria-pressed", id === state.level ? "true" : "false");
        });
    }

    /** Filters in the URL, so a view is shareable and linkable. replaceState —
        this should not fill the back button with every filter tweak. */
    function syncUrl() {
        if (!window.history || !window.history.replaceState) return;

        var params = new URLSearchParams();
        params.set("role", state.role);
        params.set("level", state.level);
        if (state.city !== "all") params.set("city", state.city);
        if (state.country !== "all") params.set("country", state.country);
        if (state.workMode !== "all") params.set("mode", state.workMode);
        if (state.employer !== "all") params.set("employer", state.employer);
        if (state.companyType !== "all") params.set("company", state.companyType);
        if (state.currency !== "inr") params.set("currency", state.currency);

        // replaceState throws on opaque origins — a file:// open, some embedded
        // webviews. Losing the shareable URL is a rounding error; letting it
        // throw would abort the render that called us and blank the page.
        try {
            window.history.replaceState(null, "", "?" + params.toString());
        } catch (error) {
            /* Shareable URLs are a nicety, not a dependency. */
        }
    }

    function readUrl() {
        var params = new URLSearchParams(window.location.search);
        var has = function (list, value) {
            return list.some(function (item) {
                return item.id === value;
            });
        };

        if (has(data.roles, params.get("role"))) state.role = params.get("role");
        if (has(data.levels, params.get("level"))) state.level = params.get("level");
        if (has(data.cities, params.get("city"))) state.city = params.get("city");
        if (has(data.work_modes, params.get("mode"))) state.workMode = params.get("mode");
        if (has(data.employers, params.get("employer"))) state.employer = params.get("employer");
        if (has(data.company_types, params.get("company"))) state.companyType = params.get("company");
        if (has(data.countries || [], params.get("country"))) state.country = params.get("country");
        if (params.get("currency") === "usd") state.currency = "usd";
        normalizeLocation();

        if (!national(state.role, state.level)) {
            var available = levelsForRole(state.role);
            if (available.length) state.level = available[0].id;
        }
    }

    // ── setup ───────────────────────────────────────────────────────────────

    function fillSelect(select, items, allLabel) {
        var html = allLabel ? '<option value="all">' + allLabel + "</option>" : "";
        html += items.map(function (item) {
            return '<option value="' + item.id + '">' + item.label + "</option>";
        }).join("");
        select.innerHTML = html;
    }

    function buildRoleNav() {
        dom.roleNav.innerHTML = data.roles.map(function (role) {
            return (
                '<button type="button" class="sal-role-btn" data-role="' + role.id + '" ' +
                'aria-current="false" title="' + role.label + '">' +
                '<span class="sal-role-abbr" aria-hidden="true">' + (role.abbr || "•") + "</span>" +
                '<span class="sal-role-label">' + role.label + "</span></button>"
            );
        }).join("");

        dom.roleNav.addEventListener("click", function (event) {
            var button = event.target.closest("[data-role]");
            if (!button) return;
            setState({ role: button.getAttribute("data-role") });
        });
    }

    function buildLevelLadder() {
        dom.levelLadder.innerHTML = data.levels.map(function (level) {
            return (
                '<button type="button" class="sal-level-btn" data-level="' + level.id + '" ' +
                'aria-pressed="false"><span>' + level.label + "</span>" +
                '<small>' + level.years + "</small></button>"
            );
        }).join("");

        dom.levelLadder.addEventListener("click", function (event) {
            var button = event.target.closest("[data-level]");
            if (!button || button.disabled) return;
            setState({ level: button.getAttribute("data-level") });
        });
    }

    /** Any element carrying data-info gets the shared tooltip. Keeps explanatory
        copy in the markup next to what it explains, rather than in a string here. */
    function bindInfoIcons() {
        Array.prototype.forEach.call(document.querySelectorAll("[data-info]"), function (node) {
            DWCharts.attachTip(node, node.getAttribute("data-info"));
        });
    }

    function bindControls() {
        dom.citySelect.addEventListener("change", function () {
            setState(foreignMode() ? { country: this.value } : { city: this.value });
        });
        dom.currencyToggle.addEventListener("click", function (event) {
            var button = event.target.closest("[data-currency]");
            if (!button) return;
            setState({ currency: button.getAttribute("data-currency") });
        });
        dom.modeSelect.addEventListener("change", function () {
            setState({ workMode: this.value });
        });
        dom.employerSelect.addEventListener("change", function () {
            setState({ employer: this.value });
        });
        dom.companySelect.addEventListener("change", function () {
            setState({ companyType: this.value });
        });

        dom.viewToggle.addEventListener("click", function (event) {
            var button = event.target.closest("[data-view]");
            if (!button) return;
            state.view = button.getAttribute("data-view");
            dom.chartsView.hidden = state.view !== "charts";
            dom.tableView.hidden = state.view !== "table";
            Array.prototype.forEach.call(this.querySelectorAll("[data-view]"), function (item) {
                var active = item.getAttribute("data-view") === state.view;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", active ? "true" : "false");
            });
        });

        dom.exportBtn.addEventListener("click", function () {
            exportReport(this, this.querySelector(".sal-export-label"));
        });

        dom.collapseBtn.addEventListener("click", function () {
            var app = document.getElementById("sal-dashboard");
            var collapsed = app.classList.toggle("is-collapsed");
            this.setAttribute("aria-expanded", collapsed ? "false" : "true");
            try {
                window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
            } catch (error) {
                /* Private mode. The rail just won't be remembered. */
            }
        });

        // A scrolling page under a fixed tooltip looks broken.
        window.addEventListener("scroll", DWCharts.hideTooltip, { passive: true });
    }

    // ── report export ───────────────────────────────────────────────────────

    /**
     * Everything the PDF needs, read through the very functions the dashboard
     * renders from. report.js does no data work of its own, so a figure can
     * never differ between the screen and the download.
     */
    function buildReportModel() {
        var cell = headline();
        if (!cell) return null;

        var top = topLocation();
        var factor = marketFactor();
        var abroad = foreignMode();
        var junior = marketCell(state.role, "junior");
        var senior = marketCell(state.role, "senior");
        var extras = data.extras[state.level];
        var india = breakdown("employer", state.role, state.level, "india");
        var foreign = breakdown("employer", state.role, state.level, "foreign");

        var filters = [];
        if (state.city !== "all") filters.push(["City", labelFor(data.cities, state.city)]);
        if (state.country !== "all") filters.push(["Country", labelFor(data.countries, state.country)]);
        if (state.workMode !== "all") filters.push(["Work mode", labelFor(data.work_modes, state.workMode)]);
        if (state.employer !== "all") filters.push(["Employer", labelFor(data.employers, state.employer)]);
        if (state.companyType !== "all") filters.push(["Company type", labelFor(data.company_types, state.companyType)]);

        var byValueDesc = function (a, b) {
            return (b.value || 0) - (a.value || 0);
        };

        return {
            generatedAt: data.generated_at,
            downloadedAt: new Date(),
            role: labelFor(data.roles, state.role),
            level: labelFor(data.levels, state.level),
            summary: dom.summary.textContent,
            filters: filters,
            cell: cell,
            distribution: shiftedShape(cell),

            usd: state.currency === "usd",

            cities: (abroad ? (data.countries || []) : data.cities).map(function (place) {
                var placeData = abroad
                    ? countryCell(state.role, state.level, place.id)
                    : cityCell(state.role, state.level, place.id);
                return {
                    label: place.label,
                    value: placeData ? placeData[1] : null,
                    sub: abroad ? "Market" : (place.tier === "tier-1" ? "Tier 1" : "Tier 2"),
                    selected: place.id === (abroad ? state.country : state.city)
                };
            }).sort(byValueDesc),

            levels: data.levels.map(function (level) {
                var levelData = marketCell(state.role, level.id);
                return {
                    label: level.label,
                    short: level.short || level.label,
                    value: levelData ? levelData[1] : null,
                    selected: level.id === state.level
                };
            }),

            roles: data.roles.map(function (role) {
                var roleData = marketCell(role.id, state.level);
                return {
                    label: role.label,
                    value: roleData ? roleData[1] : null,
                    selected: role.id === state.role
                };
            }).sort(byValueDesc),

            modes: data.work_modes.map(function (mode) {
                var modeData = breakdown("workmode", state.role, state.level, mode.id);
                return {
                    label: mode.label,
                    value: modeData ? modeData[1] * factor : null,
                    selected: mode.id === state.workMode
                };
            }),

            companies: data.company_types.map(function (company) {
                var companyData = breakdown("company", state.role, state.level, company.id);
                return {
                    label: company.label,
                    value: companyData ? companyData[1] * factor : null,
                    selected: company.id === state.companyType
                };
            }).sort(byValueDesc),

            topCity: top,

            growth: (junior && senior && junior[1])
                ? "+" + Math.round(((senior[1] - junior[1]) / junior[1]) * 100) + "%"
                : null,

            remote: (state.country === "all" && india && foreign && india[1])
                ? {
                    multiple: Math.round((foreign[1] / india[1]) * 10) / 10,
                    foreign: foreign[1],
                    india: india[1]
                }
                : null,

            extras: extras
                ? {
                    variableShare: Math.round(extras.variable_share * 100),
                    esopShare: Math.round(extras.esop_share * 100),
                    variableNote: extras.variable_pct
                        ? "Typically around " + DWReport.money(cell[1] * extras.variable_pct) + " on top"
                        : "Rare at this level"
                }
                : null
        };
    }

    /**
     * The report is set in Inter, which means embedding the outlines: a PDF
     * cannot reference a web font. Two faces — Regular for body copy, Light for
     * titles and the big figures — ~40 KB together, fetched on the first export
     * rather than on page load, then kept for the session. A failure resolves to
     * null rather than rejecting: the report still builds, in Helvetica.
     */
    var fontsPromise = null;

    function loadReportFonts() {
        if (fontsPromise) return fontsPromise;

        if (typeof DWInterMetrics === "undefined" || !window.fetch) {
            fontsPromise = Promise.resolve(null);
            return fontsPromise;
        }

        var fetchFace = function (metrics) {
            return fetch(metrics.file).then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.arrayBuffer();
            }).then(function (buffer) {
                return { metrics: metrics, bytes: new Uint8Array(buffer) };
            });
        };

        fontsPromise = Promise.all([
            fetchFace(DWInterMetrics.text),
            fetchFace(DWInterMetrics.display)
        ]).then(function (faces) {
            return { text: faces[0], display: faces[1] };
        }).catch(function (error) {
            if (window.console) console.warn("report fonts unavailable, falling back:", error);
            return null;
        });

        return fontsPromise;
    }

    /**
     * The logo goes into the PDF as vector paths, not an image: the mark is two
     * SVG paths of straight lines and cubics, which map straight onto PDF path
     * operators. Read from the same file the site renders, so there is no second
     * copy of the artwork to keep in step. A failure resolves to null and the
     * header falls back to the wordmark in type.
     */
    var logoPromise = null;

    function loadReportLogo() {
        if (logoPromise) return logoPromise;

        if (!window.fetch) {
            logoPromise = Promise.resolve(null);
            return logoPromise;
        }

        logoPromise = fetch("/public/Logo/Website-logo.svg").then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.text();
        }).then(function (svg) {
            var viewBox = svg.match(/viewBox="([^"]+)"/);
            var paths = svg.match(/\sd="[^"]+"/g);

            if (!viewBox || !paths) return null;

            return {
                viewBox: viewBox[1].trim().split(/[\s,]+/).map(Number),
                paths: paths.map(function (attribute) {
                    return attribute.slice(4, -1);
                })
            };
        }).catch(function (error) {
            if (window.console) console.warn("report logo unavailable, falling back:", error);
            return null;
        });

        return logoPromise;
    }

    /** Builds the PDF in the page and hands it to the browser as a download. */
    function downloadReport(model, fonts) {
        var blob = new Blob([DWReport.build(model, fonts)], { type: "application/pdf" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");

        // Filters belong in the name, or two different reports collide in the
        // downloads folder and the second silently overwrites the first.
        var name = ["design-wallet-salary", state.role, state.level];
        if (state.city !== "all") name.push(state.city);
        if (state.country !== "all") name.push(state.country);
        if (state.workMode !== "all") name.push(state.workMode);
        if (state.employer !== "all") name.push(state.employer);
        if (state.companyType !== "all") name.push(state.companyType);
        if (state.currency !== "inr") name.push(state.currency);

        link.href = url;
        link.download = name.join("-") + ".pdf";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Revoking straight away cancels the download in some browsers.
        window.setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 10000);

        if (typeof window.gtag === "function") {
            window.gtag("event", "salary_report_download", { role: state.role, level: state.level });
        }
    }

    function exportReport(button, label) {
        var model = buildReportModel();
        if (!model) return;

        button.disabled = true;
        if (label) label.textContent = "Preparing…";

        Promise.all([loadReportFonts(), loadReportLogo()]).then(function (assets) {
            model.logo = assets[1];
            downloadReport(model, assets[0]);
        }).catch(function (error) {
            if (window.console) console.error("salary report export failed:", error);
            if (label) label.textContent = "Export failed";
        }).then(function () {
            button.disabled = false;
            window.setTimeout(function () {
                if (label) label.textContent = "Export PDF";
            }, label && label.textContent === "Export failed" ? 2600 : 0);
        });
    }

    // ── live community figures ──────────────────────────────────────────────

    /**
     * Pulls the community figures from the Apps Script (salary/endpoint.js) on
     * load and every minute, and redraws when they change. The script only ever
     * returns groups with MIN_REPORTS or more — percentiles, never raw rows — so
     * the research estimates stay in place until a group has real volume, then
     * give way to it with no build or approval step (Karthik's call, 2026-09-15).
     * Any failure leaves the page on the figures it already shows.
     */
    function startCommunity() {
        if (typeof DW_SALARY_ENDPOINT !== "string" || !DW_SALARY_ENDPOINT || !window.fetch) return;

        var pull = function () {
            fetch(DW_SALARY_ENDPOINT + (DW_SALARY_ENDPOINT.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now())
                .then(function (response) {
                    if (!response.ok) throw new Error("HTTP " + response.status);
                    return response.json();
                })
                .then(function (community) {
                    if (!community || typeof community.submission_count !== "number") return;
                    var stamp = JSON.stringify([community.national, community.cells, community.tier,
                        community.workmode, community.employer, community.company]);
                    if (stamp === communityStamp) return;
                    communityStamp = stamp;

                    data = applyCommunity(JSON.parse(JSON.stringify(seed)), community);
                    render();
                    if (community.updated_at) {
                        document.getElementById("sal-updated").textContent =
                            new Date(community.updated_at).toLocaleString("en-IN", {
                                day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit"
                            });
                    }
                })
                .catch(function (error) {
                    if (window.console) console.warn("community figures unavailable:", error);
                });
        };

        pull();
        window.setInterval(function () {
            if (!document.hidden) pull();
        }, COMMUNITY_REFRESH_MS);
    }

    /**
     * Lays community cells over the seed, following build-salary.js's cascade:
     * a city takes its own community figure, else its tier's, else the research
     * figure. Research figures that remain are rescaled by how far the
     * community national median moved from the research one, so a city still
     * on estimates doesn't contradict a national figure that has gone real.
     */
    function applyCommunity(base, community) {
        var scaled = function (cell, factor) {
            if (!cell || factor === 1) return cell;
            return [
                Math.round(cell[0] * factor * 10) / 10,
                Math.round(cell[1] * factor * 10) / 10,
                Math.round(cell[2] * factor * 10) / 10,
                cell[3],
                cell[4]
            ];
        };
        var factorFor = {};

        Object.keys(base.national).forEach(function (pair) {
            var real = community.national && community.national[pair];
            var research = base.national[pair];
            factorFor[pair] = real && research && research[1] ? real[1] / research[1] : 1;
            if (real) base.national[pair] = real;
        });

        var pairOf = function (key) {
            var parts = key.split("|");
            return parts[0] + "|" + parts[1];
        };

        ["tier", "workmode", "employer", "company"].forEach(function (bucket) {
            Object.keys(base[bucket]).forEach(function (key) {
                var real = community[bucket] && community[bucket][key];
                base[bucket][key] = real || scaled(base[bucket][key], factorFor[pairOf(key)] || 1);
            });
        });

        var tierOf = {};
        base.cities.forEach(function (city) {
            tierOf[city.id] = city.tier;
        });

        Object.keys(base.cells).forEach(function (key) {
            var cityId = key.split("|")[2];
            var real = community.cells && community.cells[key];
            var tierReal = community.tier && community.tier[pairOf(key) + "|" + tierOf[cityId]];
            base.cells[key] = real || tierReal || scaled(base.cells[key], factorFor[pairOf(key)] || 1);
        });

        // Highest-paying city and the leaderboard are derived; rebuild both.
        var leaderboard = [];
        Object.keys(base.national).forEach(function (pair) {
            var best = null;
            base.cities.forEach(function (city) {
                var cell = base.cells[pair + "|" + city.id];
                if (cell && (!best || cell[1] > best.median)) best = { city: city.id, median: cell[1] };
            });
            if (!best) return;
            var national = base.national[pair];
            base.highest_city[pair] = [
                best.city,
                best.median,
                national && national[1] ? Math.round(((best.median - national[1]) / national[1]) * 100) : 0
            ];
            var parts = pair.split("|");
            leaderboard.push({ role: parts[0], level: parts[1], city: best.city, median: best.median });
        });
        leaderboard.sort(function (a, b) {
            return b.median - a.median;
        });
        base.leaderboard = leaderboard.slice(0, 10);
        base.community_submission_count = community.submission_count;

        return base;
    }

    function cacheDom() {
        [
            "summary", "kpiMedian", "kpiRange", "kpiTopCity", "kpiTopCityNote", "kpiGrowth",
            "heroFigure", "rangeBar", "distribution", "histogram", "cityChart",
            "topCityBody", "ladder", "roleChart", "heatmap", "modeChart", "remoteNote",
            "companyChart", "variableMeter", "esopMeter", "variableValue", "esopValue",
            "variableNote", "leaderboard", "tableHead", "tableBody", "tableCaption",
            "roleNav", "citySelect", "modeSelect", "employerSelect",
            "companySelect", "levelLadder", "viewToggle", "chartsView", "tableView",
            "sidebar", "collapseBtn", "exportBtn", "cityLabel", "kpiTopLabel", "cityTitle",
            "citySub", "modeSub", "heatUnit", "tableSub", "currencyToggle", "fxRate", "fxDate", "heroSub", "kpiMedianLabel"
        ].forEach(function (key) {
            dom[key] = document.getElementById("sal-" + key.replace(/[A-Z]/g, function (match) {
                return "-" + match.toLowerCase();
            }));
        });
    }

    function start() {
        cacheDom();
        if (!dom.roleNav) return;

        try {
            if (window.localStorage.getItem(COLLAPSE_KEY) === "1") {
                document.getElementById("sal-dashboard").classList.add("is-collapsed");
                dom.collapseBtn.setAttribute("aria-expanded", "false");
            }
        } catch (error) {
            /* Private mode. Start expanded. */
        }

        fetch(DATA_URL)
            .then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json();
            })
            .then(function (payload) {
                seed = JSON.parse(JSON.stringify(payload));
                data = payload;

                buildRoleNav();
                fillSelect(dom.modeSelect, data.work_modes, "Any arrangement");
                fillSelect(dom.employerSelect, data.employers, "Any employer");
                fillSelect(dom.companySelect, data.company_types, "Any company");
                buildLevelLadder();
                bindControls();
                bindInfoIcons();

                // Shown before the first render: transitions don't run inside a
                // display:none subtree, so the charts would skip their intro.
                document.getElementById("sal-loading").hidden = true;
                document.getElementById("sal-dashboard").hidden = false;

                readUrl();
                syncControls();
                render();

                if (data.fx) {
                    dom.fxRate.textContent = data.fx.usd_inr;
                    dom.fxDate.textContent = new Date(data.fx.as_of).toLocaleDateString("en-IN", {
                        day: "numeric", month: "long", year: "numeric"
                    });
                }

                document.getElementById("sal-loading").hidden = true;
                document.getElementById("sal-dashboard").hidden = false;
                document.getElementById("sal-updated").textContent =
                    new Date(data.generated_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "long", year: "numeric"
                    });

                startCommunity();
            })
            .catch(function (error) {
                var loading = document.getElementById("sal-loading");
                if (loading) {
                    loading.textContent = "Couldn't load the salary data. Please refresh.";
                }
                if (window.console) console.error("salary data failed:", error);
            });
    }

    document.addEventListener("DOMContentLoaded", start);
})();
