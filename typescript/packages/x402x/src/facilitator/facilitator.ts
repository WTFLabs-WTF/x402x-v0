import {
  verify as verifyExactEvm,
  settle as settleExactEvm,
  prepareSettleCall as prepareSettleCallExactEvm,
} from "../schemes/exact/evm";
import { verify as verifyExactSvm, settle as settleExactSvm } from "../schemes/exact/svm";
import { SupportedEVMNetworks, SupportedSVMNetworks } from "../types/shared";
import { X402Config } from "../types/config";
import {
  ConnectedClient as EvmConnectedClient,
  SignerWallet as EvmSignerWallet,
} from "../types/shared/evm";
import { ConnectedClient, Signer } from "../types/shared/wallet";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  ExactEvmPayload,
} from "../types/verify";
import { Address, Chain, decodeEventLog, Hex, keccak256, Transport, Account } from "viem";
import { KeyPairSigner } from "@solana/kit";
import { EIP7702SellerWalletMinimalAbi } from "../types/shared/evm";

/**
 * Verifies a payment payload against the required payment details regardless of the scheme
 * this function wraps all verify functions for each specific scheme
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient | Signer,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<VerifyResponse> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return verifyExactEvm(
        client as EvmConnectedClient<transport, chain, account>,
        payload,
        paymentRequirements,
      );
    }

    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return await verifyExactSvm(client as KeyPairSigner, payload, paymentRequirements, config);
    }
  }

  // unsupported scheme
  let payer = "";
  if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
    const evmPayload = payload.payload as ExactEvmPayload;
    if (evmPayload.authorizationType === "eip3009") {
      payer = evmPayload.authorization.from;
    } else if (
      evmPayload.authorizationType === "permit" ||
      evmPayload.authorizationType === "permit2"
    ) {
      payer = evmPayload.authorization.owner;
    }
  }

  return {
    isValid: false,
    invalidReason: "invalid_scheme",
    payer,
  };
}

/**
 * Settles a payment payload against the required payment details regardless of the scheme
 * this function wraps all settle functions for each specific scheme
 *
 * @param client - The signer wallet used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @param gasPrice - Optional gas price in wei (defaults to 0.05 gwei)
 * @returns A SettleResponse indicating if the payment is settled and any settlement reason
 */
export async function settle<transport extends Transport, chain extends Chain>(
  client: Signer,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
  gasPrice: bigint = 50000000n, // 0.05 gwei
): Promise<SettleResponse> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return await settleExactEvm(
        client as EvmSignerWallet<chain, transport>,
        payload,
        paymentRequirements,
        gasPrice,
      );
    }

    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      return await settleExactSvm(client as KeyPairSigner, payload, paymentRequirements, config);
    }
  }

  let payer = "";
  if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
    const evmPayload = payload.payload as ExactEvmPayload;
    if (evmPayload.authorizationType === "eip3009") {
      payer = evmPayload.authorization.from;
    } else if (
      evmPayload.authorizationType === "permit" ||
      evmPayload.authorizationType === "permit2"
    ) {
      payer = evmPayload.authorization.owner;
    }
  }

  return {
    success: false,
    errorReason: "invalid_scheme",
    transaction: "",
    network: paymentRequirements.network,
    payer,
  };
}

/**
 * Batch settle multiple EVM payments using Multicall3
 * 使用 Multicall3 批量 settle 多个 EVM 支付
 *
 * 参考 viem 文档: https://viem.sh/docs/contract/multicall
 *
 * @param wallet - The signer wallet used for blockchain interactions
 * @param payments - Array of payment payloads and requirements to settle
 * @param options - Optional settings
 * @param options.gasPrice - Gas price in wei (defaults to 0.05 gwei)
 * @param options.allowFailure - Whether to allow individual payment failures (defaults to true)
 * @param options.multicallAddress - Custom Multicall3 contract address
 * @param options.gasBuffer - Gas buffer percentage (defaults to 20)
 * @returns A batch settle response containing transaction status and individual results
 */
