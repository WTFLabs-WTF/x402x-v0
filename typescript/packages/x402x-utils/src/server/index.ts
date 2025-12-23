/**
 * x402x-utils/server - Enhanced x402 server utilities
 *
 * **Key Features:**
 * - X402Server: Enhanced wrapper with uiAmount support
 * - AssetRegistry: Unified asset management
 * - Price conversion utilities
 *
 * @see {@link X402Server} for the main server class
 * @see COMPARISON.md for differences with x402ResourceServer
 */

export { X402Server } from './server'
export type { X402ServerConfig, ProcessOptions, ProcessResult } from './server'

export { AssetRegistry } from './assetRegistry'
export type { AssetInfo } from './assetRegistry'

export {
  uiAmountToAmount,
  amountToUiAmount,
  normalizePrice,
  normalizePriceInput,
} from './priceUtils'
export type { EnhancedAssetAmount, EnhancedPrice, NormalizedAssetAmount } from './priceUtils'
