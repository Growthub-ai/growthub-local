/** Client-side table/list pagination (no server round-trip). */

export type ClientPageSize = 10 | 15 | 25 | 50 | "all";

export const CLIENT_PAGE_SIZE_OPTIONS: readonly ClientPageSize[] = [10, 15, 25, 50, "all"];

export function getClientPaginationSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: ClientPageSize,
): {
  slice: T[];
  pageCount: number;
  safePage: number;
  total: number;
  startIdx: number;
  endIdx: number;
} {
  const total = items.length;
  if (pageSize === "all") {
    return {
      slice: [...items],
      pageCount: 1,
      safePage: 0,
      total,
      startIdx: 0,
      endIdx: total,
    };
  }
  const pageCount = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const startIdx = safePage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  return {
    slice: items.slice(startIdx, endIdx),
    pageCount,
    safePage,
    total,
    startIdx,
    endIdx,
  };
}