export async function evmBatchSettle<transport extends Transport, chain extends Chain>(
  wallet: EvmSignerWallet<chain, transport>,
  payments: Array<{
    payload: PaymentPayload;
    requirements: PaymentRequirements;
  }>,
  options?: {
    gasPrice?: bigint;
    allowFailure?: boolean;
    multicallAddress?: Address;
    gasBuffer?: number; // Gas buffer 百分比，默认 50
  },
): Promise<{
  success: boolean;
  transaction?: Hex;
  network: string;
  errorReason?: string;
  gasUsed?: bigint;
  gasEstimated?: bigint;
  results?: Array<{
    success: boolean;
    payer: string;
    error?: string;
    settlementDetails?: {
      amount: string;
      beneficiaryAmount: string;
      feeAmount: string;
      method: string;
    };
  }>;
}> {
  const gasPrice = options?.gasPrice ?? 50000000n; // 0.05 gwei
  const allowFailure = options?.allowFailure ?? true;
  const multicallAddress =
    options?.multicallAddress ?? ("0xcA11bde05977b3631167028862bE2a173976CA11" as Address);
  const gasBuffer = options?.gasBuffer ?? 50; // 默认 50% buffer

  if (payments.length === 0) {
    return {
      success: false,
      network: "",
      errorReason: "no_payments_provided",
    };
  }

  // 验证所有支付都是 EVM 网络
  const firstNetwork = payments[0].payload.network;
  for (const payment of payments) {
    if (payment.payload.network !== firstNetwork) {
      return {
        success: false,
        network: firstNetwork,
        errorReason: "mixed_networks_not_supported",
      };
    }

    if (!SupportedEVMNetworks.includes(payment.payload.network)) {
      return {
        success: false,
        network: payment.payload.network,
        errorReason: "unsupported_network",
      };
    }

    if (payment.requirements.scheme !== "exact") {
      return {
        success: false,
        network: payment.payload.network,
        errorReason: "unsupported_scheme",
      };
    }
  }

  // 为每个支付生成 multicall 参数
  // Multicall3.aggregate3 的参数格式: Call3[] = { target, allowFailure, callData }
  const calls: Array<{
    target: Address;
    allowFailure: boolean;
    callData: Hex;
  }> = [];
  const payers: string[] = [];

  try {
    for (const payment of payments) {
      const { target, callData } = prepareSettleCallExactEvm(payment.payload, payment.requirements);

      calls.push({
        target,
        allowFailure, // 使用用户配置的 allowFailure 参数
        callData,
      });

      // 提取 payer 信息
      const evmPayload = payment.payload.payload as ExactEvmPayload;
      if (evmPayload.authorizationType === "eip3009") {
        payers.push(evmPayload.authorization.from);
      } else if (
        evmPayload.authorizationType === "permit" ||
        evmPayload.authorizationType === "permit2"
      ) {
        payers.push(evmPayload.authorization.owner);
      }
    }
  } catch (error) {
    return {
      success: false,
      network: firstNetwork,
      errorReason: error instanceof Error ? error.message : "failed_to_prepare_calls",
    };
  }

  // 使用 viem 的 writeContract 调用 Multicall3.aggregate3
  // Multicall3 ABI - aggregate3 函数
  const multicall3Abi = [
    {
      inputs: [
        {
          components: [
            { name: "target", type: "address" },
            { name: "allowFailure", type: "bool" },
            { name: "callData", type: "bytes" },
          ],
          name: "calls",
          type: "tuple[]",
        },
      ],
      name: "aggregate3",
      outputs: [
        {
          components: [
            { name: "success", type: "bool" },
            { name: "returnData", type: "bytes" },
          ],
          name: "returnData",
          type: "tuple[]",
        },
      ],
      stateMutability: "payable",
      type: "function",
    },
  ] as const;

  // 预估算 gas 以避免 out of gas
  let estimatedGas: bigint;

  try {
    const baseGasEstimate = await wallet.estimateContractGas({
      address: multicallAddress,
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [calls],
      account: wallet.account,
    });

    // 添加用户指定的 buffer 百分比以确保成功
    const bufferAmount = (baseGasEstimate * BigInt(gasBuffer)) / 100n;
    estimatedGas = baseGasEstimate + bufferAmount;

    console.log("✅ Gas 估算成功:");
    console.log(`   基础估算: ${baseGasEstimate.toString()}`);
    console.log(`   Buffer (${gasBuffer}%): ${bufferAmount.toString()}`);
    console.log(`   最终 gas limit: ${estimatedGas.toString()}`);
    console.log(`   支付数量: ${calls.length}`);
    console.log(`   平均每笔: ${(estimatedGas / BigInt(calls.length)).toString()}`);
  } catch {
    console.warn("⚠️  无法估算 gas，将使用默认值");

    // 如果估算失败，使用保守的默认值
    // 每个调用大约需要 150k-300k gas，这里按 300k 计算并添加额外的安全余量
    estimatedGas = BigInt(calls.length) * 300000n;
    const safetyBuffer = (estimatedGas * 30n) / 100n; // 额外 30% 安全余量
    estimatedGas = estimatedGas + safetyBuffer;

    console.warn(
      `   使用默认值: ${estimatedGas.toString()} (${calls.length} calls × 300k + 30% buffer)`,
    );
  }

  // 执行实际交易
  let tx: Hex;
  try {
    tx = await wallet.writeContract({
      address: multicallAddress,
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [calls],
      chain: wallet.chain as Chain,
      gas: estimatedGas, // 使用估算的 gas
      gasPrice,
    });
  } catch (error) {
    return {
      success: false,
      network: firstNetwork,
      errorReason: error instanceof Error ? error.message : "transaction_failed",
    };
  }

  // 等待交易确认
  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      transaction: tx,
      network: firstNetwork,
      errorReason: "transaction_reverted",
    };
  }

  // 解析交易日志以确定每个调用的结果
  let overallSuccess = true;
  const results = await parseSettleResults(receipt, payments, payers, allowFailure);

  // 检查是否有失败的调用
  if (allowFailure) {
    overallSuccess = results.every(r => r.success);
  }

  return {
    success: overallSuccess,
    transaction: tx,
    network: firstNetwork,
    gasUsed: receipt.gasUsed,
    gasEstimated: estimatedGas,
    results,
  };
}

