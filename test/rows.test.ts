import { describe, expect, it } from "vitest";
import { flagRows, trackerRows } from "../src/index";
import { CROSS, EMPTY, MIXED, mids, stateOf } from "./helpers/fixtures";

describe("trackerRows", () => {
  it("lists every open position, closest liquidation first, with no-liquidation positions last", () => {
    for (const a of [MIXED, CROSS]) {
      const st = stateOf(a);
      const rows = trackerRows(st, mids);
      expect(rows).toHaveLength(st.assetPositions.filter((p) => Number(p.position.szi) !== 0).length);
      const d = rows.map((r) => r.distance ?? Infinity);
      expect(d).toEqual([...d].sort((x, y) => x - y));
    }
    const cross = trackerRows(stateOf(CROSS), mids);
    expect(cross.filter((r) => r.liq === null).length).toBeGreaterThan(0);
    expect(cross.at(-1)!.distance).toBeNull();
  });

  it("reads side, margin mode, mark and distance from the raw state", () => {
    const rows = trackerRows(stateOf(MIXED), mids);
    const raw = stateOf(MIXED).assetPositions.find((p) => p.position.leverage.type === "isolated")!.position;
    const r = rows.find((x) => x.coin === raw.coin)!;
    expect(r.cross).toBe(false);
    expect(r.side).toBe(Number(raw.szi) > 0 ? 1 : -1);
    expect(r.size).toBe(Math.abs(Number(raw.szi)));
    expect(r.mark).toBe(Number(mids[raw.coin]));
    expect(r.liq).toBe(Number(raw.liquidationPx));
    expect(r.distance).toBeCloseTo((r.side * (r.mark - r.liq!)) / r.mark, 12);
    expect(r.distance).toBeGreaterThan(0);
  });

  it("falls back to value / size without mids", () => {
    const r = trackerRows(stateOf(MIXED), null)[0]!;
    expect(r.mark * r.size).toBeCloseTo(r.value, 6);
  });

  it("is empty for an account with no positions", () => {
    expect(trackerRows(stateOf(EMPTY), mids)).toEqual([]);
  });
});

describe("flagRows", () => {
  it("flags positions above the threshold and sums the account", () => {
    const st = stateOf(CROSS);
    const rows = trackerRows(st, mids);
    const threshold = rows[1]!.value; // a recorded value: the position itself is not "above" it
    const f = flagRows(st, rows, threshold);
    expect(f.summary.overThreshold).toBe(rows.filter((r) => r.value > threshold).length);
    expect(f.rows[1]!.overThreshold).toBe(false);
    expect(f.summary.exposure).toBeCloseTo(
      rows.reduce((a, r) => a + r.value, 0),
      6,
    );
    expect(f.summary.accountValue).toBe(Number(st.marginSummary.accountValue));
  });

  it("has no default threshold", () => {
    expect(() => flagRows(stateOf(CROSS), [], 0)).toThrow(RangeError);
    expect(() => flagRows(stateOf(CROSS), [], NaN)).toThrow(RangeError);
  });
});
