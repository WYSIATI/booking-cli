import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * ESLint v9 flat config.
 *
 * Layers, in order of precedence (later wins):
 *   1. Ignore build output and dependencies.
 *   2. @eslint/js recommended — baseline JS correctness rules.
 *   3. typescript-eslint recommended — TS-aware linting (parser + rules).
 *   4. Project rules + Node globals for all TypeScript sources.
 *   5. Test-file overrides (Vitest globals).
 *   6. eslint-config-prettier LAST — disables stylistic rules that would
 *      conflict with Prettier, so formatting is owned solely by Prettier.
 */
export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow intentionally-unused args/vars when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        // Vitest globals (available when `globals: true` is set in Vitest config).
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        suite: 'readonly',
        expectTypeOf: 'readonly',
      },
    },
  },
  prettier
)
