/* ============================================================================
   Mini Tools index — renders one card per entry in DW_TOOLS (header.js), so
   the nav panel and this page always list the same tools. Adding a tool to
   DW_TOOLS adds it to both.
   ============================================================================ */

(function () {
    var grid = document.getElementById("dwt-grid");

    if (!grid || typeof DW_TOOLS === "undefined") {
        return;
    }

    var arrowIcon =
        '<svg class="dwt-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M5 12h14M13 6l6 6-6 6"/>' +
        '</svg>';

    grid.innerHTML = DW_TOOLS.map(function (tool) {
        return '<li>' +
            '<a class="dwt-card" href="' + tool.href + '">' +
                '<span class="dwt-card-icon" aria-hidden="true">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + tool.icon + '</svg>' +
                '</span>' +
                '<span class="dwt-card-title">' + tool.name + arrowIcon + '</span>' +
                '<span class="dwt-card-desc">' + tool.description + '</span>' +
            '</a>' +
        '</li>';
    }).join("");
}());
