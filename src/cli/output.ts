import { normalizeError } from '../core/errors.js'
import { formatAsTable, prettyJson } from './format.js'

/**
 * All CLI output goes through here. We write structured data to stdout and human
 * status/errors to stderr, so machine output stays clean for agents piping the
 * result. (Intentionally no console.log — stdout must carry only the payload.)
 */

export type OutputFormat = 'json' | 'table' | 'pretty'

export interface OutputOptions {
  readonly format: OutputFormat
}

interface GlobalFormatFlags {
  readonly json?: boolean
  readonly table?: boolean
}

/**
 * Collapse the global output flags into a single format. `--json` (the machine
 * envelope) takes precedence over `--table`; the default is pretty JSON.
 */
export const resolveOutputFormat = (flags: GlobalFormatFlags): OutputFormat =>
  flags.json ? 'json' : flags.table ? 'table' : 'pretty'

const writeOut = (text: string): void => {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
}

const writeErr = (text: string): void => {
  process.stderr.write(text.endsWith('\n') ? text : `${text}\n`)
}

export const printResult = (data: unknown, opts: OutputOptions): void => {
  if (opts.format === 'json') {
    writeOut(prettyJson({ ok: true, data }))
    return
  }
  if (opts.format === 'table') {
    writeOut(formatAsTable(data))
    return
  }
  writeOut(prettyJson(data))
}

export const printError = (error: unknown, opts: OutputOptions): void => {
  const normalized = normalizeError(error)
  if (opts.format === 'json') {
    writeOut(prettyJson(normalized))
    return
  }
  writeErr(`error [${normalized.code}]: ${normalized.message}`)
  if (normalized.details) {
    writeErr(prettyJson(normalized.details))
  }
}

export const info = (message: string): void => writeErr(message)
