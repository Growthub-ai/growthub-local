import { useEffect, useMemo, useState } from "react";
import { getClientPaginationSlice, type ClientPageSize } from "@/lib/client-pagination";

export function useClientPagination<T>(
  items: readonly T[],
  resetKey: string | number,
  options?: { defaultPageSize?: ClientPageSize },
) {
  const [pageSize, setPageSize] = useState<ClientPageSize>(options?.defaultPageSize ?? 15);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);

  const { slice, pageCount, safePage, total, startIdx, endIdx } = useMemo(
    () => getClientPaginationSlice(items, page, pageSize),
    [items, page, pageSize],
  );

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  return {
    pageSize,
    setPageSize,
    page: safePage,
    setPage,
    pageCount,
    slice,
    total,
    startIdx,
    endIdx,
  };
}
