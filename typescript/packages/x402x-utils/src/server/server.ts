import { HTTPFacilitatorClient, x402ResourceServer, ResourceInfo } from '@x402/core/server'
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import {
  PaymentRequirements,
  PaymentPayload,
  Network,
  SchemeNetworkServer,
  SettleResponse,
  PaymentRequired,
  Price,
} from '@x402/core/types'
import { AssetRegistry } from './assetRegistry'
import { EnhancedAssetAmount, normalizePriceInput } from './priceUtils'

/**
 * X402ServerConfig
 */
export interface X402ServerConfig {
  /**
   * Facilitator URL
   */
  facilitatorUrl?: string
  /**
   * Optional pre-configured facilitator client
   */
  facilitatorClient?: HTTPFacilitatorClient
  /**
   * Default recipient address for payments
   */
  payTo?: string
  /**
   * Optional pre-configured asset registry for decimal conversions
   */
  assetRegistry?: AssetRegistry
}

/**
 * ProcessOptions for X402Server
 *
 * **Note**: The `price` field supports enhanced types (uiAmount, arrays) that are
 * NOT available in the official x402ResourceServer.
 */
export interface ProcessOptions {
  /**
   * Logical payment scheme (e.g., "exact:eip7702")
   */
  scheme: string
  /**
   * CAIP-2 network identifier (e.g., "eip155:56")
   */
  network: Network
  /**
   * **Enhanced Price type** (X402Server exclusive).
   *
   * Supports:
   * - Money (string | number): e.g., "$0.001" or 0.001
   * - AssetAmount with amount: `{ asset, amount }`
   * - **EnhancedAssetAmount with uiAmount**: `{ asset, uiAmount }` ← Auto-converts!
   * - **Array**: `[{ asset, uiAmount }, ...]` ← Multiple tokens!
   *
   * @example
   * // uiAmount (auto-converts using AssetRegistry)
   * price: { asset: '0xUSDC', uiAmount: 10 }
   *
   * @example
   * // Multiple tokens
   * price: [
   *   { asset: '0xUSDC', uiAmount: 10 },
   *   { asset: '0xDAI', uiAmount: 10 },
   * ]
   */
  price: Price | EnhancedAssetAmount | EnhancedAssetAmount[]
  /**
   * Optional override for recipient address
   */
  payTo?: string
  /**
   * Resource metadata for PaymentRequired response
   */
  resourceInfo: ResourceInfo
}

/**
 * ProcessResult
 */
export interface ProcessResult {
  success: boolean
  status: number
  error?: string
  reason?: string
  /**
   * Base64 encoded PAYMENT-REQUIRED header (for 402)
   */
  paymentRequiredHeader?: string
  /**
   * Base64 encoded PAYMENT-RESPONSE header (for 200)
   */
  paymentResponseHeader?: string
  /**
   * Settlement data (for 200)
   */
  data?: SettleResponse & { requirements: PaymentRequirements }
  /**
   * Response body for convenience
   */
  response:
    | PaymentRequired
    | (SettleResponse & { ok: boolean; message: string })
    | { error: string; reason?: string }
}

/**
 * X402 Server (V2) - Enhanced wrapper around x402ResourceServer
 *
 * **Key Enhancements over official x402ResourceServer:**
 * - ✅ **uiAmount support**: Use user-friendly amounts (e.g., 10) instead of raw amounts (e.g., "10000000")
 * - ✅ **AssetRegistry**: Built-in asset management with automatic decimal conversion
 * - ✅ **Array support**: Multiple token options in a single call
 * - ✅ **Auto-sync**: Scheme assets automatically sync to AssetRegistry
 * - ✅ **Simplified API**: Easier to use with sensible defaults
 *
 * @example
 * ```typescript
 * import { X402Server } from 'x402x-utils/server'
 *
 * const server = new X402Server({
 *   facilitatorUrl: 'https://facilitator.example.com',
 *   payTo: '0xYourAddress'
 * })
 *
 * // Register asset with decimals
 * server.registerAsset('eip155:8453', '0xUSDC', { decimals: 6 })
 *
 * // Use uiAmount (auto-converts to amount)
 * const requirements = await server.buildRequirements({
 *   scheme: 'exact',
 *   network: 'eip155:8453',
 *   price: { asset: '0xUSDC', uiAmount: 10 }  // ← Auto-converts to "10000000"
 * })
 * ```
 *
 * @see For comparison with x402ResourceServer, see COMPARISON.md
 */
