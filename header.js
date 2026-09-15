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

    var toolsMenu = DW_TOOLS.map(function (tool) {
        return '<a class="nav-mega-item" href="' + tool.href + '">' +
            '<span class="nav-mega-icon" aria-hidden="true">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + tool.icon + '</svg>' +
            '</span>' +
            '<span class="nav-mega-title">' + tool.name + NAV_ARROW_ICON + '</span>' +
            '<span class="nav-mega-desc">' + tool.description + '</span>' +
        '</a>';
    }).join("");

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
            '<a href="/books/">Books</a>' +
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
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);
