# @x402x-react

React hooks for X402 Payment Protocol.

## Installation

```bash
pnpm add x402x-react
```

## Usage

### Basic Example

```typescript
import { useX402Payment } from 'x402x-react';
import { useWalletClient } from 'wagmi';

function PaymentComponent() {
  const { data: walletClient } = useWalletClient();
  
  const { mutate, isPending, error, data } = useX402Payment({
    targetUrl: 'https://api.example.com/resource',
    value: 1000000000000000000n, // 1 ETH
    walletClient,
    // Optional: specify payment type (default: 'permit')
    paymentType: 'permit', 
  });

  return (
    <div>
      <button 
        onClick={() => mutate()} 
        disabled={isPending || !walletClient}
      >
        {isPending ? 'Processing...' : 'Pay 1 ETH'}
      </button>
      
      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
      
      {data && (
        <div style={{ color: 'green' }}>
          Payment Successful! Tx: {data.txHash}
        </div>
      )}
    </div>
  );
}
```

## API Reference

### `useX402Payment(options)`

A React hook that wraps `x402x-fetch` to handle the payment flow. It uses `@tanstack/react-query`'s `useMutation` under the hood.

#### Parameters (`UseX402PaymentOptions`)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `targetUrl` | `string` | Yes | The URL of the protected resource that requires payment. |
| `value` | `bigint` | No | The maximum payment amount authorized (in wei). Required for mutation. |
| `walletClient` | `WalletClient` | No | The Viem WalletClient (usually from `wagmi`). Required for mutation. |
| `paymentType` | `string` | No | Payment method to use. Defaults to `'permit'`. |
| `init` | `RequestInit` | No | Standard Fetch options (headers, method, etc.). |
| `mutationOptions` | `UseMutationOptions` | No | Additional options for React Query's `useMutation`. |

#### Returns

Returns a standard React Query mutation object containing:

- `mutate`: Function to trigger the payment flow.
- `mutateAsync`: Async function to trigger payment and await result.
- `data`: The successful payment response (`X402PaymentResponse`).
- `error`: Error object if payment failed.
- `isPending`: Boolean indicating if payment is in progress.
- ...and other `useMutation` return values.

#### Response Type (`X402PaymentResponse`)

On success, `data` will contain:

```typescript
interface X402PaymentResponse {
  success: boolean;
  network: string;
  payer: string;
  txHash: string;
  asset: string;
  amount: string;
  recipient: string;
  description?: string;
}
```

## Error Handling

The hook will throw an error in the following cases:
- Wallet client is not connected.
- Target URL or value is invalid.
- User rejects the signature request.
- Payment API returns a non-success status code.
- Business logic validation fails (e.g., `code !== 0`).

You can capture these errors using the `onError` callback in `mutationOptions` or by checking the `error` property returned by the hook.
