import { x402Facilitator } from '@x402/core/facilitator'
import { Network } from '@x402/core/types'
import { X402xFacilitatorEvmSigner } from '../../signer'
import { ExactX402xEvmFacilitator, ExactX402xEvmFacilitatorConfig } from './scheme'

export interface X402xEvmFacilitatorRegistrationConfig extends ExactX402xEvmFacilitatorConfig {
  signer: X402xFacilitatorEvmSigner
  networks: Network | Network[]
}

/**
 * 将 x402x 的 EVM exact 机制注册到 @x402/core 的 facilitator。
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for EVM facilitator registration
 * @returns The facilitator instance for chaining
 */
export function registerExactX402xEvmScheme(
  facilitator: x402Facilitator,
  config: X402xEvmFacilitatorRegistrationConfig,
): x402Facilitator {
  facilitator.register(config.networks, new ExactX402xEvmFacilitator(config.signer, config))
  return facilitator
}
