function loadHeader() {
    var html = '<a class="brand" href="index.html" aria-label="Design Wallet home">' +
            '<img class="brand-logo" src="public/Logo/Website-logo.svg" alt="Design Wallet">' +
        '</a>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="primary-nav">' +
            '<a href="index.html#submit">GOOD DEALS \uD83D\uDD25</a>' +
            '<a href="books.html">BOOKS</a>' +
            '<a href="pricing.html">LIST YOUR TOOLS</a>' +
            '<button class="nav-fav-count" id="nav-fav-count" type="button" aria-label="Favourites" hidden>' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
                '<span id="nav-fav-number">0</span>' +
            '</button>' +
            '<button class="nav-login-btn" id="nav-user-btn" type="button">LOGIN</button>' +
        '</nav>';

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);