export class X402Server {
  private resourceServer: x402ResourceServer
  private defaultPayTo?: string
  private assetRegistry: AssetRegistry

  /**
   * Creates a new X402Server instance.
   *
   * @param config - Server configuration
   */
  constructor(config: X402ServerConfig) {
    const facilitatorClient =
      config.facilitatorClient || new HTTPFacilitatorClient({ url: config.facilitatorUrl })
    this.resourceServer = new x402ResourceServer(facilitatorClient)
    this.defaultPayTo = config.payTo
    this.assetRegistry = config.assetRegistry || new AssetRegistry()
  }

  /**
   * Registers a scheme/network server implementation.
   * Automatically syncs asset information from the scheme to the asset registry.
   *
   * @param network - The network identifier
   * @param scheme - The scheme implementation
   * @returns this for chaining
   *
   * @example
   * // x402x-evm scheme with built-in asset registration
   * const evmScheme = new ExactX402xEvmServer()
   *   .registerAsset('eip155:56', 'USD1', {
   *     address: '0x...',
   *     decimals: 18,
   *     permitType: 'permit'
   *   })
   *
   * server.register('eip155:56', evmScheme) // Assets auto-synced!
   */
  register(network: Network, scheme: SchemeNetworkServer): this {
    this.resourceServer.register(network, scheme)

    // Auto-sync assets from x402x-evm schemes
    this.syncAssetsFromScheme(network, scheme)

    return this
  }

  /**
   * Initializes the server by fetching supported kinds from facilitators.
   */
  async initialize(): Promise<void> {
    await this.resourceServer.initialize()
  }

  /**
   * Get the asset registry for registering token decimals.
   *
   * @returns The asset registry instance
   *
   * @example
   * server.getAssetRegistry()
   *   .registerAsset('eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', {
   *     decimals: 6,
   *     symbol: 'USDC',
   *     name: 'USD Coin'
   *   })
   */
  getAssetRegistry(): AssetRegistry {
    return this.assetRegistry
  }

  /**
   * Convenient method to register an asset for a network.
   * This is a shortcut for `server.getAssetRegistry().registerAsset()`.
   *
   * @param network - CAIP-2 network identifier
   * @param asset - Token contract address
   * @param info - Asset metadata
   * @param info.decimals - Number of decimals
   * @param info.symbol - Optional symbol
   * @param info.name - Optional name
   * @returns this for chaining
   *
   * @example
   * server
   *   .registerAsset('eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', {
   *     decimals: 6,
   *     symbol: 'USDC',
   *     name: 'USD Coin'
   *   })
   *   .registerAsset('eip155:8453', '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', {
   *     decimals: 18,
   *     symbol: 'DAI'
   *   })
   */
  registerAsset(
    network: Network,
    asset: string,
    info: { decimals: number; symbol?: string; name?: string },
  ): this {
    this.assetRegistry.registerAsset(network, asset, info)
    return this
  }

  /**
   * Register multiple assets at once.
   * This is a shortcut for `server.getAssetRegistry().registerAssets()`.
   *
   * @param network - CAIP-2 network identifier
   * @param assets - Map of asset address to asset info
   * @returns this for chaining
   *
   * @example
   * server.registerAssets('eip155:8453', {
   *   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': {
   *     decimals: 6,
   *     symbol: 'USDC',
   *     name: 'USD Coin'
   *   },
   *   '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': {
   *     decimals: 18,
   *     symbol: 'DAI',
   *     name: 'Dai Stablecoin'
   *   }
   * })
   */
  registerAssets(
    network: Network,
    assets: Record<string, { decimals: number; symbol?: string; name?: string }>,
  ): this {
    this.assetRegistry.registerAssets(network, assets)
    return this
  }

