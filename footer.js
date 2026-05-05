function loadFooter() {
    var year = new Date().getFullYear();
    var categoryLinks = [
        ["AI Tools", "/tools/?category=ai-tools", "M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3zM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"],
        ["Learning", "/tools/?category=learn-design", "M3 7l9-4 9 4-9 4-9-4zM6 10v5c2 2 10 2 12 0v-5"],
        ["Design Tools", "/tools/?category=design-tools", "M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z"],
        ["Inspiration", "/tools/?category=design-inspirations", "M13 2L4 14h7l-1 8 10-13h-7l0-7z"],
        ["Community", "/tools/?category=design-communities", "M8 12a4 4 0 118 0 4 4 0 01-8 0zM3 21a7 7 0 0114 0M17 13a4 4 0 014 4v4"],
        ["UX Tools", "/tools/?category=ux-tools", "M4 6h16v10H4V6zm4 14h8M9 16l-1 4M15 16l1 4"],
        ["Icons", "/tools/?category=icons", "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8L12 3z"],
        ["Blogs & Mags", "/blog/", "M5 4h14v16H5V4zm3 4h8M8 12h8M8 16h5"],
        ["Color Tools", "/tools/?category=color-palatte", "M12 3a9 9 0 100 18h1.5a2 2 0 001.8-2.9 1.6 1.6 0 011.4-2.4H18a6 6 0 00-6-12.7zM7 11h.1M9 7h.1M14 7h.1"],
        ["Mockups + Kits", "/tools/?category=ui-kits", "M4 8h16v10H4V8zm3-4h10v4H7V4z"],
        ["Books", "/books/", "M5 4h10a4 4 0 014 4v12H9a4 4 0 00-4-4V4z"],
        ["Web Builders", "/tools/?category=website-builder-tools", "M4 5h16v14H4V5zm0 4h16M8 14h5"]
    ];
    function icon(path) {
        return '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
    }
    var html = '<div class="footer-inner">' +
        '<div class="footer-about">' +
            '<a class="footer-brand" href="/" aria-label="Design Wallet home"><img src="/public/Logo/Website-logo.svg" alt="Design Wallet"></a>' +
            '<p class="footer-large-copy">A growing directory of design resources, weekly updated for curious designers.</p>' +
            '<p class="footer-note">Partner links may be affiliate links, which help support Design Wallet at no extra cost.</p>' +
            '<div class="footer-built">' +
                '<span>Built with care</span>' +
                '<span>Curated by Design Wallet</span>' +
            '</div>' +
        '</div>' +
        '<div class="footer-directory">' +
            '<div class="footer-group">' +
                '<nav class="footer-category-grid" aria-label="Footer categories">' +
                    categoryLinks.map(function (item) {
                        return '<a href="' + item[1] + '">' + icon(item[2]) + '<span>' + item[0] + '</span></a>';
                    }).join("") +
                '</nav>' +
            '</div>' +
        '</div>' +
        '<div class="footer-bottom">' +
            '<p>&copy; ' + year + ' Design Wallet</p>' +
            '<nav class="footer-nav">' +
                '<a href="/terms/">Terms</a>' +
                '<a href="/privacy/">Privacy</a>' +
                '<a href="https://www.linkedin.com/company/design-wallet/" target="_blank" rel="noopener noreferrer">LinkedIn</a>' +
            '</nav>' +
        '</div>' +
    '</div>';

    var footers = document.querySelectorAll('.site-footer');
    footers.forEach(function(footer) {
        footer.innerHTML = html;
    });
}

document.addEventListener('DOMContentLoaded', loadFooter);
