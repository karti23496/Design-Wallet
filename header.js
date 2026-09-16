// Design Wallet's own free tools, listed in the nav "Mini Tools" panel.
// Add a new one here and it appears in the nav on every page. `icon` is the
// inner markup of a 24×24 stroked SVG, in the house style of public/icons/.
var DW_TOOLS = [
    {
        name: "Color Code Converter",
        href: "/dw-tools/color-code-converter/",
        description: "Convert between HEX, RGB, HSL, HSV, OKLCH and CMYK.",
        icon: '<circle cx="9" cy="9" r="5.5"/><circle cx="15" cy="15" r="5.5"/>'
    },
    {
        name: "Glassmorphism CSS Generator",
        href: "/dw-tools/glassmorphism-css-generator/",
        description: "Design frosted glass, then copy it as CSS, Tailwind or React.",
        icon: '<rect x="3" y="7" width="13" height="13" rx="3"/><rect x="8" y="4" width="13" height="13" rx="3"/>'
    }
];

// The nav "Resources" panel. Same shape as a DW_TOOLS entry, and rendered by
// the same template, so both dropdowns stay identical by construction.
var DW_RESOURCES = [
    {
        name: "Wallet Reads",
        href: "/books/",
        description: "Books worth reading, picked for designers.",
        icon: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'
    },
    {
        name: "Wall of Portfolios",
        href: "/wall-of-portfolios/",
        description: "Real portfolios from working designers.",
        icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
    }
];

// The latest changelog version, shown as a capsule beside the logo and linked
// to /changelog/. /update-change-log bumps this with every new version.
var DW_VERSION = "v2.2";

var NAV_ARROW_ICON =
    '<svg class="nav-mega-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M5 12h14M13 6l6 6-6 6"/>' +
    '</svg>';

function loadHeader() {
    // Collection views (/category/*, /tools/*) render a full-width flat header;
    // everywhere else uses the floating pill. That is purely a layout variant —
    // the nav itself is identical on every page.
    var isCollection = /^\/(category|tools)(\/|$)/.test(location.pathname);

    // One template for both panels — Mini Tools and Resources — so they cannot
    // drift apart. An entry needs all four fields (name, href, description,
    // icon) or it renders a blank icon or description.
    function megaItems(entries) {
        return entries.map(function (entry) {
            return '<a class="nav-mega-item" href="' + entry.href + '">' +
                '<span class="nav-mega-icon" aria-hidden="true">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + entry.icon + '</svg>' +
                '</span>' +
                '<span class="nav-mega-title">' + entry.name + NAV_ARROW_ICON + '</span>' +
                '<span class="nav-mega-desc">' + entry.description + '</span>' +
            '</a>';
        }).join("");
    }

    var toolsMenu = megaItems(DW_TOOLS);
    var resourcesMenu = megaItems(DW_RESOURCES);

    var html =
        '<div class="brand-group">' +
            '<a class="brand" href="/" aria-label="Design Wallet home">' +
                '<img class="brand-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet">' +
            '</a>' +
            '<a class="brand-version" href="/changelog/" aria-label="Version ' + DW_VERSION.slice(1) + ', see the changelog">' + DW_VERSION + '</a>' +
        '</div>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="primary-nav">' +
            // Same panel treatment as Mini Tools, sized for two links and with
            // no CTA column — see .nav-dropdown--panel in style.css.
            '<div class="nav-dropdown nav-dropdown--panel">' +
                // No href: the trigger opens the menu rather than navigating.
                // tabindex keeps it keyboard-reachable for :focus-within.
                '<a class="nav-dropdown-trigger" tabindex="0" role="button" aria-haspopup="true">Resources' +
                    '<svg class="nav-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
                '</a>' +
                '<div class="nav-dropdown-menu nav-mega" aria-label="Design Wallet resources">' +
                    '<div class="nav-mega-grid">' +
                        resourcesMenu +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<a href="/salary/">Know your money</a>' +
            '<a href="/good-deals/">Good deals</a>' +
            '<div class="nav-dropdown nav-dropdown--wide">' +
                // No href: the trigger opens the menu rather than navigating.
                // tabindex keeps it keyboard-reachable for :focus-within.
                '<a class="nav-dropdown-trigger" tabindex="0" role="button" aria-haspopup="true">Mini Tools' +
                    '<svg class="nav-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
                '</a>' +
                '<div class="nav-dropdown-menu nav-mega" aria-label="Design Wallet tools">' +
                    '<div class="nav-mega-grid">' +
                        toolsMenu +
                    '</div>' +
                    '<div class="nav-mega-cta">' +
                        '<p class="nav-mega-cta-title">All mini tools</p>' +
                        '<p class="nav-mega-cta-text">Free, browser-based tools for designers. No sign-up.</p>' +
                        '<a class="nav-mega-cta-btn" href="/dw-tools/">' +
                            '<span class="nav-mega-cta-label">Explore the tools' + NAV_ARROW_ICON + '</span>' +
                        '</a>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<a href="/blog/">Blog</a>' +
            '<a class="nav-subscribe-link" href="#" data-newsletter-open>Subscribe</a>' +
        '</nav>';

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
        header.classList.toggle('site-header--collection', isCollection);
        bindNavToggle(header);
    });

    // Tell script.js not to bind its own copy. It queries the document once at
    // DOMContentLoaded, after this runs, so the flag is always set in time.
    window.DW_NAV_TOGGLE_BOUND = true;
}

// The hamburger used to be wired up in script.js, which only 10 of the 17
// pages load — on the rest, tapping it at 390px did nothing and the nav was
// unreachable. It belongs here, next to the markup it operates, because every
// page with a header loads header.js by definition.
function bindNavToggle(header) {
    var toggle = header.querySelector('.nav-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
        var isOpen = header.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
    });

    header.querySelectorAll('.site-nav a').forEach(function (link) {
        link.addEventListener('click', function () {
            // The dropdown triggers have no href — they open the menu rather
            // than navigating, so closing the sheet under the tap would make
            // the submenu unreachable on mobile.
            if (link.classList.contains('nav-dropdown-trigger')) return;

            header.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);
