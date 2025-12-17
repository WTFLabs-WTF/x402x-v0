/**
 * X402 Payment Hook - using @x402-fetch
 */
import { useMutation } from '@tanstack/react-query';
import { wrapFetchWithPayment, type Signer } from 'x402x-fetch';
import { publicActions } from 'viem';
import type { WalletClient } from 'viem';
import createFetchWithProxyHeader from './lib/x402-helpers';
import type { UseMutationOptions } from '@tanstack/react-query';

export interface UseX402PaymentOptions<TData = unknown> {
  targetUrl: string;         // Payment resource URL
  value?: bigint;             // Payment amount (wei)
  paymentType?: string;      // Payment type (default 'permit')
  walletClient?: WalletClient; // Wallet client from wagmi
  init?: RequestInit;        // Fetch options
  // Allow user to process the response
  onSuccess?: (response: Response) => Promise<TData>;
  mutationOptions?: Omit<UseMutationOptions<TData, Error>, 'mutationFn'>;
}

/**
 * X402 Payment Hook
 * 
 * Handles x402x-fetch payment flow:
 * - Fetch 402 response and requirements
 * - Generate Permit/EIP3009 signature
 * - Submit payment data
 */
export function useX402Payment<TData = unknown>(options: UseX402PaymentOptions<TData>) {
  const {
    targetUrl,
    value,
    paymentType = 'permit',
    walletClient,
    init,
    onSuccess,
    mutationOptions,
  } = options;

  return useMutation<TData, Error>({
    mutationFn: async () => {
      // 1. Check walletClient
      if (!walletClient) {
        console.error('[useX402Payment] Wallet client not ready');
        throw new Error('Wallet client not ready. Please connect wallet first.');
      }

      // 2. Validate parameters
      if (!targetUrl || targetUrl === '') {
        console.error('[useX402Payment] Invalid payment resource URL.');
        throw new Error('Invalid payment resource URL.');
      }

      // 3. Use x402-fetch package to handle payment
      const fetchWithProxyHeader = createFetchWithProxyHeader();
      const signer = walletClient.extend(publicActions) as unknown as Signer;
      const fetchWithPayment = wrapFetchWithPayment(fetchWithProxyHeader, signer, value);

      // 4. Call payment API
      let requestInit = init;

      if (paymentType) {
        const mergedHeaders = new Headers(init?.headers ?? {});
        mergedHeaders.set('x-payment-type', paymentType);
        requestInit = {
          ...init,
          headers: mergedHeaders,
        };
      }

      const response = await fetchWithPayment(targetUrl, requestInit);

      // 5. Parse response
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Payment request failed: ${response.status} ${errorText}`);
      }

      // 6. Hand over response processing to the user if provided
      if (onSuccess) {
        return await onSuccess(response);
      }

      // Default JSON parsing if no custom handler
      return await response.json();
    },
    ...mutationOptions,
  });
}
