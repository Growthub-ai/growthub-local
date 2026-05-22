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
 * - When `chartType === "count"` or `yAxis.aggregation === "count"`, the
 *   numeric Y field is optional; otherwise every produced bucket requires
 *   at least one numeric Y value.
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
  const warnings = [];
  const safeRows = Array.isArray(rows) ? rows.filter(isPlainObject) : [];
  const rowCount = safeRows.length;
  if (!rowCount) {
    if (rows !== undefined && rows !== null) {
      warnings.push("No rows available from the selected source.");
    }
    return { values: [], rowCount: 0, usedRowCount: 0, warnings };
  }

  const filtered = applyFilter(safeRows, filter);
  if (!filtered.length) {
    warnings.push("Filter clauses removed every row.");
    return { values: [], rowCount, usedRowCount: 0, warnings };
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
    return { values: [], rowCount, usedRowCount: 0, warnings };
  }

  if (yField && !isCountAggregation && !fieldHasNumericValue(filtered, yField)) {
    warnings.push(`Y field "${yField}" has no numeric values.`);
    return { values: [], rowCount, usedRowCount: 0, warnings };
  }

  const bucketField = groupField || xField || "";
  const grouped = bucketField ? groupRows(filtered, bucketField) : null;

  const numericFor = (rowsForBucket) => {
    if (isCountAggregation && !yField) return rowsForBucket.map(() => 1);
    return rowsForBucket
      .map((row) => coerceNumber(row?.[yField]))
      .filter((value) => value !== null);
  };

  let pairs;
  if (!grouped) {
    const numbers = numericFor(filtered);
    if (!numbers.length && !isCountAggregation) {
      warnings.push("No numeric values found.");
      return { values: [], rowCount, usedRowCount: 0, warnings };
    }
    const aggregated = aggregateValues(numbers, aggregation);
    pairs = aggregated === null ? [] : [["", aggregated]];
  } else {
    const computed = new Map();
    for (const key of grouped.order) {
      const numbers = numericFor(grouped.groups.get(key) || []);
      if (!numbers.length && !isCountAggregation) {
        computed.set(key, null);
        continue;
      }
      computed.set(key, aggregateValues(numbers, aggregation));
    }
    const ordered = sortGroups(grouped.order, computed, sortDirection);
    pairs = ordered
      .map((key) => [key, computed.get(key)])
      .filter(([, value]) => value !== null && Number.isFinite(value));
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
    warnings
  };
}

export {
  applyFilter,
  aggregateValues,
  coerceNumber,
  computeChartValuesFromRows,
  groupRows
};
