import { defineConfig } from 'vitest/config'

/**
 * Unit-test configuration for booking-cli.
 *
 * Tests are deterministic and never touch the network: the HTTP client's
 * `fetch` is stubbed, and credential storage is redirected at a temporary
 * XDG_CONFIG_HOME so the real user config is untouched.
 *
 * Coverage is scoped to modules that carry real logic: the stable domain +
 * core modules, plus the CLI logic modules (input parsing, table/money
 * formatting, and the +book preview-then-create flow). Thin wiring modules that
 * only assemble the CLI / MCP surface (index, commands, execute, auth,
 * mcp/server, output/helpers) are left out of the denominator so the numbers
 * reflect the code where correctness actually matters.
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
        'src/cli/input.ts',
        'src/cli/format.ts',
        'src/cli/book.ts',
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
