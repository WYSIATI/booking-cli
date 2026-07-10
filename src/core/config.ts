import { ConfigError } from './errors.js'
import { loadCredentials } from './credentials.js'

/**
 * Resolved runtime configuration. Credentials are resolved in this order:
 *   1. Environment variables  (best for CI and AI-agent contexts)
 *   2. Stored credentials from `bkng auth login`
 * The first complete source wins.
 */

export interface ResolvedConfig {
  readonly apiKey: string
  readonly affiliateId: string
  readonly baseUrl: string
}

const DEFAULT_BASE_URL = 'https://demandapi.booking.com/3.1'

export interface ConfigOverrides {
  readonly affiliateId?: string
  readonly baseUrl?: string
}

/**
 * Validate the API base URL before any credential is attached to a request.
 * This tool's audience includes AI agents (a prompt-injection surface), so an
 * attacker-controlled `--base-url` / `BOOKING_API_BASE_URL` must not be able to
 * redirect the Bearer key and affiliate id to an arbitrary host. We require a
 * well-formed, absolute https URL.
 */
const requireValidBaseUrl = (url: string): string => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ConfigError(`Invalid API base URL: "${url}". Provide an absolute https URL.`)
  }
  if (parsed.protocol !== 'https:') {
    throw new ConfigError(
      `Refusing to send credentials over a non-https base URL: "${url}".`,
    )
  }
  return url
}

export const resolveConfig = async (
  overrides: ConfigOverrides = {},
): Promise<ResolvedConfig> => {
  const baseUrl = requireValidBaseUrl(
    overrides.baseUrl ?? process.env.BOOKING_API_BASE_URL ?? DEFAULT_BASE_URL,
  )

  const envKey = process.env.BOOKING_API_KEY
  const envAffiliate = overrides.affiliateId ?? process.env.BOOKING_AFFILIATE_ID
  if (envKey && envAffiliate) {
    return { apiKey: envKey, affiliateId: envAffiliate, baseUrl }
  }

  const stored = await loadCredentials()
  if (stored) {
    return {
      apiKey: stored.apiKey,
      affiliateId: overrides.affiliateId ?? stored.affiliateId,
      baseUrl,
    }
  }

  throw new ConfigError(
    'No credentials found. Set BOOKING_API_KEY and BOOKING_AFFILIATE_ID, ' +
      'or run `bkng auth login`. Get keys from Partner Centre once approved as a ' +
      'Managed Affiliate Partner: https://developers.booking.com/demand/docs/getting-started/prerequisites',
  )
}
