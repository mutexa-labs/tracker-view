import { createHyperliquidAdapter, type HyperliquidAdapter, type HlMarket } from "@mutexa/venue-adapters";
import { replanPosition, type Replan, type ReplanOptions } from "./replan";
import { flagRows, trackerRows, type AccountSummary, type FlaggedRow } from "./rows";

/** The envelope every public read is returned in, shared with the Mutexa MCP server. */
export type Sourced<T> = { data: T; source: string; fetchedAt: string };

export type TrackerView = {
  address: string;
  /** Hyperliquid's state timestamp, ms. */
  time: number;
  summary: AccountSummary;
  positions: FlaggedRow[];
  /** Present when a re-plan was asked for; one entry per position, an error entry where the market is unknown. */
  replans?: (Replan | { coin: string; error: string })[];
};

export type TrackerViewOptions = {
  address: string;
  threshold: number;
  replan?: boolean | Omit<ReplanOptions, "threshold">;
  adapter?: Pick<HyperliquidAdapter, "state" | "mids" | "perpMarkets">;
  now?: () => number;
};

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Reads one address's public state and builds the tracker view (and re-plans, when asked). */
export async function trackerView(o: TrackerViewOptions): Promise<Sourced<TrackerView>> {
  if (!ADDRESS_RE.test(o.address)) throw new RangeError("address must be a 0x address (42 characters)");
  if (!(o.threshold > 0)) throw new RangeError("threshold must be a positive USD amount");
  const hl = o.adapter ?? createHyperliquidAdapter();
  const address = o.address.toLowerCase();
  const [st, mids, markets] = await Promise.all([
    hl.state(address),
    hl.mids(),
    o.replan ? hl.perpMarkets() : Promise.resolve(null as HlMarket[] | null),
  ]);
  const { rows, summary } = flagRows(st, trackerRows(st, mids), o.threshold);
  const view: TrackerView = { address, time: st.time, summary, positions: rows };
  const calls = ["clearinghouseState", "allMids"];
  if (markets) {
    calls.push("metaAndAssetCtxs");
    const byName = new Map(markets.map((m) => [m.name, m]));
    const extra = typeof o.replan === "object" ? o.replan : {};
    view.replans = rows.map((r) => {
      const m = byName.get(r.coin);
      if (!m) return { coin: r.coin, error: `${r.coin} is not in Hyperliquid's main perp list` };
      return replanPosition(r, m, { ...extra, threshold: o.threshold });
    });
  }
  return {
    data: view,
    source: `Hyperliquid public info API (${calls.join(", ")})`,
    fetchedAt: new Date((o.now ?? Date.now)()).toISOString(),
  };
}
