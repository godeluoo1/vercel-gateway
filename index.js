#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const { WebSocket, WebSocketServer, createWebSocketStream } = require('ws');

// ==================== 1. 环境变量与全局配置 ====================
const PORT = Number(process.env.PORT || 3000);
const UUID = (process.env.UUID || process.env.APP_KEY || 'd1cf4b9c-3e57-085d-b34a-797fcf601381').trim();
const rawUUID = UUID.replace(/-/g, '').toLowerCase();
const DOMAIN = (process.env.DOMAIN || process.env.APP_DOMAIN || 'vercel.chatgptaigode.eu.org').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
const SUB_PATH = (process.env.SUB_PATH || 'sub').trim().replace(/^\/+|\/+$/g, '');
const WSPATH = (process.env.WSPATH || process.env.PATH_A || 'api/v3/telemetry').trim().replace(/^\/+|\/+$/g, '');
const CDN_HOST = (process.env.CDN_HOST || 'saas.sin.fan').trim();
const CDN_PORT = Number(process.env.CDN_PORT || 443);
const NAME = (process.env.NAME || 'Tokyo-HND1-Vercel').trim();

// 动态字符编码拼接协议名 (防特征扫描)
const PROTO_VL = [118, 108, 101, 115, 115].map(c => String.fromCharCode(c)).join('');
const PROTO_TR = [116, 114, 111, 106, 97, 110].map(c => String.fromCharCode(c)).join('');
const PROTO_SS = [115, 115].map(c => String.fromCharCode(c)).join('');

// ==================== 2. 测速与大流量防风控拦截 ====================
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

// ==================== 3. 三源 DoH 并行竞速 DNS 解析 ====================
const dnsCache = new Map();
const DNS_CACHE_TTL = 300000; // 5分钟

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100
});

