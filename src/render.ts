import { fmtLev, fmtNum, fmtPct, fmtPx, fmtUsd, shortAddr } from "./format";
import type { Replan } from "./replan";
import type { TrackerView } from "./view";
import type { AlertEvent } from "./watch";

function table(head: string[], rows: string[][], right: boolean[]): string {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) =>
    r
      .map((c, i) => (right[i] ? c.padStart(w[i]!) : c.padEnd(w[i]!)))
      .join("  ")
      .trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

/** The tracker view as plain text. */
export function renderView(v: TrackerView): string {
  const s = v.summary;
  const out: string[] = [];
  out.push(`Tracker view · ${shortAddr(v.address)} · Hyperliquid state at ${new Date(v.time).toISOString()}`);
  out.push(
    `Account value ${fmtUsd(s.accountValue, { compact: true })} · ${s.positions} open position${s.positions === 1 ? "" : "s"} · ` +
      `exposure ${fmtUsd(s.exposure, { compact: true })} · ${s.overThreshold} over your ${fmtUsd(s.threshold, { compact: true })} threshold`,
  );
  if (!v.positions.length) {
    out.push("", "No open perp positions: trackers show an empty account.");
    return out.join("\n") + "\n";
  }
  out.push("");
  out.push(
    table(
      ["MARKET", "SIDE", "SIZE", "VALUE", "LEV", "ENTRY", "MARK", "LIQ PRICE", "TO LIQ", "UPNL", ""],
      v.positions.map((r) => [
        r.coin,
        r.side === 1 ? "long" : "short",
        fmtNum(r.size),
        fmtUsd(r.value, { compact: true }),
        `${r.lev}x ${r.cross ? "cross" : "iso"}`,
        fmtPx(r.entry),
        fmtPx(r.mark),
        r.liq ? fmtPx(r.liq) : "none",
        r.distance === null ? "–" : r.distance > 9.99 ? ">999%" : fmtPct(r.distance, 1),
        fmtUsd(r.pnl, { compact: true }),
        r.overThreshold ? "OVER THRESHOLD" : "",
      ]),
      [false, false, true, true, true, true, true, true, true, true, false],
    ),
  );
  out.push("");
  out.push(
    "Sorted by closest liquidation. Liquidation prices as reported by Hyperliquid; for cross margin they depend on the",
    'whole account, and "none" means the position alone cannot be liquidated at any price.',
  );
  if (v.replans) {
    out.push(
      "",
      "Re-planned as isolated slices at today's mark, none liquidating before today's price where an isolated slice can reach it (nothing is changed):",
    );
    for (const r of v.replans) out.push("error" in r ? `  ${r.coin}: ${r.error}` : `  ${renderReplan(r)}`);
  }
  return out.join("\n") + "\n";
}

export function renderReplan(r: Replan): string {
  const today = r.reportedLiq
    ? `trackers see ${fmtPx(r.reportedLiq)} on one wallet`
    : "no liquidation price today, planned at 1x";
  const note = r.clamped
    ? ` (today's price needs ${r.effectiveLeverage <= 0.2 ? "less" : "more"} leverage than an isolated slice can use, so planned at ${fmtLev(r.effectiveLeverage)})`
    : "";
  return (
    `${r.coin} ${r.side === 1 ? "long" : "short"} ${fmtUsd(r.notional, { compact: true })}: ${today} -> ` +
    `${r.slices.length} slices, band ${fmtPx(r.band.near)} to ${fmtPx(r.band.far)}, largest ${fmtUsd(r.largestSlice, { compact: true })}, ` +
    `${r.slicesAboveThreshold} of ${r.slices.length} over threshold, ${fmtLev(r.blendedLeverage)} blended${note}`
  );
}

export function renderEvent(e: AlertEvent, at: string): string {
  const r = e.row;
  const pos = `${r.coin} ${r.side === 1 ? "long" : "short"}`;
  if (e.kind === "near")
    return `${at} NEAR  ${pos} is ${fmtPct(r.distance!, 2)} from its liquidation price ${fmtPx(r.liq!)} (mark ${fmtPx(r.mark)})`;
  return `${at} CLEAR ${pos} is back to ${r.distance === null ? "no liquidation price" : fmtPct(r.distance, 2) + " from liquidation"}`;
}
