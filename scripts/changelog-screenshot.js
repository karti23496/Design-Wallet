/**
 * changelog-screenshot.js — capture a page of the site for a changelog entry.
 *
 * Starts the local dev server, opens the route in headless Chrome at 1440×900,
 * waits for the page to settle, and writes a WebP to public/changelog/.
 *
 * Run: npm run changelog-shot -- <route> <version>
 *   e.g. npm run changelog-shot -- /salary/ v2.2
 *   → public/changelog/v2-2.webp
 *
 * Used by the /update-change-log command (.claude/commands/update-change-log.md).
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8190;
const [route, version] = process.argv.slice(2);

if (!route || !/^v\d+\.\d+$/.test(version || "")) {
    console.error("Usage: npm run changelog-shot -- <route> <version>   e.g. /salary/ v2.2");
    process.exit(1);
}

const outPath = resolve(ROOT, "public/changelog", `${version.replace(".", "-")}.webp`);

async function waitForServer(url, attempts = 40) {
    for (let i = 0; i < attempts; i += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            /* not up yet */
        }
        await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error(`dev server did not answer at ${url}`);
}

const server = spawn("node", ["scripts/dev-server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore"
});

try {
    const base = `http://localhost:${PORT}`;
    await waitForServer(`${base}/`);

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(base + route, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {
        /* Analytics can keep the network busy; the settle delay below covers it. */
    });
    // Fonts, runtime listings and chart intros.
    await new Promise((done) => setTimeout(done, 2500));

    mkdirSync(dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, type: "webp", quality: 82 });
    await browser.close();

    console.log(`✓ ${outPath.replace(ROOT + "/", "")}`);
} finally {
    server.kill();
}
