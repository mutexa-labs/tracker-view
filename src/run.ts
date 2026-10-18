import { createHyperliquidAdapter, type FetchLike } from "@mutexa/venue-adapters";
import { renderEvent, renderView } from "./render";
import { ADDRESS_RE, trackerView } from "./view";
import { alertTransitions } from "./watch";

export const HELP = `tracker-view: see a Hyperliquid address the way public trackers see it

Usage:
  tracker-view <address> --threshold <usd> [--replan] [--watch --alert <pct>] [--json]

Options:
  --threshold <usd>   your alert threshold: positions worth more are flagged (required; 250000, 250k, 1.5m)
  --replan            re-plan each position into isolated slices placed beyond today's liquidation price
  --band <0..1>       leverage stagger across slices (default 0.5)
  --jitter <0..1>     size variation across slices (default 0.35)
  --seed <n>          seed for the size variation (default 11)
  --min-slices <n>    fewest slices (default 2)
  --max-slices <n>    most slices (default 12)
  --watch             keep polling and print a line when a position nears its liquidation price
  --alert <pct>       with --watch: alert distance in percent of the mark, for example 3 (required with --watch)
  --interval <sec>    with --watch: seconds between polls (default 30)
  --json              print JSON ({ data, source, fetchedAt }); with --watch, one JSON line per poll
  -h, --help          show this help

Only public data is read. Nothing is signed, stored or sent anywhere except the public reads themselves.`;

export type RunIO = {
  fetch?: FetchLike;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  /** Stop watching after this many polls (tests). */
  maxTicks?: number;
};

export class UsageError extends Error {
  override name = "UsageError";
}

export type CliOptions = {
  address: string;
  threshold: number;
  replan: boolean;
  band?: number;
  sizeJitter?: number;
  seed?: number;
  minSlices?: number;
  maxSlices?: number;
  watch: boolean;
  alertPct?: number;
  intervalSec: number;
  json: boolean;
  help: boolean;
};

/** Parses "250000", "250k", "1.5m" or "2b" into a USD amount. */
export function parseUsd(s: string): number {
  const m = /^(\d+(?:\.\d+)?)([kmb])?$/i.exec(s.trim().replace(/[_,$]/g, ""));
  if (!m) return NaN;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Number(m[1]) * mult;
}

const VALUE_FLAGS = ["threshold", "band", "jitter", "seed", "min-slices", "max-slices", "alert", "interval"];
const BOOL_FLAGS = ["replan", "watch", "json"];

export function parseArgs(argv: string[]): CliOptions {
  const raw: Record<string, string> = {};
  const flags = new Set<string>();
  const positional: string[] = [];
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") help = true;
    else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (BOOL_FLAGS.includes(name)) flags.add(name);
      else if (VALUE_FLAGS.includes(name)) {
        const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
        if (v === undefined || v.startsWith("--")) throw new UsageError(`--${name} needs a value`);
        raw[name] = v;
      } else throw new UsageError(`Unknown option: --${name}`);
    } else positional.push(a);
  }
  const base = { replan: false, watch: false, json: false, intervalSec: 30, help };
  if (help) return { ...base, address: "", threshold: 0 };
  if (positional.length !== 1) throw new UsageError("Give exactly one address");
  const address = positional[0]!;
  if (!ADDRESS_RE.test(address)) throw new UsageError("The address must be a full 0x address (42 characters)");
  if (raw.threshold === undefined) throw new UsageError("--threshold is required: there is no default alert threshold");
  const threshold = parseUsd(raw.threshold);
  if (!(threshold > 0)) throw new UsageError("--threshold must be a positive USD amount");
  const num = (k: string, ok: (n: number) => boolean, what: string) => {
    if (raw[k] === undefined) return undefined;
    const n = Number(raw[k]);
    if (!ok(n)) throw new UsageError(`--${k} must be ${what}`);
    return n;
  };
  const frac = (n: number) => n >= 0 && n <= 1;
  const posInt = (n: number) => Number.isInteger(n) && n >= 1;
  const watch = flags.has("watch");
  const alertPct = num("alert", (n) => n > 0 && n < 100, "a percentage between 0 and 100");
  if (watch && alertPct === undefined)
    throw new UsageError("--watch needs --alert <pct>: there is no default alert distance");
  if (!watch && (raw.alert !== undefined || raw.interval !== undefined))
    throw new UsageError("--alert and --interval only apply with --watch");
  const minSlices = num("min-slices", posInt, "a positive integer");
  const maxSlices = num("max-slices", posInt, "a positive integer");
  if (minSlices !== undefined && maxSlices !== undefined && minSlices > maxSlices)
    throw new UsageError("--min-slices cannot be above --max-slices");
  return {
    ...base,
    address,
    threshold,
    replan: flags.has("replan"),
    band: num("band", frac, "between 0 and 1"),
    sizeJitter: num("jitter", frac, "between 0 and 1"),
    seed: num("seed", Number.isFinite, "a number"),
    minSlices,
    maxSlices,
    watch,
    alertPct,
    intervalSec: num("interval", (n) => n >= 1, "at least 1 second") ?? 30,
    json: flags.has("json"),
  };
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Runs the CLI; returns the exit code. All I/O goes through `io`. */
export async function run(argv: string[], io: RunIO): Promise<number> {
  let o: CliOptions;
  try {
    o = parseArgs(argv);
  } catch (e) {
    io.stderr(`${e instanceof Error ? e.message : String(e)}\n\n${HELP}\n`);
    return 2;
  }
  if (o.help) {
    io.stdout(HELP + "\n");
    return 0;
  }
  const adapter = createHyperliquidAdapter({ fetch: io.fetch, cache: false });
  const replan = o.replan
    ? { band: o.band, sizeJitter: o.sizeJitter, seed: o.seed, minSlices: o.minSlices, maxSlices: o.maxSlices }
    : false;
  const read = () => trackerView({ address: o.address, threshold: o.threshold, replan, adapter, now: io.now });

  try {
    if (!o.watch) {
      const v = await read();
      io.stdout(o.json ? JSON.stringify(v, null, 2) + "\n" : renderView(v.data));
      return 0;
    }
    const sleep = io.sleep ?? defaultSleep;
    let alerted = new Set<string>();
    for (let tick = 0; !io.signal?.aborted && (io.maxTicks === undefined || tick < io.maxTicks); tick++) {
      if (tick > 0) await sleep(o.intervalSec * 1000, io.signal);
      if (io.signal?.aborted) break;
      try {
        const v = await read();
        const t = alertTransitions(alerted, v.data.positions, o.alertPct! / 100);
        alerted = t.alerted;
        if (o.json) io.stdout(JSON.stringify({ ...v, events: t.events }) + "\n");
        else {
          if (tick === 0)
            io.stdout(
              renderView(v.data) +
                `\nWatching every ${o.intervalSec}s, alert within ${o.alertPct}% of liquidation. Ctrl+C to stop.\n`,
            );
          for (const e of t.events) io.stdout(renderEvent(e, v.fetchedAt) + "\n");
        }
      } catch (e) {
        io.stderr(`poll failed: ${e instanceof Error ? e.message : String(e)}\n`);
        if (tick === 0) return 1;
      }
    }
    return 0;
  } catch (e) {
    io.stderr(`error: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
