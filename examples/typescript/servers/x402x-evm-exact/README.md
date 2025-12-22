# x402x-evm (v2) Resource Server 示例（Express）

这个示例展示了如何使用 `x402x-utils` 快速构建一个受保护的资源服务端点。

## 使用方式

我们在 `modes.ts` 中展示了三种不同的集成方式：

1.  **方式 A (自动化模式 - `mode-a`)**: 最简单的集成方式，通过 `server.process` 一行代码完成所有逻辑。适合大多数标准场景。
2.  **方式 B (预构建模式 - `mode-b`)**: 适合需要锁定价格或缓存支付要求的场景，允许你手动管理 `Requirements`。
3.  **方式 C (原子化模式 - `mode-c`)**: 提供对解析、验证、结算每个步骤的精细控制，适合高度自定义的业务逻辑。

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