/**
 * 计算签名哈希 (sigHash)
 * sigHash = keccak256(abi.encodePacked(r, s, v))
 *
 * 签名格式: 0x + r(64 hex chars) + s(64 hex chars) + v(2 hex chars)
 * abi.encodePacked 会将 bytes32 r, bytes32 s, uint8 v 直接拼接
 *
 * @param signature - The signature hex string
 * @returns The calculated sigHash
 */
function calculateSigHash(signature: Hex): Hex {
  // 去除 0x 前缀
  const sig = signature.slice(2);

  // 签名应该是 130 个字符 (r: 64, s: 64, v: 2)
  if (sig.length !== 130) {
    throw new Error(`Invalid signature length: ${sig.length}, expected 130`);
  }

  // 提取 r, s, v
  const r = sig.slice(0, 64); // 64 字符 (32 bytes)
  const s = sig.slice(64, 128); // 64 字符 (32 bytes)
  const v = sig.slice(128, 130); // 2 字符 (1 byte)

  // abi.encodePacked(r, s, v) 就是直接拼接这些 bytes
  const packed = ("0x" + r + s + v) as Hex;

  // 计算 keccak256 哈希
  return keccak256(packed);
}

/**
 * 解析交易回执中的日志，确定每个 settle 调用是否成功
 * 通过检查 SettlementExecuted 事件来判断支付是否完成
 *
 * @param receipt - The transaction receipt containing logs
 * @param receipt.logs - Array of log entries from the transaction
 * @param payments - Array of payment payloads and requirements
 * @param payers - Array of payer addresses
 * @param allowFailure - Whether individual failures are allowed
 * @returns Array of results for each payment
 */
async function parseSettleResults(
  receipt: { logs: Array<{ data: Hex; topics: readonly Hex[] | Hex[] }> },
  payments: Array<{
    payload: PaymentPayload;
    requirements: PaymentRequirements;
  }>,
  payers: string[],
  allowFailure: boolean,
): Promise<Array<{ success: boolean; payer: string; error?: string }>> {
  // 如果 allowFailure 为 false，交易成功意味着所有调用都成功
  if (!allowFailure) {
    return payers.map(payer => ({
      success: true,
      payer,
    }));
  }

  // 解析所有 SettlementExecuted 事件
  const settlementEvents: Array<{
    token: Address;
    payer: Address;
    facilitator: Address;
    sigHash: Hex;
    amount: bigint;
    beneficiaryAmount: bigint;
    feeAmount: bigint;
    method: string;
  }> = [];

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: EIP7702SellerWalletMinimalAbi,
        data: log.data,
        topics: [...log.topics] as [Hex, ...Hex[]],
      });

      if (decoded.eventName === "SettlementExecuted") {
        settlementEvents.push({
          token: decoded.args.token as Address,
          payer: decoded.args.payer as Address,
          facilitator: decoded.args.facilitator as Address,
          sigHash: decoded.args.sigHash as Hex,
          amount: decoded.args.amount as bigint,
          beneficiaryAmount: decoded.args.beneficiaryAmount as bigint,
          feeAmount: decoded.args.feeAmount as bigint,
          method: decoded.args.method as string,
        });
      }
    } catch {
      // 忽略无法解析的日志（可能是其他事件）
      continue;
    }
  }

  // 为每个支付计算 sigHash 并检查是否有对应的 SettlementExecuted 事件
  const results = payers.map((payer, index) => {
    const payment = payments[index];
    const evmPayload = payment.payload.payload as ExactEvmPayload;

    // 计算该支付的 sigHash
    let expectedSigHash: Hex;
    try {
      expectedSigHash = calculateSigHash(evmPayload.signature as Hex);
    } catch {
      return {
        success: false,
        payer,
        error: "无法计算签名哈希",
      };
    }

    // 查找匹配的 SettlementExecuted 事件
    const matchingSettlement = settlementEvents.find(event => {
      const payerMatches = event.payer.toLowerCase() === payer.toLowerCase();
      const sigHashMatches = event.sigHash.toLowerCase() === expectedSigHash.toLowerCase();

      return payerMatches && sigHashMatches;
    });

    if (matchingSettlement) {
      return {
        success: true,
        payer,
        // 可以添加额外信息
        settlementDetails: {
          amount: matchingSettlement.amount.toString(),
          beneficiaryAmount: matchingSettlement.beneficiaryAmount.toString(),
          feeAmount: matchingSettlement.feeAmount.toString(),
          method: matchingSettlement.method,
        },
      };
    } else {
      return {
        success: false,
        payer,
        error: "未找到对应的 SettlementExecuted 事件",
      };
    }
  });

  return results;
}

export type Supported = {
  x402Version: number;
  kind: {
    scheme: string;
    networkId: string;
    extra: object;
  }[];
};
