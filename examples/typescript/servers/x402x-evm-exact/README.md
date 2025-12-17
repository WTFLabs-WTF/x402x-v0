# x402x-evm (v2) Resource Server 示例（Express）

这个示例启动一个被 x402 保护的资源服务端点：`GET /paid`。

## 运行

```bash
cd b402/examples/typescript
pnpm install
pnpm build

# 先启动 facilitator（另一个终端）
cd facilitator
cp .env-local .env
pnpm dev

# 再启动 resource server（另一个终端）
cd ../servers/x402x-evm-exact
pnpm dev -- \
  --facilitator-url http://localhost:4020 \
  --network eip155:56 \
  --pay-to 0x0000000000000000000000000000000000000000 \
  --asset-address 0x0000000000000000000000000000000000000000 \
  --asset-decimals 18

# 查看完整参数说明
pnpm dev -- --help
```

## 注意

- 本示例的 scheme 为 `exact:eip7702`（`x402x-evm` 的实现标识），用于与官方 `exact` EVM mechanism 区分。
- `--permit-type` 可选：`eip3009 | permit | permit2`。不传则服务端会按默认优先级兜底（如果你在代码里注册了 publicClient，也可以在注册阶段异步探测并写回）。
- `--asset-name` / `--asset-version` 可选：会写入 `PaymentRequirements.extra`，用于客户端/促进方签名与校验（缺失时相关组件会尝试链上读取）。


