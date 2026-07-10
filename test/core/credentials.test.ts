import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearCredentials,
  credentialsLocation,
  loadCredentials,
  saveCredentials,
} from '../../src/core/credentials.js'
import { ConfigError } from '../../src/core/errors.js'

/**
 * Exercises the encrypted-at-rest credential store end to end.
 *
 * XDG_CONFIG_HOME (and HOME as a fallback) are pointed at a fresh directory
 * under os.tmpdir() for every test so the real user config is never touched;
 * the directory and the env are restored afterwards.
 */

const TOKEN = 'sk-super-secret-token-abc123'
const AFFILIATE = 'aff-4242'

interface EnvSnapshot {
  xdg: string | undefined
  home: string | undefined
  secret: string | undefined
}

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

describe('credentials store', () => {
  let tempDir: string
  let snapshot: EnvSnapshot

  beforeEach(async () => {
    snapshot = {
      xdg: process.env.XDG_CONFIG_HOME,
      home: process.env.HOME,
      secret: process.env.BOOKING_CLI_SECRET,
    }
    tempDir = await mkdtemp(join(tmpdir(), 'bkng-cred-'))
    process.env.XDG_CONFIG_HOME = tempDir
    process.env.HOME = tempDir
    delete process.env.BOOKING_CLI_SECRET
  })

  afterEach(async () => {
    restoreEnv('XDG_CONFIG_HOME', snapshot.xdg)
    restoreEnv('HOME', snapshot.home)
    restoreEnv('BOOKING_CLI_SECRET', snapshot.secret)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('resolves the credentials path inside the temporary config dir', () => {
    const location = credentialsLocation()
    expect(location.startsWith(tempDir)).toBe(true)
    expect(location.endsWith('credentials.json')).toBe(true)
  })

  it('returns null when no credentials file exists', async () => {
    expect(await loadCredentials()).toBeNull()
  })

  it('round-trips an encrypted token without writing the plaintext to disk', async () => {
    process.env.BOOKING_CLI_SECRET = 'unit-test-secret'

    const result = await saveCredentials({
      apiKey: TOKEN,
      affiliateId: AFFILIATE,
    })
    expect(result.encrypted).toBe(true)

    const onDisk = await readFile(credentialsLocation(), 'utf8')
    expect(onDisk).not.toContain(TOKEN)
    const parsed = JSON.parse(onDisk) as Record<string, unknown>
    expect(parsed.encrypted).toBe(true)
    expect(parsed.affiliateId).toBe(AFFILIATE)

    const loaded = await loadCredentials()
    expect(loaded).toEqual({ apiKey: TOKEN, affiliateId: AFFILIATE })
  })

  it('throws when loading encrypted credentials without the secret', async () => {
    process.env.BOOKING_CLI_SECRET = 'unit-test-secret'
    await saveCredentials({ apiKey: TOKEN, affiliateId: AFFILIATE })

    delete process.env.BOOKING_CLI_SECRET
    await expect(loadCredentials()).rejects.toBeInstanceOf(ConfigError)
  })

  it('throws when decrypting with the wrong secret', async () => {
    process.env.BOOKING_CLI_SECRET = 'secret-a'
    await saveCredentials({ apiKey: TOKEN, affiliateId: AFFILIATE })

    process.env.BOOKING_CLI_SECRET = 'secret-b'
    await expect(loadCredentials()).rejects.toBeInstanceOf(ConfigError)
  })

  it('throws a ConfigError on a malformed encrypted payload', async () => {
    process.env.BOOKING_CLI_SECRET = 'secret'
    // save once to create the directory, then corrupt the ciphertext shape.
    await saveCredentials({ apiKey: TOKEN, affiliateId: AFFILIATE })
    await writeFile(
      credentialsLocation(),
      JSON.stringify({
        encrypted: true,
        affiliateId: AFFILIATE,
        apiKey: 'only:three:parts',
      }),
    )
    await expect(loadCredentials()).rejects.toBeInstanceOf(ConfigError)
  })

  it('stores plaintext when no secret is configured', async () => {
    const result = await saveCredentials({
      apiKey: TOKEN,
      affiliateId: AFFILIATE,
    })
    expect(result.encrypted).toBe(false)

    const onDisk = await readFile(credentialsLocation(), 'utf8')
    expect(onDisk).toContain(TOKEN)

    const loaded = await loadCredentials()
    expect(loaded).toEqual({ apiKey: TOKEN, affiliateId: AFFILIATE })
  })

  it('clears stored credentials', async () => {
    process.env.BOOKING_CLI_SECRET = 'secret'
    await saveCredentials({ apiKey: TOKEN, affiliateId: AFFILIATE })
    expect(await loadCredentials()).not.toBeNull()

    await clearCredentials()
    expect(await loadCredentials()).toBeNull()
  })

  it('clearing when nothing is stored is a no-op', async () => {
    await expect(clearCredentials()).resolves.toBeUndefined()
  })
})
