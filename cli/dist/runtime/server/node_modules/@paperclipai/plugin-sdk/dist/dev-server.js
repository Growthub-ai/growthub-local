import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
function contentType(filePath) {
    if (filePath.endsWith(".js"))
        return "text/javascript; charset=utf-8";
    if (filePath.endsWith(".css"))
        return "text/css; charset=utf-8";
    if (filePath.endsWith(".json"))
        return "application/json; charset=utf-8";
    if (filePath.endsWith(".html"))
        return "text/html; charset=utf-8";
    if (filePath.endsWith(".svg"))
        return "image/svg+xml";
    return "application/octet-stream";
}
function normalizeFilePath(baseDir, reqPath) {
    const pathname = reqPath.split("?")[0] || "/";
    const resolved = pathname === "/" ? "/index.js" : pathname;
    const absolute = path.resolve(baseDir, `.${resolved}`);
    const normalizedBase = `${path.resolve(baseDir)}${path.sep}`;
    if (!absolute.startsWith(normalizedBase) && absolute !== path.resolve(baseDir)) {
        throw new Error("path traversal blocked");
    }
    return absolute;
}
function send404(res) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found" }));
}
function sendJson(res, value) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
}
async function ensureUiDir(uiDir) {
    if (existsSync(uiDir))
        return;
    await mkdir(uiDir, { recursive: true });
}
async function listFilesRecursive(dir) {
    const out = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...await listFilesRecursive(abs));
        }
        else if (entry.isFile()) {
            out.push(abs);
        }
    }
    return out;
}
function snapshotSignature(rows) {
    return rows.map((row) => `${row.file}:${Math.trunc(row.mtimeMs)}`).join("|");
}
async function startUiWatcher(uiDir, onReload) {
    try {
        // macOS/Windows support recursive native watching.
        const watcher = watch(uiDir, { recursive: true }, (_eventType, filename) => {
            if (!filename)
                return;
            onReload(path.join(uiDir, filename));
        });
        return watcher;
    }
    catch {
        // Linux may reject recursive watch. Fall back to polling snapshots.
        let previous = snapshotSignature((await getUiBuildSnapshot(path.dirname(uiDir), path.basename(uiDir))).map((row) => ({
            file: row.file,
            mtimeMs: row.mtimeMs,
        })));
        const timer = setInterval(async () => {
            try {
                const nextRows = await getUiBuildSnapshot(path.dirname(uiDir), path.basename(uiDir));
                const next = snapshotSignature(nextRows);
                if (next === previous)
                    return;
                previous = next;
                onReload("__snapshot__");
            }
            catch {
                // Ignore transient read errors while bundlers are writing files.
            }
        }, 500);
        return {
            close() {
                clearInterval(timer);
            },
        };
    }
}
/**
 * Start a local static server for plugin UI assets with SSE reload events.
 *
 * Endpoint summary:
 * - `GET /__paperclip__/health` for diagnostics
 * - `GET /__paperclip__/events` for hot-reload stream
 * - Any other path serves files from the configured UI build directory
 */
export async function startPluginDevServer(options = {}) {
    const rootDir = path.resolve(options.rootDir ?? process.cwd());
    const uiDir = path.resolve(rootDir, options.uiDir ?? "dist/ui");
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? 4177;
    await ensureUiDir(uiDir);
    const sseClients = new Set();
    const handleRequest = async (req, res) => {
        const url = req.url ?? "/";
        if (url === "/__paperclip__/health") {
            sendJson(res, { ok: true, rootDir, uiDir });
            return;
        }
        if (url === "/__paperclip__/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            });
            res.write(`event: connected\ndata: {"ok":true}\n\n`);
            sseClients.add(res);
            req.on("close", () => {
                sseClients.delete(res);
            });
            return;
        }
        try {
            const filePath = normalizeFilePath(uiDir, url);
            if (!existsSync(filePath) || !statSync(filePath).isFile()) {
                send404(res);
                return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", contentType(filePath));
            createReadStream(filePath).pipe(res);
        }
        catch {
            send404(res);
        }
    };
    const server = createServer((req, res) => {
        void handleRequest(req, res);
    });
    const notifyReload = (filePath) => {
        const rel = path.relative(uiDir, filePath);
        const payload = JSON.stringify({ type: "reload", file: rel, at: new Date().toISOString() });
        for (const client of sseClients) {
            client.write(`event: reload\ndata: ${payload}\n\n`);
        }
    };
    const watcher = await startUiWatcher(uiDir, notifyReload);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
    });
    const address = server.address();
    const actualPort = address && typeof address === "object" ? address.port : port;
    return {
        url: `http://${host}:${actualPort}`,
        async close() {
            watcher.close();
            for (const client of sseClients) {
                client.end();
            }
            await new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            });
        },
    };
}
/**
 * Return a stable file+mtime snapshot for a built plugin UI directory.
 *
 * Used by the polling watcher fallback and useful for tests that need to assert
 * whether a UI build has changed between runs.
 */
export async function getUiBuildSnapshot(rootDir, uiDir = "dist/ui") {
    const baseDir = path.resolve(rootDir, uiDir);
    if (!existsSync(baseDir))
        return [];
    const files = await listFilesRecursive(baseDir);
    const rows = await Promise.all(files.map(async (filePath) => {
        const fileStat = await stat(filePath);
        return {
            file: path.relative(baseDir, filePath),
            mtimeMs: fileStat.mtimeMs,
        };
    }));
    return rows.sort((a, b) => a.file.localeCompare(b.file));
}
//# sourceMappingURL=dev-server.js.map