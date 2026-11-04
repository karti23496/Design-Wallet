// The groups the /dw-tools/ index sorts tools into, in display order. A tool's
// `category` must be one of these; one that is not lands in a trailing "More".
var DW_TOOL_CATEGORIES = ["Color & Brand", "Image", "CSS & Code"];

// Design Wallet's own free tools, listed in the nav "Mini Tools" panel.
// Add a new one here and it appears in the nav on every page. `icon` is the
// inner markup of a 24×24 stroked SVG, in the house style of public/icons/.
// `category` only affects the /dw-tools/ index; the nav panel stays one list.
var DW_TOOLS = [
    {
        name: "Color Code Converter",
        category: "Color & Brand",
        href: "/dw-tools/color-code-converter/",
        description: "Convert between HEX, RGB, HSL, HSV, OKLCH and CMYK.",
        icon: '<circle cx="9" cy="9" r="5.5"/><circle cx="15" cy="15" r="5.5"/>'
    },
    {
        name: "Background Remover",
        category: "Image",
        href: "/dw-tools/background-remover/",
        description: "Cut out any subject \u2014 hair included \u2014 without uploading it.",
        icon: '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3.2 3.2"/><circle cx="9" cy="9.4" r="1.5"/><path d="M6.5 16.5 10 12.6l2.4 2.7 2-2.3 3.1 3.5"/>'
    },
    {
        name: "Website Brandkit Generator",
        category: "Color & Brand",
        href: "/dw-tools/brandkit-generator/",
        description: "Paste a link and pull a site's colors and fonts.",
        icon: '<circle cx="8.5" cy="8.5" r="4.5"/><circle cx="15.5" cy="8.5" r="4.5"/><circle cx="12" cy="14.5" r="4.5"/>'
    },
    {
        name: "Glassmorphism CSS Generator",
        category: "CSS & Code",
        href: "/dw-tools/glassmorphism-css-generator/",
        description: "Design frosted glass, then copy it as CSS, Tailwind or React.",
        icon: '<rect x="3" y="7" width="13" height="13" rx="3"/><rect x="8" y="4" width="13" height="13" rx="3"/>'
    }
];

// The nav "Resources" panel (Figma 847:4287, 2026-10-20): a card per resource
// with an icon tile, a title and a one-line description. This replaced the
// plain text list of 2026-10-03. `icon` is the Figma export, served as a file
// from public/icons/nav/.
var DW_RESOURCES = [
    {
        name: "Wallet Reads",
        href: "/books/",
        description: "Design books worth buying, curated so your wallet doesn\u2019t cry.",
        icon: "/public/icons/nav/wallet-reads.svg"
    },
    {
        name: "Wall of portfolios",
        href: "/wall-of-portfolios/",
        description: "Handpicked designer portfolios to spark ideas for your own.",
        icon: "/public/icons/nav/wall-of-portfolios.svg"
    }
];

// The latest changelog version, shown as a capsule beside the logo and linked
// to /changelog/. /update-change-log bumps this with every new version.
var DW_VERSION = "v3.0";

// Who's signed in, read straight from the session that /auth/auth.js stores
// (Supabase's own localStorage entry), so no page outside the portal has to
// load the Supabase library just to draw the nav. An expired access token
// still counts: the refresh token renews it the next time the portal loads.
var DW_AUTH_KEY = "sb-ugjtyuikvdeymwsfsgfl-auth-token";

function dwSignedInUser() {
    try {
        var session = JSON.parse(localStorage.getItem(DW_AUTH_KEY) || "null");
        if (!session || !session.user || !session.refresh_token) return null;
        var meta = session.user.user_metadata || {};
        return {
            name: meta.full_name || meta.name || session.user.email,
            email: session.user.email,
            avatar: meta.avatar_url || meta.picture || ""
        };
    } catch (e) {
        return null;
    }
}

