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
const evmScheme = new ExactX402xEvmServer().registerAsset(EVM_NETWORK, 'TOKEN', {
  address: ASSET_ADDRESS,
  decimals: ASSET_DECIMALS,
  name: ASSET_NAME || undefined,
  version: ASSET_VERSION || undefined,
  permitType: 'permit',
})

server.register(EVM_NETWORK, evmScheme)

const app = express()

app.get('/paid', async (req, res) => {
  const host = req.header('host') || `localhost:${PORT}`
  const url = `${req.protocol || 'http'}://${host}${req.originalUrl || req.url || req.path}`

  // 3. 使用一行代码处理支付逻辑（包含构建 requirements、解析 header、验证、结算）
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: '$0.001',
    resourceInfo: {
      url,
      description: 'Simplified paid endpoint (x402x-utils)',
      mimeType: 'application/json',
    },
  })

  // 4. 根据处理结果设置响应头
  if (result.paymentRequiredHeader) {
    res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  }
  if (result.paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)
  }

  // 5. 返回响应（成功为 200，需支付为 402，错误为 500）
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

