import { describe, expect, it } from 'vitest'
import {
  OPERATIONS,
  findOperation,
  resources,
} from '../../src/domain/registry.js'

/**
 * The registry is the single source of truth from which both the CLI command
 * tree and the MCP tool list are generated, so these invariants guard the whole
 * generated surface.
 */

describe('findOperation', () => {
  it('returns the operation for a known resource + action', () => {
    const op = findOperation('accommodations', 'search')
    expect(op).toBeDefined()
    expect(op?.path).toBe('/accommodations/search')
    expect(op?.method).toBe('POST')
  })

  it('returns undefined for an unknown pair', () => {
    expect(findOperation('accommodations', 'nope')).toBeUndefined()
    expect(findOperation('unknown', 'search')).toBeUndefined()
  })
})

describe('resources', () => {
  it('returns the unique resource groups in declaration order', () => {
    expect(resources()).toEqual(['accommodations', 'orders'])
  })

  it('does not repeat a resource that has multiple actions', () => {
    const list = resources()
    expect(new Set(list).size).toBe(list.length)
  })
})

describe('OPERATIONS invariants', () => {
  it('is non-empty', () => {
    expect(OPERATIONS.length).toBeGreaterThan(0)
  })

  it('gives every operation a zod input schema', () => {
    for (const op of OPERATIONS) {
      expect(typeof op.input.safeParse).toBe('function')
      // A schema that actually parses (empty object may fail validation, but
      // safeParse must return a discriminated result rather than throw).
      expect(op.input.safeParse({})).toHaveProperty('success')
    }
  })

  it('classifies every operation as read or write', () => {
    for (const op of OPERATIONS) {
      expect(['read', 'write']).toContain(op.kind)
    }
  })

  it('has exactly orders.create and orders.cancel as write operations', () => {
    const writes = OPERATIONS.filter((op) => op.kind === 'write').map(
      (op) => `${op.resource}.${op.action}`,
    )
    expect(new Set(writes)).toEqual(new Set(['orders.create', 'orders.cancel']))
  })

  it('gives every operation a summary and an absolute path', () => {
    for (const op of OPERATIONS) {
      expect(op.summary.length).toBeGreaterThan(0)
      expect(op.path.startsWith('/')).toBe(true)
    }
  })

  it('has no duplicate resource + action pairs', () => {
    const keys = OPERATIONS.map((op) => `${op.resource}.${op.action}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
