/**
 * unsubscribe.js: the page behind the unsubscribe link in the report email.
 *
 * The link carries a random token (never the email address). The database
 * function `unsubscribe(p_token)` (supabase/report-otp.sql) answers the same,
 * with nothing, whether or not the token matched a row, so this page cannot be
 * used to find out who is on the list. That is why a well-formed token always
 * ends in "You're unsubscribed".
 */
(function () {
    "use strict";

    var SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
    var SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    var title = document.getElementById("unsub-title");
    var text = document.getElementById("unsub-text");

    function show(heading, html) {
        title.textContent = heading;
        text.innerHTML = html;
    }

    var token = new URLSearchParams(window.location.search).get("t") || "";

    if (!UUID.test(token)) {
        show("This link doesn't look right", 'Write to <a href="mailto:hello@designwallet.in">hello@designwallet.in</a> and we\'ll take you off the list by hand.');
        return;
    }

    fetch(SUPABASE_URL + "/rest/v1/rpc/unsubscribe", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token: token })
    }).then(function (res) {
        if (res.ok) {
            show("You're unsubscribed", 'You won\'t get the Designer\'s Weekly Drop any more. If that was a mistake, write to <a href="mailto:hello@designwallet.in">hello@designwallet.in</a>.');
        } else {
            show("That didn't work", 'Please try the link again in a moment, or write to <a href="mailto:hello@designwallet.in">hello@designwallet.in</a>.');
        }
    }).catch(function () {
        show("We couldn't reach the server", "Check your connection and open the link again.");
    });
})();
