import { useState, useEffect } from 'react';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { publicActions, type WalletClient } from 'viem';
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from '@x402/fetch';
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types';
import { toX402xClientEvmSigner } from 'x402x-evm';
import { registerExactX402xEvmScheme } from "x402x-evm/exact/client";

export interface UseX402PaymentOptions<TData = unknown> {
  url: string;               // Target resource URL
  walletClient?: WalletClient; // Wallet client from wagmi/viem
  init?: RequestInit;        // Initial probe and subsequent fetch options
  onSuccess?: (response: Response) => Promise<TData>;
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
          
          setPaymentRequired(required);
          if (required.accepts?.length) {
            // Default to the first accepted option
            setAccepted(required.accepts[0]);
          }
          return required as any;
        }
        
        // If not 402, it might be already paid or direct access
        setPaymentRequired(null);
        return null as any;
      } else {
        // Pay action: Trigger full payment flow using wrapFetchWithPayment
        if (!walletClient) {
          throw new Error("Wallet client is required for payment");
        }

        const client = new x402Client((_x402Version, accepts) => {
          // If we have a manually selected option, use it.
          if (accepted) {
            const match = accepts.find((r) => {
              const rExtra = r.extra as Record<string, unknown> | undefined;
              const aExtra = accepted.extra as Record<string, unknown> | undefined;
              return r.asset === accepted.asset && rExtra?.permitType === aExtra?.permitType;
            });
            if (match) return match;
          }
          return accepts[0];
        });

        // Register EVM scheme with the client
        const signer = toX402xClientEvmSigner(walletClient.extend(publicActions) as any);
        const publicClient = walletClient.extend(publicActions);

        registerExactX402xEvmScheme(client, {
          signer,
          publicClient: publicClient as any,
          defaultPermitType,
        });

        const fetchWithPayment = wrapFetchWithPayment(fetch, client);
        
        // This will handle 402, sign, and re-fetch automatically
        const response = await fetchWithPayment(url, mergedInit);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Payment failed: ${response.status} ${errorText}`);
        }

        // Handle success
        if (onSuccess) {
          return await onSuccess(response);
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
