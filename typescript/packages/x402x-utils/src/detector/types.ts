/**
 * Supported payment methods
 */
export type PaymentMethod = 'eip3009' | 'permit' | 'permit2' | 'permit2-witness'

/**
 * Token payment capabilities detection result
 */
export interface TokenPaymentCapabilities {
  /** Token address */
  address: string
  /** Supported payment methods list */
  supportedMethods: PaymentMethod[]
  /** Detailed detection result */
  details: {
    /** Whether EIP-3009 (transferWithAuthorization) is supported */
    hasEIP3009: boolean
    /** Whether EIP-2612 (permit) is supported */
    hasPermit: boolean
    /** Whether Permit2 (universal authorization) is supported */
    hasPermit2Approval: boolean
  }
}

/**
 * Logger interface
 */
export interface Logger {
  log: (message: string) => void
  error: (message: string, error?: unknown) => void
}

/**
 * TokenDetector configuration options
 */
export interface TokenDetectorOptions {
  /** Custom logger, default is console */
  logger?: Logger | null // null means disable logging
}
