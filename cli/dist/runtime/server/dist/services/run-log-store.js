import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { notFound } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
function safeSegments(...segments) {
    return segments.map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));
}
function resolveWithin(basePath, relativePath) {
    const resolved = path.resolve(basePath, relativePath);
    const base = path.resolve(basePath) + path.sep;
    if (!resolved.startsWith(base) && resolved !== path.resolve(basePath)) {
        throw new Error("Invalid log path");
    }
    return resolved;
}
function createLocalFileRunLogStore(basePath) {
    async function ensureDir(relativeDir) {
        const dir = resolveWithin(basePath, relativeDir);
        await fs.mkdir(dir, { recursive: true });
    }
    async function readFileRange(filePath, offset, limitBytes) {
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat)
            throw notFound("Run log not found");
        const start = Math.max(0, Math.min(offset, stat.size));
        const end = Math.max(start, Math.min(start + limitBytes - 1, stat.size - 1));
        if (start > end) {
            return { content: "", nextOffset: start };
        }
        const chunks = [];
        await new Promise((resolve, reject) => {
            const stream = createReadStream(filePath, { start, end });
            stream.on("data", (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            stream.on("error", reject);
            stream.on("end", () => resolve());
        });
        const content = Buffer.concat(chunks).toString("utf8");
        const nextOffset = end + 1 < stat.size ? end + 1 : undefined;
        return { content, nextOffset };
    }
    async function sha256File(filePath) {
        return new Promise((resolve, reject) => {
            const hash = createHash("sha256");
            const stream = createReadStream(filePath);
            stream.on("data", (chunk) => hash.update(chunk));
            stream.on("error", reject);
            stream.on("end", () => resolve(hash.digest("hex")));
        });
    }
    return {
        async begin(input) {
            const [companyId, agentId] = safeSegments(input.companyId, input.agentId);
            const runId = safeSegments(input.runId)[0];
            const relDir = path.join(companyId, agentId);
            const relPath = path.join(relDir, `${runId}.ndjson`);
            await ensureDir(relDir);
            const absPath = resolveWithin(basePath, relPath);
            await fs.writeFile(absPath, "", "utf8");
            return { store: "local_file", logRef: relPath };
        },
        async append(handle, event) {
            if (handle.store !== "local_file")
                return;
            const absPath = resolveWithin(basePath, handle.logRef);
            const line = JSON.stringify({
                ts: event.ts,
                stream: event.stream,
                chunk: event.chunk,
            });
            await fs.appendFile(absPath, `${line}\n`, "utf8");
        },
        async finalize(handle) {
            if (handle.store !== "local_file") {
                return { bytes: 0, compressed: false };
            }
            const absPath = resolveWithin(basePath, handle.logRef);
            const stat = await fs.stat(absPath).catch(() => null);
            if (!stat)
                throw notFound("Run log not found");
            const hash = await sha256File(absPath);
            return {
                bytes: stat.size,
                sha256: hash,
                compressed: false,
            };
        },
        async read(handle, opts) {
            if (handle.store !== "local_file") {
                throw notFound("Run log not found");
            }
            const absPath = resolveWithin(basePath, handle.logRef);
            const offset = opts?.offset ?? 0;
            const limitBytes = opts?.limitBytes ?? 256_000;
            return readFileRange(absPath, offset, limitBytes);
        },
    };
}
let cachedStore = null;
export function getRunLogStore() {
    if (cachedStore)
        return cachedStore;
    const basePath = process.env.RUN_LOG_BASE_PATH ?? path.resolve(resolvePaperclipInstanceRoot(), "data", "run-logs");
    cachedStore = createLocalFileRunLogStore(basePath);
    return cachedStore;
}
//# sourceMappingURL=run-log-store.js.map