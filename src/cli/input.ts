import { readFile } from 'node:fs/promises'
import { ValidationError } from '../core/errors.js'

/**
 * Resolve an operation's request body from the CLI's generic body inputs:
 *   --json '<inline json>'   |   --file <path to json>   |   stdin (when --stdin)
 * Exactly one source is expected; we merge nothing to keep behaviour predictable.
 */

export interface BodyInputs {
  readonly json?: string
  readonly file?: string
  readonly stdin?: boolean
}

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const describeType = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

const parse = (text: string, source: string): Record<string, unknown> => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new ValidationError(`Could not parse ${source} as JSON`, [
      error instanceof Error ? error.message : String(error),
    ])
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`Expected ${source} to be a JSON object`, [
      `got ${describeType(value)}`,
    ])
  }
  return value as Record<string, unknown>
}

export const resolveBody = async (
  inputs: BodyInputs,
): Promise<Record<string, unknown>> => {
  if (inputs.file) {
    return parse(await readFile(inputs.file, 'utf8'), `file ${inputs.file}`)
  }
  if (inputs.stdin) {
    return parse(await readStdin(), 'stdin')
  }
  if (inputs.json) {
    return parse(inputs.json, '--json')
  }
  return {}
}
