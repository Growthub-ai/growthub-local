#!/usr/bin/env node
// Minimal static server for the built Vite shell.
// Usage: node serve.mjs [--port 5180]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "dist");
const PORT = Number(process.env.PORT ?? 5180);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function serve(req, res) {
  const url = decodeURIComponent(req.url?.split("?")[0] ?? "/");
  const file = url === "/" ? "/index.html" : url;
  const full = path.resolve(DIST, "." + file);
  if (!full.startsWith(DIST)) { res.statusCode = 403; res.end("Forbidden"); return; }
  fs.readFile(full, (err, buf) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.resolve(DIST, "index.html"), (err2, fallback) => {
        if (err2) { res.statusCode = 404; res.end("Not found"); return; }
        res.setHeader("Content-Type", mime[".html"]); res.end(fallback);
      });
      return;
    }
    res.setHeader("Content-Type", mime[path.extname(full)] ?? "application/octet-stream");
    res.end(buf);
  });
}

http.createServer(serve).listen(PORT, () => {
  console.log(`[starter-studio] serving ${DIST} on http://localhost:${PORT}`);
});
