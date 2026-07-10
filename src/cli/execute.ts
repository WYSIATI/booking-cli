import type { Operation } from '../domain/registry.js'
import { resolveConfig } from '../core/config.js'
import { callOperation } from '../core/http.js'
import { printResult } from './output.js'
import type { OutputFormat } from './output.js'
import type { BodyInputs } from './input.js'
import { resolveBody } from './input.js'

/**
 * Shared execution path for every generated operation command. Keeps the
 * per-command wiring in commands.ts trivial and the behaviour identical across
 * the whole CLI surface.
 */

export interface ExecuteContext {
  readonly format: OutputFormat
  readonly affiliateId?: string
  readonly baseUrl?: string
  readonly yes?: boolean
  readonly body: BodyInputs
}

export const executeOperation = async (
  operation: Operation,
  ctx: ExecuteContext
): Promise<void> => {
  if (operation.kind === 'write' && !ctx.yes) {
    throw new Error(
      `\`${operation.resource} ${operation.action}\` mutates a real booking and is refused ` +
        'without explicit confirmation. Re-run with --yes once you have verified the request ' +
        '(run `orders preview` first).'
    )
  }

  const config = await resolveConfig({
    ...(ctx.affiliateId ? { affiliateId: ctx.affiliateId } : {}),
    ...(ctx.baseUrl ? { baseUrl: ctx.baseUrl } : {}),
  })
  const body = await resolveBody(ctx.body)
  const data = await callOperation(operation, body, config)
  printResult(data, { format: ctx.format })
}
