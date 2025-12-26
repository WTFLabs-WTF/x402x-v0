/**
 * Multi-Token Payment Example
 *
 * 展示如何使用 X402Server 支持多币种支付选项。
 *
 * 核心特性：
 * - ✅ 一次请求提供多种代币选项（USDC, DAI, USDT 等）
 * - ✅ 客户端可以选择任意一种代币支付
 * - ✅ 使用 uiAmount 自动处理精度转换
 * - ✅ 使用数组格式简化代码
 * - ✅ 支持动态定价和分级定价
 */

import dotenv from 'dotenv'
import express, { Request, Response } from 'express'
import { X402Server } from 'x402x-utils/server'
import { ExactX402xEvmServer } from 'x402x-evm/exact/server'

dotenv.config()

const PORT = parseInt(process.env.PORT || '4022', 10)
const FACILITATOR_URL = process.env.FACILITATOR_URL
const EVM_NETWORK = process.env.EVM_NETWORK || 'eip155:56'
const PAY_TO = process.env.PAY_TO as `0x${string}` | undefined

if (!FACILITATOR_URL) {
  // eslint-disable-next-line no-console
  console.error('❌ FACILITATOR_URL is required')
  process.exit(1)
}
if (!PAY_TO) {
  // eslint-disable-next-line no-console
  console.error('❌ PAY_TO is required')
  process.exit(1)
}

// BSC 主网常见代币
const BSC_TOKENS = {
  USDT: '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as `0x${string}`,
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as `0x${string}`,
}

const server = new X402Server({
  facilitatorUrl: FACILITATOR_URL,
  payTo: PAY_TO,
})

// 注册多种代币
const evmScheme = new ExactX402xEvmServer()
  .registerAsset(EVM_NETWORK, 'USDT', {
    address: BSC_TOKENS.USDT,
    decimals: 18,
    name: 'Tether USD',
    permitType: 'permit',
  })
  .registerAsset(EVM_NETWORK, 'USDC', {
    address: BSC_TOKENS.USDC,
    decimals: 18,
    name: 'USD Coin',
    permitType: 'permit',
  })
  .registerAsset(EVM_NETWORK, 'BUSD', {
    address: BSC_TOKENS.BUSD,
    decimals: 18,
    name: 'Binance USD',
    permitType: 'permit',
  })

server.register(EVM_NETWORK as `${string}:${string}`, evmScheme)

const app = express()

// 辅助函数：处理支付响应
const handlePayment = async (
  req: Request,
  res: Response,
  options: {
    price: string | number | { asset: `0x${string}`; uiAmount: number } | Array<{ asset: `0x${string}`; uiAmount: number }>
    description: string
    extraData?: Record<string, unknown>
  },
) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK as `${string}:${string}`,
    price: options.price,
    resourceInfo: {
      url,
      description: options.description,
      mimeType: 'application/json',
    },
  })

  if (result.paymentRequiredHeader) {
    res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  }
  if (result.paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)
  }

  // 如果成功且有额外数据，合并返回
  if (result.success && options.extraData) {
    res.status(result.status).json({ ...result.response, ...options.extraData })
  } else {
    res.status(result.status).json(result.response)
  }
}

/**
 * 示例 1: 固定价格，多种代币选项
 * 场景：商品固定价格 10 USD，用户可选择 USDT、USDC 或 BUSD 支付
 */
app.get('/product-fixed', async (req, res) => {
  await handlePayment(req, res, {
    price: [
      { asset: BSC_TOKENS.USDT, uiAmount: 10 },
      { asset: BSC_TOKENS.USDC, uiAmount: 10 },
      { asset: BSC_TOKENS.BUSD, uiAmount: 10 },
    ],
    description: 'Premium Product (10 USD)',
  })
})

/**
 * 示例 2: 动态价格，多种代币选项
 * 场景：根据请求参数动态计算价格
 */
app.get('/api/data', async (req, res) => {
  const quantity = parseInt(req.query.quantity as string) || 1
  const pricePerUnit = 0.5
  const totalPrice = quantity * pricePerUnit

  await handlePayment(req, res, {
    price: [
      { asset: BSC_TOKENS.USDT, uiAmount: totalPrice },
      { asset: BSC_TOKENS.USDC, uiAmount: totalPrice },
      { asset: BSC_TOKENS.BUSD, uiAmount: totalPrice },
    ],
    description: `API Data (${quantity} units × $${pricePerUnit})`,
    extraData: {
      data: {
        quantity,
        totalPrice,
        items: Array.from({ length: quantity }, (_, i) => ({
          id: i + 1,
          value: `Item ${i + 1}`,
        })),
      },
    },
  })
})

/**
 * 示例 3: 分级定价，不同代币不同价格
 * 场景：USDT 用户享受优惠价格（8 USD），其他代币标准价格（10 USD）
 */
app.get('/premium-tier', async (req, res) => {
  await handlePayment(req, res, {
    price: [
      { asset: BSC_TOKENS.USDT, uiAmount: 8 },  // VIP 价格
      { asset: BSC_TOKENS.USDC, uiAmount: 10 }, // 标准价格
      { asset: BSC_TOKENS.BUSD, uiAmount: 10 }, // 标准价格
    ],
    description: 'Premium Tier (USDT users get 20% discount)',
  })
})

/**
 * 示例 4: 条件性代币选项
 * 场景：根据用户偏好只提供特定代币选项
 */
app.get('/conditional', async (req, res) => {
  const preferredToken = (req.query.token as string)?.toUpperCase()

  // 动态构建代币选项
  const priceOptions: Array<{ asset: `0x${string}`; uiAmount: number }> = []

  if (!preferredToken || preferredToken === 'USDT') {
    priceOptions.push({ asset: BSC_TOKENS.USDT, uiAmount: 5 })
  }
  if (!preferredToken || preferredToken === 'USDC') {
    priceOptions.push({ asset: BSC_TOKENS.USDC, uiAmount: 5 })
  }
  if (!preferredToken || preferredToken === 'BUSD') {
    priceOptions.push({ asset: BSC_TOKENS.BUSD, uiAmount: 5 })
  }

  await handlePayment(req, res, {
    price: priceOptions,
    description: preferredToken
      ? `Conditional Payment (${preferredToken} only)`
      : 'Conditional Payment (all tokens)',
  })
})

async function main(): Promise<void> {
  await server.initialize()

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 Multi-Token server listening at http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`\n📋 Available endpoints:`)
    // eslint-disable-next-line no-console
    console.log(`   1. GET /product-fixed        - 固定价格，三种代币选项（10 USD）`)
    // eslint-disable-next-line no-console
    console.log(`   2. GET /api/data?quantity=N  - 动态价格（$0.5/单位）`)
    // eslint-disable-next-line no-console
    console.log(`   3. GET /premium-tier         - 分级定价（USDT 8 USD, 其他 10 USD）`)
    // eslint-disable-next-line no-console
    console.log(`   4. GET /conditional?token=X  - 条件性代币选项`)
    // eslint-disable-next-line no-console
    console.log(`\n💡 支持的代币: USDT, USDC, BUSD (BSC 主网)`)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err)
  process.exit(1)
})