function dwEscape(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

// "Sign in", or the signed-in account pill and its menu (Figma 934:1399).
function dwAccountNav(user) {
    var here = encodeURIComponent(location.pathname + location.search);
    // Signed out: the two capsules from the homepage design (Figma 982:2557).
    if (!user) {
        return '<span class="nav-ctas">' +
            // The short label takes over below 1280px, where the full one crowds the links.
            '<a class="nav-cta nav-cta--primary" href="/sign-up/?next=' + here + '"><span class="nav-cta-long">Create account for free</span><span class="nav-cta-short">Sign up free</span></a>' +
            '<a class="nav-cta nav-cta--line" href="/sign-in/?next=' + here + '"><span>Sign in</span></a>' +
        '</span>';
    }
    var first = String(user.name).split(/\s+/)[0];
    var avatar = user.avatar
        ? '<img class="nav-account-avatar" src="' + dwEscape(user.avatar) + '" alt="" width="32" height="32" referrerpolicy="no-referrer">'
        : '<span class="nav-account-avatar" aria-hidden="true">' + dwEscape(first.charAt(0).toUpperCase()) + '</span>';
    // Favourites is a heart beside the pill, not a menu item (Karthik, 2026-11-01).
    var onFavs = /^\/category\/favourites\/?$/.test(location.pathname);
    var favs = '<a class="nav-favs" href="/category/favourites/" aria-label="Favourites" title="Favourites"' + (onFavs ? ' aria-current="page"' : '') + '>' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>' +
        '</a>';
    return '<span class="nav-account-row">' + favs + '<div class="nav-dropdown nav-account">' +
        '<a class="nav-dropdown-trigger nav-account-trigger" tabindex="0" role="button" aria-haspopup="true">' +
            avatar + '<span class="nav-account-name">' + dwEscape(first) + '</span>' +
            '<svg class="nav-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        '</a>' +
        '<div class="nav-dropdown-menu nav-account-menu" aria-label="Your account">' +
            '<span class="nav-account-who"><span class="nav-account-full">' + dwEscape(user.name) + '</span><span class="nav-account-email">' + dwEscape(user.email) + '</span></span>' +
            '<a class="nav-account-item" href="/welcome/?edit=1&amp;next=' + here + '"><span>Profile &amp; preferences</span></a>' +
            '<a class="nav-account-item" href="/sign-in/?signout=1&amp;next=' + here + '"><span>Sign out</span></a>' +
        '</div>' +
    '</div></span>';
}

var NAV_ARROW_ICON =
    '<svg class="nav-mega-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M5 12h14M13 6l6 6-6 6"/>' +
    '</svg>';

function loadHeader() {
    // Collection views (/category/*, /tools/*) render a full-width flat header;
    // everywhere else uses the floating pill. That is purely a layout variant —
    // the nav itself is identical on every page.
    var isCollection = /^\/(category|tools)(\/|$)/.test(location.pathname);
    // The homepage is the signed-out landing page: its nav drops Design Wallet
    // MCP, Resources, Know your money and Mini Tools for "List your tool"
    // (Karthik, 2026-10-31). Every other page keeps the full nav.
    var isLanding = document.body.classList.contains('home-page');

    // One template for both panels — Mini Tools and Resources — so they cannot
    // drift apart. An entry needs all four fields (name, href, description,
    // icon) or it renders a blank icon or description.
    function megaItems(entries) {
        return entries.map(function (entry) {
            return '<a class="nav-mega-item" href="' + entry.href + '">' +
                '<span class="nav-mega-icon" aria-hidden="true">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + entry.icon + '</svg>' +
                '</span>' +
                '<span class="nav-mega-title">' + entry.name + NAV_ARROW_ICON + '</span>' +
                '<span class="nav-mega-desc">' + entry.description + '</span>' +
            '</a>';
        }).join("");
    }

    // The Resources cards. Colours sit on the inner spans, never on the <a>:
    // `.blog-index-page .site-nav a` lands later at equal specificity and
    // would paint them white on the blog. Same trap the mega panel hit.
    function resourceItems(entries) {
        return entries.map(function (entry) {
            return '<a class="nav-res-item" href="' + entry.href + '">' +
                '<span class="nav-res-icon" aria-hidden="true">' +
                    '<img src="' + entry.icon + '" width="24" height="24" alt="">' +
                '</span>' +
                '<span class="nav-res-text">' +
                    '<span class="nav-res-title">' + entry.name + '</span>' +
                    '<span class="nav-res-desc">' + entry.description + '</span>' +
                '</span>' +
            '</a>';
        }).join("");
    }

    var toolsMenu = megaItems(DW_TOOLS);
    var resourcesMenu = resourceItems(DW_RESOURCES);
    var user = dwSignedInUser();

    // The full nav, on every page but the homepage.
    var fullNav =
        // The NEW pill rides inside the link so it moves with it and is
        // still part of the same tap target.
        '<a href="/mcp/">Design Wallet MCP<span class="nav-new">NEW</span></a>' +
        // A plain dropdown, anchored to its own trigger. It keeps the base
        // .nav-dropdown geometry, which is why the mobile stacked sheet
        // needs no special casing for it.
        '<div class="nav-dropdown nav-dropdown--res">' +
            // No href: the trigger opens the menu rather than navigating.
            // tabindex keeps it keyboard-reachable for :focus-within.
            '<a class="nav-dropdown-trigger" tabindex="0" role="button" aria-haspopup="true">Resources' +
                '<svg class="nav-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
            '</a>' +
            '<div class="nav-dropdown-menu nav-res" aria-label="Design Wallet resources">' +
                resourcesMenu +
            '</div>' +
        '</div>' +
        '<a href="/salary/">Know your money</a>' +
        '<div class="nav-dropdown nav-dropdown--wide">' +
            // No href: the trigger opens the menu rather than navigating.
            // tabindex keeps it keyboard-reachable for :focus-within.
            '<a class="nav-dropdown-trigger" tabindex="0" role="button" aria-haspopup="true">Mini Tools' +
                '<svg class="nav-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
            '</a>' +
            '<div class="nav-dropdown-menu nav-mega" aria-label="Design Wallet tools">' +
                '<div class="nav-mega-grid">' +
                    toolsMenu +
                '</div>' +
                '<div class="nav-mega-cta">' +
                    '<p class="nav-mega-cta-title">All mini tools</p>' +
                    '<p class="nav-mega-cta-text">Free, browser-based tools for designers. No sign-up.</p>' +
                    '<a class="nav-mega-cta-btn" href="/dw-tools/">' +
                        '<span class="nav-mega-cta-label">Explore the tools' + NAV_ARROW_ICON + '</span>' +
                    '</a>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<a href="/blog/">Blog</a>';

    var html =
        '<div class="brand-group">' +
            '<a class="brand" href="/" aria-label="Design Wallet home">' +
                '<img class="brand-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet">' +
            '</a>' +
            '<a class="brand-version" href="/changelog/" aria-label="Version ' + DW_VERSION.slice(1) + ', see the changelog">' + DW_VERSION + '</a>' +
        '</div>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="primary-nav">' +
            (isLanding ? '<a href="/list-your-tool/">List your tool</a><a href="/blog/">Blog</a>' : fullNav) +
            // Replaced Subscribe, 2026-10-28: the newsletter opt-in moved into
            // onboarding (/welcome/ step 3).
            dwAccountNav(user) +
        '</nav>';

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
        header.classList.toggle('site-header--collection', isCollection);
        bindNavToggle(header);
    });

    if (headers.length) buildMobileMenu(user, isLanding);

    // Tell script.js not to bind its own copy. It queries the document once at
    // DOMContentLoaded, after this runs, so the flag is always set in time.
    window.DW_NAV_TOGGLE_BOUND = true;
}

