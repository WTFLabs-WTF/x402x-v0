# x402x-evm (v2) Facilitator 示例

这个示例启动一个 **Facilitator**（`/supported`、`/verify`、`/settle`），用于给 `x402x-evm`（基于 `@x402/core`）的资源服务做验签与链上结算。

## 运行

```bash
cd b402/examples/typescript

# 首次：安装依赖 + 构建 workspace（按你的环境执行）
pnpm install
pnpm build

cd facilitator
cp .env-local .env
pnpm dev
```

## 环境变量

- `EVM_PRIVATE_KEY`：facilitator 用来结算的 EVM 私钥
- `EVM_RPC_URL`：链 RPC
- `EVM_NETWORK`：CAIP-2 网络标识（比如 `eip155:84532`）
- `PORT`：默认 `4022`


