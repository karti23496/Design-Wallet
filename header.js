function loadHeader() {
    var collectionItems = [
        ["AI TOOLS", "sparkles", "/tools/category/ai-tools/"],
        ["LEARNING", "learning", "/tools/category/learn-design/"],
        ["INSPIRATION", "bolt", "/tools/category/design-inspirations/"],
        ["COMMUNITY", "community", "/tools/category/design-communities/"],
        ["UX TOOLS", "monitor", "/tools/category/ux-tools/"],
        ["ICONS", "star", "/tools/category/icons/"],
        ["COLOR TOOLS", "palette", "/tools/category/color-palatte/"],
        ["MOCKUPS + KITS", "briefcase", "/tools/category/ui-kits/"],
        ["WEB BUILDERS", "web", "/tools/category/website-builder-tools/"]
    ];

    function collectionLink(item) {
        return '<a class="nav-collection-link" href="' + item[2] + '">' +
            '<span class="nav-collection-icon nav-icon-' + item[1] + '" aria-hidden="true"></span>' +
            '<span>' + item[0] + '</span>' +
        '</a>';
    }

    var html = '<a class="brand" href="/" aria-label="Design Wallet home">' +
            '<img class="brand-logo" src="/public/Logo/Website-logo.svg" alt="Design Wallet">' +
        '</a>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="primary-nav">' +
            '<div class="nav-dropdown nav-collections-dropdown">' +
                '<a class="nav-dropdown-trigger" href="/tools/" aria-haspopup="true">COLLECTIONS</a>' +
                '<div class="nav-dropdown-menu nav-collections-menu" aria-label="Collections">' +
                    collectionItems.map(collectionLink).join('') +
                '</div>' +
            '</div>' +
            '<div class="nav-dropdown">' +
                '<a class="nav-dropdown-trigger" href="/books/" aria-haspopup="true">RESOURCES</a>' +
                '<div class="nav-dropdown-menu" aria-label="Resources">' +
                    '<a href="/#submit">GOOD DEALS \uD83D\uDD25</a>' +
                    '<a href="/books/">BOOKS</a>' +
                '</div>' +
            '</div>' +
            '<a class="nav-waitlist-button" href="/join-waitlist" data-waitlist-open>JOIN WAITLIST</a>' +
            '<div class="list-tool-wrap" style="display: flex; align-items: center; gap: 8px;">' +
                '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 12px 14px; background-color: rgba(255, 255, 255, 0.05); border: 1px solid #ffffff40; border-radius: 24px; cursor: default; font-size: 12px; line-height: 1; letter-spacing: 0.04em;">LIST YOUR TOOLS</span>' +
                '<span style="font-size: 10px; padding: 4px 8px; background-color: #ffffff15; border: 1px solid #ffffff45; border-radius: 8px; color: #ffffff; text-transform: uppercase; opacity:0.5;">Coming Soon</span>' +
            '</div>' +
        '</nav>';

    var headers = document.querySelectorAll('.site-header');
    headers.forEach(function(header) {
        header.innerHTML = html;
    });
}

function loadUpdateNotification() {
    var pathname = window.location.pathname.replace(/\/$/, '');
    if (pathname !== '' && pathname !== '/' && pathname !== '/index.html') return;
    if (document.getElementById('update-notification')) return;

    var noticeDuration = document.body.dataset.updateNotificationDuration || '1.8s';
    var content = window.updateNotificationContent || {
        title: '⚡ Design Wallet update',
        body: 'New design collections and tools are now live — explore the latest curated picks.',
        badge: '1'
    };

    var html = '<div id="update-notification" class="update-notification" style="--update-notification-duration: ' + noticeDuration + ';" role="status" aria-live="polite">' +
        '<button type="button" class="update-notification-close" aria-label="Close update notification">×</button>' +
        '<span class="update-notification-badge" aria-hidden="true">' + content.badge + '</span>' +
        '<div class="update-notification-copy">' +
            '<p class="update-notification-eyebrow">' + content.title + '</p>' +
            '<p style="text-transform: uppercase; font-size: 0.8rem; font-weight: 200; opacity: 50%;">' + content.body + '</p>' +
        '</div>' +
        '<a class="update-notification-action" href="' + (content.actionUrl || '#') + '">' + (content.actionText || 'Learn more') + '</a>' +
    '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
    var closeButton = document.querySelector('.update-notification-close');
    if (closeButton) {
        closeButton.addEventListener('click', function () {
            var notification = document.getElementById('update-notification');
            if (!notification) return;
            notification.classList.add('update-notification-hidden');
            window.setTimeout(function () {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 220);
        });
    }
}

document.addEventListener('DOMContentLoaded', loadHeader);

document.addEventListener('DOMContentLoaded', loadUpdateNotification);
