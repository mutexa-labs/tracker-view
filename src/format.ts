const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export function fmtUsd(v: number, opts: { compact?: boolean; cents?: boolean } = {}): string {
  if (!Number.isFinite(v)) return "–";
  if (Math.abs(v) < 0.005) v = 0;
  if (opts.compact && Math.abs(v) >= 10_000) return (v < 0 ? "-$" : "$") + compact.format(Math.abs(v));
  return (opts.cents || Math.abs(v) < 100 ? usd2 : usd0).format(v);
}

/** Price with significant digits that suit the magnitude (BTC vs kPEPE). */
export function fmtPx(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "–";
  const d =
    v >= 10_000
      ? 0
      : v >= 1_000
        ? 1
        : v >= 10
          ? 2
          : v >= 1
            ? 4
            : Math.min(8, Math.max(4, 2 - Math.floor(Math.log10(v)) + 3));
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtNum(v: number, max = 4): string {
  if (!Number.isFinite(v)) return "–";
  return v.toLocaleString("en-US", { maximumFractionDigits: max });
}

export function fmtPct(v: number, d = 2, sign = false): string {
  if (!Number.isFinite(v)) return "–";
  const s = (v * 100).toFixed(d) + "%";
  return sign && v > 0 ? "+" + s : s;
}

export function fmtLev(v: number): string {
  if (!Number.isFinite(v)) return "–";
  return (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + "x";
}

export function shortAddr(a: string): string {
  return a.slice(0, 6) + "…" + a.slice(-4);
}
