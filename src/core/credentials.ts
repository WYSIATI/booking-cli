import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { ConfigError } from './errors.js'

/**
 * On-disk credential storage for `bkng auth login`.
 *
 * If BOOKING_CLI_SECRET is set, the token is encrypted at rest with AES-256-GCM
 * (key derived via scrypt), mirroring how `gws` encrypts credentials. Without a
 * secret we store plaintext and the caller is warned — prefer environment
 * variables for CI / agent contexts.
 */

export interface StoredCredentials {
  readonly apiKey: string
  readonly affiliateId: string
}

interface CredentialsFile {
  readonly encrypted: boolean
  readonly affiliateId: string
  // When encrypted: iv:authTag:ciphertext (hex). Otherwise: the raw token.
  readonly apiKey: string
}

const configDir = (): string =>
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'booking-cli')

const credentialsPath = (): string => join(configDir(), 'credentials.json')

const deriveKey = (secret: string, salt: Buffer): Buffer =>
  scryptSync(secret, salt, 32)

const encrypt = (plaintext: string, secret: string): string => {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(secret, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [salt, iv, authTag, ciphertext].map((b) => b.toString('hex')).join(':')
}

const decrypt = (payload: string, secret: string): string => {
  const parts = payload.split(':')
  if (parts.length !== 4) {
    throw new ConfigError('Stored credentials are malformed. Re-run `bkng auth login`.')
  }
  const [salt, iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'hex'))
  const key = deriveKey(secret, salt as Buffer)
  const decipher = createDecipheriv('aes-256-gcm', key, iv as Buffer)
  decipher.setAuthTag(authTag as Buffer)
  try {
    return Buffer.concat([
      decipher.update(ciphertext as Buffer),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new ConfigError('Failed to decrypt credentials — is BOOKING_CLI_SECRET correct?')
  }
}

export const saveCredentials = async (
  creds: StoredCredentials,
): Promise<{ encrypted: boolean }> => {
  const secret = process.env.BOOKING_CLI_SECRET
  const encrypted = Boolean(secret)
  const file: CredentialsFile = {
    encrypted,
    affiliateId: creds.affiliateId,
    apiKey: secret ? encrypt(creds.apiKey, secret) : creds.apiKey,
  }
  await mkdir(configDir(), { recursive: true, mode: 0o700 })
  await writeFile(credentialsPath(), JSON.stringify(file, null, 2), { mode: 0o600 })
  return { encrypted }
}

export const loadCredentials = async (): Promise<StoredCredentials | null> => {
  let raw: string
  try {
    raw = await readFile(credentialsPath(), 'utf8')
  } catch {
    return null
  }
  const file = JSON.parse(raw) as CredentialsFile
  if (!file.encrypted) {
    return { apiKey: file.apiKey, affiliateId: file.affiliateId }
  }
  const secret = process.env.BOOKING_CLI_SECRET
  if (!secret) {
    throw new ConfigError(
      'Stored credentials are encrypted but BOOKING_CLI_SECRET is not set.',
    )
  }
  return { apiKey: decrypt(file.apiKey, secret), affiliateId: file.affiliateId }
}

export const clearCredentials = async (): Promise<void> => {
  await rm(credentialsPath(), { force: true })
}

export const credentialsLocation = (): string => credentialsPath()
