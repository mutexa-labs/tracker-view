import { describe, expect, it } from "vitest";
import { parseArgs, parseUsd, run, trackerView } from "../src/index";
import { createHyperliquidAdapter } from "@mutexa/venue-adapters";
import { CROSS, EMPTY, fakeFetch, MIXED, mids, stateOf } from "./helpers/fixtures";

const NOW = Date.parse("2026-10-18T00:00:00Z");

function io(fetch = fakeFetch()) {
  const t = { out: "", err: "" };
  return {
    t,
    io: {
      fetch,
      stdout: (s: string) => void (t.out += s),
      stderr: (s: string) => void (t.err += s),
      now: () => NOW,
      sleep: async () => {},
    },
  };
}

describe("tracker-view CLI", () => {
  it("prints the tracker table with flags over the threshold", async () => {
    const { t, io: x } = io();
    expect(await run([MIXED, "--threshold", "250k"], x)).toBe(0);
    expect(t.out).toContain("OVER THRESHOLD");
    expect(t.out).toMatchSnapshot();
  });

  it("re-plans every position into a band", async () => {
    const { t, io: x } = io();
    expect(await run([MIXED, "--threshold", "250000", "--replan"], x)).toBe(0);
    expect(t.out).toContain("Re-planned as isolated slices");
    expect(t.out).toMatchSnapshot();
  });

  it("shows positions without a liquidation price, and an empty account", async () => {
    const a = io();
    expect(await run([CROSS, "--threshold", "100k", "--replan"], a.io)).toBe(0);
    expect(a.t.out).toContain(" none ");
    expect(a.t.out).toMatchSnapshot();
    const b = io();
    expect(await run([EMPTY, "--threshold", "100k"], b.io)).toBe(0);
    expect(b.t.out).toContain("No open perp positions");
  });

  it("prints the same JSON the library and the MCP tool return", async () => {
    const { t, io: x } = io();
    expect(await run([MIXED, "--threshold", "250k", "--replan", "--json"], x)).toBe(0);
    const json = JSON.parse(t.out);
    const lib = await trackerView({
      address: MIXED,
      threshold: 250_000,
      replan: { band: undefined },
      adapter: createHyperliquidAdapter({ fetch: fakeFetch() }),
      now: () => NOW,
    });
    expect(json).toEqual(JSON.parse(JSON.stringify(lib)));
    expect(json.source).toBe("Hyperliquid public info API (clearinghouseState, allMids, metaAndAssetCtxs)");
    expect(json.fetchedAt).toBe("2026-10-18T00:00:00.000Z");
    expect(json.data.summary.threshold).toBe(250_000);
    expect(json.data.replans).toHaveLength(json.data.positions.length);
  });

  it("watches and prints a line when a position nears and leaves its liquidation price", async () => {
    const st = stateOf(MIXED).assetPositions.find((p) => p.position.leverage.type === "isolated")!.position;
    const liq = Number(st.liquidationPx);
    const side = Number(st.szi) > 0 ? 1 : -1;
    // move the mark to 2% from liquidation, then back to the recorded mark
    const near = String(liq / (1 - side * 0.02));
    const prices = [mids, { ...mids, [st.coin]: near }, { ...mids, [st.coin]: near }, mids];
    const { t, io: x } = io(fakeFetch((n) => prices[Math.min(n, prices.length - 1)]!));
    expect(
      await run([MIXED, "--threshold", "250k", "--watch", "--alert", "3", "--interval", "5"], { ...x, maxTicks: 4 }),
    ).toBe(0);
    const lines = t.out.split("\n").filter((l) => / (NEAR|CLEAR) /.test(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(`NEAR  ${st.coin} ${side === 1 ? "long" : "short"} is 2.00% from its liquidation price`);
    expect(lines[1]).toContain(`CLEAR ${st.coin}`);
    expect(t.out).toContain("Watching every 5s, alert within 3% of liquidation.");
  });

  it("emits one JSON line per poll in watch mode", async () => {
    const { t, io: x } = io();
    expect(await run([MIXED, "--threshold", "250k", "--watch", "--alert", "3", "--json"], { ...x, maxTicks: 2 })).toBe(
      0,
    );
    const lines = t.out
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveProperty("events");
  });

  it("stops watching when aborted", async () => {
    const ctrl = new AbortController();
    const { io: x } = io();
    let polls = 0;
    const p = run([MIXED, "--threshold", "1m", "--watch", "--alert", "3"], {
      ...x,
      sleep: async () => {
        if (++polls === 3) ctrl.abort();
      },
      signal: ctrl.signal,
    });
    expect(await p).toBe(0);
    expect(polls).toBe(3);
  });

  it("refuses to run without a threshold or an alert distance, and explains why", async () => {
    const cases: [string[], RegExp][] = [
      [[MIXED], /--threshold is required: there is no default alert threshold/],
      [[MIXED, "--threshold", "abc"], /--threshold must be a positive USD amount/],
      [[MIXED, "--threshold", "1m", "--watch"], /--watch needs --alert/],
      [[MIXED, "--threshold", "1m", "--alert", "3"], /only apply with --watch/],
      [["0x1234", "--threshold", "1m"], /full 0x address/],
      [[MIXED, MIXED, "--threshold", "1m"], /exactly one address/],
      [[MIXED, "--threshold", "1m", "--band", "2"], /--band must be between 0 and 1/],
      [[MIXED, "--threshold", "1m", "--min-slices", "5", "--max-slices", "3"], /cannot be above/],
      [[MIXED, "--threshold", "1m", "--nope"], /Unknown option/],
    ];
    for (const [argv, re] of cases) {
      const { t, io: x } = io();
      expect(await run(argv, x)).toBe(2);
      expect(t.err).toMatch(re);
    }
    const h = io();
    expect(await run(["--help"], h.io)).toBe(0);
    expect(h.t.out).toMatchSnapshot();
  });

  it("exits 1 when Hyperliquid cannot be read", async () => {
    const { t, io: x } = io(async () => new Response("down", { status: 503 }));
    expect(await run([MIXED, "--threshold", "1m"], x)).toBe(1);
    expect(t.err).toBe("error: Hyperliquid responded 503\n");
  });

  it("parses USD amounts", () => {
    expect([parseUsd("250000"), parseUsd("250k"), parseUsd("1.5M"), parseUsd("$2,000"), parseUsd("2b")]).toEqual([
      250_000, 250_000, 1_500_000, 2000, 2e9,
    ]);
    expect(parseUsd("-5")).toBeNaN();
    expect(parseArgs([MIXED, "--threshold=1m", "--watch", "--alert=2.5"])).toMatchObject({
      threshold: 1e6,
      watch: true,
      alertPct: 2.5,
      intervalSec: 30,
    });
  });
});
