# Contributing to booking-cli

Thanks for your interest in improving `bkng`. This document covers everything you need to go from clone to merged PR.

## Development setup

Prerequisites: **Node.js >= 20.19** and npm.

```bash
git clone https://github.com/WYSIATI/booking-cli.git && cd booking-cli
npm install
npm run build
npm link          # optional: exposes `bkng` and `bkng-mcp` globally
```

For fast iteration without a build step:

```bash
npm run dev -- accommodations search -d '{"city_id":2140479,"checkin":"2026-08-01","checkout":"2026-08-03"}'
npm run mcp       # run the MCP server from source
```

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint the source |
| `npm run format` | Format with Prettier |
| `npm test` | Run the test suite |
| `npm run dev` | Run the CLI from source via tsx |
| `npm run mcp` | Run the MCP server from source via tsx |

Before opening a PR, make sure `npm run typecheck`, `npm run lint`, and `npm test` all pass.

## Adding an operation to the registry

The registry ([`src/domain/registry.ts`](src/domain/registry.ts)) is the single source of truth. Adding an entry generates both a CLI command and an MCP tool — no other wiring needed.

1. **Define the input schema** in [`src/domain/schemas.ts`](src/domain/schemas.ts). Use zod, validate the fields known to be required, and keep `.passthrough()` so unknown-but-valid fields flow through until schemas are reconciled with the official spec.
2. **Add the entry** to `OPERATIONS` in `src/domain/registry.ts`:
   ```ts
   {
     resource: 'accommodations',      // CLI command group / MCP tool prefix
     action: 'constants',             // subcommand / tool suffix
     summary: 'One line shown in --help and as the MCP tool description.',
     method: 'POST',
     path: '/accommodations/constants',  // appended to the base URL
     input: AccommodationsConstantsInput,
     kind: 'read',                    // 'write' triggers the --yes guard + destructiveHint
   }
   ```
3. **Choose `kind` carefully.** Anything that mutates state (creates, cancels, charges) must be `'write'` — the CLI then refuses to run it without `--yes` and the MCP layer marks it destructive.
4. **Add tests.** Tests must not hit the network — mock `global fetch` and assert on the request the client builds and how responses/errors are normalised.
5. **Verify the generated surface**: `npm run dev -- <resource> <action> --help` and confirm the tool appears via the MCP server if relevant.
6. Update the README if the operation is user-facing in a new way (e.g. a new resource group).

Endpoint paths are provisional until verified against Booking.com's official OpenAPI spec (pilot-gated). If you have Partner Centre access, reconciling paths and schemas is the single most valuable contribution.

## Coding standards

- **TypeScript strict, ESM + NodeNext.** Relative imports use `.js` specifiers (e.g. `from './errors.js'`).
- **Immutability.** Never mutate inputs or shared state; return new objects/arrays (spread, `map`, `filter`).
- **Small, focused files.** Keep files under ~400 lines with high cohesion and low coupling; extract helpers rather than growing a file.
- **Validate all external input with zod** — request bodies, CLI JSON, anything crossing a trust boundary.
- **No `console.log` anywhere.** CLI output goes through the helpers in [`src/cli/output.ts`](src/cli/output.ts): payloads to stdout, status/errors to stderr, so `--json` stays clean for pipes and agents. The MCP server may only write to stderr — stdout is the transport.
- **Comprehensive error handling.** Throw the typed errors from [`src/core/errors.ts`](src/core/errors.ts) (`ConfigError`, `ValidationError`, `ApiError`); never leak credentials or raw request bodies into error output.
- **No hardcoded secrets.** Credentials come from environment variables or the stored credentials file only.

## Running tests

```bash
npm test
```

Test rules:

- **No network.** The Demand API is pilot-gated; tests mock `global fetch` and never make real HTTP calls.
- Cover both the success path and error normalisation (non-2xx responses, network failures, invalid input).
- New operations and helpers ship with tests.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Examples:

```
feat: add accommodations constants operation
fix: include response body in ApiError for 4xx responses
docs: clarify BOOKING_CLI_SECRET behaviour in README
```

## Pull requests

1. Fork and create a topic branch from `main`.
2. Keep PRs focused — one logical change per PR.
3. Ensure `npm run typecheck`, `npm run lint`, and `npm test` pass locally.
4. Describe **what** changed and **why**; link related issues.
5. For behaviour changes, include before/after examples of the CLI output.

## Reporting issues

Use [GitHub issues](https://github.com/WYSIATI/booking-cli/issues). For bugs, include your Node version, the exact command (redact credentials), and the `--json` error output. Please do not post API keys, affiliate ids, or real booking data.

## Code of conduct

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
