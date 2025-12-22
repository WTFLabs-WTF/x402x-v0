# @x402x/x402x-evm SDK 深度参考指南

`@x402x/x402x-evm` 实现了 X402 协议在 EVM 生态中的核心逻辑。本指南基于 `@x402x/examples/typescript` 中的实际案例编写。

## 1. 客户端集成 (Client)

在客户端，您需要配置 `x402Client` 并注册 EVM 方案。以下示例展示了如何根据首选的授权类型（如 EIP3009）选择支付要求。

### 基础配置与自动支付请求
```typescript
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { registerExactX402xEvmScheme } from "x402x-evm/exact/client";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// 1. 初始化签名器
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ /* RPC 配置 */ });

// 2. 配置客户端选择逻辑（可选：优先选择特定授权类型）
const client = new x402Client((_x402Version, accepts) => {
  const preferred = accepts.find((r) => r.extra?.permitType === "eip3009");
  return preferred ?? accepts[0];
});

// 3. 注册 EVM 方案
registerExactX402xEvmScheme(client, {
  signer: account,
  publicClient,
  defaultPermitType: "eip3009",
});

// 4. 使用包装后的 fetch 发起请求
const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const response = await fetchWithPayment("https://api.example.com/paid", { method: "GET" });

// 5. 获取支付结算详情
if (response.ok) {
  const settleInfo = new x402HTTPClient(client).getPaymentSettleResponse(
    (name) => response.headers.get(name)
  );
  console.log("支付结算成功:", settleInfo);
}
```

---

## 2. 服务端集成 (Server - 原生模式)

如果您不使用中间件，可以手动控制支付流程的每一个阶段。

### 核心步骤详解
```typescript
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactX402xEvmServer } from "x402x-evm/exact/server";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";

const facilitatorClient = new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL });
const evmScheme = new ExactX402xEvmServer().registerAsset('eip155:1', "TOKEN", {
  address: "0xToken...",
  decimals: 18,
  permitType: "permit", // 默认授权类型
});

const resourceServer = new x402ResourceServer(facilitatorClient).register('eip155:1', evmScheme);

// Express 路由逻辑
app.get("/paid", async (req, res) => {
  const network = "eip155:1";
  const price = "$0.001";

  // 1. 构建支付要求
  const accepts = await resourceServer.buildPaymentRequirements({
    scheme: "exact:eip7702",
    network,
    payTo: process.env.PAY_TO,
    price,
  });

  const paymentHeader = req.header("PAYMENT-SIGNATURE");
  
  // 2. 检查支付头，缺失则返回 402
  if (!paymentHeader) {
    const required = resourceServer.createPaymentRequiredResponse(accepts, { url: req.url }, "payment_required");
    res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required));
    return res.status(402).json({ error: "payment_required" });
  }

  // 3. 解析、匹配、验证并结算
  const payload = decodePaymentSignatureHeader(paymentHeader);
  const matching = resourceServer.findMatchingRequirements(accepts, payload);
  
  if (!matching) return res.status(402).json({ error: "no_matching_requirements" });

  const verify = await resourceServer.verifyPayment(payload, matching);
  if (!verify.isValid) return res.status(402).json({ error: verify.invalidReason });

  const settle = await resourceServer.settlePayment(payload, matching);
  if (!settle.success) return res.status(402).json({ error: "settlement_failed" });

  // 4. 成功后设置响应头并返回数据
  res.setHeader("PAYMENT-RESPONSE", encodePaymentResponseHeader({ ...settle, requirements: matching }));
  res.json({ message: "支付成功！" });
});
```

## 3. 核心 API 参考

### `registerExactX402xEvmScheme` (Client)
- **`signer`**: 必须。支持私钥 Account 或 viem WalletClient。
- **`publicClient`**: 强烈建议。用于自动查询链上 Nonce。

### `registerAsset` (Server)
- **`permitType`**: `'permit' | 'eip3009'`。指定资产的默认授权协议。
- **`name` / `version`**: 用于 EIP-712 Domain 校验，建议填写以防签名失败。
