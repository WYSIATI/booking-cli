import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  info,
  printError,
  printResult,
  resolveOutputFormat,
} from '../../src/cli/output.js'
import { formatAsTable } from '../../src/cli/format.js'
import { ValidationError } from '../../src/core/errors.js'

/**
 * The output module is the CLI's stdout/stderr contract: structured payloads
 * go to stdout (clean for agents piping the result), human status and errors
 * go to stderr — except in --json mode, where errors are emitted as a
 * machine-readable envelope on STDOUT. We capture both streams with spies so
 * nothing leaks into the test runner's own output.
 */

describe('resolveOutputFormat', () => {
  it('returns json when --json is set, beating --table', () => {
    expect(resolveOutputFormat({ json: true, table: true })).toBe('json')
    expect(resolveOutputFormat({ json: true })).toBe('json')
  })

  it('returns table when only --table is set', () => {
    expect(resolveOutputFormat({ table: true })).toBe('table')
  })

  it('defaults to pretty when neither flag is set', () => {
    expect(resolveOutputFormat({})).toBe('pretty')
    expect(resolveOutputFormat({ json: false, table: false })).toBe('pretty')
  })
})

describe('output writers', () => {
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

  describe('printResult', () => {
    it('json format wraps the data in an { ok: true, data } envelope on stdout', () => {
      printResult({ order_id: 'ord_1' }, { format: 'json' })

      const out = stdout.join('')
      expect(JSON.parse(out)).toEqual({ ok: true, data: { order_id: 'ord_1' } })
      expect(out.endsWith('\n')).toBe(true)
      expect(stderr).toEqual([])
    })

    it('table format writes the formatAsTable rendering to stdout', () => {
      const rows = [
        { id: 1, name: 'Hotel One' },
        { id: 2, name: 'Hotel Two' },
      ]
      printResult(rows, { format: 'table' })

      expect(stdout.join('')).toBe(`${formatAsTable(rows)}\n`)
      expect(stdout.join('')).toContain('Hotel One')
      expect(stderr).toEqual([])
    })

    it('pretty format writes plain JSON (no envelope) to stdout', () => {
      const data = { results: [1, 2, 3] }
      printResult(data, { format: 'pretty' })

      const payload = JSON.parse(stdout.join(''))
      expect(payload).toEqual(data)
      expect(payload.ok).toBeUndefined()
      expect(stderr).toEqual([])
    })
  })

  describe('printError', () => {
    it('json format emits the normalized { ok: false, code } envelope on STDOUT', () => {
      const error = new ValidationError('bad input', ['checkin: required'])
      printError(error, { format: 'json' })

      expect(JSON.parse(stdout.join(''))).toEqual({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'bad input',
        details: ['checkin: required'],
      })
      expect(stderr).toEqual([])
    })

    it('non-json format writes the message to STDERR and keeps stdout clean', () => {
      printError(new Error('boom'), { format: 'pretty' })

      expect(stderr.join('')).toBe('error [UNEXPECTED]: boom\n')
      expect(stdout).toEqual([])
    })

    it('non-json format also writes details to stderr when present', () => {
      const error = new ValidationError('bad input', ['checkin: required'])
      printError(error, { format: 'table' })

      const err = stderr.join('')
      expect(err).toContain('error [VALIDATION_ERROR]: bad input')
      expect(err).toContain('checkin: required')
      expect(stdout).toEqual([])
    })
  })

  describe('info', () => {
    it('writes the message to stderr, never stdout', () => {
      info('Preview total: EUR 200')

      expect(stderr.join('')).toBe('Preview total: EUR 200\n')
      expect(stdout).toEqual([])
    })
  })
})
