/**
 * build-changelog.js — rebuild /changelog/ from the Notion Changelog database.
 *
 * Notion is where the changelog is written; this regenerates the versions
 * on changelog/index.html (between the changelog:start / changelog:end
 * markers), newest first, grouped by major. Never edit that part of the page
 * by hand: the next build overwrites it.
 *
 * Only rows with Status "Published" appear. Pass --drafts to preview drafts
 * locally (never in the GitHub workflow).
 *
 * Run: npm run build-changelog            (published only)
 *      npm run build-changelog -- --drafts
 * Needs NOTION_API_KEY and NOTION_CHANGELOG_DATABASE_ID (.env locally,
 * repository secrets in GitHub).
 */

import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeChangelog, versionParts } from "./changelog-lib.js";
import { fromNotionPage } from "./changelog-notion.js";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withDrafts = process.argv.includes("--drafts");
const databaseId = process.env.NOTION_CHANGELOG_DATABASE_ID;

if (!process.env.NOTION_API_KEY || !databaseId) {
    console.error("Missing NOTION_API_KEY or NOTION_CHANGELOG_DATABASE_ID.");
    process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const rows = [];
let cursor;
do {
    const res = await notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 });
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

const entries = [];
for (const row of rows) {
    const entry = await fromNotionPage(notion, row, ROOT);
    if (entry.status !== "Published" && !withDrafts) continue;
    if (!entry.version || !entry.date || !entry.title) {
        console.warn(`Skipped a row missing its Version, Date or Title ("${entry.title || entry.version || row.id}").`);
        continue;
    }
    versionParts(entry.version); // throws on a malformed version
    entries.push(entry);
}

const changed = writeChangelog(ROOT, entries);
console.log(`✓ changelog/index.html: ${entries.length} versions${withDrafts ? " (drafts included)" : ""}${changed ? "" : ", no changes"}`);
