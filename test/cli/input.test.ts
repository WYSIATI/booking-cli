import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { resolveBody } from '../../src/cli/input.js'
import { ValidationError } from '../../src/core/errors.js'

/**
 * `resolveBody` turns the CLI's generic body inputs (--data / --file / --stdin)
 * into a validated JSON object. The `--data` value flows in as `inputs.json`.
 */

describe('resolveBody', () => {
  const tempFiles: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempFiles.map((f) => rm(f, { force: true, recursive: true })),
    )
    tempFiles.length = 0
  })

  it('parses an inline JSON object from --data (inputs.json)', async () => {
    const body = await resolveBody({ json: '{"city_id": 20, "rows": 5}' })
    expect(body).toEqual({ city_id: 20, rows: 5 })
  })

  it('returns an empty object when no source is provided', async () => {
    expect(await resolveBody({})).toEqual({})
  })

  it('rejects a JSON array (not an object)', async () => {
    await expect(resolveBody({ json: '[1, 2, 3]' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('rejects a JSON primitive (not an object)', async () => {
    await expect(resolveBody({ json: '"hello"' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(resolveBody({ json: 'null' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('rejects malformed JSON with a ValidationError naming the source', async () => {
    try {
      await resolveBody({ json: '{ not valid' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).message).toContain('--json')
    }
  })

  it('reads and parses a JSON object from --file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bkng-input-'))
    const file = join(dir, 'body.json')
    tempFiles.push(file, dir)
    await writeFile(file, JSON.stringify({ accommodation: 123 }))

    expect(await resolveBody({ file })).toEqual({ accommodation: 123 })
  })

  it('prefers --file over --data when both are supplied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bkng-input-'))
    const file = join(dir, 'body.json')
    tempFiles.push(file, dir)
    await writeFile(file, JSON.stringify({ from: 'file' }))

    const body = await resolveBody({ file, json: '{"from": "json"}' })
    expect(body).toEqual({ from: 'file' })
  })

  it('raises a ValidationError when the --file contents are not an object', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bkng-input-'))
    const file = join(dir, 'body.json')
    tempFiles.push(file, dir)
    await writeFile(file, '[1,2,3]')

    await expect(resolveBody({ file })).rejects.toBeInstanceOf(ValidationError)
  })

  it('reads a JSON object from stdin when --stdin is set', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'stdin')
    Object.defineProperty(process, 'stdin', {
      value: Readable.from([Buffer.from('{"from": "stdin"}')]),
      configurable: true,
    })
    try {
      expect(await resolveBody({ stdin: true })).toEqual({ from: 'stdin' })
    } finally {
      if (original) Object.defineProperty(process, 'stdin', original)
    }
  })
})
