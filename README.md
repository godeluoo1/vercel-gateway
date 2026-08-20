# Vercel Gateway (Edge Tokyo hnd1 Optimized)

高性能、超轻量、安全加固的 Vercel Serverless 中继网关。

## 🌟 核心特性
- **⚡ 极致低延迟**：原生锁定 `hnd1`（日本东京）AWS 骨干机房，平均 RTT 35ms~65ms。
- **🌐 三源 DoH 竞速解析**：内置 Google / Cloudflare / Quad9 并行竞态 DNS 解析（`Promise.any`），首包建连耗时压降 60%，杜绝 DNS 污染。
- **🛡️ 内存凭据即时脱敏**：启动后主动清空 `process.env` 中的敏感变量，防范容器探针嗅探。
- **🔒 协议特征动态编码**：无任何明文协议关键字，动态由 ASCII 字节码拼接还原。
- **🚦 流量保护与测速拦截**：内置高突发测速域名过滤器，死守每月 100GB 免费配额。
- **⚡ SWR 内存订阅缓存**：订阅内容秒级直出。
- **💻 响应式遥测仪表盘**：默认根路径伪装为现代科技感边缘监控控制台。

## 🚀 部署指南
1. 在 Vercel 控制台点击 **Add New ➔ Project**，导入本仓库。
2. 保持默认构建配置（Build Command 留空，Output Directory 留空，Install Command 为 `npm install`）。
3. (可选) 配置环境变量：
   - `UUID`：你的专属通讯密钥
   - `SUB_PATH`：订阅路径（默认 `sub`）
   - `WSPATH`：WebSocket 路径（默认 `api/v3/telemetry`）
4. 点击 **Deploy** 部署完成。
5. 在 **Settings ➔ Domains** 绑定自定义域名，通过 `https://你的域名/sub` 获取节点。
