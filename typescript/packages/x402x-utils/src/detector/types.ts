/**
 * 支持的支付方式
 */
export type PaymentMethod = 'eip3009' | 'permit' | 'permit2' | 'permit2-witness'

/**
 * Token 支付能力检测结果
 */
export interface TokenPaymentCapabilities {
  /** Token 地址 */
  address: string
  /** 支持的支付方式列表 */
  supportedMethods: PaymentMethod[]
  /** 详细检测结果 */
  details: {
    /** 是否支持 EIP-3009 (transferWithAuthorization) */
    hasEIP3009: boolean
    /** 是否支持 EIP-2612 (permit) */
    hasPermit: boolean
    /** 是否支持 Permit2 (通用授权) */
    hasPermit2Approval: boolean
  }
}

/**
 * Logger 接口
 */
export interface Logger {
  log: (message: string) => void
  error: (message: string, error?: unknown) => void
}

/**
 * TokenDetector 配置选项
 */
export interface TokenDetectorOptions {
  /** 自定义 logger，默认使用 console */
  logger?: Logger | null // null 表示禁用日志
}
