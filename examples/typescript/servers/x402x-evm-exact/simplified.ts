/**
 * Simplified x402x-utils Server Example
 *
 * 对比 index.ts 的手动流程，X402Server 简化为一行代码：
 *
 * index.ts (手动模式 - 60+ 行):
 * ├─ buildPaymentRequirements
 * ├─ createPaymentRequiredResponse
 * ├─ decodePaymentSignatureHeader
 * ├─ findMatchingRequirements
 * ├─ verifyPayment
 * ├─ settlePayment
 * └─ encodePaymentRequiredHeader/encodePaymentResponseHeader
 *
 * simplified.ts (自动模式 - 1 行):
 * └─ server.process() ← 全部搞定！
 *
 * 核心优势：
 * - ✅ 自动资产注册同步（ExactX402xEvmServer → AssetRegistry）
 * - ✅ uiAmount 自动精度转换
 * - ✅ 自动处理 402/200 状态码和 headers
 * - ✅ 一行代码完成所有支付逻辑
 */

import dotenv from 'dotenv'
import express from 'express'
import { X402Server } from 'x402x-utils/server'
import { ExactX402xEvmServer } from 'x402x-evm/exact/server'

dotenv.config()

const PORT = parseInt(process.env.PORT || '4021', 10)
const FACILITATOR_URL = process.env.FACILITATOR_URL
const EVM_NETWORK = process.env.EVM_NETWORK || 'eip155:56'
const PAY_TO = process.env.PAY_TO as `0x${string}` | undefined
const ASSET_ADDRESS = process.env.ASSET_ADDRESS as `0x${string}` | undefined
const ASSET_DECIMALS = process.env.ASSET_DECIMALS
  ? parseInt(process.env.ASSET_DECIMALS, 10)
  : 18
const ASSET_NAME = process.env.ASSET_NAME || undefined
const ASSET_VERSION = process.env.ASSET_VERSION || undefined

if (!FACILITATOR_URL) {
  // eslint-disable-next-line no-console
  console.error('❌ FACILITATOR_URL is required')
  process.exit(1)
}
if (!PAY_TO || !ASSET_ADDRESS) {
  // eslint-disable-next-line no-console
  console.error('❌ PAY_TO and ASSET_ADDRESS are required')
  process.exit(1)
}

// 1. 创建 X402Server 实例（封装了 HTTPFacilitatorClient + x402ResourceServer）
const server = new X402Server({
  facilitatorUrl: FACILITATOR_URL,
  payTo: PAY_TO, // 默认收款地址
})

// 2. 配置并注册 EVM Scheme（与 index.ts 完全相同）
// 资产信息会自动同步到 AssetRegistry，支持 uiAmount 转换
const evmScheme = new ExactX402xEvmServer().registerAsset(
  EVM_NETWORK as `${string}:${string}`,
  'TOKEN',
  {
    address: ASSET_ADDRESS,
    decimals: ASSET_DECIMALS,
    name: ASSET_NAME,
    version: ASSET_VERSION,
    permitType: 'permit', // x402x-evm 特有配置
  },
)

server.register(EVM_NETWORK as `${string}:${string}`, evmScheme) // ← 资产自动同步到 AssetRegistry

const app = express()

// 主路由：与 index.ts 的 /paid 等价，但简化为一行！
app.get('/paid', async (req, res) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  // ✨ 一行代码替代 index.ts 中 60+ 行的手动流程
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK as `${string}:${string}`,
    price: '$0.001', // 与 index.ts 中的 price 一致
    resourceInfo: {
      url,
      description: 'Paid endpoint (x402x-evm exact:eip7702)',
      mimeType: 'application/json',
    },
  })

  // 自动设置 headers（无需手动 encode）
  if (result.paymentRequiredHeader) {
    res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  }
  if (result.paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)
  }

  // 自动处理状态码和响应
  res.status(result.status).json(result.response)
})

// 示例 2: 使用 Money 格式的数字
app.get('/paid-money', async (req, res) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK as `${string}:${string}`,
    price: 0.001, // Money 格式：数字
    resourceInfo: {
      url,
      description: 'Paid endpoint (Money number format)',
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

// 示例 3: 使用 uiAmount（推荐，精确控制）
app.get('/paid-uiamount', async (req, res) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK as `${string}:${string}`,
    price: {
      asset: ASSET_ADDRESS,
      uiAmount: 0.001, // ✅ 使用 uiAmount，自动转换精度
    },
    resourceInfo: {
      url,
      description: 'Paid endpoint (uiAmount format)',
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

// 示例 4: 自定义 payTo（覆盖默认配置）
app.get('/paid-custom', async (req, res) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK as `${string}:${string}`,
    price: '$0.001',
    payTo: PAY_TO, // 可以覆盖默认的 payTo
    resourceInfo: {
      url,
      description: 'Paid endpoint with custom payTo',
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
  // 初始化（获取 facilitator 支持的支付方式等）
  await server.initialize()

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 Simplified Resource server listening at http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`\n📋 Available endpoints:`)
    // eslint-disable-next-line no-console
    console.log(`   GET http://localhost:${PORT}/paid           - 与 index.ts 等价（简化版）`)
    // eslint-disable-next-line no-console
    console.log(`   GET http://localhost:${PORT}/paid-money     - Money 数字格式`)
    // eslint-disable-next-line no-console
    console.log(`   GET http://localhost:${PORT}/paid-uiamount  - uiAmount 格式（推荐）`)
    // eslint-disable-next-line no-console
    console.log(`   GET http://localhost:${PORT}/paid-custom    - 自定义 payTo`)
    // eslint-disable-next-line no-console
    console.log(`\n💡 对比说明:`)
    // eslint-disable-next-line no-console
    console.log(`   index.ts      → 手动处理所有步骤 (60+ 行)`)
    // eslint-disable-next-line no-console
    console.log(`   simplified.ts → server.process() 一行搞定！`)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err)
  process.exit(1)
})

