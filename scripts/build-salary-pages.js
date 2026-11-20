#!/usr/bin/env node
/**
 * build-salary-pages.js — public salary pages for search (Karthik, 2026-11-13:
 * "Let's build a few public ones").
 *
 * Know your money (/salary/) is behind sign-in. These few pages are the public
 * exception: one static page per role and level, for India, so Google can index
 * searches like "senior product designer salary India". Every figure comes from
 * salary/data/salaries.json, the same file the dashboard renders, so the two
 * can never disagree. Re-run this after build-salary.js:
 *
 *   node scripts/build-salary-pages.js
 *
 * Writes salary/<role>/<level>/index.html for each entry in PAGES and rewrites
 * the block between the SALARY-PAGES markers in sitemap.xml.
 *
 * While community_submission_count is below the threshold, the methodology
 * paragraph says plainly that the figures are research estimates. (The badge
 * above the title was dropped in Karthik's Figma pass, 2026-11-13.)
 *
 * Design: Figma "Salary guide pages (2026-11-13)", node 1230:3592.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "salary/data/salaries.json"), "utf8"));
const SITE = "https://designwallet.in";
const YEAR = "2026";

// The pages to build: [role, level]. India only.
const PAGES = [
    ["product-designer", "junior"],
    ["product-designer", "mid"],
    ["product-designer", "senior"],
    ["product-designer", "lead"],
    ["graphic-designer", "junior"],
    ["graphic-designer", "mid"],
    ["graphic-designer", "senior"],
    ["ux-researcher", "senior"],
    ["motion-designer", "junior"],
    ["motion-designer", "mid"],
    ["motion-designer", "senior"],
    ["motion-designer", "lead"],
    ["ui-ux-designer", "junior"],
    ["ui-ux-designer", "mid"],
    ["ui-ux-designer", "senior"],
    ["ui-ux-designer", "lead"]
];

// Page-only roles: a search name with its own URL and title that reads the
// figures of a role in salaries.json. Karthik, 2026-11-13: separate UI/UX
// Designer pages, using the Product Designer (UI/UX) figures.
const PAGE_ROLES = [
    { id: "ui-ux-designer", label: "UI/UX Designer", data: "product-designer" }
];

const roleById = Object.fromEntries(DATA.roles.concat(PAGE_ROLES).map((r) => [r.id, r]));
const dataRole = (role) => roleById[role].data || role;
const levelById = Object.fromEntries(DATA.levels.map((l) => [l.id, l]));
const cityById = Object.fromEntries(DATA.cities.map((c) => [c.id, c]));
const built = new Set(PAGES.map(([r, l]) => r + "|" + l));

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 24 → "₹24 LPA"; 0.6 → "₹60K / yr"; 12.45 → "₹12.5 LPA".
function lpa(v) {
    if (v < 1) return "₹" + Math.round(v * 100) + "K / yr";
    return "₹" + (Math.round(v * 10) / 10).toString() + " LPA";
}
function lpaBare(v) {
    if (v < 1) return "₹" + Math.round(v * 100) + "K";
    return "₹" + (Math.round(v * 10) / 10).toString();
}
function range(cell) {
    // "₹19–30 LPA": the rupee sign once, at the start.
    return lpaBare(cell[0]) + "–" + lpa(cell[2]).slice(1);
}
function pct(v) {
    return Math.round(v * 100) + "%";
}

function pageUrl(role, level) {
    return "/salary/" + role + "/" + level + "/";
}

function titleFor(role, level) {
    const lv = levelById[level].label.replace(" / Trainee", "").replace("Mid-level", "Mid-level");
    return lv + " " + roleById[role].label + " Salary in India (" + YEAR + ")";
}

function table(head, rows) {
    return '<div class="sp-table-wrap"><table class="sp-table">' +
        "<thead><tr>" + head.map((h, i) => '<th scope="col"' + (i ? ' class="sp-num"' : "") + ">" + h + "</th>").join("") + "</tr></thead>" +
        "<tbody>" + rows.map((r) => "<tr>" + r.map((c, i) => (i ? '<td class="sp-num">' : '<th scope="row">') + c + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>" +
        "</table></div>";
}

function render(role, level) {
    const R = roleById[role];
    const key = dataRole(role) + "|" + level;
    const L = levelById[level];
    const nat = DATA.national[key];
    const hc = DATA.highest_city[key];
    const extras = DATA.extras[level];
    const title = titleFor(role, level);
    const url = pageUrl(role, level);
    const estimate = DATA.community_submission_count < DATA.min_reports;
    const description = title.replace(" Salary", " salary") + ": median " + lpa(nat[1]) + ", middle 50% " + range(nat) +
        ". By city, company type and employer, from Design Wallet's Know your money.";

    const cityRows = DATA.cities
        .map((c) => ({ c, cell: DATA.cells[key + "|" + c.id] }))
        .filter((x) => x.cell)
        .sort((a, b) => b.cell[1] - a.cell[1])
        .map((x) => [esc(x.c.label), lpa(x.cell[1]), range(x.cell)]);

    const companyRows = DATA.company_types
        .map((t) => ({ t, cell: DATA.company[key + "|" + t.id] }))
        .filter((x) => x.cell)
        .sort((a, b) => b.cell[1] - a.cell[1])
        .map((x) => [esc(x.t.label), lpa(x.cell[1]), range(x.cell)]);

    const india = DATA.employer[key + "|india"];
    const foreign = DATA.employer[key + "|foreign"];

    const levelRows = DATA.levels
        .map((l) => ({ l, cell: DATA.national[dataRole(role) + "|" + l.id] }))
        .filter((x) => x.cell)
        .map((x) => {
            const label = x.l.label + ' <span class="sp-muted">' + esc(x.l.years) + "</span>";
            const name = x.l.id === level
                ? label + ' <span class="sp-here">This page</span>'
                : built.has(role + "|" + x.l.id) ? '<a href="' + pageUrl(role, x.l.id) + '">' + label + "</a>" : label;
            return [name, lpa(x.cell[1]), range(x.cell)];
        });

    const otherPages = PAGES.filter(([r, l]) => r !== role)
        .map(([r, l]) => '<li><a href="' + pageUrl(r, l) + '">' + esc(titleFor(r, l).replace(" in India (" + YEAR + ")", "")) + "</a></li>").join("");

    const dashboard = "/salary/?role=" + dataRole(role) + "&amp;level=" + level;

    const ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Design Wallet", item: SITE + "/" },
            { "@type": "ListItem", position: 2, name: "Know your money", item: SITE + "/salary/" },
            { "@type": "ListItem", position: 3, name: title, item: SITE + url }
        ]
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}">
    <!-- Generated by scripts/build-salary-pages.js from salary/data/salaries.json. Edit the script, not this file. -->
    <link rel="stylesheet" href="/site-prefs.css?v=20261113-1">
    <script src="/site-prefs.js?v=20261113-1" defer></script>
    <script src="/consent.js?v=20261113-1"></script>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-HLX9Y7DQV7"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)} — Design Wallet™</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${SITE}${url}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${SITE}${url}">
    <meta property="og:type" content="article">
    <meta property="og:image" content="https://designwallet.in/public/illustrations/Meta%20Image.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="https://designwallet.in/public/illustrations/Meta%20Image.jpg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="icon" type="image/png" sizes="32x32" href="/public/Logo/favicon-img/icon32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/public/Logo/favicon-img/icon16.png">
    <link rel="apple-touch-icon" sizes="128x128" href="/public/Logo/favicon-img/icon128.png">
    <link rel="stylesheet" href="/style.css?v=20261113-1">
    <link rel="stylesheet" href="/salary/pages.css?v=20261113-3">
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body class="salary-public-page">
    <!-- Light beam + horizon behind the top of the page (Figma 1229:4364 / 1229:4479). -->
    <div class="sp-bg" aria-hidden="true">
        <picture>
            <source media="(max-width: 760px)" srcset="/public/salary/hero-bg-mobile.svg" width="665" height="740">
            <img src="/public/salary/hero-bg-desktop.svg" width="1440" height="1193" alt="">
        </picture>
    </div>
    <div class="page-shell">
        <header class="site-header"></header>

        <main class="sp">
            <div class="sp-top">
                <nav class="sp-crumbs" aria-label="Breadcrumb">
                    <a href="/">Design Wallet</a><span aria-hidden="true">/</span>
                    <a href="${dashboard}">Know your money</a><span aria-hidden="true">/</span>
                    <span aria-current="page">${esc(R.label)}, ${esc(L.label)}</span>
                </nav>

                <header class="sp-head">
                    <h1 class="sp-title">${esc(title)}</h1>
                    <p class="sp-lede">What a ${esc(L.label.toLowerCase())} ${esc(R.label.replace(" (UI/UX)", ""))} (${esc(L.years)} experience) earns in India, as annual fixed CTC. Variable pay and equity are shown separately below.</p>
                </header>

                <!-- Right of the breadcrumb on desktop, under the lede on a phone (Figma). -->
                <a class="sp-btn sp-btn--primary sp-report" href="${dashboard}">View full report</a>
            </div>

            <section class="sp-stats" aria-label="Headline figures">
                <div class="sp-stat sp-stat--lead">
                    <p class="sp-stat-label">Median fixed CTC</p>
                    <p class="sp-stat-value">${lpa(nat[1])}</p>
                </div>
                <div class="sp-stat">
                    <p class="sp-stat-label">Middle 50%</p>
                    <p class="sp-stat-value sp-stat-value--sm">${range(nat)}</p>
                </div>
                <div class="sp-stat">
                    <p class="sp-stat-label">Highest-paying city</p>
                    <p class="sp-stat-value sp-stat-value--sm">${esc(cityById[hc[0]].label)}</p>
                    <p class="sp-stat-note">${lpa(hc[1])} median, ${hc[2]}% above India overall</p>
                </div>
                <div class="sp-stat">
                    <p class="sp-stat-label">Experience</p>
                    <p class="sp-stat-value sp-stat-value--sm">${esc(L.years)}</p>
                </div>
            </section>

            <section class="sp-section">
                <h2 class="sp-h2">By city</h2>
                <p class="sp-sub">Median and middle 50% for each city we cover, highest first.</p>
                ${table(["City", "Median", "Middle 50%"], cityRows)}
            </section>

            <section class="sp-section">
                <h2 class="sp-h2">By company type</h2>
                ${table(["Company type", "Median", "Middle 50%"], companyRows)}
            </section>

            <section class="sp-section sp-grid">
                <div class="sp-card">
                    <h2 class="sp-h3">Indian vs foreign employer</h2>
                    <p class="sp-pair"><span>Indian employer</span><b>${lpa(india[1])}</b></p>
                    <p class="sp-pair"><span>Foreign employer, working from India</span><b>${lpa(foreign[1])}</b></p>
                </div>
                <div class="sp-card">
                    <h2 class="sp-h3">Variable pay and equity</h2>
                    <p class="sp-pair"><span>Get variable pay</span><b>${pct(extras.variable_share)}</b></p>
                    <p class="sp-pair"><span>Typical variable, on top of fixed</span><b>${extras.variable_pct ? pct(extras.variable_pct) : "—"}</b></p>
                    <p class="sp-pair"><span>Get ESOPs</span><b>${pct(extras.esop_share)}</b></p>
                </div>
            </section>

            <section class="sp-section">
                <h2 class="sp-h2">${esc(R.label)} pay at every level</h2>
                ${table(["Level", "Median", "Middle 50%"], levelRows)}
            </section>

            <!-- Desktop: one button, "View full report". Phone: "Open Know your money"
                 and "Add your salary", with the embossed logo under them (Figma). -->
            <section class="sp-cta">
                <div class="sp-cta-text">
                    <h2 class="sp-h3">Filter by work mode, employer and company</h2>
                    <p class="sp-sub">Know your money has every role, level and city, with charts and a PDF report.<span class="sp-phone-only"> Free with a Design Wallet account.</span></p>
                </div>
                <div class="sp-cta-btns">
                    <a class="sp-btn sp-btn--primary" href="${dashboard}"><span class="sp-desk-only">View full report</span><span class="sp-phone-only">Open Know your money</span></a>
                    <a class="sp-btn sp-btn--line sp-phone-only" href="/salary/submit/">Add your salary</a>
                </div>
                <div class="sp-cta-art" aria-hidden="true">
                    <picture>
                        <source type="image/webp" srcset="/public/illustrations/designwallet-embross.webp">
                        <img src="/public/illustrations/Designwallet%20embross.png" width="735" height="789" alt="" loading="lazy">
                    </picture>
                </div>
            </section>

            <section class="sp-section sp-method">
                <h2 class="sp-h3">How these figures are made</h2>
                <p>Every number is annual fixed CTC in ₹ lakh per annum. ${estimate
                    ? "These are research estimates, drawn from public job listings, salary aggregators and published Indian design and startup compensation reports. They are not yet based on salaries submitted on Design Wallet."
                    : "Figures combine market research with salaries submitted anonymously by designers."} Community submissions replace the research figure for a role, level and city once at least ${DATA.min_reports} people have reported it. Use these as a starting point for a negotiation, not a quote.</p>
            </section>

            ${otherPages ? `<section class="sp-section"><h2 class="sp-h3">More salary guides</h2><ul class="sp-links">${otherPages}</ul></section>` : ""}
        </main>
    </div>

    <script src="/content.js?v=20260508-6"></script>
    <script src="/header.js?v=20261114-2"></script>
    <script src="/newsletter.js?v=20261015-3"></script>
</body>
</html>
`;
}

// Same policy as every other page (see DECISIONS: Content Security Policy).
const CSP = fs.readFileSync(path.join(ROOT, "books/index.html"), "utf8")
    .match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];

for (const [role, level] of PAGES) {
    if (!DATA.national[dataRole(role) + "|" + level]) throw new Error("No data for " + role + "|" + level);
    const dir = path.join(ROOT, "salary", role, level);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), render(role, level));
    console.log("wrote", pageUrl(role, level));
}

// Sitemap: replace (or add) the generated block.
const sitemapPath = path.join(ROOT, "sitemap.xml");
let sitemap = fs.readFileSync(sitemapPath, "utf8");
const block = "  <!-- SALARY-PAGES:START (scripts/build-salary-pages.js) -->\n" +
    PAGES.map(([r, l]) => "  <url>\n    <loc>" + SITE + pageUrl(r, l) + "</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n").join("") +
    "  <!-- SALARY-PAGES:END -->\n";
if (sitemap.includes("SALARY-PAGES:START")) {
    sitemap = sitemap.replace(/  <!-- SALARY-PAGES:START[\s\S]*?SALARY-PAGES:END -->\n/, block);
} else {
    sitemap = sitemap.replace("</urlset>", block + "</urlset>");
}
fs.writeFileSync(sitemapPath, sitemap);
console.log("sitemap.xml: " + PAGES.length + " salary pages");
