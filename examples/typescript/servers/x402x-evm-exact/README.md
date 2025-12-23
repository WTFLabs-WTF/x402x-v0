# x402x-evm Server Examples

使用 `X402Server` + `ExactX402xEvmServer` 的完整示例集合。

## 📁 文件说明

| 文件 | 说明 | 适合场景 |
|------|------|---------|
| **simplified.ts** | 基础示例 | 快速上手，了解基本用法 |
| **modes.ts** | 三种模式 | 理解不同的控制级别 |
| **multi-token.ts** | 多币种支付 | 生产环境，提供多种支付选项 |
| **index.ts** | 原始实现 | 对比官方 API 的用法 |

## 🚀 快速开始

### 1. 环境配置

创建 `.env` 文件：

```bash
FACILITATOR_URL=https://facilitator.x402x.example.com
PAY_TO=0xYourBscAddress
EVM_NETWORK=eip155:56

# 单代币示例（simplified.ts, modes.ts）
ASSET_ADDRESS=0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d
ASSET_DECIMALS=18
ASSET_NAME=USD1
ASSET_VERSION=1
```

### 2. 运行示例

```bash
# 基础示例
pnpm tsx simplified.ts

# 三种模式
pnpm tsx modes.ts

# 多币种支付
pnpm tsx multi-token.ts
```

## 📖 详细说明

### simplified.ts - 基础示例

**两个端点展示核心用法：**

#### `/paid-money` - Money 格式
```typescript
price: '$0.001'  // 最简单
```

#### `/paid-uiamount` - uiAmount 格式（推荐）
```typescript
price: {
  asset: ASSET_ADDRESS,
  uiAmount: 0.001  // ✅ 精确控制，自动转换精度
}
```

**核心优势：**
- ✅ 一行代码处理支付逻辑
- ✅ 自动资产注册同步
- ✅ 自动精度转换

**测试：**
```bash
# 1. 未支付（返回 402）
curl http://localhost:4021/paid-uiamount

# 2. 已支付（需要 PAYMENT-SIGNATURE header）
curl -H "PAYMENT-SIGNATURE: base64..." http://localhost:4021/paid-uiamount
```

---

### modes.ts - 三种使用模式

#### Mode A: 自动化模式
```typescript
// 一行代码，最简单
const result = await server.process(paymentHeader, {
  scheme: 'exact:eip7702',
  network: EVM_NETWORK,
  price: 0.01,
  resourceInfo: { ... },
})
```

**适用场景：**
- ✅ 大部分应用场景
- ✅ 快速开发
- ✅ 简单的支付逻辑

#### Mode B: 预构建模式
```typescript
// 1. 提前构建（可缓存）
const requirements = await server.buildRequirements({
  price: { asset: ASSET_ADDRESS, uiAmount: 0.01 }
})

// 2. 使用预构建的 requirements
const result = await server.process(paymentHeader, {
  requirements,  // ← 使用缓存
  resourceInfo: { ... },
})
```

**适用场景：**
- ✅ 锁定价格
- ✅ 缓存 requirements
- ✅ 批量生成支付需求

#### Mode C: 原子化模式
```typescript
// 完全手动控制
const parsed = server.parse(signature, requirements)  // 解析
const verify = await server.verify(payload, matching) // 验证
const settle = await server.settle(payload, matching) // 结算
```

**适用场景：**
- ✅ 复杂业务逻辑
- ✅ 延迟结算
- ✅ 自定义错误处理

**测试：**
```bash
curl http://localhost:4021/mode-a
curl http://localhost:4021/mode-b
curl http://localhost:4021/mode-c
```

---

### multi-token.ts - 多币种支付（⭐ 推荐生产使用）

#### 4 个实用示例：

##### 1. `/product-fixed` - 固定价格，多币种
```typescript
price: [
  { asset: USDT_ADDRESS, uiAmount: 10 },
  { asset: USDC_ADDRESS, uiAmount: 10 },
  { asset: BUSD_ADDRESS, uiAmount: 10 },
]
```

##### 2. `/api/data` - 动态价格，多币种
```typescript
const totalPrice = quantity * pricePerUnit
price: [
  { asset: USDT_ADDRESS, uiAmount: totalPrice },
  { asset: USDC_ADDRESS, uiAmount: totalPrice },
  { asset: BUSD_ADDRESS, uiAmount: totalPrice },
]
```

