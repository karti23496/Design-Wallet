/* ============================================================================
   List your tool — reports a "Book a call" click to Google Analytics.
   The button opens Calendly in a new tab, so the booking itself can't be seen
   from here; the click is the conversion we can count.
   ============================================================================ */

(function () {
    var button = document.querySelector(".lyt-book-btn");

    if (!button) {
        return;
    }

    button.addEventListener("click", function () {
        if (typeof window.gtag === "function") {
            window.gtag("event", "list_tool_call_click");
        }
    });
}());
