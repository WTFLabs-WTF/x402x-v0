import {
  AssetAmount,
  MoneyParser,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
} from '@x402/core/types'

import { X402X_EVM_SCHEME } from '../../constants'
import { TokenDetector } from 'x402x-utils'
import type { PublicClient } from 'viem'
import type { PermitType } from '../../types'

export type ExactX402xEvmServerAssetConfig = {
  address: `0x${string}`
  decimals: number
  /**
   * 可选：写入 requirements.extra，用于客户端/促进方签名与校验
   * （缺失时，本包的 client/facilitator 会尝试链上读取）
   */
  name?: string
  version?: string
  /**
   * 可选：显式指定该资产要使用的签名类型（写入 requirements.extra.permitType）。
   */
  permitType?: PermitType
}

/**
 * x402x EVM server implementation for x402 "exact" scheme.
 *
 * 重点：提供资产注册能力（BSC/USD1 等）。
 */
export class ExactX402xEvmServer implements SchemeNetworkServer {
  private static readonly PERMIT_TYPE_PRIORITY: readonly PermitType[] = [
    'eip3009',
    'permit',
    'permit2',
  ] as const

  readonly scheme = X402X_EVM_SCHEME
  private moneyParsers: MoneyParser[] = []

  private readonly assets: Map<string, ExactX402xEvmServerAssetConfig> = new Map()
  /**
   * 按 network + token address 索引的资产表，用于在请求路径 O(1) 反查配置。
   *
   * key: `${network}:${lowercase(address)}`
   */
  private readonly assetsByAddress: Map<string, ExactX402xEvmServerAssetConfig> = new Map()
  private readonly defaultAssetByNetwork: Map<string, string> = new Map()
  private readonly detectorsByNetwork: Map<string, TokenDetector> = new Map()

  /**
   * 注册一个 network 对应的公共链读客户端（用于自动探测 token 支持的 permitType）。
   *
   * - 若未注册，则当资产未配置 permitType 时会回退到默认优先级推断（不做链上检查）
   * - 若已注册，则会在注册资产时触发一次链上探测并缓存（不在请求路径做链上 IO）
   * - 若链式调用里先 registerAsset 再 registerPublicClient，则这里会补对已注册资产做一次探测
   *
   * @param network - CAIP-2 网络，如 "eip155:56"
   * @param client - 具备 readContract 的公共读客户端
   * @returns this
   */
  registerPublicClient(network: Network, client: PublicClient): this {
    this.detectorsByNetwork.set(network, new TokenDetector(client, { logger: null }))

    // 如果先注册了资产、后注册 publicClient，则这里补触发一次预热探测（fire-and-forget）
    const prefix = `${network}:`
    for (const [key, assetConfig] of this.assets.entries()) {
      if (!key.startsWith(prefix)) continue
      this.detectAndSetPermitType(network, assetConfig)
    }
    return this
  }

  /**
   * 注册一个网络默认资产（用于 Money 价格转换）。
   *
   * @param network - CAIP-2 网络，如 "eip155:56"
   * @param symbol - 资产符号（仅用于本地 key）
   * @param config - 资产配置
   * @returns The server instance for chaining
   */
  registerAsset(network: Network, symbol: string, config: ExactX402xEvmServerAssetConfig): this {
    const key = this.assetKey(network, symbol)
    this.assets.set(key, config)

    const addrKey = this.assetAddressKey(network, config.address)
    const existing = this.assetsByAddress.get(addrKey)
    if (existing && existing !== config) {
      throw new Error(
        `Asset address already registered: ${config.address} on ${network}. ` +
          `Each token address must map to a single config instance.`,
      )
    }
    this.assetsByAddress.set(addrKey, config)

    if (!this.defaultAssetByNetwork.has(network)) {
      this.defaultAssetByNetwork.set(network, symbol.toUpperCase())
    }

    // 注册阶段预热：如果 publicClient 已就绪且用户未显式配置 permitType，则触发一次探测（fire-and-forget）
    this.detectAndSetPermitType(network, config)
    return this
  }

