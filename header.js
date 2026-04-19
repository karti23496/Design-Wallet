function loadHeader() {
    var html = '<a class="brand" href="/" aria-label="Design Wallet home">' +
            '<img class="brand-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet">' +
        '</a>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="primary-nav">' +
            '<a href="/#submit">GOOD DEALS \uD83D\uDD25</a>' +
            '<a href="/books/">BOOKS</a>' +
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
