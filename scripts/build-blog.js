import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;

function getPlainText(richText) {
  if (!richText) return "";
  return richText.map(t => t.plain_text).join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(date) {
  if (!date) return "Draft";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function renderTime(date, displayDate, className = "") {
  const classAttr = className ? ` class="${className}"` : "";

  if (!date) {
    return `<span${classAttr}>${escapeHtml(displayDate)}</span>`;
  }

  return `<time${classAttr} datetime="${escapeHtml(date)}">${escapeHtml(displayDate)}</time>`;
}

function siteHead(title, description) {
  return `    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-HLX9Y7DQV7"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-HLX9Y7DQV7');
    </script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100;200;300;400;500;600;700;800;900&family=Geist+Mono:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="icon" type="image/png" sizes="32x32" href="/public/Logo/favicon-img/icon32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/public/Logo/favicon-img/icon16.png">
    <link rel="apple-touch-icon" sizes="128x128" href="/public/Logo/favicon-img/icon128.png">
    <link rel="stylesheet" href="/style.css">`;
}

async function getBlocks(blockId) {
  const blocks = [];
  let cursor;

  while (true) {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
    });

    blocks.push(...res.results);

    if (!res.has_more) break;
    cursor = res.next_cursor;
  }

  return blocks;
}

function blockToHtml(block) {
  const type = block.type;

  if (type === "paragraph") {
    const text = getPlainText(block.paragraph.rich_text);
    return text ? `<p>${escapeHtml(text)}</p>` : "";
  }

  if (type === "heading_1") {
    return `<h2>${escapeHtml(getPlainText(block.heading_1.rich_text))}</h2>`;
  }

  if (type === "heading_2") {
    return `<h2>${escapeHtml(getPlainText(block.heading_2.rich_text))}</h2>`;
  }

  if (type === "heading_3") {
    return `<h3>${escapeHtml(getPlainText(block.heading_3.rich_text))}</h3>`;
  }

  return "";
}

function blocksToHtml(blocks) {
  const html = [];
  let listOpen = false;

  blocks.forEach((block) => {
    if (block.type === "bulleted_list_item") {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }

      html.push(`  <li>${escapeHtml(getPlainText(block.bulleted_list_item.rich_text))}</li>`);
      return;
    }

    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }

    const rendered = blockToHtml(block);
    if (rendered) html.push(rendered);
  });

  if (listOpen) {
    html.push("</ul>");
  }

  return html.join("\n");
}

function getExcerpt(blocks) {
  const paragraph = blocks.find((block) => block.type === "paragraph" && getPlainText(block.paragraph.rich_text));
  const text = paragraph ? getPlainText(paragraph.paragraph.rich_text) : "Fresh notes for curious designers from Design Wallet.";

  return text.length > 150 ? `${text.slice(0, 147).trim()}...` : text;
}

