// Records the test fixtures from the live Hyperliquid info API.
//
//   pnpm record <address> [<address> ...]
//
// Addresses are given at run time and never written to disk: each account is stored under an obviously fake
// address (0x…d1, 0x…d2, …). One more fake address with no positions is recorded as the empty case. Markets
// and mids are trimmed to the coins the accounts hold.

import { writeFileSync } from "node:fs";
import { HL_INFO_URL, type HlMetaAndCtxs } from "@mutexa/venue-adapters";

const real = process.argv.slice(2).map((a) => a.toLowerCase());
if (!real.length) {
  console.error("usage: tsx scripts/record.ts <address> [<address> ...]");
  process.exit(1);
}
const fake = (i: number) => `0x${(0xd1 + i).toString(16).padStart(40, "0")}`;
const info = async (b: unknown) =>
  (await (
    await fetch(HL_INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    })
  ).json()) as any;

const exchanges: { request: unknown; response: unknown }[] = [];
const coins = new Set<string>();
for (const [i, a] of real.entries()) {
  const st = await info({ type: "clearinghouseState", user: a });
  for (const p of st.assetPositions) coins.add(p.position.coin);
  exchanges.push({ request: { type: "clearinghouseState", user: fake(i) }, response: st });
}
const empty = fake(real.length);
exchanges.push({
  request: { type: "clearinghouseState", user: empty },
  response: await info({ type: "clearinghouseState", user: empty }),
});

const [meta, ctxs] = (await info({ type: "metaAndAssetCtxs" })) as HlMetaAndCtxs;
const keep = meta.universe.map((u, i) => (coins.has(u.name) ? i : -1)).filter((i) => i >= 0);
const universe = keep.map((i) => meta.universe[i]!);
const ids = new Set(universe.map((u) => u.marginTableId));
exchanges.push({
  request: { type: "metaAndAssetCtxs" },
  response: [
    { universe, marginTables: (meta.marginTables ?? []).filter(([id]) => ids.has(id)) },
    keep.map((i) => ctxs[i]),
  ],
});
const mids = await info({ type: "allMids" });
exchanges.push({
  request: { type: "allMids" },
  response: Object.fromEntries(Object.entries(mids).filter(([k]) => coins.has(k))),
});

let out = JSON.stringify(
  {
    recordedAt: new Date().toISOString(),
    recordedWith: "scripts/record.ts",
    note: "Public Hyperliquid responses. Account addresses are fake; positions are real values read at recordedAt.",
    accounts: [...real.map((_, i) => fake(i)), empty],
    exchanges,
  },
  null,
  1,
);
real.forEach((a, i) => (out = out.split(a.slice(2)).join(fake(i).slice(2))));
writeFileSync("fixtures/recorded.json", out + "\n");
console.error(`wrote fixtures/recorded.json (${real.length} accounts + 1 empty, ${universe.length} markets)`);
