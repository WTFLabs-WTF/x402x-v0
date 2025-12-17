import { toHex } from "viem";
import { X402xPublicEvmClient } from "./signer";
import { eip712DomainABI, tokenNameABI, tokenVersionABI } from "./constants";

export function createNonce(): `0x${string}` {
  const cryptoObj =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function"
      ? globalThis.crypto
      : // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("crypto").webcrypto;
  return toHex(cryptoObj.getRandomValues(new Uint8Array(32))) as `0x${string}`;
}

export async function resolveEip712Domain(
  reader: X402xPublicEvmClient,
  token: `0x${string}`,
): Promise<{ name: string; version: string }> {
  // 优先走 EIP-5267 (OpenZeppelin v5+)
  try {
    const result = (await reader.readContract({
      address: token,
      abi: eip712DomainABI,
      functionName: "eip712Domain",
    })) as unknown as readonly [unknown, string, string, unknown, unknown, unknown, unknown];
    const name = result[1];
    const version = result[2];
    if (name && version) return { name, version };
  } catch {
    // ignore
  }

  const name = (await reader.readContract({
    address: token,
    abi: tokenNameABI,
    functionName: "name",
  })) as string;

  // fallback：部分 token 有 version()，没有就默认 "1"
  let version = "1";
  try {
    version = (await reader.readContract({
      address: token,
      abi: tokenVersionABI,
      functionName: "version",
    })) as string;
  } catch {
    version = "1";
  }

  return { name, version };
}


