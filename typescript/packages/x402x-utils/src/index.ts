/**
 * x402x-utils
 *
 * Utilities shared across x402x packages.
 * - detector: token payment capability detection helpers (permit/eip3009/permit2)
 */

export type { PaymentMethod, TokenPaymentCapabilities } from "./detector/types";
export { getRecommendedPaymentMethod, detectTokenPaymentMethods } from "./detector/detector";
export { TokenDetector } from "./detector/cache";


