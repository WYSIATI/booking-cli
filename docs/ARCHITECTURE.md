# Architecture

`booking-cli` is one command surface over the Booking.com Demand API, exposed twice from a
single definition: as a CLI (`bkng`) for humans and scripts, and as an MCP server (`bkng-mcp`)
for AI agents. This document describes how that works, why it is shaped this way, and where to
extend it.

- Language/runtime: TypeScript (strict), ESM + NodeNext, Node >= 18.17
- Dependencies: `commander` (CLI), `zod` (validation), `@modelcontextprotocol/sdk` (MCP)
- Build: `tsc` only — no bundler, no codegen step (yet; see [Extension points](#extension-points))

## 1. The registry-driven design

The core idea is borrowed from [`googleworkspace/cli`](https://github.com/googleworkspace/cli)
(`gws`): `gws` does not hand-write a command per Google API method — it builds its entire
command tree from Google's machine-readable **Discovery Document**. Booking.com's equivalent
artifact is its official OpenAPI spec, which is only shared with approved pilot partners.

Until that spec is in hand, this project maintains a stand-in: the **operation registry** in
[`src/domain/registry.ts`](../src/domain/registry.ts). It is a flat, typed, `readonly` table —
`OPERATIONS: readonly Operation[]` — where each entry declares everything the rest of the
system needs to know about one API operation:

| Field | Meaning | Consumed by |
|---|---|---|
| `resource` | Resource group, e.g. `accommodations` | CLI command group, MCP tool name prefix |
| `action` | Action, e.g. `search` | CLI subcommand, MCP tool name suffix |
| `summary` | One-line description | `--help` text, MCP tool description |
| `method` / `path` | HTTP verb + path under the base URL | HTTP client (`core/http.ts`) |
| `input` | zod schema for the request body | Validation (CLI + MCP), MCP `inputSchema` |
| `kind` | `'read'` \| `'write'` | CLI `--yes` guard, MCP safety annotations |

Both frontends are *generated* from this table at startup:

- `src/cli/commands.ts` iterates `OPERATIONS` and registers a fully wired
  `bkng <resource> <action>` command for each entry (with `--data/--file/--stdin` body inputs,
  and `--yes` added automatically for write operations).
- `src/mcp/server.ts` iterates the same table and registers one MCP tool per entry, named
  `<resource>_<action>`, using the zod schema's shape as the tool's `inputSchema` and mapping
  `kind` to `readOnlyHint` / `destructiveHint` / `idempotentHint` annotations.

**Adding one row to the table yields a CLI command and an MCP tool for free**, both sharing the
same validation, auth, HTTP, and error-normalisation path. There is deliberately no other place
where operations are defined; the registry is the single source of truth, and reconciling it
against the official OpenAPI spec (paths, schemas, missing operations) is a one-file change.

### Data-flow diagram

```
                    Booking.com OpenAPI spec (official, partner-only)
                                      │
                                      │  reconcile / (future) codegen
                                      ▼
                     ┌────────────────────────────────────┐
                     │  src/domain/registry.ts            │
                     │  OPERATIONS table (source of truth)│
                     │  + src/domain/schemas.ts (zod)     │
                     └────────────────┬───────────────────┘
                     generated from   │   generated from
              ┌───────────────────────┴────────────────────────┐
              ▼                                                ▼
┌───────────────────────────┐                    ┌───────────────────────────┐
│  CLI  (bkng)              │                    │  MCP server (bkng-mcp)    │
│  src/index.ts             │                    │  src/mcp/server.ts        │
│  src/cli/commands.ts      │                    │  tools: <resource>_<action>│
│  src/cli/helpers.ts (+…)  │                    │  annotations: readOnly /  │
│  src/cli/auth.ts          │                    │  destructive / idempotent │
└─────────────┬─────────────┘                    └─────────────┬─────────────┘
              │ --data/--file/--stdin                          │ tool args
              ▼                                                ▼
       src/cli/input.ts                                 (args used directly)
       resolveBody()                                           │
              │                                                │
              └──────────────────────┬─────────────────────────┘
                                     ▼
                     ┌────────────────────────────────────┐
                     │  src/cli/execute.ts (CLI only:     │
                     │  write-op --yes guard)             │
                     ├────────────────────────────────────┤
                     │  src/core/config.ts                │
                     │  resolveConfig(): env → stored     │
                     │    └─ src/core/credentials.ts      │
                     │       (AES-256-GCM at rest)        │
                     ├────────────────────────────────────┤
                     │  src/core/http.ts                  │
                     │  callOperation():                  │
                     │   1. zod-validate body (registry)  │
                     │   2. attach auth headers           │
                     │   3. fetch → normalise errors      │
                     └────────────────┬───────────────────┘
                                      ▼
                       Booking.com Demand API (HTTPS)
                                      │
              ┌───────────────────────┴────────────────────────┐
              ▼                                                ▼
   src/cli/output.ts                                MCP tool result
   stdout: payload / --json envelope               content: JSON text
   stderr: human status + errors                   isError on failure
   (errors via core/errors.normalizeError — shared by both frontends)
```

## 2. Modules and dependency direction

Dependencies point strictly inward. `domain` is the pure leaf; `core` builds on it; the two
frontends (`cli`, `mcp`) build on both and never on each other.

```
domain  ←  core  ←  { cli, mcp }  ←  index.ts / mcp/server.ts (entry points)
```

| Layer | Files | Responsibility | May import |
|---|---|---|---|
| `domain` | `registry.ts`, `schemas.ts` | What the API *is*: operations table + zod input schemas. Pure data + types; no I/O. | `zod` only |
| `core` | `config.ts`, `credentials.ts`, `errors.ts`, `http.ts` | How to *talk to* the API: credential resolution, encrypted storage, HTTP client, error taxonomy. No CLI/MCP awareness. | `domain`, Node built-ins |
| `cli` | `commands.ts`, `execute.ts`, `helpers.ts`, `auth.ts`, `input.ts`, `output.ts` | Human/script frontend: command-tree generation, body resolution, output contract, `--yes` guard. | `core`, `domain`, `commander` |
| `mcp` | `server.ts` | Agent frontend: registry → MCP tools over stdio. | `core`, `domain`, MCP SDK |
| entry | `index.ts` | Wires global flags + the three registrars; top-level error handling. | `cli` |

Rules that keep this healthy:

- `domain` performs no I/O and imports nothing from the rest of the tree. It must stay trivially
  unit-testable and codegen-replaceable.
- `core` never formats output and never reads `argv`. All process-boundary concerns (flags,
  stdout/stderr, MCP transport) live in the frontends.
- `cli` and `mcp` never import each other. Anything they would share belongs in `core` or
  `domain`.
- All modules follow the repo-wide invariants: immutable data (`readonly` interfaces, spread
  instead of mutation), files small and focused, **no `console.log` anywhere** (see §6), no
  hardcoded secrets.

## 3. Auth and credential model

Configuration is resolved per invocation by `resolveConfig()` in `src/core/config.ts`, in
strict precedence order — the first *complete* source wins:

1. **Per-call overrides** — `--affiliate-id` / `--base-url` CLI flags (highest precedence for
   the fields they cover).
2. **Environment variables** — `BOOKING_API_KEY` + `BOOKING_AFFILIATE_ID`
   (+ optional `BOOKING_API_BASE_URL`). Preferred for CI and agent/MCP-host contexts, where the
   host injects env into the server process.
3. **Stored credentials** — written by `bkng auth login` to
   `$XDG_CONFIG_HOME/booking-cli/credentials.json` (default `~/.config/booking-cli/`).

If no source is complete, a `ConfigError` explains both remedies and links to the partner
prerequisites page. There are no other credential paths and no secrets in code.

**At-rest encryption** (`src/core/credentials.ts`): when `BOOKING_CLI_SECRET` is set at
`auth login` time, the API key is encrypted with **AES-256-GCM**:

- key: derived from the passphrase via `scrypt` with a random 16-byte salt;
- nonce: random 12-byte IV; GCM auth tag verifies integrity on decrypt;
- stored payload: `salt:iv:authTag:ciphertext` (hex) inside a small JSON file with an
  `encrypted` flag; the affiliate id (not a secret) stays readable;
- filesystem hygiene: config dir `0700`, credentials file `0600`.

Without the secret, the token is stored in plaintext and the CLI prints an explicit warning to
stderr — environment variables are the recommended alternative. Decryption failures (wrong
passphrase, tampering → GCM tag mismatch) surface as a `ConfigError` telling the user to check
`BOOKING_CLI_SECRET` or re-run `bkng auth login`; the raw crypto error is never leaked.

Auth headers are centralised in one function in `src/core/http.ts` — `Authorization: Bearer
<key>` plus `X-Affiliate-Id` — so if the official spec dictates a different scheme, it changes
in exactly one place.

## 4. Safety model for write operations

Some operations charge real cards. The registry's `kind: 'read' | 'write'` field drives a
defence at each surface:

- **CLI — the `--yes` guard.** `src/cli/commands.ts` adds a `--yes` option only to write
  operations, and `src/cli/execute.ts` refuses to execute a write operation without it — before
  credentials are resolved and before any network I/O. The refusal message tells the user to
  run `orders preview` first. A scripted or agent-driven `bkng orders create` therefore cannot
  charge a payment method by accident; the caller must state intent explicitly.
- **MCP — tool annotations.** `src/mcp/server.ts` marks every tool with
  `readOnlyHint` / `destructiveHint` / `idempotentHint` derived from `kind`. MCP hosts (Claude
  Desktop and others) use `destructiveHint` to gate the call behind human confirmation. The
  hints are advisory by protocol design — the host owns the confirmation UX — which is why the
  intended booking flow is always *preview → human confirmation → create* (the planned `+book`
  helper encodes exactly this sequence).

The two mechanisms are the same policy expressed in each surface's native idiom, and both fall
out of the single `kind` field in the registry.

## 5. Error model and output contract

**Error taxonomy** (`src/core/errors.ts`) — three typed errors plus a normaliser:

| Type | `code` | Raised when | `details` |
|---|---|---|---|
| `ConfigError` | `CONFIG_ERROR` | Missing/undecryptable credentials, malformed store | — |
| `ValidationError` | `VALIDATION_ERROR` | Body fails the operation's zod schema, or unparseable `--data/--file/--stdin` | list of `path: message` issues |
| `ApiError` | `API_ERROR` | Non-2xx response (carries HTTP status + body) or network failure (status `0`) | response body |
| anything else | `UNEXPECTED` | Unanticipated exceptions | — |

`normalizeError(unknown)` maps any thrown value to a stable, non-leaky shape —
`{ ok: false, code, message, details? }` — used identically by both frontends. Credentials and
full request bodies are never echoed back.

**CLI output contract** (`src/cli/output.ts` — the *only* module that writes to the terminal):

- **stdout carries payload, nothing else.** Default mode prints the response as pretty JSON;
  `--json` wraps it in the machine envelope `{ "ok": true, "data": … }`. With `--json`, errors
  also go to **stdout** as `{ "ok": false, "code", "message", "details?" }`, so a pipeline
  reads exactly one JSON document from stdout either way and branches on `ok`.
- **stderr carries human status**: `error [CODE]: message` in non-JSON mode, plus informational
  notices (`auth login` confirmations, plaintext-storage warnings).
- **exit code** is `0` on success, `1` on any failure.
- `console.log` is banned repo-wide. This is not style: `bkng --json … | jq` must never be
  corrupted by a stray log line, and on the MCP server **stdout is the protocol transport** —
  anything non-protocol written there breaks the session. All diagnostics go to stderr.

**MCP result contract**: tool results contain the response JSON as text content; failures
return the normalised error JSON with `isError: true`, so agents receive the same
`code`/`message`/`details` vocabulary as `--json` CLI consumers.

## 6. Extension points

### Adding a new operation (today)

1. **Schema** — add a zod input schema to `src/domain/schemas.ts`. Keep the current philosophy:
   validate the fields known to be required, `.passthrough()` the rest, so the CLI stays usable
   while the authoritative shapes remain pilot-gated.
2. **Registry** — append one `Operation` entry to `OPERATIONS` in `src/domain/registry.ts`
   (`resource`, `action`, `summary`, `method`, `path`, `input`, `kind`). Choose `kind: 'write'`
   for anything state-changing — that single field activates the `--yes` guard and the MCP
   `destructiveHint` automatically.
3. Done. `bkng <resource> <action>` and the `<resource>_<action>` MCP tool now exist with
   validation, auth, error handling, and safety semantics — no frontend code to write.
4. Optionally add a `+helper` in `src/cli/helpers.ts` if the operation deserves an ergonomic
   flag-based wrapper (the `+` prefix is the `gws` convention for curated helpers layered over
   raw operations).

### Codegen from the official OpenAPI spec (once pilot access is granted)

The registry was designed to be *replaceable by generated code*. The intended path:

1. Obtain the official OpenAPI document from Partner Centre and vendor a snapshot into the repo
   (e.g. `spec/demand-api.json`) with its version recorded.
2. Build a `scripts/codegen` step that maps the spec to the existing artifacts:
   `operationId`/tags → `resource`/`action`; `paths` + verbs → `method`/`path`; request-body
   JSON Schema → zod schemas (replacing today's hand-written, permissive ones with exact
   shapes); `summary` → `summary`. Derive `kind` from an explicit allowlist or spec extension —
   never guess writes.
3. Emit `src/domain/registry.gen.ts` + `src/domain/schemas.gen.ts` and have the hand-written
   files re-export them (keeping any local overrides in a small, reviewed shim).
4. Add a CI check that regenerates and diffs, so registry drift against the vendored spec fails
   the build — the same freshness guarantee `gws` gets from fetching the Discovery Document.

Because nothing outside `src/domain/` knows how the table was produced, this swap requires no
changes to `core`, `cli`, or `mcp`.

### Other seams

- **Auth scheme**: one function in `core/http.ts` (see §3).
- **Base URL / API version**: `--base-url` flag or `BOOKING_API_BASE_URL` (e.g. sandbox).
- **Output formats**: new renderers (e.g. the planned `--table`) slot into `src/cli/output.ts`
  without touching execution logic.
- **Testing**: `callOperation` uses global `fetch`, so tests stub `globalThis.fetch` — the test
  suite must never perform real network I/O (endpoint paths are provisional and pilot-gated).

## 7. Design invariants (checklist for contributors)

- The registry is the only place operations are defined; frontends are generated from it.
- Dependency direction: `domain ← core ← {cli, mcp}`; frontends never import each other.
- Immutability everywhere: `readonly` types, spread-construction, no in-place mutation.
- All external input crosses a zod boundary before it is used.
- Errors always pass through `normalizeError`; secrets and request bodies are never echoed.
- stdout is sacred: payload only (CLI) / protocol only (MCP). Humans read stderr.
- Write operations are inert without explicit confirmation (`--yes` / host gating).
- No hardcoded secrets; credentials come from env or the encrypted store only.
