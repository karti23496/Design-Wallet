/**
 * changelog-add.js — add one version to the Notion Changelog database, as a
 * Draft, from a JSON file in the shape changelog-lib.js describes. Used by
 * /update-change-log; Karthik reviews and edits the row in Notion, then sets
 * Status to Published.
 *
 * Run: node scripts/changelog-add.js <entry.json>
 * Needs NOTION_API_KEY and NOTION_CHANGELOG_DATABASE_ID.
 */

import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import fs from "node:fs";
import { versionParts } from "./changelog-lib.js";
import { toNotionPage } from "./changelog-notion.js";

dotenv.config();

const file = process.argv[2];
const databaseId = process.env.NOTION_CHANGELOG_DATABASE_ID;
if (!file || !process.env.NOTION_API_KEY || !databaseId) {
    console.error("Usage: node scripts/changelog-add.js <entry.json>   (needs NOTION_API_KEY and NOTION_CHANGELOG_DATABASE_ID)");
    process.exit(1);
}

const entry = { status: "Draft", blocks: [], ...JSON.parse(fs.readFileSync(file, "utf8")) };
versionParts(entry.version);
entry.through = entry.through || entry.date;

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const existing = await notion.databases.query({
    database_id: databaseId,
    filter: { property: "Version", rich_text: { equals: entry.version } },
});
if (existing.results.length) {
    console.error(`${entry.version} is already in Notion: ${existing.results[0].url}. Edit it there instead.`);
    process.exit(1);
}

const { properties, children } = toNotionPage(entry);
const page = await notion.pages.create({ parent: { database_id: databaseId }, properties, children });
console.log(`✓ Added ${entry.version} to Notion as ${entry.status}: ${page.url}`);
