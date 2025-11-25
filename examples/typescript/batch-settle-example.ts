/**
 * EVM 批量 Settle 示例
 * 
 * 这个示例演示如何使用 evmBatchSettle 函数批量处理多个支付
 */

import { evmBatchSettle, prepareSettleCall } from 'x402x';
import { createWalletClient, http, parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { PaymentPayload, PaymentRequirements } from 'x402x';

// 配置
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';

async function main() {
  console.log('=== EVM 批量 Settle 示例 ===\n');

  // 1. 创建钱包客户端
  const account = privateKeyToAccount(PRIVATE_KEY);
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  console.log('facilitator 地址:', account.address);
  console.log('网络:', baseSepolia.name, '\n');

  // 2. 准备多个支付（这里使用示例数据，实际使用时需要替换为真实的支付数据）
  const payments = [
    {
      payload: {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-sepolia',
        payload: {
          authorizationType: 'eip3009',
          authorization: {
            from: '0x...',
            to: '0x...',
            value: '1000000', // 1 USDC (6 decimals)
            validAfter: '0',
            validBefore: Math.floor(Date.now() / 1000) + 3600, // 1小时后过期
            nonce: '0x...',
          },
          signature: '0x...',
        },
      } as PaymentPayload,
      requirements: {
        scheme: 'exact',
        network: 'base-sepolia',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
        payTo: '0x...',
        maxAmountRequired: '1000000',
      } as PaymentRequirements,
    },
    {
      payload: {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-sepolia',
        payload: {
          authorizationType: 'permit',
          authorization: {
            owner: '0x...',
            spender: '0x...',
            value: '2000000', // 2 USDC
            deadline: Math.floor(Date.now() / 1000) + 3600,
            nonce: '0',
          },
          signature: '0x...',
        },
      } as PaymentPayload,
      requirements: {
        scheme: 'exact',
        network: 'base-sepolia',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        payTo: '0x...',
        maxAmountRequired: '2000000',
      } as PaymentRequirements,
    },
    {
      payload: {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-sepolia',
        payload: {
          authorizationType: 'permit2',
          authorization: {
            owner: '0x...',
            spender: '0x...',
            token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            amount: '3000000', // 3 USDC
            deadline: Math.floor(Date.now() / 1000) + 3600,
            nonce: '1',
            to: '0x...',
          },
          signature: '0x...',
        },
      } as PaymentPayload,
      requirements: {
        scheme: 'exact',
        network: 'base-sepolia',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        payTo: '0x...',
        maxAmountRequired: '3000000',
      } as PaymentRequirements,
    },
  ];

  console.log(`准备批量处理 ${payments.length} 个支付...\n`);

  // 3. 示例：查看单个支付的调用数据（可选）
  console.log('--- 第一个支付的调用数据 ---');
  const firstCallData = prepareSettleCall(payments[0].payload, payments[0].requirements);
  console.log('目标合约:', firstCallData.target);
  console.log('调用数据长度:', firstCallData.callData.length, 'bytes');
  console.log('ETH 数量:', firstCallData.value.toString(), '\n');

  // 4. 执行批量 settle
  console.log('开始批量 settle...');

  try {
    const result = await evmBatchSettle(wallet, payments, {
      gasPrice: 50000000n, // 0.05 gwei
      allowFailure: true,  // 允许单个支付失败
      gasBuffer: 50,       // Gas buffer 50%
    });

    if (result.success) {
      console.log('\n✅ 批量 settle 成功！');
      console.log('交易哈希:', result.transaction);
      console.log('网络:', result.network);
      console.log('处理的支付数量:', result.results?.length);

      // Gas 信息
      if (result.gasEstimated && result.gasUsed) {
        console.log('\nGas 使用情况:');
        console.log('  估算量:', result.gasEstimated.toString());
        console.log('  实际使用:', result.gasUsed.toString());
        const efficiency = (Number(result.gasUsed) / Number(result.gasEstimated)) * 100;
        console.log(`  效率: ${efficiency.toFixed(2)}%`);
        const gasPerPayment = result.gasUsed / BigInt(payments.length);
        console.log('  平均每笔:', gasPerPayment.toString());
      }

      console.log('\n支付详情:');
      result.results?.forEach((res, index) => {
        console.log(`  支付 ${index + 1}:`);
        console.log(`    - 状态: ${res.success ? '✅ 成功' : '❌ 失败'}`);
        console.log(`    - 支付者: ${res.payer}`);

        if (res.success && res.settlementDetails) {
          console.log(`    - 总金额: ${res.settlementDetails.amount}`);
          console.log(`    - 受益金额: ${res.settlementDetails.beneficiaryAmount}`);
          console.log(`    - 手续费: ${res.settlementDetails.feeAmount}`);
          console.log(`    - 方法: ${res.settlementDetails.method}`);
        }

        if (res.error) {
          console.log(`    - 错误: ${res.error}`);
        }
      });

      // 计算总金额
      const totalAmount = payments.reduce((sum, payment) => {
        const payload = payment.payload.payload as any;
        const amount = payload.authorization.value || payload.authorization.amount;
        return sum + BigInt(amount);
      }, 0n);
      console.log(`\n总支付金额: ${totalAmount.toString()} (最小单位)`);
      console.log(`总支付金额: ${(Number(totalAmount) / 1e6).toFixed(2)} USDC`);

    } else {
      console.log('\n❌ 批量 settle 失败');
      console.log('错误原因:', result.errorReason);
      if (result.transaction) {
        console.log('交易哈希:', result.transaction);
      }
    }
  } catch (error) {
    console.error('\n❌ 发生错误:', error);
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

export { main };

