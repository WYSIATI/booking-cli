import type { Command } from 'commander'
import {
  clearCredentials,
  credentialsLocation,
  loadCredentials,
  saveCredentials,
} from '../core/credentials.js'
import { info, printResult, resolveOutputFormat } from './output.js'
import { ConfigError } from '../core/errors.js'

/**
 * Credential management: `bkng auth login | status | logout`.
 * Tokens are read from flags or the BOOKING_API_KEY / BOOKING_AFFILIATE_ID env
 * vars, then stored (encrypted when BOOKING_CLI_SECRET is set).
 */

export const registerAuthCommands = (program: Command): void => {
  const auth = program.command('auth').description('Manage Booking.com credentials')

  auth
    .command('login')
    .description('Store your Demand API key and affiliate id')
    .option('--api-key <key>', 'API key token (defaults to $BOOKING_API_KEY)')
    // Affiliate id comes from the global --affiliate-id (or $BOOKING_AFFILIATE_ID)
    // to avoid shadowing the program-level option of the same name.
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals()
      const apiKey = opts.apiKey ?? process.env.BOOKING_API_KEY
      const affiliateId = globals.affiliateId ?? process.env.BOOKING_AFFILIATE_ID
      if (!apiKey || !affiliateId) {
        throw new ConfigError(
          'Provide --api-key and --affiliate-id (or set BOOKING_API_KEY and BOOKING_AFFILIATE_ID).'
        )
      }
      const { encrypted } = await saveCredentials({ apiKey, affiliateId })
      info(`Saved credentials to ${credentialsLocation()}`)
      if (!encrypted) {
        info('WARNING: stored in plaintext. Set BOOKING_CLI_SECRET to encrypt at rest.')
      }
    })

  auth
    .command('status')
    .description('Show whether credentials are configured')
    .action(async (_opts, command) => {
      const format = resolveOutputFormat(command.optsWithGlobals())
      const envConfigured = Boolean(
        process.env.BOOKING_API_KEY && process.env.BOOKING_AFFILIATE_ID
      )
      // Encrypted-without-secret throws; status reporting treats that as "none".
      const stored = await loadCredentials().catch(() => null)
      printResult(
        {
          env_configured: envConfigured,
          stored_affiliate_id: stored?.affiliateId ?? null,
          credentials_file: credentialsLocation(),
        },
        { format }
      )
    })

  auth
    .command('logout')
    .description('Delete stored credentials')
    .action(async () => {
      await clearCredentials()
      info('Stored credentials removed.')
    })
}
