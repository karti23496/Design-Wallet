function loadHeader() {
    // On the gated collection views (/category/*, /tools/*) a logged-in
    // subscriber gets a minimal header: Design Wallet logo on the left + a
    // profile icon on the right that opens a dropdown with Log out. Everywhere
    // else shows the full marketing nav.
    var isCollection = /^\/(category|tools)(\/|$)/.test(location.pathname);

    var brand = '<a class="brand" href="/" aria-label="Design Wallet home">' +
            '<img class="brand-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet">' +
        '</a>';

    var html;
    if (isCollection) {
        html = brand +
            '<div class="nav-profile" data-profile>' +
                '<button class="nav-profile-btn" type="button" data-profile-toggle aria-haspopup="true" aria-expanded="false" aria-label="Account menu">' +
                    '<img class="nav-profile-btn-img" data-profile-btn-img alt="" referrerpolicy="no-referrer" hidden>' +
                    '<svg class="nav-profile-btn-icon" data-profile-btn-icon width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>' +
                '</button>' +
                '<div class="nav-profile-menu" data-profile-menu hidden>' +
                    '<div class="nav-profile-head">' +
                        '<img class="nav-profile-avatar" data-profile-avatar alt="" referrerpolicy="no-referrer" hidden>' +
                        '<div class="nav-profile-id">' +
                            '<span class="nav-profile-name" data-profile-name hidden></span>' +
                            '<span class="nav-profile-email" data-profile-email>Signed in</span>' +
                        '</div>' +
                    '</div>' +
                    '<button class="nav-profile-logout" type="button" data-logout>Log out</button>' +
                '</div>' +
            '</div>';
    } else {
        html = brand +
            '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
                '<span></span><span></span><span></span>' +
            '</button>' +
            '<nav class="site-nav" id="primary-nav">' +
                '<a class="nav-blog-link" href="/blog/">BLOG</a>' +
                '<a class="nav-waitlist-button" href="/join-waitlist" data-waitlist-open>JOIN WAITLIST</a>' +
                '<a class="nav-pricing-link" href="/pricing/">GET ACCESS</a>' +
            '</nav>';
    }

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
        header.classList.toggle('site-header--collection', isCollection);
    });

    if (isCollection) {
        wireProfileMenu();
    } else {
        updateAccessLink();
    }
}

// For an active subscriber, the nav "GET ACCESS" button becomes "EXPLORE" and
// points at the collection instead of pricing. Only runs where the auth client
// is loaded (window.DWAuth); otherwise the button stays "GET ACCESS".
function updateAccessLink() {
    if (!window.DWAuth || !window.DWAuth.getAccessState) return;
    var cfg = window.DW_CONFIG || {};
    window.DWAuth.getAccessState().then(function (state) {
        if (!state || state.status !== "active") return;
        document.querySelectorAll('.nav-pricing-link').forEach(function (link) {
            link.textContent = "EXPLORE";
            link.setAttribute("href", cfg.ROUTE_COLLECTION || "/category/");
        });
    }).catch(function () {});
}

function wireProfileMenu() {
    var wrap = document.querySelector('[data-profile]');
    if (!wrap) return;
    var toggle = wrap.querySelector('[data-profile-toggle]');
    var menu = wrap.querySelector('[data-profile-menu]');
    var emailEl = wrap.querySelector('[data-profile-email]');
    var nameEl = wrap.querySelector('[data-profile-name]');
    var avatarEl = wrap.querySelector('[data-profile-avatar]');
    var btnImg = wrap.querySelector('[data-profile-btn-img]');
    var btnIcon = wrap.querySelector('[data-profile-btn-icon]');
    var logout = wrap.querySelector('[data-logout]');

    // Fill in who's signed in — email always; name + picture when available
    // (e.g. from a Google sign-in).
    if (window.DWAuth && window.DWAuth.getAccessState) {
        window.DWAuth.getAccessState().then(function (state) {
            if (!state) return;
            if (state.email && emailEl) emailEl.textContent = state.email;
            if (state.name && nameEl) { nameEl.textContent = state.name; nameEl.hidden = false; }
            if (state.avatarUrl) {
                // Only reveal each image once it actually loads; on failure keep
                // the fallback icon (no broken-image glyph).
                if (btnImg) {
                    btnImg.onload = function () { btnImg.hidden = false; if (btnIcon) btnIcon.hidden = true; };
                    btnImg.onerror = function () { btnImg.hidden = true; if (btnIcon) btnIcon.hidden = false; };
                    btnImg.src = state.avatarUrl;
                }
                if (avatarEl) {
                    avatarEl.onload = function () { avatarEl.hidden = false; };
                    avatarEl.onerror = function () { avatarEl.hidden = true; };
                    avatarEl.src = state.avatarUrl;
                }
            }
        }).catch(function () {});
    }

    function open() { menu.hidden = false; toggle.setAttribute('aria-expanded', 'true'); }
    function close() { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }

    toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menu.hidden) open(); else close();
    });

    // Close on outside click or Escape.
    document.addEventListener('click', function (e) {
        if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
    });

    if (logout) {
        logout.addEventListener('click', function () {
            if (window.DWAuth && window.DWAuth.signOut) {
                window.DWAuth.signOut();
            } else {
                window.location.href = '/';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', loadHeader);
