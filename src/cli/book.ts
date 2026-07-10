import type { Command } from 'commander'
import { findOperation } from '../domain/registry.js'
import { resolveConfig } from '../core/config.js'
import { callOperation } from '../core/http.js'
import { resolveBody } from './input.js'
import type { BodyInputs } from './input.js'
import { extractTotal } from './format.js'
import { info, printResult, resolveOutputFormat } from './output.js'
import type { OutputFormat } from './output.js'

/**
 * `+book` — the safe end-to-end booking flow.
 *
 * It always runs `orders preview` first (a read) and surfaces the final total,
 * then refuses to call `orders create` (a write that charges money) unless the
 * caller passes --yes. This mirrors the write-op guard in execute.ts: no state
 * change happens without explicit confirmation, but here we still perform the
 * useful preview so a human — or an agent — can inspect the total before paying.
 */

export interface BookContext {
  readonly format: OutputFormat
  readonly affiliateId?: string
  readonly baseUrl?: string
  readonly yes: boolean
  readonly body: BodyInputs
}

/**
 * Injectable collaborators for `runBook`. Production wiring uses the real
 * config/http modules; tests substitute stubs so the preview/confirm branches
 * are exercised without touching credentials or the network.
 */
export interface BookDeps {
  readonly resolveConfig: typeof resolveConfig
  readonly callOperation: typeof callOperation
}

const defaultDeps: BookDeps = { resolveConfig, callOperation }

export const runBook = async (
  ctx: BookContext,
  deps: BookDeps = defaultDeps,
): Promise<void> => {
  const previewOp = findOperation('orders', 'preview')
  const createOp = findOperation('orders', 'create')
  if (!previewOp || !createOp) {
    throw new Error('orders preview/create operations are not registered')
  }

  const config = await deps.resolveConfig({
    ...(ctx.affiliateId ? { affiliateId: ctx.affiliateId } : {}),
    ...(ctx.baseUrl ? { baseUrl: ctx.baseUrl } : {}),
  })
  const body = await resolveBody(ctx.body)

  const preview = await deps.callOperation(previewOp, body, config)
  const total = extractTotal(preview)
  info(
    total
      ? `Preview total: ${total}`
      : 'Preview complete (no total field detected in the response).',
  )

  if (!ctx.yes) {
    info('Nothing was booked. Re-run with --yes to confirm and create this order.')
    printResult({ status: 'previewed', confirmed: false, preview }, { format: ctx.format })
    return
  }

  const order = await deps.callOperation(createOp, body, config)
  info('Booking confirmed.')
  printResult(
    { status: 'created', confirmed: true, preview, order },
    { format: ctx.format },
  )
}

export const registerBookCommand = (program: Command): void => {
  program
    .command('+book')
    .description('Preview an order total, then create the booking once confirmed with --yes')
    .option('-d, --data <json>', 'Order body as an inline JSON object')
    .option('--file <path>', 'Read the order body from a JSON file')
    .option('--stdin', 'Read the order body from stdin')
    .option('--yes', 'Confirm the preview and create the booking (charges the payment method)')
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals()
      await runBook({
        format: resolveOutputFormat(globals),
        affiliateId: globals.affiliateId,
        baseUrl: globals.baseUrl,
        yes: Boolean(opts.yes),
        body: { json: opts.data, file: opts.file, stdin: opts.stdin },
      })
    })
}
