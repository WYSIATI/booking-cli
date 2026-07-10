# booking-cli (`bkng`)

**The CLI for connecting Booking.com — built for humans and AI agents.**

[![CI](https://github.com/WYSIATI/booking-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/WYSIATI/booking-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >= 20.19](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen.svg)](package.json)

One unified command surface over the Booking.com **Demand API**: search stays, check availability, read reviews, preview and create orders — from your terminal, your scripts, or any MCP-capable AI agent. Every operation is defined once in a registry and exposed twice: as a `bkng` CLI command and as a `bkng-mcp` tool.

This is an **unofficial, open-source** project. It is not affiliated with or endorsed by Booking.com.

---

## Partner access required

The Booking.com Demand API is **not self-serve**. To obtain an API key you must be an approved **Managed Affiliate Partner** with access to Partner Centre, and creating real bookings additionally requires **PCI DSS compliance** and the appropriate contracts. See the official [prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites).

Without credentials you can still install `bkng` and explore the full command tree — live calls will simply return an auth error. The API is currently pilot-gated, so endpoint paths modelled here are provisional; they live in one file ([`src/domain/registry.ts`](src/domain/registry.ts)) and are reconciled against the official OpenAPI spec as access allows.

## Quickstart

Requires Node.js >= 20.19.

```bash
git clone https://github.com/WYSIATI/booking-cli.git && cd booking-cli
npm install
npm run build
npm link        # exposes `bkng` and `bkng-mcp` globally
```

```bash
bkng --help
```

## Authentication

Credentials resolve from environment variables first (best for CI and agents), then from stored login.

```bash
# Option A — environment variables (recommended for agents/CI)
export BOOKING_API_KEY=...          # sent as: Authorization: Bearer <key>
export BOOKING_AFFILIATE_ID=...     # sent as: X-Affiliate-Id: <id>

# Option B — stored login
export BOOKING_CLI_SECRET=a-strong-passphrase   # enables AES-256-GCM encryption at rest
bkng auth login --api-key ... --affiliate-id ...
bkng auth status
bkng auth logout
```

Stored credentials live in `~/.config/booking-cli/credentials.json` (respects `XDG_CONFIG_HOME`). When `BOOKING_CLI_SECRET` is set, the API key is encrypted at rest with AES-256-GCM; without it, `bkng` stores plaintext and warns you. See [`.env.example`](.env.example) for all variables.

## Usage — humans

### Helpers

Ergonomic `+`-prefixed helpers wrap common flows with friendly flags, so you don't hand-build JSON:

```bash
# Search stays with simple flags
bkng +find-hotel --city-id 2140479 --checkin 2026-08-01 --checkout 2026-08-03 --adults 2

# End-to-end booking: runs `orders preview`, shows the final total, then asks for
# confirmation on a terminal (pass --yes for scripts/agents/CI). If your body has no
# order_reference, +book generates a `bkng-` one (idempotency key) and prints it.
bkng +book --file ./order.json --yes
```

### Raw operations

Every Demand API operation is available as `bkng <resource> <action>`, taking the request body from `-d/--data`, `--file`, or `--stdin`:

```bash
bkng accommodations search -d '{"city_id":2140479,"checkin":"2026-08-01","checkout":"2026-08-03"}'
bkng accommodations availability --file ./req.json
echo '{"accommodation":12345}' | bkng accommodations reviews --stdin
```

### Output modes

Payloads go to **stdout**; status and errors go to **stderr** — so piping stays clean.

```bash
# Machine-readable envelope for scripting: { "ok": true, "data": ... }
bkng --json accommodations search -d '{ ... }'

# Compact table output for human eyes
bkng --table +find-hotel --city-id 2140479 --checkin 2026-08-01 --checkout 2026-08-03
```

Global flags: `--json`, `--table`, `--affiliate-id <id>`, `--base-url <url>`.

### Booking flow (guarded)

State-changing operations (`orders create`, `orders cancel`) **refuse to run without `--yes`**, so neither a typo nor an agent can accidentally charge a card:

```bash
bkng orders preview -d '{ ... }'          # safe: validates and returns the final total
bkng orders create  -d '{ ... }' --yes    # refuses without --yes
bkng orders cancel  -d '{"order_id":"..."}' --yes
```

Always run `orders preview` first and confirm the final price before creating.

## Usage — AI agents (MCP)

`bkng-mcp` is an [MCP](https://modelcontextprotocol.io) server speaking stdio. It exposes every registry operation as a tool (`accommodations_search`, `orders_preview`, ...) with the same zod input schemas the CLI validates against — humans and agents hit an identical surface.

Example client config (Claude Desktop or any MCP host):

```json
{
  "mcpServers": {
    "booking": {
      "command": "bkng-mcp",
      "env": {
        "BOOKING_API_KEY": "your-api-key",
        "BOOKING_AFFILIATE_ID": "your-affiliate-id"
      }
    }
  }
}
```

Tool annotations do the safety work:

- Read tools (`accommodations_*`, `orders_preview`, `orders_details`) carry `readOnlyHint`.
- `orders_create` and `orders_cancel` carry `destructiveHint`, so MCP hosts gate them behind explicit user confirmation.

## Architecture

```
Booking.com OpenAPI spec (official, partner-only)
        |  reconcile once
        v
src/domain/registry.ts       <- single source of truth (operations table)
        |
        +-- src/cli/*         <- command tree generated from the registry  ->  bkng
        +-- src/mcp/server.ts <- same operations exposed as MCP tools      ->  bkng-mcp
```

Add an operation to the registry once, get a CLI command **and** an MCP tool for free. Full design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Project layout

| Path | Responsibility |
|------|----------------|
| `src/domain/registry.ts` | Operations table — the spec stand-in. **Edit this to track the API.** |
| `src/domain/schemas.ts` | zod input schemas per operation |
| `src/core/http.ts` | Demand API client (auth headers, POST, error normalisation) |
| `src/core/config.ts` | Credential resolution (env -> stored) |
| `src/core/credentials.ts` | Encrypted-at-rest credential storage |
| `src/core/errors.ts` | Normalised error types shared by CLI and MCP |
| `src/cli/*` | Command-tree generation, helpers, input/output |
| `src/mcp/server.ts` | MCP server over the same registry |

## Roadmap and contributing

The roadmap lives in [docs/ROADMAP.md](docs/ROADMAP.md). Contributions are welcome — the most valuable one is reconciling registry paths/schemas against the official spec if you have pilot access. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © 2026 WYSIATI. This is an independent open-source project; "Booking.com" is a trademark of its respective owner.