##### 3. `/premium-tier` - 分级定价
```typescript
price: [
  { asset: USDT_ADDRESS, uiAmount: 8 },  // VIP 价格
  { asset: USDC_ADDRESS, uiAmount: 10 }, // 标准价格
  { asset: BUSD_ADDRESS, uiAmount: 10 }, // 标准价格
]
```

##### 4. `/conditional` - 条件性代币选项
```typescript
// 根据用户偏好动态构建
const tokenOptions = []
if (preferredToken === 'USDT') {
  tokenOptions.push({ asset: USDT_ADDRESS, uiAmount: 5 })
}
```

**核心优势：**
- ✅ 用户可选择喜欢的代币
- ✅ 提高转化率
- ✅ 灵活的定价策略

**测试：**
```bash
# 固定价格
curl http://localhost:4022/product-fixed

# 动态价格（5个单位）
curl http://localhost:4022/api/data?quantity=5

# 分级定价
curl http://localhost:4022/premium-tier

# 条件选项（仅 USDT）
curl http://localhost:4022/conditional?token=USDT
```

---

## 🔑 核心概念

### 1. 资产自动同步

```typescript
// ExactX402xEvmServer 中注册资产
const evmScheme = new ExactX402xEvmServer()
  .registerAsset('eip155:56', 'USDT', {
    address: '0x...',
    decimals: 18,
    permitType: 'permit',  // ← 完整信息
  })

// 注册到 server 时自动同步到 AssetRegistry
server.register('eip155:56', evmScheme)

// ✅ 现在可以使用 uiAmount，无需额外配置！
```

### 2. uiAmount vs amount

```typescript
// ❌ 手动计算（容易出错）
price: {
  asset: '0xUSDT',
  amount: '10000000000000000000'  // 10 * 10^18
}

// ✅ 使用 uiAmount（推荐）
price: {
  asset: '0xUSDT',
  uiAmount: 10  // 简单直观！
}
```

### 3. Price 类型

```typescript
// Money: 字符串或数字
price: '$0.001'
price: 0.001

// AssetAmount with amount
price: { asset: '0x...', amount: '1000000' }

// EnhancedAssetAmount with uiAmount（推荐）
price: { asset: '0x...', uiAmount: 1 }

// 数组：多币种选项
price: [
  { asset: '0xUSDT', uiAmount: 10 },
  { asset: '0xUSDC', uiAmount: 10 },
]
```

## 🎯 最佳实践

### 1. 优先使用 uiAmount

```typescript
✅ 推荐：
price: { asset: '0xUSDT', uiAmount: 10 }

❌ 避免（除非必要）：
price: { asset: '0xUSDT', amount: '10000000000000000000' }
```

### 2. 提供多币种选项

```typescript
✅ 推荐：提供 2-3 种常见代币
price: [
  { asset: USDT, uiAmount: 10 },
  { asset: USDC, uiAmount: 10 },
]

❌ 避免：只提供一种代币
price: { asset: USDT, uiAmount: 10 }
```

### 3. 使用 Mode A（自动化）

```typescript
✅ 推荐：大部分场景使用 process()
const result = await server.process(paymentHeader, options)

❌ 避免：不必要的手动控制
const parsed = server.parse(...)
const verify = await server.verify(...)
const settle = await server.settle(...)
```

## 📚 相关文档

- [x402x-utils-server.md](../../../../docs/sdk/x402x-utils-server.md) - 完整文档
- [x402x-evm.md](../../../../docs/sdk/x402x-evm.md) - EVM 实现文档

## 💡 总结

| 示例 | 用途 | 推荐度 |
|------|------|--------|
| **simplified.ts** | 学习基础 | ⭐⭐⭐ |
| **modes.ts** | 理解模式 | ⭐⭐⭐⭐ |
| **multi-token.ts** | 生产使用 | ⭐⭐⭐⭐⭐ |

**新项目建议：**
1. 从 `simplified.ts` 开始学习
2. 参考 `multi-token.ts` 实现生产功能
3. 需要特殊控制时查看 `modes.ts`
