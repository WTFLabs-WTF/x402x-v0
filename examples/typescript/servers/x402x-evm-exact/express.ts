import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactX402xEvmServer } from "x402x-evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const PORT = parseInt(process.env.PORT || "4021", 10);
const FACILITATOR_URL = process.env.FACILITATOR_URL;
const EVM_NETWORK = process.env.EVM_NETWORK || "eip155:56";
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
  EVM_NETWORK as `${string}:${string}`,
  "TOKEN",
  {
    address: ASSET_ADDRESS,
    decimals: ASSET_DECIMALS,
    name: ASSET_NAME || undefined,
    version: ASSET_VERSION || undefined,
    permitType: "permit",
  },
);


const app = express();
app.use(
  paymentMiddleware(
    {
      "GET /paid": {
        accepts: {
            scheme: "exact:eip7702",
            network: EVM_NETWORK as `${string}:${string}`,
            payTo: PAY_TO,
            price: "$0.001",
        },
        description: "Paid endpoint (x402x-evm exact:eip7702)",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register(
      EVM_NETWORK as `${string}:${string}`,
      evmScheme,
    ),
  ),
);

app.get("/paid", (req, res) => {
  res.send({
    paid: true,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
