// localStorage region context for "내 지역" navigation.
//
// Key: `myRegion`
// Value: JSON-encoded { sido: string; wiwName: string } | null

const KEY = "myRegion";

export interface MyRegion {
  sido: string | null;
  wiwName: string | null;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getMyRegion(): MyRegion {
  if (!isBrowser()) return { sido: null, wiwName: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { sido: null, wiwName: null };
    const parsed = JSON.parse(raw) as Partial<{ sido: string; wiwName: string }>;
    const sido = typeof parsed.sido === "string" && parsed.sido.trim() !== "" ? parsed.sido : null;
    const wiwName =
      typeof parsed.wiwName === "string" && parsed.wiwName.trim() !== ""
        ? parsed.wiwName
        : null;
    return { sido, wiwName };
  } catch {
    return { sido: null, wiwName: null };
  }
}

export function setMyRegion(sido: string, wiwName: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ sido, wiwName }));
    // Notify listeners (same-tab) of the change.
    window.dispatchEvent(new CustomEvent("myRegionChange"));
  } catch {
    // best-effort — ignore quota / privacy mode errors
  }
}

export function clearMyRegion(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("myRegionChange"));
  } catch {
    // ignore
  }
}
