// Formatting helpers for budget amounts (원).
//
// Korean conventions:
//   1 만   = 10,000               (10^4)
//   1 억   = 100,000,000          (10^8)
//   1 조   = 1,000,000,000,000    (10^12)
//
// Inputs may be BigInt strings (the API serializes BigInt as string).
// We do the arithmetic on BigInt to avoid precision loss for very large
// national-budget totals (650+ trillion 원 ≈ 6.5×10^14).

const TEN_THOUSAND = 10000n;
const HUNDRED_MILLION = 100000000n;
const TRILLION = 1000000000000n;

function toBigInt(input: bigint | string | number): bigint {
  if (typeof input === "bigint") return input;
  if (typeof input === "number") return BigInt(Math.trunc(input));
  // string
  const cleaned = input.trim().replace(/[, ]+/g, "");
  if (!/^-?\d+$/.test(cleaned)) return 0n;
  return BigInt(cleaned);
}

function bigIntDivToFixed(numerator: bigint, denominator: bigint, decimals = 1): string {
  // Compute numerator / denominator with `decimals` decimal places using
  // BigInt arithmetic (multiply numerator by 10^decimals first).
  if (denominator === 0n) return "0";
  const scale = 10n ** BigInt(decimals);
  const sign = numerator < 0n !== denominator < 0n ? "-" : "";
  const abs = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const scaled = (abs * scale) / absDen;
  const intPart = scaled / scale;
  const fracPart = scaled % scale;
  if (decimals === 0) return `${sign}${intPart.toString()}`;
  const fracStr = fracPart.toString().padStart(decimals, "0");
  // Strip trailing zeros for nicer display but keep at least 1 digit.
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed === ""
    ? `${sign}${intPart.toString()}`
    : `${sign}${intPart.toString()}.${trimmed}`;
}

/**
 * Format a Korean-style amount with the largest applicable unit (조원 / 억원 /
 * 만원 / 원). e.g. 656_600_000_000_000n → "656.6조원".
 */
export function formatKoreanAmount(input: bigint | string | number): string {
  const v = toBigInt(input);
  const abs = v < 0n ? -v : v;
  if (abs >= TRILLION) {
    return `${bigIntDivToFixed(v, TRILLION, 1)}조원`;
  }
  if (abs >= HUNDRED_MILLION) {
    return `${bigIntDivToFixed(v, HUNDRED_MILLION, 1)}억원`;
  }
  if (abs >= TEN_THOUSAND) {
    return `${bigIntDivToFixed(v, TEN_THOUSAND, 0)}만원`;
  }
  return `${v.toString()}원`;
}

/** Format with commas for raw 원 display. */
export function formatWonComma(input: bigint | string | number): string {
  const v = toBigInt(input);
  return `${v.toLocaleString("ko-KR")}원`;
}

/** Format a percentage value with 1 decimal place. */
export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) return "0%";
  return `${percent.toFixed(1)}%`;
}

interface AmountProps {
  amount: string | bigint | number;
  unit?: "auto" | "조" | "억" | "만" | "원";
  className?: string;
}

/** Inline display component for an amount with Korean-style formatting. */
export function Amount({ amount, unit = "auto", className }: AmountProps) {
  if (unit === "auto") {
    return <span className={className}>{formatKoreanAmount(amount)}</span>;
  }
  const v = toBigInt(amount);
  let display: string;
  switch (unit) {
    case "조":
      display = `${bigIntDivToFixed(v, TRILLION, 2)}조원`;
      break;
    case "억":
      display = `${bigIntDivToFixed(v, HUNDRED_MILLION, 1)}억원`;
      break;
    case "만":
      display = `${bigIntDivToFixed(v, TEN_THOUSAND, 0)}만원`;
      break;
    case "원":
    default:
      display = formatWonComma(v);
      break;
  }
  return <span className={className}>{display}</span>;
}
