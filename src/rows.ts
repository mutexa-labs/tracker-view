import type { HlAllMids, HlClearinghouseState } from "@mutexa/venue-adapters";

/** One open position the way a public tracker shows it. */
export type TrackerRow = {
  coin: string;
  side: 1 | -1;
  /** Absolute size in coins. */
  size: number;
  /** Position value in USD at Hyperliquid's mark. */
  value: number;
  lev: number;
  cross: boolean;
  entry: number;
  /** Mid price from allMids when given, otherwise value / size. */
  mark: number;
  /** Hyperliquid's reported liquidation price, or null when it reports none. */
  liq: number | null;
  /** Fraction of the mark between mark and liquidation, positive while safe; null without a liquidation price. */
  distance: number | null;
  pnl: number;
};

/** Open positions sorted by closest liquidation first; positions without a liquidation price last. */
export function trackerRows(st: HlClearinghouseState, mids: HlAllMids | null): TrackerRow[] {
  return st.assetPositions
    .filter((p) => Number(p.position.szi) !== 0)
    .map(({ position: p }) => {
      const size = Number(p.szi);
      const side = (size > 0 ? 1 : -1) as 1 | -1;
      const value = Number(p.positionValue);
      const mark = Number(mids?.[p.coin]) || value / Math.abs(size);
      const liq = Number(p.liquidationPx) > 0 ? Number(p.liquidationPx) : null;
      return {
        coin: p.coin,
        side,
        size: Math.abs(size),
        value,
        lev: p.leverage.value,
        cross: p.leverage.type === "cross",
        entry: Number(p.entryPx),
        mark,
        liq,
        distance: liq ? (side * (mark - liq)) / mark : null,
        pnl: Number(p.unrealizedPnl),
      };
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

export type FlaggedRow = TrackerRow & { overThreshold: boolean };

export type AccountSummary = {
  accountValue: number;
  positions: number;
  /** Sum of position values. */
  exposure: number;
  /** Positions whose value is above the threshold. */
  overThreshold: number;
  threshold: number;
};

/** Flags rows above the caller's alert threshold (a USD position value) and sums the account. */
export function flagRows(
  st: HlClearinghouseState,
  rows: TrackerRow[],
  threshold: number,
): { rows: FlaggedRow[]; summary: AccountSummary } {
  if (!(threshold > 0)) throw new RangeError("threshold must be a positive USD amount");
  const flagged = rows.map((r) => ({ ...r, overThreshold: r.value > threshold }));
  return {
    rows: flagged,
    summary: {
      accountValue: Number(st.marginSummary?.accountValue ?? NaN),
      positions: rows.length,
      exposure: rows.reduce((a, r) => a + r.value, 0),
      overThreshold: flagged.filter((r) => r.overThreshold).length,
      threshold,
    },
  };
}
