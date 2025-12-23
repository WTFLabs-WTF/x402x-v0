import { Network } from '@x402/core/types'

/**
 * Asset metadata for decimal conversion and scheme-specific information
 */
export interface AssetInfo {
  /**
   * Token contract address
   */
  address: string
  /**
   * Number of decimals (e.g., 6 for USDC, 18 for ETH)
   */
  decimals: number
  /**
   * Optional symbol (e.g., "USDC", "ETH")
   */
  symbol?: string
  /**
   * Optional name (e.g., "USD Coin")
   */
  name?: string
  /**
   * Extended metadata for scheme-specific information
   * Can include permitType, version, etc.
   */
  extra?: {
    /**
     * Payment authorization type (for x402x-evm)
     */
    permitType?: 'permit' | 'eip3009' | 'permit2'
    /**
     * Token version (for EIP-712 domain)
     */
    version?: string
    /**
     * Any other custom metadata
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    [key: string]: unknown
  }
}

/**
 * AssetRegistry manages asset metadata for decimal/amount conversions.
 * Stores decimals and other info per network+asset.
 */
export class AssetRegistry {
  private registry: Map<string, Map<string, AssetInfo>> = new Map()

  /**
   * Register an asset for a specific network.
   *
   * @param network - CAIP-2 network identifier
   * @param asset - Token contract address
   * @param info - Asset metadata (decimals, symbol, name, extra)
   * @returns this for chaining
   *
   * @example
   * // Basic registration
   * registry.registerAsset('eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', {
   *   decimals: 6,
   *   symbol: 'USDC',
   *   name: 'USD Coin'
   * })
   *
   * @example
   * // With permitType for x402x-evm
   * registry.registerAsset('eip155:56', '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d', {
   *   decimals: 18,
   *   symbol: 'USD1',
   *   name: 'USD1 Stablecoin',
   *   extra: {
   *     permitType: 'permit',
   *     version: '1'
   *   }
   * })
   */
  registerAsset(network: Network, asset: string, info: Omit<AssetInfo, 'address'>): this {
    if (!this.registry.has(network)) {
      this.registry.set(network, new Map())
    }
    const networkAssets = this.registry.get(network)!
    networkAssets.set(asset.toLowerCase(), {
      address: asset,
      ...info,
    })
    return this
  }

  /**
   * Register multiple assets for a network.
   *
   * @param network - CAIP-2 network identifier
   * @param assets - Map of asset address to asset info
   * @returns this for chaining
   */
  registerAssets(network: Network, assets: Record<string, Omit<AssetInfo, 'address'>>): this {
    for (const [address, info] of Object.entries(assets)) {
      this.registerAsset(network, address, info)
    }
    return this
  }

  /**
   * Get asset info for a specific network and asset.
   *
   * @param network - CAIP-2 network identifier
   * @param asset - Token contract address
   * @returns Asset info or undefined if not found
   */
  getAsset(network: Network, asset: string): AssetInfo | undefined {
    const networkAssets = this.registry.get(network)
    if (!networkAssets) return undefined
    return networkAssets.get(asset.toLowerCase())
  }

  /**
   * Get decimals for a specific asset.
   *
   * @param network - CAIP-2 network identifier
   * @param asset - Token contract address
   * @returns Number of decimals or undefined if not found
   */
  getDecimals(network: Network, asset: string): number | undefined {
    return this.getAsset(network, asset)?.decimals
  }

  /**
   * Check if an asset is registered.
   *
   * @param network - CAIP-2 network identifier
   * @param asset - Token contract address
   * @returns true if registered
   */
  hasAsset(network: Network, asset: string): boolean {
    return this.getAsset(network, asset) !== undefined
  }

  /**
   * Get all registered assets for a network.
   *
   * @param network - CAIP-2 network identifier
   * @returns Array of asset info
   */
  getNetworkAssets(network: Network): AssetInfo[] {
    const networkAssets = this.registry.get(network)
    if (!networkAssets) return []
    return Array.from(networkAssets.values())
  }

  /**
   * Clear all registered assets.
   */
  clear(): void {
    this.registry.clear()
  }
}
