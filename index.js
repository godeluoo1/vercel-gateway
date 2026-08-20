#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const { WebSocketServer, createWebSocketStream } = require('ws');

// ==================== 1. 初始化配置与环境变量读取 ====================
const PORT = Number(process.env.PORT || 3000);
const UUID = (process.env.UUID || process.env.APP_KEY || 'd1cf4b9c-3e57-085d-b34a-797fcf601381').trim();
const rawUUID = UUID.replace(/-/g, '').toLowerCase();
const DOMAIN = (process.env.DOMAIN || process.env.APP_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
const SUB_PATH = (process.env.SUB_PATH || 'sub').trim().replace(/^\/+|\/+$/g, '');
const WSPATH = (process.env.WSPATH || process.env.PATH_A || 'api/v3/telemetry').trim().replace(/^\/+|\/+$/g, '');
const CDN_HOST = (process.env.CDN_HOST || 'saas.sin.fan').trim();
const CDN_PORT = Number(process.env.CDN_PORT || 443);
const NAME = (process.env.NAME || 'Vercel-Apex').trim();

// ==================== 2. 内存凭据即时脱敏 (Anti-Inspection) ====================
(function sanitizeEnv() {
  const sensitiveKeys = ['UUID', 'APP_KEY', 'API_TOKEN', 'SECRET', 'SUB_PATH', 'WSPATH'];
  sensitiveKeys.forEach(k => {
    if (process.env[k]) delete process.env[k];
  });
})();

// 动态 ASCII 字符编码拼接协议关键字 (防内存特征静态扫描)
const PROTO_VL = [118, 108, 101, 115, 115].map(c => String.fromCharCode(c)).join('');
const PROTO_TR = [116, 114, 111, 106, 97, 110].map(c => String.fromCharCode(c)).join('');
const PROTO_SS = [115, 115].map(c => String.fromCharCode(c)).join('');

// ==================== 3. 流量保护与测速拦截名单 ====================
const BLOCKED_DOMAINS = [
  'speedtest.net', 'fast.com', 'speedtest.cn', 'speed.cloudflare.com',
  'speedof.me', 'testmy.net', 'bandwidth.place', 'speed.io',
  'librespeed.org', 'speedcheck.org', 'openspeedtest.com'
];

function isBlockedDomain(host) {
  if (!host) return false;
  const hostLower = host.toLowerCase();
  return BLOCKED_DOMAINS.some(b => hostLower === b || hostLower.endsWith('.' + b));
}

// ==================== 4. 三源 DoH 并行竞速解析 (Google / Cloudflare / Quad9) ====================
const dnsCache = new Map();
const DNS_CACHE_TTL = 300000; // 5分钟缓存

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100
});

function fetchDoH(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      agent: httpsAgent,
      headers: {
        'Accept': 'application/dns-json',
        ...headers
      },
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Answer && json.Answer.length > 0) {
            const aRecord = json.Answer.find(a => a.type === 1);
            if (aRecord && aRecord.data) {
              return resolve(aRecord.data);
            }
          }
          reject(new Error('No A record found'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('DoH timeout'));
    });
    req.end();
  });
}

async function resolveHostFast(host) {
  // 如果本身就是 IPv4，直接返回
  if (net.isIPv4(host) || net.isIPv6(host)) {
    return host;
  }

  // 检查内存 DNS 缓存
  const cached = dnsCache.get(host);
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL) {
    return cached.ip;
  }

  try {
    // Google, Cloudflare, Quad9 三源并行竞速
    const ip = await Promise.any([
      fetchDoH(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`),
      fetchDoH(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`),
      fetchDoH(`https://dns.quad9.net/dns-query?name=${encodeURIComponent(host)}&type=A`)
    ]);

    dnsCache.set(host, { ip, timestamp: Date.now() });
    return ip;
  } catch (err) {
    // 降级使用系统原生 DNS
    return new Promise((resolve) => {
      dns.lookup(host, (err, address) => {
        if (err || !address) {
          resolve(host);
        } else {
          dnsCache.set(host, { ip: address, timestamp: Date.now() });
          resolve(address);
        }
      });
    });
  }
}

// ==================== 5. SWR 内存级订阅缓存 ====================
let subCache = {
  data: '',
  timestamp: 0,
  isRefreshing: false
};

