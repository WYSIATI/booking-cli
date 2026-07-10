import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { registerBookCommand, runBook } from '../../src/cli/book.js'
import type { BookDeps } from '../../src/cli/book.js'
import type { ResolvedConfig } from '../../src/core/config.js'

/**
 * `runBook` is the `+book` preview-then-create flow. It must ALWAYS preview
 * first, and must NEVER call `orders create` unless the caller confirms — via
 * --yes, or interactively when stdin AND stderr are TTYs. We inject the
 * config/http/confirm collaborators so every branch is exercised without
 * credentials, network access, or a real terminal; the readline, config, http,
 * and registry modules are mocked so nothing here ever touches stdin, disk
 * credentials, or the network — not even through the commander wiring.
 */

const {
  mockQuestion,
  mockRlClose,
  mockFindOperation,
  mockResolveConfig,
  mockCallOperation,
} = vi.hoisted(() => ({
  mockQuestion: vi.fn(),
  mockRlClose: vi.fn(),
  mockFindOperation: vi.fn(),
  mockResolveConfig: vi.fn(),
  mockCallOperation: vi.fn(),
}))

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({ question: mockQuestion, close: mockRlClose }),
}))

vi.mock('../../src/domain/registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/domain/registry.js')>()),
  findOperation: mockFindOperation,
}))

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  resolveConfig: mockResolveConfig,
}))

vi.mock('../../src/core/http.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/http.js')>()),
  callOperation: mockCallOperation,
}))

const actualRegistry = await vi.importActual<
  typeof import('../../src/domain/registry.js')
>('../../src/domain/registry.js')

const CONFIG: ResolvedConfig = {
  apiKey: 'test-key',
  affiliateId: 'test-affiliate',
  baseUrl: 'https://example.test',
}

const PREVIEW = { total: { value: 200, currency: 'EUR' } }
const ORDER = { order_id: 'ord_123', status: 'confirmed' }

const GENERATED_REFERENCE_PATTERN =
  /^bkng-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const makeDeps = () => {
  const resolveConfig = vi.fn(async () => CONFIG)
  const callOperation = vi.fn(async (op: { action: string }) =>
    op.action === 'create' ? ORDER : PREVIEW
  )
  return { resolveConfig, callOperation } as unknown as BookDeps & {
    resolveConfig: ReturnType<typeof vi.fn>
    callOperation: ReturnType<typeof vi.fn>
  }
}

const baseCtx = {
  format: 'json' as const,
  body: {
    json: '{"accommodation": 1, "checkin": "2026-08-01", "checkout": "2026-08-03", "products": [{"id": "p1"}]}',
  },
}

const ORIGINAL_TTY = {
  stdin: process.stdin.isTTY,
  stderr: process.stderr.isTTY,
}

const setTty = (stdin: boolean | undefined, stderr: boolean | undefined): void => {
  Object.defineProperty(process.stdin, 'isTTY', { value: stdin, configurable: true })
  Object.defineProperty(process.stderr, 'isTTY', { value: stderr, configurable: true })
}

let stdout: string[]
let stderr: string[]

beforeEach(() => {
  // Module-level mocks (readline question/close) accumulate call state across
  // tests unless cleared explicitly — vitest no longer masks this.
  vi.clearAllMocks()
  stdout = []
  stderr = []
  mockFindOperation.mockImplementation(actualRegistry.findOperation)
  setTty(false, false)
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
  setTty(ORIGINAL_TTY.stdin, ORIGINAL_TTY.stderr)
  vi.restoreAllMocks()
})

