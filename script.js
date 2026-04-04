document.addEventListener("DOMContentLoaded", function () {
    var siteHeader = document.querySelector(".site-header");
    var navToggle = document.querySelector(".nav-toggle");
    var navLinks = document.querySelectorAll(".site-nav a");
    var searchInput = document.getElementById("resource-search");
    var categoryFilters = document.getElementById("category-filters");
    var priceFilters = document.getElementById("price-filters");
    var resourceGrid = document.getElementById("resource-grid");
    var resultCount = document.getElementById("result-count");
    var emptyState = document.getElementById("empty-state");
    var currentYear = document.getElementById("current-year");
    var catalogSection = document.getElementById("catalog");
    var catalogLoading = document.getElementById("catalog-loading");
    var catalogNote = document.getElementById("catalog-note");
    var catalogHighlights = document.getElementById("catalog-highlights");
    var activeCategory = "all";
    var listings = [];

    if (currentYear) {
        currentYear.textContent = String(new Date().getFullYear());
    }

    if (navToggle && siteHeader) {
        navToggle.addEventListener("click", function () {
            var isOpen = siteHeader.classList.toggle("is-open");
            navToggle.setAttribute("aria-expanded", String(isOpen));
        });
    }

    navLinks.forEach(function (link) {
        link.addEventListener("click", function () {
            if (!siteHeader || !navToggle) {
                return;
            }

            siteHeader.classList.remove("is-open");
            navToggle.setAttribute("aria-expanded", "false");
        });
    });

    function normalizeHeader(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    function getCellValue(cell) {
        if (!cell || typeof cell.v === "undefined" || cell.v === null) {
            return "";
        }

        return String(cell.v).trim();
    }

    function toTitleCase(value) {
        return String(value || "")
            .split(/[\s/-]+/)
            .filter(Boolean)
            .map(function (part) {
                return part.charAt(0).toUpperCase() + part.slice(1);
            })
            .join(" ");
    }

    function normalizePrice(value) {
        var cleaned = String(value || "").trim().toLowerCase();

        if (!cleaned) {
            return "free";
        }

        if (cleaned.indexOf("freemium") !== -1) {
            return "freemium";
        }

        if (cleaned.indexOf("paid") !== -1 || cleaned.indexOf("premium") !== -1) {
            return "paid";
        }

        if (cleaned.indexOf("free") !== -1) {
            return "free";
        }

        return cleaned.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function formatPrice(value) {
        return toTitleCase(String(value || "").replace(/-/g, " "));
    }

    function parseCategories(value) {
        return String(value || "")
            .split(",")
            .map(function (part) {
                return part.trim();
            })
            .filter(Boolean);
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getInitials(title) {
        return String(title || "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(function (part) {
                return part.charAt(0).toUpperCase();
            })
            .join("") || "DW";
    }

    function buildListings(rows) {
        if (!rows.length) {
            return [];
        }

        var headers = (rows[0].c || []).map(function (cell) {
            return normalizeHeader(getCellValue(cell));
        });

        return rows
            .slice(1)
            .map(function (row) {
                var cells = row.c || [];
                var record = {};

                headers.forEach(function (header, index) {
                    if (!header) {
                        return;
                    }

                    record[header] = getCellValue(cells[index]);
                });

                var title = record.title || record.name;
                var subtitle = record.subtitle || "";
                var description = record.description || subtitle || "Curated design resource.";
                var categories = parseCategories(record.categories);
                var price = normalizePrice(record.pricing || record.price);
                var link = record.link || "";
                var icon = record.image || record.logo || "";
                var thumbnail = record.thumbnails || record.thumbnail || record.banner_image || record.bannerimage || "";
                var slug = record.slug || "";

                return {
                    title: title,
                    subtitle: subtitle,
                    description: description,
                    categories: categories,
                    price: price,
                    priceLabel: formatPrice(price),
                    link: link,
                    icon: icon,
                    thumbnail: thumbnail,
                    slug: slug,
                    initials: getInitials(title),
                    searchText: [
                        title,
                        subtitle,
                        description,
                        categories.join(" "),
                        price,
                        slug
                    ].join(" ").toLowerCase()
                };
            })
            .filter(function (item) {
                return item.title && item.link;
            });
    }

    function createCategoryFilters(items) {
        if (!categoryFilters) {
            return;
        }

        var uniqueCategories = Array.from(new Set(
            items.reduce(function (allCategories, item) {
                return allCategories.concat(item.categories);
            }, [])
        )).sort(function (left, right) {
            return left.localeCompare(right);
        });

        categoryFilters.innerHTML = [
            '<button class="filter-chip is-active" type="button" data-filter-group="category" data-filter-value="all">All</button>'
        ].concat(
            uniqueCategories.map(function (category) {
                return [
                    '<button class="filter-chip" type="button" data-filter-group="category" data-filter-value="',
                    escapeHtml(category),
                    '">',
                    escapeHtml(category),
                    "</button>"
                ].join("");
            })
        ).join("");
    }

    function createPriceFilters(items) {
        if (!priceFilters) {
            return;
        }

        var priority = {
            free: 1,
            freemium: 2,
            paid: 3
        };
        var uniquePrices = Array.from(new Set(
            items.map(function (item) {
                return item.price;
            })
        )).sort(function (left, right) {
            return (priority[left] || 99) - (priority[right] || 99) || left.localeCompare(right);
        });

        priceFilters.innerHTML = uniquePrices.map(function (price) {
            return [
                '<label class="check-row">',
                '<input type="checkbox" value="',
                escapeHtml(price),
                '" data-filter-group="price" checked>',
                "<span>",
                escapeHtml(formatPrice(price)),
                "</span>",
                "</label>"
            ].join("");
        }).join("");
    }

    function updateHighlights(items) {
        if (!catalogHighlights) {
            return;
        }

        var categoryCount = Array.from(new Set(
            items.reduce(function (allCategories, item) {
                return allCategories.concat(item.categories);
            }, [])
        )).length;

        catalogHighlights.innerHTML = [
            '<span class="mini-pill">Google Sheets powered</span>',
            '<span class="mini-pill">',
            String(items.length),
            " listings</span>",
            '<span class="mini-pill">',
            String(categoryCount),
            " categories</span>"
        ].join("");
    }

    function createCardMarkup(item) {
        var description = item.description || item.subtitle || "Curated design resource.";
        var primaryCategory = item.categories[0] || "Curated Listing";
        var logo = item.icon
            ? [
                '<span class="logo-badge has-image">',
                '<img src="',
                escapeHtml(item.icon),
                '" alt="" loading="lazy" referrerpolicy="no-referrer">',
                "</span>"
            ].join("")
            : '<span class="logo-badge">' + escapeHtml(item.initials) + "</span>";
        var priceBadgeClass = "price-badge";

        if (item.price === "free") {
            priceBadgeClass += " price-free";
        } else if (item.price === "freemium") {
            priceBadgeClass += " price-freemium";
        }

        return [
            '<a class="resource-card" href="',
            escapeHtml(item.link),
            '" target="_blank" rel="noreferrer" aria-label="Open ',
            escapeHtml(item.title),
            '" data-categories="',
            escapeHtml(item.categories.join("|").toLowerCase()),
            '" data-price="',
            escapeHtml(item.price),
            '" data-search="',
            escapeHtml(item.searchText),
            '">',
            '<div class="card-shell">',
            '<div class="card-top">',
            logo,
            '<span class="',
            priceBadgeClass,
            '">',
            escapeHtml(item.priceLabel),
            "</span>",
            "</div>",
            '<div class="card-content">',
            "<h3>",
            escapeHtml(item.title),
            "</h3>",
            '<p class="card-description">',
            escapeHtml(description),
            "</p>",
            "</div>",
            '<div class="card-divider" aria-hidden="true"></div>',
            '<div class="card-footer">',
            '<div class="card-tags">',
            '<span class="tag">',
            escapeHtml(primaryCategory),
            "</span>",
            "</div>",
            '<span class="card-action" aria-hidden="true">',
            '<span class="card-action-arrow">↗</span>',
            "</span>",
            "</div>",
            "</div>",
            "</a>"
        ].join("");
    }

    function renderCards(items) {
        if (!resourceGrid) {
            return;
        }

        resourceGrid.innerHTML = items.map(createCardMarkup).join("");
    }

    function getActivePrices() {
        return Array.from(document.querySelectorAll('input[data-filter-group="price"]'))
            .filter(function (input) {
                return input.checked;
            })
            .map(function (input) {
                return input.value;
            });
    }

    function applyFilters() {
        if (!resultCount || !emptyState || !resourceGrid) {
            return;
        }

        var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
        var activePrices = getActivePrices();
        var visibleItems = listings.filter(function (item) {
            var matchesQuery = item.searchText.indexOf(query) !== -1;
            var matchesPrice = activePrices.indexOf(item.price) !== -1;
            var matchesCategory = activeCategory === "all" || item.categories.indexOf(activeCategory) !== -1;

            return matchesQuery && matchesPrice && matchesCategory;
        });

        renderCards(visibleItems);
        resultCount.textContent = visibleItems.length + " resource" + (visibleItems.length === 1 ? "" : "s");
        emptyState.hidden = visibleItems.length !== 0;

        if (catalogLoading) {
            catalogLoading.hidden = true;
        }

        if (catalogNote) {
            catalogNote.textContent = "Showing " + visibleItems.length + " of " + listings.length + " listings from Google Sheets.";
        }
    }

    function handleCategoryFilterClick(event) {
        var button = event.target.closest('button[data-filter-group="category"]');

        if (!button || !categoryFilters) {
            return;
        }

        activeCategory = button.dataset.filterValue || "all";

        Array.from(categoryFilters.querySelectorAll(".filter-chip")).forEach(function (candidate) {
            candidate.classList.toggle("is-active", candidate === button);
        });

        applyFilters();
    }

    function attachFilterListeners() {
        if (searchInput) {
            searchInput.addEventListener("input", applyFilters);
        }

        if (categoryFilters) {
            categoryFilters.addEventListener("click", handleCategoryFilterClick);
        }

        if (priceFilters) {
            priceFilters.addEventListener("change", applyFilters);
        }
    }

    function setLoadingState(message) {
        if (catalogLoading) {
            catalogLoading.hidden = false;
            catalogLoading.textContent = message;
        }

        if (catalogNote) {
            catalogNote.textContent = "Reading the live Google Sheet...";
        }
    }

    function setErrorState(message) {
        if (catalogLoading) {
            catalogLoading.hidden = false;
            catalogLoading.textContent = message;
        }

        if (catalogNote) {
            catalogNote.textContent = "The sheet could not be loaded right now.";
        }

        if (resultCount) {
            resultCount.textContent = "0 resources";
        }

        if (emptyState) {
            emptyState.hidden = false;
            emptyState.textContent = "The live listings could not be loaded. Check the Google Sheet link or sharing settings and try again.";
        }
    }

    function buildSheetUrl() {
        if (!catalogSection) {
            return "";
        }

        var sheetId = catalogSection.dataset.sheetId || "";
        var sheetGid = catalogSection.dataset.sheetGid || "0";

        if (!sheetId) {
            return "";
        }

        return "https://docs.google.com/spreadsheets/d/" + sheetId + "/gviz/tq?tqx=out:json&gid=" + encodeURIComponent(sheetGid);
    }

    function requestSheetData(url, onSuccess, onError) {
        var script = document.createElement("script");
        var timeoutId = 0;
        var googleRoot = window.google || {};
        var visualizationRoot = googleRoot.visualization || {};
        var queryRoot = visualizationRoot.Query || {};
        var previousSetResponse = queryRoot.setResponse;

        function cleanup() {
            clearTimeout(timeoutId);
            script.remove();

            if (previousSetResponse) {
                window.google.visualization.Query.setResponse = previousSetResponse;
            } else if (window.google && window.google.visualization && window.google.visualization.Query) {
                delete window.google.visualization.Query.setResponse;
            }
        }

        window.google = window.google || {};
        window.google.visualization = window.google.visualization || {};
        window.google.visualization.Query = window.google.visualization.Query || {};
        window.google.visualization.Query.setResponse = function (payload) {
            cleanup();
            onSuccess(payload);
        };

        script.async = true;
        script.src = url;
        script.onerror = function () {
            cleanup();
            onError(new Error("Failed to load the Google Sheets feed."));
        };

        timeoutId = window.setTimeout(function () {
            cleanup();
            onError(new Error("Google Sheets feed timed out."));
        }, 12000);

        document.body.appendChild(script);
    }

    function loadListings() {
        var sheetUrl = buildSheetUrl();

        if (!sheetUrl) {
            setErrorState("This browser could not initialize the Google Sheets feed.");
            return;
        }

        setLoadingState("Loading listings from Google Sheets...");

        requestSheetData(
            sheetUrl,
            function (payload) {
                var rows = payload && payload.table && payload.table.rows ? payload.table.rows : [];

                listings = buildListings(rows);

                if (!listings.length) {
                    throw new Error("No listings found in the sheet.");
                }

                createCategoryFilters(listings);
                createPriceFilters(listings);
                updateHighlights(listings);
                applyFilters();
            },
            function () {
                listings = [];
                renderCards([]);
                setErrorState("Could not load Google Sheets data.");
            }
        );
    }

    attachFilterListeners();
    loadListings();
});
