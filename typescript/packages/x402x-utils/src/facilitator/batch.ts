import {
  Address,
  Hex,
  encodeFunctionData,
  decodeEventLog,
  keccak256,
  parseSignature,
  getAddress,
  isAddressEqual,
  parseErc6492Signature,
  Chain,
  Log,
} from 'viem'
import { PaymentPayload, PaymentRequirements } from '@x402/core/types'

/**
 * Internal EIP-3009 Authorization type
 */
export type Eip3009Authorization = {
  from: `0x${string}`
  to: `0x${string}`
  value: string | bigint
  validAfter: string | bigint
  validBefore: string | bigint
  nonce: `0x${string}`
}

/**
 * Internal EIP-2612 Permit Authorization type
 */
export type PermitAuthorization = {
  owner: `0x${string}`
  spender: `0x${string}`
  value: string | bigint
  deadline: string | bigint
  nonce: string | bigint
}

/**
 * Unified EVM payload structure for exact scheme
 */
export type ExactX402xEvmPayload = {
  authorization: Eip3009Authorization | PermitAuthorization
  signature: `0x${string}`
}

/**
 * x402x Facilitator signer interface (v2)
 */
export type X402xFacilitatorEvmSigner = {
  getAddresses(): readonly `0x${string}`[]
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
  verifyTypedData(args: {
    address: `0x${string}`
    domain: Record<string, unknown>
    types: Record<string, unknown>
    primaryType: string
    message: Record<string, unknown>
    signature: `0x${string}`
  }): Promise<boolean>
  writeContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args: readonly unknown[]
    gas?: bigint
    gasPrice?: bigint
    chain?: Chain
  }): Promise<`0x${string}`>
  waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{
    status: 'success' | 'reverted'
    gasUsed: bigint
    logs: Log[]
  }>
  getCode(args: { address: `0x${string}` }): Promise<`0x${string}` | undefined>
  estimateContractGas?(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args: readonly unknown[]
    account: `0x${string}`
  }): Promise<bigint>
}

