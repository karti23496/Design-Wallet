import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const preferredPort = Number(process.env.PORT || 8000);
const host = getCliValue("--host") || process.env.HOST || "localhost";
const shouldLogRequests = process.argv.includes("--log-requests");
const shouldUseLiveReload = !process.argv.includes("--no-live-reload");
const clients = new Set();
const fileSignatures = new Map();
const watchers = [];
let reloadTimer;
let reloadVersion = Date.now();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const reloadExtensions = new Set([
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpg",
  ".jpeg",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".webp",
]);

function getCliValue(name) {
  const exactArg = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exactArg) {
    return exactArg.slice(name.length + 1);
  }

  const argIndex = process.argv.indexOf(name);
  if (argIndex === -1) {
    return null;
  }

  const nextArg = process.argv[argIndex + 1];
  if (!nextArg || nextArg.startsWith("-")) {
    return "0.0.0.0";
  }

  return nextArg;
}

function getNetworkUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      urls.push(`http://${entry.address}:${port}/`);
    }
  }

  return urls;
}

function getLiveReloadSnippet() {
  return `
<script>
(() => {
  const versionEndpoint = "/__live-reload-version";
  let currentVersion = "${reloadVersion}";
  let reloading = false;

  function reload() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  if ("EventSource" in window) {
    const source = new EventSource("/__live-reload");
    source.addEventListener("reload", (event) => {
      currentVersion = event.data || currentVersion;
      reload();
    });
  }

  async function checkForChanges() {
    try {
      const response = await fetch(versionEndpoint + "?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!response.ok) return;

      const payload = await response.json();
      const nextVersion = String(payload.version || "");
      if (nextVersion && nextVersion !== currentVersion) {
        currentVersion = nextVersion;
        reload();
      }
    } catch {
      // The event stream handles the happy path; polling is only a fallback.
    }
  }

  setInterval(checkForChanges, 750);
})();
</script>`;
}

function getRelativePath(filePath) {
  return path.relative(rootDir, filePath) || ".";
}

function sendReload(changedPath) {
  if (!shouldUseLiveReload) return;

  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadVersion = Date.now();
    console.log(`[reload] ${getRelativePath(changedPath)}`);

    clients.forEach((client) => {
      if (client.destroyed || client.writableEnded) {
        clients.delete(client);
        return;
      }

      try {
        client.write(`event: reload\\ndata: ${reloadVersion}\\n\\n`);
      } catch (error) {
        clients.delete(client);
        console.warn(`Dropped live reload client: ${error.message}`);
      }
    });
  }, 120);
}

function shouldIgnore(filePath) {
  const relativePath = path.relative(rootDir, filePath);

  return relativePath
    .split(path.sep)
    .some((part) => [".git", "node_modules"].includes(part));
}

function getFileSignature(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return null;

    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return null;
  }
}

function rememberFile(filePath) {
  const signature = getFileSignature(filePath);

  if (signature) {
    fileSignatures.set(filePath, signature);
  }
}

function shouldReloadPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!reloadExtensions.has(extension)) return false;

  const nextSignature = getFileSignature(filePath);
  if (!nextSignature) {
    const wasTracked = fileSignatures.delete(filePath);
    return wasTracked;
  }

  const previousSignature = fileSignatures.get(filePath);
  fileSignatures.set(filePath, nextSignature);
  return previousSignature !== nextSignature;
}

function watchDirectory(directory) {
  if (shouldIgnore(directory)) return;

  try {
    const watcher = fs.watch(directory, (eventType, fileName) => {
      if (!fileName) return;

      const changedPath = path.join(directory, String(fileName));
      if (shouldIgnore(changedPath)) return;

      if (eventType === "rename" && fs.existsSync(changedPath)) {
        try {
          if (fs.statSync(changedPath).isDirectory()) {
            watchTree(changedPath);
            return;
          }
        } catch {
          // The file may disappear between fs.watch and fs.statSync.
        }
      }

      if (!shouldReloadPath(changedPath)) return;

      sendReload(changedPath);
    });

    watchers.push(watcher);
  } catch (error) {
    console.warn(`Could not watch ${directory}: ${error.message}`);
  }
}

function watchTree(directory) {
  watchDirectory(directory);

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory() && !shouldIgnore(entryPath)) {
      watchTree(entryPath);
    } else if (entry.isFile()) {
      rememberFile(entryPath);
    }
  }
}

function getRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname);
  const candidatePath = path.resolve(rootDir, `.${decodedPath}`);

  if (!candidatePath.startsWith(rootDir)) {
    return null;
  }

  return candidatePath;
}

function serveFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Could not read file.");
      return;
    }

    let body = data;
    if (extension === ".html" && shouldUseLiveReload) {
      body = Buffer.from(
        data
          .toString("utf8")
          .replace("</body>", `${getLiveReloadSnippet()}\n</body>`),
        "utf8",
      );
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": body.length,
      "Content-Type": contentType,
    });
    response.end(body);
  });
}

function handleRequest(request, response) {
  if (shouldLogRequests) {
    console.log(`[request] ${request.socket.remoteAddress} ${request.method} ${request.url}`);
  }

  if (request.url === "/__live-reload") {
    if (!shouldUseLiveReload) {
      response.writeHead(204, { "Cache-Control": "no-cache" });
      response.end();
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });
    response.write(": connected\\n\\n");
    clients.add(response);
    response.on("error", (error) => {
      clients.delete(response);
      console.warn(`Live reload connection closed: ${error.message}`);
    });
    request.on("close", () => clients.delete(response));
    return;
  }

  if (request.url?.startsWith("/__live-reload-version")) {
    const body = JSON.stringify({ version: reloadVersion });
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": Buffer.byteLength(body),
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(body);
    return;
  }

  let filePath = getRequestPath(request.url);
  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (/^\/(?:tools|category)(?:\/.*)?\/?$/.test(pathname)) {
      filePath = path.join(rootDir, "tools", "index.html");
    }
  }

  if (!fs.existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  serveFile(response, filePath);
}

function startServer(port) {
  const server = http.createServer(handleRequest);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      startServer(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, host, () => {
    watchTree(rootDir);
    console.log(`Live preview: http://localhost:${port}/`);

    if (host === "0.0.0.0" || host === "::") {
      for (const url of getNetworkUrls(port)) {
        console.log(`Network preview: ${url}`);
      }
    } else if (host !== "localhost" && host !== "127.0.0.1") {
      console.log(`Host preview: http://${host}:${port}/`);
    }

    console.log("Watching HTML, CSS, JS, and asset changes...");
  });
}

process.on("SIGINT", () => {
  clients.forEach((client) => client.end());
  watchers.forEach((watcher) => watcher.close());
  process.exit(0);
});

startServer(preferredPort);
