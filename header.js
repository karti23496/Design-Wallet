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
            '<a href="/pricing/" style="padding: 6px 24px; background-color: rgba(255, 255, 255, 0.05); border: 1px solid #ffffff10; border-radius: 24px">LIST YOUR TOOLS</a>' +
        '</nav>';

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);
