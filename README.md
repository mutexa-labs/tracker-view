# @mutexa/tracker-view

See any Hyperliquid address the way public trackers see it.

Every open position on Hyperliquid is public: size, leverage, entry and the exact liquidation price. This CLI
shows them the way trackers and liquidation hunters see them, flags what crosses **your** alert threshold,
re-plans each position into a band of slices, and can watch an address and print a line when a position nears
its liquidation price. It works on any address, with no account, no key and no app.

Read-only. Nothing is signed, stored or sent anywhere except the public reads themselves.

## Install

```sh
npx @mutexa/tracker-view <address> --threshold 250k
# or as a library
pnpm add @mutexa/tracker-view
```

## 30-second example

```sh
tracker-view 0xYourAddress --threshold 250k --replan
```

```
Tracker view · 0x0000…00d1 · Hyperliquid state at 2026-10-18T22:28:34.813Z
Account value $7.83M · 3 open positions · exposure $8.05M · 2 over your $250K threshold

MARKET  SIDE        SIZE     VALUE        LEV    ENTRY     MARK  LIQ PRICE  TO LIQ     UPNL
LIT     short  2,551,077    $7.67M     3x iso   1.3235   3.0068     5.5096   83.2%   -$4.3M  OVER THRESHOLD
ETH     short      124.8  $298.15K  20x cross  2,667.4  2,389.3     21,587  803.5%  $34.75K  OVER THRESHOLD
HYPE    short      1,051   $82.11K  10x cross    90.35    78.13    2,292.7   >999%  $12.84K
…
Re-planned as isolated slices at today's mark, none liquidating before today's price where an isolated slice can reach it (nothing is changed):
  LIT short $7.67M: trackers see 5.5096 on one wallet -> 12 slices, band 5.5096 to 7.3604, largest $770.21K, 12 of 12 over threshold, 0.76x blended
```

This output is the snapshot test in [`test/__snapshots__/cli.test.ts.snap`](test/__snapshots__/cli.test.ts.snap),
run on a recorded account under a fake address.

Library, from [`examples/view.ts`](examples/view.ts):

```ts
import { renderView, trackerView } from "@mutexa/tracker-view";

const view = await trackerView({
  address: process.argv[2]!,
  threshold: 250_000, // your alert threshold in USD: there is no default
  replan: true,
});

console.log(renderView(view.data));
console.log(view.source, view.fetchedAt);
```

## CLI

```
tracker-view <address> --threshold <usd> [--replan] [--watch --alert <pct>] [--json]

  --threshold <usd>   your alert threshold: positions worth more are flagged (required; 250000, 250k, 1.5m)
  --replan            re-plan each position into isolated slices placed beyond today's liquidation price
  --band <0..1>       leverage stagger across slices (default 0.5)
  --jitter <0..1>     size variation across slices (default 0.35)
  --seed <n>          seed for the size variation (default 11)
  --min-slices <n>    fewest slices (default 2)
  --max-slices <n>    most slices (default 12)
  --watch             keep polling and print a line when a position nears its liquidation price
  --alert <pct>       with --watch: alert distance in percent of the mark (required with --watch)
  --interval <sec>    with --watch: seconds between polls (default 30)
  --json              print JSON ({ data, source, fetchedAt }); with --watch, one JSON line per poll
```

- **There is no default threshold and no default alert distance.** What counts as "large" or "close" is yours to
  decide; the CLI refuses to guess.
- **Re-plan.** Each position is re-planned with
  [`@mutexa/ladder`](https://github.com/mutexa-labs/liquidation-ladder) at today's mark and the same notional,
  each slice isolated and placed "beyond": no slice liquidates before the price Hyperliquid reports today. The
  slice count comes from your threshold (`alertSafeSlices`), clamped to `--min-slices`/`--max-slices`. Band,
  jitter, seed and the 12-slice cap are the values Mutexa's tracker page uses; they shape the picture and are
  not advice. When today's price cannot be reproduced by an isolated slice (typical for cross positions backed by
  a large account), the output says so and plans at the nearest leverage an isolated slice can use.
- **Watch.** A position raises `NEAR` once it is within `--alert` percent of its liquidation price, and `CLEAR`
  once it moves back beyond 1.5 times that distance, so a price hovering at the line does not alert on every poll.
- **JSON.** `--json` prints `{ data, source, fetchedAt }`, the same shape the Mutexa MCP server's
  `tracker_view` tool returns.

Exit codes: 0 done, 1 Hyperliquid could not be read, 2 usage error.

## API

| Export | What it does |
|---|---|
| `trackerView({ address, threshold, replan?, adapter?, now? })` | Reads the public state and returns `{ data: TrackerView, source, fetchedAt }` |
| `trackerRows(state, mids)` | Open positions sorted by closest liquidation: side, size, value, leverage, cross or isolated, entry, mark, liquidation price, distance, uPnL |
| `flagRows(state, rows, threshold)` | Flags rows above the threshold and sums the account |
| `replanPosition(row, market, { threshold, band?, sizeJitter?, seed?, minSlices?, maxSlices? })` | One position as slices on a band; reports `effectiveLeverage` and `clamped` |
| `alertTransitions(alerted, rows, alertFraction)` | `near` / `clear` events with hysteresis |
| `renderView(view)`, `renderReplan(replan)`, `renderEvent(event, at)` | Plain-text output |
| `run(argv, io)`, `parseArgs(argv)`, `parseUsd(text)` | The CLI with injectable I/O |
| `fmtUsd`, `fmtPx`, `fmtPct`, `fmtLev`, `fmtNum`, `shortAddr` | Formatting helpers |
| `REPLAN_DEFAULTS` | Band, jitter, seed and slice bounds used when an option is left out |

## Tests and fixtures

`fixtures/recorded.json` holds public Hyperliquid responses recorded by `pnpm record <address...>`: two accounts
(isolated and cross positions, and cross positions without a liquidation price) stored under fake addresses
(`0x…d1`, `0x…d2`), one empty account, and the markets and mids those accounts use. The real addresses are
given at run time and never written to disk. CLI tests run against these responses through a fake `fetch` and
compare the output with snapshots; watch tests move the recorded mark to trigger and clear alerts. CI never
touches the network; `LIVE=1 TRACKER_ADDRESS=0x… pnpm test:live` is a by-hand smoke test.

## How Mutexa uses it

The same logic runs the tracker view and the watchlist in the Mutexa app: "see your slices the way trackers see
them" before and after a trade. The CLI is the version anyone can run on any address.

## Limitations

- **Hyperliquid only** in this release, main perp markets only for re-plans.
- **Cross-margin liquidation prices depend on the whole account.** They are shown as Hyperliquid reports them,
  and a re-plan of a cross position is an isolated approximation.
- **Funding drift.** Funding changes isolated margin over time, so liquidation prices move even when the mark
  does not.
- **A re-plan is a picture, not an order.** It never touches the real position.

Mutexa's privacy limits apply to any plan this prints: slices are hidden from public trackers, not from the
venue itself; clustering by timing is still possible; very large positions still move markets; splitting and
privacy rails cost extra fees; fills that carry an integrator fee are marked as such. Follow each venue's terms in
your region.

## License

MIT © 2026 Mutexa
