# @x402x/x402x-utils SDK 深度参考指南

`@x402x/x402x-utils` 提供了 x402 协议在服务端的高级封装，旨在通过最简化的代码实现完整的支付闭环，同时保留对底层逻辑的精细控制。

## 1. 核心组件：X402Server

`X402Server` 是对核心 `x402ResourceServer` 的高度封装。它将“构建要求 -> 解析 Header -> 验证 -> 结算”这四个步骤进行了原子化拆解，并提供了一个一站式的 `process` 方法。

### 初始化

```typescript
import { X402Server } from 'x402x-utils/server';
import { ExactX402xEvmServer } from 'x402x-evm/exact/server';

// 1. 初始化服务器配置
const server = new X402Server({
  facilitatorUrl: 'https://...',
  payTo: '0xDefaultRecipient...', // 全局默认收款地址
});

// 2. 注册 Scheme 实现 (例如 EVM)
const evmScheme = new ExactX402xEvmServer().registerAsset('eip155:56', 'USDC', {
  address: '0x...',
  decimals: 18,
  permitType: 'permit',
});
server.register('eip155:56', evmScheme);

// 3. 必须调用初始化来拉取 Facilitator 信息
await server.initialize();
```

---

## 2. 三种集成方式

根据业务逻辑的复杂程度，您可以选择以下三种方式之一：

### 方式 A：自动化模式 (Automatic Mode)
**最简单的集成方式**。Server 内部自动完成从 Requirements 构建到结算的所有步骤。

```typescript
app.get('/paid', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: 'eip155:56',
    price: '$0.01',
    resourceInfo: { 
      url: 'https://example.com/item-1', 
      description: 'Mode A',
      mimeType: 'application/json'
    },
  });

  // 自动设置必要的响应头
  if (result.paymentRequiredHeader) res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader);
  if (result.paymentResponseHeader) res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader);

  res.status(result.status).json(result.response);
});
```

### 方式 B：预构建要求模式 (Manual Requirements Mode)
**适合需要“锁定价格”或“缓存支付要求”的场景**。

```typescript
// 1. 提前构建要求（例如在生成订单页面时）
// 示例 1: 使用默认资产和美元计价 (自动转换)
const requirements = await server.buildRequirements({
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: '$0.01',
});

// 示例 2: 使用资产过滤 (仅保留指定的已注册 Token 地址)
const filteredRequirements = await server.buildRequirements({
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: 0.01,
  assets: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'], // 仅保留该地址的需求
});

// 2. 处理支付时直接传入 requirements
app.get('/paid', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    requirements, // 👈 传入预构建的要求
    resourceInfo: { 
      url: 'https://example.com/item-1',
      description: 'Mode B',
      mimeType: 'application/json'
    },
  });
  // ... 设置 Header 并返回
});
```

### 方式 C：原子化控制模式 (Atomic Control Mode)
**完全手动控制每一个步骤**。适用于极其复杂的业务逻辑，例如验证通过后不立即结算，而是延迟执行。

```typescript
const signature = req.header('PAYMENT-SIGNATURE');

// 步骤 1：解析与匹配
const parsed = server.parse(signature, requirements);
if (!parsed.success) {
  // 处理 402 逻辑...
  return;
}

const { payload, matching } = parsed.data!;

// 步骤 2：验证签名
const verify = await server.verify(payload, matching);
if (!verify.isValid) return res.status(402).send('Invalid signature');

// 步骤 3：执行结算
const settle = await server.settle(payload, matching);
if (!settle.success) return res.status(500).send('Settlement failed');

res.status(200).json({ ok: true, txHash: settle.transaction });
```

---

## 3. 收款人优先级 (PayTo Priority)

`payTo` 地址遵循“分层覆盖”原则，优先级从高到低：

1.  **方法调用级**：在 `process` 或 `buildRequirements` 的 options 中传入的 `payTo`。
2.  **实例级**：在 `new X402Server` 时传入的 `payTo`。
3.  **Scheme 级**：如果前两者都缺失，则使用注册资产时定义的地址。

---

## 4. API 参考

### `server.process(paymentHeader, options)`
一站式处理方法。
- **`paymentHeader`**: 客户端发来的 `PAYMENT-SIGNATURE` Base64 字符串。
- **`options`**:
    - `scheme`: 协议方案 (如 `exact:eip7702`)。
    - `network`: CAIP-2 网络 ID。
    - `price`: 逻辑价格 (如 `$1.0`) 或数值 (如 `0.1`)。将被视为 `uiAmount` 并根据资产精度自动转换。
    - `assets`: (可选) Token 地址数组。如果提供，将仅保留这些地址对应的支付需求。
    - `payTo`: (可选) 覆盖默认收款人。
    - `requirements`: (可选) 预构建的要求数组。
    - `resourceInfo`: 资源元数据。

### `server.parse(header, requirements)`
解析并寻找匹配的支付策略。
- **返回**: `{ success, data: { payload, matching }, error }`。

### `server.verify(payload, matching)`
验证签名。
- **返回**: `{ isValid, invalidReason, payer }`。

### `server.settle(payload, matching)`
执行结算。
- **返回**: `{ success, transaction, errorReason }`。