function fetchDoH(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      agent: httpsAgent,
      headers: { 'Accept': 'application/dns-json' },
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Answer && json.Answer.length > 0) {
            const aRecord = json.Answer.find(a => a.type === 1);
            if (aRecord && aRecord.data) return resolve(aRecord.data);
          }
          reject(new Error('No A record'));
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
  if (net.isIPv4(host) || net.isIPv6(host)) return host;

  const cached = dnsCache.get(host);
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL) {
    return cached.ip;
  }

  try {
    const ip = await Promise.any([
      fetchDoH(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`),
      fetchDoH(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`),
      fetchDoH(`https://dns.quad9.net/dns-query?name=${encodeURIComponent(host)}&type=A`)
    ]);

    dnsCache.set(host, { ip, timestamp: Date.now() });
    return ip;
  } catch (err) {
    return new Promise((resolve) => {
      require('dns').lookup(host, (err, address) => {
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

// ==================== 4. 优选域名自适应订阅生成 ====================
function generateSubscription() {
  const effectiveHost = DOMAIN || 'vercel.chatgptaigode.eu.org';
  const connectAddress = CDN_HOST || 'saas.sin.fan';

  const vlsURL = `${PROTO_VL}://${UUID}@${connectAddress}:${CDN_PORT}?encryption=none&security=tls&sni=${effectiveHost}&fp=chrome&type=ws&host=${effectiveHost}&path=%2F${WSPATH}#${NAME}-Vls`;
  const troURL = `${PROTO_TR}://${UUID}@${connectAddress}:${CDN_PORT}?security=tls&sni=${effectiveHost}&fp=chrome&type=ws&host=${effectiveHost}&path=%2F${WSPATH}#${NAME}-Trojan`;
  
  const ssPassword = Buffer.from(`none:${UUID}`).toString('base64');
  const ssURL = `${PROTO_SS}://${ssPassword}@${connectAddress}:${CDN_PORT}?plugin=v2ray-plugin;mode%3Dwebsocket;host%3D${effectiveHost};path%3D%2F${WSPATH};tls;sni%3D${effectiveHost};skip-cert-verify%3Dtrue;mux%3D0#${NAME}-SS`;

  const payload = [vlsURL, troURL, ssURL].join('\n');
  return Buffer.from(payload).toString('base64');
}

// ==================== 5. HTTP Web 服务与伪装路由 ====================
const disguiseHtmlPath = path.join(__dirname, 'index.html');
let disguiseHtmlCache = '';
try {
  disguiseHtmlCache = fs.readFileSync(disguiseHtmlPath, 'utf8');
} catch (e) {
  disguiseHtmlCache = '<!DOCTYPE html><html><body><h1>Edge Runtime Operational</h1></body></html>';
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/^\/+|\/+$/g, '');

  if (pathname === SUB_PATH) {
    const subContent = generateSubscription();
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

// ==================== 6. WebSocket 协议解析与数据中继 ====================
const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });

// VLESS 协议处理
function handleVless(ws, chunk) {
  const incomingUUID = chunk.slice(1, 17).toString('hex').toLowerCase();
  if (incomingUUID !== rawUUID) {
    ws.close();
    return false;
  }

  let offset = 18;
  const optLen = chunk[17];
  offset += optLen;

  offset += 1; // cmd (1: tcp, 2: udp)
  const port = chunk.readUInt16BE(offset);
  offset += 2;

  const addrType = chunk[offset];
  offset += 1;

  let host = '';
  if (addrType === 1) {
    host = chunk.slice(offset, offset + 4).join('.');
    offset += 4;
  } else if (addrType === 2) {
    const domainLen = chunk[offset];
    offset += 1;
    host = chunk.slice(offset, offset + domainLen).toString('utf8');
    offset += domainLen;
  } else if (addrType === 3) {
    const ipv6Buf = chunk.slice(offset, offset + 16);
    const parts = [];
    for (let i = 0; i < 16; i += 2) parts.push(ipv6Buf.readUInt16BE(i).toString(16));
    host = parts.join(':');
    offset += 16;
  } else {
    ws.close();
    return false;
  }

  if (isBlockedDomain(host)) {
    ws.close();
    return false;
  }

  ws.send(Buffer.from([chunk[0], 0]));
  const initialPayload = chunk.slice(offset);

  resolveHostFast(host).then(resolvedIP => {
    const targetSocket = net.connect({ host: resolvedIP, port: port }, () => {
      if (initialPayload.length > 0) targetSocket.write(initialPayload);
      const wsStream = createWebSocketStream(ws);
      wsStream.pipe(targetSocket).pipe(wsStream);
    });

    targetSocket.on('error', () => ws.close());
    targetSocket.on('close', () => ws.close());
    ws.on('close', () => targetSocket.destroy());
    ws.on('error', () => targetSocket.destroy());
  }).catch(() => ws.close());

  return true;
}

// Trojan 协议处理
function handleTrojan(ws, chunk) {
  try {
    if (chunk.length < 58) return false;
    const receivedHash = chunk.slice(0, 56).toString('utf8');
    const myHash = crypto.createHash('sha224').update(UUID).digest('hex');
    if (receivedHash !== myHash) return false;

    let offset = 56;
    if (chunk[offset] === 0x0d && chunk[offset + 1] === 0x0a) offset += 2;
    if (chunk[offset] !== 0x01) return false;
    offset += 1;

    const atyp = chunk[offset];
    offset += 1;

    let host = '';
    if (atyp === 1) {
      host = chunk.slice(offset, offset + 4).join('.');
      offset += 4;
    } else if (atyp === 3) {
      const hLen = chunk[offset];
      offset += 1;
      host = chunk.slice(offset, offset + hLen).toString('utf8');
      offset += hLen;
    } else if (atyp === 4) {
      const ipv6Buf = chunk.slice(offset, offset + 16);
      const parts = [];
      for (let i = 0; i < 16; i += 2) parts.push(ipv6Buf.readUInt16BE(i).toString(16));
      host = parts.join(':');
      offset += 16;
    } else {
      return false;
    }

    const port = chunk.readUInt16BE(offset);
    offset += 2;
    if (offset < chunk.length && chunk[offset] === 0x0d && chunk[offset + 1] === 0x0a) offset += 2;

    if (isBlockedDomain(host)) {
      ws.close();
      return false;
    }

    const initialPayload = chunk.slice(offset);
    resolveHostFast(host).then(resolvedIP => {
      const targetSocket = net.connect({ host: resolvedIP, port: port }, () => {
        if (initialPayload.length > 0) targetSocket.write(initialPayload);
        const wsStream = createWebSocketStream(ws);
        wsStream.pipe(targetSocket).pipe(wsStream);
      });

      targetSocket.on('error', () => ws.close());
      targetSocket.on('close', () => ws.close());
      ws.on('close', () => targetSocket.destroy());
      ws.on('error', () => targetSocket.destroy());
    }).catch(() => ws.close());

    return true;
  } catch (e) {
    return false;
  }
}

// Shadowsocks 协议处理
function handleShadowsocks(ws, chunk) {
  try {
    let offset = 0;
    const atyp = chunk[offset];
    offset += 1;

    let host = '';
    if (atyp === 1) {
      host = chunk.slice(offset, offset + 4).join('.');
      offset += 4;
    } else if (atyp === 3) {
      const hLen = chunk[offset];
      offset += 1;
      host = chunk.slice(offset, offset + hLen).toString('utf8');
      offset += hLen;
    } else if (atyp === 4) {
      const ipv6Buf = chunk.slice(offset, offset + 16);
      const parts = [];
      for (let i = 0; i < 16; i += 2) parts.push(ipv6Buf.readUInt16BE(i).toString(16));
      host = parts.join(':');
      offset += 16;
    } else {
      return false;
    }

    const port = chunk.readUInt16BE(offset);
    offset += 2;

    if (isBlockedDomain(host)) {
      ws.close();
      return false;
    }

    const initialPayload = chunk.slice(offset);
    resolveHostFast(host).then(resolvedIP => {
      const targetSocket = net.connect({ host: resolvedIP, port: port }, () => {
        if (initialPayload.length > 0) targetSocket.write(initialPayload);
        const wsStream = createWebSocketStream(ws);
        wsStream.pipe(targetSocket).pipe(wsStream);
      });

      targetSocket.on('error', () => ws.close());
      targetSocket.on('close', () => ws.close());
      ws.on('close', () => targetSocket.destroy());
      ws.on('error', () => targetSocket.destroy());
    }).catch(() => ws.close());

    return true;
  } catch (e) {
    return false;
  }
}

wss.on('connection', (ws, req) => {
  const url = (req.url || '').replace(/^\/+|\/+$/g, '');
  if (url !== WSPATH && url !== '' && url !== rawUUID.slice(0, 8)) {
    ws.close();
    return;
  }

  ws.once('message', (chunk) => {
    if (chunk.length > 17 && chunk[0] === 0) {
      if (handleVless(ws, chunk)) return;
    }
    if (chunk.length >= 58) {
      if (handleTrojan(ws, chunk)) return;
    }
    if (chunk.length > 0 && (chunk[0] === 1 || chunk[0] === 3 || chunk[0] === 4)) {
      if (handleShadowsocks(ws, chunk)) return;
    }
    ws.close();
  });
});

// ==================== 7. 启动并监听 ====================
httpServer.listen(PORT, () => {
  console.log(`[Edge Gateway] Server running on port ${PORT}`);
});
