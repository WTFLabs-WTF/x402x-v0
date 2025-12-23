# x402x-utils

**增强版** x402 服务器端工具库，基于官方 `@x402/core` 构建，提供更友好的 API 和自动化功能。

## ⚠️ 重要说明

**X402Server vs x402ResourceServer**

- `X402Server`（本库）= 增强版，支持 `uiAmount`
- `x402ResourceServer`（官方）= 核心版，不支持 `uiAmount`

详见 [COMPARISON.md](./COMPARISON.md)

## 特性

✅ **uiAmount 支持** - 使用用户友好的金额（10）而不是原始 amount（"10000000"）  
✅ **自动精度转换** - 根据注册的代币精度自动转换  
✅ **多币种支持** - 数组格式轻松支持多种代币选项  
✅ **统一资产注册** - Scheme 和 AssetRegistry 自动同步  
✅ **类型安全** - 完整的 TypeScript 类型支持，编译时捕获错误  

## 快速开始

### 安装

```bash
npm install x402x-utils
# or
pnpm add x402x-utils
```

### 基础用法

```typescript
import { X402Server } from 'x402x-utils/server'
import { ExactX402xEvmServer } from 'x402x-evm/exact/server'

// 1. 创建服务器
const server = new X402Server({
  facilitatorUrl: 'https://facilitator.example.com',
  payTo: '0xYourAddress',
})

// 2. 注册 x402x-evm scheme（资产自动同步！）
const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USD1', {
    address: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d',
    decimals: 18,
    permitType: 'permit',
  })

server.register('eip155:56', evmScheme) // 资产自动同步到 AssetRegistry

// 3. 初始化
await server.initialize()

// 4. 构建支付需求（使用 uiAmount）
const requirements = await server.buildRequirements({
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: { 
    asset: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d', 
    uiAmount: 10  // 10 USD1，自动转换为 10000000000000000000
  },
})
```

### 多币种支持

```typescript
// 支持多种代币让用户选择
const requirements = await server.buildRequirements({
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: [
    { asset: '0xUSD1', uiAmount: 10 },   // 10 USD1
    { asset: '0xUSDT', uiAmount: 10 },   // 10 USDT
    { asset: '0xUSDC', uiAmount: 10 },   // 10 USDC
  ],
})

// 返回 3 个 PaymentRequirements，客户端选择一个支付
```

## 为什么使用 x402x-utils？

### 官方 x402ResourceServer（需要手动计算）

```typescript
import { x402ResourceServer } from '@x402/core/server'

const server = new x402ResourceServer(facilitatorClient)
  .register('eip155:56', scheme)

await server.initialize()

// ❌ 必须手动计算 amount
const requirements = await server.buildPaymentRequirements({
  scheme: 'exact',
  network: 'eip155:56',
  payTo: '0x...',
  price: {
    asset: '0xUSD1',
    amount: '10000000000000000000', // 10 * 10^18，容易出错！
  },
})

// ❌ 多币种需要多次调用
const req1 = await server.buildPaymentRequirements({
  price: { asset: '0xUSD1', amount: '...' }
})
const req2 = await server.buildPaymentRequirements({
  price: { asset: '0xUSDT', amount: '...' }
})
const requirements = [...req1, ...req2]
```

### X402Server（自动转换，更简单）

```typescript
import { X402Server } from 'x402x-utils/server'

const server = new X402Server({
  facilitatorUrl: '...',
  payTo: '0x...',
})

// 注册资产精度
server.registerAsset('eip155:56', '0xUSD1', { decimals: 18 })
server.registerAsset('eip155:56', '0xUSDT', { decimals: 18 })
server.register('eip155:56', scheme)

await server.initialize()

// ✅ 使用 uiAmount，自动转换！
const requirements = await server.buildRequirements({
  scheme: 'exact:eip7702',
  network: 'eip155:56',
  price: [
    { asset: '0xUSD1', uiAmount: 10 },  // 简单直观！
    { asset: '0xUSDT', uiAmount: 10 },
  ],
})
```

**差异总结：**
- 官方版：手动计算 amount，多次调用
- 增强版：使用 uiAmount，一次调用，自动转换

## 核心概念

### 1. uiAmount vs amount

- **`uiAmount`**: 用户友好的金额（例如 `1.5` 表示 1.5 个代币）
- **`amount`**: 原始的最小单位（例如 `1500000` 对于 USDC 的 6 位精度）

x402x-utils 自动在两者之间转换。

### 2. 统一资产注册

使用 `x402x-evm` 的 scheme 时，资产信息自动同步：

```typescript
// scheme 注册
const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USD1', {
    address: '0x...',
    decimals: 18,
    permitType: 'permit',
  })

// 注册到服务器（自动同步精度信息）
server.register('eip155:56', evmScheme)

// ✅ 现在可以使用 uiAmount，无需额外配置！
```

如果不使用 x402x-evm，可以手动注册：

```typescript
server.registerAsset('eip155:8453', '0xUSDC', {
  decimals: 6,
  symbol: 'USDC',
})
```

### 3. 多币种支付选项

支持数组格式提供多个支付选项：

```typescript
price: [
  { asset: '0xToken1', uiAmount: 10 },
  { asset: '0xToken2', uiAmount: 10 },
  { asset: '0xToken3', uiAmount: 10 },
]
```

客户端会收到所有选项，然后选择一个进行支付。

## API 参考

### X402Server

#### Constructor

```typescript
new X402Server(config: X402ServerConfig)
```

#### Methods

- `register(network, scheme)` - 注册 scheme（自动同步资产）
- `registerAsset(network, asset, info)` - 注册单个资产
- `registerAssets(network, assets)` - 批量注册资产
- `getAssetRegistry()` - 获取资产注册表
- `buildRequirements(options)` - 构建支付需求
- `process(paymentHeader, options)` - 处理支付请求
- `initialize()` - 初始化服务器

### 工具函数

```typescript
import { uiAmountToAmount, amountToUiAmount } from 'x402x-utils/server'

// 转换为最小单位
uiAmountToAmount(1.5, 6) // "1500000" (USDC)

// 转换为用户友好格式
amountToUiAmount("1500000", 6) // 1.5
```

## 完整文档

查看 [x402x-utils-server.md](../../../docs/sdk/x402x-utils-server.md) 获取详细使用指南。

## License

MIT

