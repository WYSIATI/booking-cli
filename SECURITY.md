# Security Policy

## Supported Versions

booking-cli is pre-1.0. Only the latest published minor of the 0.x line
receives security fixes.

| Version      | Supported |
| ------------ | --------- |
| latest 0.x   | Yes       |
| older 0.x    | No        |

## Reporting a Vulnerability

Please do **not** open a public issue for security problems.

Report privately via GitHub's private vulnerability reporting on the
repository: <https://github.com/WYSIATI/booking-cli/security/advisories/new>
(Security tab → "Report a vulnerability"). There is no security email
address for this project.

This is a volunteer-maintained open-source project. Reports are handled on
a best-effort basis — you can expect an acknowledgement, but there is no
guaranteed response time, no SLA, and no bug bounty.

## Scope Notes

Things worth knowing about how this tool handles sensitive data:

- **Credential transmission.** API credentials are sent only to the
  configured base URL, which is validated to be `https:` before any request
  is made. Bypassing or weakening that guard would be a vulnerability.
- **Credential storage.** When `BOOKING_CLI_SECRET` is set, credentials are
  stored at rest encrypted with AES-256-GCM. Without it, credentials are
  stored in plaintext and the CLI prints a warning — that plaintext fallback
  is by design, not a vulnerability, but weaknesses in the encrypted path are
  in scope.
- **Secret hygiene.** Secrets must never appear in logs, error messages, or
  stdout/stderr output. Any code path that leaks a credential is in scope.
- **Write-operation gating.** Mutating API operations require explicit
  confirmation (`--yes` in the CLI, `confirm: true` in the MCP server). Any
  way to trigger a write without that confirmation is in scope.

Vulnerabilities in the Booking.com Demand API itself should be reported to
Booking.com, not here — this is an unofficial client.
