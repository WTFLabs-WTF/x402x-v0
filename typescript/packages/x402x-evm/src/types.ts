/**
 * 标记 x402x-evm 的支付签名类型（新协议字段）。
 */
export type PermitType = 'eip3009' | 'permit' | 'permit2'

export type Eip3009Authorization = {
  from: `0x${string}`
  to: `0x${string}`
  value: string
  validAfter: string
  validBefore: string
  nonce: `0x${string}`
}

export type PermitAuthorization = {
  owner: `0x${string}`
  spender: `0x${string}`
  value: string
  deadline: string
  nonce: string
}

export type ExactX402xEvmPayload =
  | {
      authorization: Eip3009Authorization
      signature: `0x${string}`
    }
  | {
      authorization: PermitAuthorization
      signature: `0x${string}`
    }
  | {
      authorization: Record<string, unknown>
      signature: `0x${string}`
    }
