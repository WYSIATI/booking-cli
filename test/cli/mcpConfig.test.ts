import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import {
  buildClaudeCommand,
  buildMcpConfig,
  registerMcpConfigCommand,
} from '../../src/cli/mcpConfig.js'
import type { McpConfigOptions } from '../../src/cli/mcpConfig.js'

/**
 * `mcp-config` prints a ready-to-paste MCP client configuration. The builders
 * are pure; the command test drives a real commander parse and captures stdout.
 */

const baseOptions: McpConfigOptions = {
  client: 'generic',
  serverName: 'booking',
  global: false,
  withEnv: false,
}

const ENV_KEYS = ['BOOKING_API_KEY', 'BOOKING_AFFILIATE_ID'] as const

describe('buildMcpConfig', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('emits the generic mcpServers shape with the npx runner and placeholders', () => {
    const config = buildMcpConfig(baseOptions)
    expect(config).toEqual({
      mcpServers: {
        booking: {
          command: 'npx',
          args: ['-y', '-p', 'github:WYSIATI/booking-cli', 'bkng-mcp'],
          env: {
            BOOKING_API_KEY: 'your-api-key',
            BOOKING_AFFILIATE_ID: 'your-affiliate-id',
          },
        },
      },
    })
  })

  it('emits the vscode servers shape with an explicit stdio type', () => {
    const config = buildMcpConfig({ ...baseOptions, client: 'vscode' })
    const servers = (config as { servers: Record<string, { type: string }> }).servers
    expect(servers.booking?.type).toBe('stdio')
    expect(config).not.toHaveProperty('mcpServers')
  })

  it('uses the installed binary and no args when global is set', () => {
    const config = buildMcpConfig({ ...baseOptions, global: true })
    const entry = (
      config as { mcpServers: Record<string, { command: string; args?: unknown }> }
    ).mcpServers.booking
    expect(entry?.command).toBe('bkng-mcp')
    expect(entry?.args).toBeUndefined()
  })

  it('respects a custom server name', () => {
    const config = buildMcpConfig({ ...baseOptions, serverName: 'hotels' })
    expect(config).toHaveProperty('mcpServers.hotels')
  })

  it('embeds environment values only when withEnv is set', () => {
    process.env.BOOKING_API_KEY = 'real-key'
    process.env.BOOKING_AFFILIATE_ID = 'real-aff'

    const withEnv = buildMcpConfig({ ...baseOptions, withEnv: true })
    const entry = (
      withEnv as { mcpServers: Record<string, { env: Record<string, string> }> }
    ).mcpServers.booking
    expect(entry?.env).toEqual({
      BOOKING_API_KEY: 'real-key',
      BOOKING_AFFILIATE_ID: 'real-aff',
    })

    const without = buildMcpConfig(baseOptions)
    const plain = (
      without as { mcpServers: Record<string, { env: Record<string, string> }> }
    ).mcpServers.booking
    expect(plain?.env.BOOKING_API_KEY).toBe('your-api-key')
  })

  it('falls back to placeholders when withEnv is set but the env is empty', () => {
    const config = buildMcpConfig({ ...baseOptions, withEnv: true })
    const entry = (
      config as { mcpServers: Record<string, { env: Record<string, string> }> }
    ).mcpServers.booking
    expect(entry?.env.BOOKING_API_KEY).toBe('your-api-key')
  })
})

describe('buildClaudeCommand', () => {
  it('produces a claude mcp add one-liner with env flags and the npx runner', () => {
    const command = buildClaudeCommand({ ...baseOptions, client: 'claude' })
    expect(command).toBe(
      'claude mcp add booking ' +
        '-e BOOKING_API_KEY=your-api-key -e BOOKING_AFFILIATE_ID=your-affiliate-id ' +
        '-- npx -y -p github:WYSIATI/booking-cli bkng-mcp'
    )
  })

  it('uses the installed binary when global is set', () => {
    const command = buildClaudeCommand({ ...baseOptions, client: 'claude', global: true })
    expect(command.endsWith('-- bkng-mcp')).toBe(true)
  })
})

describe('mcp-config command wiring', () => {
  let stdout: string[]
  let stderr: string[]

  beforeEach(() => {
    stdout = []
    stderr = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command()
    program.exitOverride()
    program.option('--json', 'machine envelope').option('--table', 'table output')
    registerMcpConfigCommand(program)
    await program.parseAsync(['node', 'bkng', 'mcp-config', ...args])
  }

  it('prints parseable generic JSON to stdout by default', async () => {
    await run()
    const payload = JSON.parse(stdout.join(''))
    expect(payload).toHaveProperty('mcpServers.booking.command', 'npx')
  })

  it('prints the raw claude one-liner (no JSON quoting) for --client claude', async () => {
    await run('--client', 'claude')
    const line = stdout.join('')
    expect(line.startsWith('claude mcp add booking ')).toBe(true)
    expect(line).not.toContain('"')
  })

  it('wraps the claude command in the envelope under --json', async () => {
    const program = new Command()
    program.exitOverride()
    program.option('--json').option('--table')
    registerMcpConfigCommand(program)
    await program.parseAsync([
      'node',
      'bkng',
      '--json',
      'mcp-config',
      '--client',
      'claude',
    ])
    const payload = JSON.parse(stdout.join(''))
    expect(payload.ok).toBe(true)
    expect(payload.data.command).toContain('claude mcp add booking')
  })

  it('rejects an unknown client dialect', async () => {
    await expect(run('--client', 'nonsense')).rejects.toThrow(/Unknown --client/)
  })

  it('warns on stderr when embedding env values, keeping stdout clean JSON', async () => {
    await run('--with-env')
    expect(stderr.join('')).toContain('keep the output private')
    expect(() => JSON.parse(stdout.join(''))).not.toThrow()
  })
})
