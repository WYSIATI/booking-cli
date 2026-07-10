/**
 * Dependency-free rendering for the `--table` output mode.
 *
 * `formatAsTable` NEVER throws: any shape it can't tabulate degrades to pretty
 * JSON, so callers can write the returned string straight to stdout. The one
 * curated layout is for accommodations search results (id, name, price, score);
 * other arrays of flat records get a generic column table, and everything else
 * falls back to pretty JSON.
 *
 * Everything here is pure and immutable — inputs are only read, never mutated.
 */

const MAX_CELL = 48
const MAX_COLUMNS = 8
const ELLIPSIS = '…'
const EMPTY = '—'

/** Pretty-printed JSON that is always a string (never `undefined`). */
export const prettyJson = (data: unknown): string =>
  JSON.stringify(data, null, 2) ?? String(data)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Path = readonly string[]

/** Read a nested value by key path, returning undefined at the first miss. */
const getPath = (row: Record<string, unknown>, path: Path): unknown => {
  let current: unknown = row
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

/** First path that resolves to a present (non-null, non-empty) value. */
const firstDefined = (
  row: Record<string, unknown>,
  paths: readonly Path[],
): unknown => {
  for (const path of paths) {
    const value = getPath(row, path)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

const ID_PATHS: readonly Path[] = [
  ['id'],
  ['accommodation'],
  ['accommodation_id'],
  ['hotel_id'],
]

const NAME_PATHS: readonly Path[] = [
  ['name'],
  ['title'],
  ['hotel_name'],
  ['accommodation_name'],
  ['displayName'],
]

const SCORE_PATHS: readonly Path[] = [
  ['review_score'],
  ['score'],
  ['rating'],
  ['reviews', 'score'],
  ['review_scores', 'total'],
]

const PRICE_PATHS: readonly Path[] = [
  ['price'],
  ['min_total_price'],
  ['total_price'],
  ['gross_price'],
  ['product_price_breakdown', 'gross_amount'],
  ['price_breakdown', 'gross_amount'],
  ['composite_price_breakdown', 'gross_amount'],
]

const TOTAL_PATHS: readonly Path[] = [
  ['total'],
  ['total_price'],
  ['order_total'],
  ['grand_total'],
  ['price'],
  ['price_breakdown', 'gross_amount'],
  ['product_price_breakdown', 'gross_amount'],
  ['composite_price_breakdown', 'gross_amount'],
  ['order', 'total'],
  ['order', 'total_price'],
]

/**
 * Best-effort money formatting. Handles raw numbers/strings and the common
 * `{ value | amount, currency }` object shapes (including one level of nesting),
 * returning undefined when nothing money-like is present.
 */
const formatMoney = (value: unknown): string | undefined => {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.trim() || undefined
  if (!isRecord(value)) return undefined

  const rawAmount =
    value.value ?? value.amount ?? value.gross_amount ?? value.total ?? value.gross
  if (isRecord(rawAmount)) return formatMoney(rawAmount)

  const amount =
    typeof rawAmount === 'number'
      ? String(rawAmount)
      : typeof rawAmount === 'string'
        ? rawAmount
        : undefined
  if (amount === undefined) return undefined

  const currency = value.currency ?? value.currency_code ?? value.currencyCode
  return typeof currency === 'string' ? `${currency} ${amount}` : amount
}

const pickPrice = (row: Record<string, unknown>): string | undefined =>
  formatMoney(firstDefined(row, PRICE_PATHS))

/** Pull a human-readable order total out of a preview/create response. */
export const extractTotal = (data: unknown): string | undefined =>
  isRecord(data) ? formatMoney(firstDefined(data, TOTAL_PATHS)) : undefined

const stringifyCell = (value: unknown): string => {
  if (value === undefined || value === null) return EMPTY
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value) ?? EMPTY
  } catch {
    return String(value)
  }
}

const truncate = (text: string): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > MAX_CELL
    ? `${oneLine.slice(0, MAX_CELL - 1)}${ELLIPSIS}`
    : oneLine
}

const cell = (value: unknown): string => truncate(stringifyCell(value))

/** Locate the primary array of records to tabulate, if there is one. */
const findRows = (data: unknown): Record<string, unknown>[] | undefined => {
  if (Array.isArray(data)) {
    const rows = data.filter(isRecord)
    return rows.length > 0 && rows.length === data.length ? rows : undefined
  }
  if (!isRecord(data)) return undefined

  const candidateKeys = ['results', 'result', 'accommodations', 'data', 'items', 'orders']
  for (const key of candidateKeys) {
    const value = data[key]
    if (Array.isArray(value)) {
      const rows = value.filter(isRecord)
      if (rows.length > 0 && rows.length === value.length) return rows
    }
  }
  return undefined
}

const looksLikeAccommodations = (rows: readonly Record<string, unknown>[]): boolean => {
  const hits = rows.filter((row) => {
    const hasId = firstDefined(row, ID_PATHS) !== undefined
    const hasDescriptor =
      firstDefined(row, NAME_PATHS) !== undefined ||
      firstDefined(row, SCORE_PATHS) !== undefined ||
      pickPrice(row) !== undefined
    return hasId && hasDescriptor
  }).length
  return hits > 0 && hits >= rows.length / 2
}

const renderTable = (headers: readonly string[], rows: readonly string[][]): string => {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)),
  )
  const pad = (text: string, width: number): string =>
    text + ' '.repeat(Math.max(0, width - text.length))
  const line = (cells: readonly string[]): string =>
    cells.map((value, column) => pad(value, widths[column] ?? value.length)).join('  ').trimEnd()

  const separator = widths.map((width) => '-'.repeat(width)).join('  ')
  return [line(headers), separator, ...rows.map(line)].join('\n')
}

const renderAccommodations = (rows: readonly Record<string, unknown>[]): string => {
  const body = rows.map((row) => [
    cell(firstDefined(row, ID_PATHS)),
    cell(firstDefined(row, NAME_PATHS)),
    cell(pickPrice(row)),
    cell(firstDefined(row, SCORE_PATHS)),
  ])
  return renderTable(['id', 'name', 'price', 'score'], body)
}

const collectColumns = (rows: readonly Record<string, unknown>[]): string[] => {
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key) && columns.length < MAX_COLUMNS) columns.push(key)
    }
  }
  return columns
}

const renderGeneric = (rows: readonly Record<string, unknown>[]): string => {
  const headers = collectColumns(rows)
  if (headers.length === 0) return prettyJson(rows)
  const body = rows.map((row) => headers.map((header) => cell(row[header])))
  return renderTable(headers, body)
}

/**
 * Render `data` as an aligned text table, degrading to pretty JSON for any
 * shape that isn't a clean array of records. Guaranteed not to throw.
 */
export const formatAsTable = (data: unknown): string => {
  try {
    const rows = findRows(data)
    if (!rows) return prettyJson(data)
    return looksLikeAccommodations(rows)
      ? renderAccommodations(rows)
      : renderGeneric(rows)
  } catch {
    return prettyJson(data)
  }
}
