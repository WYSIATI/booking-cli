import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '../../src/mcp/build.js'
import { OPERATIONS } from '../../src/domain/registry.js'
import { VERSION } from '../../src/core/version.js'

/**
 * The MCP surface is tested end-to-end over the SDK's in-memory transport — a
 * real client speaks real protocol to the real server, but nothing leaves the
 * process and no credentials are needed. We assert the tool listing mirrors the
 * operation registry, write tools carry the required `confirm` gate while read
 * tools do not, annotations match each operation's kind, and an unconfirmed
 * write is refused before any config or network access happens.
 */

const WRITE_TOOLS = ['orders_create', 'orders_cancel'] as const

/** JSON-schema slice of a listed tool that these tests care about. */
interface ToolInputSchema {
  readonly properties?: Record<string, unknown>
  readonly required?: readonly string[]
}

/** Spin up a linked in-memory server/client pair and return the connected client. */
const connect = async (): Promise<Client> => {
  const server = buildServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'build-test-client', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

describe('buildServer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('identifies itself with the package name and single-sourced version', async () => {
    const client = await connect()
    expect(client.getServerVersion()).toMatchObject({
      name: 'booking-cli',
      version: VERSION,
    })
    await client.close()
  })

  it('lists one tool per registry operation, named <resource>_<action>', async () => {
    const client = await connect()
    const { tools } = await client.listTools()

    const expected = OPERATIONS.map((op) => `${op.resource}_${op.action}`).sort()
    expect(tools.map((tool) => tool.name).sort()).toEqual(expected)
    await client.close()
  })

  it('requires `confirm` on write tools and omits it from read tools', async () => {
    const client = await connect()
    const { tools } = await client.listTools()

    const writeTools = tools.filter((tool) =>
      WRITE_TOOLS.includes(tool.name as (typeof WRITE_TOOLS)[number])
    )
    const readTools = tools.filter(
      (tool) => !WRITE_TOOLS.includes(tool.name as (typeof WRITE_TOOLS)[number])
    )
    expect(writeTools).toHaveLength(WRITE_TOOLS.length)
    expect(readTools).toHaveLength(OPERATIONS.length - WRITE_TOOLS.length)

    for (const tool of writeTools) {
      const schema = tool.inputSchema as ToolInputSchema
      expect(schema.properties).toHaveProperty('confirm')
      expect(schema.required).toContain('confirm')
    }
    for (const tool of readTools) {
      const schema = tool.inputSchema as ToolInputSchema
      expect(Object.keys(schema.properties ?? {})).not.toContain('confirm')
      expect(schema.required ?? []).not.toContain('confirm')
    }
    await client.close()
  })

  it('annotates reads as read-only/idempotent and writes as destructive', async () => {
    const client = await connect()
    const { tools } = await client.listTools()

    for (const op of OPERATIONS) {
      const tool = tools.find((t) => t.name === `${op.resource}_${op.action}`)
      expect(tool, `${op.resource}_${op.action} should be registered`).toBeDefined()
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: op.kind === 'read',
        destructiveHint: op.kind === 'write',
        idempotentHint: op.kind === 'read',
      })
    }
    await client.close()
  })

  it('refuses orders_cancel when `confirm` is absent, without touching the network', async () => {
    // The gate must fire before resolveConfig, so no credentials are configured
    // and fetch is stubbed to prove nothing escapes the process.
    const fetchMock = vi.fn().mockRejectedValue(new Error('network must not be hit'))
    vi.stubGlobal('fetch', fetchMock)

    const client = await connect()
    const result = await client.callTool({
      name: 'orders_cancel',
      arguments: { order_id: 'order-1' },
    })

    expect(result.isError).toBe(true)
    const [entry] = result.content as Array<{ type: string; text: string }>
    expect(entry?.text).toContain('confirm')
    expect(fetchMock).not.toHaveBeenCalled()
    await client.close()
  })

  it('refuses orders_cancel with `confirm: false` and returns the refusal message', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network must not be hit'))
    vi.stubGlobal('fetch', fetchMock)

    const client = await connect()
    const result = await client.callTool({
      name: 'orders_cancel',
      arguments: { order_id: 'order-1', confirm: false },
    })

    expect(result.isError).toBe(true)
    const [entry] = result.content as Array<{ type: string; text: string }>
    expect(entry?.text).toContain('refused without explicit confirmation')
    expect(entry?.text).toContain('VALIDATION_ERROR')
    expect(fetchMock).not.toHaveBeenCalled()
    await client.close()
  })
})
