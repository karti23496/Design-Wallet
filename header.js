// Design Wallet's own free tools, listed in the nav "TOOLS" dropdown.
// Add a new one here and it appears in the nav on every page.
var DW_TOOLS = [
    { name: "Color Code Converter", href: "/dw-tools/color-code-converter/" },
    { name: "Glassmorphism CSS Generator", href: "/dw-tools/glassmorphism-css-generator/" }
];

function loadHeader() {
    // Collection views (/category/*, /tools/*) render a full-width flat header;
    // everywhere else uses the floating pill. That is purely a layout variant —
    // the nav itself is identical on every page.
    var isCollection = /^\/(category|tools)(\/|$)/.test(location.pathname);

    var toolsMenu = DW_TOOLS.map(function (tool) {
        return '<a href="' + tool.href + '">' + tool.name + '</a>';
    }).join("");

    var html =
        '<a class="brand" href="/" aria-label="Design Wallet home">' +
            '<img class="brand-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet">' +
        '</a>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="primary-nav">' +
            '<a href="/books/">Books</a>' +
            '<a href="/good-deals/">Good deals</a>' +
            '<div class="nav-dropdown">' +
                // No href: the trigger opens the menu rather than navigating.
                // tabindex keeps it keyboard-reachable for :focus-within.
                '<a class="nav-dropdown-trigger" tabindex="0" role="button" aria-haspopup="true">Mini Tools</a>' +
                '<div class="nav-dropdown-menu" aria-label="Design Wallet tools">' +
                    toolsMenu +
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
