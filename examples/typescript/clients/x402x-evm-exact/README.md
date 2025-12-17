# x402x-evm (v2) Client 示例（Fetch）

这个示例使用 `@x402/fetch` + `x402x-evm` 去访问资源服务的 `GET /paid`（自动处理 402 challenge，并完成签名/支付）。

## 运行

```bash
cd b402/examples/typescript
pnpm install
pnpm build

# 终端 1：facilitator
cd facilitator
cp .env-local .env
pnpm dev

# 终端 2：resource server
cd ../servers/x402x-evm-exact
cp .env-local .env
pnpm dev

# 终端 3：client
cd ../../clients/x402x-evm-exact
cp .env-local .env
pnpm start
```

## 说明

 - 默认使用 `DEFAULT_PERMIT_TYPE=eip3009`（对应服务端 requirements.extra.permitType），相对更容易跑通（`PAY_TO_EIP3009` 可以是 EOA）。
- 如果使用 `permit`，请确保服务端 `requirements.extra.name/version` 完整，或提供可用的 `EVM_RPC_URL` 以便客户端读取 EIP-712 domain / nonce。


