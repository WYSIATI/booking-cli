import type { ResolvedConfig } from './config.js'
import type { Operation } from '../domain/registry.js'
import { ApiError, ValidationError } from './errors.js'

/**
 * Thin client for the Demand API. Every call:
 *   - validates the body against the operation's zod schema
 *   - attaches auth headers (Authorization + X-Affiliate-Id)
 *   - aborts after a timeout (30s default, BOOKING_HTTP_TIMEOUT_MS to override)
 *   - normalises non-2xx responses into ApiError
 *
 * Header names and the auth scheme are centralised here — adjust in one place if
 * the official spec differs from the documented behaviour.
 */

const DEFAULT_TIMEOUT_MS = 30000

const authHeaders = (config: ResolvedConfig): Record<string, string> => ({
  Authorization: `Bearer ${config.apiKey}`,
  'X-Affiliate-Id': config.affiliateId,
  'Content-Type': 'application/json',
  Accept: 'application/json',
})

/**
 * Resolve the per-request timeout. BOOKING_HTTP_TIMEOUT_MS wins when it is a
 * positive integer; anything else (unset, garbage, zero, negative, fractional)
 * silently falls back to the default — a bad env var should degrade, not break.
 */
const resolveTimeoutMs = (): number => {
  const raw = process.env.BOOKING_HTTP_TIMEOUT_MS
  if (raw === undefined || raw === '') return DEFAULT_TIMEOUT_MS
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

/**
 * True when a fetch rejection came from the abort signal: undici surfaces
 * `AbortSignal.timeout` as a DOMException named 'TimeoutError' (or 'AbortError'
 * for a plain abort). Node's DOMException extends Error, so one guard covers both.
 */
const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

export const callOperation = async (
  operation: Operation,
  rawInput: unknown,
  config: ResolvedConfig
): Promise<unknown> => {
  const parsed = operation.input.safeParse(rawInput ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`
    )
    throw new ValidationError(
      `Invalid input for ${operation.resource} ${operation.action}`,
      issues
    )
  }

  const url = `${config.baseUrl}${operation.path}`
  const timeoutMs = resolveTimeoutMs()
  let response: Response
  try {
    response = await fetch(url, {
      method: operation.method,
      headers: authHeaders(config),
      body: operation.method === 'GET' ? undefined : JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new ApiError(
        `Request to ${operation.path} timed out after ${timeoutMs}ms`,
        0,
        undefined
      )
    }
    throw new ApiError(
      `Network error calling ${operation.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      0,
      undefined
    )
  }

  const text = await response.text()
  const body = text ? safeJson(text) : undefined

  if (!response.ok) {
    throw new ApiError(
      `Booking.com API returned ${response.status} for ${operation.path}`,
      response.status,
      body
    )
  }
  return body
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}
