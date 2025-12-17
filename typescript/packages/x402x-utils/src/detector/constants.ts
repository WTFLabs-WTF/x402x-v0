import type { PaymentMethod } from "./types";

/**
 * EIP-3009 相关方法签名（selector）
 */
export const EIP3009_SIGNATURES = [
  // transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)
  "0x9c8f9f23",
  // transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)
  "0xe3ee160e",
  // authorizationState(address authorizer,bytes32 nonce)
  "0x8fcbaf0c",
] as const;

/**
 * EIP-2612 permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)
 */
export const EIP2612_PERMIT = "0xd505accf" as const;

/**
 * Uniswap Permit2 合约地址（主网通用）
 */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/**
 * 默认推荐优先级（与 x402x-evm 的 permitType 优先级一致）
 */
export const DEFAULT_PRIORITY: readonly PaymentMethod[] = [
  "eip3009",
  "permit",
  "permit2",
  "permit2-witness",
] as const;


