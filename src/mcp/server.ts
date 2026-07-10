#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { OPERATIONS } from '../domain/registry.js'
import { resolveConfig } from '../core/config.js'
import { callOperation } from '../core/http.js'
import { normalizeError, ValidationError } from '../core/errors.js'

/**
 * MCP server exposing every registry operation as an agent tool. Tool names are
 * `<resource>_<action>`; input schemas are the same zod shapes the CLI uses, so
 * humans and agents hit an identical surface.
 *
 * Write operations (create/cancel an order) charge a real payment method or
 * cancel a real booking. The `destructiveHint` annotation is advisory and a host
 * MAY ignore it, so it is NOT sufficient on its own. We enforce a server-side
 * gate that mirrors the CLI's `--yes` guard: write tools carry an explicit
 * `confirm` boolean in their input schema and are refused unless it is `true`.
 * An agent therefore cannot book or cancel unconfirmed.
 */

const toolName = (resource: string, action: string): string => `${resource}_${action}`

/**
 * Confirmation flag injected into every write tool's input schema. Modelled on
 * the CLI's `--yes`: the caller must consciously opt in before money moves.
 */
const CONFIRM_FIELD = z
  .boolean()
  .describe(
    'Required for this write operation. Must be set to true to confirm a real, ' +
      'money-affecting booking action (it charges the payment method or cancels a ' +
      'real booking). Omitted or false, the operation is refused. Mirrors the CLI --yes guard.',
  )

/**
 * Enforce the write-op confirmation gate and strip the control field from the
 * body, returning the payload to forward to the API. Reads pass through untouched.
 */
const gateWrite = (
  op: (typeof OPERATIONS)[number],
  args: Record<string, unknown>,
): Record<string, unknown> => {
  if (op.kind !== 'write') return args
  const { confirm, ...payload } = args
  if (confirm !== true) {
    throw new ValidationError(
      `\`${op.resource} ${op.action}\` mutates a real booking and is refused without ` +
        'explicit confirmation. Re-send with "confirm": true once you have verified the ' +
        'request (call orders_preview first).',
      ['confirm must be true for write operations'],
    )
  }
  return payload
}

const runTool = async (
  op: (typeof OPERATIONS)[number],
  args: Record<string, unknown>,
) => {
  try {
    const payload = gateWrite(op, args)
    const config = await resolveConfig()
    const data = await callOperation(op, payload, config)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  } catch (error) {
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(normalizeError(error), null, 2) },
      ],
      isError: true,
    }
  }
}

/**
 * Read a registry schema's object shape. Every operation input is a ZodObject
 * today, but the registry is designed to grow (the official spec may introduce
 * unions), so we only read `.shape` when it genuinely is one and otherwise fall
 * back to a permissive shape — `callOperation` still validates the body against
 * the real schema, so correctness is preserved either way.
 */
const objectShape = (schema: (typeof OPERATIONS)[number]['input']): z.ZodRawShape =>
  schema instanceof z.ZodObject ? (schema.shape as z.ZodRawShape) : {}

const buildServer = (): McpServer => {
  const server = new McpServer({ name: 'booking-cli', version: '0.1.0' })

  for (const op of OPERATIONS) {
    const baseShape = objectShape(op.input)
    const shape: z.ZodRawShape =
      op.kind === 'write' ? { ...baseShape, confirm: CONFIRM_FIELD } : baseShape
    server.registerTool(
      toolName(op.resource, op.action),
      {
        title: `${op.resource} ${op.action}`,
        description: op.summary,
        inputSchema: shape,
        annotations: {
          readOnlyHint: op.kind === 'read',
          destructiveHint: op.kind === 'write',
          idempotentHint: op.kind === 'read',
        },
      },
      async (args: Record<string, unknown>) => runTool(op, args),
    )
  }

  return server
}

const main = async (): Promise<void> => {
  const server = buildServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr only — stdout is the MCP transport.
  process.stderr.write('booking-cli MCP server ready on stdio\n')
}

void main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
