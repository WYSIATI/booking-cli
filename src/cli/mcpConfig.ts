import type { Command } from 'commander'
import { ValidationError } from '../core/errors.js'
import { info, printResult, resolveOutputFormat, writeRaw } from './output.js'

/**
 * `mcp-config` — print a ready-to-paste MCP client configuration for any host.
 *
 * `claude mcp add` only serves Claude users; every other MCP host (Cursor,
 * Windsurf, Cline, VS Code, ...) is configured by pasting a JSON block. This
 * command makes the CLI self-configuring: it emits the correct block for the
 * requested dialect, so the provider-agnostic setup is one command:
 *
 *   npx -y -p github:WYSIATI/booking-cli bkng mcp-config
 *
 * Secrets are placeholders by default; --with-env embeds the values from the
 * current environment for users who want a finished file (warned on stderr).
 */

const CLIENTS = ['generic', 'vscode', 'claude'] as const
export type McpClient = (typeof CLIENTS)[number]

const GITHUB_PACKAGE = 'github:WYSIATI/booking-cli'
const PLACEHOLDERS = {
  BOOKING_API_KEY: 'your-api-key',
  BOOKING_AFFILIATE_ID: 'your-affiliate-id',
} as const

export interface McpConfigOptions {
  readonly client: McpClient
  readonly serverName: string
  /** Use the globally installed `bkng-mcp` binary instead of the npx runner. */
  readonly global: boolean
  /** Embed credential values from the current environment instead of placeholders. */
  readonly withEnv: boolean
}

const resolveEnvBlock = (withEnv: boolean): Record<string, string> =>
  Object.fromEntries(
    Object.entries(PLACEHOLDERS).map(([key, placeholder]) => [
      key,
      withEnv ? (process.env[key] ?? placeholder) : placeholder,
    ])
  )

interface ServerEntry {
  readonly command: string
  readonly args?: readonly string[]
  readonly env: Record<string, string>
}

const buildServerEntry = (opts: McpConfigOptions): ServerEntry => {
  const env = resolveEnvBlock(opts.withEnv)
  return opts.global
    ? { command: 'bkng-mcp', env }
    : { command: 'npx', args: ['-y', '-p', GITHUB_PACKAGE, 'bkng-mcp'], env }
}

/**
 * Build the config payload for a JSON dialect. `generic` is the `mcpServers`
 * shape shared by Claude Desktop, Cursor, Windsurf and Cline; `vscode` is the
 * `.vscode/mcp.json` shape (a `servers` map with an explicit stdio type).
 */
export const buildMcpConfig = (opts: McpConfigOptions): Record<string, unknown> => {
  const entry = buildServerEntry(opts)
  if (opts.client === 'vscode') {
    return { servers: { [opts.serverName]: { type: 'stdio', ...entry } } }
  }
  return { mcpServers: { [opts.serverName]: entry } }
}

/** Build the `claude mcp add` shell command for the Claude Code dialect. */
export const buildClaudeCommand = (opts: McpConfigOptions): string => {
  const entry = buildServerEntry(opts)
  const envFlags = Object.entries(entry.env)
    .map(([key, value]) => `-e ${key}=${value}`)
    .join(' ')
  const run = [entry.command, ...(entry.args ?? [])].join(' ')
  return `claude mcp add ${opts.serverName} ${envFlags} -- ${run}`
}

const parseClient = (value: string): McpClient => {
  if ((CLIENTS as readonly string[]).includes(value)) return value as McpClient
  throw new ValidationError(`Unknown --client "${value}"`, [
    `expected one of: ${CLIENTS.join(', ')}`,
  ])
}

export const registerMcpConfigCommand = (program: Command): void => {
  program
    .command('mcp-config')
    .description('Print a ready-to-paste MCP client config for any agent host')
    .option(
      '--client <name>',
      `config dialect: ${CLIENTS.join(' | ')}`,
      parseClient,
      'generic'
    )
    .option('--server-name <name>', 'server name key in the config', 'booking')
    .option('--global', 'use the installed bkng-mcp binary instead of npx')
    .option('--with-env', 'embed BOOKING_* values from the current environment')
    .action((opts, command) => {
      const options: McpConfigOptions = {
        client: opts.client,
        serverName: opts.serverName,
        global: Boolean(opts.global),
        withEnv: Boolean(opts.withEnv),
      }
      if (options.withEnv) {
        info('Embedding credentials from the environment — keep the output private.')
      }
      const format = resolveOutputFormat(command.optsWithGlobals())
      if (options.client === 'claude') {
        const claudeCommand = buildClaudeCommand(options)
        if (format === 'json') {
          printResult({ command: claudeCommand }, { format })
        } else {
          writeRaw(claudeCommand)
        }
        return
      }
      printResult(buildMcpConfig(options), { format })
    })
}
