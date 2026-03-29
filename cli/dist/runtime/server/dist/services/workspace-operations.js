import { randomUUID } from "node:crypto";
import { workspaceOperations } from "@paperclipai/db";
import { asc, desc, eq, inArray, isNull, or, and } from "drizzle-orm";
import { notFound } from "../errors.js";
import { redactCurrentUserText, redactCurrentUserValue } from "../log-redaction.js";
import { getWorkspaceOperationLogStore } from "./workspace-operation-log-store.js";
function toWorkspaceOperation(row) {
    return {
        id: row.id,
        companyId: row.companyId,
        executionWorkspaceId: row.executionWorkspaceId ?? null,
        heartbeatRunId: row.heartbeatRunId ?? null,
        phase: row.phase,
        command: row.command ?? null,
        cwd: row.cwd ?? null,
        status: row.status,
        exitCode: row.exitCode ?? null,
        logStore: row.logStore ?? null,
        logRef: row.logRef ?? null,
        logBytes: row.logBytes ?? null,
        logSha256: row.logSha256 ?? null,
        logCompressed: row.logCompressed,
        stdoutExcerpt: row.stdoutExcerpt ?? null,
        stderrExcerpt: row.stderrExcerpt ?? null,
        metadata: row.metadata ?? null,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function appendExcerpt(current, chunk) {
    return `${current}${chunk}`.slice(-4096);
}
function combineMetadata(base, patch) {
    if (!base && !patch)
        return null;
    return {
        ...(base ?? {}),
        ...(patch ?? {}),
    };
}
export function workspaceOperationService(db) {
    const logStore = getWorkspaceOperationLogStore();
    async function getById(id) {
        const row = await db
            .select()
            .from(workspaceOperations)
            .where(eq(workspaceOperations.id, id))
            .then((rows) => rows[0] ?? null);
        return row ? toWorkspaceOperation(row) : null;
    }
    return {
        getById,
        createRecorder(input) {
            let executionWorkspaceId = input.executionWorkspaceId ?? null;
            const createdIds = [];
            return {
                async attachExecutionWorkspaceId(nextExecutionWorkspaceId) {
                    executionWorkspaceId = nextExecutionWorkspaceId ?? null;
                    if (!executionWorkspaceId || createdIds.length === 0)
                        return;
                    await db
                        .update(workspaceOperations)
                        .set({
                        executionWorkspaceId,
                        updatedAt: new Date(),
                    })
                        .where(inArray(workspaceOperations.id, createdIds));
                },
                async recordOperation(recordInput) {
                    const startedAt = new Date();
                    const id = randomUUID();
                    const handle = await logStore.begin({
                        companyId: input.companyId,
                        operationId: id,
                    });
                    let stdoutExcerpt = "";
                    let stderrExcerpt = "";
                    const append = async (stream, chunk) => {
                        if (!chunk)
                            return;
                        const sanitizedChunk = redactCurrentUserText(chunk);
                        if (stream === "stdout")
                            stdoutExcerpt = appendExcerpt(stdoutExcerpt, sanitizedChunk);
                        if (stream === "stderr")
                            stderrExcerpt = appendExcerpt(stderrExcerpt, sanitizedChunk);
                        await logStore.append(handle, {
                            stream,
                            chunk: sanitizedChunk,
                            ts: new Date().toISOString(),
                        });
                    };
                    await db.insert(workspaceOperations).values({
                        id,
                        companyId: input.companyId,
                        executionWorkspaceId,
                        heartbeatRunId: input.heartbeatRunId ?? null,
                        phase: recordInput.phase,
                        command: recordInput.command ?? null,
                        cwd: recordInput.cwd ?? null,
                        status: "running",
                        logStore: handle.store,
                        logRef: handle.logRef,
                        metadata: redactCurrentUserValue(recordInput.metadata ?? null),
                        startedAt,
                    });
                    createdIds.push(id);
                    try {
                        const result = await recordInput.run();
                        await append("system", result.system ?? null);
                        await append("stdout", result.stdout ?? null);
                        await append("stderr", result.stderr ?? null);
                        const finalized = await logStore.finalize(handle);
                        const finishedAt = new Date();
                        const row = await db
                            .update(workspaceOperations)
                            .set({
                            executionWorkspaceId,
                            status: result.status ?? "succeeded",
                            exitCode: result.exitCode ?? null,
                            stdoutExcerpt: stdoutExcerpt || null,
                            stderrExcerpt: stderrExcerpt || null,
                            logBytes: finalized.bytes,
                            logSha256: finalized.sha256,
                            logCompressed: finalized.compressed,
                            metadata: redactCurrentUserValue(combineMetadata(recordInput.metadata, result.metadata)),
                            finishedAt,
                            updatedAt: finishedAt,
                        })
                            .where(eq(workspaceOperations.id, id))
                            .returning()
                            .then((rows) => rows[0] ?? null);
                        if (!row)
                            throw notFound("Workspace operation not found");
                        return toWorkspaceOperation(row);
                    }
                    catch (error) {
                        await append("stderr", error instanceof Error ? error.message : String(error));
                        const finalized = await logStore.finalize(handle).catch(() => null);
                        const finishedAt = new Date();
                        await db
                            .update(workspaceOperations)
                            .set({
                            executionWorkspaceId,
                            status: "failed",
                            stdoutExcerpt: stdoutExcerpt || null,
                            stderrExcerpt: stderrExcerpt || null,
                            logBytes: finalized?.bytes ?? null,
                            logSha256: finalized?.sha256 ?? null,
                            logCompressed: finalized?.compressed ?? false,
                            finishedAt,
                            updatedAt: finishedAt,
                        })
                            .where(eq(workspaceOperations.id, id));
                        throw error;
                    }
                },
            };
        },
        listForRun: async (runId, executionWorkspaceId) => {
            const conditions = [eq(workspaceOperations.heartbeatRunId, runId)];
            if (executionWorkspaceId) {
                const cleanupCondition = and(eq(workspaceOperations.executionWorkspaceId, executionWorkspaceId), isNull(workspaceOperations.heartbeatRunId));
                if (cleanupCondition)
                    conditions.push(cleanupCondition);
            }
            const rows = await db
                .select()
                .from(workspaceOperations)
                .where(conditions.length === 1 ? conditions[0] : or(...conditions))
                .orderBy(asc(workspaceOperations.startedAt), asc(workspaceOperations.createdAt), asc(workspaceOperations.id));
            return rows.map(toWorkspaceOperation);
        },
        listForExecutionWorkspace: async (executionWorkspaceId) => {
            const rows = await db
                .select()
                .from(workspaceOperations)
                .where(eq(workspaceOperations.executionWorkspaceId, executionWorkspaceId))
                .orderBy(desc(workspaceOperations.startedAt), desc(workspaceOperations.createdAt));
            return rows.map(toWorkspaceOperation);
        },
        readLog: async (operationId, opts) => {
            const operation = await getById(operationId);
            if (!operation)
                throw notFound("Workspace operation not found");
            if (!operation.logStore || !operation.logRef)
                throw notFound("Workspace operation log not found");
            const result = await logStore.read({
                store: operation.logStore,
                logRef: operation.logRef,
            }, opts);
            return {
                operationId,
                store: operation.logStore,
                logRef: operation.logRef,
                ...result,
                content: redactCurrentUserText(result.content),
            };
        },
    };
}
export { toWorkspaceOperation };
//# sourceMappingURL=workspace-operations.js.map