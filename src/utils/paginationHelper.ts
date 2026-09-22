export interface PaginationParams {
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
  secondaryOrderBy?: string;
  secondaryAscending?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Applies server-side pagination and stable ordering to any Supabase query builder.
 * Enforces ORDER BY created_at DESC, id DESC by default to eliminate cursor jitter.
 */
export function applyPagination<T = any>(
  query: any,
  page: number = 1,
  pageSize: number = 10,
  options?: {
    orderBy?: string;
    ascending?: boolean;
    secondaryOrderBy?: string;
    secondaryAscending?: boolean;
  }
): any {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 10)));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const primaryCol = options?.orderBy || 'created_at';
  const primaryAsc = options?.ascending ?? false;
  const secondaryCol = options?.secondaryOrderBy || 'id';
  const secondaryAsc = options?.secondaryAscending ?? false;

  let paginatedQuery = query
    .order(primaryCol, { ascending: primaryAsc })
    .range(from, to);

  if (secondaryCol && secondaryCol !== primaryCol) {
    try {
      paginatedQuery = paginatedQuery.order(secondaryCol, { ascending: secondaryAsc });
    } catch (_) {}
  }

  return paginatedQuery;
}

/**
 * Helper to build a clean PaginatedResponse object from raw results.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number = 1,
  pageSize: number = 10
): PaginatedResponse<T> {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 10));
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));

  return {
    data: Array.isArray(data) ? data : [],
    total: safeTotal,
    page: safePage,
    pageSize: safePageSize,
    totalPages
  };
}
