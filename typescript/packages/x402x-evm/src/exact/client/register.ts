import { x402Client } from '@x402/core/client'
import { Network } from '@x402/core/types'
import { X402xClientEvmSigner, X402xPublicEvmClient } from '../../signer'
import { PermitType } from '../../types'
import { ExactX402xEvmClient } from './scheme'

export interface X402xEvmClientRegistrationConfig {
  signer: X402xClientEvmSigner
  publicClient?: X402xPublicEvmClient
  /**
   * 可选：指定注册哪些网络；不填则注册 eip155:*（推荐）
   */
  networks?: Network[]
  /**
   * 默认签名类型（当 requirements.extra.permitType 未写时）
   *
   * @default "eip3009"
   */
  defaultPermitType?: PermitType
}

/**
 * 将 x402x 的 EVM exact 机制注册到 @x402/core 的 client。
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for EVM client registration
 * @returns The client instance for chaining
 */
export function registerExactX402xEvmScheme(
  client: x402Client,
  config: X402xEvmClientRegistrationConfig,
): x402Client {
  const scheme = new ExactX402xEvmClient({
    signer: config.signer,
    publicClient: config.publicClient,
    defaultPermitType: config.defaultPermitType,
  })

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach((n) => client.register(n, scheme))
  } else {
    client.register('eip155:*', scheme)
  }

  return client
}
