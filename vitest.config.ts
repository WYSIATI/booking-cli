import { defineConfig } from 'vitest/config'

/**
 * Unit-test configuration for booking-cli.
 *
 * Tests are deterministic and never touch the network: the HTTP client's
 * `fetch` is stubbed, and credential storage is redirected at a temporary
 * XDG_CONFIG_HOME so the real user config is untouched.
 *
 * Coverage is scoped to modules that carry real logic: the stable domain +
 * core modules, the CLI logic modules (input parsing, table/money formatting,
 * and the +book preview-then-create flow), and the CLI wiring modules
 * (commands, execute, output) — the wiring carries the --yes write guard and
 * the stdout/stderr output contract, so it belongs in the denominator. The
 * remaining thin assembly modules (index, auth, helpers, mcp/server) stay out
 * so the numbers reflect the code where correctness actually matters.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/domain/schemas.ts',
        'src/domain/registry.ts',
        'src/core/errors.ts',
        'src/core/credentials.ts',
        'src/core/config.ts',
        'src/core/http.ts',
        'src/core/version.ts',
        'src/mcp/build.ts',
        'src/cli/input.ts',
        'src/cli/format.ts',
        'src/cli/book.ts',
        'src/cli/commands.ts',
        'src/cli/execute.ts',
        'src/cli/output.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
