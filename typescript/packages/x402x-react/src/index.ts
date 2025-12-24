import { useState, useEffect } from 'react';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { publicActions, type WalletClient } from 'viem';
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from '@x402/fetch';
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types';
import { wagmiToClientSigner } from './lib/browser-adapter';
import { registerExactX402xEvmScheme } from 'x402x-evm';

export interface UseX402PaymentOptions<TData = unknown> {
  url: string;               // Target resource URL
  walletClient?: WalletClient; // Wallet client from wagmi/viem
  init?: RequestInit;        // Initial probe and subsequent fetch options
  onSuccess?: (response: any) => Promise<TData> | TData | void;  // 支持同步和异步
  mutationOptions?: Omit<UseMutationOptions<TData, Error, { action: 'load' | 'pay'; override?: RequestInit }>, 'mutationFn'>;
  enabled?: boolean;         // Whether to automatically probe on mount or URL change (default: true)
  defaultPermitType?: 'eip3009' | 'permit'; // Default permit type for registration
}

/**
 * X402 Payment Hook (Refactored Version)
 * 
 * Provides a unified mutation for handling the X402 payment protocol:
 * - load: Probes the server for payment requirements (402 detection)
 * - pay: Handles the full fetch cycle including signing and settlement
 * 
 * @param options Configuration options for the payment
 * @returns State and actions for the payment flow
 */
