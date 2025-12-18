import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactX402xEvmServer } from "x402x-evm/exact/server";

config();

const PORT = parseInt(process.env.PORT || "4021", 10);
const FACILITATOR_URL = process.env.FACILITATOR_URL;
const EVM_NETWORK = (process.env.EVM_NETWORK || "eip155:56") as `${string}:${string}`;
const PAY_TO = process.env.PAY_TO as `0x${string}` | undefined;
const ASSET_ADDRESS = process.env.ASSET_ADDRESS as `0x${string}` | undefined;
const ASSET_DECIMALS = process.env.ASSET_DECIMALS
  ? parseInt(process.env.ASSET_DECIMALS, 10)
  : 18;
const ASSET_NAME = process.env.ASSET_NAME || undefined;
const ASSET_VERSION = process.env.ASSET_VERSION || undefined;

if (!FACILITATOR_URL) {
  // eslint-disable-next-line no-console
  console.error("❌ FACILITATOR_URL is required");
  process.exit(1);
}
if (!PAY_TO || !ASSET_ADDRESS) {
  // eslint-disable-next-line no-console
  console.error("❌ PAY_TO and ASSET_ADDRESS are required");
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

// Configure x402x-evm scheme server (asset registry + optional requirements.extra hints)
const evmScheme = new ExactX402xEvmServer().registerAsset(
  EVM_NETWORK,
  "TOKEN",
  {
    address: ASSET_ADDRESS,
    decimals: ASSET_DECIMALS,
    name: ASSET_NAME || undefined,
    version: ASSET_VERSION || undefined,
    permitType: "permit",
  },
);

const app = new Hono();

// Create x402 resource server and register schemes
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  EVM_NETWORK,
  evmScheme,
);

// Apply payment middleware
app.use(
  "*",
  paymentMiddleware(
    {
      "GET /paid": {
        accepts: {
          scheme: "exact:eip7702",
          network: EVM_NETWORK,
          payTo: PAY_TO,
          price: "$0.001",
        },
        description: "Paid endpoint (x402x-evm exact:eip7702)",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/paid", (c) => {
  return c.json({
    paid: true,
  });
});

console.log(`Server listening at http://localhost:${PORT}`);
serve({
  fetch: app.fetch,
  port: PORT,
});
