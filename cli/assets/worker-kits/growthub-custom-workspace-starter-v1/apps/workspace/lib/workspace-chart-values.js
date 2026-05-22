/**
 * Pure chart value computation.
 *
 * Responsibility:
 *   Convert normalized rows (Data Model object rows or hydrated sidecar
 *   source records) into the `number[]` projection persisted on
 *   `widget.config.values`. The chart renderer remains dumb — it reads
 *   `widget.config.values` and renders. This module is the only path that
 *   produces those values from row data.
 *
 * Authority boundary:
 *   - No browser fetch.
 *   - No provider logic.
 *   - No schema mutation.
 *   - No secrets read or written.
 *   - Never throws on user-supplied axis/filter combinations — invalid
 *     inputs return `values: []` plus structured `warnings[]`.
 *
 * Contract:
 *   computeChartValuesFromRows({ rows, xAxis, yAxis, filter, chartType })
 *     → { values: number[], rowCount: number, usedRowCount: number, warnings: string[] }
 */

const KNOWN_AGGREGATIONS = ["sum", "avg", "count", "min", "max"];
const DEFAULT_AGGREGATION = "sum";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coerceNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function fieldHasNumericValue(rows, field) {
  if (!field) return false;
  for (const row of rows) {
    if (coerceNumber(row?.[field]) !== null) return true;
  }
  return false;
}

function compareFilterValue(left, right, operator) {
  const op = String(operator || "eq");
  if (op === "isEmpty") return left === undefined || left === null || left === "";
  if (op === "isNotEmpty") return !(left === undefined || left === null || left === "");
  const ln = coerceNumber(left);
  const rn = coerceNumber(right);
  if (op === "gt") return ln !== null && rn !== null && ln > rn;
  if (op === "lt") return ln !== null && rn !== null && ln < rn;
  const ls = left === undefined || left === null ? "" : String(left);
  const rs = right === undefined || right === null ? "" : String(right);
  if (op === "eq") return ls === rs;
  if (op === "ne") return ls !== rs;
  if (op === "contains") return ls.toLowerCase().includes(rs.toLowerCase());
  return false;
}

function applyFilter(rows, filter) {
  if (!isPlainObject(filter) || !Array.isArray(filter.clauses) || filter.clauses.length === 0) {
    return rows;
  }
  const op = filter.op === "or" ? "or" : "and";
  return rows.filter((row) => {
    const decisions = filter.clauses.map((clause) => {
      if (!isPlainObject(clause)) return true;
      const field = String(clause.fieldId || "").trim();
      if (!field) return true;
      const left = row?.[field];
      return compareFilterValue(left, clause.value, clause.operator);
    });
    return op === "or" ? decisions.some(Boolean) : decisions.every(Boolean);
  });
}

function aggregateValues(numbers, aggregation) {
  if (!numbers.length) return null;
  const agg = KNOWN_AGGREGATIONS.includes(aggregation) ? aggregation : DEFAULT_AGGREGATION;
  if (agg === "count") return numbers.length;
  if (agg === "min") return numbers.reduce((acc, value) => (value < acc ? value : acc), numbers[0]);
  if (agg === "max") return numbers.reduce((acc, value) => (value > acc ? value : acc), numbers[0]);
  const sum = numbers.reduce((acc, value) => acc + value, 0);
  if (agg === "avg") return sum / numbers.length;
  return sum;
}

function groupRows(rows, field) {
  if (!field) return null;
  const groups = new Map();
  const order = [];
  for (const row of rows) {
    const rawKey = row?.[field];
    const key = rawKey === undefined || rawKey === null ? "" : String(rawKey);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(row);
  }
  return { order, groups };
}

