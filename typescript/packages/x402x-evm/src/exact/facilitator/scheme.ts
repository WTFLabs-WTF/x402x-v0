import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types'
import { getAddress, Hex, isAddressEqual, parseErc6492Signature, parseSignature } from 'viem'
import {
  eip3009ABI,
  eip3009AuthorizationTypes,
  erc165ABI,
  permitTypes,
  seller7702ABI,
  SETTLE_WITH_ERC3009_INTERFACE_ID,
  SETTLE_WITH_PERMIT_INTERFACE_ID,
} from '../../constants'
import { X402X_EVM_SCHEME } from '../../constants'
import { X402xFacilitatorEvmSigner } from '../../signer'
import { resolveEip712Domain } from '../../utils'
import { ExactX402xEvmPayload, PermitType } from '../../types'

type PermitPayload = Extract<
  ExactX402xEvmPayload,
  {
    authorization: {
      owner: `0x${string}`
      spender: `0x${string}`
      value: string
      deadline: string
      nonce: string
    }
  }
>

type Eip3009Payload = Extract<
  ExactX402xEvmPayload,
  {
    authorization: {
      from: `0x${string}`
      to: `0x${string}`
      value: string
      validAfter: string
      validBefore: string
      nonce: `0x${string}`
    }
  }
>

export interface ExactX402xEvmFacilitatorConfig {
  /**
   * 当 PaymentRequirements.extra.name/version 缺失时，是否链上读取 token eip712 domain
   *
   * @default true
   */
  resolveDomainFromChain?: boolean
}

/**
 * x402x EVM facilitator implementation for x402 "exact" scheme.
 *
 * - 支持 EIP-3009 transferWithAuthorization
 * - 支持 EIP-2612 Permit（配合 7702 合约 settleWithPermit）
 * - 支持 payTo 合约的 settleWithERC3009 / settleWithPermit，并 fallback 到 token 原生方法
 */
