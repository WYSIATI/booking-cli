# Roadmap

From `v0.1.0` (today) to `v1.0`. Milestones M1–M2 are being built in the current development
cycle; M3 prepares a public release; M4 is **blocked on Booking.com partner/pilot access** and
gates the final `v1.0` claim of spec fidelity.

Guiding constraints for all milestones: registry stays the single source of truth, tests never
hit the network (mock `globalThis.fetch`), no `console.log`, immutable data, files small and
focused. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design these tasks build on.

---

## M0 — Foundation (shipped, `v0.1.0`)

Registry-driven CLI + MCP surface over 8 Demand API operations; env + encrypted stored
credentials (AES-256-GCM); write-op `--yes` guard and MCP `destructiveHint` annotations;
`--json` envelope with stdout/stderr separation; `+find-hotel` helper. Builds clean under
strict TypeScript; smoke-tested.

## M1 — Engineering quality bar (in progress, this cycle) → `v0.2.0`

**Goal:** a contributor can clone, `npm ci`, and get red/green signal locally and in CI; every
core behaviour is covered by fast, offline unit tests.

- [ ] Unit tests for `core/`: config resolution precedence (overrides → env → stored),
      credentials round-trip (encrypt/decrypt, wrong-secret failure, plaintext fallback,
      file permissions), error normalisation, `callOperation` (validation failure, auth
      headers, non-2xx → `ApiError`, network error, non-JSON body) with `fetch` mocked.
- [ ] Unit tests for `domain/`: registry integrity (unique resource/action pairs, every write
      op is intentional, paths well-formed) and schema accept/reject cases per operation.
- [ ] Unit tests for `cli/`: command tree generated for every registry entry; `--yes` guard
      refuses writes and never touches config/network; body resolution from
      `--data`/`--file`/`--stdin`; output contract (`--json` envelope on stdout, errors with
      correct code and exit status).
- [ ] Unit tests for `mcp/`: one tool per operation, correct names/annotations, error results
      flagged `isError` with the normalised shape.
- [ ] Coverage reporting wired into the test script; enforce the 80% threshold in CI.
- [ ] ESLint flat config (`eslint.config.js`) + Prettier: TypeScript rules,
      `no-console` (error) as the mechanical backstop for the stdout contract, import-order,
      immutability-friendly rules; `npm run lint` / `lint:fix`.
- [ ] GitHub Actions CI: on push/PR — `npm ci`, typecheck, lint, format check, build, tests +
      coverage gate, on a Node version matrix (18.17, 20, 22). No secrets required (tests are
      offline by design).
- [ ] Contributor docs: `CONTRIBUTING.md` (setup, test/lint commands, how to add an operation —
      linking to ARCHITECTURE.md §6, PR expectations, conventional commits) and a minimal
      `SECURITY.md` (private disclosure contact; never file credentials in issues).
- [ ] Housekeeping: fix the license mismatch — `LICENSE` is MIT but `package.json`
      (`"license": "Apache-2.0"`) and the README's License section say Apache-2.0; align both
      to MIT (do not modify the LICENSE file). Single-source the version string
      (currently hardcoded as `0.1.0` in `package.json`, `src/index.ts`, and
      `src/mcp/server.ts`).

**Exit criteria:** CI green on a clean clone; coverage ≥ 80%; lint/format enforced; a new
contributor can add an operation end-to-end using only the docs.

## M2 — Human & agent ergonomics (in progress, this cycle) → `v0.3.0`

**Goal:** the two headline features from the README backlog, built on the existing seams.

- [ ] **`+book` end-to-end helper** (`src/cli/helpers.ts`): the guided
      *preview → confirm → create* flow as one command. Calls `orders preview`, renders the
      final total, requires explicit confirmation (`--yes` for non-interactive use; interactive
      prompt on a TTY), then calls `orders create` echoing the previewed price; passes an
      `order_reference` for idempotency where supported. Inherits the write-op guard — it must
      be impossible to reach `create` without an affirmative step. Non-TTY without `--yes`
      fails closed.
- [ ] **`--table` human output** (`src/cli/output.ts` + a small renderer module): compact
      tabular rendering for list-shaped responses (search results, reviews), falling back to
      pretty JSON for non-tabular payloads. Mutually exclusive with `--json`; stdout-only;
      column definitions kept per-resource so the renderer stays dumb.
