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
   * Price value (string or number). Treated as uiAmount.
   */
  price: string | number
  /**
   * List of token addresses to filter the built requirements.
   */
  assets?: string[]
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
   * @param options.price - Price value (uiAmount)
   * @param options.assets - Optional token address filters
   * @param options.payTo - Recipient address
   * @returns Array of payment requirements
   */
  async buildRequirements(options: {
    scheme: string
    network: Network
    price: string | number
    assets?: string[]
    payTo?: string
  }): Promise<PaymentRequirements[]> {
    const payTo = options.payTo || this.defaultPayTo
    if (!payTo) {
      throw new Error('payTo is required (either in constructor or in options)')
    }

    // 1. Build requirements first (precision handled by parsePrice in resourceServer)
    const requirements = await this.resourceServer.buildPaymentRequirements({
      scheme: options.scheme,
      network: options.network,
      payTo,
      price: options.price,
    })

    // 2. Filter by assets if provided
    if (options.assets && options.assets.length > 0) {
      return requirements.filter((req) => options.assets!.includes(req.asset))
    }

    return requirements
  }

  /**
   * Processes a payment request (Verify and Settle).
   *
   * @param paymentHeader - The PAYMENT-SIGNATURE header value (Base64)
   * @param options - Process options including requirements metadata or pre-built requirements
   * @returns Process result with status and response data
   */
  async process(
    paymentHeader: string | undefined,
    options: ProcessOptions | { requirements: PaymentRequirements[]; resourceInfo: ResourceInfo },
  ): Promise<ProcessResult> {
    let requirements: PaymentRequirements[]
    let resourceInfo: ResourceInfo

    try {
      if ('requirements' in options) {
        requirements = options.requirements
        resourceInfo = options.resourceInfo
      } else {
        const { scheme, network, price, assets } = options
        resourceInfo = options.resourceInfo
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

        // 1. Build Requirements
        requirements = await this.buildRequirements({
          scheme,
          network,
          price,
          assets,
          payTo,
        })
      }

      // 2. Parse
      const parsed = this.parse(paymentHeader, requirements)
      if (!parsed.success) {
        const paymentRequired = this.resourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          parsed.error!,
        )
        return {
          success: false,
          status: 402,
          error: parsed.error,
          paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
          response: paymentRequired,
        }
      }

      const { payload, matching } = parsed.data!

      // 3. Verify
      const verify = await this.verify(payload, matching)
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

      // 4. Settle
      const settle = await this.settle(payload, matching)
      if (!settle.success) {
        return {
          success: false,
          status: 402,
          error: 'settlement_failed',
          reason: settle.errorReason,
          response: { error: 'settlement_failed', reason: settle.errorReason },
        }
      }

      // 5. Success
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
   * Decodes the payment header and finds matching requirements.
   *
   * @param paymentHeader - The PAYMENT-SIGNATURE header (Base64)
   * @param requirements - Available payment requirements
   * @returns Parse result
   */
  parse(
    paymentHeader: string | undefined,
    requirements: PaymentRequirements[],
  ): {
    success: boolean
    error?: 'payment_required' | 'no_matching_requirements' | 'invalid_payment_signature'
    data?: { payload: PaymentPayload; matching: PaymentRequirements }
  } {
    if (!paymentHeader) {
      return { success: false, error: 'payment_required' }
    }

    try {
      const payload = decodePaymentSignatureHeader(paymentHeader)
      const matching = this.resourceServer.findMatchingRequirements(requirements, payload)

      if (!matching) {
        return { success: false, error: 'no_matching_requirements' }
      }

      return {
        success: true,
        data: { payload, matching },
      }
    } catch {
      return { success: false, error: 'invalid_payment_signature' }
    }
  }

  /**
   * Verifies the payment payload against a matching requirement.
   *
   * @param payload - The payment payload
   * @param matching - The matching payment requirement
   * @returns Verification result
   */
  async verify(payload: PaymentPayload, matching: PaymentRequirements) {
    return await this.resourceServer.verifyPayment(payload, matching)
  }

  /**
   * Settles the payment payload against a matching requirement.
   *
   * @param payload - The payment payload
   * @param matching - The matching payment requirement
   * @returns Settlement result
   */
  async settle(payload: PaymentPayload, matching: PaymentRequirements) {
    return await this.resourceServer.settlePayment(payload, matching)
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
