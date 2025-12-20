# x402x-react

X402 支付协议的 React Hooks SDK。支持最新的 V2 协议（多阶段交互、动态参数、自动探测），并兼容 V1 协议。

## 安装

```bash
pnpm add x402x-react @tanstack/react-query viem
```

## 核心 Hook：useX402Payment (V2 最新版)

重构后的 Hook 采用“动作驱动”设计，将支付流程拆分为：**探测 (Load)** -> **选择 (Select)** -> **执行 (Pay)**。

### 场景一：自动探测 (基础用法)

适用于固定金额或进入页面即需要展示支付信息的场景。

```tsx
import { useX402Payment } from 'x402x-react';

function SimplePaywall() {
  const { 
    accepts, 
    accepted, 
    setAccepted, 
    pay, 
    isLoading 
  } = useX402Payment({
    url: '/api/premium-content',
    walletClient,
    enabled: true, // 页面加载时自动探测支付需求
  });

  if (isLoading && !accepts.length) return <p>正在获取价格...</p>;

  return (
    <div>
      {accepts.map(opt => (
        <button key={opt.asset} onClick={() => setAccepted(opt)}>
          使用 {opt.scheme} 支付 {opt.amount}
        </button>
      ))}
      <button onClick={() => pay()}>立即支付</button>
    </div>
  );
}
```

### 场景二：动态参数 & 手动触发 (最佳实践)

适用于商品列表、自定义打赏或需要先输入参数再获取价格的场景。

```tsx
function DynamicProduct({ productId }) {
  const { 
    load,     // 手动触发探测
    pay,      // 执行支付
    accepts, 
    accepted,
    setAccepted,
    isReady,  // 是否已获取到方案
    isLoading 
  } = useX402Payment({
    url: '/api/checkout',
    enabled: false, // 初始不加载，等待用户点击
    walletClient,
    onSuccess: async (res) => {
      const content = await res.json();
      alert('支付成功！');
    }
  });

  // 第一步：点击购买，动态传递商品信息
  const handleBuy = async () => {
    try {
      await load({
        method: 'POST',
        body: JSON.stringify({ productId, quantity: 1 })
      });
    } catch (e) {
      console.error('无法获取支付方案', e);
    }
  };

  // 第二步：展示支付确认弹窗
  if (isReady) {
    return (
      <div className="modal">
        <h3>确认支付</h3>
        <p>商品 ID: {productId}</p>
        <select onChange={(e) => setAccepted(accepts[e.target.selectedIndex])}>
          {accepts.map(a => <option key={a.asset}>{a.amount} {a.asset}</option>)}
        </select>
        <button onClick={() => pay()}>确认付款</button>
      </div>
    );
  }

  return <button onClick={handleBuy} disabled={isLoading}>购买</button>;
}
```

---

### API 参考 (V2)

#### 参数 `UseX402PaymentOptions`

| 属性 | 类型 | 必填 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `url` | `string` | 是 | - | 目标资源接口。 |
| `walletClient` | `WalletClient` | 否 | - | 用于签名的 Viem 钱包实例。 |
| `enabled` | `boolean` | 否 | `true` | 是否在挂载或 URL 改变时自动调用 `load()`。 |
| `init` | `RequestInit` | 否 | - | 基础 Fetch 配置。 |
| `onSuccess` | `Function` | 否 | - | 支付成功后的数据处理回调。 |

#### 返回值说明

*   **动作 (Actions)**:
    *   `load(dynamicInit?)`: 触发服务器探测。可覆盖初始的 `init` 配置（如动态 Body/Header）。返回 `Promise<PaymentRequired>`。
    *   `pay(override?)`: 执行签名与支付。支持临时覆盖：`pay({ amount: '5.0' })`。
    *   `setAccepted(option)`: 手动切换选中的支付方案。
*   **状态 (State)**:
    *   `accepts`: 服务器支持的所有支付方案列表。
    *   `accepted`: 当前选中的方案。
    *   `isReady`: `boolean`，是否已经获取到有效的支付方案。
    *   `isLoading`: `boolean`，探测中或支付中。
    *   `error`: 捕获到的任何阶段的错误。

---

## 兼容性说明

V1 版本的 Hook 已迁移至独立导出：

```tsx
import { useX402PaymentV1 } from 'x402x-react';

// 使用方式保持不变，主要用于维护旧版 x402x-fetch 项目
```
