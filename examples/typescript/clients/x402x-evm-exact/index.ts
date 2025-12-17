import dotenv from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { registerExactX402xEvmScheme } from "x402x-evm/exact/client";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config();

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const EVM_RPC_URL = process.env.EVM_RPC_URL;
const RESOURCE_SERVER_URL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const ENDPOINT_PATH = process.env.ENDPOINT_PATH || "/paid";
const DEFAULT_PERMIT_TYPE = (process.env.DEFAULT_PERMIT_TYPE ||
  "eip3009") as "eip3009" | "permit";

if (!EVM_PRIVATE_KEY) {
  // eslint-disable-next-line no-console
  console.error("❌ EVM_PRIVATE_KEY is required");
  process.exit(1);
}

// publicClient is optional for eip3009, required for permit (nonce+domain reads)
const publicClient =
  EVM_RPC_URL &&
  createPublicClient({
    chain: {
      id: 0,
      name: "custom",
      nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
      rpcUrls: { default: { http: [EVM_RPC_URL] } },
    },
    transport: http(EVM_RPC_URL),
  });

async function main(): Promise<void> {
  const account = privateKeyToAccount(EVM_PRIVATE_KEY as `0x${string}`);
  const url = `${RESOURCE_SERVER_URL}${ENDPOINT_PATH}`;

  // A方案：服务端会返回多个 accepts（eip3009/permit），默认 selector 会选第一个。
  // 这里用自定义 selector 按 DEFAULT_PERMIT_TYPE 优先选择对应的 requirements。
  const client = new x402Client((_x402Version, accepts) => {
    const preferred = accepts.find((r) => {
      const extra = r.extra as Record<string, unknown> | undefined;
      return extra?.permitType === DEFAULT_PERMIT_TYPE;
    });
    return preferred ?? accepts[0];
  });
  registerExactX402xEvmScheme(client, {
    signer: account,
    publicClient: publicClient || undefined,
    defaultPermitType: DEFAULT_PERMIT_TYPE,
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // eslint-disable-next-line no-console
  console.log(`Requesting: ${url}`);
  const response = await fetchWithPayment(url, { method: "GET" });

  const text = await response.text();
  // eslint-disable-next-line no-console
  console.log(`Status: ${response.status}`);
  // eslint-disable-next-line no-console
  console.log(`Body: ${text}`);

  if (response.ok) {
    const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse((name) =>
      response.headers.get(name),
    );
    // eslint-disable-next-line no-console
    console.log("Payment response:", paymentResponse);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


