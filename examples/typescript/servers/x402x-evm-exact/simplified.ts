/**
 * Simplified x402x-utils Server Example
 *
 * 展示 X402Server 的基础用法，包括：
 * 1. 使用 Money 格式（最简单）
 * 2. 使用 uiAmount（推荐，精确控制）
 *
 * 核心优势：
 * - ✅ 自动资产注册同步（ExactX402xEvmServer → AssetRegistry）
 * - ✅ uiAmount 自动精度转换
 * - ✅ 一行代码处理支付逻辑
 */

import dotenv from 'dotenv'
import express from 'express'
import { X402Server } from 'x402x-utils/server'
import { ExactX402xEvmServer } from 'x402x-evm/exact/server'
import { Network } from '@x402/core/types'

dotenv.config()

const PORT = parseInt(process.env.PORT || '4021', 10)
const FACILITATOR_URL = process.env.FACILITATOR_URL
const EVM_NETWORK = (process.env.EVM_NETWORK || 'eip155:56') as Network
const PAY_TO = process.env.PAY_TO
const ASSET_ADDRESS = process.env.ASSET_ADDRESS as `0x${string}`
const ASSET_DECIMALS = parseInt(process.env.ASSET_DECIMALS || '18', 10)
const ASSET_NAME = process.env.ASSET_NAME
const ASSET_VERSION = process.env.ASSET_VERSION

if (!FACILITATOR_URL || !PAY_TO || !ASSET_ADDRESS) {
  // eslint-disable-next-line no-console
  console.error('❌ FACILITATOR_URL, PAY_TO and ASSET_ADDRESS are required')
  process.exit(1)
}

// 1. 创建 X402Server 实例
const server = new X402Server({
  facilitatorUrl: FACILITATOR_URL,
  payTo: PAY_TO, // 默认收款地址
})

// 2. 配置并注册 EVM Scheme
// 注意：资产信息会自动同步到 AssetRegistry，支持 uiAmount 转换
const evmScheme = new ExactX402xEvmServer().registerAsset(EVM_NETWORK, 'TOKEN', {
  address: ASSET_ADDRESS,
  decimals: ASSET_DECIMALS,
  name: ASSET_NAME || undefined,
  version: ASSET_VERSION || undefined,
  permitType: 'permit', // x402x-evm 特有
})

server.register(EVM_NETWORK, evmScheme) // ← 资产自动同步到 AssetRegistry

const app = express()

// 示例 1: 使用 Money 格式（最简单）
app.get('/paid-money', async (req, res) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: '$0.001', // Money 格式：字符串或数字
    resourceInfo: {
      url,
      description: 'Paid endpoint (Money format)',
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

// 示例 2: 使用 uiAmount（推荐，精确控制）
app.get('/paid-uiamount', async (req, res) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
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

async function main(): Promise<void> {
  // 初始化（获取支持的支付方式等）
  await server.initialize()

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 Simplified Resource server listening at http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`Try: GET http://localhost:${PORT}/paid`)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err)
  process.exit(1)
})

