import type { AnyInput } from './schemas.js'
import {
  AccommodationsAvailabilityInput,
  AccommodationsDetailsInput,
  AccommodationsReviewsInput,
  AccommodationsSearchInput,
  OrderCancelInput,
  OrderCreateInput,
  OrderDetailsInput,
  OrderPreviewInput,
} from './schemas.js'

/**
 * The operation registry is this project's stand-in for Booking.com's OpenAPI
 * spec. `gws` builds its command tree at runtime from Google's Discovery
 * Document; we build ours from this table at build time.
 *
 * When you gain Partner Centre access and can read the official spec, this is
 * the ONE file to reconcile: fix any `path`, tighten the `input` schema, add
 * missing operations. Every command (CLI + MCP) is generated from these entries,
 * so nothing else needs to change.
 *
 * Paths reflect the documented v3 resource layout. Treat them as provisional
 * until verified against the official spec.
 */

export type OperationKind = 'read' | 'write'

export interface Operation {
  /** Resource group, e.g. `accommodations` — becomes the CLI command group. */
  readonly resource: string
  /** Action within the resource, e.g. `search` — becomes the subcommand. */
  readonly action: string
  /** One-line summary, shown in --help and as the MCP tool description. */
  readonly summary: string
  readonly method: 'POST' | 'GET'
  /** Path appended to the API base URL. */
  readonly path: string
  /** zod schema validating the request body. */
  readonly input: AnyInput
  /**
   * `write` operations mutate state (create/cancel an order). The CLI refuses to
   * run these without an explicit --yes, and the MCP layer marks them non-idempotent.
   */
  readonly kind: OperationKind
}

export const OPERATIONS: readonly Operation[] = [
  {
    resource: 'accommodations',
    action: 'search',
    summary: 'Search stays by location and dates, with live availability.',
    method: 'POST',
    path: '/accommodations/search',
    input: AccommodationsSearchInput,
    kind: 'read',
  },
  {
    resource: 'accommodations',
    action: 'details',
    summary: 'Fetch full property content (facilities, photos, descriptions).',
    method: 'POST',
    path: '/accommodations/details',
    input: AccommodationsDetailsInput,
    kind: 'read',
  },
  {
    resource: 'accommodations',
    action: 'availability',
    summary: 'Check availability and pricing for a single property.',
    method: 'POST',
    path: '/accommodations/availability',
    input: AccommodationsAvailabilityInput,
    kind: 'read',
  },
  {
    resource: 'accommodations',
    action: 'reviews',
    summary: 'Retrieve guest reviews and score breakdowns for a property.',
    method: 'POST',
    path: '/accommodations/reviews',
    input: AccommodationsReviewsInput,
    kind: 'read',
  },
  {
    resource: 'orders',
    action: 'preview',
    summary: 'Validate an order and return the final total before booking.',
    method: 'POST',
    path: '/orders/preview',
    input: OrderPreviewInput,
    kind: 'read',
  },
  {
    resource: 'orders',
    action: 'create',
    summary: 'Create a booking. Charges the payment method. Not idempotent-safe without a reference.',
    method: 'POST',
    path: '/orders/create',
    input: OrderCreateInput,
    kind: 'write',
  },
  {
    resource: 'orders',
    action: 'details',
    summary: 'Retrieve the status and details of an existing order.',
    method: 'POST',
    path: '/orders/details',
    input: OrderDetailsInput,
    kind: 'read',
  },
  {
    resource: 'orders',
    action: 'cancel',
    summary: 'Cancel an existing order, subject to its cancellation policy.',
    method: 'POST',
    path: '/orders/cancel',
    input: OrderCancelInput,
    kind: 'write',
  },
]

export const findOperation = (
  resource: string,
  action: string,
): Operation | undefined =>
  OPERATIONS.find((op) => op.resource === resource && op.action === action)

export const resources = (): readonly string[] =>
  Array.from(new Set(OPERATIONS.map((op) => op.resource)))
