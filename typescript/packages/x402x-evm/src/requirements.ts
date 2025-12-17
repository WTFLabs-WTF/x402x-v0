import type { PaymentRequirements } from '@x402/core/types'

/**
 * Create a copy of PaymentRequirements with extra merged in.
 * This is a small helper to keep server examples clean (avoid repeating map + spread).
 *
 * @param requirements - A single requirements object or an array
 * @param extra - Extra fields to merge into requirements.extra
 * @returns New requirements object(s) with merged extra
 */
export function withExtra<T extends PaymentRequirements | PaymentRequirements[]>(
  requirements: T,
  extra: Record<string, unknown>,
): T {
  const mergeOne = (r: PaymentRequirements): PaymentRequirements => ({
    ...r,
    extra: {
      ...(r.extra || {}),
      ...extra,
    },
  })

  return (Array.isArray(requirements) ? requirements.map(mergeOne) : mergeOne(requirements)) as T
}