// The hamburger used to be wired up in script.js, which only 10 of the 17
// pages load — on the rest, tapping it at 390px did nothing and the nav was
// unreachable. It belongs here, next to the markup it operates, because every
// page with a header loads header.js by definition.
// The hamburger only shows at 980px and below (style.css), and there it opens
// the pop-up menu below rather than the inline nav.
function bindNavToggle(header) {
    var toggle = header.querySelector('.nav-toggle');
    if (!toggle) return;

    toggle.setAttribute('aria-controls', 'dw-mnav');
    toggle.addEventListener('click', function () {
        openMobileMenu(toggle);
    });
}

// ── Mobile pop-up menu (Figma 851:4332, 2026-10-20) ─────────────────────────
// A card over a dimmed page: logo, the five links, Sign in. It is its own
// element on <body>, not a restyle of .site-nav: the header has a
// backdrop-filter, which would trap a position:fixed child inside the header.
// Differences from the desktop nav, by Karthik's brief:
//   - Resources opens a plain secondary list (no cards) under itself;
//   - Mini Tools goes straight to the /dw-tools/ index, with no dropdown.
var mobileMenu = null;
var mobileMenuOpener = null;

function buildMobileMenu(user, isLanding) {
    if (document.getElementById('dw-mnav')) return;

    var here = encodeURIComponent(location.pathname + location.search);
    // The big bottom button is "Sign in", or "Sign out" with a profile link
    // joining the list above it.
    var accountLink = user
        ? '<a class="mnav-link" href="/category/favourites/">Favourites</a>' +
          '<a class="mnav-link" href="/welcome/?edit=1&amp;next=' + here + '">Profile &amp; preferences</a>'
        : '<a class="mnav-link" href="/sign-in/?next=' + here + '">Sign in</a>';
    var accountButton = user
        ? '<a class="mnav-subscribe" href="/sign-in/?signout=1&amp;next=' + here + '">Sign out</a>'
        : '<a class="mnav-subscribe" href="/sign-up/?next=' + here + '">Create account for free</a>';

    var resources = DW_RESOURCES.map(function (entry) {
        return '<a class="mnav-sublink" href="' + entry.href + '">' + entry.name + '</a>';
    }).join('');

    var wrap = document.createElement('div');
    wrap.className = 'mnav';
    wrap.id = 'dw-mnav';
    wrap.hidden = true;
    wrap.innerHTML =
        '<div class="mnav-backdrop" data-mnav-close></div>' +
        '<div class="mnav-card" role="dialog" aria-modal="true" aria-label="Menu">' +
            '<a class="mnav-logo" href="/" aria-label="Design Wallet home">' +
                '<img src="/public/Logo/Website-logo.svg" alt="Design Wallet" width="162" height="30">' +
            '</a>' +
            '<nav class="mnav-links" aria-label="Main">' +
                (isLanding
                    ? '<a class="mnav-link" href="/list-your-tool/">List your tool</a>'
                    : '<a class="mnav-link" href="/mcp/">Design Wallet MCP</a>' +
                      '<button type="button" class="mnav-link mnav-expand" aria-expanded="false" aria-controls="dw-mnav-resources">' +
                          'Resources<img class="mnav-chevron" src="/public/icons/nav/chevron-down.svg" width="13" height="13" alt="">' +
                      '</button>' +
                      '<div class="mnav-sublist" id="dw-mnav-resources" hidden>' + resources + '</div>' +
                      '<a class="mnav-link" href="/salary/">Know your money</a>' +
                      '<a class="mnav-link" href="/dw-tools/">Mini Tools</a>') +
                '<a class="mnav-link" href="/blog/">Blog</a>' +
                accountLink +
            '</nav>' +
            accountButton +
        '</div>';
    document.body.appendChild(wrap);
    mobileMenu = wrap;

    var expand = wrap.querySelector('.mnav-expand');
    var sublist = wrap.querySelector('.mnav-sublist');
    if (expand) expand.addEventListener('click', function () {      // not on the homepage
        var open = expand.getAttribute('aria-expanded') !== 'true';
        expand.setAttribute('aria-expanded', String(open));
        sublist.hidden = !open;
    });

    // The backdrop closes it, and so does any link: Subscribe included, whose
    // newsletter modal (newsletter.js, a delegated click) then opens on its own.
    wrap.addEventListener('click', function (event) {
        if (event.target.closest('[data-mnav-close], a')) closeMobileMenu();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !wrap.hidden) closeMobileMenu();
    });

    // Back above 980px the hamburger is gone, so a menu left open would be
    // stranded over the desktop nav.
    window.addEventListener('resize', function () {
        if (!wrap.hidden && window.innerWidth > 980) closeMobileMenu();
    });
}

function openMobileMenu(opener) {
    if (!mobileMenu) return;
    mobileMenuOpener = opener;
    mobileMenu.hidden = false;
    document.documentElement.classList.add('mnav-open');
    if (opener) opener.setAttribute('aria-expanded', 'true');
    var first = mobileMenu.querySelector('.mnav-link');
    if (first) first.focus({ preventScroll: true });
}

function closeMobileMenu() {
    if (!mobileMenu || mobileMenu.hidden) return;
    mobileMenu.hidden = true;
    document.documentElement.classList.remove('mnav-open');
    if (mobileMenuOpener) {
        mobileMenuOpener.setAttribute('aria-expanded', 'false');
        mobileMenuOpener.focus({ preventScroll: true });
    }
}

document.addEventListener('DOMContentLoaded', loadHeader);
