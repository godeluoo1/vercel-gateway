# 🌐 Apex 边缘流式中继与分布式遥测网关 (Vercel Serverless)

基于 Vercel Serverless Function 与 AWS 全球骨干网络构建的高性能、自适应、高抗封的多协议数据中继网关。

---

## 🌟 核心架构与技术特性

- **⚡ AWS 日本东京顶级低延迟**：原生锁定 `hnd1`（日本东京）机房，广州/华南实测仅 **110ms ~ 124ms**。
- **🌐 三源 DoH 并行竞速解析**：内置 Google / Cloudflare / Quad9 三大上游 DNS 毫秒级竞速解析（`Promise.any`），杜绝 DNS 污染。
- **🛡️ 运行时内存即时脱敏**：启动后即刻清空环境变量与敏感凭据，杜绝容器探针嗅探。
- **🚦 流量熔断与测速拦截**：内置主流测速域名过滤（`isBlockedDomain`），防止瞬间大突发并发消耗配额被平台风控。
- **🔒 协议特征动态编码**：关键协议名均采用 ASCII 字节数组动态还原，静态扫描无法识别特征。
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
| **`NAME`** | `Tokyo-HND1-Vercel` | 节点显示名称前缀 |

---

## 📍 Vercel 全球机房地区代码速查表

修改 `vercel.json` 中的 `"regions": ["机房代码"]` 即可自由切换机房（推荐根据所在地理位置选择）：

地区代码	城市/区域	国家/地区	中文说明
hnd1	Tokyo	Japan	日本东京
kix1	Osaka	Japan	日本大阪
icn1	Seoul	South Korea	韩国首尔
hkg1	Hong Kong	Hong Kong	中国香港
sin1	Singapore	Singapore	新加坡
syd1	Sydney	Australia	澳大利亚悉尼
bom1	Mumbai	India	印度孟买
del1	New Delhi	India	印度新德里
fra1	Frankfurt	Germany	德国法兰克福
lhr1	London	United Kingdom	英国伦敦
cdg1	Paris	France	法国巴黎
ams1	Amsterdam	Netherlands	荷兰阿姆斯特丹
mad1	Madrid	Spain	西班牙马德里
dub1	Dublin	Ireland	爱尔兰都柏林
dxb1	Dubai	United Arab Emirates	阿联酋迪拜
jnb1	Johannesburg	South Africa	南非约翰内斯堡
cpt1	Cape Town	South Africa	南非开普敦
gru1	São Paulo	Brazil	巴西圣保罗
sfo1	San Francisco	United States	美国旧金山
iad1	Washington, D.C.	United States	美国华盛顿特区
pdx1	Portland	United States	美国波特兰
mia1	Miami	United States	美国迈阿密
ewr1	Newark	United States	美国纽瓦克
yul1	Montréal	Canada	加拿大蒙特利尔
---

## 🛠️ Cloudflare Workers 边缘反代脚本（可选集成）

如果你希望在 Cloudflare Workers 上部署一个反代前端，将流量转发给 Vercel，可在 Cloudflare Worker 中直接粘贴以下完整脚本：

```javascript
/**
 * Cloudflare Worker 边缘反向代理网关
 * 支持 WebSocket 双向流式长连接透传与 HTTP 路由转发
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. 目标 Vercel 域名（请替换为你的 Vercel 自定义域名或 vercel.app 域名）
    const TARGET_HOST = env.TARGET_HOST || 'vercel.chatgptaigode.eu.org';

    // 2. 重写请求目标
    url.hostname = TARGET_HOST;
    url.protocol = 'https:';

    // 3. 构造转发请求头，保留 WebSocket 升级协议
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', TARGET_HOST);
    newHeaders.set('X-Forwarded-Host', request.headers.get('Host') || TARGET_HOST);
    newHeaders.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');

    const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

    // 4. 执行边缘转发
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow'
    });

    // 5. WebSocket 长连接直通
    if (isWebSocket) {
      return response;
    }

    // 6. 普通 HTTP 响应透传
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

## 🚀 极简快速部署指南

1. 将本仓库导入到你的 **Vercel 控制台**；
2. 构建与输出配置保持默认（Runtime 自动识别为 Node.js）；
3. 在 **Settings ➔ Domains** 中绑定你的域名（如 `vercel.chatgptaigode.eu.org`）；
4. 客户端通过 `https://你的域名/sub` 导入订阅即可享用极速低延迟网络！

---

## 📄 License
MIT License.
