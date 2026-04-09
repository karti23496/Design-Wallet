document.addEventListener("DOMContentLoaded", function () {

    /* ── Hero heading cursor shine ── */
    (function () {
        var heading = document.querySelector(".hero h1");
        if (!heading) return;

        heading.addEventListener("mousemove", function (e) {
            var rect = heading.getBoundingClientRect();
            heading.style.setProperty("--mouse-x", (e.clientX - rect.left) + "px");
            heading.style.setProperty("--mouse-y", (e.clientY - rect.top) + "px");
        });

        heading.addEventListener("mouseleave", function () {
            heading.style.setProperty("--mouse-x", "-200px");
            heading.style.setProperty("--mouse-y", "-200px");
        });
    })();

    /* ── Generate orbiting stars ── */
    (function () {
        var field = document.getElementById("stars-field");
        if (!field) return;
        var count = 100;
        for (var i = 0; i < count; i++) {
            var orbit = document.createElement("div");
            orbit.className = "star-orbit";
            var size = 120 + Math.random() * 900;
            var duration = 20 + Math.random() * 70;
            var delay = -(Math.random() * duration);
            var reverse = Math.random() > 0.5 ? "reverse" : "normal";
            orbit.style.width = size + "px";
            orbit.style.height = size + "px";
            orbit.style.animationDuration = duration + "s";
            orbit.style.animationDelay = delay + "s";
            orbit.style.animationDirection = reverse;

            var star = document.createElement("span");
            star.className = "star";
            var starSize = 1 + Math.random() * 2.5;
            var opacity = 0.2 + Math.random() * 0.7;
            star.style.width = starSize + "px";
            star.style.height = starSize + "px";
            star.style.marginLeft = -(starSize / 2) + "px";
            star.style.marginTop = -(starSize / 2) + "px";
            star.style.opacity = opacity;
            if (Math.random() > 0.7) {
                star.style.boxShadow = "0 0 " + (4 + Math.random() * 4) + "px rgba(255,255,255," + (0.4 + Math.random() * 0.4) + ")";
            }

            orbit.appendChild(star);
            field.appendChild(orbit);
        }
    })();

    /* ── Email form submission to Google Sheets ── */
    var SHEET_URL = "https://script.google.com/macros/s/AKfycbyyFhF70bpxR6nJbjULkETuxYNjAfEFfoshx_ven2Z3JrwC3Zjp61eJIBjx2SCouHYVig/exec";
    var emailForm = document.querySelector(".hero-email-form");
    if (emailForm) {
        /* Create hidden iframe for form submission */
        var iframe = document.createElement("iframe");
        iframe.name = "hidden-sheet-frame";
        iframe.style.display = "none";
        document.body.appendChild(iframe);

        /* Create hidden form that posts to the iframe */
        var hiddenForm = document.createElement("form");
        hiddenForm.method = "POST";
        hiddenForm.action = SHEET_URL;
        hiddenForm.target = "hidden-sheet-frame";
        hiddenForm.style.display = "none";
        var hiddenEmail = document.createElement("input");
        hiddenEmail.name = "email";
        hiddenForm.appendChild(hiddenEmail);
        document.body.appendChild(hiddenForm);

        emailForm.addEventListener("submit", function (e) {
            e.preventDefault();
            var input = emailForm.querySelector(".hero-email-input");
            var btn = emailForm.querySelector(".primary-button");
            var email = input.value.trim();
            if (!email) return;

            btn.textContent = "Submitting...";
            btn.disabled = true;

            hiddenEmail.value = email;
            hiddenForm.submit();

            setTimeout(function () {
                input.value = "";
                btn.textContent = "Subscribed!";
                setTimeout(function () {
                    btn.textContent = "Get Early Access";
                    btn.disabled = false;
                }, 3000);
            }, 1500);
        });
    }

    var siteHeader = document.querySelector(".site-header");
    var navToggle = document.querySelector(".nav-toggle");
    var navLinks = document.querySelectorAll(".site-nav a");
    var searchInput = document.getElementById("resource-search");
    var categoryFilters = document.getElementById("category-dropdown");
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
        return String(value || "").replace(/-/g, " ").toUpperCase();
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

        categoryFilters.innerHTML = '<option value="all">All Categories</option>' +
            uniqueCategories.map(function (category) {
                return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>';
            }).join("");
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

        priceFilters.innerHTML = '<label class="check-row">' +
            '<input type="radio" name="price-filter" value="all" data-filter-group="price" checked>' +
            "<span>ALL</span></label>" +
            uniquePrices.map(function (price) {
                return [
                    '<label class="check-row">',
                    '<input type="radio" name="price-filter" value="',
                    escapeHtml(price),
                    '" data-filter-group="price">',
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
            "<h3>",
            escapeHtml(item.title),
            "</h3>",
            '<span class="',
            priceBadgeClass,
            '">',
            escapeHtml(item.priceLabel),
            "</span>",
            "</div>",
            item.thumbnail
                ? '<div class="card-thumb-wrap"><img class="card-thumb" src="' + escapeHtml(item.thumbnail) + '" alt="" loading="lazy"></div>'
                : '',
            '<div class="card-divider" aria-hidden="true"></div>',
            '<div class="card-footer">',
            '<div class="card-footer-actions">',
            '<button class="fav-btn" type="button" data-fav-id="', escapeHtml(item.title), '" aria-label="Add to favourites">',
            '<svg class="fav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
            '</button>',
            '<span class="card-action" aria-hidden="true">',
            '<svg class="card-action-arrow" width="16" height="16" viewBox="0 0 24 24" stroke-width="1.5" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.00005 19L19 5.99996M19 5.99996V18.48M19 5.99996H6.52005" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
            "</span>",
            "</div>",
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
        var selected = document.querySelector('input[data-filter-group="price"]:checked');
        if (!selected || selected.value === "all") {
            return null;
        }
        return [selected.value];
    }

    function applyFilters() {
        if (!resultCount || !emptyState || !resourceGrid) {
            return;
        }

        var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
        var activePrices = getActivePrices();
        var visibleItems = listings.filter(function (item) {
            var matchesQuery = item.searchText.indexOf(query) !== -1;
            var matchesPrice = !activePrices || activePrices.indexOf(item.price) !== -1;
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

    function handleCategoryChange() {
        if (!categoryFilters) return;
        activeCategory = categoryFilters.value;
        applyFilters();
    }

    function attachFilterListeners() {
        if (searchInput) {
            searchInput.addEventListener("input", applyFilters);
        }

        if (categoryFilters) {
            categoryFilters.addEventListener("change", handleCategoryChange);
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

    var SHEET_ID = "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";
    var SHEET_GID = "0";

    function buildSheetUrl() {
        var sheetId = (catalogSection && catalogSection.dataset.sheetId) || SHEET_ID;
        var sheetGid = (catalogSection && catalogSection.dataset.sheetGid) || SHEET_GID;

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

    var CACHE_KEY = "dw_listings_cache";
    var CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    function getCachedListings() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var cached = JSON.parse(raw);
            if (Date.now() - cached.timestamp > CACHE_TTL) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return cached.rows;
        } catch (e) { return null; }
    }

    function setCachedListings(rows) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), rows: rows }));
        } catch (e) { /* quota exceeded — ignore */ }
    }

    function applyListingsData(rows) {
        listings = buildListings(rows);

        if (!listings.length) {
            throw new Error("No listings found in the sheet.");
        }

        createCategoryFilters(listings);
        createPriceFilters(listings);
        updateHighlights(listings);
        applyFilters();

        var searchInput = document.getElementById("resource-search");
        if (searchInput) {
            searchInput.placeholder = "Search...";
        }

        if (typeof renderFavPage === "function") renderFavPage();
    }

    function loadListings() {
        var sheetUrl = buildSheetUrl();

        if (!sheetUrl) {
            setErrorState("This browser could not initialize the Google Sheets feed.");
            return;
        }

        // Try cache first for instant load
        var cachedRows = getCachedListings();
        if (cachedRows) {
            try {
                applyListingsData(cachedRows);
            } catch (e) {
                // Cache was bad, fall through to network
                cachedRows = null;
            }
        }

        if (!cachedRows) {
            setLoadingState("Loading listings from Google Sheets...");
        }

        // Always fetch fresh data in the background
        requestSheetData(
            sheetUrl,
            function (payload) {
                var rows = payload && payload.table && payload.table.rows ? payload.table.rows : [];
                setCachedListings(rows);
                // Only re-render if we didn't already load from cache, or data changed
                if (!cachedRows) {
                    applyListingsData(rows);
                }
            },
            function () {
                if (!cachedRows) {
                    listings = [];
                    renderCards([]);
                    setErrorState("Could not load Google Sheets data.");
                }
            }
        );
    }

    attachFilterListeners();
    loadListings();

    /* ── Featured section from Google Sheets (separate JSONP to avoid conflict) ── */
    var FEATURED_CACHE_KEY = "dw_featured_cache";

    function loadFeatured() {
        var featuredGrid = document.getElementById("featured-grid");
        if (!featuredGrid) return;

        // Try cache first
        var cachedFeatured = null;
        try {
            var raw = localStorage.getItem(FEATURED_CACHE_KEY);
            if (raw) {
                var cached = JSON.parse(raw);
                if (Date.now() - cached.timestamp < CACHE_TTL) {
                    cachedFeatured = cached.html;
                    featuredGrid.innerHTML = cachedFeatured;
                } else {
                    localStorage.removeItem(FEATURED_CACHE_KEY);
                }
            }
        } catch (e) {}

        var sheetId = "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";
        var gid = "1218813985";
        var callbackName = "__featuredSheetCallback_" + Date.now();
        var url = "https://docs.google.com/spreadsheets/d/" + sheetId +
            "/gviz/tq?tqx=out:json;responseHandler:" + callbackName + "&gid=" + gid;

        var script = document.createElement("script");
        var timeoutId;

        window[callbackName] = function (payload) {
            clearTimeout(timeoutId);
            script.remove();
            delete window[callbackName];
            handleFeaturedPayload(payload);
        };

        script.async = true;
        script.src = url;
        script.onerror = function () {
            clearTimeout(timeoutId);
            script.remove();
            delete window[callbackName];
            if (!cachedFeatured) featuredGrid.innerHTML = '<p class="featured-loading">Could not load featured tools.</p>';
        };

        timeoutId = setTimeout(function () {
            script.remove();
            delete window[callbackName];
            if (!cachedFeatured) featuredGrid.innerHTML = '<p class="featured-loading">Featured tools timed out.</p>';
        }, 12000);

        document.body.appendChild(script);

        function handleFeaturedPayload(payload) {
            var rows = payload && payload.table && payload.table.rows ? payload.table.rows : [];
            if (!rows.length) {
                featuredGrid.innerHTML = '<p class="featured-loading">No featured tools found.</p>';
                return;
            }

            var headers = (rows[0].c || []).map(function (cell) {
                return normalizeHeader(getCellValue(cell));
            });
            console.log("Featured headers:", headers);

            var items = rows.slice(1).map(function (row) {
                var cells = row.c || [];
                var record = {};
                headers.forEach(function (header, index) {
                    record[header] = getCellValue(cells[index]);
                });
                return record;
            }).filter(function (item) {
                return item.title || item.name;
            });

            if (!items.length) {
                featuredGrid.innerHTML = '<p class="featured-loading">No featured tools found.</p>';
                return;
            }

            console.log("Featured item sample:", items[0]);

            featuredGrid.innerHTML = items.map(function (item) {
                var title = escapeHtml(item.title || item.name || "");
                var desc = escapeHtml(item.description || "");
                var logo = item.image || item.logo || "";
                var category = escapeHtml(item.categories || item.category || item.subtitle || "");
                var link = item.link || item.url || "#";
                var thumbnailStr = item.thumbnails || item.thumbnail || item.banner_image || item.bannerimage || "";

                /* Parse multiple thumbnails separated by comma or newline */
                var thumbs = thumbnailStr.split(/[,\n]+/).map(function (t) { return t.trim(); }).filter(Boolean);

                var logoHtml = logo
                    ? '<img class="featured-card-logo" src="' + escapeHtml(logo) + '" alt="' + title + '">'
                    : '';

                var tagHtml = category
                    ? '<span class="featured-card-tag">' + category + '</span>'
                    : '';

                var thumbsHtml = thumbs.length
                    ? '<div class="featured-card-thumbs">' +
                        thumbs.map(function (src) {
                            return '<img class="featured-card-thumb" src="' + escapeHtml(src) + '" alt="">';
                        }).join("") +
                      '</div>'
                    : '';

                return '<a class="featured-card" href="' + escapeHtml(link) + '" target="_blank" rel="noopener">' +
                    '<div class="featured-card-info">' +
                        '<span class="featured-card-kicker"><svg class="featured-star-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M341.5 45.1C337.4 37.1 329.1 32 320.1 32C311.1 32 302.8 37.1 298.7 45.1L225.1 189.3L65.2 214.7C56.3 216.1 48.9 222.4 46.1 231C43.3 239.6 45.6 249 51.9 255.4L166.3 369.9L141.1 529.8C139.7 538.7 143.4 547.7 150.7 553C158 558.3 167.6 559.1 175.7 555L320.1 481.6L464.4 555C472.4 559.1 482.1 558.3 489.4 553C496.7 547.7 500.4 538.8 499 529.8L473.7 369.9L588.1 255.4C594.5 249 596.7 239.6 593.9 231C591.1 222.4 583.8 216.1 574.8 214.7L415 189.3L341.5 45.1z"/></svg> FEATURED PRODUCT</span>' +
                        logoHtml +
                        '<span class="featured-card-title">' + title + '</span>' +
                        tagHtml +
                        (desc ? '<span class="featured-card-desc">' + desc + '</span>' : '') +
                    '</div>' +
                    thumbsHtml +
                '</a>';
            }).join("");

            // Cache the rendered HTML
            try {
                localStorage.setItem(FEATURED_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), html: featuredGrid.innerHTML }));
            } catch (e) {}
        }
    }

    /* Load featured immediately — uses its own JSONP callback, no conflict */
    loadFeatured();

    /* ── Hide nav when catalog section reaches top ── */
    (function () {
        var catalogSection = document.getElementById("catalog");
        var header = document.querySelector(".site-header");
        if (!catalogSection || !header) return;

        var headerHeight = 80;
        var isHidden = false;

        window.addEventListener("scroll", function () {
            var rect = catalogSection.getBoundingClientRect();
            var shouldHide = rect.top <= headerHeight;

            if (shouldHide && !isHidden) {
                header.classList.add("is-hidden");
                isHidden = true;
            } else if (!shouldHide && isHidden) {
                header.classList.remove("is-hidden");
                isHidden = false;
            }
        }, { passive: true });
    })();

    /* ── Google Sign-In & Favourites ── */
    var GOOGLE_CLIENT_ID = "488109146197-vnlm4eub8pbe7m66giqlhovkuev72gdl.apps.googleusercontent.com";
    var currentUser = null;
    var loginModal = document.getElementById("login-modal");
    var loginModalClose = document.getElementById("login-modal-close");
    var navUserBtn = document.getElementById("nav-user-btn");
    var googleSigninBtn = document.getElementById("google-signin-btn");

    function getFavKey() {
        return currentUser ? "dw_favs_" + currentUser.sub : null;
    }

    function getFavourites() {
        var key = getFavKey();
        if (!key) return [];
        try { return JSON.parse(localStorage.getItem(key)) || []; }
        catch (e) { return []; }
    }

    function saveFavourites(favs) {
        var key = getFavKey();
        if (key) localStorage.setItem(key, JSON.stringify(favs));
    }

    function toggleFavourite(id) {
        var favs = getFavourites();
        var idx = favs.indexOf(id);
        if (idx === -1) { favs.push(id); } else { favs.splice(idx, 1); }
        saveFavourites(favs);
        updateFavIcons();
    }

    function updateFavIcons() {
        var favs = getFavourites();
        document.querySelectorAll(".fav-btn").forEach(function (btn) {
            var id = btn.getAttribute("data-fav-id");
            var isFav = favs.indexOf(id) !== -1;
            btn.classList.toggle("is-fav", isFav);
        });
        updateNavFavCount(favs.length);
    }

    function updateNavFavCount(count) {
        var navFavCount = document.getElementById("nav-fav-count");
        var navFavNumber = document.getElementById("nav-fav-number");
        if (!navFavCount) return;
        if (currentUser && count > 0) {
            navFavCount.hidden = false;
            if (navFavNumber) navFavNumber.textContent = count;
        } else {
            navFavCount.hidden = true;
        }
    }

    function showLoginModal() {
        if (loginModal) loginModal.hidden = false;
        loadGoogleSignIn();
    }

    function hideLoginModal() {
        if (loginModal) loginModal.hidden = true;
    }

    function decodeJWT(token) {
        try {
            var payload = token.split(".")[1];
            return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        } catch (e) { return null; }
    }

    function onGoogleSignIn(response) {
        var user = decodeJWT(response.credential);
        if (!user) return;
        currentUser = user;
        localStorage.setItem("dw_user", JSON.stringify({ name: user.name, picture: user.picture, sub: user.sub }));
        hideLoginModal();
        updateUserUI();
        updateFavIcons();
    }

    function updateUserUI() {
        if (!navUserBtn) return;
        if (currentUser) {
            var firstName = (currentUser.name || "").split(" ")[0];
            navUserBtn.innerHTML = '<span class="nav-user-name">' + firstName + '</span><img class="nav-user-avatar" src="' + currentUser.picture + '" alt="' + (currentUser.name || "") + '">';
            navUserBtn.title = currentUser.name || "Logged in";
        } else {
            navUserBtn.innerHTML = "Login";
            navUserBtn.title = "Login";
        }
        updateNavFavCount(getFavourites().length);
    }

    // Restore session
    try {
        var savedUser = JSON.parse(localStorage.getItem("dw_user"));
        if (savedUser && savedUser.sub) {
            currentUser = savedUser;
            updateUserUI();
        }
    } catch (e) {}

    // Initialize Google Sign-In when library loads
    function initGoogleSignIn() {
        if (typeof google === "undefined" || !google.accounts) return;
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: onGoogleSignIn
        });
        if (googleSigninBtn) {
            google.accounts.id.renderButton(googleSigninBtn, {
                theme: "filled_black",
                size: "large",
                shape: "pill",
                text: "signin_with",
                width: 280
            });
        }
        var customGoogleBtn = document.getElementById("login-google-custom");
        if (customGoogleBtn) {
            customGoogleBtn.addEventListener("click", function () {
                google.accounts.id.prompt();
            });
        }
    }

    // Lazy-load Google Sign-In SDK
    var gsiLoaded = false;
    function loadGoogleSignIn() {
        if (gsiLoaded) return;
        gsiLoaded = true;
        var s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = function () {
            var gsiCheck = setInterval(function () {
                if (typeof google !== "undefined" && google.accounts) {
                    clearInterval(gsiCheck);
                    initGoogleSignIn();
                }
            }, 100);
        };
        document.head.appendChild(s);
    }

    // Nav user button click
    if (navUserBtn) {
        navUserBtn.addEventListener("click", function (e) {
            e.preventDefault();
            if (currentUser) {
                if (confirm("Logged in as " + currentUser.name + ". Sign out?")) {
                    currentUser = null;
                    localStorage.removeItem("dw_user");
                    updateUserUI();
                    updateFavIcons();
                }
            } else {
                showLoginModal();
            }
        });
    }

    if (loginModalClose) {
        loginModalClose.addEventListener("click", hideLoginModal);
    }

    if (loginModal) {
        loginModal.addEventListener("click", function (e) {
            if (e.target === loginModal) hideLoginModal();
        });
    }

    // Heart click handler (delegated)
    document.addEventListener("click", function (e) {
        var favBtn = e.target.closest(".fav-btn");
        if (!favBtn) return;
        e.preventDefault();
        e.stopPropagation();
        if (!currentUser) {
            showLoginModal();
            return;
        }
        var id = favBtn.getAttribute("data-fav-id");
        toggleFavourite(id);
    });

    // Update fav icons after cards render
    var observer = new MutationObserver(function () { updateFavIcons(); });
    if (resourceGrid) {
        observer.observe(resourceGrid, { childList: true });
    }

    // Favourites page
    var navFavCountBtn = document.getElementById("nav-fav-count");
    var favGrid = document.getElementById("fav-grid");
    var favPageEmpty = document.getElementById("fav-page-empty");
    var favPageLogin = document.getElementById("fav-page-login");

    function renderFavPage() {
        if (!favGrid) return;
        if (!currentUser) {
            favPageLogin && (favPageLogin.hidden = false);
            favPageEmpty && (favPageEmpty.hidden = true);
            favGrid.innerHTML = "";
            return;
        }
        favPageLogin && (favPageLogin.hidden = true);
        var favs = getFavourites();
        var favItems = listings.filter(function (item) {
            return favs.indexOf(item.title) !== -1;
        });

        if (favItems.length === 0) {
            favGrid.innerHTML = "";
            favPageEmpty && (favPageEmpty.hidden = false);
        } else {
            favPageEmpty && (favPageEmpty.hidden = true);
            favGrid.innerHTML = favItems.map(createCardMarkup).join("");
            updateFavIcons();
        }
    }

    if (navFavCountBtn) {
        navFavCountBtn.addEventListener("click", function () {
            if (currentUser) {
                window.location.href = "favourites.html";
            }
        });
    }

    // renderFavPage is called from loadListings callback when data is ready

});
