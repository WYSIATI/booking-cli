import type { Command } from 'commander'
import { findOperation } from '../domain/registry.js'
import { executeOperation } from './execute.js'
import { resolveOutputFormat } from './output.js'
import { registerBookCommand } from './book.js'

/**
 * Ergonomic helper commands, prefixed with `+` (the `gws` convention). These wrap
 * a raw operation with friendly flags and sensible defaults so a human — or an
 * agent — doesn't have to hand-build a JSON body for the common case.
 */

export const registerHelperCommands = (program: Command): void => {
  registerBookCommand(program)

  program
    .command('+find-hotel')
    .description('Search stays with simple flags instead of a JSON body')
    .requiredOption('--city-id <id>', 'Booking.com city id', (v) => Number(v))
    .requiredOption('--checkin <date>', 'Check-in date (YYYY-MM-DD)')
    .requiredOption('--checkout <date>', 'Check-out date (YYYY-MM-DD)')
    .option('--adults <n>', 'Number of adults', (v) => Number(v), 2)
    .option('--rooms <n>', 'Number of rooms', (v) => Number(v), 1)
    .option('--currency <code>', 'ISO currency code, e.g. EUR')
    .option('--rows <n>', 'Max results', (v) => Number(v))
    .action(async (opts, command) => {
      const op = findOperation('accommodations', 'search')
      if (!op) throw new Error('accommodations.search operation is not registered')

      const body: Record<string, unknown> = {
        city_id: opts.cityId,
        checkin: opts.checkin,
        checkout: opts.checkout,
        guests: { number_of_adults: opts.adults, number_of_rooms: opts.rooms },
        ...(opts.currency ? { currency: opts.currency } : {}),
        ...(opts.rows ? { rows: opts.rows } : {}),
      }

      const globals = command.optsWithGlobals()
      await executeOperation(op, {
        format: resolveOutputFormat(globals),
        affiliateId: globals.affiliateId,
        baseUrl: globals.baseUrl,
        body: { json: JSON.stringify(body) },
      })
    })
}
