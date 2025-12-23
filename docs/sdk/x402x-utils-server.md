# x402x-utils/server

增强版 x402 服务器端工具库，在官方 `@x402/core` 基础上提供更友好的开发体验。

## 🆚 核心区别

| 特性 | x402ResourceServer<br>（官方核心） | X402Server<br>（增强版） |
|------|--------------------------|-------------------|
| **uiAmount** | ❌ 不支持 | ✅ 自动精度转换 |
| **多币种数组** | ❌ 需手动循环 | ✅ 原生支持 |
| **资产管理** | ❌ 无内置支持 | ✅ AssetRegistry |
| **API 复杂度** | 中等 | 简单 |
| **适用场景** | 底层库开发 | 应用开发 |

### 代码对比

<details>
<summary><b>官方 x402ResourceServer（点击展开）</b></summary>

```typescript
import { x402ResourceServer } from '@x402/core/server'

const server = new x402ResourceServer(facilitatorClient)
  .register('eip155:56', scheme)

// ❌ 必须手动计算 amount
await server.buildPaymentRequirements({
  scheme: 'exact',
  network: 'eip155:56',
  payTo: '0x...',
  price: {
    asset: '0xUSD1',
    amount: '10000000000000000000'  // 10 * 10^18，容易出错
  }
})

// ❌ 多币种需要循环
const options = [
  { asset: '0xUSD1', amount: '10000000000000000000' },
  { asset: '0xUSDT', amount: '10000000000000000000' },
]
const allReqs = []
for (const opt of options) {
  const reqs = await server.buildPaymentRequirements({
    price: opt,
    // ...
  })
  allReqs.push(...reqs)
}
```
</details>

<details open>
<summary><b>X402Server（推荐）</b></summary>

```typescript
import { X402Server } from 'x402x-utils/server'

const server = new X402Server({
  facilitatorUrl: '...',
  payTo: '0x...',
})

// 注册资产（只需精度）
server.registerAsset('eip155:56', '0xUSD1', { decimals: 18 })
server.register('eip155:56', scheme)

// ✅ 使用 uiAmount，自动转换
await server.buildRequirements({
  scheme: 'exact',
  network: 'eip155:56',
  price: { asset: '0xUSD1', uiAmount: 10 }  // 简单！
})

// ✅ 多币种一次搞定
await server.buildRequirements({
  scheme: 'exact',
  network: 'eip155:56',
  price: [
    { asset: '0xUSD1', uiAmount: 10 },
    { asset: '0xUSDT', uiAmount: 10 },
  ]
})
```
</details>

---

## 📦 安装

```bash
pnpm add x402x-utils @x402/core
```

---

## 🚀 快速开始

### 方式一：x402x-evm（推荐）⭐

资产自动同步，支持 `permitType`：

```typescript
import { X402Server } from 'x402x-utils/server'
import { ExactX402xEvmServer } from 'x402x-evm/exact/server'

const server = new X402Server({
  facilitatorUrl: process.env.FACILITATOR_URL!,
  payTo: process.env.PAY_TO as `0x${string}`,
})

// ExactX402xEvmServer 注册资产（包含 permitType）
const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USD1', {
    address: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d',
    decimals: 18,
    permitType: 'permit',  // x402x-evm 特有
  })
  .registerAsset('eip155:56', 'USDT', {
    address: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
    permitType: 'eip3009',
  })

// 注册 scheme（资产自动同步到 AssetRegistry）
server.register('eip155:56', evmScheme)

await server.initialize()

// 使用 uiAmount
const requirements = await server.buildRequirements({
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: [
    { asset: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d', uiAmount: 10 },  // USD1
    { asset: '0x55d398326f99059fF775485246999027B3197955', uiAmount: 10 },  // USDT
  ],
})
```

### 方式二：标准 EVM 链

手动注册资产：

```typescript
import { X402Server } from 'x402x-utils/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'

const server = new X402Server({
  facilitatorUrl: '...',
  payTo: '0x...',
})

// 手动注册资产
server
  .registerAsset('eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', {
    decimals: 6,
    symbol: 'USDC',
  })
  .registerAsset('eip155:8453', '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', {
    decimals: 18,
    symbol: 'DAI',
  })

server.register('eip155:*', new ExactEvmScheme())

await server.initialize()

// 使用 uiAmount
const requirements = await server.buildRequirements({
  scheme: 'exact',
  network: 'eip155:8453',
  price: [
    { asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', uiAmount: 10 },
    { asset: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', uiAmount: 10 },
  ],
})
```

