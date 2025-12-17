# x402x-evm

基于 **x402** 的 x402x EVM 机制包，用来承载你们从 `x402x`（v1 fork/重写）迁移出来的差异点：

- **Permit (EIP-2612)**：支持以 Permit 作为支付授权（需要链上读取 `nonces(owner)`）
- **EIP-3009**：支持 EIP-3009 的签名与校验
- **7702 合约兼容执行**：settle 时优先调用资源服务器 `payTo` 指向的合约方法（`settleWithPermit` / `settleWithERC3009`），并在不支持时自动 fallback 到 token 的原生方法
- **BSC / USD1**：服务端资产注册能力（CAIP-2 网络：`eip155:56`）

## 说明

在 x402 的架构里，这些属于 **mechanism（链+scheme）实现**，不是 `@x402/extensions` 那类“协议元数据扩展”。

## 使用（快速示例）

### Server：BSC + USD1（Permit）

```ts
import { x402ResourceServer } from "@x402/core/server";
import { ExactX402xEvmServer } from "x402x-evm/exact/server";

const evmServer = new ExactX402xEvmServer()
  .registerAsset("eip155:56", "USD1", {
    address: "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d",
    decimals: 18,
    authorizationType: "permit",
  })
  .setDefaultAsset("eip155:56", "USD1");

const resourceServer = new x402ResourceServer(facilitatorClient).register("eip155:*", evmServer);
```


