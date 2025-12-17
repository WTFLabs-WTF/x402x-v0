import type { PublicClient } from "viem";
import type { TokenDetectorOptions, TokenPaymentCapabilities } from "./types";
import { detectTokenPaymentMethods, getRecommendedPaymentMethod } from "./detector";

/**
 * 简易缓存版 TokenDetector（适用于 server 端进程内缓存）
 */
export class TokenDetector {
  private readonly cache = new Map<string, TokenPaymentCapabilities>();

  /**
   * @param client - viem PublicClient
   * @param options - 可选配置
   */
  constructor(
    private readonly client: PublicClient,
    private readonly options: TokenDetectorOptions = {},
  ) {}

  /**
   * 探测并缓存 token 支持的支付方式。
   *
   * @param tokenAddress - token 地址
   * @returns 探测结果（缓存命中则直接返回）
   */
  async detect(tokenAddress: string): Promise<TokenPaymentCapabilities> {
    const key = tokenAddress.toLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;

    const result = await detectTokenPaymentMethods(tokenAddress, this.client, this.options.logger ?? null);
    this.cache.set(key, result);
    return result;
  }

  /**
   * 获取推荐的支付方式。
   *
   * @param tokenAddress - token 地址
   * @returns 推荐的 payment method
   */
  async getRecommendedMethod(tokenAddress: string) {
    const caps = await this.detect(tokenAddress);
    return getRecommendedPaymentMethod(caps);
  }
}


