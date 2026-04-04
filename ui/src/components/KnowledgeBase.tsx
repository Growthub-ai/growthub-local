/**
 * KnowledgeBase — Neon-style database explorer for Paperclip PGlite.
 *
 * Two tabs: Table View (browse tables + rows) and SQL Query (execute read-only SQL).
 * Left sidebar lists all tables. Main area shows column types + row data.
 * Self-contained, agnostic — works with any PGlite/Postgres schema.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  Plus,
  Play,
  RefreshCcw,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  gtmApi,
  type KnowledgeTableColumn,
  type KnowledgeTableResult,
  type KnowledgeQueryResult,
} from "@/api/gtm";

// ---------------------------------------------------------------------------
// Table sidebar
// ---------------------------------------------------------------------------

function TableList(props: {
  tables: Array<{ name: string; columnCount: number }>;
  selected: string | null;
  onSelect: (name: string) => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Database className="h-3.5 w-3.5" />
          Tables
          <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
            {props.tables.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={props.onRefresh}
          disabled={props.loading}
          aria-label="Refresh tables"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", props.loading && "animate-spin")} />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1.5">
          {props.tables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => props.onSelect(t.name)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                props.selected === t.name
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Table2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column type badges
// ---------------------------------------------------------------------------

function ColumnTypeBadge({ col }: { col: KnowledgeTableColumn }) {
  const label =
    col.type === "uuid"
      ? "uuid"
      : col.type === "text"
        ? "text"
        : col.type === "integer" || col.type === "bigint"
          ? col.type
          : col.type === "boolean"
            ? "boolean"
            : col.type === "jsonb"
              ? "JSONB"
              : col.type === "timestamp with time zone"
                ? "timestamp"
                : col.type === "date"
                  ? "date"
                  : col.type === "ARRAY"
                    ? "ARRAY"
                    : col.type.startsWith("USER-DEFINED")
                      ? "USER-DEFINED"
                      : col.type;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-normal px-1.5 py-0",
        col.isPrimaryKey && "border-primary/50 text-primary",
      )}
    >
      {col.name}
      {" "}
      <span className="opacity-60">{label}</span>
      {col.isPrimaryKey && <span className="ml-1 text-primary">PK</span>}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

function TableView(props: {
  data: KnowledgeTableResult | null;
  loading: boolean;
  onPageChange: (offset: number) => void;
}) {
  const { data, loading } = props;

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Select a table to view its data
      </div>
    );
  }

  const columnNames = data.columns.map((c) => c.name);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header: table name + column types */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold">public.{data.table}</h2>
          <span className="text-xs text-muted-foreground">
            {data.columns.length} columns &middot; PK: {data.columns.find((c) => c.isPrimaryKey)?.name ?? "—"}
          </span>
        </div>
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Column types
          </summary>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {data.columns.map((col) => (
              <ColumnTypeBadge key={col.name} col={col} />
            ))}
          </div>
        </details>
      </div>

      {/* Data grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                {columnNames.map((name) => {
                  const col = data.columns.find((c) => c.name === name);
                  return (
                    <th
                      key={name}
                      className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground border-b border-border"
                    >
                      {name}
                      {col?.isPrimaryKey && (
                        <span className="ml-1 text-primary text-[10px]">PK</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  {columnNames.map((name) => {
                    const val = row[name];
                    const display = formatCellValue(val);
                    return (
                      <td
                        key={name}
                        className="whitespace-nowrap px-3 py-1.5 max-w-[300px] truncate"
                        title={typeof val === "string" ? val : JSON.stringify(val)}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columnNames.length}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          Showing {data.pagination.offset + 1}–
          {Math.min(data.pagination.offset + data.rows.length, data.pagination.total)} of{" "}
          {data.pagination.total}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={data.pagination.offset === 0}
            onClick={() => props.onPageChange(Math.max(0, data.pagination.offset - data.pagination.limit))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!data.pagination.hasMore}
            onClick={() => props.onPageChange(data.pagination.offset + data.pagination.limit)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQL Query tab
// ---------------------------------------------------------------------------

function SqlQueryTab() {
  const [query, setQuery] = useState("SELECT * FROM agents LIMIT 10;");
  const [result, setResult] = useState<KnowledgeQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (q: string) => gtmApi.executeKnowledgeQuery(q),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error ?? err.message);
      setResult(null);
    },
  });

  const handleRun = useCallback(() => {
    if (query.trim()) mutation.mutate(query.trim());
  }, [query, mutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    },
    [handleRun],
  );

  const columnNames = useMemo(
    () => (result && result.rows.length > 0 ? Object.keys(result.rows[0]!) : []),
    [result],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Query editor */}
      <div className="border-b border-border p-4">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="SELECT * FROM users LIMIT 10;"
          spellCheck={false}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            Press Cmd/Ctrl + Enter to execute
          </span>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={mutation.isPending || !query.trim()}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Run Query
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="p-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/20">
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Play className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm font-medium">Run a query</p>
            <p className="text-xs">Execute a SQL query to see results</p>
          </div>
        )}

        {result && (
          <>
            {result.rows.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {columnNames.map((name) => (
                      <th
                        key={name}
                        className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground border-b border-border"
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      {columnNames.map((name) => (
                        <td
                          key={name}
                          className="whitespace-nowrap px-3 py-1.5 max-w-[300px] truncate"
                          title={
                            typeof row[name] === "string"
                              ? row[name]
                              : JSON.stringify(row[name])
                          }
                        >
                          {formatCellValue(row[name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Query returned 0 rows
              </div>
            )}
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} &middot;{" "}
              {result.durationMs}ms
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell value formatting
// ---------------------------------------------------------------------------

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    if (val.length > 100) return val.slice(0, 100) + "...";
    return val;
  }
  if (Array.isArray(val)) return JSON.stringify(val);
  if (typeof val === "object") {
    const s = JSON.stringify(val);
    return s.length > 100 ? s.slice(0, 100) + "..." : s;
  }
  return String(val);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KnowledgeBase() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<"table" | "query">("table");
  const [newHostedTableName, setNewHostedTableName] = useState("");
  const [selectedHostedTableId, setSelectedHostedTableId] = useState("");

  const tablesQuery = useQuery({
    queryKey: ["knowledge-base", "tables"],
    queryFn: () => gtmApi.listKnowledgeTables(),
  });

  const tableDataQuery = useQuery({
    queryKey: ["knowledge-base", "table", selectedTable, offset],
    queryFn: () =>
      selectedTable
        ? gtmApi.getKnowledgeTable(selectedTable, { limit: 50, offset })
        : Promise.resolve(null),
    enabled: !!selectedTable,
  });

  const hostedTablesQuery = useQuery({
    queryKey: ["knowledge-sync", "tables"],
    queryFn: () => gtmApi.listHostedKnowledgeTables(),
  });

  const bindingQuery = useQuery({
    queryKey: ["knowledge-sync", "binding"],
    queryFn: () => gtmApi.getKnowledgeBinding(),
  });

  const bindMutation = useMutation({
    mutationFn: (input: { tableId: string; tableName: string; workspaceId?: string; adminId?: string }) =>
      gtmApi.bindKnowledgeTable(input),
  });

  const createHostedTableMutation = useMutation({
    mutationFn: (name: string) => gtmApi.createHostedKnowledgeTable({ name }),
    onSuccess: async (result) => {
      setNewHostedTableName("");
      await hostedTablesQuery.refetch();
      await bindMutation.mutateAsync({
        tableId: result.table.id,
        tableName: result.table.name,
        workspaceId: result.table.workspaceId,
        adminId: result.table.adminId,
      });
      await bindingQuery.refetch();
    },
  });

  const handleSelectTable = useCallback((name: string) => {
    setSelectedTable(name);
    setOffset(0);
    setActiveTab("table");
  }, []);

  const tables = tablesQuery.data?.tables ?? [];
  const hostedTables = hostedTablesQuery.data?.tables ?? [];
  const selectedBinding = bindingQuery.data?.binding;

  useEffect(() => {
    if (selectedBinding?.tableId) {
      setSelectedHostedTableId(selectedBinding.tableId);
    }
  }, [selectedBinding?.tableId]);

  // Auto-select first table
  useEffect(() => {
    if (!selectedTable && tables.length > 0) {
      setSelectedTable(tables[0]!.name);
    }
  }, [tables, selectedTable]);

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-lg border border-border bg-background overflow-hidden">
      {/* Sidebar — table list */}
      <div className="w-56 shrink-0">
        <div className="border-r border-b border-border px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Hosted Knowledge Table</p>
          <select
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            value={selectedHostedTableId}
            onChange={(event) => {
              const tableId = event.target.value;
              setSelectedHostedTableId(tableId);
              const table = hostedTables.find((row) => row.id === tableId);
              if (!table) return;
              bindMutation.mutate({
                tableId: table.id,
                tableName: table.name,
                workspaceId: table.workspaceId,
                adminId: table.adminId,
              }, {
                onSuccess: () => {
                  void bindingQuery.refetch();
                },
              });
            }}
            disabled={hostedTablesQuery.isLoading || bindMutation.isPending}
          >
            <option value="">Select hosted table</option>
            {hostedTables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-1">
            <input
              value={newHostedTableName}
              onChange={(event) => setNewHostedTableName(event.target.value)}
              placeholder="New table"
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            />
            <Button
              size="icon-sm"
              variant="outline"
              disabled={!newHostedTableName.trim() || createHostedTableMutation.isPending}
              onClick={() => createHostedTableMutation.mutate(newHostedTableName.trim())}
              aria-label="Create hosted table"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {selectedBinding?.tableName ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Bound: {selectedBinding.tableName}
            </p>
          ) : null}
        </div>
        <TableList
          tables={tables}
          selected={selectedTable}
          onSelect={handleSelectTable}
          loading={tablesQuery.isLoading || tablesQuery.isFetching}
          onRefresh={() => tablesQuery.refetch()}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "table" | "query")}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border px-4">
            <TabsList className="h-10 bg-transparent p-0 gap-4">
              <TabsTrigger
                value="table"
                className="h-10 rounded-none border-b-2 border-transparent px-0 pb-0 data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                Table View
              </TabsTrigger>
              <TabsTrigger
                value="query"
                className="h-10 rounded-none border-b-2 border-transparent px-0 pb-0 data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                SQL Query
              </TabsTrigger>
            </TabsList>
            {activeTab === "table" && selectedTable && (
              <span className="text-xs text-muted-foreground">
                Query Table
              </span>
            )}
          </div>

          <TabsContent value="table" className="flex-1 mt-0 overflow-hidden">
            <TableView
              data={tableDataQuery.data ?? null}
              loading={tableDataQuery.isLoading || tableDataQuery.isFetching}
              onPageChange={setOffset}
            />
          </TabsContent>

          <TabsContent value="query" className="flex-1 mt-0 overflow-hidden">
            <SqlQueryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
