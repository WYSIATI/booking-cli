/**
 * Normalised error types so both the CLI and the MCP server surface a consistent,
 * non-leaky shape. We never echo raw credentials or full request bodies back.
 */

export class ConfigError extends Error {
  readonly code = 'CONFIG_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR'
  readonly issues: readonly string[]
  constructor(message: string, issues: readonly string[]) {
    super(message)
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export class ApiError extends Error {
  readonly code = 'API_ERROR'
  readonly status: number
  readonly body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export interface NormalizedError {
  readonly ok: false
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

export const normalizeError = (error: unknown): NormalizedError => {
  if (error instanceof ValidationError) {
    return { ok: false, code: error.code, message: error.message, details: error.issues }
  }
  if (error instanceof ApiError) {
    return { ok: false, code: error.code, message: error.message, details: error.body }
  }
  if (error instanceof ConfigError) {
    return { ok: false, code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { ok: false, code: 'UNEXPECTED', message: error.message }
  }
  return { ok: false, code: 'UNEXPECTED', message: String(error) }
}
