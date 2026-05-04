import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;
const fallbackAuthor = "Karthik S Krishnan";
const fallbackCoverImages = [
  "/public/images/star-bg.jpg",
  "/public/images/Star - Background iamge.png",
];

function getPlainText(richText) {
  if (!richText) return "";
  return richText.map((t) => t.plain_text).join("");
}

function getFileUrl(file) {
  if (!file) return "";
  if (file.type === "external") return file.external?.url || "";
  if (file.type === "file") return file.file?.url || "";
  return "";
}

function getPropertyUrl(property) {
  if (!property) return "";

  if (property.type === "url") {
    return property.url || "";
  }

  if (property.type === "rich_text") {
    return getPlainText(property.rich_text);
  }

  if (property.type === "files") {
    return property.files.map(getFileUrl).find(Boolean) || "";
  }

  if (property.type === "title") {
    return getPlainText(property.title);
  }

  return "";
}

function getPropertyText(property) {
  if (!property) return "";

  if (property.type === "rich_text") {
    return getPlainText(property.rich_text);
  }

  if (property.type === "title") {
    return getPlainText(property.title);
  }

  if (property.type === "select") {
    return property.select?.name || "";
  }

  if (property.type === "multi_select") {
    return property.multi_select.map((item) => item.name).join(", ");
  }

  if (property.type === "people") {
    return property.people.map((person) => person.name).filter(Boolean).join(", ");
  }

  if (property.type === "created_by") {
    return property.created_by?.name || "";
  }

  return "";
}

