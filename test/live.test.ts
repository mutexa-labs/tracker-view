// Live smoke test. Skipped unless LIVE=1 and TRACKER_ADDRESS are set; never part of CI.
import { describe, expect, it } from "vitest";
import { trackerView } from "../src/index";

const address = process.env.TRACKER_ADDRESS;
describe.skipIf(process.env.LIVE !== "1" || !address)("live", () => {
  it("reads a public address", async () => {
    const v = await trackerView({ address: address!, threshold: 1_000_000, replan: true });
    expect(v.data.address).toBe(address!.toLowerCase());
  }, 30_000);
});
