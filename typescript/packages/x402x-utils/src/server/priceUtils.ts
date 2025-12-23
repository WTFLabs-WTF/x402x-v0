import { AssetAmount, Network, Price } from '@x402/core/types'
import { AssetRegistry } from './assetRegistry'

/**
 * Enhanced AssetAmount with uiAmount support.
 *
 * **Only supported by X402Server**, not by the official x402ResourceServer.
 *
 * @example
 * // ✅ Works with X402Server
 * import { X402Server } from 'x402x-utils/server'
 * const server = new X402Server({ ... })
 * await server.buildRequirements({
 *   price: { asset: '0xUSDC', uiAmount: 10 }  // Auto-converts to amount
 * })
 *
 * @example
 * // ❌ Does NOT work with x402ResourceServer
 * import { x402ResourceServer } from '@x402/core/server'
 * const server = new x402ResourceServer(...)
 * await server.buildPaymentRequirements({
 *   price: { asset: '0xUSDC', uiAmount: 10 }  // Type error!
 * })
 */
export interface EnhancedAssetAmount extends Omit<AssetAmount, 'amount'> {
  asset: string
  /** Raw token amount (e.g., "1500000" for 1.5 USDC) */
  amount?: string
  /** User-friendly amount (e.g., 1.5 for 1.5 USDC). Requires AssetRegistry. */
  uiAmount?: number
}

/**
 * Enhanced Price type that supports uiAmount and arrays.
 *
 * **X402Server exclusive** - This type is only supported by X402Server from x402x-utils.
 * For the official x402ResourceServer, use the standard Price type from @x402/core.
 */
export type EnhancedPrice = Price | EnhancedAssetAmount | EnhancedAssetAmount[]

/**
 * Convert uiAmount to amount using decimals.
 *
 * @param uiAmount - User-friendly decimal amount (e.g., 1.5)
 * @param decimals - Token decimals (e.g., 6 for USDC, 18 for ETH)
 * @returns Token amount as string (e.g., "1500000" for 1.5 USDC)
 *
 * @example
 * uiAmountToAmount(1.5, 6) // "1500000" (USDC)
 * uiAmountToAmount(0.001, 18) // "1000000000000000" (ETH)
 */
export function uiAmountToAmount(uiAmount: number, decimals: number): string {
  if (uiAmount < 0) {
    throw new Error(`uiAmount must be non-negative, got: ${uiAmount}`)
  }
  if (decimals < 0 || decimals > 77) {
    throw new Error(`decimals must be between 0 and 77, got: ${decimals}`)
  }

  // 使用 BigInt 避免精度问题
  const multiplier = BigInt(10 ** decimals)
  const uiAmountStr = uiAmount.toFixed(decimals)
  const [integerPart, decimalPart = ''] = uiAmountStr.split('.')

  const integerBigInt = BigInt(integerPart) * multiplier
  const decimalBigInt = BigInt(decimalPart.padEnd(decimals, '0').slice(0, decimals))

  return (integerBigInt + decimalBigInt).toString()
}

/**
 * Convert amount to uiAmount using decimals.
 *
 * @param amount - Token amount as string
 * @param decimals - Token decimals
 * @returns User-friendly decimal amount
 *
 * @example
 * amountToUiAmount("1500000", 6) // 1.5 (USDC)
 * amountToUiAmount("1000000000000000", 18) // 0.001 (ETH)
 */
export function amountToUiAmount(amount: string, decimals: number): number {
  const divisor = BigInt(10 ** decimals)
  const amountBigInt = BigInt(amount)
  const integerPart = amountBigInt / divisor
  const remainder = amountBigInt % divisor

  const decimalStr = remainder.toString().padStart(decimals, '0')
  return parseFloat(`${integerPart}.${decimalStr}`)
}

/**
 * Normalized AssetAmount that guarantees amount field is present.
 */
export interface NormalizedAssetAmount {
  asset: string
  amount: string // Always present (not optional)
  extra?: Record<string, unknown>
}

/**
 * Normalize EnhancedAssetAmount to AssetAmount with amount field populated.
 * If both amount and uiAmount are provided, amount takes precedence.
 * If only uiAmount is provided, converts it to amount using the registry.
 *
 * @param price - Enhanced price with optional uiAmount
 * @param network - CAIP-2 network identifier
 * @param registry - Asset registry for looking up decimals
 * @returns Normalized AssetAmount with amount field (guaranteed non-undefined)
 * @throws Error if uiAmount is provided but decimals are not registered
 *
 * @example
 * normalizePrice(
 *   { asset: '0xUSDC', uiAmount: 1.5 },
 *   'eip155:8453',
 *   registry
 * ) // { asset: '0xUSDC', amount: '1500000' }
 */
export function normalizePrice(
  price: EnhancedAssetAmount,
  network: Network,
  registry: AssetRegistry,
): NormalizedAssetAmount {
  // 如果已经有 amount，直接返回
  if (price.amount) {
    return {
      asset: price.asset,
      amount: price.amount,
      extra: price.extra,
    }
  }

  // 如果有 uiAmount，转换为 amount
  if (price.uiAmount !== undefined) {
    const decimals = registry.getDecimals(network, price.asset)
    if (decimals === undefined) {
      throw new Error(
        `Asset ${price.asset} not registered for network ${network}. ` +
          `Please register the asset with decimals using server.registerAsset() or scheme.registerAsset()`,
      )
    }

    const amount = uiAmountToAmount(price.uiAmount, decimals)
    return {
      asset: price.asset,
      amount,
      extra: price.extra,
    }
  }

  throw new Error(
    `Either 'amount' or 'uiAmount' must be provided in AssetAmount for asset ${price.asset}`,
  )
}

/**
 * Normalize a Price (Money | AssetAmount | EnhancedAssetAmount) to standard Price type.
 * Handles uiAmount conversion if needed.
 *
 * @param price - Input price (can be Money, AssetAmount, or EnhancedAssetAmount)
 * @param network - CAIP-2 network identifier
 * @param registry - Asset registry for looking up decimals
 * @returns Normalized Price
 */
export function normalizePriceInput(
  price: Price | EnhancedAssetAmount,
  network: Network,
  registry: AssetRegistry,
): Price {
  // 如果是 Money 类型（string | number），直接返回
  if (typeof price === 'string' || typeof price === 'number') {
    return price
  }

  // 如果是对象类型且包含 asset 字段，处理 AssetAmount
  if (typeof price === 'object' && price !== null && 'asset' in price) {
    // 如果已经有 amount，可能还有 uiAmount（优先使用 amount）
    if ('amount' in price && price.amount) {
      // 标准 AssetAmount，直接返回
      return {
        asset: price.asset,
        amount: price.amount,
        extra: price.extra,
      } as AssetAmount
    }

    // 如果只有 uiAmount，需要转换
    if ('uiAmount' in price && price.uiAmount !== undefined) {
      return normalizePrice(price as EnhancedAssetAmount, network, registry)
    }

    // 如果既有 asset 但既没有 amount 也没有 uiAmount，抛出错误
    throw new Error(
      `AssetAmount must have either 'amount' or 'uiAmount' field. Got: ${JSON.stringify(price)}`,
    )
  }

  // 其他情况，直接返回
  return price
}
