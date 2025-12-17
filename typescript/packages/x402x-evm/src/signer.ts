/**
 * x402x Client signer - 只要求能做 EIP-712 typed data 签名
 */
export type X402xClientEvmSigner = {
  readonly address: `0x${string}`;
  signTypedData(message: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
};

/**
 * x402x 公共链读客户端（Permit 需要读 nonce / name / version）
 */
export type X402xPublicEvmClient = {
  readContract(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
};

/**
 * x402x Facilitator signer - 用于 verify/settle（基于 viem 能力面）
 */
export type X402xFacilitatorEvmSigner = {
  getAddresses(): readonly `0x${string}`[];
  readContract(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  verifyTypedData(args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
  }): Promise<boolean>;
  writeContract(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }): Promise<`0x${string}`>;
  waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: string }>;
  getCode(args: { address: `0x${string}` }): Promise<`0x${string}` | undefined>;
};

export function toX402xClientEvmSigner(signer: X402xClientEvmSigner): X402xClientEvmSigner {
  return signer;
}

export function toX402xFacilitatorEvmSigner(
  client: Omit<X402xFacilitatorEvmSigner, "getAddresses"> & { address: `0x${string}` },
): X402xFacilitatorEvmSigner {
  return {
    ...client,
    getAddresses: () => [client.address],
  };
}


