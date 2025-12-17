import { Account, Address, Chain, Hex, Transport, hexToSignature } from "viem";
import {
  ConnectedClient,
  SignerWallet,
  EIP7702SellerWalletMinimalAbi,
} from "../../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  ExactEvmPayload,
  Eip3009PaymentPayload,
  PermitPaymentPayload,
  Permit2PaymentPayload,
} from "../../../../types/verify";

export type SimulationResult = {
  success: boolean;
  error?: string;
  logs?: string[];
};

export type ProfitabilityResult = {
  gasEstimate: bigint;
  feeProfit: bigint;
  feeToken: Address;
  error?: string;
};

// TokenBalanceDiff 合约地址
const TOKEN_BALANCE_DIFF_ADDRESS = "0xC44364B5ED782cAC4E8bA7e3104E7A1F6DE97828" as Address;

// TokenBalanceDiff 合约 ABI
const TOKEN_BALANCE_DIFF_ABI = [
  {
    inputs: [
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "address", name: "feeRecipient", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "payer", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "validAfter", type: "uint256" },
      { internalType: "uint256", name: "validBefore", type: "uint256" },
      { internalType: "bytes32", name: "nonce", type: "bytes32" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "getFeeRecipientChangeForERC3009",
    outputs: [{ internalType: "uint256", name: "feeRecipientChange", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "address", name: "feeRecipient", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "payer", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "getFeeRecipientChangeForPermit",
    outputs: [{ internalType: "uint256", name: "feeRecipientChange", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "address", name: "feeRecipient", type: "address" },
      {
        components: [
          {
            components: [
              { internalType: "address", name: "token", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            internalType: "struct IPermit2Settlement.TokenPermissions",
            name: "permitted",
            type: "tuple",
          },
          { internalType: "uint256", name: "nonce", type: "uint256" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct IPermit2Settlement.PermitTransferFrom",
        name: "permit",
        type: "tuple",
      },
      { internalType: "address", name: "payer", type: "address" },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "getFeeRecipientChangeForPermit2",
    outputs: [{ internalType: "uint256", name: "feeRecipientChange", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * 模拟 EVM 交易以验证其是否能够成功执行
 * 这个函数会尝试模拟合约调用，如果失败则返回错误信息
 *
 * @param client - 用于区块链交互的公共客户端
 * @param params - 模拟参数
 * @param params.address - 目标合约地址
 * @param params.abi - 合约 ABI
 * @param params.functionName - 要调用的函数名
 * @param params.args - 函数参数
 * @param params.account - 可选的账户地址（用于模拟调用者）
 * @returns SimulationResult 包含模拟是否成功以及错误信息
 */
export async function simulateTransaction<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    account?: Address;
  },
): Promise<SimulationResult> {
  try {
    // 使用 viem 的 simulateContract 来模拟交易
    await client.simulateContract({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      ...(params.account && { account: params.account }),
    });

    return {
      success: true,
    };
  } catch (error) {
    // 提取错误信息
    let errorMessage = "Unknown simulation error";
    const logs: string[] = [];

    if (error instanceof Error) {
      errorMessage = error.message;

      // 尝试从错误中提取更多信息
      // viem 的错误可能包含 revert 原因、gas 估算失败等信息
      if ("cause" in error && error.cause) {
        const cause = error.cause as Record<string, unknown>;
        if (cause.reason && typeof cause.reason === "string") {
          logs.push(`Revert reason: ${cause.reason}`);
        }
        if (cause.data && typeof cause.data === "string") {
          logs.push(`Revert data: ${cause.data}`);
        }
      }

      // 将完整错误信息添加到日志
      logs.push(`Full error: ${errorMessage}`);
    }

    return {
      success: false,
      error: errorMessage,
      logs,
    };
  }
}

/**
 * 计算 x402 请求的盈利能力
 * 估算 gas 消耗并计算手续费收益
 *
 * @param client - 用于区块链交互的客户端（可以是 ConnectedClient 或 SignerWallet）
 * @param payload - x402 支付 payload
 * @param paymentRequirements - 支付要求
 * @param feeRecipient - 手续费接收地址
 * @returns ProfitabilityResult 包含 gas 估算和手续费收益
 */
export async function calculateProfitability<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account> | SignerWallet<chain, transport>,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  feeRecipient: Address,
): Promise<ProfitabilityResult> {
  try {
    const evmPayload = payload.payload as ExactEvmPayload;
    const authType = evmPayload.authorizationType;

    let feeProfit: bigint;
    let gasEstimate: bigint;

    // 根据授权类型调用相应的合约函数
    if (authType === "eip3009") {
      const eip3009Payload = payload as Eip3009PaymentPayload;
      const auth = eip3009Payload.payload.authorization;
      const sig = hexToSignature(eip3009Payload.payload.signature as Hex);

      // 调用 getFeeRecipientChangeForERC3009
      feeProfit = (await client.readContract({
        address: TOKEN_BALANCE_DIFF_ADDRESS,
        abi: TOKEN_BALANCE_DIFF_ABI,
        functionName: "getFeeRecipientChangeForERC3009",
        args: [
          paymentRequirements.payTo as Address,
          feeRecipient,
          paymentRequirements.asset as Address,
          auth.from as Address,
          BigInt(auth.value),
          BigInt(auth.validAfter),
          BigInt(auth.validBefore),
          auth.nonce as Hex,
          Number(sig.v),
          sig.r,
          sig.s,
        ],
      })) as bigint;

      // 估算 gas - 使用实际的 settle 函数
      gasEstimate = await client.estimateContractGas({
        address: paymentRequirements.payTo as Address,
        abi: EIP7702SellerWalletMinimalAbi,
        functionName: "settleWithERC3009",
        args: [
          paymentRequirements.asset as Address,
          auth.from as Address,
          BigInt(auth.value),
          BigInt(auth.validAfter),
          BigInt(auth.validBefore),
          auth.nonce as Hex,
          Number(sig.v),
          sig.r,
          sig.s,
        ],
      });
    } else if (authType === "permit") {
      const permitPayload = payload as PermitPaymentPayload;
      const auth = permitPayload.payload.authorization;
      const sig = hexToSignature(permitPayload.payload.signature as Hex);

      // 调用 getFeeRecipientChangeForPermit
      feeProfit = (await client.readContract({
        address: TOKEN_BALANCE_DIFF_ADDRESS,
        abi: TOKEN_BALANCE_DIFF_ABI,
        functionName: "getFeeRecipientChangeForPermit",
        args: [
          paymentRequirements.payTo as Address,
          feeRecipient,
          paymentRequirements.asset as Address,
          auth.owner as Address,
          BigInt(auth.value),
          BigInt(auth.deadline),
          Number(sig.v),
          sig.r,
          sig.s,
        ],
      })) as bigint;

      // 估算 gas - 使用实际的 settle 函数
      gasEstimate = await client.estimateContractGas({
        address: paymentRequirements.payTo as Address,
        abi: EIP7702SellerWalletMinimalAbi,
        functionName: "settleWithPermit",
        args: [
          paymentRequirements.asset as Address,
          auth.owner as Address,
          BigInt(auth.value),
          BigInt(auth.deadline),
          Number(sig.v),
          sig.r,
          sig.s,
        ],
      });
    } else if (authType === "permit2") {
      const permit2Payload = payload as Permit2PaymentPayload;
      const auth = permit2Payload.payload.authorization;

      // 调用 getFeeRecipientChangeForPermit2
      feeProfit = (await client.readContract({
        address: TOKEN_BALANCE_DIFF_ADDRESS,
        abi: TOKEN_BALANCE_DIFF_ABI,
        functionName: "getFeeRecipientChangeForPermit2",
        args: [
          paymentRequirements.payTo as Address,
          feeRecipient,
          {
            permitted: {
              token: auth.token as Address,
              amount: BigInt(auth.amount),
            },
            nonce: BigInt(auth.nonce),
            deadline: BigInt(auth.deadline),
          },
          auth.owner as Address,
          permit2Payload.payload.signature as Hex,
        ],
      })) as bigint;

      // 估算 gas - 使用实际的 settle 函数
      gasEstimate = await client.estimateContractGas({
        address: paymentRequirements.payTo as Address,
        abi: EIP7702SellerWalletMinimalAbi,
        functionName: "settleWithPermit2",
        args: [
          {
            permitted: {
              token: auth.token as Address,
              amount: BigInt(auth.amount),
            },
            nonce: BigInt(auth.nonce),
            deadline: BigInt(auth.deadline),
          },
          auth.owner as Address,
          permit2Payload.payload.signature as Hex,
        ],
      });
    } else {
      throw new Error(`Unsupported authorization type: ${authType}`);
    }

    return {
      gasEstimate,
      feeProfit,
      feeToken: paymentRequirements.asset as Address,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to calculate profitability:", errorMessage);

    return {
      gasEstimate: 0n,
      feeProfit: 0n,
      feeToken: paymentRequirements.asset as Address,
      error: errorMessage,
    };
  }
}
