import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeOperation } from '../../src/cli/execute.js'
import { resolveConfig } from '../../src/core/config.js'
import type { ResolvedConfig } from '../../src/core/config.js'
import { callOperation } from '../../src/core/http.js'
import { findOperation } from '../../src/domain/registry.js'
import type { Operation } from '../../src/domain/registry.js'

/**
 * `executeOperation` is the shared execution path behind every generated
 * command, and it carries the CLI's safety guarantee: a write operation
 * without --yes must be refused BEFORE any config resolution or network work.
 * Config and HTTP are mocked so the guard, the override forwarding, and the
 * happy path are exercised without credentials or network access.
 */

vi.mock('../../src/core/config.js', () => ({
  resolveConfig: vi.fn(),
}))

vi.mock('../../src/core/http.js', () => ({
  callOperation: vi.fn(),
}))

const resolveConfigMock = vi.mocked(resolveConfig)
const callOperationMock = vi.mocked(callOperation)

const CONFIG: ResolvedConfig = {
  apiKey: 'test-key',
  affiliateId: 'test-affiliate',
  baseUrl: 'https://example.test',
}

const RESULT = { order_id: 'ord_123', status: 'confirmed' }

const mustFind = (resource: string, action: string): Operation => {
  const op = findOperation(resource, action)
  if (!op) throw new Error(`registry is missing ${resource} ${action}`)
  return op
}

const createOp = mustFind('orders', 'create')
const cancelOp = mustFind('orders', 'cancel')
const searchOp = mustFind('accommodations', 'search')

describe('executeOperation', () => {
  let stdout: string[]

  beforeEach(() => {
    stdout = []
    resolveConfigMock.mockReset().mockResolvedValue(CONFIG)
    callOperationMock.mockReset().mockResolvedValue(RESULT)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('the --yes write guard', () => {
    it('refuses a write operation without yes, before resolving any config', async () => {
      await expect(
        executeOperation(createOp, { format: 'pretty', body: { json: '{}' } })
      ).rejects.toThrow(/is refused[\s\S]*--yes/)

      expect(resolveConfigMock).not.toHaveBeenCalled()
      expect(callOperationMock).not.toHaveBeenCalled()
      expect(stdout.join('')).toBe('')
    })

    it('refuses orders cancel the same way when yes is false', async () => {
      await expect(
        executeOperation(cancelOp, { format: 'json', yes: false, body: {} })
      ).rejects.toThrow('`orders cancel` mutates a real booking')

      expect(resolveConfigMock).not.toHaveBeenCalled()
      expect(callOperationMock).not.toHaveBeenCalled()
    })

    it('lets a read operation proceed without yes', async () => {
      await executeOperation(searchOp, { format: 'json', body: { json: '{}' } })
      expect(callOperationMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('confirmed execution', () => {
    it('resolves config, calls the operation with the parsed body, and prints the result', async () => {
      await executeOperation(createOp, {
        format: 'json',
        yes: true,
        body: { json: '{"accommodation": 1}' },
      })

      expect(resolveConfigMock).toHaveBeenCalledTimes(1)
      expect(callOperationMock).toHaveBeenCalledTimes(1)
      expect(callOperationMock).toHaveBeenCalledWith(
        createOp,
        { accommodation: 1 },
        CONFIG
      )

      const payload = JSON.parse(stdout.join(''))
      expect(payload).toEqual({ ok: true, data: RESULT })
    })

    it('propagates a call failure without printing a result', async () => {
      callOperationMock.mockRejectedValueOnce(new Error('api boom'))
      await expect(
        executeOperation(searchOp, { format: 'json', body: {} })
      ).rejects.toThrow('api boom')
      expect(stdout.join('')).toBe('')
    })
  })

  describe('config override forwarding', () => {
    it('forwards affiliateId and baseUrl to resolveConfig when set', async () => {
      await executeOperation(searchOp, {
        format: 'pretty',
        affiliateId: 'aff-9',
        baseUrl: 'https://override.test',
        body: {},
      })

      expect(resolveConfigMock).toHaveBeenCalledWith({
        affiliateId: 'aff-9',
        baseUrl: 'https://override.test',
      })
    })

    it('omits the override keys entirely when they are unset', async () => {
      await executeOperation(searchOp, { format: 'pretty', body: {} })

      expect(resolveConfigMock).toHaveBeenCalledWith({})
      const overrides = resolveConfigMock.mock.calls[0]?.[0]
      expect(Object.keys(overrides ?? { missing: true })).toEqual([])
    })

    it('forwards only affiliateId when baseUrl is unset', async () => {
      await executeOperation(searchOp, {
        format: 'pretty',
        affiliateId: 'aff-solo',
        body: {},
      })

      expect(resolveConfigMock).toHaveBeenCalledWith({ affiliateId: 'aff-solo' })
      const overrides = resolveConfigMock.mock.calls[0]?.[0]
      expect(Object.keys(overrides ?? {})).toEqual(['affiliateId'])
    })
  })
})