---

## 💡 核心概念

### 1. uiAmount vs amount

```typescript
// uiAmount: 用户友好的金额
{ asset: '0xUSDC', uiAmount: 1.5 }
// ↓ 自动转换（查询 AssetRegistry 获取 decimals: 6）
{ asset: '0xUSDC', amount: '1500000' }

// uiAmount: ETH/DAI
{ asset: '0xDAI', uiAmount: 0.001 }
// ↓ 自动转换（decimals: 18）
{ asset: '0xDAI', amount: '1000000000000000' }
```

### 2. 资产自动同步

```typescript
// 1. 在 ExactX402xEvmServer 中注册
const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USD1', {
    address: '0x...',
    decimals: 18,
    permitType: 'permit',  // ← 完整信息
  })

// 2. 注册到 server（自动同步）
server.register('eip155:56', evmScheme)
  ↓
// 3. AssetRegistry 现在包含：
//    { address: '0x...', decimals: 18, extra: { permitType: 'permit' } }

// 4. 可以直接使用 uiAmount
price: { asset: '0x...', uiAmount: 10 }  // ✅ 无需额外配置！
```

### 3. Price 类型

`X402Server` 支持以下所有格式：

```typescript
// Money: 字符串或数字（使用默认代币）
price: '$0.001'
price: 0.001

// AssetAmount with amount（标准格式）
price: { asset: '0xUSDC', amount: '1000000' }

// EnhancedAssetAmount with uiAmount（推荐）✨
price: { asset: '0xUSDC', uiAmount: 1 }

// 数组：多币种选项（推荐）✨
price: [
  { asset: '0xUSDC', uiAmount: 10 },
  { asset: '0xDAI', uiAmount: 10 },
]
```

---

## 📖 实战示例

### Express 服务器

```typescript
import express from 'express'
import { X402Server } from 'x402x-utils/server'
import { ExactX402xEvmServer } from 'x402x-evm/exact/server'

const app = express()

const server = new X402Server({
  facilitatorUrl: process.env.FACILITATOR_URL!,
  payTo: process.env.PAY_TO as `0x${string}`,
})

const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USD1', {
    address: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d',
    decimals: 18,
    permitType: 'permit',
  })

server.register('eip155:56', evmScheme)
await server.initialize()

// 固定价格端点
app.get('/premium', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: 'eip155:56',
    price: { asset: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d', uiAmount: 10 },
    resourceInfo: {
      url: `http://localhost:3000/premium`,
      description: 'Premium content',
      mimeType: 'application/json',
    },
  })

  if (result.paymentRequiredHeader) {
    res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  }
  if (result.paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)
  }

  if (result.success) {
    res.status(200).json({ message: 'Success!', data: { /* ... */ } })
  } else {
    res.status(result.status).json(result.response)
  }
})

app.listen(3000)
```

### 动态价格

```typescript
app.get('/api/data', async (req, res) => {
  const quantity = parseInt(req.query.quantity as string) || 1
  const pricePerItem = 0.5
  const totalPrice = quantity * pricePerItem

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: 'eip155:56',
    price: { asset: '0xUSD1', uiAmount: totalPrice },  // 动态计算
    resourceInfo: {
      url: `http://localhost:3000/api/data?quantity=${quantity}`,
      description: `Data (${quantity} items)`,
      mimeType: 'application/json',
    },
  })

  // ...
})
```

### 多币种选项

```typescript
app.get('/product', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: 'eip155:56',
    price: [
      { asset: '0xUSD1', uiAmount: 10 },   // 选项1: USD1
      { asset: '0xUSDT', uiAmount: 10 },   // 选项2: USDT
      { asset: '0xUSDC', uiAmount: 10 },   // 选项3: USDC
    ],
    resourceInfo: {
      url: `http://localhost:3000/product`,
      description: 'Product (accept 3 tokens)',
      mimeType: 'application/json',
    },
  })

  // ...
})
```

---

## 🔧 API 参考

### X402Server

#### 构造函数

```typescript
new X402Server({
  facilitatorUrl?: string              // Facilitator 服务 URL
  facilitatorClient?: HTTPFacilitatorClient  // 或直接传入 client
  payTo?: string                       // 默认收款地址
  assetRegistry?: AssetRegistry        // 可选：自定义资产注册表
})
```

#### 方法

```typescript
// 注册 scheme（自动同步资产到 AssetRegistry）
register(network: Network, scheme: SchemeNetworkServer): this

