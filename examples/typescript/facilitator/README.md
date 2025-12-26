# X402x Facilitator Examples

这个目录包含两个 facilitator 服务实现，用于测试不同的结算方式。

## 文件说明

### `index.ts` - 标准 Facilitator
使用标准的 `facilitator.settle()` 方法处理单个支付。

**运行方式:**
```bash
npm run dev
```

**端口:** 4022

**接口:**
- `GET /supported` - 获取支持的网络和方案
- `POST /verify` - 验证单个支付
- `POST /settle` - 结算单个支付 (使用 `facilitator.settle`)

---

### `batch.ts` - 批量结算 Facilitator
使用 `evmBatchSettle()` 处理支付，即使是单个支付也通过批量结算接口处理。

**运行方式:**
```bash
npm run batch
```

**端口:** 4023

**接口:**
- `GET /supported` - 获取支持的网络和方案
- `POST /verify` - 验证单个支付
- `POST /settle` - 结算单个支付 (使用 `evmBatchSettle`)

## 主要区别

### `index.ts` 的 settle 实现
```typescript
const response = await facilitator.settle(
  paymentPayload,
  paymentRequirements,
);
```

### `batch.ts` 的 settle 实现
```typescript
const batchResponse = await evmBatchSettle(
  signer,
  [{ payload: paymentPayload, requirements: paymentRequirements }],
  {
    allowFailure: false,
    gasBuffer: 50,
    chain,
  },
);
```

## 测试目的

通过对比两种实现方式，可以验证：
1. `evmBatchSettle` 是否能正确处理单个支付
2. 批量结算与标准结算的性能差异
3. 批量结算的 Gas 优化效果

## 环境变量

两个服务都需要相同的环境变量（`.env` 文件）：

```env
EVM_PRIVATE_KEY=0x...
EVM_RPC_URL=https://...
EVM_NETWORK=eip155:56
PORT=4022  # index.ts 使用，batch.ts 默认使用 4023
```

## 测试示例

### 测试标准结算
```bash
curl -X POST http://localhost:4022/settle \
  -H "Content-Type: application/json" \
  -d '{
    "paymentPayload": {...},
    "paymentRequirements": {...}
  }'
```

### 测试批量结算
```bash
curl -X POST http://localhost:4023/settle \
  -H "Content-Type: application/json" \
  -d '{
    "paymentPayload": {...},
    "paymentRequirements": {...}
  }'
```

两个请求应该返回相同的结果格式，但内部处理方式不同。
