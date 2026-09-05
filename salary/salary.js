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

    var DATA_URL = "/salary/data/salaries.json?v=20260905-3";
    var COLLAPSE_KEY = "dw_salary_sidebar_collapsed";

    var data = null;

    var state = {
        role: "product-designer",
        level: "senior",
        city: "all",
        workMode: "all",
        employer: "all",
        companyType: "all",
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

    /**
     * The headline figure for the current filters.
     *
     * Starts from the city (or national) cell, then applies each active
     * breakdown filter as a ratio against national. That reproduces exactly the
     * multiplier chain the benchmark was built from, so a filtered figure stays
     * consistent with the comparison charts beside it rather than drifting.
     */
    function headline() {
        var base = state.city === "all"
            ? national(state.role, state.level)
            : cityCell(state.role, state.level, state.city);
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
        applyRatio("employer", state.employer);
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
        parts.push(state.city === "all" ? "across India" : "in " + labelFor(data.cities, state.city));
        if (state.workMode !== "all") parts.push("· " + labelFor(data.work_modes, state.workMode));
        if (state.employer !== "all") parts.push("· " + labelFor(data.employers, state.employer));
        if (state.companyType !== "all") parts.push("· " + labelFor(data.company_types, state.companyType));
        dom.summary.textContent = parts.join(" ");
    }

    function renderKpis() {
        var cell = headline();
        if (!cell) return;

        var reference = national(state.role, state.level);
        var highest = data.highest_city[state.role + "|" + state.level];

        dom.kpiMedian.textContent = DWCharts.lpa(cell[1]);
        dom.kpiRange.textContent = DWCharts.lpa(cell[0]) + " – " + DWCharts.lpa(cell[2]);

        if (highest) {
            dom.kpiTopCity.textContent = labelFor(data.cities, highest[0]);
            dom.kpiTopCityNote.textContent = DWCharts.lpa(highest[1]) + " median";
        }

        // Growth from junior to senior is the number people actually want when
        // they ask "is it worth staying in this discipline".
        var junior = national(state.role, "junior");
        var senior = national(state.role, "senior");
        if (junior && senior && junior[1]) {
            dom.kpiGrowth.textContent = "+" + Math.round(((senior[1] - junior[1]) / junior[1]) * 100) + "%";
        } else {
            dom.kpiGrowth.textContent = "—";
        }

        void reference;
    }

    function renderHeadline() {
        var cell = headline();
        if (!cell) return;

        dom.heroFigure.textContent = DWCharts.lpa(cell[1]);

        var pad = (cell[2] - cell[0]) * 0.35 || 1;
        DWCharts.rangeBar(dom.rangeBar, {
            p25: cell[0],
            p50: cell[1],
            p75: cell[2],
            min: Math.max(0, cell[0] - pad),
            max: cell[2] + pad
        });
    }

    function renderDistribution() {
        var shape = data.distribution[state.role + "|" + state.level];
        var cell = headline();
        if (!shape || !cell) {
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

        var highest = data.highest_city[state.role + "|" + state.level];
        if (highest) {
            dom.topCityBody.textContent =
                labelFor(data.cities, highest[0]) + " pays the most for " +
                labelFor(data.levels, state.level).toLowerCase() + " " +
                labelFor(data.roles, state.role).toLowerCase() + "s — " +
                DWCharts.lpa(highest[1]) + " median, " + highest[2] +
                "% above the national figure.";
        }
    }

    function renderLadder() {
        var points = data.levels.map(function (level) {
            var cell = national(state.role, level.id);
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
            var cell = national(role.id, state.level);
            return { id: role.id, label: role.label, value: cell ? cell[1] : null };
        }).sort(function (a, b) {
            return (b.value || 0) - (a.value || 0);
        });

        DWCharts.barChart(dom.roleChart, { items: items, selected: state.role });
    }

    function renderHeatmap() {
        DWCharts.heatmap(dom.heatmap, {
            rows: data.roles,
            cols: data.levels,
            selectedRow: state.role,
            selectedCol: state.level,
            valueAt: function (roleId, levelId) {
                var cell = national(roleId, levelId);
                return cell ? cell[1] : null;
            },
            onSelect: function (roleId, levelId) {
                setState({ role: roleId, level: levelId });
            }
        });
    }

    function renderBreakdowns() {
        DWCharts.barChart(dom.modeChart, {
            items: data.work_modes.map(function (mode) {
                var cell = breakdown("workmode", state.role, state.level, mode.id);
                return { id: mode.id, label: mode.label, value: cell ? cell[1] : null };
            }),
            selected: state.workMode
        });

        var india = breakdown("employer", state.role, state.level, "india");
        var foreign = breakdown("employer", state.role, state.level, "foreign");
        if (india && foreign && india[1]) {
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
                return { id: company.id, label: company.label, value: cell ? cell[1] : null };
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

        var headRow = document.createElement("tr");
        headRow.innerHTML =
            "<th scope='col'>City</th>" +
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

        data.cities.forEach(function (city) {
            var row = document.createElement("tr");
            row.innerHTML =
                "<th scope='row'>" + city.label + "</th>" +
                levels.map(function (level) {
                    var cell = cityCell(state.role, level.id, city.id);
                    return "<td class='sal-num'>" + (cell ? DWCharts.lpa(cell[1]) : "—") + "</td>";
                }).join("");
            body.appendChild(row);
        });

        dom.tableCaption.textContent =
            "Median annual fixed CTC for " + labelFor(data.roles, state.role).toLowerCase() +
            "s, by city and level.";
    }

    function render() {
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

        dom.citySelect.value = state.city;
        dom.modeSelect.value = state.workMode;
        dom.employerSelect.value = state.employer;
        dom.companySelect.value = state.companyType;

        // The employer filter only means anything for remote work.
        var remoteOnly = state.workMode === "remote" || state.workMode === "all";
        dom.employerSelect.disabled = !remoteOnly;
        dom.employerField.classList.toggle("is-disabled", !remoteOnly);
        if (!remoteOnly && state.employer !== "all") {
            state.employer = "all";
            dom.employerSelect.value = "all";
        }

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
        if (state.workMode !== "all") params.set("mode", state.workMode);
        if (state.employer !== "all") params.set("employer", state.employer);
        if (state.companyType !== "all") params.set("company", state.companyType);

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
            setState({ city: this.value });
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

    function cacheDom() {
        [
            "summary", "kpiMedian", "kpiRange", "kpiTopCity", "kpiTopCityNote", "kpiGrowth",
            "heroFigure", "rangeBar", "distribution", "histogram", "cityChart",
            "topCityBody", "ladder", "roleChart", "heatmap", "modeChart", "remoteNote",
            "companyChart", "variableMeter", "esopMeter", "variableValue", "esopValue",
            "variableNote", "leaderboard", "tableHead", "tableBody", "tableCaption",
            "roleNav", "citySelect", "modeSelect", "employerSelect", "employerField",
            "companySelect", "levelLadder", "viewToggle", "chartsView", "tableView",
            "sidebar", "collapseBtn"
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
                data = payload;

                buildRoleNav();
                fillSelect(dom.citySelect, data.cities, "All India");
                fillSelect(dom.modeSelect, data.work_modes, "Any arrangement");
                fillSelect(dom.employerSelect, data.employers, "Any employer");
                fillSelect(dom.companySelect, data.company_types, "Any company");
                buildLevelLadder();
                bindControls();
                bindInfoIcons();

                readUrl();
                syncControls();
                render();

                document.getElementById("sal-loading").hidden = true;
                document.getElementById("sal-dashboard").hidden = false;
                document.getElementById("sal-updated").textContent =
                    new Date(data.generated_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "long", year: "numeric"
                    });
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
