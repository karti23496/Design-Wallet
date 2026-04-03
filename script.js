document.addEventListener("DOMContentLoaded", function () {
    var siteHeader = document.querySelector(".site-header");
    var navToggle = document.querySelector(".nav-toggle");
    var navLinks = document.querySelectorAll(".site-nav a");
    var searchInput = document.getElementById("resource-search");
    var typeInputs = Array.from(document.querySelectorAll('input[data-filter-group="type"]'));
    var priceInputs = Array.from(document.querySelectorAll('input[data-filter-group="price"]'));
    var roleButtons = Array.from(document.querySelectorAll('button[data-filter-group="role"]'));
    var cards = Array.from(document.querySelectorAll(".resource-card"));
    var resultCount = document.getElementById("result-count");
    var emptyState = document.getElementById("empty-state");
    var currentYear = document.getElementById("current-year");
    var activeRole = "all";

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

    function applyFilters() {
        if (!searchInput || !resultCount || !emptyState) {
            return;
        }

        var query = searchInput.value.trim().toLowerCase();
        var activeTypes = typeInputs
            .filter(function (input) {
                return input.checked;
            })
            .map(function (input) {
                return input.value;
            });
        var activePrices = priceInputs
            .filter(function (input) {
                return input.checked;
            })
            .map(function (input) {
                return input.value;
            });
        var visibleCount = 0;

        cards.forEach(function (card) {
            var searchableText = (card.dataset.search || "").toLowerCase();
            var roles = (card.dataset.role || "").split(" ");
            var matchesQuery = searchableText.indexOf(query) !== -1;
            var matchesType = activeTypes.indexOf(card.dataset.type || "") !== -1;
            var matchesPrice = activePrices.indexOf(card.dataset.price || "") !== -1;
            var matchesRole = activeRole === "all" || roles.indexOf(activeRole) !== -1;
            var isVisible = matchesQuery && matchesType && matchesPrice && matchesRole;

            card.hidden = !isVisible;

            if (isVisible) {
                visibleCount += 1;
            }
        });

        resultCount.textContent = visibleCount + " resource" + (visibleCount === 1 ? "" : "s");
        emptyState.hidden = visibleCount !== 0;
    }

    roleButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            activeRole = button.dataset.filterValue || "all";

            roleButtons.forEach(function (candidate) {
                candidate.classList.toggle("is-active", candidate === button);
            });

            applyFilters();
        });
    });

    [searchInput]
        .concat(typeInputs, priceInputs)
        .filter(Boolean)
        .forEach(function (control) {
            control.addEventListener("input", applyFilters);
            control.addEventListener("change", applyFilters);
        });

    applyFilters();
});
