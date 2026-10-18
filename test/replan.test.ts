import { alertSafeSlices } from "@mutexa/ladder";
import { liqPrice } from "@mutexa/liq-math";
import { describe, expect, it } from "vitest";
import { REPLAN_DEFAULTS, replanPosition, trackerRows } from "../src/index";
import { CROSS, markets, MIXED, mids, stateOf } from "./helpers/fixtures";

const market = (coin: string) => markets.find((m) => m.name === coin)!;
const rows = trackerRows(stateOf(MIXED), mids);
const iso = rows.find((r) => !r.cross)!;

describe("replanPosition", () => {
  it("uses the leverage that reproduces today's liquidation price on one isolated position", () => {
    const r = replanPosition(iso, market(iso.coin), { threshold: 1_000_000 });
    const m = market(iso.coin);
    expect(r.clamped).toBe(false);
    {
      const liq = liqPrice(iso.side, iso.mark, iso.size, (iso.size * iso.mark) / r.effectiveLeverage, m.tiers);
      expect(Math.abs(liq - iso.liq!) / iso.liq!).toBeLessThan(1e-9);
    }
  });

  it("never puts a slice closer to the mark than today's liquidation price", () => {
    let checked = 0;
    for (const row of rows.filter((r) => r.liq)) {
      const r = replanPosition(row, market(row.coin), { threshold: 250_000 });
      // sizes are rounded down to the market's step, so the total can only fall short by that rounding
      const sum = r.slices.reduce((a, s) => a + s.notional, 0);
      const step = 10 ** -market(row.coin).szDecimals * row.mark;
      expect(sum).toBeLessThanOrEqual(row.value * (1 + 1e-9));
      expect(row.value - sum).toBeLessThanOrEqual(r.slices.length * step + row.value * 1e-9);
      if (r.clamped) continue;
      checked++;
      for (const s of r.slices)
        expect(row.side * (row.mark - s.liq)).toBeGreaterThanOrEqual(row.side * (row.mark - row.liq!) * (1 - 1e-9));
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("flags a liquidation price an isolated position cannot reproduce", () => {
    // recorded cross shorts liquidate far above the mark: below the ladder's minimum leverage
    const far = rows
      .filter((r) => r.cross && r.liq)
      .map((r) => replanPosition(r, market(r.coin), { threshold: 250_000 }));
    expect(far.length).toBeGreaterThan(0);
    for (const r of far) if (r.clamped) expect(r.effectiveLeverage).toBe(0.2);
  });

  it("sets the slice count from the threshold, clamped to min and max", () => {
    const m = market(iso.coin);
    const t = iso.value / 3;
    const r = replanPosition(iso, m, { threshold: t });
    expect(r.alertSafe).toEqual(alertSafeSlices(iso.value, t, { max: REPLAN_DEFAULTS.maxSlices }));
    expect(r.slices).toHaveLength(Math.min(12, Math.max(2, r.alertSafe.slices)));
    expect(replanPosition(iso, m, { threshold: iso.value * 10 }).slices).toHaveLength(2);
    const tiny = replanPosition(iso, m, { threshold: iso.value / 1000 });
    expect(tiny.slices).toHaveLength(12);
    expect(tiny.alertSafe.reachable).toBe(false);
    expect(tiny.slicesAboveThreshold).toBeGreaterThan(0);
    expect(replanPosition(iso, m, { threshold: iso.value / 1000, maxSlices: 30 }).slices).toHaveLength(30);
  });

  it("plans at 1x when there is no liquidation price", () => {
    const row = trackerRows(stateOf(CROSS), mids).find(
      (r) => r.liq === null && markets.some((m) => m.name === r.coin),
    )!;
    const r = replanPosition(row, market(row.coin), { threshold: 100_000 });
    expect(r.reportedLiq).toBeNull();
    expect(r.effectiveLeverage).toBe(1);
  });

  it("is deterministic for a seed", () => {
    const a = replanPosition(iso, market(iso.coin), { threshold: 500_000, seed: 3 });
    const b = replanPosition(iso, market(iso.coin), { threshold: 500_000, seed: 3 });
    const c = replanPosition(iso, market(iso.coin), { threshold: 500_000, seed: 4 });
    expect(a).toEqual(b);
    expect(a.slices.map((s) => s.notional)).not.toEqual(c.slices.map((s) => s.notional));
  });

  it("has no default threshold", () => {
    expect(() => replanPosition(iso, market(iso.coin), { threshold: 0 })).toThrow(RangeError);
  });
});
