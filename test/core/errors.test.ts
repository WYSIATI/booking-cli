import { describe, expect, it } from 'vitest'
import {
  ApiError,
  ConfigError,
  ValidationError,
  normalizeError,
} from '../../src/core/errors.js'

/**
 * `normalizeError` is the single choke point that turns any thrown value into
 * the non-leaky `{ ok: false, code, message, details? }` envelope shared by the
 * CLI and MCP layers. Each error type must map to its own code and shape.
 */

describe('normalizeError', () => {
  it('maps ValidationError to VALIDATION_ERROR with issues as details', () => {
    const err = new ValidationError('bad input', ['checkin: required'])
    expect(normalizeError(err)).toEqual({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'bad input',
      details: ['checkin: required'],
    })
  })

  it('maps ApiError to API_ERROR with the response body as details', () => {
    const err = new ApiError('boom', 502, { error: 'upstream' })
    expect(normalizeError(err)).toEqual({
      ok: false,
      code: 'API_ERROR',
      message: 'boom',
      details: { error: 'upstream' },
    })
  })

  it('maps ConfigError to CONFIG_ERROR without a details field', () => {
    const result = normalizeError(new ConfigError('no creds'))
    expect(result).toEqual({
      ok: false,
      code: 'CONFIG_ERROR',
      message: 'no creds',
    })
    expect(result).not.toHaveProperty('details')
  })

  it('maps a generic Error to UNEXPECTED', () => {
    expect(normalizeError(new Error('kaboom'))).toEqual({
      ok: false,
      code: 'UNEXPECTED',
      message: 'kaboom',
    })
  })

  it('maps a non-Error thrown value to UNEXPECTED with a stringified message', () => {
    expect(normalizeError('just a string')).toEqual({
      ok: false,
      code: 'UNEXPECTED',
      message: 'just a string',
    })
  })
})

describe('error classes', () => {
  it('ValidationError carries a stable code, name and issues', () => {
    const err = new ValidationError('m', ['a', 'b'])
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.name).toBe('ValidationError')
    expect(err.issues).toEqual(['a', 'b'])
  })

  it('ApiError carries the status and body', () => {
    const err = new ApiError('m', 404, { detail: 'x' })
    expect(err.code).toBe('API_ERROR')
    expect(err.name).toBe('ApiError')
    expect(err.status).toBe(404)
    expect(err.body).toEqual({ detail: 'x' })
  })

  it('ConfigError carries a stable code and name', () => {
    const err = new ConfigError('m')
    expect(err.code).toBe('CONFIG_ERROR')
    expect(err.name).toBe('ConfigError')
  })
})