// ABIs required for batch settlement
const multicall3Abi = [
  {
    inputs: [
      {
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    name: 'aggregate3',
    outputs: [
      {
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
        name: 'returnData',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

const eip3009ABI = [
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'transferWithAuthorization',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'transferWithAuthorization',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const seller7702ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'payer', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'settleWithPermit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'payer', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'settleWithERC3009',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'token', type: 'address' },
      { indexed: true, name: 'payer', type: 'address' },
      { indexed: true, name: 'sigHash', type: 'bytes32' },
      { indexed: false, name: 'facilitator', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'beneficiaryAmount', type: 'uint256' },
      { indexed: false, name: 'feeAmount', type: 'uint256' },
      { indexed: false, name: 'method', type: 'string' },
    ],
    name: 'SettlementExecuted',
    type: 'event',
  },
] as const

const erc165ABI = [
  {
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const SETTLE_WITH_ERC3009_INTERFACE_ID = '0x1fe200d9' as const

/**
 * Individual result for a batch settlement item
 */
export interface BatchSettleResult {
  success: boolean
  payer: string
  error?: string
  settlementDetails?: {
    amount: string
    beneficiaryAmount: string
    feeAmount: string
    method: string
  }
}

/**
 * Batch settle multiple EVM payments using Multicall3 (v2 version)
 *
 * @param signer - The EVM facilitator signer
 * @param payments - Array of payment payloads and requirements
 * @param options - Settlement options
 * @param options.gasPrice - Optional gas price
 * @param options.allowFailure - Whether to allow individual failures (default: true)
 * @param options.multicallAddress - Custom Multicall3 address
 * @param options.gasBuffer - Gas buffer percentage (default: 50)
 * @param options.chain - Target chain
 * @returns Result of the batch operation
 */
export async function evmBatchSettle(
  signer: X402xFacilitatorEvmSigner,
  payments: Array<{
    payload: PaymentPayload
    requirements: PaymentRequirements
  }>,
  options?: {
    gasPrice?: bigint
    allowFailure?: boolean
    multicallAddress?: Address
    gasBuffer?: number
    chain?: Chain
  },
): Promise<{
  success: boolean
  transaction?: Hex
  network: string
  errorReason?: string
  gasUsed?: bigint
  gasEstimated?: bigint
  results?: BatchSettleResult[]
}> {
  const gasPrice = options?.gasPrice
  const allowFailure = options?.allowFailure ?? true
  const multicallAddress = options?.multicallAddress ?? '0xcA11bde05977b3631167028862bE2a173976CA11'
  const gasBuffer = options?.gasBuffer ?? 50

  if (payments.length === 0) {
    return { success: false, network: '', errorReason: 'no_payments_provided' }
  }

  const firstNetwork = payments[0].payload.accepted.network
  const calls: Array<{ target: Address; allowFailure: boolean; callData: Hex }> = []
  const payers: string[] = []

  try {
    for (const payment of payments) {
      const p = payment.payload.payload as ExactX402xEvmPayload
      const requirements = payment.requirements
      const permitType = requirements.extra?.permitType as string | undefined

      if (!permitType) throw new Error('missing_permit_type')

      let target: Address
      let callData: Hex
      let payer: string

      if (permitType === 'permit' && 'owner' in p.authorization) {
        const auth = p.authorization as PermitAuthorization
        payer = auth.owner
        target = getAddress(requirements.payTo)
        const { signature } = parseErc6492Signature(p.signature)
        const parsed = parseSignature(signature)
        callData = encodeFunctionData({
          abi: seller7702ABI,
          functionName: 'settleWithPermit',
          args: [
            getAddress(requirements.asset),
            getAddress(auth.owner),
            BigInt(auth.value),
            BigInt(auth.deadline),
            Number(parsed.v || parsed.yParity),
            parsed.r,
            parsed.s,
          ],
        })
      } else if (permitType === 'eip3009' && 'from' in p.authorization) {
        const auth = p.authorization as Eip3009Authorization
        payer = auth.from
        const token = getAddress(requirements.asset)
        const payTo = getAddress(requirements.payTo)

        // Determine if we should use 7702 or token native
        const { signature } = parseErc6492Signature(p.signature)
        const signatureLength = signature.startsWith('0x') ? signature.length - 2 : signature.length
        const isECDSA = signatureLength === 130

        let supports7702 = false
        if (isECDSA) {
          try {
            supports7702 = (await signer.readContract({
              address: payTo,
              abi: erc165ABI,
              functionName: 'supportsInterface',
              args: [SETTLE_WITH_ERC3009_INTERFACE_ID],
            })) as boolean
          } catch {
            supports7702 = false
          }
        }

        if (supports7702 && isECDSA) {
          const parsed = parseSignature(signature)
          target = payTo
          callData = encodeFunctionData({
            abi: seller7702ABI,
            functionName: 'settleWithERC3009',
            args: [
              token,
              getAddress(auth.from),
              BigInt(auth.value),
              BigInt(auth.validAfter),
              BigInt(auth.validBefore),
              auth.nonce,
              Number(parsed.v || parsed.yParity),
              parsed.r,
              parsed.s,
            ],
          })
        } else {
          target = token
          if (isECDSA) {
            const parsed = parseSignature(signature)
            callData = encodeFunctionData({
              abi: eip3009ABI,
              functionName: 'transferWithAuthorization',
              args: [
                getAddress(auth.from),
                getAddress(auth.to),
                BigInt(auth.value),
                BigInt(auth.validAfter),
                BigInt(auth.validBefore),
                auth.nonce,
                Number(parsed.v || parsed.yParity),
                parsed.r,
                parsed.s,
              ],
            })
          } else {
            callData = encodeFunctionData({
              abi: eip3009ABI,
              functionName: 'transferWithAuthorization',
              args: [
                getAddress(auth.from),
                getAddress(auth.to),
                BigInt(auth.value),
                BigInt(auth.validAfter),
                BigInt(auth.validBefore),
                auth.nonce,
                signature,
              ],
            })
          }
        }
      } else {
        throw new Error(`unsupported_permit_type_or_payload: ${permitType}`)
      }

      calls.push({ target, allowFailure, callData })
      payers.push(payer)
    }
  } catch (error) {
    return {
      success: false,
      network: firstNetwork,
      errorReason: error instanceof Error ? error.message : 'failed_to_prepare_calls',
    }
  }

  // Gas estimation
  let estimatedGas: bigint | undefined
  if (signer.estimateContractGas) {
    try {
      const baseGasEstimate = await signer.estimateContractGas({
        address: multicallAddress,
        abi: multicall3Abi,
        functionName: 'aggregate3',
        args: [calls],
        account: signer.getAddresses()[0],
      })
      estimatedGas = baseGasEstimate + (baseGasEstimate * BigInt(gasBuffer)) / 100n
    } catch {
      estimatedGas = BigInt(calls.length) * 300000n
      estimatedGas = estimatedGas + (estimatedGas * 30n) / 100n
    }
  }

  // Execute transaction
  let tx: Hex
  try {
    tx = await signer.writeContract({
      address: multicallAddress,
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [calls],
      gas: estimatedGas,
      gasPrice,
      chain: options?.chain,
    })
  } catch (error) {
    return {
      success: false,
      network: firstNetwork,
      errorReason: error instanceof Error ? error.message : 'transaction_failed',
    }
  }

  const receipt = await signer.waitForTransactionReceipt({ hash: tx })
  if (receipt.status !== 'success') {
    return {
      success: false,
      transaction: tx,
      network: firstNetwork,
      errorReason: 'transaction_reverted',
    }
  }

  const results = await parseSettleResults(receipt, payments, payers, allowFailure)
  const overallSuccess = allowFailure ? results.every((r) => r.success) : true

  return {
    success: overallSuccess,
    transaction: tx,
    network: firstNetwork,
    gasUsed: receipt.gasUsed,
    gasEstimated: estimatedGas,
    results,
  }
}

type SettlementEventLog = {
  token: Address
  payer: Address
  sigHash: Hex
  facilitator: Address
  amount: bigint
  beneficiaryAmount: bigint
  feeAmount: bigint
  method: string
}

/**
 * Parses settlement results from transaction logs
 *
 * @param receipt - The transaction receipt object
 * @param receipt.logs - The log entries from the receipt
 * @param payments - The original payments array
 * @param payers - The extracted payer addresses
 * @param allowFailure - Whether individual failures were allowed
 * @returns Array of individual results
 */
async function parseSettleResults(
  receipt: { logs: Log[] },
  payments: Array<{ payload: PaymentPayload }>,
  payers: string[],
  allowFailure: boolean,
): Promise<BatchSettleResult[]> {
  if (!allowFailure) {
    return payers.map((payer) => ({ success: true, payer }))
  }

  const settlementEvents: SettlementEventLog[] = []
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: seller7702ABI,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'SettlementExecuted') {
        settlementEvents.push(decoded.args as unknown as SettlementEventLog)
      }
    } catch {
      continue
    }
  }

  return payers.map((payer, index) => {
    const payment = payments[index]
    const { signature } = parseErc6492Signature(
      (payment.payload.payload as ExactX402xEvmPayload).signature,
    )
    const sigHash = keccak256(signature)

    const match = settlementEvents.find(
      (e) =>
        isAddressEqual(e.payer, getAddress(payer)) &&
        e.sigHash.toLowerCase() === sigHash.toLowerCase(),
    )

    if (match) {
      return {
        success: true,
        payer,
        settlementDetails: {
          amount: match.amount.toString(),
          beneficiaryAmount: match.beneficiaryAmount.toString(),
          feeAmount: match.feeAmount.toString(),
          method: match.method,
        },
      }
    }
    return { success: false, payer, error: 'Settlement event not found' }
  })
}
