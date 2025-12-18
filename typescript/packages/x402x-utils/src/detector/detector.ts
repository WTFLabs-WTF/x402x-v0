import type { Address, PublicClient } from 'viem'
import type { Logger, PaymentMethod, TokenPaymentCapabilities } from './types'
import { EIP2612_PERMIT, EIP3009_SIGNATURES, PERMIT2_ADDRESS, DEFAULT_PRIORITY } from './constants'

/**
 * Default logger
 */
const defaultLogger: Logger = {
  log: (message: string) => console.log(message),
  error: (message: string, error?: unknown) => console.error(message, error),
}

/**
 * Check if the contract code contains a selector (rough detection)
 *
 * @param client - viem PublicClient
 * @param address - contract address
 * @param selector - 4-byte selector (0x...) (0x...)
 * @returns true if the contract code contains the selector, false otherwise
 */
async function codeContainsSelector(
  client: PublicClient,
  address: Address,
  selector: string,
): Promise<boolean> {
  const code = await client.getCode({ address })
  if (!code) return false
  return code.toLowerCase().includes(selector.slice(2).toLowerCase())
}

/**
 * Check if the contract supports any of the selectors
 *
 * @param client - viem PublicClient
 * @param address - contract address
 * @param selectors - selector list
 * @returns true if the contract supports any of the selectors, false otherwise
 */
async function codeContainsAnySelector(
  client: PublicClient,
  address: Address,
  selectors: readonly string[],
): Promise<boolean> {
  const code = await client.getCode({ address })
  if (!code) return false
  const lower = code.toLowerCase()
  return selectors.some((s) => lower.includes(s.slice(2).toLowerCase()))
}

/**
 * Check if Permit2 is deployed (if deployed, Permit2 is theoretically available)
 *
 * @param client - viem PublicClient
 * @returns true if Permit2 is deployed, false otherwise
 */
async function checkPermit2Support(client: PublicClient): Promise<boolean> {
  const code = await client.getCode({ address: PERMIT2_ADDRESS })
  return !!code
}

/**
 * Detect token supported payment methods (lightweight version, does not handle proxies; if you need proxies, use v1 detector)
 *
 * @param tokenAddress - token address
 * @param client - viem PublicClient
 * @param logger - logger (optional)
 * @returns payment capabilities
 */
export async function detectTokenPaymentMethods(
  tokenAddress: string,
  client: PublicClient,
  logger: Logger | null = defaultLogger,
): Promise<TokenPaymentCapabilities> {
  const address = tokenAddress.toLowerCase() as Address

  logger?.log(`🔍 Detecting payment methods for token ${address}...`)

  const [hasEIP3009, hasPermit, hasPermit2Approval] = await Promise.all([
    codeContainsAnySelector(client, address, EIP3009_SIGNATURES),
    codeContainsSelector(client, address, EIP2612_PERMIT),
    checkPermit2Support(client),
  ])

  const supportedMethods: PaymentMethod[] = []
  if (hasEIP3009) supportedMethods.push('eip3009')
  if (hasPermit) supportedMethods.push('permit')
  if (hasPermit2Approval) {
    supportedMethods.push('permit2')
    supportedMethods.push('permit2-witness')
  }

  return {
    address,
    supportedMethods,
    details: { hasEIP3009, hasPermit, hasPermit2Approval },
  }
}

/**
 * Return recommended payment method (by default priority)
 *
 * @param capabilities - detection result
 * @param priority - custom priority (optional)
 * @returns recommended PaymentMethod (if none are supported, undefined)
 */
export function getRecommendedPaymentMethod(
  capabilities: TokenPaymentCapabilities,
  priority: readonly PaymentMethod[] = DEFAULT_PRIORITY,
): PaymentMethod | undefined {
  for (const m of priority) {
    if (capabilities.supportedMethods.includes(m)) return m
  }
  return undefined
}
