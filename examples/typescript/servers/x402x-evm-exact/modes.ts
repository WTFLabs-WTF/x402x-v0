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

if (!FACILITATOR_URL || !PAY_TO || !ASSET_ADDRESS) {
  // eslint-disable-next-line no-console
  console.error('❌ FACILITATOR_URL, PAY_TO and ASSET_ADDRESS are required')
  process.exit(1)
}

// -------------------------------------------------------------------------
// 初始化 Server
// -------------------------------------------------------------------------
const server = new X402Server({
  facilitatorUrl: FACILITATOR_URL,
  payTo: PAY_TO,
})

const evmScheme = new ExactX402xEvmServer().registerAsset(EVM_NETWORK, 'TOKEN', {
  address: ASSET_ADDRESS,
  decimals: ASSET_DECIMALS,
  permitType: 'permit',
})

server.register(EVM_NETWORK, evmScheme)

const app = express()

/**
 * 方式 A: 自动化模式 (Automatic Mode)
 *
 * 这种方式最简单，一行代码搞定。Server 内部会自动：
 * 1. 根据配置构建支付要求 (Requirements)
 * 2. 如果没有 Header，返回 402
 * 3. 如果有 Header，解析、匹配并自动执行验证和结算
 */
app.get('/mode-a', async (req, res) => {
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: 0.01,
    resourceInfo: { 
      url: 'http://example.com/item-a', 
      description: 'Mode A',
      mimeType: 'application/json'
    },
  })

  if (result.paymentRequiredHeader) res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  if (result.paymentResponseHeader) res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)

  res.status(result.status).json(result.response)
})

/**
 * 方式 B: 预构建模式 (Manual Requirements Mode)
 *
 * 这种方式允许你提前生成 Requirements。
 * 适用于需要“锁定价格”或“缓存支付要求”的场景。
 */
app.get('/mode-b', async (req, res) => {
  // 1. 提前构建要求 (可以从缓存获取)
  // 你可以传入数值或字符串价格（uiAmount），底层会根据资产注册信息自动处理精度转换
  const requirements = await server.buildRequirements({
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: 0.01,
    // 如果需要过滤特定资产，可以使用 assets 字段
    assets: req.query.custom === 'true' ? [ASSET_ADDRESS] : undefined,
  })

  // 2. 将预构建的要求传给 process
  const result = await server.process(req.header('PAYMENT-SIGNATURE'), {
    requirements,
    resourceInfo: { 
      url: 'http://example.com/item-b', 
      description: 'Mode B',
      mimeType: 'application/json'
    },
  })

  if (result.paymentRequiredHeader) res.setHeader('PAYMENT-REQUIRED', result.paymentRequiredHeader)
  if (result.paymentResponseHeader) res.setHeader('PAYMENT-RESPONSE', result.paymentResponseHeader)

  res.status(result.status).json(result.response)
})

/**
 * 方式 C: 原子化控制模式 (Atomic Control Mode)
 *
 * 完全手动控制每一个步骤：解析 -> 验证 -> 结算。
 * 适用于极其复杂的业务逻辑，例如你只想验证签名，但不立即执行结算（推迟结算）。
 */
app.get('/mode-c', async (req, res) => {
  const requirements = await server.buildRequirements({
    scheme: 'exact:eip7702',
    network: EVM_NETWORK,
    price: 0.01,
  })

  const signature = req.header('PAYMENT-SIGNATURE')

  // 1. 解析
  const parsed = (server as any).parse(signature, requirements)
  if (!parsed.success) {
    // 构造 402 响应
    const resourceServer = server.getResourceServer()
    const paymentRequired = resourceServer.createPaymentRequiredResponse(
      requirements,
      { 
        url: 'http://example.com/item-c',
        description: 'Mode C',
        mimeType: 'application/json'
      },
      parsed.error as any,
    )
    res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'))
    return res.status(402).json(paymentRequired)
  }

  const { payload, matching } = parsed.data!

  // 2. 验证
  const verify = await (server as any).verify(payload, matching)
  if (!verify.isValid) {
    return res.status(402).json({ error: 'Verification failed' })
  }

  // 3. 结算 (可选：你可以在这里做一些业务判断再结算)
  const settle = await (server as any).settle(payload, matching)
  if (!settle.success) {
    return res.status(500).json({ error: 'Settlement failed' })
  }

  res.status(200).json({ ok: true, txHash: settle.transaction })
})

async function main(): Promise<void> {
  await server.initialize()
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 Modes Example server listening at http://localhost:${PORT}`)
  })
}

main().catch(console.error)