  /**
   * Builds payment requirements for a resource.
   * Supports multiple price formats:
   * - Money (string | number): "$0.001" or 0.001
   * - AssetAmount with amount: { asset: "0x...", amount: "1000000" }
   * - AssetAmount with uiAmount: { asset: "0x...", uiAmount: 1.5 }
   * - Array of AssetAmount: Multiple token options
   *
   * @param options - Requirement options
   * @param options.scheme - Logical payment scheme
   * @param options.network - CAIP-2 network identifier
   * @param options.price - Price value (supports Money, AssetAmount, or array)
   * @param options.payTo - Recipient address
   * @returns Array of payment requirements
   *
   * @example
   * // Money format
   * await server.buildRequirements({
   *   scheme: 'exact',
   *   network: 'eip155:8453',
   *   price: '$0.001',
   *   payTo: '0x...'
   * })
   *
   * @example
   * // uiAmount format (auto-converts using registered decimals)
   * await server.buildRequirements({
   *   scheme: 'exact',
   *   network: 'eip155:8453',
   *   price: { asset: '0xUSDC', uiAmount: 1.5 },
   *   payTo: '0x...'
   * })
   *
   * @example
   * // Multiple token options
   * await server.buildRequirements({
   *   scheme: 'exact',
   *   network: 'eip155:8453',
   *   price: [
   *     { asset: '0xUSDC', uiAmount: 10 },
   *     { asset: '0xDAI', uiAmount: 10 },
   *   ],
   *   payTo: '0x...'
   * })
   */
  async buildRequirements(options: {
    scheme: string
    network: Network
    price: Price | EnhancedAssetAmount | EnhancedAssetAmount[]
    payTo?: string
  }): Promise<PaymentRequirements[]> {
    const payTo = options.payTo || this.defaultPayTo
    if (!payTo) {
      throw new Error('payTo is required (either in constructor or in options)')
    }

    // Handle array of prices (multiple token options)
    if (Array.isArray(options.price)) {
      const allRequirements: PaymentRequirements[] = []

      for (const singlePrice of options.price) {
        // Normalize each price (handle uiAmount conversion)
        const normalizedPrice = normalizePriceInput(
          singlePrice,
          options.network,
          this.assetRegistry,
        )

        const requirements = await this.resourceServer.buildPaymentRequirements({
          scheme: options.scheme,
          network: options.network,
          payTo,
          price: normalizedPrice,
        })

        allRequirements.push(...requirements)
      }

      return allRequirements
    }

    // Single price - normalize and build
    const normalizedPrice = normalizePriceInput(options.price, options.network, this.assetRegistry)

    // normalizePriceInput 确保返回的 AssetAmount 包含 amount 字段
    // 或者返回 Money (string | number)
    return await this.resourceServer.buildPaymentRequirements({
      scheme: options.scheme,
      network: options.network,
      payTo,
      price: normalizedPrice,
    })
  }

  /**
   * Processes a payment request (Verify and Settle).
   *
   * @param paymentHeader - The PAYMENT-SIGNATURE header value (Base64)
   * @param options - Process options including requirements metadata or pre-built requirements
   * @returns Process result with status and response data
   */
  async process(
    paymentHeader: string | undefined,
    options: ProcessOptions | { requirements: PaymentRequirements[]; resourceInfo: ResourceInfo },
  ): Promise<ProcessResult> {
    let requirements: PaymentRequirements[]
    let resourceInfo: ResourceInfo

    try {
      if ('requirements' in options) {
        requirements = options.requirements
        resourceInfo = options.resourceInfo
      } else {
        const { scheme, network, price } = options
        resourceInfo = options.resourceInfo
        const payTo = options.payTo || this.defaultPayTo

        if (!payTo) {
          return {
            success: false,
            status: 500,
            error: 'internal_error',
            reason: 'payTo is required',
            response: { error: 'internal_error', reason: 'payTo is required' },
          }
        }

        // 1. Build Requirements
        requirements = await this.buildRequirements({
          scheme,
          network,
          price,
          payTo,
        })
      }

      // 2. Parse
      const parsed = this.parse(paymentHeader, requirements)
      if (!parsed.success) {
        const paymentRequired = this.resourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          parsed.error!,
        )
        return {
          success: false,
          status: 402,
          error: parsed.error,
          paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
          response: paymentRequired,
        }
      }

      const { payload, matching } = parsed.data!

      // 3. Verify
      const verify = await this.verify(payload, matching)
      if (!verify.isValid) {
        const paymentRequired = this.resourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          verify.invalidReason || 'invalid_payment',
        )
        return {
          success: false,
          status: 402,
          error: verify.invalidReason || 'invalid_payment',
          paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
          response: paymentRequired,
        }
      }

