/**
 * Knowledge Base routes — Neon-style database explorer for Paperclip PGlite.
 *
 * Provides:
 *   GET  /tables           — list all tables with column metadata
 *   GET  /tables/:name     — get rows from a specific table (paginated)
 *   POST /query            — execute read-only SQL query
 *
 * Self-contained, agnostic — works with any PGlite/Postgres database.
 * Read-only by default. Write queries are blocked unless explicitly allowed.
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// SQL safety
// ---------------------------------------------------------------------------

const BLOCKED_KEYWORDS = /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE)\b/i;

function getRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

function isReadOnlyQuery(query: string): boolean {
  // Strip comments and string literals for safety check
  const stripped = query
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'[^']*'/g, "''");
  return !BLOCKED_KEYWORDS.test(stripped);
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function knowledgeBaseRoutes(db: Db) {
  const router = Router();

  // List all tables with column metadata
  router.get("/tables", async (_req, res) => {
    try {
      const tables = await db.execute(sql`
        SELECT
          t.table_name AS name,
          (
            SELECT count(*)::int
            FROM information_schema.columns c
            WHERE c.table_schema = t.table_schema
              AND c.table_name = t.table_name
          ) AS column_count
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name ASC
      `);

      const tableRows = getRows(tables);
      res.json({
        tables: tableRows.map((row) => ({
          name: row.name,
          columnCount: row.column_count,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ error: message }, "Knowledge base: failed to list tables");
      res.status(500).json({ error: message });
    }
  });

  // Get table schema + rows (paginated)
  router.get("/tables/:name", async (req, res) => {
    const tableName = req.params.name;
    if (!tableName || !/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
      res.status(400).json({ error: "Invalid table name" });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    try {
      // Get column metadata
      const columns = await db.execute(sql`
        SELECT
          column_name AS name,
          data_type AS type,
          is_nullable AS nullable,
          column_default AS "defaultValue",
          ordinal_position AS position
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
        ORDER BY ordinal_position ASC
      `);

      const columnRows = getRows(columns);
      if (columnRows.length === 0) {
        res.status(404).json({ error: `Table '${tableName}' not found` });
        return;
      }

      // Get primary key columns
      const pkResult = await db.execute(sql`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = ${tableName}
          AND tc.constraint_type = 'PRIMARY KEY'
      `);
      const pkRows = getRows(pkResult);
      const pkColumns = new Set(
        pkRows.map((r) => r.column_name),
      );

      // Get row count
      const countResult = await db.execute(
        sql.raw(`SELECT count(*)::int AS total FROM "public"."${tableName}"`),
      );
      const countRows = getRows(countResult);
      const total = countRows[0]?.total ?? 0;

      // Get rows
      const rows = await db.execute(
        sql.raw(
          `SELECT * FROM "public"."${tableName}" ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`,
        ),
      );
      const dataRows = getRows(rows);

      res.json({
        table: tableName,
        columns: columnRows.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable === "YES",
          defaultValue: col.defaultValue,
          isPrimaryKey: pkColumns.has(col.name),
        })),
        rows: dataRows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < (total as number),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { table: tableName, error: message },
        "Knowledge base: failed to read table",
      );
      res.status(500).json({ error: message });
    }
  });

  // Execute SQL query (read-only)
  router.post("/query", async (req, res) => {
    const { query } = req.body as { query?: string };

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({ error: "Query is required" });
      return;
    }

    if (!isReadOnlyQuery(query)) {
      res.status(403).json({
        error: "Only read-only queries (SELECT, WITH, EXPLAIN) are allowed",
      });
      return;
    }

    const startTime = Date.now();

    try {
      const result = await db.execute(sql.raw(query));
      const resultRows = getRows(result);
      const durationMs = Date.now() - startTime;

      res.json({
        rows: resultRows,
        rowCount: resultRows.length,
        durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { query: query.slice(0, 200), error: message },
        "Knowledge base: query failed",
      );
      res.status(400).json({ error: message });
    }
  });

  return router;
}
