import type { Address, PublicClient } from "viem";
import type { Logger, PaymentMethod, TokenPaymentCapabilities } from "./types";
import { EIP2612_PERMIT, EIP3009_SIGNATURES, PERMIT2_ADDRESS, DEFAULT_PRIORITY } from "./constants";

/**
 * 默认 logger
 */
const defaultLogger: Logger = {
  log: (message: string) => console.log(message),
  error: (message: string, error?: unknown) => console.error(message, error),
};

/**
 * 检查合约字节码中是否包含 selector（粗略探测）
 *
 * @param client - viem PublicClient
 * @param address - 合约地址
 * @param selector - 4-byte selector（0x...）
 * @returns 是否包含
 */
async function codeContainsSelector(
  client: PublicClient,
  address: Address,
  selector: string,
): Promise<boolean> {
  const code = await client.getCode({ address });
  if (!code) return false;
  return code.toLowerCase().includes(selector.slice(2).toLowerCase());
}

/**
 * 检查是否支持多个 selector 的任意一个
 *
 * @param client - viem PublicClient
 * @param address - 合约地址
 * @param selectors - selector 列表
 * @returns 是否支持
 */
async function codeContainsAnySelector(
  client: PublicClient,
  address: Address,
  selectors: readonly string[],
): Promise<boolean> {
  const code = await client.getCode({ address });
  if (!code) return false;
  const lower = code.toLowerCase();
  return selectors.some(s => lower.includes(s.slice(2).toLowerCase()));
}

/**
 * 检查 Permit2 是否部署（部署则理论上可用 Permit2）
 *
 * @param client - viem PublicClient
 * @returns 是否部署
 */
async function checkPermit2Support(client: PublicClient): Promise<boolean> {
  const code = await client.getCode({ address: PERMIT2_ADDRESS });
  return !!code;
}

/**
 * 检测 token 支持的支付方式（轻量版，不处理代理；如需代理请用 v1 detector）
 *
 * @param tokenAddress - token 地址
 * @param client - viem PublicClient
 * @param logger - logger（可选）
 * @returns 支持能力
 */
export async function detectTokenPaymentMethods(
  tokenAddress: string,
  client: PublicClient,
  logger: Logger | null = defaultLogger,
): Promise<TokenPaymentCapabilities> {
  const address = tokenAddress.toLowerCase() as Address;

  logger?.log(`🔍 Detecting payment methods for token ${address}...`);

  const [hasEIP3009, hasPermit, hasPermit2Approval] = await Promise.all([
    codeContainsAnySelector(client, address, EIP3009_SIGNATURES),
    codeContainsSelector(client, address, EIP2612_PERMIT),
    checkPermit2Support(client),
  ]);

  const supportedMethods: PaymentMethod[] = [];
  if (hasEIP3009) supportedMethods.push("eip3009");
  if (hasPermit) supportedMethods.push("permit");
  if (hasPermit2Approval) {
    supportedMethods.push("permit2");
    supportedMethods.push("permit2-witness");
  }

  return {
    address,
    supportedMethods,
    details: { hasEIP3009, hasPermit, hasPermit2Approval },
  };
}

/**
 * 返回推荐的支付方式（按默认优先级）
 *
 * @param capabilities - 检测结果
 * @param priority - 自定义优先级（可选）
 * @returns 推荐的 PaymentMethod（若都不支持则 undefined）
 */
export function getRecommendedPaymentMethod(
  capabilities: TokenPaymentCapabilities,
  priority: readonly PaymentMethod[] = DEFAULT_PRIORITY,
): PaymentMethod | undefined {
  for (const m of priority) {
    if (capabilities.supportedMethods.includes(m)) return m;
  }
  return undefined;
}


