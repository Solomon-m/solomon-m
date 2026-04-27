const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const RSS_URL = "https://solomonmark.dev/rss.xml";
const README_PATH = path.join(__dirname, "../../README.md");
const MAX_POSTS = 5;
const START_MARKER = "<!-- BLOG-POST-LIST:START -->";
const END_MARKER = "<!-- BLOG-POST-LIST:END -->";

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, { headers: { "User-Agent": "blog-post-updater/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetch(res.headers.location).then(resolve).catch(reject);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < MAX_POSTS) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      block.match(/<title>(.*?)<\/title>/))?.[1]?.trim();
    const url = (block.match(/<link>(.*?)<\/link>/) ||
      block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/))?.[1]?.trim();
    if (title && url) items.push({ title, url });
  }
  return items;
}

function extractOgImage(html) {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return match?.[1] || null;
}

async function getOgImage(url) {
  try {
    const html = await fetch(url);
    return extractOgImage(html);
  } catch {
    return null;
  }
}

async function main() {
  console.log("Fetching RSS feed...");
  const xml = await fetch(RSS_URL);
  const posts = parseRssItems(xml);
  console.log(`Found ${posts.length} posts`);

  const cards = [];
  for (const post of posts) {
    console.log(`Fetching OG image for: ${post.title}`);
    const ogImage = await getOgImage(post.url);
    if (ogImage) {
      cards.push(
        `<a href="${post.url}"><img src="${ogImage}" alt="${post.title}" width="400"/></a>`
      );
    } else {
      cards.push(`- [${post.title}](${post.url})`);
    }
  }

  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find BLOG-POST-LIST markers in README.md");
    process.exit(1);
  }

  const newContent =
    readme.slice(0, startIdx + START_MARKER.length) +
    "\n" +
    cards.join("\n") +
    "\n" +
    readme.slice(endIdx);

  fs.writeFileSync(README_PATH, newContent, "utf8");
  console.log("README.md updated successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