- [ ] Unit tests for both (fetch mocked; TTY/non-TTY branches of `+book`; table rendering
      snapshots), keeping the M1 coverage gate green.
- [ ] README updates: `+book` walkthrough, `--table` examples, tick off the corresponding
      roadmap checkboxes.

**Exit criteria:** a human can book (against a mock/sandbox) with a single guided command; list
output is readable without `jq`; all guards still hold.

## M3 — Public release readiness → `v0.4.x`

**Goal:** installable and operable by strangers; polish that doesn't depend on Booking.com
access.

- [ ] HTTP hardening in `core/http.ts`: request timeout via `AbortSignal`, opt-in retry with
      backoff for idempotent (`read`) operations only, optional request-id header for support
      escalation.
- [ ] Structured verbose mode (`--verbose` → stderr request/response tracing with credentials
      redacted).
- [ ] npm publish readiness: `prepublishOnly` (build + test), `files` audit, README badges,
      provenance; publish `v0.x` to npm with `bkng` / `bkng-mcp` bins.
- [ ] Release automation: tag-driven GitHub Actions release with generated changelog
      (conventional commits), `CHANGELOG.md`.
- [ ] MCP polish: server `instructions` describing the preview-before-create convention;
      document configs for common hosts (Claude Desktop, Claude Code, others).
- [ ] Shell completion (`bkng completion`) via commander; `--help` audit across the tree.
- [ ] Issue/PR templates; enable dependency and security scanning (Dependabot/audit in CI).

**Exit criteria:** `npm i -g booking-cli` works for a stranger; releases are reproducible and
documented; agents can be pointed at `bkng-mcp` with copy-paste config.

## M4 — Partner-gated fidelity (**blocked on Managed Affiliate Partner / pilot access**)

**Goal:** replace the provisional model with the official one. Nothing here can be honestly
verified without Partner Centre credentials and the pilot-only OpenAPI spec.

- [ ] **Spec reconciliation** (one-file change by design): verify every `path`, `method`, and
      auth header against the official OpenAPI document; correct the registry; replace the
      permissive `.passthrough()` schemas with exact shapes; add missing operations
      (payments, locations/lookup, `orders modify`, etc. as the spec dictates).
- [ ] **Registry codegen** (ARCHITECTURE.md §6): vendor the spec snapshot, build the
      spec → `registry.gen.ts` + `schemas.gen.ts` generator, add the CI regenerate-and-diff
      freshness check.
- [ ] **Sandbox verification**: opt-in integration suite (`BOOKING_API_KEY`-gated, excluded
      from default CI) exercising every read operation against the sandbox base URL.
- [ ] **Live booking validation**: `orders preview → create → details → cancel` executed
      end-to-end under real partner contracts (PCI DSS scope permitting); document idempotency
      behaviour of `order_reference`; harden `+book` against the observed responses.
- [ ] Rate-limit and error-catalogue mapping from observed API behaviour into `ApiError`
      handling and docs.

**Exit criteria:** registry provably matches the official spec (CI-enforced); read surface
verified against sandbox; booking flow validated live at least once.

## v1.0

Cut when **M1–M3 are complete and the M4 spec-reconciliation + sandbox items are done**
(live-booking validation may note contractual caveats). `v1.0` promises: stable command tree
and `--json`/error envelopes (semver-guarded), spec-faithful registry, coverage ≥ 80%, and the
safety model (guarded writes, encrypted credentials) as documented invariants.

---

## Risks & dependencies

- **Pilot access is the critical path.** M4 timing is outside the project's control; until
  then, endpoint paths and schemas remain provisional (clearly labelled in README/registry).
- **Spec drift**: reconciliation may rename resources/actions, breaking early adopters'
  scripts — batch such breaks into one pre-1.0 release with a migration note.
- **Hint-based MCP safety is advisory**: hosts may ignore `destructiveHint`; the `+book`
  flow and the guard-first design must remain the true safety boundary.
- **License mismatch** (MIT LICENSE vs Apache-2.0 in `package.json`/README) must be resolved
  before any npm publish to avoid shipping contradictory licensing metadata.
- **Zod v3 → v4 and MCP SDK churn**: the MCP SDK's zod interop (raw `shape` passed as
  `inputSchema`) is version-sensitive; pin and test before upgrading either.