      // 4. Settle
      const settle = await this.settle(payload, matching)
      if (!settle.success) {
        return {
          success: false,
          status: 402,
          error: 'settlement_failed',
          reason: settle.errorReason,
          response: { error: 'settlement_failed', reason: settle.errorReason },
        }
      }

      // 5. Success
      const paymentResponseHeader = encodePaymentResponseHeader({
        ...settle,
        requirements: matching,
      })
      return {
        success: true,
        status: 200,
        paymentResponseHeader,
        data: { ...settle, requirements: matching },
        response: { ok: true, message: 'Success', ...settle },
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return {
        success: false,
        status: 500,
        error: 'internal_server_error',
        reason: message,
        response: { error: 'internal_server_error', reason: message },
      }
    }
  }

  /**
   * Decodes the payment header and finds matching requirements.
   *
   * @param paymentHeader - The PAYMENT-SIGNATURE header (Base64)
   * @param requirements - Available payment requirements
   * @returns Parse result
   */
  parse(
    paymentHeader: string | undefined,
    requirements: PaymentRequirements[],
  ): {
    success: boolean
    error?: 'payment_required' | 'no_matching_requirements' | 'invalid_payment_signature'
    data?: { payload: PaymentPayload; matching: PaymentRequirements }
  } {
    if (!paymentHeader) {
      return { success: false, error: 'payment_required' }
    }

    try {
      const payload = decodePaymentSignatureHeader(paymentHeader)
      const matching = this.resourceServer.findMatchingRequirements(requirements, payload)

      if (!matching) {
        return { success: false, error: 'no_matching_requirements' }
      }

      return {
        success: true,
        data: { payload, matching },
      }
    } catch {
      return { success: false, error: 'invalid_payment_signature' }
    }
  }

  /**
   * Verifies the payment payload against a matching requirement.
   *
   * @param payload - The payment payload
   * @param matching - The matching payment requirement
   * @returns Verification result
   */
  async verify(payload: PaymentPayload, matching: PaymentRequirements) {
    return await this.resourceServer.verifyPayment(payload, matching)
  }

  /**
   * Settles the payment payload against a matching requirement.
   *
   * @param payload - The payment payload
   * @param matching - The matching payment requirement
   * @returns Settlement result
   */
  async settle(payload: PaymentPayload, matching: PaymentRequirements) {
    return await this.resourceServer.settlePayment(payload, matching)
  }

  /**
   * Returns the underlying resource server instance.
   *
   * @returns The underlying x402ResourceServer instance.
   */
  getResourceServer(): x402ResourceServer {
    return this.resourceServer
  }

  /**
   * Inject AssetRegistry into scheme and sync existing assets.
   * Supports ExactX402xEvmServer and other schemes with asset metadata.
   *
   * @param network - The network identifier
   * @param scheme - The scheme implementation
   */
  private syncAssetsFromScheme(network: Network, scheme: SchemeNetworkServer): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schemeAny = scheme as any

    // Inject AssetRegistry into scheme if it supports it
    if (typeof schemeAny.setAssetRegistry === 'function') {
      schemeAny.setAssetRegistry(this.assetRegistry)
    }

    // Sync existing assets from scheme to registry
    // ExactX402xEvmServer has assetsByAddress map
    if (schemeAny.assetsByAddress && schemeAny.assetsByAddress instanceof Map) {
      const prefix = `${network}:`

      for (const [key, assetConfig] of schemeAny.assetsByAddress.entries()) {
        // key format: "eip155:56:0xaddress"
        if (key.startsWith(prefix)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const asset = assetConfig as any

          // Register to our AssetRegistry with full information
          if (asset.address && asset.decimals !== undefined) {
            this.assetRegistry.registerAsset(network, asset.address, {
              decimals: asset.decimals,
              symbol: asset.symbol,
              name: asset.name,
              extra: {
                permitType: asset.permitType,
                version: asset.version,
              },
            })
          }
        }
      }
    }
  }
}
