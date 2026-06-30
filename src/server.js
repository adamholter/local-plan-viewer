import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { listPlans, readPlan } from "./render.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ROOT = path.join(__dirname, "../demo-plans");
const PUBLIC_DIR = path.join(__dirname, "../public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export async function startServer(options = {}) {
  const root = path.resolve(options.root || process.env.PLAN_VIEWER_ROOT || DEFAULT_ROOT);
  const host = options.host || process.env.HOST || "127.0.0.1";
  const port = Number(options.port || process.env.PORT || 8796);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      if (url.pathname === "/api/plans") return sendJson(res, { plans: await listPlans(root), root });
      if (url.pathname.startsWith("/api/plan/")) {
        const slug = decodeURIComponent(url.pathname.slice("/api/plan/".length));
        return sendJson(res, await readPlan(root, slug));
      }
      if (url.pathname === "/api/health") return sendJson(res, { ok: true, root });
      return sendStatic(res, url.pathname);
    } catch (error) {
      return sendJson(res, { error: error.message }, 500);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const url = `http://${host}:${port}/plan/latest`;
  console.log(`Local Plan Viewer: ${url}`);
  console.log(`Plans root: ${root}`);
  if (options.open) openUrl(url);
  return { server, url, root };
}

async function sendStatic(res, pathname) {
  const cleanPath = pathname === "/" || pathname.startsWith("/plan/") ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    notFound(res);
  }
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function openUrl(url) {
  const child = spawn("open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}
