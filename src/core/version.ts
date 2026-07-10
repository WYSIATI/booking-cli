import { createRequire } from 'node:module'

/**
 * Single source of truth for the package version at runtime. package.json owns
 * the number; both the CLI (`bkng --version`) and the MCP server read it from
 * here so a release bump touches exactly one file.
 *
 * We deliberately use `createRequire` instead of a TypeScript JSON import:
 * package.json lives outside the compiler's rootDir, and a JSON import would
 * drag it into the emitted layout. The lookup works from both `src/` (tsx) and
 * `dist/` (built) because both sit one directory level below the package root.
 */

const FALLBACK_VERSION = '0.0.0'

const readVersion = (): string => {
  try {
    const req = createRequire(import.meta.url)
    const pkg = req('../../package.json') as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : FALLBACK_VERSION
  } catch {
    // A missing or unreadable package.json must never crash the CLI over a
    // cosmetic string — fall back silently.
    return FALLBACK_VERSION
  }
}

export const VERSION: string = readVersion()