// 注册单个资产
registerAsset(network: Network, asset: string, info: {
  decimals: number
  symbol?: string
  name?: string
  extra?: { permitType?: 'permit' | 'eip3009' | 'permit2' }
}): this

// 批量注册资产
registerAssets(network: Network, assets: Record<string, AssetInfo>): this

// 初始化（获取 facilitator 支持信息）
initialize(): Promise<void>

// 构建支付需求（支持 uiAmount 和数组）
buildRequirements(options: {
  scheme: string
  network: Network
  price: Money | AssetAmount | EnhancedAssetAmount | EnhancedAssetAmount[]
  payTo?: string
}): Promise<PaymentRequirements[]>

// 处理支付请求（解析 + 验证 + 结算）
process(
  paymentHeader: string | undefined,
  options: {
    scheme: string
    network: Network
    price: Money | AssetAmount | EnhancedAssetAmount | EnhancedAssetAmount[]
    resourceInfo: { url, description, mimeType }
    payTo?: string
  } | {
    requirements: PaymentRequirements[]
    resourceInfo: ResourceInfo
  }
): Promise<ProcessResult>

// 获取资产注册表
getAssetRegistry(): AssetRegistry

// 获取底层 x402ResourceServer
getResourceServer(): x402ResourceServer
```

#### ProcessResult

```typescript
interface ProcessResult {
  success: boolean
  status: number  // 200 (成功) | 402 (需支付) | 500 (错误)
  error?: string
  reason?: string
  paymentRequiredHeader?: string  // Base64 编码的 PAYMENT-REQUIRED
  paymentResponseHeader?: string  // Base64 编码的 PAYMENT-RESPONSE
  data?: SettleResponse & { requirements }
  response: object  // JSON 响应体
}
```

### 工具函数

```typescript
import { uiAmountToAmount, amountToUiAmount } from 'x402x-utils/server'

// UI 金额 → 原始金额
uiAmountToAmount(1.5, 6)      // "1500000" (USDC: 6 decimals)
uiAmountToAmount(0.001, 18)   // "1000000000000000" (ETH: 18 decimals)

// 原始金额 → UI 金额
amountToUiAmount("1500000", 6)           // 1.5
amountToUiAmount("1000000000000000", 18) // 0.001
```

---

## 🎯 最佳实践

### 1. 优先使用 x402x-evm（BSC/permitType 场景）

```typescript
✅ 推荐：
const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USD1', {
    address: '0x...',
    decimals: 18,
    permitType: 'permit',  // 完整信息
  })
server.register('eip155:56', evmScheme)  // 自动同步！
```

### 2. 总是使用 uiAmount

```typescript
✅ 推荐：
price: { asset: '0xUSDC', uiAmount: 10 }

❌ 避免（除非你有精确的 amount）：
price: { asset: '0xUSDC', amount: '10000000' }
```

### 3. 提供多币种选项

```typescript
✅ 推荐：让用户选择
price: [
  { asset: '0xUSDC', uiAmount: 10 },
  { asset: '0xDAI', uiAmount: 10 },
  { asset: '0xUSDT', uiAmount: 10 },
]

❌ 避免：只提供单一选项
price: { asset: '0xUSDC', uiAmount: 10 }
```

### 4. 应用启动时批量注册资产

```typescript
// 在 main() 函数中预注册常用代币
const COMMON_TOKENS = {
  USDC: { address: '0x...', decimals: 6 },
  DAI: { address: '0x...', decimals: 18 },
  USDT: { address: '0x...', decimals: 6 },
}

for (const [symbol, config] of Object.entries(COMMON_TOKENS)) {
  server.registerAsset('eip155:8453', config.address, {
    decimals: config.decimals,
    symbol,
  })
}
```

---

## ⚠️ 常见错误

### 错误 1：忘记注册资产

```typescript
❌ 错误：
await server.buildRequirements({
  price: { asset: '0xUSDC', uiAmount: 10 }
})
// Error: Asset 0xUSDC not registered for network eip155:8453

