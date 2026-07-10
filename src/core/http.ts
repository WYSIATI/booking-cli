import type { ResolvedConfig } from './config.js'
import type { Operation } from '../domain/registry.js'
import { ApiError, ValidationError } from './errors.js'

/**
 * Thin client for the Demand API. Every call:
 *   - validates the body against the operation's zod schema
 *   - attaches auth headers (Authorization + X-Affiliate-Id)
 *   - normalises non-2xx responses into ApiError
 *
 * Header names and the auth scheme are centralised here — adjust in one place if
 * the official spec differs from the documented behaviour.
 */

const authHeaders = (config: ResolvedConfig): Record<string, string> => ({
  Authorization: `Bearer ${config.apiKey}`,
  'X-Affiliate-Id': config.affiliateId,
  'Content-Type': 'application/json',
  Accept: 'application/json',
})

export const callOperation = async (
  operation: Operation,
  rawInput: unknown,
  config: ResolvedConfig,
): Promise<unknown> => {
  const parsed = operation.input.safeParse(rawInput ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    )
    throw new ValidationError(
      `Invalid input for ${operation.resource} ${operation.action}`,
      issues,
    )
  }

  const url = `${config.baseUrl}${operation.path}`
  let response: Response
  try {
    response = await fetch(url, {
      method: operation.method,
      headers: authHeaders(config),
      body: operation.method === 'GET' ? undefined : JSON.stringify(parsed.data),
    })
  } catch (error) {
    throw new ApiError(
      `Network error calling ${operation.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      0,
      undefined,
    )
  }

  const text = await response.text()
  const body = text ? safeJson(text) : undefined

  if (!response.ok) {
    throw new ApiError(
      `Booking.com API returned ${response.status} for ${operation.path}`,
      response.status,
      body,
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
