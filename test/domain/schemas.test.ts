import { describe, expect, it } from 'vitest'
import {
  AccommodationsAvailabilityInput,
  AccommodationsSearchInput,
  GuestsSchema,
  OrderCreateInput,
} from '../../src/domain/schemas.js'

/**
 * Schemas are intentionally permissive (`.passthrough()`); these tests pin the
 * fields we *do* enforce (required keys, YYYY-MM-DD dates) and confirm that
 * unknown keys survive parsing so the CLI keeps working ahead of the official
 * spec.
 */

const CHECKIN = '2026-08-01'
const CHECKOUT = '2026-08-05'

describe('AccommodationsSearchInput', () => {
  it('accepts a minimal valid search', () => {
    const result = AccommodationsSearchInput.safeParse({
      city_id: 20,
      checkin: CHECKIN,
      checkout: CHECKOUT,
    })
    expect(result.success).toBe(true)
  })

  it('passes through unknown keys untouched', () => {
    const result = AccommodationsSearchInput.safeParse({
      checkin: CHECKIN,
      checkout: CHECKOUT,
      order_by: 'popularity',
      nested: { anything: true },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.order_by).toBe('popularity')
      expect(result.data.nested).toEqual({ anything: true })
    }
  })

  it('requires checkin and checkout', () => {
    const result = AccommodationsSearchInput.safeParse({ city_id: 20 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('checkin')
      expect(paths).toContain('checkout')
    }
  })

  it('rejects dates that are not YYYY-MM-DD', () => {
    const result = AccommodationsSearchInput.safeParse({
      checkin: '2026-8-1',
      checkout: CHECKOUT,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('expected YYYY-MM-DD')
    }
  })

  it('rejects a currency that is not 3 characters', () => {
    const result = AccommodationsSearchInput.safeParse({
      checkin: CHECKIN,
      checkout: CHECKOUT,
      currency: 'US',
    })
    expect(result.success).toBe(false)
  })
})

describe('AccommodationsAvailabilityInput (AvailabilityInput)', () => {
  it('accepts a valid availability request', () => {
    const result = AccommodationsAvailabilityInput.safeParse({
      accommodation: 12345,
      checkin: CHECKIN,
      checkout: CHECKOUT,
    })
    expect(result.success).toBe(true)
  })

  it('requires the accommodation id', () => {
    const result = AccommodationsAvailabilityInput.safeParse({
      checkin: CHECKIN,
      checkout: CHECKOUT,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain(
        'accommodation',
      )
    }
  })

  it('rejects a non-integer accommodation id', () => {
    const result = AccommodationsAvailabilityInput.safeParse({
      accommodation: 12.5,
      checkin: CHECKIN,
      checkout: CHECKOUT,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed checkout date', () => {
    const result = AccommodationsAvailabilityInput.safeParse({
      accommodation: 1,
      checkin: CHECKIN,
      checkout: 'next friday',
    })
    expect(result.success).toBe(false)
  })
})

describe('OrderCreateInput', () => {
  const validOrder = {
    accommodation: 987,
    checkin: CHECKIN,
    checkout: CHECKOUT,
    products: [{ rate_id: 'abc' }],
    booker: { first_name: 'Ada', last_name: 'Lovelace' },
  }

  it('accepts a complete order', () => {
    const result = OrderCreateInput.safeParse(validOrder)
    expect(result.success).toBe(true)
  })

  it('passes through unknown keys (e.g. metadata)', () => {
    const result = OrderCreateInput.safeParse({
      ...validOrder,
      metadata: { source: 'agent' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata).toEqual({ source: 'agent' })
    }
  })

  it('requires the booker', () => {
    const { booker, ...withoutBooker } = validOrder
    void booker
    const result = OrderCreateInput.safeParse(withoutBooker)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain(
        'booker',
      )
    }
  })

  it('requires at least one product', () => {
    const result = OrderCreateInput.safeParse({ ...validOrder, products: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain(
        'products',
      )
    }
  })

  it('rejects an order with a malformed checkin date', () => {
    const result = OrderCreateInput.safeParse({
      ...validOrder,
      checkin: '08-01-2026',
    })
    expect(result.success).toBe(false)
  })
})

describe('GuestsSchema', () => {
  it('applies sensible defaults for adults and rooms', () => {
    const result = GuestsSchema.parse({})
    expect(result.number_of_adults).toBe(2)
    expect(result.number_of_rooms).toBe(1)
  })

  it('rejects a child age above 17', () => {
    const result = GuestsSchema.safeParse({ children_ages: [5, 18] })
    expect(result.success).toBe(false)
  })
})
