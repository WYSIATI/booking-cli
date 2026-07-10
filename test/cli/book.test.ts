import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runBook } from '../../src/cli/book.js'
import type { BookDeps } from '../../src/cli/book.js'
import type { ResolvedConfig } from '../../src/core/config.js'

/**
 * `runBook` is the `+book` preview-then-create flow. It must ALWAYS preview
 * first, and must NEVER call `orders create` unless the caller confirms with
 * --yes (`ctx.yes === true`). We inject the config + http collaborators so the
 * branches are exercised without credentials or network access.
 */

const CONFIG: ResolvedConfig = {
  apiKey: 'test-key',
  affiliateId: 'test-affiliate',
  baseUrl: 'https://example.test',
}

const PREVIEW = { total: { value: 200, currency: 'EUR' } }
const ORDER = { order_id: 'ord_123', status: 'confirmed' }

const makeDeps = () => {
  const resolveConfig = vi.fn(async () => CONFIG)
  const callOperation = vi.fn(async (op: { action: string }) =>
    op.action === 'create' ? ORDER : PREVIEW,
  )
  return { resolveConfig, callOperation } as unknown as BookDeps & {
    resolveConfig: ReturnType<typeof vi.fn>
    callOperation: ReturnType<typeof vi.fn>
  }
}

const baseCtx = {
  format: 'json' as const,
  body: { json: '{"accommodation": 1, "checkin": "2026-08-01", "checkout": "2026-08-03", "products": [{"id": "p1"}]}' },
}

describe('runBook', () => {
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

  it('previews only and does NOT create when --yes is absent', async () => {
    const deps = makeDeps()
    await runBook({ ...baseCtx, yes: false }, deps)

    expect(deps.callOperation).toHaveBeenCalledTimes(1)
    expect(deps.callOperation.mock.calls[0][0]).toMatchObject({ action: 'preview' })

    const payload = JSON.parse(stdout.join(''))
    expect(payload).toMatchObject({
      ok: true,
      data: { status: 'previewed', confirmed: false, preview: PREVIEW },
    })
    expect(payload.data.order).toBeUndefined()
  })

  it('surfaces the preview total on stderr', async () => {
    await runBook({ ...baseCtx, yes: false }, makeDeps())
    expect(stderr.join('')).toContain('Preview total: EUR 200')
  })

  it('reports when no total field is detected', async () => {
    const deps = makeDeps()
    deps.callOperation.mockImplementation(async () => ({ no: 'money' }))
    await runBook({ ...baseCtx, yes: false }, deps)
    expect(stderr.join('')).toContain('no total field detected')
  })

  it('creates the order after previewing when --yes is set', async () => {
    const deps = makeDeps()
    await runBook({ ...baseCtx, yes: true }, deps)

    expect(deps.callOperation).toHaveBeenCalledTimes(2)
    expect(deps.callOperation.mock.calls[0][0]).toMatchObject({ action: 'preview' })
    expect(deps.callOperation.mock.calls[1][0]).toMatchObject({ action: 'create' })

    const payload = JSON.parse(stdout.join(''))
    expect(payload).toMatchObject({
      ok: true,
      data: { status: 'created', confirmed: true, preview: PREVIEW, order: ORDER },
    })
    expect(stderr.join('')).toContain('Booking confirmed.')
  })

  it('previews and creates with the SAME resolved body', async () => {
    const deps = makeDeps()
    await runBook({ ...baseCtx, yes: true }, deps)
    const previewBody = deps.callOperation.mock.calls[0][1]
    const createBody = deps.callOperation.mock.calls[1][1]
    expect(createBody).toEqual(previewBody)
    expect(previewBody).toMatchObject({ accommodation: 1 })
  })

  it('passes affiliate/baseUrl overrides through to config resolution', async () => {
    const deps = makeDeps()
    await runBook(
      { ...baseCtx, yes: false, affiliateId: 'aff-9', baseUrl: 'https://override.test' },
      deps,
    )
    expect(deps.resolveConfig).toHaveBeenCalledWith({
      affiliateId: 'aff-9',
      baseUrl: 'https://override.test',
    })
  })

  it('propagates a preview failure without attempting to create', async () => {
    const deps = makeDeps()
    deps.callOperation.mockRejectedValueOnce(new Error('preview boom'))
    await expect(runBook({ ...baseCtx, yes: true }, deps)).rejects.toThrow('preview boom')
    expect(deps.callOperation).toHaveBeenCalledTimes(1)
  })
})