✅ 正确：
server.registerAsset('eip155:8453', '0xUSDC', { decimals: 6 })
await server.buildRequirements({
  price: { asset: '0xUSDC', uiAmount: 10 }
})
```

### 错误 2：忘记调用 initialize()

```typescript
❌ 错误：
const server = new X402Server({ ... })
server.register('eip155:56', scheme)
await server.buildRequirements({ ... })  // Error!

✅ 正确：
const server = new X402Server({ ... })
server.register('eip155:56', scheme)
await server.initialize()  // ← 必须调用！
await server.buildRequirements({ ... })
```

### 错误 3：在官方 server 上使用 uiAmount

```typescript
❌ 错误（类型错误）：
import { x402ResourceServer } from '@x402/core/server'
const server = new x402ResourceServer(...)
await server.buildPaymentRequirements({
  price: { asset: '0xUSDC', uiAmount: 10 }
  // TypeScript Error: Property 'uiAmount' does not exist on type 'AssetAmount'
})

✅ 方案 A - 使用 X402Server：
import { X402Server } from 'x402x-utils/server'
const server = new X402Server({ ... })
server.registerAsset('eip155:8453', '0xUSDC', { decimals: 6 })
await server.buildRequirements({
  price: { asset: '0xUSDC', uiAmount: 10 }  // ✓
})

✅ 方案 B - 手动转换：
import { uiAmountToAmount } from 'x402x-utils/server'
const amount = uiAmountToAmount(10, 6)
await server.buildPaymentRequirements({
  price: { asset: '0xUSDC', amount }
})
```

---

## 🔄 迁移指南

### 从 x402ResourceServer 迁移

```typescript
// ━━━ 之前（官方） ━━━
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server'

const facilitatorClient = new HTTPFacilitatorClient({ url: '...' })
const server = new x402ResourceServer(facilitatorClient)
  .register('eip155:8453', scheme)

await server.initialize()

const requirements = await server.buildPaymentRequirements({
  scheme: 'exact',
  network: 'eip155:8453',
  payTo: '0x...',
  price: { asset: '0xUSDC', amount: '10000000' }
})

// ━━━ 之后（增强版） ━━━
import { X402Server } from 'x402x-utils/server'

const server = new X402Server({
  facilitatorUrl: '...',
  payTo: '0x...',
})

server
  .registerAsset('eip155:8453', '0xUSDC', { decimals: 6 })
  .register('eip155:8453', scheme)

await server.initialize()

const requirements = await server.buildRequirements({
  scheme: 'exact',
  network: 'eip155:8453',
  price: { asset: '0xUSDC', uiAmount: 10 }  // ← 更简单！
})
```

---

## 📚 高级用法

### 分级定价

不同代币不同价格：

```typescript
const result = await server.process(paymentHeader, {
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: [
    { asset: '0xUSDT', uiAmount: 8 },   // VIP 用户折扣
    { asset: '0xUSDC', uiAmount: 10 },  // 标准价格
    { asset: '0xBUSD', uiAmount: 10 },  // 标准价格
  ],
  resourceInfo: { /* ... */ },
})
```

### 条件性代币选项

根据用户偏好动态构建：

```typescript
const preferredToken = req.query.token

const tokenOptions = []
if (!preferredToken || preferredToken === 'USDT') {
  tokenOptions.push({ asset: '0xUSDT', uiAmount: 10 })
}
if (!preferredToken || preferredToken === 'USDC') {
  tokenOptions.push({ asset: '0xUSDC', uiAmount: 10 })
}

const result = await server.process(paymentHeader, {
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: tokenOptions,
  resourceInfo: { /* ... */ },
})
```

### 预构建 Requirements（缓存）

```typescript
// 启动时预构建（可缓存）
const cachedRequirements = await server.buildRequirements({
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: { asset: '0xUSD1', uiAmount: 10 },
})

