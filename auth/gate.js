// ============================================================================
// Sign-in gate (Karthik, 2026-10-29: "the user is going to access the product
// only after login"). Signed-out visitors are sent to /sign-in/, which brings
// them back here afterwards.
//
// Loaded in <head>, before anything renders, on every page except the
// homepage, the portal pages themselves, /privacy/ and /terms/ (Google's
// sign-in screen links to those, so they must stay public), the Mini Tools
// and Blog, which Karthik opened up on 2026-10-30 ("It doesn't need sign up"),
// and /list-your-tool/ (2026-10-31: makers reach it from the homepage FAQ).
// /changelog/ is public too (2026-11-01: Karthik, "accessible for the user
// without log in").
//
// ⚠️ This is a front door, not a lock. The catalogue still loads from Supabase
// with the publishable key, and the MCP connector serves it openly. Karthik
// chose this level on purpose; locking the data itself is a separate change.
//
// Same session check as header.js: Supabase's own localStorage entry.
// ============================================================================
(function () {
    var signedIn = false;
    try {
        var session = JSON.parse(localStorage.getItem("sb-ugjtyuikvdeymwsfsgfl-auth-token") || "null");
        signedIn = !!(session && session.user && session.refresh_token);
    } catch (e) { /* storage blocked: treat as signed out */ }

    if (!signedIn) {
        var here = location.pathname + location.search + location.hash;
        location.replace("/sign-in/?next=" + encodeURIComponent(here));
    }
}());
