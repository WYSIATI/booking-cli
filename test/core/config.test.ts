import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig } from '../../src/core/config.js'
import { saveCredentials } from '../../src/core/credentials.js'
import { ConfigError } from '../../src/core/errors.js'

/**
 * `resolveConfig` validates the API base URL (a credential-exfiltration guard)
 * and resolves credentials with a fixed precedence: env vars first, then stored
 * login. Credential storage is redirected at a temporary XDG_CONFIG_HOME so the
 * real user config is never touched.
 */

const ENV_KEYS = [
  'BOOKING_API_KEY',
  'BOOKING_AFFILIATE_ID',
  'BOOKING_API_BASE_URL',
  'BOOKING_CLI_SECRET',
  'XDG_CONFIG_HOME',
] as const

describe('resolveConfig', () => {
  const saved: Record<string, string | undefined> = {}
  const tempDirs: string[] = []

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
  })

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  const isolateConfigHome = async (): Promise<void> => {
    const dir = await mkdtemp(join(tmpdir(), 'bkng-config-'))
    tempDirs.push(dir)
    process.env.XDG_CONFIG_HOME = dir
  }

  describe('base URL validation', () => {
    beforeEach(() => {
      process.env.BOOKING_API_KEY = 'key'
      process.env.BOOKING_AFFILIATE_ID = 'aff'
      delete process.env.BOOKING_API_BASE_URL
    })

    it('defaults to the official https demand API host', async () => {
      const config = await resolveConfig()
      expect(config.baseUrl).toBe('https://demandapi.booking.com/3.1')
    })

    it('accepts an https override', async () => {
      const config = await resolveConfig({ baseUrl: 'https://sandbox.example.com/3' })
      expect(config.baseUrl).toBe('https://sandbox.example.com/3')
    })

    it('rejects a non-https base URL so credentials cannot be exfiltrated', async () => {
      await expect(
        resolveConfig({ baseUrl: 'http://evil.example.com' })
      ).rejects.toBeInstanceOf(ConfigError)
    })

    it('rejects a malformed base URL', async () => {
      await expect(resolveConfig({ baseUrl: 'not a url' })).rejects.toBeInstanceOf(
        ConfigError
      )
    })

    it('rejects a non-https BOOKING_API_BASE_URL from the environment', async () => {
      process.env.BOOKING_API_BASE_URL = 'http://evil.example.com'
      await expect(resolveConfig()).rejects.toBeInstanceOf(ConfigError)
    })
  })

  describe('credential precedence', () => {
    beforeEach(async () => {
      await isolateConfigHome()
      delete process.env.BOOKING_API_KEY
      delete process.env.BOOKING_AFFILIATE_ID
      delete process.env.BOOKING_CLI_SECRET
      delete process.env.BOOKING_API_BASE_URL
    })

    it('uses environment credentials when present', async () => {
      process.env.BOOKING_API_KEY = 'env-key'
      process.env.BOOKING_AFFILIATE_ID = 'env-aff'
      const config = await resolveConfig()
      expect(config).toMatchObject({ apiKey: 'env-key', affiliateId: 'env-aff' })
    })

    it('falls back to stored credentials when env is absent', async () => {
      await saveCredentials({ apiKey: 'stored-key', affiliateId: 'stored-aff' })
      const config = await resolveConfig()
      expect(config).toMatchObject({ apiKey: 'stored-key', affiliateId: 'stored-aff' })
    })

    it('lets an explicit affiliateId override the stored one', async () => {
      await saveCredentials({ apiKey: 'stored-key', affiliateId: 'stored-aff' })
      const config = await resolveConfig({ affiliateId: 'override-aff' })
      expect(config.affiliateId).toBe('override-aff')
    })

    it('throws ConfigError when no credentials are available', async () => {
      await expect(resolveConfig()).rejects.toBeInstanceOf(ConfigError)
    })
  })
})
