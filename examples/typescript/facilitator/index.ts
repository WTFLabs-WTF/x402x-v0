import dotenv from "dotenv";
import express from "express";
import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  toX402xFacilitatorEvmSigner,
} from "x402x-evm";
import { registerExactX402xEvmScheme } from "x402x-evm/exact/facilitator";

dotenv.config();

const PORT = parseInt(process.env.PORT || "4022", 10);
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const EVM_RPC_URL = process.env.EVM_RPC_URL;
const EVM_NETWORK = process.env.EVM_NETWORK || "eip155:56";

if (!EVM_PRIVATE_KEY) {
  // eslint-disable-next-line no-console
  console.error("❌ EVM_PRIVATE_KEY is required");
  process.exit(1);
}
if (!EVM_RPC_URL) {
  // eslint-disable-next-line no-console
  console.error("❌ EVM_RPC_URL is required");
  process.exit(1);
}

const account = privateKeyToAccount(EVM_PRIVATE_KEY);
// eslint-disable-next-line no-console
console.log(`EVM Facilitator account: ${account.address}`);

// viem requires a chain object. We keep it minimal and rely on RPC_URL.
const chainId = Number(EVM_NETWORK.split(":")[1]);
const chain = {
  id: chainId,
  name: `eip155:${chainId}`,
  nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC_URL] } },
} as const;

const viemClient = createWalletClient({
  account,
  chain,
  transport: http(EVM_RPC_URL),
}).extend(publicActions);

const signer = toX402xFacilitatorEvmSigner({
  address: account.address,
  getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) =>
    viemClient.readContract({
      ...args,
      args: args.args || [],
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verifyTypedData: (args: any) => viemClient.verifyTypedData(args),
  writeContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) =>
    viemClient.writeContract({
      ...args,
      args: args.args || [],
    }),
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
    viemClient.waitForTransactionReceipt(args),
});

const facilitator = new x402Facilitator();
registerExactX402xEvmScheme(facilitator, {
  signer,
  networks: EVM_NETWORK as `${string}:${string}`,
});

const app = express();
app.use(express.json());

app.get("/supported", (req, res) => {
  void req;
  res.json(facilitator.getSupported());
});

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    const response: VerifyResponse = await facilitator.verify(
      paymentPayload,
      paymentRequirements,
    );
    res.json(response);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Verify error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    const response: SettleResponse = await facilitator.settle(
      paymentPayload,
      paymentRequirements,
    );
    res.json(response);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Settle error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Facilitator listening at http://localhost:${PORT}`);
});


