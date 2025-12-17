import { x402ResourceServer } from '@x402/core/server'
import { Network } from '@x402/core/types'
import { ExactX402xEvmServer } from './scheme'

export interface X402xEvmResourceServerRegistrationConfig {
  /**
   * 可选：指定注册哪些网络；不填则注册 eip155:*（推荐）
   */
  networks?: Network[]
  /**
   * 可选：复用同一个 scheme 实例（用于提前 registerAsset）
   */
  scheme?: ExactX402xEvmServer
}

/**
 * 将 x402x 的 EVM exact 机制注册到 @x402/core 的 resource server。
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for EVM resource server registration
 * @returns The server instance for chaining
 */
export function registerExactX402xEvmScheme(
  server: x402ResourceServer,
  config: X402xEvmResourceServerRegistrationConfig = {},
): x402ResourceServer {
  const scheme = config.scheme ?? new ExactX402xEvmServer()

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach((network) => {
      server.register(network, scheme)
    })
  } else {
    server.register('eip155:*', scheme)
  }

  return server
}