// 请求时使用缓存
app.get('/cached', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    requirements: cachedRequirements,  // ← 使用缓存
    resourceInfo: { /* ... */ },
  })
  // ...
})
```

---

## 🏗️ 架构说明

### 组件关系

```
X402Server
  ├─ x402ResourceServer (官方核心)
  │   ├─ verifyPayment()
  │   ├─ settlePayment()
  │   └─ buildPaymentRequirements()
  │
  └─ AssetRegistry (资产管理)
      ├─ 存储资产精度
      ├─ 支持 uiAmount 转换
      └─ 存储 permitType 等扩展信息

ExactX402xEvmServer (x402x-evm)
  ├─ registerAsset() → 注册资产
  └─ 注册到 server 时自动同步到 AssetRegistry
```

### 数据流

```
1. 用户注册资产
   ExactX402xEvmServer.registerAsset(...)
   ↓
2. 注册 scheme
   server.register('eip155:56', evmScheme)
   ↓
3. 自动同步
   AssetRegistry.registerAsset(...)  // 包括 permitType
   ↓
4. 构建需求
   server.buildRequirements({ price: { asset, uiAmount } })
   ↓
5. 查询精度
   AssetRegistry.getDecimals(network, asset)
   ↓
6. 自动转换
   uiAmount → amount (使用查到的 decimals)
```

---

## 📂 示例代码

查看完整示例：
- [simplified.ts](../../examples/typescript/servers/x402x-evm-exact/simplified.ts) - 基础用法
- [modes.ts](../../examples/typescript/servers/x402x-evm-exact/modes.ts) - 三种使用模式
- [multi-token.ts](../../examples/typescript/servers/x402x-evm-exact/multi-token.ts) - 多币种支付

---

## ❓ FAQ

### Q1: 什么时候用 X402Server？什么时候用 x402ResourceServer？

**X402Server（推荐新项目使用）：**
- ✅ 需要 uiAmount 自动转换
- ✅ 多币种支付选项
- ✅ 快速开发
- ✅ 使用 x402x-evm（BSC/permitType）

**x402ResourceServer（底层库开发）：**
- ✅ 需要完全控制
- ✅ 有自己的资产管理系统
- ✅ 对包大小敏感

### Q2: 资产必须在 ExactX402xEvmServer 中注册吗？

不是！有三种方式：

```typescript
// 方式 1: 在 ExactX402xEvmServer 中注册（推荐）
const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USD1', { ... })
server.register('eip155:56', evmScheme)  // 自动同步

// 方式 2: 直接在 server 上注册
server.registerAsset('eip155:8453', '0xUSDC', { decimals: 6 })

// 方式 3: 批量注册
server.registerAssets('eip155:8453', { '0xUSDC': { decimals: 6 } })
```

### Q3: 可以混合使用 amount 和 uiAmount 吗？

可以！

```typescript
price: [
  { asset: '0xUSDC', uiAmount: 10 },           // uiAmount
  { asset: '0xDAI', amount: '10000000000000000000' },  // amount
]
```

### Q4: uiAmount 会丢失精度吗？

不会！内部使用 BigInt 计算：

```typescript
// 输入
uiAmount: 1.123456789

// USDC (6 decimals) → 截断到 6 位
amount: "1123456"

// DAI (18 decimals) → 保留完整精度
amount: "1123456789000000000"
```

### Q5: 可以动态添加资产吗？

可以！运行时注册即可：

```typescript
await server.initialize()  // 已启动

// 运行时添加新资产
server.registerAsset('eip155:8453', '0xNewToken', {
  decimals: 9,
  symbol: 'NEW',
})

// 立即可用
const requirements = await server.buildRequirements({
  price: { asset: '0xNewToken', uiAmount: 100 }
})
```

---

## 🔗 相关文档

- [x402x-evm](./x402x-evm.md) - EVM 链 exact 支付实现
- [x402x-react](./x402x-react.md) - React 客户端组件
- [@x402/core](https://docs.x402.org) - 官方核心文档

---

## 💬 何时选择？

| 场景 | 推荐方案 |
|------|---------|
| **新应用开发** | X402Server |
| **BSC + USD1** | X402Server + ExactX402xEvmServer |
| **多币种支付** | X402Server |
| **底层库开发** | x402ResourceServer |
| **已有资产管理** | x402ResourceServer + 工具函数 |

**总结：新项目优先使用 X402Server！** 🎉
