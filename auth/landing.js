// ============================================================================
// The homepage is a landing page for people who aren't signed in yet
// (Karthik, 2026-10-30). Anyone signed in has already been sold on it, so
// they go straight to the catalogue at /category/.
//
// Loaded first in the homepage's <head>, before anything renders: the mirror
// image of auth/gate.js. Same session check as header.js.
// ============================================================================
(function () {
    try {
        var session = JSON.parse(localStorage.getItem("sb-ugjtyuikvdeymwsfsgfl-auth-token") || "null");
        if (session && session.user && session.refresh_token) {
            location.replace("/category/" + location.search + location.hash);
        }
    } catch (e) { /* storage blocked: show the landing page */ }
}());
