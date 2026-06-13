function loadHeader() {
    var collectionItems = [
        ["AI TOOLS", "sparkles", "/category/ai-tools/"],
        ["LEARNING", "learning", "/category/learn-design/"],
        ["INSPIRATION", "bolt", "/category/design-inspirations/"],
        ["COMMUNITY", "community", "/category/design-communities/"],
        ["UX TOOLS", "monitor", "/category/ux-tools/"],
        ["ICONS", "star", "/category/icons/"],
        ["COLOR TOOLS", "palette", "/category/color-palatte/"],
        ["MOCKUPS + KITS", "briefcase", "/category/ui-kits/"],
        ["WEB BUILDERS", "web", "/category/website-builder-tools/"]
    ];

    function collectionLink(item) {
        return '<a class="nav-collection-link" href="' + item[2] + '">' +
            '<span class="nav-collection-icon nav-icon-' + item[1] + '" aria-hidden="true"></span>' +
            '<span>' + item[0] + '</span>' +
        '</a>';
    }

    var html = '<a class="brand" href="/" aria-label="Design Wallet home">' +
            '<img class="brand-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet">' +
        '</a>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="primary-nav">' +
            '<div class="nav-dropdown nav-collections-dropdown">' +
                '<a class="nav-dropdown-trigger" href="/category/" aria-haspopup="true">COLLECTIONS</a>' +
                '<div class="nav-dropdown-menu nav-collections-menu" aria-label="Collections">' +
                    collectionItems.map(collectionLink).join('') +
                '</div>' +
            '</div>' +
            '<div class="nav-dropdown">' +
                '<a class="nav-dropdown-trigger" href="/books/" aria-haspopup="true">RESOURCES</a>' +
                '<div class="nav-dropdown-menu" aria-label="Resources">' +
                    '<a href="/#submit">GOOD DEALS \uD83D\uDD25</a>' +
                    '<a href="/books/">BOOKS</a>' +
                    '<a href="/blog/">BLOG</a>' +
                '</div>' +
            '</div>' +
            '<a class="nav-waitlist-button" href="/join-waitlist" data-waitlist-open>JOIN WAITLIST</a>' +
            '<div class="list-tool-wrap" style="display: flex; align-items: center; gap: 8px;">' +
                '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 12px 14px; background-color: rgba(255, 255, 255, 0.05); border: 1px solid #ffffff40; border-radius: 24px; cursor: default; font-size: 12px; line-height: 1; letter-spacing: 0.04em;">LIST YOUR TOOLS</span>' +
                '<span style="font-size: 10px; padding: 4px 8px; background-color: #ffffff15; border: 1px solid #ffffff45; border-radius: 8px; color: #ffffff; text-transform: uppercase; opacity:0.5;">Coming Soon</span>' +
            '</div>' +
        '</nav>';

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);
