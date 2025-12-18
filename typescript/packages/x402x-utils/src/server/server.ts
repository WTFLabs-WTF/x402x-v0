import { HTTPFacilitatorClient, x402ResourceServer, ResourceInfo } from '@x402/core/server'
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import {
  PaymentRequirements,
  PaymentPayload,
  Network,
  SchemeNetworkServer,
  SettleResponse,
  PaymentRequired,
  Price,
} from '@x402/core/types'

/**
 * X402ServerConfig
 */
export interface X402ServerConfig {
  /**
   * Facilitator URL
   */
  facilitatorUrl?: string
  /**
   * Optional pre-configured facilitator client
   */
  facilitatorClient?: HTTPFacilitatorClient
  /**
   * Default recipient address for payments
   */
  payTo?: string
}

/**
 * ProcessOptions
 */
export interface ProcessOptions {
  /**
   * Logical payment scheme (e.g., "exact:eip7702")
   */
  scheme: string
  /**
   * CAIP-2 network identifier (e.g., "eip155:56")
   */
  network: Network
  /**
   * Price string (e.g., "$0.001") or number
   */
  price: string | number
  /**
   * Optional override for recipient address
   */
  payTo?: string
  /**
   * Resource metadata for PaymentRequired response
   */
  resourceInfo: ResourceInfo
}

/**
 * ProcessResult
 */
export interface ProcessResult {
  success: boolean
  status: number
  error?: string
  reason?: string
  /**
   * Base64 encoded PAYMENT-REQUIRED header (for 402)
   */
  paymentRequiredHeader?: string
  /**
   * Base64 encoded PAYMENT-RESPONSE header (for 200)
   */
  paymentResponseHeader?: string
  /**
   * Settlement data (for 200)
   */
  data?: SettleResponse & { requirements: PaymentRequirements }
  /**
   * Response body for convenience
   */
  response:
    | PaymentRequired
    | (SettleResponse & { ok: boolean; message: string })
    | { error: string; reason?: string }
}

/**
 * X402 Server (V2)
 *
 * A simplified wrapper around x402ResourceServer for easier usage in Node.js/TypeScript servers.
 */
export class X402Server {
  private resourceServer: x402ResourceServer
  private defaultPayTo?: string

  /**
   * Creates a new X402Server instance.
   *
   * @param config - Server configuration
   */
  constructor(config: X402ServerConfig) {
    const facilitatorClient =
      config.facilitatorClient || new HTTPFacilitatorClient({ url: config.facilitatorUrl })
    this.resourceServer = new x402ResourceServer(facilitatorClient)
    this.defaultPayTo = config.payTo
  }

  /**
   * Registers a scheme/network server implementation.
   *
   * @param network - The network identifier
   * @param scheme - The scheme implementation
   * @returns this for chaining
   */
  register(network: Network, scheme: SchemeNetworkServer): this {
    this.resourceServer.register(network, scheme)
    return this
  }

  /**
   * Initializes the server by fetching supported kinds from facilitators.
   */
  async initialize(): Promise<void> {
    await this.resourceServer.initialize()
  }

  /**
   * Builds payment requirements for a resource.
   *
   * @param options - Requirement options
   * @param options.scheme - Logical payment scheme
   * @param options.network - CAIP-2 network identifier
   * @param options.price - Price string or number
   * @param options.payTo - Recipient address
   * @returns Array of payment requirements
   */
  async buildRequirements(options: {
    scheme: string
    network: Network
    price: string | number
    payTo?: string
  }): Promise<PaymentRequirements[]> {
    const payTo = options.payTo || this.defaultPayTo
    if (!payTo) {
      throw new Error('payTo is required (either in constructor or in options)')
    }

    return this.resourceServer.buildPaymentRequirements({
      scheme: options.scheme,
      network: options.network,
      payTo,
      price: options.price as Price,
    })
  }

  /**
   * Processes a payment request (Verify and Settle).
   *
   * @param paymentHeader - The PAYMENT-SIGNATURE header value (Base64)
   * @param options - Process options including requirements metadata
   * @returns Process result with status and response data
   */
  async process(
    paymentHeader: string | undefined,
    options: ProcessOptions,
  ): Promise<ProcessResult> {
    const { scheme, network, price, resourceInfo } = options
    const payTo = options.payTo || this.defaultPayTo

    if (!payTo) {
      return {
        success: false,
        status: 500,
        error: 'internal_error',
        reason: 'payTo is required',
        response: { error: 'internal_error', reason: 'payTo is required' },
      }
    }

    try {
      // 1. Build Requirements
      const requirements = await this.resourceServer.buildPaymentRequirements({
        scheme,
        network,
        payTo,
        price: price as Price,
      })

      // 2. Check if payment header is present
      if (!paymentHeader) {
        const paymentRequired = this.resourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          'payment_required',
        )
        return {
          success: false,
          status: 402,
          error: 'payment_required',
          paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
          response: paymentRequired,
        }
      }

      // 3. Decode and Match
      let paymentPayload: PaymentPayload
      try {
        paymentPayload = decodePaymentSignatureHeader(paymentHeader)
      } catch {
        const paymentRequired = this.resourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          'invalid_payment_signature',
        )
        return {
          success: false,
          status: 402,
          error: 'invalid_payment_signature',
          paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
          response: paymentRequired,
        }
      }

      const matching = this.resourceServer.findMatchingRequirements(requirements, paymentPayload)
      if (!matching) {
        const paymentRequired = this.resourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          'no_matching_requirements',
        )
        return {
          success: false,
          status: 402,
          error: 'no_matching_requirements',
          paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
          response: paymentRequired,
        }
      }

      // 4. Verify
      const verify = await this.resourceServer.verifyPayment(paymentPayload, matching)
      if (!verify.isValid) {
        const paymentRequired = this.resourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          verify.invalidReason || 'invalid_payment',
        )
        return {
          success: false,
          status: 402,
          error: verify.invalidReason || 'invalid_payment',
          paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
          response: paymentRequired,
        }
      }

      // 5. Settle
      const settle = await this.resourceServer.settlePayment(paymentPayload, matching)
      if (!settle.success) {
        return {
          success: false,
          status: 402, // Often still 402 if settlement fails due to client error
          error: 'settlement_failed',
          reason: settle.errorReason,
          response: { error: 'settlement_failed', reason: settle.errorReason },
        }
      }

      // 6. Success
      const paymentResponseHeader = encodePaymentResponseHeader({
        ...settle,
        requirements: matching,
      })
      return {
        success: true,
        status: 200,
        paymentResponseHeader,
        data: { ...settle, requirements: matching },
        response: { ok: true, message: 'Success', ...settle },
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return {
        success: false,
        status: 500,
        error: 'internal_server_error',
        reason: message,
        response: { error: 'internal_server_error', reason: message },
      }
    }
  }

  /**
   * Returns the underlying resource server instance.
   *
   * @returns The underlying x402ResourceServer instance.
   */
  getResourceServer(): x402ResourceServer {
    return this.resourceServer
  }
}