  /**
   * 设置某个网络的默认资产符号（必须已 registerAsset）。
   *
   * @param network - CAIP-2 网络，如 "eip155:56"
   * @param symbol - 资产符号
   * @returns The server instance for chaining
   */
  setDefaultAsset(network: Network, symbol: string): this {
    const key = this.assetKey(network, symbol)
    if (!this.assets.has(key)) {
      throw new Error(`Asset not registered: ${symbol} on ${network}`)
    }
    this.defaultAssetByNetwork.set(network, symbol.toUpperCase())
    return this
  }

  /**
   * 注册一个 Money 价格转换器。
   *
   * @param parser - 价格转换器
   * @returns The server instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): this {
    this.moneyParsers.push(parser)
    return this
  }

  /**
   * 解析一个价格并转换为资产金额。
   *
   * @param price - 价格
   * @param network - CAIP-2 网络
   * @returns The asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === 'object' && price !== null && 'amount' in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`)
      }
      return this.injectAssetExtra(
        {
          amount: price.amount,
          asset: price.asset,
          extra: price.extra || {},
        },
        network,
      )
    }

    const amount = this.parseMoneyToDecimal(price)

    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network)
      if (result !== null) return this.injectAssetExtra(result, network)
    }

    return this.injectAssetExtra(this.defaultMoneyConversion(amount, network), network)
  }

  /**
   * Build payment requirements for this scheme/network combination
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind from facilitator (unused)
   * @param supportedKind.x402Version - The x402 version
   * @param supportedKind.scheme - The logical payment scheme
   * @param supportedKind.network - The network identifier in CAIP-2 format
   * @param supportedKind.extra - Optional extra metadata regarding scheme/network implementation details
   * @param extensionKeys - Extension keys supported by the facilitator (unused)
   * @returns Payment requirements ready to be sent to clients
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number
      scheme: string
      network: Network
      extra?: Record<string, unknown>
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    // supportedKind.extra is facilitator-provided metadata (scheme/network-level).
    // We intentionally do NOT forward it to clients via PaymentRequirements.extra.
    // If you need server-side config validation, inspect supportedKind.extra here.
    void supportedKind
    void extensionKeys
    return Promise.resolve(paymentRequirements)
  }

  /**
   * 将资产注册信息（name/version/permitType）注入到 AssetAmount.extra。
   *
   * @param assetAmount - 解析出的资产金额
   * @param network - CAIP-2 网络
   * @returns 注入 extra 后的 AssetAmount
   */
  private injectAssetExtra(assetAmount: AssetAmount, network: Network): AssetAmount {
    const extra: Record<string, unknown> = { ...(assetAmount.extra || {}) }
    const assetConfig = this.assetsByAddress.get(this.assetAddressKey(network, assetAmount.asset))
    if (!assetConfig) return { ...assetAmount, extra }

    if (assetConfig.name && extra.name === undefined) extra.name = assetConfig.name
    if (assetConfig.version && extra.version === undefined) extra.version = assetConfig.version

    if (extra.permitType === undefined) {
      const permitType = this.resolvePermitType(assetConfig)
      if (permitType) extra.permitType = permitType
    }

    return { ...assetAmount, extra }
  }

  /**
   * 根据资产配置选择 permitType（优先级：eip3009 > permit > permit2）。
   *
   * @param assetConfig - 资产配置
   * @returns 选中的 permitType（如果能确定）
   */
  private resolvePermitType(assetConfig: ExactX402xEvmServerAssetConfig): PermitType | undefined {
    if (assetConfig.permitType) return assetConfig.permitType
    return ExactX402xEvmServer.PERMIT_TYPE_PRIORITY[0]
  }

  /**
   * 当资产未显式声明 permitType 时，尝试链上探测 token 支持情况。
   *
   * @param network - CAIP-2 网络
   * @param token - token 合约地址
   * @returns 探测结果（若探测失败则返回 undefined）
   */
  private async detectPermitType(
    network: Network,
    token: `0x${string}`,
  ): Promise<PermitType | undefined> {
    const detector = this.detectorsByNetwork.get(network)
    if (!detector) return undefined

    const recommended = await detector.getRecommendedMethod(token)
    if (recommended === 'eip3009') return 'eip3009'
    if (recommended === 'permit') return 'permit'
    if (recommended === 'permit2' || recommended === 'permit2-witness') return 'permit2'
    return undefined
  }

