import { readFileSync } from "node:fs";
import { toMarkets, type HlAllMids, type HlClearinghouseState, type HlMetaAndCtxs } from "@mutexa/venue-adapters";
import { fixtureFetch, type HttpExchange } from "@mutexa/venue-adapters/conformance";

export const rec = JSON.parse(readFileSync(new URL("../../fixtures/recorded.json", import.meta.url), "utf8")) as {
  recordedAt: string;
  accounts: string[];
  exchanges: HttpExchange[];
};
export const [MIXED, CROSS, EMPTY] = rec.accounts as [string, string, string];

const find = (type: string, user?: string) =>
  rec.exchanges.find((e) => {
    const r = e.request as { type: string; user?: string };
    return r.type === type && (!user || r.user === user);
  })!.response;

export const stateOf = (a: string) => find("clearinghouseState", a) as HlClearinghouseState;
export const mids = find("allMids") as HlAllMids;
export const markets = toMarkets(find("metaAndAssetCtxs") as HlMetaAndCtxs);

/** Recorded responses, with allMids optionally replaced per call (to move prices in watch tests). */
export function fakeFetch(midsFor?: (call: number) => HlAllMids) {
  let n = 0;
  const exchanges = midsFor
    ? rec.exchanges.filter((e) => (e.request as { type: string }).type !== "allMids")
    : rec.exchanges;
  const base = fixtureFetch(exchanges);
  return async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { type: string };
    if (midsFor && body.type === "allMids") return new Response(JSON.stringify(midsFor(n++)), { status: 200 });
    return base(url, init);
  };
}
