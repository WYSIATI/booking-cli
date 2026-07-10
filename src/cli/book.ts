import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
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
 * then only calls `orders create` (a write that charges money) once the caller
 * confirms — with --yes (the agent/CI path), or interactively when stdin and
 * stderr are both TTYs. In a pipe without --yes nothing is ever booked. Before
 * creating, we also guarantee the body carries an `order_reference`
 * idempotency key so a retried create after a network blip cannot double-book.
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
 * config/http modules and a readline prompt; tests substitute stubs so the
 * preview/confirm branches are exercised without touching credentials, the
 * network, or stdin.
 */
export interface BookDeps {
  readonly resolveConfig: typeof resolveConfig
  readonly callOperation: typeof callOperation
  readonly confirm?: (question: string) => Promise<boolean>
}

const defaultDeps: BookDeps = { resolveConfig, callOperation }

const CONFIRM_QUESTION = 'Create this booking? This charges the payment method. [y/N] '

/**
 * Default interactive confirmation. The question goes to stderr so stdout
 * stays a clean machine payload, and only an explicit "y"/"yes" (any case)
 * proceeds — anything else, including just pressing enter, declines. The
 * readline interface is always closed, even if the read is interrupted.
 */
const askOnTerminal = async (question: string): Promise<boolean> => {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await rl.question(question)
    return ['y', 'yes'].includes(answer.trim().toLowerCase())
  } finally {
    rl.close()
  }
}

/**
 * Decide whether to proceed from preview to create. --yes always proceeds;
 * otherwise we only ask on a real terminal (stdin AND stderr must be TTYs) so
 * a pipe can never hang on a hidden prompt — it stays preview-only.
 */
const confirmCreate = async (ctx: BookContext, deps: BookDeps): Promise<boolean> => {
  if (ctx.yes) {
    return true
  }
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    info('Nothing was booked. Re-run with --yes to confirm and create this order.')
    return false
  }
  const confirmed = await (deps.confirm ?? askOnTerminal)(CONFIRM_QUESTION)
  if (!confirmed) {
    info('Nothing was booked.')
  }
  return confirmed
}

/**
 * Guarantee the create call carries an `order_reference` idempotency key. A
 * caller-supplied reference passes through untouched; otherwise we derive a
 * new body (immutably — the previewed body is never mutated) with a generated
 * `bkng-` reference so a retried create cannot double-book.
 */
const ensureOrderReference = (body: Record<string, unknown>): Record<string, unknown> =>
  body.order_reference === undefined
    ? { ...body, order_reference: `bkng-${randomUUID()}` }
    : body

export const runBook = async (
  ctx: BookContext,
  deps: BookDeps = defaultDeps
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
      : 'Preview complete (no total field detected in the response).'
  )

  if (!(await confirmCreate(ctx, deps))) {
    printResult(
      { status: 'previewed', confirmed: false, preview },
      { format: ctx.format }
    )
    return
  }

  const createBody = ensureOrderReference(body)
  info(`Order reference: ${String(createBody.order_reference)}`)
  const order = await deps.callOperation(createOp, createBody, config)
  info('Booking confirmed.')
  printResult(
    {
      status: 'created',
      confirmed: true,
      order_reference: createBody.order_reference,
      preview,
      order,
    },
    { format: ctx.format }
  )
}

export const registerBookCommand = (program: Command): void => {
  program
    .command('+book')
    .description(
      'Preview an order total, then create the booking once confirmed interactively or with --yes'
    )
    .option('-d, --data <json>', 'Order body as an inline JSON object')
    .option('--file <path>', 'Read the order body from a JSON file')
    .option('--stdin', 'Read the order body from stdin')
    .option(
      '--yes',
      'Skip the interactive prompt and create the booking (charges the payment method)'
    )
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
