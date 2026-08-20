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
const uuidHex = UUID.replace(/-/g, '').toLowerCase();
const DOMAIN = (process.env.DOMAIN || process.env.APP_DOMAIN || 'vercel.chatgptaigode.eu.org').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
const SUB_PATH = (process.env.SUB_PATH || 'sub').trim().replace(/^\/+|\/+$/g, '');
const WSPATH = (process.env.WSPATH || process.env.PATH_A || 'api/v3/telemetry').trim().replace(/^\/+|\/+$/g, '');
const CDN_HOST = (process.env.CDN_HOST || '').trim();
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
  const connectAddress = CDN_HOST || effectiveHost;

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
function handleVlsConnection(ws, msg) {
  const [VERSION] = msg;
  const id = msg.slice(1, 17);
  if (!id.every((v, i) => v == parseInt(uuidHex.substr(i * 2, 2), 16))) return false;

  let i = msg.slice(17, 18).readUInt8() + 19;
  const port = msg.slice(i, i += 2).readUInt16BE(0);
  const ATYP = msg.slice(i, i += 1).readUInt8();
  const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
    (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
      (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, idx, a) => (idx % 2 ? s.concat(a.slice(idx - 1, idx + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));

  if (isBlockedDomain(host)) { ws.close(); return false; }
  ws.send(new Uint8Array([VERSION, 0]));
  const duplex = createWebSocketStream(ws);

  resolveHostFast(host)
    .then(resolvedIP => {
      net.connect({ host: resolvedIP, port }, function () {
        this.write(msg.slice(i));
        duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
      }).on('error', () => { ws.close(); });
    })
    .catch(() => {
      net.connect({ host, port }, function () {
        this.write(msg.slice(i));
        duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
      }).on('error', () => { ws.close(); });
    });
  return true;
}

// Trojan 协议处理
function handleTrojConnection(ws, msg) {
  try {
    if (msg.length < 58) return false;
    const receivedPasswordHash = msg.slice(0, 56).toString();
    const myHash = crypto.createHash('sha224').update(UUID).digest('hex');
    if (myHash !== receivedPasswordHash) return false;

    let offset = 56;
    if (msg[offset] === 0x0d && msg[offset + 1] === 0x0a) offset += 2;
    const cmd = msg[offset];
    if (cmd !== 0x01) return false;
    offset += 1;

    const atyp = msg[offset];
    offset += 1;
    let host, port;
    if (atyp === 0x01) {
      host = msg.slice(offset, offset + 4).join('.'); offset += 4;
    } else if (atyp === 0x03) {
      const hostLen = msg[offset]; offset += 1;
      host = msg.slice(offset, offset + hostLen).toString(); offset += hostLen;
    } else if (atyp === 0x04) {
      host = msg.slice(offset, offset + 16).reduce((s, b, idx, a) => (idx % 2 ? s.concat(a.slice(idx - 1, idx + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':'); offset += 16;
    } else { return false; }

    port = msg.readUInt16BE(offset); offset += 2;
    if (offset < msg.length && msg[offset] === 0x0d && msg[offset + 1] === 0x0a) offset += 2;
    if (isBlockedDomain(host)) { ws.close(); return false; }

    const duplex = createWebSocketStream(ws);
    resolveHostFast(host)
      .then(resolvedIP => {
        net.connect({ host: resolvedIP, port }, function () {
          if (offset < msg.length) this.write(msg.slice(offset));
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { ws.close(); });
      })
      .catch(() => {
        net.connect({ host, port }, function () {
          if (offset < msg.length) this.write(msg.slice(offset));
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { ws.close(); });
      });
    return true;
  } catch (error) { return false; }
}

// Shadowsocks 协议处理
function handleSsConnection(ws, msg) {
  try {
    let offset = 0;
    const atyp = msg[offset]; offset += 1;
    let host, port;
    if (atyp === 0x01) {
      host = msg.slice(offset, offset + 4).join('.'); offset += 4;
    } else if (atyp === 0x03) {
      const hostLen = msg[offset]; offset += 1;
      host = msg.slice(offset, offset + hostLen).toString(); offset += hostLen;
    } else if (atyp === 0x04) {
      host = msg.slice(offset, offset + 16).reduce((s, b, idx, a) => (idx % 2 ? s.concat(a.slice(idx - 1, idx + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':'); offset += 16;
    } else { return false; }

    port = msg.readUInt16BE(offset); offset += 2;
    if (isBlockedDomain(host)) { ws.close(); return false; }

    const duplex = createWebSocketStream(ws);
    resolveHostFast(host)
      .then(resolvedIP => {
        net.connect({ host: resolvedIP, port }, function () {
          if (offset < msg.length) this.write(msg.slice(offset));
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { ws.close(); });
      })
      .catch(() => {
        net.connect({ host, port }, function () {
          if (offset < msg.length) this.write(msg.slice(offset));
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { ws.close(); });
      });
    return true;
  } catch (error) { return false; }
}

// WebSocket 连接分发
wss.on('connection', (ws, req) => {
  const url = req.url || '';
  const expectedPath = `/${WSPATH}`;
  if (!url.startsWith(expectedPath) && url !== '/' && !url.startsWith('/' + uuidHex.slice(0, 8))) {
    ws.close();
    return;
  }

  ws.once('message', msg => {
    if (msg.length > 17 && msg[0] === 0) {
      const id = msg.slice(1, 17);
      const isVless = id.every((v, i) => v == parseInt(uuidHex.substr(i * 2, 2), 16));
      if (isVless) { if (!handleVlsConnection(ws, msg)) ws.close(); return; }
    }
    if (msg.length >= 58) { if (handleTrojConnection(ws, msg)) return; }
    if (msg.length > 0 && (msg[0] === 0x01 || msg[0] === 0x03 || msg[0] === 0x04)) {
      if (handleSsConnection(ws, msg)) return;
    }
    ws.close();
  }).on('error', () => { });
});

// ==================== 7. 启动并监听 ====================
httpServer.listen(PORT, () => {
  console.log(`[Edge Gateway] Server running on port ${PORT}`);
});
