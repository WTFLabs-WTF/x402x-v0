import { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from '@x402/core/types'
import { getAddress } from 'viem'
import { eip3009AuthorizationTypes, permitNonceABI, permitTypes } from '../../constants'
import { X402xClientEvmSigner, X402xPublicEvmClient } from '../../signer'
import { createNonce, resolveEip712Domain } from '../../utils'
import { X402X_EVM_SCHEME } from '../../constants'
import { PermitType, ExactX402xEvmPayload } from '../../types'

export interface ExactX402xEvmClientConfig {
  signer: X402xClientEvmSigner
  /**
   * Permit 需要链上读取 nonces(owner)；如果你需要在客户端使用 permitType=permit，
   * 必须提供一个可 readContract 的公共 client。
   */
  publicClient?: X402xPublicEvmClient
  /**
   * 默认签名类型（当 PaymentRequirements.extra.permitType 未指定时生效）
   *
   * @default "eip3009"
   */
  defaultPermitType?: PermitType
}

/**
 * x402x EVM client implementation for x402 "exact" scheme.
 *
 * - 支持 EIP-3009（默认）
 * - 支持 EIP-2612 Permit（需要 publicClient 读 nonce）
 */
export class ExactX402xEvmClient implements SchemeNetworkClient {
  readonly scheme = X402X_EVM_SCHEME
  private readonly defaultPermitType: PermitType

  /**
   * Creates a new ExactX402xEvmClient instance.
   *
   * @param config - The configuration for the client
   */
  constructor(private readonly config: ExactX402xEvmClientConfig) {
    this.defaultPermitType = config.defaultPermitType ?? 'eip3009'
  }

  /**
   * Creates a new ExactX402xEvmClient instance.
   *
   * @param x402Version - The x402 version
   * @param paymentRequirements - The payment requirements
   * @returns The payment payload
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, 'x402Version' | 'payload'>> {
    const permitType =
      (paymentRequirements.extra?.permitType as PermitType | undefined) ?? this.defaultPermitType

    if (permitType === 'permit') {
      const payload = await this.createPermitPayload(paymentRequirements)
      return { x402Version, payload }
    }

    if (permitType === 'permit2') {
      throw new Error('permit2 is not implemented in x402x-evm yet')
    }

    const payload = await this.createEip3009Payload(paymentRequirements)
    return { x402Version, payload }
  }

  /**
   * Creates a new ExactX402xEvmClient instance.
   *
   * @param requirements - The payment requirements
   * @returns The payment payload
   */
  private async createEip3009Payload(
    requirements: PaymentRequirements,
  ): Promise<ExactX402xEvmPayload> {
    const nonce = createNonce()
    const now = Math.floor(Date.now() / 1000)

    const authorization = {
      from: this.config.signer.address,
      to: getAddress(requirements.payTo),
      value: requirements.amount,
      validAfter: (now - 600).toString(),
      validBefore: (now + requirements.maxTimeoutSeconds).toString(),
      nonce,
    } as const

    const chainId = parseInt(requirements.network.split(':')[1])

    // 如果服务端没提供 name/version，则尽量用 publicClient 读取（否则无法签名）
    let name = requirements.extra?.name as string | undefined
    let version = requirements.extra?.version as string | undefined
    if ((!name || !version) && this.config.publicClient) {
      const domain = await resolveEip712Domain(
        this.config.publicClient,
        getAddress(requirements.asset),
      )
      name = name ?? domain.name
      version = version ?? domain.version
    }
    if (!name || !version) {
      throw new Error(
        `EIP-712 domain parameters (name, version) are required to sign EIP-3009 for asset ${requirements.asset}`,
      )
    }

    const signature = await this.config.signer.signTypedData({
      domain: {
        name,
        version,
        chainId,
        verifyingContract: getAddress(requirements.asset),
      },
      types: eip3009AuthorizationTypes,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: getAddress(authorization.from),
        to: getAddress(authorization.to),
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
    })

    return {
      authorization,
      signature,
    }
  }

  /**
   * Creates a new ExactX402xEvmClient instance.
   *
   * @param requirements - The payment requirements
   * @returns The payment payload
   */
  private async createPermitPayload(
    requirements: PaymentRequirements,
  ): Promise<ExactX402xEvmPayload> {
    const reader = this.config.publicClient
    if (!reader) {
      throw new Error('Permit signing requires publicClient (readContract) to fetch nonces(owner)')
    }

    const chainId = parseInt(requirements.network.split(':')[1])
    const token = getAddress(requirements.asset)
    const owner = getAddress(this.config.signer.address)
    const spender = getAddress(requirements.payTo)
    const deadline = Math.floor(Date.now() / 1000 + requirements.maxTimeoutSeconds).toString()

    const nonce = (await reader.readContract({
      address: token,
      abi: permitNonceABI,
      functionName: 'nonces',
      args: [owner],
    })) as bigint

    // domain：优先使用服务端写入的 extra.name/version，缺失则链上读取
    let name = requirements.extra?.name as string | undefined
    let version = requirements.extra?.version as string | undefined
    if (!name || !version) {
      const domain = await resolveEip712Domain(reader, token)
      name = name ?? domain.name
      version = version ?? domain.version
    }

    const signature = await this.config.signer.signTypedData({
      domain: {
        name,
        version,
        chainId,
        verifyingContract: token,
      },
      types: permitTypes,
      primaryType: 'Permit',
      message: {
        owner,
        spender,
        value: BigInt(requirements.amount),
        nonce,
        deadline: BigInt(deadline),
      },
    })

    return {
      authorization: {
        owner,
        spender,
        value: requirements.amount,
        deadline,
        nonce: nonce.toString(),
      },
      signature,
    }
  }
}