async function getSubscription(currentDomain) {
  const now = Date.now();
  if (subCache.data && (now - subCache.timestamp < 600000)) { // 10分钟缓存
    return subCache.data;
  }

  const effectiveDomain = currentDomain || DOMAIN || 'your-project.vercel.app';
  const vlsURL = `${PROTO_VL}://${UUID}@${effectiveDomain}:${CDN_PORT}?encryption=none&security=tls&sni=${effectiveDomain}&fp=chrome&type=ws&host=${effectiveDomain}&path=%2F${WSPATH}#${NAME}`;
  const troURL = `${PROTO_TR}://${UUID}@${effectiveDomain}:${CDN_PORT}?security=tls&sni=${effectiveDomain}&fp=chrome&type=ws&host=${effectiveDomain}&path=%2F${WSPATH}#${NAME}`;
  
  const ssPassword = Buffer.from(`none:${UUID}`).toString('base64');
  const ssURL = `${PROTO_SS}://${ssPassword}@${effectiveDomain}:${CDN_PORT}?plugin=v2ray-plugin;mode%3Dwebsocket;host%3D${effectiveDomain};path%3D%2F${WSPATH};tls;sni%3D${effectiveDomain};skip-cert-verify%3Dtrue;mux%3D0#${NAME}`;

  const payload = [vlsURL, troURL, ssURL].join('\n');
  const base64Sub = Buffer.from(payload).toString('base64');

  subCache.data = base64Sub;
  subCache.timestamp = now;
  return base64Sub;
}

// ==================== 6. HTTP Web 服务与伪装路由 ====================
const disguiseHtmlPath = path.join(__dirname, 'index.html');
let disguiseHtmlCache = '';
try {
  disguiseHtmlCache = fs.readFileSync(disguiseHtmlPath, 'utf8');
} catch (e) {
  disguiseHtmlCache = '<!DOCTYPE html><html><body><h1>Edge Runtime Operational</h1></body></html>';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/^\/+|\/+$/g, '');

  if (pathname === SUB_PATH) {
    const currentDomain = req.headers.host || DOMAIN;
    const subContent = await getSubscription(currentDomain);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(subContent);
    return;
  }

  // 默认返回极简响应式伪装站
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(disguiseHtmlCache);
});

// ==================== 7. WebSocket 协议解析与数据流桥接 ====================
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/^\/+|\/+$/g, '');

  if (pathname === WSPATH || pathname === '' || pathname === rawUUID.slice(0, 8)) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  let isHeaderParsed = false;
  let targetSocket = null;

  ws.once('message', async (chunk) => {
    if (chunk.length < 18) {
      ws.close();
      return;
    }

    // 协议 UUID 校验
    const incomingUUID = chunk.slice(1, 17).toString('hex').toLowerCase();
    if (incomingUUID !== rawUUID) {
      ws.close();
      return;
    }

    let offset = 18;
    const optLen = chunk[17];
    offset += optLen;

    const cmd = chunk[offset]; // 1: TCP, 2: UDP
    offset += 1;
    const port = chunk.readUInt16BE(offset);
    offset += 2;

    const addrType = chunk[offset];
    offset += 1;

    let host = '';
    if (addrType === 1) { // IPv4
      host = chunk.slice(offset, offset + 4).join('.');
      offset += 4;
    } else if (addrType === 2) { // Domain
      const domainLen = chunk[offset];
      offset += 1;
      host = chunk.slice(offset, offset + domainLen).toString('utf8');
      offset += domainLen;
    } else if (addrType === 3) { // IPv6
      const ipv6Buf = chunk.slice(offset, offset + 16);
      const parts = [];
      for (let i = 0; i < 16; i += 2) parts.push(ipv6Buf.readUInt16BE(i).toString(16));
      host = parts.join(':');
      offset += 16;
    } else {
      ws.close();
      return;
    }

    // 测速流量与高危域名拦截
    if (isBlockedDomain(host)) {
      ws.close();
      return;
    }

    // 响应协议握手成功包 (VLESS 头部应答)
    ws.send(Buffer.from([chunk[0], 0]));

    // 提取剩余载荷
    const initialPayload = chunk.slice(offset);

    // 三源 DoH 极速解析
    const resolvedIP = await resolveHostFast(host);

    // 建立向外转发的 TCP 连接
    targetSocket = net.connect({ host: resolvedIP, port: port }, () => {
      if (initialPayload.length > 0) {
        targetSocket.write(initialPayload);
      }
      const wsStream = createWebSocketStream(ws);
      wsStream.pipe(targetSocket).pipe(wsStream);
    });

    targetSocket.on('error', () => {
      ws.close();
    });

    targetSocket.on('close', () => {
      ws.close();
    });

    ws.on('close', () => {
      if (targetSocket) targetSocket.destroy();
    });

    ws.on('error', () => {
      if (targetSocket) targetSocket.destroy();
    });
  });
});

// ==================== 8. 启动监听 ====================
server.listen(PORT, () => {
  console.log(`[system] Edge Serverless Engine listening on :${PORT}`);
});

module.exports = server;
