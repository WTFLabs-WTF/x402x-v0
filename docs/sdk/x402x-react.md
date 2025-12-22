# @x402x/x402x-react SDK 指南 (V2)

`@x402x/x402x-react` 采用“动作驱动”设计，将流程拆分为：**探测 (Load)** -> **选择 (Select)** -> **执行 (Pay)**。

## 1. 场景一：自动探测 (基础用法)

当 `enabled: true`（默认）时，Hook 会在挂载时自动对 `url` 发起探测。适用于进入页面就必须展示价格并引导支付的场景。

```tsx
import { useX402Payment } from 'x402x-react';

function SimplePaywall() {
  const { 
    accepts,      // 探测到的所有支付方案 (如 USDC, USDT)
    accepted,     // 当前选中的方案
    setAccepted,  // 切换方案
    pay,          // 执行签名并提交
    isLoading,    // 探测中或支付签名中
    isReady       // 是否已获取到有效的支付方案
  } = useX402Payment({
    url: '/api/premium-content',
    walletClient,
    enabled: true, // 页面挂载时自动探测
  });

  // 1. 正在获取方案时
  if (isLoading && !isReady) return <p>正在获取最新价格...</p>;

  // 2. 获取到方案后，展示拦截 UI
  if (isReady) {
    return (
      <div className="paywall">
        <h3>确认支付以继续阅读</h3>
        <p>价格: {accepted?.amount} {accepted?.asset}</p>
        <button onClick={() => pay()} disabled={isLoading}>
          {isLoading ? '请在钱包签名...' : '立即支付'}
        </button>
      </div>
    );
  }

  return <div>资源加载中...</div>;
}
```

## 2. 场景二：手动触发 & 动态参数

适用于商品列表或需要先输入表单再计算价格的场景。通过 `load()` 动态传递请求参数。

```tsx
function DynamicCheckout({ productId }) {
  const { load, pay, isReady, accepted, isLoading } = useX402Payment({
    url: '/api/order',
    enabled: false, // 初始不探测
    walletClient,
  });

  const handleBuy = async () => {
    // 动态传递参数触发探测
    await load({
      method: 'POST',
      body: JSON.stringify({ productId, count: 1 })
    });
  };

  return (
    <div>
      {!isReady ? (
        <button onClick={handleBuy} disabled={isLoading}>立即购买</button>
      ) : (
        <button onClick={() => pay()}>确认支付 {accepted.amount}</button>
      )}
    </div>
  );
}
```

## 3. 完整 API 参考

### 参数 `UseX402PaymentOptions`

| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `url` | `string` | 必须。目标受限资源的 URL。 |
| `walletClient` | `WalletClient` | 必须。用于签名的 viem 钱包实例。 |
| `enabled` | `boolean` | 默认 `true`。是否在挂载时自动执行 `load()`。 |
| `init` | `RequestInit` | 初始的 fetch 配置。 |
| `onSuccess` | `Function` | 支付成功后的回调。 |

### 返回值说明

- **`load(dynamicInit?)`**: 触发探测。返回 `Promise<PaymentRequired>`。
- **`pay(override?)`**: 弹出钱包签名并提交结算。
- **`isReady`**: 是否已经拿到了支付方案。
- **`accepts`**: 数组。包含所有可用的支付资产和金额。
- **`accepted`**: 当前选中的支付方案对象。

## 4. 注意事项
- 必须在 `QueryClientProvider` 下运行。
- V1 兼容版本请使用 `import { useX402PaymentV1 }`。
