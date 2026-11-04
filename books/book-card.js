// ============================================================================
// The book card (Karthik, 2026-10-31: the Favourites page shows the same book
// card as /books/). One copy of the markup, used by the books grid in
// script.js and by the Books section of the Favourites view in tools.js.
// The styles are the .book-* rules in style.css.
//
// window.DWBookCard(book, index): `book` is { slug, title, author, rating,
// thumbnail, link }; `index` is the book's place in the books list, and the
// first five get the Best Seller tag.
// ============================================================================
(function () {
    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function buildStars(rating) {
        var html = '<div class="book-stars">';
        var clipId = "star-clip-" + Math.random().toString(36).substr(2, 9);
        for (var i = 0; i < 5; i++) {
            var fill = Math.min(1, Math.max(0, rating - i));
            var pct = (fill * 100).toFixed(1);
            var uid = clipId + "-" + i;
            html += '<svg class="book-star" width="12" height="12" viewBox="0 0 24 24">' +
                '<defs><clipPath id="' + uid + '"><rect x="0" y="0" width="' + pct + '%" height="100%"/></clipPath></defs>' +
                '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#333" stroke="none"/>' +
                '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#F59E0B" clip-path="url(#' + uid + ')"/>' +
                '</svg>';
        }
        html += '<span class="book-rating-num">' + rating.toFixed(2) + '</span></div>';
        return html;
    }

    window.DWBookCard = function (b, index) {
        var rating = parseFloat(b.rating) || 0;
        // The heart: tools/favourites.js paints it and handles the click.
        var favHtml = b.slug
            ? '<button class="dw-fav" type="button" data-fav-kind="book" data-fav="' + escapeHtml(b.slug) +
              '" data-fav-name="' + escapeHtml(b.title) + '"></button>'
            : '';
        var thumbHtml = b.thumbnail
            ? '<img src="' + escapeHtml(b.thumbnail) + '" alt="' + escapeHtml(b.title) + '" loading="lazy">'
            : '';
        var linkOpen = b.link
            ? '<a href="' + escapeHtml(b.link) + '" target="_blank" rel="noopener noreferrer" class="book-card-link">'
            : '<div class="book-card-link">';
        var linkClose = b.link ? '</a>' : '</div>';
        var tagHtml = index < 5 ? '<span class="book-bestseller-tag">Best Seller</span>' : '';

        return linkOpen +
            '<div class="book-card">' +
                '<div class="book-thumb">' + tagHtml + favHtml + thumbHtml + '<span class="book-buy-btn">Buy Now</span></div>' +
                '<div class="book-info">' +
                    '<h3 class="book-title">' + escapeHtml(b.title) + '</h3>' +
                    '<div class="book-meta">' +
                        '<p class="book-author">' + escapeHtml(String(b.author || "").toUpperCase()) + '</p>' +
                        buildStars(rating) +
                    '</div>' +
                '</div>' +
            '</div>' +
            linkClose;
    };
}());
