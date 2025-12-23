import dotenv from "dotenv";
import express from "express";
import {
  HTTPFacilitatorClient,
  x402ResourceServer,
} from "@x402/core/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { ExactX402xEvmServer } from "x402x-evm/exact/server";

dotenv.config();

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

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  EVM_NETWORK as `${string}:${string}`,
  evmScheme,
);

const app = express();

app.get("/paid", (req, res) => {
  (async () => {
    // 说明：asset 在哪里定义？
    // - 本例在文件顶部用 ASSET_ADDRESS/ASSET_DECIMALS/(ASSET_NAME/ASSET_VERSION) 调用 evmScheme.registerAsset() 完成资产注册；
    // - 后面 buildPaymentRequirements() 会通过 scheme.parsePrice() 自动把 "$0.001" 转成 { amount, asset }（asset 即上面注册的地址）。

    const network = EVM_NETWORK as `${string}:${string}`;
    const price = "$0.001";

    // Step 0) 构造 accepts（permitType 已在 scheme.parsePrice() 里根据资产注册信息写入 requirements.extra）
    const built = await resourceServer.buildPaymentRequirements({
      scheme: "exact:eip7702",
      network,
      payTo: PAY_TO,
      price: {amount: "1000000", asset: "0xU"},
    });
    const accepts = Array.isArray(built) ? built : [built];

    const host = req.header("host") || `localhost:${PORT}`;
    const url = `${req.protocol || "http"}://${host}${req.originalUrl || req.url || req.path}`;
    const resourceInfo = {
      url,
      description: "Paid endpoint (x402x-evm exact:eip7702)",
      mimeType: "application/json",
    };

    // Step 1) 未支付：返回 402 + PAYMENT-REQUIRED（header 中携带 accepts）
    const paymentHeader = req.header("PAYMENT-SIGNATURE");
    if (!paymentHeader) {
      const paymentRequired = resourceServer.createPaymentRequiredResponse(
        accepts as any,
        resourceInfo,
        "payment_required",
      );
      res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
      res.status(402).json({ error: "payment_required" });
      return;
    }

    // Step 2) 解析 payment payload（客户端会把自己选择的 requirements 放在 paymentPayload.accepted）
    const paymentPayload = decodePaymentSignatureHeader(paymentHeader);

    // Step 3) accepted 匹配：找出本次请求对应的 requirements（v2 用 deepEqual）
    const matching = resourceServer.findMatchingRequirements(accepts as any, paymentPayload);
    if (!matching) {
      const paymentRequired = resourceServer.createPaymentRequiredResponse(
        accepts as any,
        resourceInfo,
        "no_matching_requirements",
      );
      res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
      res.status(402).json({ error: "no_matching_requirements" });
      return;
    }

    // Step 4) verify（facilitator 只看 matching.extra.permitType 来决定验签分支）
    const verify = await resourceServer.verifyPayment(paymentPayload, matching);
    if (!verify.isValid) {
      const paymentRequired = resourceServer.createPaymentRequiredResponse(
        accepts as any,
        resourceInfo,
        verify.invalidReason || "invalid_payment",
      );
      res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
      res.status(402).json({ error: verify.invalidReason || "invalid_payment" });
      return;
    }

    // Step 5) settle（成功后附带 PAYMENT-RESPONSE header）
    const settle = await resourceServer.settlePayment(paymentPayload, matching);
    if (!settle.success) {
      res.status(402).json({ error: "settlement_failed", reason: settle.errorReason });
      return;
    }

    res.setHeader("PAYMENT-RESPONSE", encodePaymentResponseHeader({ ...settle, requirements: matching }));
    res.json({ ok: true, message: "You have paid successfully via x402x-evm (v2)." });
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  });
});

async function main(): Promise<void> {
  await resourceServer.initialize();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Resource server listening at http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Try: GET http://localhost:${PORT}/paid`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});


