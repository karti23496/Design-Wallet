// The groups the /dw-tools/ index sorts tools into, in display order. A tool's
// `category` must be one of these; one that is not lands in a trailing "More".
var DW_TOOL_CATEGORIES = ["Color & Brand", "Image", "CSS & Code"];

// Design Wallet's own free tools, listed in the nav "Mini Tools" panel.
// Add a new one here and it appears in the nav on every page. `icon` is the
// inner markup of a 24×24 stroked SVG, in the house style of public/icons/.
// `category` only affects the /dw-tools/ index; the nav panel stays one list.
var DW_TOOLS = [
    {
        name: "Color Code Converter",
        category: "Color & Brand",
        href: "/dw-tools/color-code-converter/",
        description: "Convert between HEX, RGB, HSL, HSV, OKLCH and CMYK.",
        icon: '<circle cx="9" cy="9" r="5.5"/><circle cx="15" cy="15" r="5.5"/>'
    },
    {
        name: "Background Remover",
        category: "Image",
        href: "/dw-tools/background-remover/",
        description: "Cut out any subject \u2014 hair included \u2014 without uploading it.",
        icon: '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3.2 3.2"/><circle cx="9" cy="9.4" r="1.5"/><path d="M6.5 16.5 10 12.6l2.4 2.7 2-2.3 3.1 3.5"/>'
    },
    {
        name: "Glassmorphism CSS Generator",
        category: "CSS & Code",
        href: "/dw-tools/glassmorphism-css-generator/",
        description: "Design frosted glass, then copy it as CSS, Tailwind or React.",
        icon: '<rect x="3" y="7" width="13" height="13" rx="3"/><rect x="8" y="4" width="13" height="13" rx="3"/>'
    }
];

// The nav "Resources" panel. Rendered as a PLAIN LIST, not the wide Mini Tools
// panel — Karthik's call, 2026-10-03, against a Zocket reference: two text
// links do not need icons, descriptions or a CTA column.
// `icon` and `description` are kept on each entry so a future move back to the
// mega template needs no data changes; the list renderer simply ignores them.
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
var DW_VERSION = "v2.3";

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

    // The plain-list renderer. The label sits in a <span>, never on the <a>:
    // `.blog-index-page .site-nav a` lands later at equal specificity and
    // would paint these white on the blog. Same trap the mega panel hit.
    function listItems(entries) {
        return entries.map(function (entry) {
            return '<a class="nav-list-item" href="' + entry.href + '">' +
                '<span class="nav-list-label">' + entry.name + '</span>' +
            '</a>';
        }).join("");
    }

    var toolsMenu = megaItems(DW_TOOLS);
    var resourcesMenu = listItems(DW_RESOURCES);

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
            // A plain dropdown, anchored to its own trigger. It keeps the base
            // .nav-dropdown geometry, which is why the mobile stacked sheet
            // needs no special casing for it.
            '<div class="nav-dropdown nav-dropdown--list">' +
                // No href: the trigger opens the menu rather than navigating.
                // tabindex keeps it keyboard-reachable for :focus-within.
                '<a class="nav-dropdown-trigger" tabindex="0" role="button" aria-haspopup="true">Resources' +
                    '<svg class="nav-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
                '</a>' +
                '<div class="nav-dropdown-menu nav-list" aria-label="Design Wallet resources">' +
                    '<p class="nav-list-heading">Browse</p>' +
                    resourcesMenu +
                '</div>' +
            '</div>' +
            // The NEW pill rides inside the link so it moves with it and is
            // still part of the same tap target.
            '<a href="/salary/">Know your money<span class="nav-new">NEW</span></a>' +
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
