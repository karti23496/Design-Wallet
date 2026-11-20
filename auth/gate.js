// ============================================================================
// Sign-in gate.
//
// 2026-10-29 (Karthik: "the user is going to access the product only after
// login"): every product page sent signed-out visitors to /sign-in/.
// 2026-11-13 (Karthik, "Free reading"): reading is free again. Salary, Wall of
// Portfolios, every tool and category page, Books, MCP and /tools/ open
// signed out. Only Favourites, Submit salary and Submit portfolio stay locked,
// and actions (favourite, salary report download, MCP connect) ask for
// sign-in when clicked.
//
// How a page uses it, in <head> before anything renders:
//   <script src="/auth/gate.js">                                   whole page locked
//   <script src="/auth/gate.js" data-lock="none">                  page open; actions use DWGate.require()
//   <script src="/auth/gate.js" data-lock="/category/favourites/"> only paths starting with this are locked
//                                                                  (404.html serves every /category/ route)
//
// window.DWGate.require() returns true when the visitor may act. Otherwise it
// sends them to /sign-in/ (or /welcome/ to finish onboarding), with ?next=
// pointing back to this exact page and its filters, and returns false.
//
// ⚠️ This is a front door, not a lock. The catalogue still loads from Supabase
// with the publishable key, and the MCP connector serves it openly. Karthik
// chose this level on purpose; locking the data itself is a separate change.
//
// Same session check as header.js: Supabase's own localStorage entry.
//
// Signed in isn't enough either (Karthik, 2026-11-08): the product opens only
// once onboarding is finished. This file can't reach the database, so it reads
// the note auth/auth.js leaves (`dw_onboarded_v2`, the account's id; v2
// since LinkedIn became required on 2026-11-12, so everyone is re-checked once). No note, and
// /welcome/ asks the database: it sends finished accounts straight back here
// and shows everyone else the form.
// ============================================================================
(function () {
    var script = document.currentScript;
    var lock = script ? script.getAttribute("data-lock") : null;

    function state() {
        var signedIn = false;
        var onboarded = false;
        try {
            var session = JSON.parse(localStorage.getItem("sb-ugjtyuikvdeymwsfsgfl-auth-token") || "null");
            signedIn = !!(session && session.user && session.refresh_token);
            onboarded = signedIn && localStorage.getItem("dw_onboarded_v2") === session.user.id;
            // Two-step login (2026-11-12): an account with a verified
            // authenticator that hasn't entered its code yet is only half signed
            // in (the token says aal1). Send it to /sign-in/ for the code.
            var factors = signedIn ? (session.user.factors || []).filter(function (f) { return f.status === "verified"; }) : [];
            if (factors.length) {
                var part = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
                if (JSON.parse(atob(part)).aal !== "aal2") { signedIn = false; onboarded = false; }
            }
        } catch (e) { /* storage blocked: treat as signed out */ }
        return { signedIn: signedIn, onboarded: onboarded };
    }

    function require() {
        var now = state();
        if (now.onboarded) return true;
        var here = encodeURIComponent(location.pathname + location.search + location.hash);
        location.assign((now.signedIn ? "/welcome/" : "/sign-in/") + "?next=" + here);
        return false;
    }

    window.DWGate = { require: require, state: state };

    var locked = lock === null || (lock !== "none" && location.pathname.indexOf(lock) === 0);
    if (!locked || state().onboarded) return;
    var here = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace((state().signedIn ? "/welcome/" : "/sign-in/") + "?next=" + here);
}());
