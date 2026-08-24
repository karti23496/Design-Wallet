// ============================================================================
// Theme (dark / light).
//
// Loaded SYNCHRONOUSLY in <head>, before any markup renders, so the stored
// theme is applied before first paint — otherwise a light-mode visitor sees a
// dark flash on every page load. Keep it in <head> and keep it un-deferred.
//
// Dark is the default. `:root[data-theme="light"]` in style.css re-defines the
// theme tokens; nothing else needs to know which theme is active.
// ============================================================================
(function () {
    var STORAGE_KEY = "dw-theme";
    var root = document.documentElement;

    function systemPreference() {
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
    }

    function storedPreference() {
        // Private-browsing and blocked-storage modes throw on access.
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function apply(theme) {
        if (theme === "light") {
            root.setAttribute("data-theme", "light");
        } else {
            root.removeAttribute("data-theme");
        }
    }

    // An explicit choice always wins; otherwise follow the OS.
    apply(storedPreference() || systemPreference());

    window.DWTheme = {
        current: function () {
            return root.getAttribute("data-theme") === "light" ? "light" : "dark";
        },
        toggle: function () {
            var next = this.current() === "light" ? "dark" : "light";
            apply(next);
            try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
            document.dispatchEvent(new CustomEvent("dw:themechange", { detail: next }));
            return next;
        }
    };

    // Follow the OS only while the visitor hasn't made an explicit choice.
    if (window.matchMedia) {
        var mq = window.matchMedia("(prefers-color-scheme: light)");
        var onChange = function (e) {
            if (!storedPreference()) apply(e.matches ? "light" : "dark");
        };
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }
}());
