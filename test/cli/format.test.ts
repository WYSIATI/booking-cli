import { describe, expect, it } from 'vitest'
import { extractTotal, formatAsTable, prettyJson } from '../../src/cli/format.js'

/**
 * `format.ts` is pure, dependency-free rendering for the `--table` output mode.
 * These tests exercise the money formatting, order-total path resolution, the
 * accommodations-vs-generic table heuristic, and the guarantee that any
 * untabulatable shape degrades to pretty JSON rather than throwing.
 */

describe('prettyJson', () => {
  it('pretty-prints an object with two-space indentation', () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('never returns undefined — falls back to String() for unserialisable input', () => {
    // JSON.stringify(undefined) is undefined; the `?? String(data)` guard kicks in.
    expect(prettyJson(undefined)).toBe('undefined')
    const fn = () => 1
    expect(prettyJson(fn)).toBe(String(fn))
    expect(typeof prettyJson(fn)).toBe('string')
  })
})

describe('extractTotal', () => {
  it('reads a bare numeric total', () => {
    expect(extractTotal({ total: 100 })).toBe('100')
  })

  it('reads a { value, currency } money object', () => {
    expect(extractTotal({ total: { value: 250, currency: 'EUR' } })).toBe('EUR 250')
  })

  it('accepts the currency_code / amount spelling', () => {
    expect(
      extractTotal({ order_total: { amount: '99.50', currency_code: 'GBP' } }),
    ).toBe('GBP 99.50')
  })

  it('resolves one level of nesting in the amount object', () => {
    expect(
      extractTotal({ total: { value: { amount: 10, currency: 'USD' } } }),
    ).toBe('USD 10')
  })

  it('reads a nested price_breakdown.gross_amount total', () => {
    expect(
      extractTotal({ price_breakdown: { gross_amount: { value: 42, currency: 'CHF' } } }),
    ).toBe('CHF 42')
  })

  it('reads a nested order.total path', () => {
    expect(extractTotal({ order: { total: 'USD 50' } })).toBe('USD 50')
  })

  it('returns the amount alone when no currency is present', () => {
    expect(extractTotal({ total: { value: 12 } })).toBe('12')
  })

  it('trims whitespace-only string amounts to undefined', () => {
    expect(extractTotal({ total: '   ' })).toBeUndefined()
  })

  it('returns undefined for a non-record input', () => {
    expect(extractTotal(42)).toBeUndefined()
    expect(extractTotal(null)).toBeUndefined()
    expect(extractTotal([1, 2])).toBeUndefined()
  })

  it('returns undefined when no total-like field is present', () => {
    expect(extractTotal({ name: 'no money here' })).toBeUndefined()
  })
})

describe('formatAsTable — accommodations layout', () => {
  it('renders the curated id/name/price/score table for search results', () => {
    const table = formatAsTable([
      { id: 1, name: 'Grand Hotel', price: { value: 120, currency: 'EUR' }, review_score: 8.9 },
      { id: 2, name: 'Budget Inn', price: { value: 60, currency: 'EUR' }, review_score: 7.1 },
    ])
    const lines = table.split('\n')
    expect(lines[0].split(/ {2,}/)).toEqual(['id', 'name', 'price', 'score'])
    expect(lines[1]).toMatch(/^-+ {2}-+ {2}-+ {2}-+$/)
    expect(table).toContain('EUR 120')
    expect(table).toContain('Grand Hotel')
    expect(table).toContain('8.9')
  })

  it('unwraps a { results: [...] } envelope', () => {
    const table = formatAsTable({
      results: [{ accommodation_id: 7, hotel_name: 'Seaside', min_total_price: 200 }],
    })
    expect(table).toContain('id')
    expect(table).toContain('Seaside')
    expect(table).toContain('200')
  })

  it('resolves price from a nested product_price_breakdown.gross_amount', () => {
    const table = formatAsTable([
      {
        id: 9,
        name: 'Nested Price',
        product_price_breakdown: { gross_amount: { value: 333, currency: 'USD' } },
      },
    ])
    expect(table).toContain('USD 333')
  })

  it('resolves review score from a nested reviews.score path', () => {
    const table = formatAsTable([
      { id: 3, name: 'Reviewed', reviews: { score: 9.4 } },
    ])
    expect(table).toContain('9.4')
  })

  it('shows the em-dash placeholder for a missing price/score', () => {
    const table = formatAsTable([{ id: 5, name: 'No Price' }])
    expect(table).toContain('—')
  })
})

describe('formatAsTable — generic layout', () => {
  it('renders a column table for flat records that are not accommodations', () => {
    const table = formatAsTable([
      { status: 'ok', code: 200 },
      { status: 'fail', code: 500 },
    ])
    const lines = table.split('\n')
    expect(lines[0]).toBe('status  code')
    expect(table).toContain('200')
    expect(table).toContain('fail')
  })

  it('caps generic tables at eight columns', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`c${i}`, i]),
    )
    const table = formatAsTable([wide])
    const headerCount = table.split('\n')[0].split(/\s+/).filter(Boolean).length
    expect(headerCount).toBe(8)
  })
})

describe('formatAsTable — JSON fallback', () => {
  it('falls back to pretty JSON for a plain object with no row array', () => {
    expect(formatAsTable({ a: 1 })).toBe(prettyJson({ a: 1 }))
  })

  it('falls back to pretty JSON for a primitive', () => {
    expect(formatAsTable('hello')).toBe(prettyJson('hello'))
    expect(formatAsTable(7)).toBe(prettyJson(7))
  })

  it('falls back to pretty JSON for a mixed array (not all records)', () => {
    expect(formatAsTable([{ id: 1 }, 'nope'])).toBe(prettyJson([{ id: 1 }, 'nope']))
  })

  it('falls back to pretty JSON for an empty array', () => {
    expect(formatAsTable([])).toBe(prettyJson([]))
  })

  it('always returns a string and never throws', () => {
    expect(typeof formatAsTable(undefined)).toBe('string')
    expect(typeof formatAsTable(null)).toBe('string')
  })
})

describe('formatAsTable — cell handling', () => {
  it('truncates cells longer than the limit with an ellipsis', () => {
    const long = 'x'.repeat(80)
    const table = formatAsTable([{ status: long, code: 1 }])
    expect(table).toContain('…')
    expect(table).not.toContain(long)
  })

  it('serialises object cells to compact JSON in generic tables', () => {
    const table = formatAsTable([{ status: 'ok', meta: { nested: true } }])
    expect(table).toContain('{"nested":true}')
  })
})
