import { describe, expect, it } from "vitest";
import { alertTransitions, type TrackerRow } from "../src/index";

const row = (coin: string, distance: number | null): TrackerRow => ({
  coin,
  side: 1,
  size: 1,
  value: 1000,
  lev: 5,
  cross: false,
  entry: 100,
  mark: 100,
  liq: distance === null ? null : 100 * (1 - distance),
  distance,
  pnl: 0,
});

describe("alertTransitions", () => {
  it("alerts once on entering the zone and clears only past 1.5 times the distance", () => {
    let s = new Set<string>();
    const step = (d: number | null) => {
      const t = alertTransitions(s, [row("BTC", d)], 0.03);
      s = t.alerted;
      return t.events.map((e) => e.kind);
    };
    expect(step(0.1)).toEqual([]);
    expect(step(0.03)).toEqual(["near"]);
    expect(step(0.02)).toEqual([]);
    expect(step(0.04)).toEqual([]); // inside the hysteresis band
    expect(step(0.046)).toEqual(["clear"]);
    expect(step(0.01)).toEqual(["near"]);
    expect(step(null)).toEqual(["clear"]);
  });

  it("tracks coins independently and forgets closed positions", () => {
    let t = alertTransitions(new Set(), [row("BTC", 0.01), row("ETH", 0.5)], 0.03);
    expect(t.events.map((e) => e.row.coin)).toEqual(["BTC"]);
    t = alertTransitions(t.alerted, [row("ETH", 0.01)], 0.03);
    expect(t.events.map((e) => `${e.kind}:${e.row.coin}`)).toEqual(["near:ETH"]);
    expect([...t.alerted]).toEqual(["ETH"]);
  });

  it("has no default alert distance", () => {
    expect(() => alertTransitions(new Set(), [], 0)).toThrow(RangeError);
  });
});
