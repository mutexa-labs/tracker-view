# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow semver (`0.x`: minor bumps may
change the API).

## [0.1.1] - 2026-10-19

### Fixed

- `@mutexa/venue-adapters` moves to v0.1.1, whose declaration build succeeds when installed from git.

## [0.1.0] - 2026-10-18

### Added

- `tracker-view` CLI: positions sorted by closest liquidation, flags above a required threshold, `--replan`,
  `--watch --alert`, `--json`.
- `trackerView`, `trackerRows`, `flagRows`: the tracker view as data, in the `{ data, source, fetchedAt }`
  envelope shared with the Mutexa MCP server.
- `replanPosition`: effective-leverage re-plan into slices placed beyond today's liquidation price, with a
  `clamped` flag when an isolated slice cannot reproduce that price.
- `alertTransitions`: liquidation alerts with hysteresis.
- Recorded fixtures with fake addresses, and the recorder script.