export function useX402Payment<TData = unknown>(options: UseX402PaymentOptions<TData>) {
  const { url, walletClient, init: baseInit, onSuccess, mutationOptions, enabled = true, defaultPermitType = 'eip3009' } = options;

  const [paymentRequired, setPaymentRequired] = useState<PaymentRequired | null>(null);
  const [accepted, setAccepted] = useState<PaymentRequirements | null>(null);

  // Unified Mutation for both load and pay
  const mutation = useMutation<TData, Error, { action: 'load' | 'pay'; override?: RequestInit }>({
    mutationFn: async ({ action, override }) => {
      const mergedInit = { ...baseInit, ...override };

      if (action === 'load') {
        console.log('📥 加载支付要求:', { url, init: mergedInit });

        const response = await fetch(url, mergedInit);

        if (response.status === 402) {
          // 调试：打印所有可访问的响应头
          console.log('🔍 调试 - 响应状态:', response.status);
          console.log('🔍 调试 - 所有可访问的响应头:');
          response.headers.forEach((value, name) => {
            console.log(`  ${name}: ${value}`);
          });

          const httpClient = new x402HTTPClient(new x402Client());
          const required = httpClient.getPaymentRequiredResponse((name) => {
            const value = response.headers.get(name);
            console.log(`🔍 尝试获取头 "${name}": ${value ? '✅ 成功' : '❌ 失败'}`);
            return value;
          });

          console.log('🔍 解析后的 required:', required);
          console.log('🔍 accepts 数量:', required.accepts?.length);
          console.log('🔍 accepts 详情:', required.accepts);

          // 验证 accepts 中的地址
          if (required.accepts) {
            required.accepts.forEach((accept, idx) => {
              console.log(`🔍 Accept[${idx}]:`, {
                asset: accept.asset,
                amount: accept.amount,
                network: accept.network,
                scheme: accept.scheme,
              });

              if (!accept.asset || accept.asset === 'undefined') {
                console.error(`❌ Accept[${idx}] 的 asset 无效:`, accept);
              }
            });
          }

          setPaymentRequired(required);
          if (required.accepts?.length) {
            // Default to the first accepted option
            setAccepted(required.accepts[0]);
            console.log('✅ 设置默认 accepted:', required.accepts[0]);
          }
          return required as any;
        }

        // If not 402, it might be already paid or direct access
        setPaymentRequired(null);
        return null as any;
      } else {
        // Pay action: Trigger full payment flow using wrapFetchWithPayment
        if (!walletClient) {
          throw new Error("钱包客户端未连接");
        }

        // 检查 walletClient 是否有 account 信息
        if (!walletClient.account) {
          throw new Error("钱包未连接或没有账户信息，请先连接钱包");
        }

        console.log('💰 支付准备:', {
          account: walletClient.account.address,
          chain: walletClient.chain,
          url,
        });

        const client = new x402Client((_x402Version, accepts) => {
          console.log('🔍 X402 Client 选择器被调用');
          console.log('  - accepts 数量:', accepts.length);
          console.log('  - accepts 详情:', accepts);
          console.log('  - 当前 accepted:', accepted);

          // If we have a manually selected option, use it.
          if (accepted) {
            const match = accepts.find((r) => {
              const rExtra = r.extra as Record<string, unknown> | undefined;
              const aExtra = accepted.extra as Record<string, unknown> | undefined;
              return r.asset === accepted.asset && rExtra?.permitType === aExtra?.permitType;
            });
            if (match) {
              console.log('✅ 使用用户选择的支付选项:', {
                asset: match.asset,
                amount: match.amount,
                network: match.network,
                scheme: match.scheme,
                permitType: (match.extra as any)?.permitType,
              });

              // 验证地址格式
              if (!match.asset || match.asset === 'undefined') {
                console.error('❌ 匹配的支付选项中 asset 无效:', match);
              }

              return match;
            }
          }

          const defaultOption = accepts[0];
          console.log('⚠️ 使用默认支付选项:', defaultOption);

          // 验证默认选项的地址
          if (!defaultOption?.asset || defaultOption.asset === 'undefined') {
            console.error('❌ 默认支付选项中 asset 无效:', defaultOption);
          }

          return defaultOption;
        });

        // Register EVM scheme with the client
        const extendedClient = walletClient.extend(publicActions);
        const signer = wagmiToClientSigner(extendedClient);

        registerExactX402xEvmScheme(client, {
          signer,
          publicClient: extendedClient,
          defaultPermitType,
        });

        const fetchWithPayment = wrapFetchWithPayment(fetch, client);

        console.log('📤 发起支付请求...');
        // This will handle 402, sign, and re-fetch automatically
        const response = await fetchWithPayment(url, mergedInit);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Payment failed: ${response.status} ${errorText}`);
        }

        const httpClient = new x402HTTPClient(new x402Client());
        const settleResponse = httpClient.getPaymentSettleResponse((name) => {
          const value = response.headers.get(name);
          console.log(`🔍 尝试获取响应头 "${name}": ${value ? '✅ 成功' : '❌ 失败'}`);
          return value;
        });

        console.log('🎉 结算响应完整数据:', settleResponse);
        console.log('🎉 结算响应 - success:', settleResponse.success);
        console.log('🎉 结算响应 - transaction:', settleResponse.transaction);
        console.log('🎉 结算响应 - network:', settleResponse.network);
        console.log('🎉 结算响应 - payer:', settleResponse.payer);

        // Handle success
        if (onSuccess) {
          console.log('📞 调用 onSuccess 回调...');
          const result = await onSuccess(settleResponse as any);
          console.log('✅ onSuccess 回调返回:', result);
          return result;
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }
        return response as unknown as TData;
      }
    },
    ...mutationOptions
  });

  // Auto-load on mount or URL change
  useEffect(() => {
    if (enabled && url) {
      setPaymentRequired(null);
      setAccepted(null);
      mutation.mutate({ action: 'load' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url]);

  return {
    // Actions
    load: (override?: RequestInit) => mutation.mutate({ action: 'load', override }),
    loadAsync: (override?: RequestInit) => mutation.mutateAsync({ action: 'load', override }),
    pay: (override?: RequestInit) => mutation.mutate({ action: 'pay', override }),
    payAsync: (override?: RequestInit) => mutation.mutateAsync({ action: 'pay', override }),

    // State
    accepts: paymentRequired?.accepts ?? [],
    accepted,
    setAccepted,
    paymentRequired,
    isReady: !!paymentRequired && !!accepted,

    // Status
    isLoading: mutation.isPending,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,

    reset: () => {
      mutation.reset();
      setPaymentRequired(null);
      setAccepted(null);
    }
  };
}