async function main() {
  const response = await notion.databases.query({
    database_id: databaseId,
  });

  const posts = response.results;
  const generatedPosts = [];

  console.log("Total posts found:", posts.length);

  const blogDir = path.join("blog");
  fs.mkdirSync(blogDir, { recursive: true });

  for (const page of posts) {
    const props = page.properties;

    const title = props.Title?.title?.[0]?.plain_text || "Untitled";
    const slug = getPlainText(props.Slug?.rich_text);
    const date = props.Date?.date?.start || "";
    const displayDate = formatDate(date);

    const blocks = await getBlocks(page.id);
    const content = blocksToHtml(blocks);
    const excerpt = getExcerpt(blocks);

    generatedPosts.push({ title, slug, date, displayDate, excerpt });

    const postDir = path.join(blogDir, slug);
    fs.mkdirSync(postDir, { recursive: true });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(`${title} - Design Wallet`, `Read ${title} on the Design Wallet blog.`)}
</head>
<body>
    <div class="page-shell">
        <header class="site-header"></header>

        <main>
            <article class="blog-article" data-reveal>
                <a class="blog-back-link" href="/blog/"><span aria-hidden="true">&larr;</span> Blog</a>

                <header class="blog-article-header">
                    <p class="blog-kicker">Essay</p>
                    <h1>${escapeHtml(title)}</h1>
                    <div class="blog-article-meta">
                        ${renderTime(date, displayDate)}
                        <span>Design Wallet</span>
                    </div>
                </header>

                <div class="blog-content">
                    ${content}
                </div>
            </article>
        </main>

        <footer class="site-footer"></footer>
    </div>

    <script src="/header.js"></script>
    <script src="/footer.js"></script>
    <script src="/script.js"></script>
</body>
</html>
`;

    fs.writeFileSync(path.join(postDir, "index.html"), html);
  }

  const postUrl = (post) => `/blog/${escapeHtml(post.slug)}/`;
  const placeholders = [
    {
      title: "Resource roundups for sharper design work",
      excerpt: "Curated tools, references and creative systems from the Design Wallet library.",
      label: "Coming soon",
      mediaClass: "design-story-media-blue",
      mediaText: "DW",
    },
    {
      title: "Workflow notes from modern design teams",
      excerpt: "Practical notes on creative routines, research flows and lightweight systems.",
      label: "Coming soon",
      mediaClass: "design-story-media-violet",
      mediaText: "AI",
    },
    {
      title: "How to build a habit of collecting better references",
      excerpt: "A simple approach to turning inspiration into a useful design practice.",
      label: "Coming soon",
      mediaClass: "design-story-media-lime",
      mediaText: "UI",
    },
    {
      title: "The Design Wallet guide to building a personal creative library",
      excerpt: "Save, sort and return to the resources that actually improve your work.",
      label: "Coming soon",
      image: "/public/images/Star - Background iamge.png",
      wide: true,
    },
  ];

  const realPostCards = generatedPosts.map((post, index) => ({
    title: post.title,
    excerpt: post.excerpt,
    label: `Habits / ${post.displayDate}`,
    image: index % 2 === 0 ? "/public/images/star-bg.jpg" : "/public/images/Star - Background iamge.png",
    href: postUrl(post),
  }));

  const storyCards = [...realPostCards, ...placeholders].slice(0, 5).map((story, index) => {
    const cardClasses = [
      "design-story-card",
      index === 0 ? "design-story-card-large" : "",
      story.wide ? "design-story-card-wide" : "",
      story.href ? "" : "design-story-card-muted",
    ].filter(Boolean).join(" ");
    const media = story.image
      ? `<div class="design-story-media">
                                <img src="${escapeHtml(story.image)}" alt="">
                            </div>`
      : `<div class="design-story-media ${escapeHtml(story.mediaClass || "")}" aria-hidden="true">
                                <span>${escapeHtml(story.mediaText || "DW")}</span>
                            </div>`;
    const meta = story.href && story.label.indexOf("/") !== -1
      ? `<span class="design-story-label">${escapeHtml(story.label)}</span>`
      : `<span class="design-story-label">${escapeHtml(story.label)}</span>`;
    const content = `${media}
                            <div class="design-story-copy">
                                ${meta}
                                <h2>${escapeHtml(story.title)}</h2>
                                <p>${escapeHtml(story.excerpt)}</p>
                            </div>`;

    if (!story.href) {
      return `
                    <article class="${cardClasses}" data-reveal>
                        ${content}
                    </article>`;
    }

    return `
                    <article class="${cardClasses}" data-reveal>
                        <a class="design-story-link" href="${story.href}">
                            ${content}
                        </a>
                    </article>`;
  }).join("");

  const blogIndexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead("Blog - Design Wallet", "Field notes, ideas, and essays for curious designers from Design Wallet.")}
</head>
<body class="blog-index-page">
    <div class="page-shell">
        <header class="site-header"></header>

        <main>
            <section class="design-index">
                <header class="design-index-header" data-reveal>
                    <p class="design-index-kicker">Design Wallet Blog</p>
                    <h1>Design</h1>
                    <p>Where design resources, creative habits and better workflows collide</p>
                </header>

                <nav class="design-topic-pills" aria-label="Blog topics" data-reveal>
                    <a href="/blog/">UI Design</a>
                    <a href="/blog/">Branding</a>
                    <a href="/blog/">Inspiration</a>
                    <a href="/blog/">Product Design</a>
                    <a href="/blog/">AI Tools</a>
                    <a href="/blog/">Workflow</a>
                </nav>

                <div class="design-story-grid" aria-label="Latest design stories">${storyCards}
                </div>
            </section>
        </main>

        <footer class="site-footer"></footer>
    </div>

    <script src="/header.js"></script>
    <script src="/footer.js"></script>
    <script src="/script.js"></script>
</body>
</html>
`;

  fs.writeFileSync(path.join(blogDir, "index.html"), blogIndexHtml);
  console.log("Blog generated successfully");
}

main();
