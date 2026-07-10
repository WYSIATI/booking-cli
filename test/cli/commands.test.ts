import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { registerOperationCommands } from '../../src/cli/commands.js'
import { executeOperation } from '../../src/cli/execute.js'
import { OPERATIONS } from '../../src/domain/registry.js'

/**
 * `registerOperationCommands` generates the whole `bkng <resource> <action>`
 * tree from the operation registry. We assert the generated structure (every
 * registry entry becomes a command, write ops gain --yes) and the wiring: the
 * action handler must hand `executeOperation` an ExecuteContext that reflects
 * the parsed flags. `executeOperation` itself is mocked — no config, network,
 * or stdout is touched here.
 */

vi.mock('../../src/cli/execute.js', () => ({
  executeOperation: vi.fn(async () => undefined),
}))

const executeMock = vi.mocked(executeOperation)

/** Fresh program with the same global flags `bkng` registers in src/index.ts. */
const buildProgram = (): Command => {
  const program = new Command()
  program
    .name('bkng')
    .exitOverride()
    .option('--json', 'Emit a machine-readable { ok, data } envelope on stdout')
    .option('--table', 'Render results as aligned text tables')
    .option('--affiliate-id <id>', 'Override the affiliate id for this call')
    .option('--base-url <url>', 'Override the API base URL')
  registerOperationCommands(program)
  return program
}

const findGroup = (program: Command, resource: string): Command | undefined =>
  program.commands.find((command) => command.name() === resource)

const findAction = (
  program: Command,
  resource: string,
  action: string
): Command | undefined =>
  findGroup(program, resource)?.commands.find((command) => command.name() === action)

const longFlags = (command: Command): string[] =>
  command.options.map((option) => option.long ?? option.flags)

describe('registerOperationCommands', () => {
  beforeEach(() => {
    executeMock.mockClear()
  })

  describe('generated command tree', () => {
    it('creates a <resource> group with an <action> subcommand for every operation', () => {
      const program = buildProgram()
      for (const op of OPERATIONS) {
        const group = findGroup(program, op.resource)
        expect(group, `missing group for resource "${op.resource}"`).toBeDefined()
        const action = findAction(program, op.resource, op.action)
        expect(action, `missing command "${op.resource} ${op.action}"`).toBeDefined()
        expect(action?.description()).toBe(op.summary)
      }
    })

    it('gives every action command the -d/--data, --file, and --stdin body options', () => {
      const program = buildProgram()
      for (const op of OPERATIONS) {
        const action = findAction(program, op.resource, op.action)
        expect(action).toBeDefined()
        if (!action) continue
        expect(longFlags(action)).toEqual(
          expect.arrayContaining(['--data', '--file', '--stdin'])
        )
        const data = action.options.find((option) => option.long === '--data')
        expect(data?.short, `${op.resource} ${op.action} --data short flag`).toBe('-d')
      }
    })

    it('adds --yes to write operations only (orders create, orders cancel)', () => {
      const program = buildProgram()
      const writeOps = OPERATIONS.filter((op) => op.kind === 'write')
      expect(writeOps.map((op) => `${op.resource} ${op.action}`).sort()).toEqual([
        'orders cancel',
        'orders create',
      ])

      for (const op of OPERATIONS) {
        const action = findAction(program, op.resource, op.action)
        expect(action).toBeDefined()
        if (!action) continue
        const hasYes = longFlags(action).includes('--yes')
        expect(hasYes, `"${op.resource} ${op.action}" (${op.kind}) --yes presence`).toBe(
          op.kind === 'write'
        )
      }
    })
  })

  describe('action handler wiring', () => {
    it('passes a default ExecuteContext (pretty format, yes false) for a read op', async () => {
      const program = buildProgram()
      await program.parseAsync(['node', 'bkng', 'accommodations', 'search', '-d', '{}'])

      expect(executeMock).toHaveBeenCalledTimes(1)
      const [operation, ctx] = executeMock.mock.calls[0] ?? []
      expect(operation).toMatchObject({ resource: 'accommodations', action: 'search' })
      expect(ctx).toMatchObject({
        format: 'pretty',
        yes: false,
        body: { json: '{}' },
      })
      expect(ctx?.affiliateId).toBeUndefined()
      expect(ctx?.baseUrl).toBeUndefined()
    })

    it('passes yes: true when a write op is confirmed with --yes', async () => {
      const program = buildProgram()
      await program.parseAsync(['node', 'bkng', 'orders', 'create', '--yes', '-d', '{}'])

      expect(executeMock).toHaveBeenCalledTimes(1)
      const [operation, ctx] = executeMock.mock.calls[0] ?? []
      expect(operation).toMatchObject({ resource: 'orders', action: 'create' })
      expect(ctx).toMatchObject({ yes: true, format: 'pretty' })
    })

    it('resolves the global --json flag to the json output format', async () => {
      const program = buildProgram()
      await program.parseAsync([
        'node',
        'bkng',
        '--json',
        'accommodations',
        'search',
        '-d',
        '{}',
      ])

      expect(executeMock).toHaveBeenCalledTimes(1)
      const [, ctx] = executeMock.mock.calls[0] ?? []
      expect(ctx?.format).toBe('json')
    })

    it('forwards the global affiliate/base-url overrides into the context', async () => {
      const program = buildProgram()
      await program.parseAsync([
        'node',
        'bkng',
        '--affiliate-id',
        'aff-9',
        '--base-url',
        'https://sandbox.example.test',
        'orders',
        'details',
        '-d',
        '{}',
      ])

      expect(executeMock).toHaveBeenCalledTimes(1)
      const [, ctx] = executeMock.mock.calls[0] ?? []
      expect(ctx).toMatchObject({
        affiliateId: 'aff-9',
        baseUrl: 'https://sandbox.example.test',
      })
    })
  })
})