describe('runBook', () => {
  it('previews only and does NOT create when --yes is absent outside a TTY', async () => {
    const deps = makeDeps()
    await runBook({ ...baseCtx, yes: false }, deps)

    expect(deps.callOperation).toHaveBeenCalledTimes(1)
    expect(deps.callOperation.mock.calls[0][0]).toMatchObject({ action: 'preview' })
    expect(stderr.join('')).toContain('Re-run with --yes')

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

  it('previews and creates with the same user-supplied body fields', async () => {
    const deps = makeDeps()
    await runBook({ ...baseCtx, yes: true }, deps)
    const previewBody = deps.callOperation.mock.calls[0][1]
    const createBody = deps.callOperation.mock.calls[1][1]
    const { order_reference: generated, ...userFields } = createBody
    expect(userFields).toEqual(previewBody)
    expect(generated).toMatch(GENERATED_REFERENCE_PATTERN)
    expect(previewBody).toMatchObject({ accommodation: 1 })
  })

  it('generates a bkng- order_reference for create only, never mutating the previewed body', async () => {
    const deps = makeDeps()
    await runBook({ ...baseCtx, yes: true }, deps)

    const previewBody = deps.callOperation.mock.calls[0][1]
    const createBody = deps.callOperation.mock.calls[1][1]
    expect(previewBody.order_reference).toBeUndefined()
    expect(createBody.order_reference).toMatch(GENERATED_REFERENCE_PATTERN)
    expect(createBody).not.toBe(previewBody)

    const payload = JSON.parse(stdout.join(''))
    expect(payload.data.order_reference).toBe(createBody.order_reference)
    expect(stderr.join('')).toContain(
      `Order reference: ${String(createBody.order_reference)}`
    )
  })

  it('passes a user-supplied order_reference through untouched', async () => {
    const deps = makeDeps()
    const body = { accommodation: 1, order_reference: 'my-ref-42' }
    await runBook({ ...baseCtx, yes: true, body: { json: JSON.stringify(body) } }, deps)

    const previewBody = deps.callOperation.mock.calls[0][1]
    const createBody = deps.callOperation.mock.calls[1][1]
    expect(previewBody.order_reference).toBe('my-ref-42')
    expect(createBody).toBe(previewBody)

    const payload = JSON.parse(stdout.join(''))
    expect(payload.data.order_reference).toBe('my-ref-42')
    expect(stderr.join('')).toContain('Order reference: my-ref-42')
  })

  it('passes affiliate/baseUrl overrides through to config resolution', async () => {
    const deps = makeDeps()
    await runBook(
      { ...baseCtx, yes: false, affiliateId: 'aff-9', baseUrl: 'https://override.test' },
      deps
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

  it('fails fast when the orders operations are not registered', async () => {
    mockFindOperation.mockReturnValue(undefined)
    const deps = makeDeps()
    await expect(runBook({ ...baseCtx, yes: true }, deps)).rejects.toThrow(
      'orders preview/create operations are not registered'
    )
    expect(deps.callOperation).not.toHaveBeenCalled()
  })

  describe('interactive confirmation', () => {
    it('prompts on a TTY and creates when the user accepts', async () => {
      setTty(true, true)
      const deps = makeDeps()
      const confirm = vi.fn(async () => true)
      await runBook({ ...baseCtx, yes: false }, { ...deps, confirm })

      expect(confirm).toHaveBeenCalledTimes(1)
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining('charges the payment method')
      )
      expect(deps.callOperation).toHaveBeenCalledTimes(2)

      const payload = JSON.parse(stdout.join(''))
      expect(payload.data).toMatchObject({ status: 'created', confirmed: true })
    })

    it('previews only and never creates when the user declines', async () => {
      setTty(true, true)
      const deps = makeDeps()
      const confirm = vi.fn(async () => false)
      await runBook({ ...baseCtx, yes: false }, { ...deps, confirm })

      expect(deps.callOperation).toHaveBeenCalledTimes(1)
      expect(stderr.join('')).toContain('Nothing was booked.')
      expect(stderr.join('')).not.toContain('Booking confirmed.')

      const payload = JSON.parse(stdout.join(''))
      expect(payload.data).toMatchObject({ status: 'previewed', confirmed: false })
    })

    it('never prompts when stdin and stderr are not TTYs', async () => {
      setTty(false, false)
      const deps = makeDeps()
      const confirm = vi.fn(async () => true)
      await runBook({ ...baseCtx, yes: false }, { ...deps, confirm })

      expect(confirm).not.toHaveBeenCalled()
      expect(deps.callOperation).toHaveBeenCalledTimes(1)
      expect(stderr.join('')).toContain('Re-run with --yes')
    })

    it('never prompts when only stdin is a TTY', async () => {
      setTty(true, false)
      const deps = makeDeps()
      const confirm = vi.fn(async () => true)
      await runBook({ ...baseCtx, yes: false }, { ...deps, confirm })

      expect(confirm).not.toHaveBeenCalled()
      expect(deps.callOperation).toHaveBeenCalledTimes(1)
    })

    it('does not prompt when --yes is given, even on a TTY', async () => {
      setTty(true, true)
      const deps = makeDeps()
      const confirm = vi.fn(async () => false)
      await runBook({ ...baseCtx, yes: true }, { ...deps, confirm })

      expect(confirm).not.toHaveBeenCalled()
      expect(deps.callOperation).toHaveBeenCalledTimes(2)
    })
  })

  describe('default readline prompt', () => {
    it('accepts a case-insensitive yes and closes the interface', async () => {
      setTty(true, true)
      mockQuestion.mockResolvedValueOnce(' YES ')
      const deps = makeDeps()
      await runBook({ ...baseCtx, yes: false }, deps)

      expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining('[y/N]'))
      expect(deps.callOperation).toHaveBeenCalledTimes(2)
      expect(mockRlClose).toHaveBeenCalledTimes(1)
    })

    it('treats an empty answer as decline and closes the interface', async () => {
      setTty(true, true)
      mockQuestion.mockResolvedValueOnce('')
      const deps = makeDeps()
      await runBook({ ...baseCtx, yes: false }, deps)

      expect(deps.callOperation).toHaveBeenCalledTimes(1)
      expect(mockRlClose).toHaveBeenCalledTimes(1)

      const payload = JSON.parse(stdout.join(''))
      expect(payload.data).toMatchObject({ status: 'previewed', confirmed: false })
    })

    it('closes the interface even when the question is interrupted', async () => {
      setTty(true, true)
      mockQuestion.mockRejectedValueOnce(new Error('interrupted'))
      const deps = makeDeps()
      await expect(runBook({ ...baseCtx, yes: false }, deps)).rejects.toThrow(
        'interrupted'
      )

      expect(deps.callOperation).toHaveBeenCalledTimes(1)
      expect(mockRlClose).toHaveBeenCalledTimes(1)
    })
  })
})

describe('registerBookCommand', () => {
  it('wires +book flags through to the preview/create flow', async () => {
    mockResolveConfig.mockResolvedValue(CONFIG)
    mockCallOperation.mockImplementation(async (op: { action: string }) =>
      op.action === 'create' ? ORDER : PREVIEW
    )

    const program = new Command()
    program.exitOverride()
    registerBookCommand(program)
    await program.parseAsync(['+book', '--data', '{"accommodation": 1}', '--yes'], {
      from: 'user',
    })

    expect(mockResolveConfig).toHaveBeenCalledTimes(1)
    expect(mockCallOperation).toHaveBeenCalledTimes(2)
    expect(mockCallOperation.mock.calls[0][0]).toMatchObject({ action: 'preview' })
    expect(mockCallOperation.mock.calls[1][0]).toMatchObject({ action: 'create' })
    expect(mockCallOperation.mock.calls[1][1]).toMatchObject({
      accommodation: 1,
      order_reference: expect.stringMatching(GENERATED_REFERENCE_PATTERN),
    })
    expect(stderr.join('')).toContain('Booking confirmed.')

    const payload = JSON.parse(stdout.join(''))
    expect(payload).toMatchObject({ status: 'created', confirmed: true })
  })
})
