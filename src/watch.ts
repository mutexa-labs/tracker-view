import type { TrackerRow } from "./rows";

export type AlertEvent = { kind: "near" | "clear"; row: TrackerRow };

/**
 * Hysteresis for liquidation alerts: a position raises "near" once its distance to liquidation is at or below
 * `alertFraction`, and "clear" once it moves back beyond 1.5 × `alertFraction` (or loses its liquidation price),
 * so a price hovering at the line does not alert on every poll. `alerted` holds the coins currently near.
 */
export function alertTransitions(
  alerted: ReadonlySet<string>,
  rows: readonly TrackerRow[],
  alertFraction: number,
): { events: AlertEvent[]; alerted: Set<string> } {
  if (!(alertFraction > 0)) throw new RangeError("alert distance must be a positive fraction");
  const next = new Set(alerted);
  const events: AlertEvent[] = [];
  const open = new Set(rows.map((r) => r.coin));
  for (const r of rows) {
    if (r.distance === null) {
      if (next.delete(r.coin)) events.push({ kind: "clear", row: r });
      continue;
    }
    if (r.distance <= alertFraction && !next.has(r.coin)) {
      next.add(r.coin);
      events.push({ kind: "near", row: r });
    } else if (r.distance > alertFraction * 1.5 && next.delete(r.coin)) events.push({ kind: "clear", row: r });
  }
  // a closed position is no longer near anything
  for (const c of [...next]) if (!open.has(c)) next.delete(c);
  return { events, alerted: next };
}
