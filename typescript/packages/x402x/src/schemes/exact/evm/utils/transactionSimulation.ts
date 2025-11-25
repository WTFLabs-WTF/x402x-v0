import { Account, Address, Chain, Hex, Transport } from "viem";
import { ConnectedClient } from "../../../../types/shared/evm";

export type SimulationResult = {
  success: boolean;
  error?: string;
  logs?: string[];
};

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
        const cause = error.cause as any;
        if (cause.reason) {
          logs.push(`Revert reason: ${cause.reason}`);
        }
        if (cause.data) {
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

