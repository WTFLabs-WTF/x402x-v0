import type { PublicClient } from 'viem'
import type { TokenDetectorOptions, TokenPaymentCapabilities } from './types'
import { detectTokenPaymentMethods, getRecommendedPaymentMethod } from './detector'

/**
 * Simple caching version of TokenDetector (suitable for in-process server-side caching)
 */
export class TokenDetector {
  private readonly cache = new Map<string, TokenPaymentCapabilities>()

  /**
   * Constructor for TokenDetector.
   *
   * @param client - viem PublicClient
   * @param options - Optional configuration options
   */
  constructor(
    private readonly client: PublicClient,
    private readonly options: TokenDetectorOptions = {},
  ) {}

  /**
   * Detect and cache supported payment methods for a token.
   *
   * @param tokenAddress - token address
   * @returns detection result (returns cached result if available)
   */
  async detect(tokenAddress: string): Promise<TokenPaymentCapabilities> {
    const key = tokenAddress.toLowerCase()
    const cached = this.cache.get(key)
    if (cached) return cached

    const result = await detectTokenPaymentMethods(
      tokenAddress,
      this.client,
      this.options.logger ?? null,
    )
    this.cache.set(key, result)
    return result
  }

  /**
   * Get recommended payment method.
   *
   * @param tokenAddress - token address
   * @returns recommended payment method
   */
  async getRecommendedMethod(tokenAddress: string) {
    const caps = await this.detect(tokenAddress)
    return getRecommendedPaymentMethod(caps)
  }
}
