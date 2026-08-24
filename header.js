// Design Wallet's own free tools, listed in the nav "TOOLS" dropdown.
// Add a new one here and it appears in the nav on every page.
var DW_TOOLS = [
    { name: "Color Code Converter", href: "/dw-tools/color-code-converter/" }
];

var THEME_ICONS = {
    // Shown in dark mode: click for light.
    dark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>',
    // Shown in light mode: click for dark.
    light: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.2 8.2 0 019.5 4a8.4 8.4 0 108.7 12 8.5 8.5 0 011.8-1.5z"/></svg>'
};

function themeToggleMarkup() {
    var theme = window.DWTheme ? window.DWTheme.current() : "dark";
    return '<button class="nav-theme-toggle" type="button" data-theme-toggle ' +
        'aria-label="Switch to ' + (theme === "light" ? "dark" : "light") + ' mode" ' +
        'title="Switch to ' + (theme === "light" ? "dark" : "light") + ' mode">' +
        THEME_ICONS[theme] +
    '</button>';
}

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
            '<a class="nav-browse-link" href="/category/">BROWSE</a>' +
            '<div class="nav-dropdown">' +
                // No href: the trigger opens the menu rather than navigating.
                // tabindex keeps it keyboard-reachable for :focus-within.
                '<a class="nav-dropdown-trigger" tabindex="0" role="button" aria-haspopup="true">TOOLS</a>' +
                '<div class="nav-dropdown-menu" aria-label="Design Wallet tools">' +
                    toolsMenu +
                '</div>' +
            '</div>' +
            '<a class="nav-blog-link" href="/blog/">BLOG</a>' +
            '<a class="nav-subscribe-link" href="#" data-newsletter-open>SUBSCRIBE</a>' +
            themeToggleMarkup() +
        '</nav>';

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
        header.classList.toggle('site-header--collection', isCollection);
    });

    wireThemeToggle();
}

function wireThemeToggle() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
            if (!window.DWTheme) return;
            var next = window.DWTheme.toggle();
            var label = 'Switch to ' + (next === 'light' ? 'dark' : 'light') + ' mode';
            document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
                b.innerHTML = THEME_ICONS[next];
                b.setAttribute('aria-label', label);
                b.setAttribute('title', label);
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);
