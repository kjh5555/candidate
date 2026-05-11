// Generic paginated fetcher for 열린국회정보 OpenAPI.
// Handles the nested response shape:
// { [serviceId]: [ { head: [...] }, { row: [...] } ] }

export interface FetchAllPagesOptions {
  pageSize?: number;
  maxPages?: number;
  delayMs?: number;
}

interface HeadResultBlock {
  RESULT?: { CODE?: string; MESSAGE?: string };
}

interface HeadBlock {
  head?: Array<{ list_total_count?: number } | HeadResultBlock>;
}

interface RowBlock<T> {
  row?: T[];
}

type ServiceResponseEntry<T> = HeadBlock | RowBlock<T>;

type ApiResponse<T> = Record<string, ServiceResponseEntry<T>[] | unknown>;

const BASE_URL = "https://open.assembly.go.kr/portal/openapi";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(
  serviceId: string,
  apiKey: string,
  pageIndex: number,
  pageSize: number,
  extraParams: Record<string, string>,
): string {
  const params = new URLSearchParams({
    KEY: apiKey,
    Type: "json",
    pIndex: String(pageIndex),
    pSize: String(pageSize),
    ...extraParams,
  });
  return `${BASE_URL}/${serviceId}?${params.toString()}`;
}

async function fetchOnce<T>(url: string): Promise<ApiResponse<T>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  const data = (await response.json()) as ApiResponse<T>;
  return data;
}

async function fetchWithRetry<T>(url: string): Promise<ApiResponse<T>> {
  try {
    return await fetchOnce<T>(url);
  } catch (err) {
    // Retry once on network/parse error
    await sleep(1000);
    return await fetchOnce<T>(url);
  }
}

function extractPayload<T>(
  data: ApiResponse<T>,
  serviceId: string,
): { rows: T[]; total: number; resultCode: string | undefined } {
  const block = data[serviceId];
  if (!Array.isArray(block)) {
    // Some error responses use a top-level RESULT object
    const resultCode =
      typeof data.RESULT === "object" &&
      data.RESULT !== null &&
      "CODE" in (data.RESULT as Record<string, unknown>)
        ? String((data.RESULT as Record<string, unknown>).CODE)
        : undefined;
    return { rows: [], total: 0, resultCode };
  }

  let total = 0;
  let resultCode: string | undefined;
  let rows: T[] = [];

  for (const entry of block) {
    if (entry && typeof entry === "object" && "head" in entry && Array.isArray(entry.head)) {
      for (const headItem of entry.head) {
        if (headItem && typeof headItem === "object") {
          if ("list_total_count" in headItem && typeof headItem.list_total_count === "number") {
            total = headItem.list_total_count;
          }
          if (
            "RESULT" in headItem &&
            headItem.RESULT &&
            typeof headItem.RESULT === "object" &&
            "CODE" in headItem.RESULT
          ) {
            resultCode = String((headItem.RESULT as { CODE?: string }).CODE);
          }
        }
      }
    }
    if (entry && typeof entry === "object" && "row" in entry && Array.isArray(entry.row)) {
      rows = entry.row as T[];
    }
  }

  return { rows, total, resultCode };
}

/**
 * Fetch all pages from a National Assembly OpenAPI endpoint.
 * Auto-paginates until `list_total_count` is reached or no more rows are returned.
 */
export async function fetchAllPages<T>(
  serviceId: string,
  params: Record<string, string>,
  opts: FetchAllPagesOptions = {},
): Promise<T[]> {
  const apiKey = process.env.ASSEMBLY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASSEMBLY_API_KEY is not set. Get one from https://open.assembly.go.kr and export it.",
    );
  }

  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 1000;
  const delayMs = opts.delayMs ?? 500;

  const collected: T[] = [];
  let pageIndex = 1;
  let total = Infinity;

  while (pageIndex <= maxPages && collected.length < total) {
    const url = buildUrl(serviceId, apiKey, pageIndex, pageSize, params);
    const data = await fetchWithRetry<T>(url);
    const { rows, total: pageTotal, resultCode } = extractPayload<T>(data, serviceId);

    if (resultCode && resultCode !== "INFO-000") {
      // INFO-200: no data; treat as empty
      if (resultCode === "INFO-200") {
        break;
      }
      throw new Error(`API error (${resultCode}) for ${serviceId}`);
    }

    if (pageTotal > 0) {
      total = pageTotal;
    }

    if (rows.length === 0) {
      break;
    }

    collected.push(...rows);
    pageIndex += 1;

    if (collected.length < total && pageIndex <= maxPages) {
      await sleep(delayMs);
    }
  }

  return collected;
}
