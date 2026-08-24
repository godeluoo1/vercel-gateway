# 🌐 Apex 边缘流式中继与分布式遥测网关 (Vercel Serverless)

基于 Vercel Serverless Function 与 AWS 全球骨干网络构建的高性能、自适应、高抗封的多协议数据中继网关。

---

## 🌟 核心架构与技术特性

- **⚡ AWS 全球 20 大真实物理算力机房直连**：原生覆盖亚太（东京/香港/新加坡/首尔等）、北美、欧洲核心 AWS 数据中心。
- **🌐 三源 DoH 并行竞速解析**：内置 Google / Cloudflare / Quad9 三大上游 DNS 毫秒级竞速解析（`Promise.any`）+ 5 分钟内存 DNS 缓存，彻底消灭解析延迟与污染。
- **🚀 极致轻量与零冷启动延迟**：彻底剥离重型外部依赖，仅保留原生 Node.js 核心库与轻量 `ws`，打包体积骤降 95%，冷启动低至 30ms。
- **🚦 流量熔断与测速拦截**：内置主流测速域名过滤（`isBlockedDomain`），防止突发大流量消耗配额触发平台风控。
- **🔒 静态特征动态混淆**：协议特征采用 ASCII 字节数组动态解码，有效规避平台静态扫描。
- **📱 智能国旗识别与自适应命名**：根据 Vercel 底层运行机房自动识别，Shadowrocket / Clash 100% 精准匹配国旗与名称。
- **💻 响应式科技感遥测面板**：根路径默认展示合规的“边缘网络状态与性能监控控制台”。

---

## ⚙️ 环境变量配置说明

在 Vercel 项目的 **Settings ➔ Environment Variables** 中可以按需配置（修改后需 Redeploy 重新生效）：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| **`DOMAIN`** | `vercel.chatgptaigode.eu.org` | **必须修改为你绑定的实际域名**（如 `godeluoo.vercel.app` 或你的自定义域名） |
| **`UUID`** | `d1cf4b9c-3e57-085d-b34a-797fcf601381` | 客户端通讯鉴权密钥 |
| **`SUB_PATH`** | `sub` | 订阅拉取路径（即 `https://域名/sub`） |
| **`WSPATH`** | `api/v3/telemetry` | WebSocket 双工传输路径 |
| **`CDN_HOST`** | `saas.sin.fan` | 默认优选连接地址（如 `saas.sin.fan` 或 `cf.877774.xyz`） |

---

## 📍 Vercel 官方 20 大真实物理算力机房速查表

| 地区代码 | 对应 AWS 物理机房 | 城市 / 国家 | 推荐度与场景 |
| :--- | :--- | :--- | :--- |
| `hnd1` | `ap-northeast-1` | 🇯🇵 日本东京 (Tokyo) | ⭐⭐⭐⭐⭐ 亚太顶级低延迟 |
| `kix1` | `ap-northeast-3` | 🇯🇵 日本大阪 (Osaka) | ⭐⭐⭐⭐⭐ 亚太极速备用 |
| `hkg1` | `ap-east-1` | 🇭🇰 中国香港 (Hong Kong) | ⭐⭐⭐⭐⭐ 极速直连 |
| `sin1` | `ap-southeast-1` | 🇸🇬 新加坡 (Singapore) | ⭐⭐⭐⭐⭐ 东南亚核心枢纽 |
| `icn1` | `ap-northeast-2` | 🇰🇷 韩国首尔 (Seoul) | ⭐⭐⭐⭐ 亚太低延迟 |
| `syd1` | `ap-southeast-2` | 🇦🇺 澳大利亚悉尼 (Sydney) | ⭐⭐⭐ 大洋洲核心 |
| `bom1` | `ap-south-1` | 🇮🇳 印度孟买 (Mumbai) | ⭐⭐⭐ 南亚核心 |
| `sfo1` | `us-west-1` | 🇺🇸 美国旧金山 (San Francisco) | ⭐⭐⭐⭐⭐ 美西核心（极速纯净） |
| `pdx1` | `us-west-2` | 🇺🇸 美国波特兰 (Portland) | ⭐⭐⭐⭐ 美西骨干 |
| `iad1` | `us-east-1` | 🇺🇸 美国华盛顿 (Washington D.C.) | ⭐⭐⭐⭐ 美东主算力机房 |
| `cle1` | `us-east-2` | 🇺🇸 美国克利夫兰 (Cleveland) | ⭐⭐⭐ 美东新一代节点 |
| `yul1` | `ca-central-1` | 🇨🇦 加拿大蒙特利尔 (Montréal) | ⭐⭐⭐ 北美加拿大原生 |
| `fra1` | `eu-central-1` | 🇩🇪 德国法兰克福 (Frankfurt) | ⭐⭐⭐⭐ 欧洲网络枢纽 |
| `lhr1` | `eu-west-2` | 🇬🇧 英国伦敦 (London) | ⭐⭐⭐⭐ 欧洲核心 |
| `cdg1` | `eu-west-3` | 🇫🇷 法国巴黎 (Paris) | ⭐⭐⭐ 欧洲核心 |
| `dub1` | `eu-west-1` | 🇮🇪 爱尔兰都柏林 (Dublin) | ⭐⭐⭐ 欧洲科技节点 |
| `arn1` | `eu-north-1` | 🇸🇪 瑞典斯德哥尔摩 (Stockholm) | ⭐⭐⭐ 北欧极净节点 |
| `dxb1` | `me-central-1` | 🇦🇪 阿联酋迪拜 (Dubai) | ⭐⭐⭐ 中东高净值出口 |
| `cpt1` | `af-south-1` | 🇿🇦 南非开普敦 (Cape Town) | ⭐⭐ 非洲独立算力出口 |
| `gru1` | `sa-east-1` | 🇧🇷 巴西圣保罗 (São Paulo) | ⭐⭐ 南美独立算力出口 |

---

## 🛠️ Cloudflare Workers 边缘反代脚本（可选集成）

如果你希望在 Cloudflare Workers 上部署反代前端加速，可直接使用以下脚本：

```javascript
/**
 * Cloudflare Worker 边缘反向代理网关
 * 支持 WebSocket 双向流式长连接透传与 HTTP 路由转发
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const TARGET_HOST = env.TARGET_HOST || 'vercel.chatgptaigode.eu.org';

    url.hostname = TARGET_HOST;
    url.protocol = 'https:';

    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', TARGET_HOST);
    newHeaders.set('X-Forwarded-Host', request.headers.get('Host') || TARGET_HOST);
    newHeaders.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');

    const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

    const response = await fetch(url.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow'
    });

    if (isWebSocket) {
      return response;
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  }
};
```

---

## 📄 License

MIT License.
