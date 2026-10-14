/* ============================================================================
   Mini Tools index — renders one card per entry in DW_TOOLS (header.js), so
   the nav panel and this page always list the same tools, here grouped under
   the headings in DW_TOOL_CATEGORIES. Adding a tool to DW_TOOLS adds it to both.
   ============================================================================ */

(function () {
    var groups = document.getElementById("dwt-groups");

    if (!groups || typeof DW_TOOLS === "undefined") {
        return;
    }

    var arrowIcon =
        '<svg class="dwt-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M5 12h14M13 6l6 6-6 6"/>' +
        '</svg>';

    function card(tool) {
        return '<li>' +
            '<a class="dwt-card" href="' + tool.href + '">' +
                '<span class="dwt-card-icon" aria-hidden="true">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + tool.icon + '</svg>' +
                '</span>' +
                '<span class="dwt-card-title">' + tool.name + arrowIcon + '</span>' +
                '<span class="dwt-card-desc">' + tool.description + '</span>' +
            '</a>' +
        '</li>';
    }

    // Declared categories first, in order; anything undeclared gathers under "More".
    var order = (typeof DW_TOOL_CATEGORIES !== "undefined" ? DW_TOOL_CATEGORIES : []).slice();
    var byCategory = {};
    DW_TOOLS.forEach(function (tool) {
        var name = order.indexOf(tool.category) !== -1 ? tool.category : "More";
        (byCategory[name] = byCategory[name] || []).push(tool);
    });
    if (byCategory.More) order.push("More");

    groups.innerHTML = order.filter(function (name) { return byCategory[name]; }).map(function (name, i) {
        var id = "dwt-group-" + i;
        return '<section class="dwt-group" aria-labelledby="' + id + '">' +
            '<h2 class="dwt-group-title" id="' + id + '">' + name +
                '<span class="dwt-group-count">' + byCategory[name].length + '</span></h2>' +
            '<ul class="dwt-grid">' + byCategory[name].map(card).join("") + '</ul>' +
        '</section>';
    }).join("");
}());
