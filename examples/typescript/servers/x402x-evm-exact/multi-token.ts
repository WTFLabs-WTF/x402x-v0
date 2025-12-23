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
 */

import dotenv from 'dotenv'
import express from 'express'
import { X402Server } from 'x402x-utils/server'
import { ExactX402xEvmServer } from 'x402x-evm/exact/server'
import { Network } from '@x402/core/types'

dotenv.config()

const PORT = parseInt(process.env.PORT || '4022', 10)
const FACILITATOR_URL = process.env.FACILITATOR_URL
const EVM_NETWORK = (process.env.EVM_NETWORK || 'eip155:56') as Network
const PAY_TO = process.env.PAY_TO

if (!FACILITATOR_URL || !PAY_TO) {
  // eslint-disable-next-line no-console
  console.error('❌ FACILITATOR_URL and PAY_TO are required')
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

// 资产自动同步到 AssetRegistry
server.register(EVM_NETWORK, evmScheme)

const app = express()

/**
 * 示例 1: 固定价格，多种代币选项
 *
 * 场景：一个商品价格固定为 10 USD，用户可以选择用 USDT、USDC 或 BUSD 支付
 */
app.get('/product-fixed', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: [
      { asset: BSC_TOKENS.USDT, uiAmount: 10 }, // 10 USDT
      { asset: BSC_TOKENS.USDC, uiAmount: 10 }, // 10 USDC
      { asset: BSC_TOKENS.BUSD, uiAmount: 10 }, // 10 BUSD
    ],
    resourceInfo: {
      url: `http://localhost:${PORT}/product-fixed`,
      description: 'Premium Product (10 USD)',
      mimeType: 'application/json',
    },
  })

  if (result.paymentRequiredHeader) {
    res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  }
  if (result.paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)
  }

  res.status(result.status).json(result.response)
})

/**
 * 示例 2: 动态价格，多种代币选项
 *
 * 场景：根据请求参数动态计算价格
 */
app.get('/api/data', async (req, res) => {
  const quantity = parseInt(req.query.quantity as string) || 1
  const pricePerUnit = 0.5 // $0.5 per unit
  const totalPrice = quantity * pricePerUnit

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: [
      { asset: BSC_TOKENS.USDT, uiAmount: totalPrice },
      { asset: BSC_TOKENS.USDC, uiAmount: totalPrice },
      { asset: BSC_TOKENS.BUSD, uiAmount: totalPrice },
    ],
    resourceInfo: {
      url: `http://localhost:${PORT}/api/data?quantity=${quantity}`,
      description: `API Data (${quantity} units × $${pricePerUnit})`,
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
    // 返回数据
    res.status(result.status).json({
      ...result.response,
      data: {
        quantity,
        totalPrice,
        items: Array.from({ length: quantity }, (_, i) => ({
          id: i + 1,
          value: `Item ${i + 1}`,
        })),
      },
    })
  } else {
    res.status(result.status).json(result.response)
  }
})

/**
 * 示例 3: 分级定价，不同代币不同价格
 *
 * 场景：高级用户用 USDT 便宜，普通用户用 USDC/BUSD
 */
app.get('/premium-tier', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: [
      { asset: BSC_TOKENS.USDT, uiAmount: 8 }, // VIP 价格
      { asset: BSC_TOKENS.USDC, uiAmount: 10 }, // 标准价格
      { asset: BSC_TOKENS.BUSD, uiAmount: 10 }, // 标准价格
    ],
    resourceInfo: {
      url: `http://localhost:${PORT}/premium-tier`,
      description: 'Premium Tier (USDT users get discount)',
      mimeType: 'application/json',
    },
  })

  if (result.paymentRequiredHeader) {
    res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  }
  if (result.paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)
  }

  res.status(result.status).json(result.response)
})

/**
 * 示例 4: 条件性代币选项
 *
 * 场景：根据用户偏好只提供特定代币
 */
app.get('/conditional', async (req, res) => {
  const preferredToken = req.query.token as string

  // 动态构建代币选项
  const tokenOptions: Array<{ asset: `0x${string}`; uiAmount: number }> = []

  if (!preferredToken || preferredToken === 'USDT') {
    tokenOptions.push({ asset: BSC_TOKENS.USDT, uiAmount: 5 })
  }
  if (!preferredToken || preferredToken === 'USDC') {
    tokenOptions.push({ asset: BSC_TOKENS.USDC, uiAmount: 5 })
  }
  if (!preferredToken || preferredToken === 'BUSD') {
    tokenOptions.push({ asset: BSC_TOKENS.BUSD, uiAmount: 5 })
  }

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: tokenOptions,
    resourceInfo: {
      url: `http://localhost:${PORT}/conditional${preferredToken ? `?token=${preferredToken}` : ''}`,
      description: 'Conditional Token Options',
      mimeType: 'application/json',
    },
  })

  if (result.paymentRequiredHeader) {
    res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  }
  if (result.paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)
  }

  res.status(result.status).json(result.response)
})

async function main(): Promise<void> {
  await server.initialize()

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 Multi-Token server listening at http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log('Available endpoints:')
    // eslint-disable-next-line no-console
    console.log(`  - GET http://localhost:${PORT}/product-fixed`)
    // eslint-disable-next-line no-console
    console.log(`  - GET http://localhost:${PORT}/api/data?quantity=5`)
    // eslint-disable-next-line no-console
    console.log(`  - GET http://localhost:${PORT}/premium-tier`)
    // eslint-disable-next-line no-console
    console.log(`  - GET http://localhost:${PORT}/conditional?token=USDT`)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err)
  process.exit(1)
})