export class ExactX402xEvmFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = X402X_EVM_SCHEME
  readonly caipFamily = 'eip155:*'
  private readonly resolveDomainFromChain: boolean

  /**
   * Creates a new ExactX402xEvmFacilitator instance.
   *
   * @param signer - The EVM signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(
    private readonly signer: X402xFacilitatorEvmSigner,
    config?: ExactX402xEvmFacilitatorConfig,
  ) {
    this.resolveDomainFromChain = config?.resolveDomainFromChain ?? true
  }

  /**
   * Returns the extra data for the supported kinds endpoint.
   *
   * @param _ - The network
   * @returns The extra data
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    // Declare what this facilitator can actually verify/settle today.
    // Note: permit2 is intentionally omitted (not implemented end-to-end).
    return {
      permitTypes: ['eip3009', 'permit'],
    }
  }

  /**
   * Returns the signers for the supported kinds endpoint.
   *
   * @param _ - The network
   * @returns The signers
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()]
  }

  /**
   * Verifies a payment payload against requirements.
   *
   * @param payload - The payment payload
   * @param requirements - The payment requirements
   * @returns The verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const p = payload.payload as ExactX402xEvmPayload

    const permitType = requirements.extra?.permitType as PermitType | undefined
    if (!permitType) {
      return { isValid: false, invalidReason: 'missing_permit_type', payer: '' }
    }

    if (payload.accepted.scheme !== X402X_EVM_SCHEME || requirements.scheme !== X402X_EVM_SCHEME) {
      const payer = this.getPayer(p, permitType)
      return { isValid: false, invalidReason: 'unsupported_scheme', payer }
    }

    if (payload.accepted.network !== requirements.network) {
      const payer = this.getPayer(p, permitType)
      return { isValid: false, invalidReason: 'network_mismatch', payer }
    }

    if (permitType === 'permit') {
      if (!this.isPermitPayload(p)) {
        return {
          isValid: false,
          invalidReason: 'invalid_permit_payload',
          payer: this.getPayer(p, permitType),
        }
      }
      return this.verifyPermit(p, requirements)
    }

    if (permitType === 'eip3009') {
      if (!this.isEip3009Payload(p)) {
        return {
          isValid: false,
          invalidReason: 'invalid_eip3009_payload',
          payer: this.getPayer(p, permitType),
        }
      }
      return this.verifyEip3009(p, requirements)
    }

    return {
      isValid: false,
      invalidReason: 'unsupported_permit_type',
      payer: this.getPayer(p, permitType),
    }
  }

  /**
   * Settles a payment payload.
   *
   * @param payload - The payment payload
   * @param requirements - The payment requirements
   * @returns The settle response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const p = payload.payload as ExactX402xEvmPayload

    const valid = await this.verify(payload, requirements)
    if (!valid.isValid) {
      const payer = valid.payer || ''
      return {
        success: false,
        network: payload.accepted.network,
        transaction: '',
        errorReason: valid.invalidReason ?? 'invalid_scheme',
        payer,
      }
    }

    const permitType = requirements.extra?.permitType as PermitType | undefined
    if (!permitType) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: '',
        errorReason: 'missing_permit_type',
        payer: valid.payer,
      }
    }
    if (permitType === 'permit') {
      if (!this.isPermitPayload(p)) {
        return {
          success: false,
          network: payload.accepted.network,
          transaction: '',
          errorReason: 'invalid_permit_payload',
          payer: valid.payer,
        }
      }
      return this.settlePermit(p, payload, requirements)
    }

    if (permitType === 'eip3009') {
      if (!this.isEip3009Payload(p)) {
        return {
          success: false,
          network: payload.accepted.network,
          transaction: '',
          errorReason: 'invalid_eip3009_payload',
          payer: valid.payer,
        }
      }
      return this.settleEip3009(p, payload, requirements)
    }

    return {
      success: false,
      network: payload.accepted.network,
      transaction: '',
      errorReason: 'unsupported_permit_type',
      payer: valid.payer,
    }
  }

  /**
   * Extract payer address from payload based on permitType.
   *
   * @param p - The scheme payload
   * @param permitType - The resolved permit type
   * @returns Payer address or empty string if unknown
   */
  private getPayer(p: ExactX402xEvmPayload, permitType: PermitType): string {
    // permit -> owner; eip3009（含缺省）-> from
    if (permitType === 'permit' && this.isPermitPayload(p)) return p.authorization.owner
    if (permitType === 'eip3009' && this.isEip3009Payload(p)) return p.authorization.from
    return ''
  }

  /**
   * Type guard for Permit payload.
   *
   * @param p - The scheme payload
   * @returns True if payload.authorization matches Permit shape
   */
  private isPermitPayload(p: ExactX402xEvmPayload): p is PermitPayload {
    const auth = (p as { authorization?: unknown }).authorization
    if (!auth || typeof auth !== 'object') return false
    return 'owner' in auth && 'spender' in auth && 'deadline' in auth && 'nonce' in auth
  }

  /**
   * Type guard for EIP-3009 payload.
   *
   * @param p - The scheme payload
   * @returns True if payload.authorization matches EIP-3009 shape
   */
  private isEip3009Payload(p: ExactX402xEvmPayload): p is Eip3009Payload {
    const auth = (p as { authorization?: unknown }).authorization
    if (!auth || typeof auth !== 'object') return false
    return (
      'from' in auth &&
      'to' in auth &&
      'validBefore' in auth &&
      'validAfter' in auth &&
      'nonce' in auth
    )
  }

  /**
   * Verify permit authorization payload.
   *
   * @param p - The permit payload
   * @param requirements - The payment requirements
   * @returns The verification response
   */
  private async verifyPermit(
    p: PermitPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const token = getAddress(requirements.asset)
    const owner = getAddress(p.authorization.owner)
    const spender = getAddress(p.authorization.spender)

    // spender 必须是 payTo（7702 合约）
    if (!isAddressEqual(spender, getAddress(requirements.payTo))) {
      return { isValid: false, invalidReason: 'invalid_spender_address', payer: owner }
    }

    // deadline 必须在未来
    const now = Math.floor(Date.now() / 1000)
    if (BigInt(p.authorization.deadline) < BigInt(now)) {
      return { isValid: false, invalidReason: 'permit_expired', payer: owner }
    }

    // value 必须 >= 需要金额
    if (BigInt(p.authorization.value) < BigInt(requirements.amount)) {
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_value',
        payer: owner,
      }
    }

    // payTo 必须支持 settleWithPermit（否则无法结算）
    const supports = await this.safeSupportsInterface(
      getAddress(requirements.payTo),
      SETTLE_WITH_PERMIT_INTERFACE_ID,
    )
    if (!supports) {
      return {
        isValid: false,
        invalidReason: 'seller_does_not_support_settle_with_permit',
        payer: owner,
      }
    }

    const chainId = parseInt(requirements.network.split(':')[1])
    const { name, version } = await this.getDomain(requirements, token)

    const ok = await this.signer.verifyTypedData({
      address: owner,
      domain: { name, version, chainId, verifyingContract: token },
      types: permitTypes,
      primaryType: 'Permit',
      message: {
        owner,
        spender,
        value: BigInt(p.authorization.value),
        nonce: BigInt(p.authorization.nonce),
        deadline: BigInt(p.authorization.deadline),
      },
      signature: p.signature,
    })
    if (!ok) {
      return { isValid: false, invalidReason: 'invalid_permit_signature', payer: owner }
    }

    // balance 检查（尽量做，失败就跳过）
    try {
      const balance = (await this.signer.readContract({
        address: token,
        abi: eip3009ABI,
        functionName: 'balanceOf',
        args: [owner],
      })) as bigint
      if (balance < BigInt(requirements.amount)) {
        return { isValid: false, invalidReason: 'insufficient_funds', payer: owner }
      }
    } catch {
      // ignore
    }

    return { isValid: true, payer: owner }
  }

  /**
   * Verifies a EIP-3009 authorization.
   *
   * @param p - The EIP-3009 authorization
   * @param requirements - The payment requirements
   * @returns The verification response
   */
  private async verifyEip3009(
    p: Eip3009Payload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const authorization = p.authorization
    const payer = getAddress(authorization.from)

    // recipient 必须是 payTo
    if (!isAddressEqual(getAddress(authorization.to), getAddress(requirements.payTo))) {
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_recipient_mismatch',
        payer,
      }
    }

    const now = Math.floor(Date.now() / 1000)
    if (BigInt(authorization.validBefore) < BigInt(now + 6)) {
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_valid_before',
        payer,
      }
    }
    if (BigInt(authorization.validAfter) > BigInt(now)) {
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_valid_after',
        payer,
      }
    }

    // value 必须 >= 需要金额
    if (BigInt(authorization.value) < BigInt(requirements.amount)) {
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_value',
        payer,
      }
    }

    const token = getAddress(requirements.asset)
    const chainId = parseInt(requirements.network.split(':')[1])
    const { name, version } = await this.getDomain(requirements, token)

    const ok = await this.signer.verifyTypedData({
      address: payer,
      domain: { name, version, chainId, verifyingContract: token },
      types: eip3009AuthorizationTypes,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: payer,
        to: getAddress(authorization.to),
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature: p.signature,
    })
    if (!ok) {
      return { isValid: false, invalidReason: 'invalid_exact_evm_payload_signature', payer }
    }

    // balance（尽量做）
    try {
      const balance = (await this.signer.readContract({
        address: token,
        abi: eip3009ABI,
        functionName: 'balanceOf',
        args: [payer],
      })) as bigint
      if (balance < BigInt(requirements.amount)) {
        return { isValid: false, invalidReason: 'insufficient_funds', payer }
      }
    } catch {
      // ignore
    }

    return { isValid: true, payer }
  }

  /**
   * Settles a EIP-3009 authorization.
   *
   * @param p - The EIP-3009 authorization
   * @param payload - The payment payload
   * @param requirements - The payment requirements
   * @returns The settle response
   */
  private async settlePermit(
    p: PermitPayload,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const token = getAddress(requirements.asset)
    const owner = getAddress(p.authorization.owner)

    const { signature } = parseErc6492Signature(p.signature as Hex)
    const parsed = parseSignature(signature)

    // 直接调用 payTo 合约 settleWithPermit（固定兼容执行路径）
    const tx = await this.signer.writeContract({
      address: getAddress(requirements.payTo),
      abi: seller7702ABI,
      functionName: 'settleWithPermit',
      args: [
        token,
        owner,
        BigInt(p.authorization.value),
        BigInt(p.authorization.deadline),
        (parsed.v as number | undefined) || parsed.yParity,
        parsed.r,
        parsed.s,
      ],
    })

    const receipt = await this.signer.waitForTransactionReceipt({ hash: tx })
    if (receipt.status !== 'success') {
      return {
        success: false,
        errorReason: 'invalid_transaction_state',
        transaction: tx,
        network: payload.accepted.network,
        payer: owner,
      }
    }

    return { success: true, transaction: tx, network: payload.accepted.network, payer: owner }
  }

  /**
   * Settles a EIP-2612 Permit authorization.
   *
   * @param p - The EIP-2612 Permit authorization
   * @param payload - The payment payload
   * @param requirements - The payment requirements
   * @returns The settle response
   */
  private async settleEip3009(
    p: Eip3009Payload,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const token = getAddress(requirements.asset)
    const payer = getAddress(p.authorization.from)
    const payTo = getAddress(requirements.payTo)

    const parseResult = parseErc6492Signature(p.signature as Hex)
    const signature = parseResult.signature as Hex
    const signatureLength = signature.startsWith('0x') ? signature.length - 2 : signature.length
    const isECDSA = signatureLength === 130

    // 如果 payTo 支持 settleWithERC3009 且签名是 ECDSA，则走 7702 合约路径；否则 fallback 到 token 原生
    const supports = isECDSA
      ? await this.safeSupportsInterface(payTo, SETTLE_WITH_ERC3009_INTERFACE_ID)
      : false

    let tx: Hex
    if (supports && isECDSA) {
      const parsed = parseSignature(signature)
      tx = await this.signer.writeContract({
        address: payTo,
        abi: seller7702ABI,
        functionName: 'settleWithERC3009',
        args: [
          token,
          payer,
          BigInt(p.authorization.value),
          BigInt(p.authorization.validAfter),
          BigInt(p.authorization.validBefore),
          p.authorization.nonce,
          (parsed.v as number | undefined) || parsed.yParity,
          parsed.r,
          parsed.s,
        ],
      })
    } else if (isECDSA) {
      const parsed = parseSignature(signature)
      tx = await this.signer.writeContract({
        address: token,
        abi: eip3009ABI,
        functionName: 'transferWithAuthorization',
        args: [
          payer,
          getAddress(p.authorization.to),
          BigInt(p.authorization.value),
          BigInt(p.authorization.validAfter),
          BigInt(p.authorization.validBefore),
          p.authorization.nonce,
          (parsed.v as number | undefined) || parsed.yParity,
          parsed.r,
          parsed.s,
        ],
      })
    } else {
      // smart wallet bytes signature overload
      tx = await this.signer.writeContract({
        address: token,
        abi: eip3009ABI,
        functionName: 'transferWithAuthorization',
        args: [
          payer,
          getAddress(p.authorization.to),
          BigInt(p.authorization.value),
          BigInt(p.authorization.validAfter),
          BigInt(p.authorization.validBefore),
          p.authorization.nonce,
          signature,
        ],
      })
    }

    const receipt = await this.signer.waitForTransactionReceipt({ hash: tx })
    if (receipt.status !== 'success') {
      return {
        success: false,
        errorReason: 'invalid_transaction_state',
        transaction: tx,
        network: payload.accepted.network,
        payer,
      }
    }

    return { success: true, transaction: tx, network: payload.accepted.network, payer }
  }

  /**
   * Checks if a contract supports an interface.
   *
   * @param address - The contract address
   * @param interfaceId - The interface ID
   * @returns True if the contract supports the interface, false otherwise
   */
  private async safeSupportsInterface(
    address: `0x${string}`,
    interfaceId: `0x${string}`,
  ): Promise<boolean> {
    try {
      return (await this.signer.readContract({
        address,
        abi: erc165ABI,
        functionName: 'supportsInterface',
        args: [interfaceId],
      })) as boolean
    } catch {
      return false
    }
  }

  /**
   * Gets the EIP-712 domain for a token.
   *
   * @param requirements - The payment requirements
   * @param token - The token address
   * @returns The EIP-712 domain
   */
  private async getDomain(
    requirements: PaymentRequirements,
    token: `0x${string}`,
  ): Promise<{ name: string; version: string }> {
    const name = requirements.extra?.name as string | undefined
    const version = requirements.extra?.version as string | undefined
    if (name && version) return { name, version }

    if (!this.resolveDomainFromChain) {
      return { name: name ?? '', version: version ?? '' }
    }

    return await resolveEip712Domain(
      { readContract: this.signer.readContract.bind(this.signer) },
      token,
    )
  }
}
