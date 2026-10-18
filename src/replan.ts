import { alertSafeSlices, MIN_LEVERAGE, planSlices, slicesAbove, type Slice } from "@mutexa/ladder";
import { marginForLiq, type Tier } from "@mutexa/liq-math";
import type { TrackerRow } from "./rows";

/** The market data a re-plan needs. `HlMarket` from @mutexa/venue-adapters satisfies it. */
export type ReplanMarket = { name: string; maxLeverage: number; szDecimals: number; tiers: Tier[] };

export type ReplanOptions = {
  /** Your alert threshold, a USD position value. Sets the slice count. */
  threshold: number;
  /** Leverage stagger across slices, 0..1. */
  band?: number;
  /** Size variation across slices, 0..1. */
  sizeJitter?: number;
  seed?: number;
  /** Fewest slices; two is the least that makes a band. */
  minSlices?: number;
  maxSlices?: number;
};

/**
 * Band, size jitter, seed and the 12-slice cap are the values Mutexa's tracker page re-plans with; two slices is
 * the least that makes a band. They shape the picture; none of them is a recommendation.
 */
export const REPLAN_DEFAULTS: Readonly<Required<Omit<ReplanOptions, "threshold">>> = {
  band: 0.5,
  sizeJitter: 0.35,
  seed: 11,
  minSlices: 2,
  maxSlices: 12,
};

export type Replan = {
  coin: string;
  side: 1 | -1;
  notional: number;
  mark: number;
  /** What trackers see today: Hyperliquid's reported liquidation price (null when there is none). */
  reportedLiq: number | null;
  /** Leverage that gives one isolated position the same liquidation price; 1x when there is none. */
  effectiveLeverage: number;
  /**
   * True when that leverage is outside what an isolated position can use (below the ladder's minimum or above the
   * market's max), so the band cannot start exactly at today's price. Typical for cross positions whose
   * liquidation price is far away because the whole account backs them.
   */
  clamped: boolean;
  /** Slice count from the threshold, before the min/max clamp. */
  alertSafe: { slices: number; reachable: boolean };
  slices: Slice[];
  band: { near: number; far: number };
  totalMargin: number;
  blendedLeverage: number;
  largestSlice: number;
  slicesAboveThreshold: number;
};

/**
 * Re-plans one tracked position into isolated slices placed "beyond": the same notional at today's mark, the
 * effective leverage of the liquidation price Hyperliquid reports today, and no slice liquidating before it.
 * For cross positions that price depends on the whole account. The real position is not touched.
 */
export function replanPosition(row: TrackerRow, market: ReplanMarket, opts: ReplanOptions): Replan {
  if (!(opts.threshold > 0)) throw new RangeError("threshold must be a positive USD amount");
  const o = { ...REPLAN_DEFAULTS };
  for (const k of ["band", "sizeJitter", "seed", "minSlices", "maxSlices"] as const)
    if (opts[k] !== undefined) o[k] = opts[k] as never;
  const notional = row.value;
  let lev = 1;
  if (row.liq) {
    // leverage is measured at the same mark the margin is solved at, so the plan reproduces today's price
    const m = marginForLiq(row.side, row.mark, row.size, row.liq, market.tiers);
    lev = m > 0 ? (row.size * row.mark) / m : market.maxLeverage;
  }
  const effectiveLeverage = Math.min(Math.max(lev, MIN_LEVERAGE), market.maxLeverage);
  const clamped = effectiveLeverage !== lev;
  const alertSafe = alertSafeSlices(notional, opts.threshold, { max: o.maxSlices });
  const n = Math.min(o.maxSlices, Math.max(o.minSlices, alertSafe.slices));
  const plan = planSlices({
    side: row.side,
    entry: row.mark,
    notional,
    leverage: effectiveLeverage,
    slices: n,
    band: o.band,
    sizeJitter: o.sizeJitter,
    placement: "beyond",
    seed: o.seed,
    tiers: market.tiers,
    szDecimals: market.szDecimals,
  });
  const notionals = plan.slices.map((s) => s.notional);
  return {
    coin: row.coin,
    side: row.side,
    notional,
    mark: row.mark,
    reportedLiq: row.liq,
    effectiveLeverage,
    clamped,
    alertSafe,
    slices: plan.slices,
    band: plan.band,
    totalMargin: plan.totalMargin,
    blendedLeverage: plan.blendedLeverage,
    largestSlice: Math.max(...notionals),
    slicesAboveThreshold: slicesAbove(notionals, opts.threshold),
  };
}
