#!/usr/bin/env node
import { Command } from 'commander'
import { registerOperationCommands } from './cli/commands.js'
import { registerAuthCommands } from './cli/auth.js'
import { registerHelperCommands } from './cli/helpers.js'
import { printError, resolveOutputFormat } from './cli/output.js'

/**
 * `bkng` — one CLI for the Booking.com Demand API, built for humans and AI agents.
 *
 * Command tree is generated from the operation registry (src/domain/registry.ts),
 * so this file only wires global options, auth, helpers, and error handling.
 */

const buildProgram = (): Command => {
  const program = new Command()
  program
    .name('bkng')
    .description(
      'Unofficial CLI for the Booking.com Demand API — for humans and AI agents.',
    )
    .version('0.1.0')
    .option('--json', 'Emit a machine-readable { ok, data } envelope on stdout')
    .option('--table', 'Render results as aligned text tables (ignored when --json is set)')
    .option('--affiliate-id <id>', 'Override the affiliate id for this call')
    .option('--base-url <url>', 'Override the API base URL (e.g. sandbox)')
    .showHelpAfterError()

  registerAuthCommands(program)
  registerOperationCommands(program)
  registerHelperCommands(program)
  return program
}

const main = async (): Promise<void> => {
  const program = buildProgram()
  try {
    await program.parseAsync(process.argv)
  } catch (error) {
    printError(error, { format: resolveOutputFormat(program.opts()) })
    process.exitCode = 1
  }
}

void main()
