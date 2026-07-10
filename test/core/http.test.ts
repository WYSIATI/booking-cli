import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedConfig } from '../../src/core/config.js'
import { callOperation } from '../../src/core/http.js'
import { findOperation } from '../../src/domain/registry.js'
import { ApiError, ValidationError } from '../../src/core/errors.js'

/**
 * The HTTP client is tested against a stubbed global `fetch` — no request ever
 * leaves the process. We assert it validates input first, attaches the auth
 * headers, POSTs JSON to baseUrl + path, and normalises failures into ApiError.
 */

const CONFIG: ResolvedConfig = {
  apiKey: 'test-key',
  affiliateId: 'aff-1',
  baseUrl: 'https://demandapi.example.test/3.1',
}

const searchOp = findOperation('accommodations', 'search')!

const validSearchBody = {
  city_id: 20,
  checkin: '2026-08-01',
  checkout: '2026-08-05',
}

interface FakeResponseInit {
  ok: boolean
  status: number
  body: string
}

const fakeResponse = (init: FakeResponseInit): Response =>
  ({
    ok: init.ok,
    status: init.status,
    text: async () => init.body,
  }) as unknown as Response

const stubFetch = (impl: ReturnType<typeof vi.fn>): void => {
  vi.stubGlobal('fetch', impl)
}

describe('callOperation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs JSON with auth headers to baseUrl + path and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, status: 200, body: JSON.stringify({ results: [1, 2] }) }),
    )
    stubFetch(fetchMock)

    const result = await callOperation(searchOp, validSearchBody, CONFIG)

    expect(result).toEqual({ results: [1, 2] })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://demandapi.example.test/3.1/accommodations/search')
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-key')
    expect(headers['X-Affiliate-Id']).toBe('aff-1')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Accept).toBe('application/json')

    expect(typeof init.body).toBe('string')
    expect(JSON.parse(init.body as string)).toMatchObject(validSearchBody)
  })

  it('throws ValidationError and never calls fetch on invalid input', async () => {
    const fetchMock = vi.fn()
    stubFetch(fetchMock)

    await expect(
      callOperation(searchOp, { city_id: 20 }, CONFIG),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the zod issues on the thrown ValidationError', async () => {
    stubFetch(vi.fn())
    await expect(
      callOperation(searchOp, { checkin: 'bad' }, CONFIG),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      issues: expect.arrayContaining([expect.stringContaining('checkin')]),
    })
  })

  it('maps a non-2xx response to ApiError with status and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ ok: false, status: 404, body: JSON.stringify({ error: 'not found' }) }),
    )
    stubFetch(fetchMock)

    const promise = callOperation(searchOp, validSearchBody, CONFIG)
    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      code: 'API_ERROR',
      status: 404,
      body: { error: 'not found' },
    })
  })

  it('wraps a network failure in an ApiError with status 0', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    stubFetch(fetchMock)

    const promise = callOperation(searchOp, validSearchBody, CONFIG)
    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Network error'),
    })
  })

  it('falls back to a { raw } wrapper when the body is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, status: 200, body: 'plain text, not json' }),
    )
    stubFetch(fetchMock)

    const result = await callOperation(searchOp, validSearchBody, CONFIG)
    expect(result).toEqual({ raw: 'plain text, not json' })
  })

  it('returns undefined for an empty successful response body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse({ ok: true, status: 204, body: '' }))
    stubFetch(fetchMock)

    const result = await callOperation(searchOp, validSearchBody, CONFIG)
    expect(result).toBeUndefined()
  })

  it('treats a null/undefined raw input as an empty object before validation', async () => {
    // The order preview op requires fields, so a null input must fail validation
    // rather than throwing a TypeError inside safeParse.
    const previewOp = findOperation('orders', 'preview')!
    stubFetch(vi.fn())
    await expect(
      callOperation(previewOp, null, CONFIG),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
