#!/usr/bin/env node
import { run } from "./run";

const ctrl = new AbortController();
process.once("SIGINT", () => ctrl.abort());
process.exitCode = await run(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  signal: ctrl.signal,
});