function sortGroups(order, valuesByKey, direction) {
  const dir = direction === "desc" ? "desc" : direction === "asc" ? "asc" : "position";
  if (dir === "position") return order;
  const sorted = [...order];
  sorted.sort((a, b) => {
    const va = valuesByKey.get(a);
    const vb = valuesByKey.get(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return dir === "desc" ? vb - va : va - vb;
  });
  return sorted;
}

function omitZeroIfRequested(pairs, omitZero) {
  if (!omitZero) return pairs;
  return pairs.filter(([, value]) => value !== 0);
}

/**
 * Compute the chart `values: number[]` projection from rows.
 *
 * - When `chartType === "count"` or `yAxis.aggregation === "count"`, every row
 *   in a bucket contributes 1 — the Y field is ignored entirely because
 *   counting is about row presence, not row values. A non-numeric Y field is
 *   therefore valid under count.
 * - When the Y field is non-numeric and the aggregation needs numbers,
 *   the result is `values: []` plus a warning — never a throw.
 * - When `yAxis.groupBy` is set, rows group on that key first; otherwise
 *   `xAxis.field` (if present) acts as the bucket key; otherwise every
 *   row contributes a single bucket.
 */
function computeChartValuesFromRows({
  rows,
  xAxis,
  yAxis,
  filter,
  chartType
} = {}) {
  const debug = computeChartProjectionDebug({ rows, xAxis, yAxis, filter, chartType });
  return {
    values: debug.values,
    rowCount: debug.rowCount,
    usedRowCount: debug.usedRowCount,
    warnings: debug.warnings
  };
}

/**
 * Same computation as `computeChartValuesFromRows`, but also returns the
 * intermediate steps so the Chart Hydration Inspector can show why each
 * value exists.
 *
 * The returned shape includes:
 *   - `samples`: first N source rows (preview only)
 *   - `filteredCount` and `droppedByFilter`
 *   - `buckets`: per-group breakdown ({ key, rowCount, numericCount, value, reason })
 *   - `droppedRows`: per-row drop reasons after filtering ("non-numeric-y",
 *     "missing-y", "filter-removed", "zero-omitted")
 *   - `values`: final number[] persisted on widget.config.values
 *
 * Pure: no fetch, no provider logic, no schema mutation.
 */
function computeChartProjectionDebug({
  rows,
  xAxis,
  yAxis,
  filter,
  chartType
} = {}) {
  const warnings = [];
  const safeRows = Array.isArray(rows) ? rows.filter(isPlainObject) : [];
  const rowCount = safeRows.length;
  const samples = safeRows.slice(0, 5);
  if (!rowCount) {
    if (rows !== undefined && rows !== null) {
      warnings.push("No rows available from the selected source.");
    }
    return {
      values: [],
      rowCount: 0,
      usedRowCount: 0,
      filteredCount: 0,
      droppedByFilter: 0,
      buckets: [],
      droppedRows: [],
      samples,
      warnings
    };
  }

  const filtered = applyFilter(safeRows, filter);
  const droppedByFilter = rowCount - filtered.length;
  if (!filtered.length) {
    warnings.push("Filter clauses removed every row.");
    return {
      values: [],
      rowCount,
      usedRowCount: 0,
      filteredCount: 0,
      droppedByFilter,
      buckets: [],
      droppedRows: [],
      samples,
      warnings
    };
  }

  const xField = isPlainObject(xAxis) && typeof xAxis.field === "string" ? xAxis.field.trim() : "";
  const yField = isPlainObject(yAxis) && typeof yAxis.field === "string" ? yAxis.field.trim() : "";
  const groupField = isPlainObject(yAxis) && typeof yAxis.groupBy === "string" ? yAxis.groupBy.trim() : "";
  const aggregation = isPlainObject(yAxis) && typeof yAxis.aggregation === "string"
    ? yAxis.aggregation.trim()
    : DEFAULT_AGGREGATION;
  const omitZero = isPlainObject(xAxis) ? Boolean(xAxis.omitZero) : false;
  const sortDirection = isPlainObject(xAxis) && typeof xAxis.sort === "string" ? xAxis.sort : "position";
  const chartKind = typeof chartType === "string" ? chartType : "";
  const isCountAggregation = aggregation === "count" || chartKind === "count";

  if (!yField && !isCountAggregation) {
    warnings.push("Choose a Y axis field or switch aggregation to count.");
    return {
      values: [],
      rowCount,
      usedRowCount: 0,
      filteredCount: filtered.length,
      droppedByFilter,
      buckets: [],
      droppedRows: [],
      samples,
      warnings
    };
  }

  // Count aggregation never needs numeric Y values — a row exists, so it
  // contributes 1. Other aggregations require at least one numeric Y value
  // somewhere in the filtered set; if every Y value is non-numeric the
  // computation has nothing to aggregate and we return early with a warning.
  if (yField && !isCountAggregation && !fieldHasNumericValue(filtered, yField)) {
    warnings.push(`Y field "${yField}" has no numeric values.`);
    return {
      values: [],
      rowCount,
      usedRowCount: 0,
      filteredCount: filtered.length,
      droppedByFilter,
      buckets: [],
      droppedRows: filtered.slice(0, 5).map((row) => ({ row, reason: "non-numeric-y" })),
      samples,
      warnings
    };
  }

  const bucketField = groupField || xField || "";
  const grouped = bucketField ? groupRows(filtered, bucketField) : null;
  const droppedRows = [];

  const numericFor = (rowsForBucket) => {
    if (isCountAggregation) {
      // Count is row-presence: every row in the bucket contributes 1,
      // regardless of whether a Y field is selected or numeric.
      return rowsForBucket.map(() => 1);
    }
    const numbers = [];
    for (const row of rowsForBucket) {
      const coerced = coerceNumber(row?.[yField]);
      if (coerced === null) {
        droppedRows.push({ row, reason: row?.[yField] === undefined || row?.[yField] === null || row?.[yField] === "" ? "missing-y" : "non-numeric-y" });
        continue;
      }
      numbers.push(coerced);
    }
    return numbers;
  };

  const buckets = [];
  let pairs;
  if (!grouped) {
    const numbers = numericFor(filtered);
    if (!numbers.length && !isCountAggregation) {
      warnings.push("No numeric values found.");
      return {
        values: [],
        rowCount,
        usedRowCount: filtered.length,
        filteredCount: filtered.length,
        droppedByFilter,
        buckets: [],
        droppedRows,
        samples,
        warnings
      };
    }
    const aggregated = aggregateValues(numbers, aggregation);
    buckets.push({ key: "", rowCount: filtered.length, numericCount: numbers.length, value: aggregated });
    pairs = aggregated === null ? [] : [["", aggregated]];
  } else {
    const computed = new Map();
    for (const key of grouped.order) {
      const bucketRows = grouped.groups.get(key) || [];
      const numbers = numericFor(bucketRows);
      let value;
      if (!numbers.length && !isCountAggregation) {
        computed.set(key, null);
        value = null;
      } else {
        value = aggregateValues(numbers, aggregation);
        computed.set(key, value);
      }
      buckets.push({ key, rowCount: bucketRows.length, numericCount: numbers.length, value });
    }
    const ordered = sortGroups(grouped.order, computed, sortDirection);
    pairs = ordered
      .map((key) => [key, computed.get(key)])
      .filter(([, value]) => value !== null && Number.isFinite(value));
  }

  if (omitZero) {
    for (const [key, value] of pairs) {
      if (value === 0) droppedRows.push({ key, reason: "zero-omitted" });
    }
  }
  pairs = omitZeroIfRequested(pairs, omitZero);
  const values = pairs.map(([, value]) => value).filter((value) => Number.isFinite(value));

  if (!values.length) {
    warnings.push("Computation produced no finite values.");
  }

  return {
    values,
    rowCount,
    usedRowCount: filtered.length,
    filteredCount: filtered.length,
    droppedByFilter,
    buckets,
    droppedRows,
    samples,
    warnings
  };
}

/**
 * Derive a single status code the UI can render as a chip.
 *
 * Inputs:
 *   - widget:           the chart widget
 *   - table:            the bound Data Model table (or null)
 *   - computation:      a `computeChartProjectionDebug` result
 *   - lastSavedValues:  the values that were last persisted to disk
 *   - sourceFetchedAt:  ISO timestamp of the last refresh, if any
 *   - readOnlySave:     true when the runtime persistence is read-only
 *
 * Returns one of:
 *   "static" | "unbound" | "needs-source" | "needs-axis" | "warnings"
 *   "unsaved" | "stale-source" | "read-only-save-blocked" | "computed"
 */
function deriveChartHydrationState({
  widget,
  table,
  computation,
  lastSavedValues,
  sourceFetchedAt,
  readOnlySave
} = {}) {
  const binding = widget?.config?.binding;
  if (binding?.sourceType !== "workspace-data-model" || !binding.objectId) {
    return Array.isArray(widget?.config?.values) && widget.config.values.length ? "static" : "unbound";
  }
  if (!table) return "needs-source";
  const yField = isPlainObject(widget?.config?.yAxis) ? widget.config.yAxis.field : "";
  const xField = isPlainObject(widget?.config?.xAxis) ? widget.config.xAxis.field : "";
  const aggregation = isPlainObject(widget?.config?.yAxis) ? widget.config.yAxis.aggregation : "";
  const isCount = aggregation === "count" || widget?.config?.chartType === "count";
  if (!isCount && !yField) return "needs-axis";
  if (!isCount && !xField) return "needs-axis";
  if (computation?.warnings?.length) return "warnings";
  const current = Array.isArray(widget?.config?.values) ? widget.config.values : [];
  const saved = Array.isArray(lastSavedValues) ? lastSavedValues : current;
  const valuesDiffer = current.length !== saved.length || current.some((value, index) => value !== saved[index]);
  if (valuesDiffer && readOnlySave) return "read-only-save-blocked";
  if (valuesDiffer) return "unsaved";
  if (sourceFetchedAt && table.liveSource?.fetchedAt && sourceFetchedAt !== table.liveSource.fetchedAt) {
    return "stale-source";
  }
  return "computed";
}

export {
  applyFilter,
  aggregateValues,
  coerceNumber,
  computeChartProjectionDebug,
  computeChartValuesFromRows,
  deriveChartHydrationState,
  groupRows
};
