import type { Command } from 'commander'
import { OPERATIONS, resources } from '../domain/registry.js'
import { executeOperation } from './execute.js'
import { resolveOutputFormat } from './output.js'

/**
 * Generate the CLI command tree from the operation registry — the direct analog
 * of `gws` building its tree from Google's Discovery Document. Add an entry to
 * OPERATIONS and a fully-wired `bkng <resource> <action>` command appears here
 * automatically.
 */

export const registerOperationCommands = (program: Command): void => {
  for (const resource of resources()) {
    const group = program
      .command(resource)
      .description(`Operations on ${resource}`)

    for (const op of OPERATIONS.filter((o) => o.resource === resource)) {
      const cmd = group
        .command(op.action)
        .description(op.summary)
        .option('-d, --data <json>', 'Request body as an inline JSON object')
        .option('--file <path>', 'Read the request body from a JSON file')
        .option('--stdin', 'Read the request body from stdin')

      if (op.kind === 'write') {
        cmd.option('--yes', 'Confirm this state-changing operation (required)')
      }

      cmd.action(async (opts, command) => {
        const globals = command.optsWithGlobals()
        await executeOperation(op, {
          format: resolveOutputFormat(globals),
          affiliateId: globals.affiliateId,
          baseUrl: globals.baseUrl,
          yes: Boolean(opts.yes),
          body: { json: opts.data, file: opts.file, stdin: opts.stdin },
        })
      })
    }
  }
}
