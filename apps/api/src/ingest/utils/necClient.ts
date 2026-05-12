// Generic paginated fetcher for data.go.kr (apis.data.go.kr/9760000) endpoints
// served by 중앙선거관리위원회 (NEC).
//
// Authentication: 일반인증키 via `serviceKey=` query param.
//   - The key from data.go.kr is already URL-encoded (contains %2B, %3D etc).
//   - We DO NOT use URLSearchParams here because URLSearchParams would
//     re-encode `%2B` into `%252B`, breaking the key. We build the query string
//     manually instead.
//
// Response shape (with &resultType=json):
//   {
//     response: {
//       header: { resultCode, resultMsg },
//       body: {
//         pageNo, numOfRows, totalCount,
//         items: { item: [...] | {...} }   // single object when totalCount == 1
//       }
//     }
//   }
//
// Error responses are sometimes XML (`<OpenAPI_ServiceResponse>...`) or plain
// text like "Unauthorized" — we detect those and throw with a useful message.

const DEFAULT_BASE_URL = "http://apis.data.go.kr/9760000";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DELAY_MS = 500;

export interface FetchAllNecPagesOptions {
  pageSize?: number;
  maxPages?: number;
  delayMs?: number;
  /**
   * Override the data.go.kr base URL (default "http://apis.data.go.kr/9760000").
   * Set this when calling endpoints under different provider IDs, e.g.
   * "http://apis.data.go.kr/1051000" for 기획재정부 or
   * "http://apis.data.go.kr/1741000" for 행정안전부/지방재정365.
   */
  baseUrl?: string;
  /**
   * Override the service key. Defaults to process.env.NEC_API_KEY.
   * Useful for budget endpoints that may use FISCAL_API_KEY but accept the
   * same data.go.kr 일반인증키 format.
   */
  serviceKey?: string;
}

interface NecResponseEnvelope<T> {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      pageNo?: number | string;
      numOfRows?: number | string;
      totalCount?: number | string;
      items?: { item?: T | T[] } | "" | null;
    };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a query string manually. The serviceKey is inserted verbatim (already
 * URL-encoded). Other params are encoded via encodeURIComponent.
 */
function buildQueryString(
  rawServiceKey: string,
  params: Record<string, string>,
): string {
  const parts: string[] = [`serviceKey=${rawServiceKey}`];
  for (const [k, v] of Object.entries(params)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.join("&");
}

async function fetchPage<T>(url: string): Promise<NecResponseEnvelope<T>> {
  const response = await fetch(url);
  const text = await response.text();

  // Detect plain-text "Unauthorized" or HTML/XML error responses up front.
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    // XML error envelope from data.go.kr looks like:
    // <OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>...
    const errMsgMatch = /<errMsg>([^<]+)<\/errMsg>/.exec(text);
    const reasonMatch = /<returnAuthMsg>([^<]+)<\/returnAuthMsg>/.exec(text);
    const codeMatch = /<returnReasonCode>([^<]+)<\/returnReasonCode>/.exec(text);
    const detail = [errMsgMatch?.[1], reasonMatch?.[1], codeMatch?.[1]]
      .filter(Boolean)
      .join(" / ");
    throw new Error(
      `data.go.kr returned an XML error response${detail ? `: ${detail}` : ""}. ` +
        `HTTP ${response.status}.`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`,
    );
  }
  if (trimmed.toLowerCase().startsWith("unauthorized")) {
    throw new Error(
      "data.go.kr returned 'Unauthorized'. Check NEC_API_KEY (must be the " +
        "일반인증키 in its URL-encoded form, with %2B / %3D intact).",
    );
  }

  try {
    return JSON.parse(text) as NecResponseEnvelope<T>;
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from data.go.kr: ${
        (err as Error).message
      }. Body starts with: ${text.slice(0, 200)}`,
    );
  }
}

function extractItems<T>(envelope: NecResponseEnvelope<T>): {
  items: T[];
  totalCount: number;
  resultCode: string | undefined;
  resultMsg: string | undefined;
} {
  const body = envelope.response?.body;
  const header = envelope.response?.header;
  const resultCode = header?.resultCode;
  const resultMsg = header?.resultMsg;

  let items: T[] = [];
  const itemContainer = body?.items;
  if (itemContainer && typeof itemContainer === "object" && "item" in itemContainer) {
    const raw = itemContainer.item;
    if (Array.isArray(raw)) {
      items = raw;
    } else if (raw != null) {
      // Single-object form when totalCount == 1
      items = [raw as T];
    }
  }

  let totalCount = 0;
  if (body?.totalCount != null) {
    const parsed = typeof body.totalCount === "string"
      ? parseInt(body.totalCount, 10)
      : body.totalCount;
    if (Number.isFinite(parsed)) totalCount = parsed;
  }

  return { items, totalCount, resultCode, resultMsg };
}

/**
 * Fetch all pages from a data.go.kr 9760000 (NEC) endpoint.
 *
 * Builds URL like:
 *   http://apis.data.go.kr/9760000/{servicePath}/{serviceMethod}
 *     ?serviceKey={raw}&resultType=json&pageNo=N&numOfRows=100&...params
 *
 * Pagination stops when totalCount is reached, or when an empty page is
 * returned, or when maxPages is hit.
 */
export async function fetchAllNecPages<T>(
  servicePath: string,
  serviceMethod: string,
  params: Record<string, string>,
  opts: FetchAllNecPagesOptions = {},
): Promise<T[]> {
  const rawKey =
    opts.serviceKey && opts.serviceKey.trim() !== ""
      ? opts.serviceKey
      : process.env.NEC_API_KEY;
  if (!rawKey || rawKey.trim() === "") {
    throw new Error(
      "NEC_API_KEY (or override serviceKey) is not set. Register an " +
        "일반인증키 at https://data.go.kr and export it (URL-encoded form, " +
        "e.g. with %2B / %3D).",
    );
  }

  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = opts.maxPages ?? 1000;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  const collected: T[] = [];
  let pageNo = 1;
  let totalCount = Infinity;

  while (pageNo <= maxPages && collected.length < totalCount) {
    const query = buildQueryString(rawKey, {
      resultType: "json",
      pageNo: String(pageNo),
      numOfRows: String(pageSize),
      ...params,
    });
    const url = `${baseUrl}/${servicePath}/${serviceMethod}?${query}`;

    const envelope = await fetchPage<T>(url);
    const { items, totalCount: pageTotal, resultCode, resultMsg } =
      extractItems(envelope);

    if (resultCode && resultCode !== "00" && resultCode !== "INFO-00") {
      // "INFO-200" or similar may indicate "no data"; treat as empty.
      if (resultCode === "INFO-200" || resultMsg?.includes("NODATA")) {
        break;
      }
      throw new Error(
        `data.go.kr API error (resultCode=${resultCode}, msg=${resultMsg ?? "?"}) ` +
          `for ${servicePath}/${serviceMethod}`,
      );
    }

    if (pageTotal > 0) totalCount = pageTotal;

    if (items.length === 0) break;

    collected.push(...items);
    pageNo += 1;

    if (collected.length < totalCount && pageNo <= maxPages) {
      await sleep(delayMs);
    }
  }

  return collected;
}