function isPublishedStatus(value) {
  var normalized = String(value || "").trim().toLowerCase();
  return ["published", "publish", "live"].includes(normalized);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getUniqueSlug(slug, usedSlugs) {
  const baseSlug = slugify(slug) || "post";
  let uniqueSlug = baseSlug;
  let counter = 2;

  while (usedSlugs.has(uniqueSlug)) {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  usedSlugs.add(uniqueSlug);
  return uniqueSlug;
}

function getImageExtension(url, contentType = "") {
  try {
    var extension = path.extname(new URL(url).pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) {
      return extension;
    }
  } catch {
    // Fall back to the response content-type below.
  }

  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

async function syncImageAsset(remoteUrl, fileBaseName, targetDir) {
  if (!remoteUrl) return "";

  try {
    var response = await fetch(remoteUrl);
    if (!response.ok) return remoteUrl;

    var extension = getImageExtension(remoteUrl, response.headers.get("content-type") || "");
    var safeBaseName = slugify(fileBaseName) || "author";
    var filePath = path.join(targetDir, `${safeBaseName}${extension}`);
    var arrayBuffer = await response.arrayBuffer();

    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return `/${filePath.split(path.sep).join("/")}`;
  } catch {
    return remoteUrl;
  }
}

function renderAuthor(author, avatar, className, avatarClassName) {
  var avatarHtml = avatar
    ? `<img class="${avatarClassName}" src="${escapeHtml(avatar)}" alt="" loading="lazy" aria-hidden="true">`
    : "";

  return `<span class="${className}">${avatarHtml}<span>${escapeHtml(author)}</span></span>`;
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

async function blockToHtml(block, context) {
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

  if (type === "image") {
    const imageUrl = getFileUrl(block.image);
    if (!imageUrl) return "";

    const caption = getPlainText(block.image.caption);
    const imageNumber = context.imageIndex;
    context.imageIndex += 1;

    const src = await syncImageAsset(imageUrl, `${context.slug}-image-${imageNumber}`, context.assetDir);
    const captionHtml = caption ? `
                        <figcaption>${escapeHtml(caption)}</figcaption>` : "";

    return `<figure class="blog-content-image">
                        <img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" loading="lazy">${captionHtml}
                    </figure>`;
  }

  if (type === "quote") {
    const text = getPlainText(block.quote.rich_text);
    return text ? `<blockquote>${escapeHtml(text)}</blockquote>` : "";
  }

  if (type === "divider") {
    return `<hr>`;
  }

  return "";
}

async function blocksToHtml(blocks, context) {
  const html = [];
  let openListType = "";

  for (const block of blocks) {
    const isBulletedListItem = block.type === "bulleted_list_item";
    const isNumberedListItem = block.type === "numbered_list_item";

    if (isBulletedListItem || isNumberedListItem) {
      const nextListType = isBulletedListItem ? "ul" : "ol";

      if (openListType && openListType !== nextListType) {
        html.push(`</${openListType}>`);
        openListType = "";
      }

      if (!openListType) {
        html.push(`<${nextListType}>`);
        openListType = nextListType;
      }

      const item = block[block.type];
      html.push(`  <li>${escapeHtml(getPlainText(item.rich_text))}</li>`);
      continue;
    }

    if (openListType) {
      html.push(`</${openListType}>`);
      openListType = "";
    }

    const rendered = await blockToHtml(block, context);
    if (rendered) html.push(rendered);
  }

  if (openListType) {
    html.push(`</${openListType}>`);
  }

  return html.join("\n");
}

function getExcerpt(blocks) {
  const paragraph = blocks.find((block) => block.type === "paragraph" && getPlainText(block.paragraph.rich_text));
  const text = paragraph ? getPlainText(paragraph.paragraph.rich_text) : "Fresh notes for curious designers from Design Wallet.";

  return text.length > 150 ? `${text.slice(0, 147).trim()}...` : text;
}

function cleanGeneratedBlogPosts(blogDir, publishedSlugs) {
  if (!fs.existsSync(blogDir)) return;

  for (const entry of fs.readdirSync(blogDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (publishedSlugs.has(entry.name)) continue;

    fs.rmSync(path.join(blogDir, entry.name), { recursive: true, force: true });
    console.log(`Removed draft/unpublished blog: ${entry.name}`);
  }
}

async function main() {
  const response = await notion.databases.query({
    database_id: databaseId,
  });

  const posts = response.results;
  const generatedPosts = [];
  const publishedSlugs = new Set();
  const usedSlugs = new Set();

  console.log("Total posts found:", posts.length);

  const blogDir = path.join("blog");
  const authorImageDir = path.join("public", "images", "authors");
  fs.mkdirSync(blogDir, { recursive: true });
  fs.mkdirSync(authorImageDir, { recursive: true });

  for (const page of posts) {
    const props = page.properties;

    const title = props.Title?.title?.[0]?.plain_text || "Untitled";
    const rawSlug = getPlainText(props.Slug?.rich_text);
    const status = getPropertyText(props.Status).trim();

    if (!rawSlug) {
      console.log(`Skipped blog without slug: ${title}`);
      continue;
    }

    if (!isPublishedStatus(status)) {
      console.log(`Skipped draft/unpublished blog: ${title} (${status || "No status"})`);
      continue;
    }

    const slug = getUniqueSlug(rawSlug, usedSlugs);
    if (slug !== slugify(rawSlug)) {
      console.log(`Adjusted duplicate blog slug: ${rawSlug} -> ${slug}`);
    }

    publishedSlugs.add(slug);

    const date = props.Date?.date?.start || "";
    const displayDate = formatDate(date);
    const coverUrl = getPropertyUrl(props["Cover URL"]).trim();
    const category = getPropertyText(props.Categories).trim() || getPropertyText(props.Category).trim() || "Essay";
    const author = getPropertyText(props.Author).trim() || fallbackAuthor;
    const authorPhotoUrl = getPropertyUrl(props["Author Profile Photo"]).trim();
    const authorAvatar = await syncImageAsset(authorPhotoUrl, author, authorImageDir);

    const postImageDir = path.join("public", "images", "blog", slug);
    fs.mkdirSync(postImageDir, { recursive: true });

    const blocks = await getBlocks(page.id);
    const content = await blocksToHtml(blocks, {
      assetDir: postImageDir,
      imageIndex: 1,
      slug,
    });
    const excerpt = getExcerpt(blocks);
    const wordCount = content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
    const readTime = `${Math.max(1, Math.ceil(wordCount / 220))} min`;

    generatedPosts.push({ title, slug, date, displayDate, excerpt, coverUrl, category, author, authorAvatar, readTime });

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
                    <p class="blog-kicker">${escapeHtml(category)}</p>
                    <h1>${escapeHtml(title)}</h1>
                    <div class="blog-article-meta">
                        ${renderTime(date, displayDate)}
                        ${renderAuthor(author, authorAvatar, "blog-author", "blog-author-avatar")}
                    </div>
                </header>

                <div class="blog-content">
                    ${content}
                </div>
            </article>
        </main>

        <footer class="site-footer"></footer>
    </div>

    <script src="/header.js?v=20260426-2"></script>
    <script src="/footer.js"></script>
    <script src="/script.js"></script>
</body>
</html>
`;

    fs.writeFileSync(path.join(postDir, "index.html"), html);
  }

  cleanGeneratedBlogPosts(blogDir, publishedSlugs);

  const postUrl = (post) => `/blog/${escapeHtml(post.slug)}/`;
  const stories = generatedPosts.map((post, index) => ({
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    image: post.coverUrl || fallbackCoverImages[index % fallbackCoverImages.length],
    href: postUrl(post),
    author: post.author,
    authorAvatar: post.authorAvatar,
    readTime: post.readTime,
  }));
  const getCategoryList = (category) =>
    String(category || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const topicLinks = Array.from(
    new Set(
      generatedPosts.flatMap((post) => getCategoryList(post.category)),
    ),
  );
  const topicNavItems = [
    '<a href="/blog/" aria-current="page">All Articles</a>',
    ...topicLinks.map((topic) => `<a href="/blog/" data-blog-category="${escapeHtml(topic)}">${escapeHtml(topic)}</a>`),
  ].join("\n                        ");
  const storyMeta = (story) => `<div class="design-story-meta">
                                    ${renderAuthor(story.author, story.authorAvatar, "design-author", "design-author-avatar")}
                                    <span>${escapeHtml(story.readTime)}</span>
                                </div>`;
  const storyCards = stories.map((story) => `
                    <article class="design-story-card" data-reveal data-blog-card data-blog-categories="${escapeHtml(getCategoryList(story.category).join("|"))}">
                        <a class="design-story-link" href="${story.href}">
                            <div class="design-story-media">
                                <img src="${escapeHtml(story.image)}" alt="">
                            </div>
                            <div class="design-story-copy">
                                <span class="design-story-label">${escapeHtml(story.category)}</span>
                                <h2>${escapeHtml(story.title)}</h2>
                                <p>${escapeHtml(story.excerpt)}</p>
                                ${storyMeta(story)}
                            </div>
                        </a>
                    </article>`).join("");
  const storyGridContent = storyCards || `
                    <div class="design-blog-empty" data-reveal>
                        <p>No published blogs yet.</p>
                        <span>Posts marked Draft in Notion stay hidden from the website.</span>
                    </div>`;

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
                <aside class="design-index-sidebar" data-reveal>
                    <header class="design-index-header">
                        <p class="design-index-kicker">Design Wallet Blog</p>
                        <h1>Design Wallet Daily.</h1>
                        <p>Practical notes on resources, creative habits, tools, and sharper workflows for designers who like to keep exploring.</p>
                    </header>

                    <nav class="design-topic-pills" aria-label="Blog topics">
                        <p class="design-topic-title">Categories</p>
                        ${topicNavItems}
                    </nav>
                </aside>

                <div class="design-story-grid" aria-label="Latest blog stories">${storyGridContent}
                </div>
            </section>
        </main>

        <footer class="site-footer"></footer>
    </div>

    <script src="/header.js?v=20260426-2"></script>
    <script src="/footer.js"></script>
    <script src="/script.js"></script>
</body>
</html>
`;

  fs.writeFileSync(path.join(blogDir, "index.html"), blogIndexHtml);
  console.log("Blog generated successfully");
}

main();
