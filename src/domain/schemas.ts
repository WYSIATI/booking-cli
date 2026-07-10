import { z } from 'zod'

/**
 * Input schemas for Demand API operations.
 *
 * These are intentionally permissive (`.passthrough()`) because the authoritative
 * shapes live in Booking.com's official OpenAPI spec, which is only available to
 * approved pilot partners. We validate the handful of fields we know are required
 * and let everything else through, so the CLI is usable today and tightens up the
 * day you regenerate these from the real spec.
 *
 * @see https://developers.booking.com/demand/docs/open-api/demand-api
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const GuestsSchema = z
  .object({
    number_of_adults: z.number().int().min(1).default(2),
    number_of_rooms: z.number().int().min(1).default(1),
    children_ages: z.array(z.number().int().min(0).max(17)).optional(),
  })
  .passthrough()

export const AccommodationsSearchInput = z
  .object({
    // Exactly one location selector is expected by the real API; we don't enforce
    // which one here so callers can pass city_id, coordinates, etc.
    city_id: z.number().int().optional(),
    coordinates: z
      .object({ latitude: z.number(), longitude: z.number() })
      .passthrough()
      .optional(),
    checkin: isoDate,
    checkout: isoDate,
    guests: GuestsSchema.optional(),
    currency: z.string().length(3).optional(),
    extras: z.array(z.string()).optional(),
    rows: z.number().int().min(1).max(1000).optional(),
  })
  .passthrough()

export const AccommodationsDetailsInput = z
  .object({
    accommodations: z.array(z.number().int()).min(1),
    languages: z.array(z.string()).optional(),
  })
  .passthrough()

export const AccommodationsAvailabilityInput = z
  .object({
    accommodation: z.number().int(),
    checkin: isoDate,
    checkout: isoDate,
    guests: GuestsSchema.optional(),
    currency: z.string().length(3).optional(),
  })
  .passthrough()

export const AccommodationsReviewsInput = z
  .object({
    accommodation: z.number().int(),
    rows: z.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
  })
  .passthrough()

export const OrderPreviewInput = z
  .object({
    accommodation: z.number().int(),
    checkin: isoDate,
    checkout: isoDate,
    products: z.array(z.record(z.unknown())).min(1),
    guests: GuestsSchema.optional(),
    currency: z.string().length(3).optional(),
  })
  .passthrough()

export const OrderCreateInput = z
  .object({
    // Booking.com expects the price validated by /orders/preview to be echoed back.
    order_reference: z.string().optional(),
    accommodation: z.number().int(),
    checkin: isoDate,
    checkout: isoDate,
    products: z.array(z.record(z.unknown())).min(1),
    booker: z.record(z.unknown()),
    guests: z.array(z.record(z.unknown())).optional(),
    payment: z.record(z.unknown()).optional(),
  })
  .passthrough()

export const OrderDetailsInput = z
  .object({
    order_id: z.union([z.string(), z.number()]),
  })
  .passthrough()

export const OrderCancelInput = z
  .object({
    order_id: z.union([z.string(), z.number()]),
    reason: z.string().optional(),
  })
  .passthrough()

export type AnyInput = z.ZodType<Record<string, unknown>>
