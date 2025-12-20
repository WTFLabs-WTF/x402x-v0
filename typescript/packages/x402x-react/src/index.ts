import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import { publicActions, type WalletClient } from 'viem';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types';
import { registerExactX402xEvmScheme, toX402xClientEvmSigner } from 'x402x-evm';

// Export V1 Hooks
export * from './v1';

// --- V2 Hooks (Latest) ---

export interface UseX402PaymentOptions<TData = unknown> {
  url: string;               // Target resource URL
  walletClient?: WalletClient; // Wallet client from wagmi/viem
  init?: RequestInit;        // Initial probe and subsequent fetch options
  onSuccess?: (response: Response) => Promise<TData>;
  mutationOptions?: Omit<UseMutationOptions<TData, Error, void>, 'mutationFn'>;
  queryOptions?: Omit<UseQueryOptions<PaymentRequired | null, Error>, 'queryKey' | 'queryFn'>;
}

/**
 * X402 Payment Hook (Latest Version)
 * 
 * Provides a comprehensive hook for handling the X402 payment protocol:
 * - Automatically probes the server for payment requirements (accepts) using TanStack Query
 * - Manages selected payment option (accepted)
 * - Handles the mutation for signing and submitting payment
 * 
 * @param options Configuration options for the payment
 * @returns State and actions for the payment flow
 */
export function useX402Payment<TData = unknown>(options: UseX402PaymentOptions<TData>) {
  const { url, walletClient, init, onSuccess, mutationOptions, queryOptions } = options;

  // 1. Local state for the selected payment option
  const [accepted, setAccepted] = useState<PaymentRequirements | null>(null);

  // 2. Fetch requirements using useQuery
  const { 
    data: paymentRequired, 
    isLoading: isLoadingRequirements, 
    error: queryError,
    refetch: refreshRequirements 
  } = useQuery({
    queryKey: ['x402-requirements', url, init],
    queryFn: async () => {
      if (!url) return null;
      
      const response = await fetch(url, init);
      
      if (response.status === 402) {
        const httpClient = new x402HTTPClient(new x402Client());
        return httpClient.getPaymentRequiredResponse((name) => response.headers.get(name));
      } else if (response.ok) {
        // Resource already accessible, no payment required
        return null;
      }
      
      throw new Error(`Failed to probe resource: ${response.status} ${response.statusText}`);
    },
    enabled: !!url,
    ...queryOptions
  });

  // Auto-select first requirement when requirements are first loaded
  useEffect(() => {
    if (paymentRequired?.accepts?.length && !accepted) {
      setAccepted(paymentRequired.accepts[0]);
    }
  }, [paymentRequired, accepted]);

  // Reset selection if URL changes
  useEffect(() => {
    setAccepted(null);
  }, [url]);

  /**
   * Mutation to perform the actual payment
   */
  const paymentMutation = useMutation<TData, Error, void>({
    mutationFn: async () => {
      if (!walletClient) {
        throw new Error("Wallet client not ready. Please connect wallet first.");
      }
      if (!paymentRequired || !accepted) {
        throw new Error("Payment requirements not loaded or no payment option selected.");
      }

      // Initialize X402 client and register EVM scheme
      const coreClient = new x402Client();
      const signer = toX402xClientEvmSigner(walletClient.extend(publicActions) as any);
      registerExactX402xEvmScheme(coreClient, { signer });

      // Create payment payload based on selected requirement
      // We force the core client to use our manually selected requirement
      const paymentPayload = await coreClient.createPaymentPayload({
        ...paymentRequired,
        accepts: [accepted]
      });

      // Encode payload into headers
      const httpClient = new x402HTTPClient(coreClient);
      const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

      // Submit payment request with the signature header
      const response = await fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          ...paymentHeaders,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Payment settlement failed: ${response.status} ${errorText}`);
      }

      // Handle success
      if (onSuccess) {
        return await onSuccess(response);
      }

      // Default behavior: try to parse as JSON, otherwise return response
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return response as unknown as TData;
    },
    ...mutationOptions
  });

  return {
    // Selection state
    accepts: paymentRequired?.accepts ?? [],
    accepted,
    setAccepted,
    paymentRequired,
    
    // Actions
    refreshRequirements,
    mutate: paymentMutation.mutate,
    mutateAsync: paymentMutation.mutateAsync,
    reset: paymentMutation.reset,
    
    // Status
    isLoading: isLoadingRequirements || paymentMutation.isPending,
    isPending: paymentMutation.isPending,
    isSuccess: paymentMutation.isSuccess,
    isError: !!queryError || paymentMutation.isError,
    error: queryError || paymentMutation.error,
    data: paymentMutation.data,
  };
}

// Alias for convenience
export { useX402Payment as useX402 };
