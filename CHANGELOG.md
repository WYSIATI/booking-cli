# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Registry-driven `bkng` CLI covering accommodations and orders operations, plus `+find-hotel` and `+book` helper commands.
- `--json` / `--table` output modes with machine-readable payload on stdout only.
- `auth login` / `auth status` / `auth logout` with AES-256-GCM at-rest credential encryption (via `BOOKING_CLI_SECRET`).
- `bkng-mcp` MCP server exposing per-operation tools with confirm-gated write operations.
- HTTPS-only base-URL guard for all API requests.
- Request timeout on every API call (30s default, `BOOKING_HTTP_TIMEOUT_MS` to override).
- `+book` generates an idempotent `order_reference` (`bkng-<uuid>`) when the order body has none, guarding against duplicate bookings on retry.
- `+book` asks for interactive confirmation on a terminal after showing the previewed total; `--yes` remains the non-interactive path and piped runs stay preview-only.
- Unit test suite with a coverage gate.
- CI workflow across Node 20, 22, and 24, including lint and format checks.
- One-liner install and MCP setup straight from GitHub (`npx -y -p github:WYSIATI/booking-cli bkng-mcp`), enabled by a `prepare` script that builds on install.
- `bkng mcp-config`: provider-agnostic, self-configuring MCP setup — prints a ready-to-paste config for any host (generic `mcpServers`, `--client vscode`, `--client claude`), with `--server-name`, `--global` and `--with-env` variants.

### Changed

- Minimum supported Node.js is now 20.19 — Node 18 reached end-of-life in
  April 2025 and the upgraded toolchain (ESLint 10, Vitest 4) no longer runs
  on it. The CI matrix covers Node 20, 22, and 24.
- CLI and MCP server version is single-sourced from `package.json`.
- MCP server construction split into an importable module (`src/mcp/build.ts`), making the tool surface unit-testable.