  /**
   * 若用户未显式指定 permitType，且 publicClient 已就绪，则异步探测并写回 assetConfig.permitType。
   *
   * 注意：这是 fire-and-forget，不保证立即可用；请求路径会用默认优先级兜底。
   *
   * @param network - CAIP-2 网络
   * @param assetConfig - 资产配置（引用对象，会被写回 permitType）
   */
  private detectAndSetPermitType(
    network: Network,
    assetConfig: ExactX402xEvmServerAssetConfig,
  ): void {
    if (assetConfig.permitType) return
    if (!this.detectorsByNetwork.get(network)) return

    void (async () => {
      const permitType = await this.detectPermitType(network, assetConfig.address)
      if (!assetConfig.permitType && permitType) assetConfig.permitType = permitType
    })().catch(() => {
      // ignore
    })
  }

  /**
   * Parse money to decimal.
   *
   * @param money - The money to parse (e.g., "$1.50")
   * @returns The amount in decimal
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === 'number') return money
    const cleanMoney = money.replace(/^\$/, '').trim()
    const amount = parseFloat(cleanMoney)
    if (isNaN(amount)) throw new Error(`Invalid money format: ${money}`)
    return amount
  }

  /**
   * Default money conversion implementation.
   *
   * @param amount - The amount in decimal (e.g., 1.50)
   * @param network - The network identifier in CAIP-2 format
   * @returns The asset amount
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    const symbol = this.defaultAssetByNetwork.get(network)
    if (!symbol) {
      throw new Error(
        `No default asset configured for network ${network}. Call registerAsset(network, symbol, config) first.`,
      )
    }
    const asset = this.getAsset(network, symbol)

    const tokenAmount = this.convertToTokenAmount(amount.toString(), asset.decimals)

    const extra: Record<string, unknown> = {}
    if (asset.name) extra.name = asset.name
    if (asset.version) extra.version = asset.version
    const permitType = this.resolvePermitType(asset)
    if (permitType) extra.permitType = permitType

    return {
      amount: tokenAmount,
      asset: asset.address,
      extra,
    }
  }

  /**
   * Convert decimal amount to token amount.
   *
   * @param decimalAmount - The amount in decimal (e.g., 1.50)
   * @param decimals - The number of decimals
   * @returns The amount in token
   */
  private convertToTokenAmount(decimalAmount: string, decimals: number): string {
    const amount = parseFloat(decimalAmount)
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`)
    }
    // Convert to smallest unit (e.g., for USDC with 6 decimals: 0.10 * 10^6 = 100000)
    const [intPart, decPart = ''] = String(amount).split('.')
    const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals)
    const tokenAmount = (intPart + paddedDec).replace(/^0+/, '') || '0'
    return tokenAmount
  }

  /**
   * Get the asset config for a network and symbol.
   *
   * @param network - The network identifier in CAIP-2 format
   * @param symbol - The symbol of the asset
   * @returns The asset config
   */
  private getAsset(network: Network, symbol: string): ExactX402xEvmServerAssetConfig {
    const key = this.assetKey(network, symbol)
    const cfg = this.assets.get(key)
    if (!cfg) throw new Error(`Asset not registered: ${symbol} on ${network}`)
    return cfg
  }

  /**
   * Generate a unique asset key for a network and symbol.
   *
   * @param network - The network identifier in CAIP-2 format
   * @param symbol - The symbol of the asset
   * @returns The asset key
   */
  private assetKey(network: Network, symbol: string): string {
    return `${network}:${symbol.toUpperCase()}`
  }

  /**
   * Generate a unique asset key for a network and token address (case-insensitive).
   *
   * @param network - The network identifier in CAIP-2 format
   * @param address - The token contract address
   * @returns The asset address key
   */
  private assetAddressKey(network: Network, address: string): string {
    return `${network}:${address.toLowerCase()}`
  }
}
