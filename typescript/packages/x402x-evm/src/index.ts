/**
 * @module x402x-evm - x402x EVM mechanism implementation (permit/eip3009 + 7702 settlement)
 */

export { ExactX402xEvmClient, type ExactX402xEvmClientConfig } from './exact/client'
export { ExactX402xEvmFacilitator, type ExactX402xEvmFacilitatorConfig } from './exact/facilitator'
export { ExactX402xEvmServer, type ExactX402xEvmServerAssetConfig } from './exact/server'

export type {
  PermitType,
  ExactX402xEvmPayload,
  PermitAuthorization,
  Eip3009Authorization,
} from './types'

export type {
  X402xClientEvmSigner,
  X402xFacilitatorEvmSigner,
  X402xPublicEvmClient,
} from './signer'
export { toX402xClientEvmSigner, toX402xFacilitatorEvmSigner } from './signer'

export { withExtra } from './requirements'

export * from './exact'
