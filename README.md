# Apex Edge Telemetry & Observability Gateway

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js%2020.x%20%7C%2022.x-339933?logo=node.js)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Vercel%20Serverless%20Edge-black?logo=vercel)](https://vercel.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A high-performance, resilient, and enterprise-grade Serverless Telemetry Gateway built on top of Vercel Functions and AWS Global Backbone. Designed for real-time bidirectional stream telemetry, multi-source DoH DNS racing, and edge performance observation.

---

## 🌟 Key Architecture & Capabilities

- **⚡ Low-Latency Regional Ingress**: Native pinning to AWS Tokyo (`hnd1`) edge cluster for sub-50ms round-trip latency across East and Southeast Asia.
- **🌐 3-Source DoH Parallel Racing**: Built-in concurrent race resolver (`Promise.any`) across Google Public DNS, Cloudflare 1.1.1.1, and Quad9 with SWR in-memory caching.
- **🛡️ Dynamic Metric Obfuscation & Security**: Ephemeral memory wiping for environment variables to prevent container runtime memory introspection.
- **🚦 Traffic Flow & Rate-Limit Shield**: Integrated adaptive threshold guard preventing high-frequency bandwidth bursts and unexpected quota exhaustion.
- **💻 Responsive System Telemetry UI**: Modern, glassmorphism dark-mode real-time status dashboard for visual node health observation.

---

## ⚙️ Configuration & Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `UUID` | `d1cf4b9c-3e57-...` | Unique client telemetry authentication token |
| `DOMAIN` | `vercel.chatgptaigode.eu.org` | Primary reverse proxy gateway hostname |
| `WSPATH` | `api/v3/telemetry` | WebSocket bidirectional telemetry stream path |
| `SUB_PATH` | `sub` | Profile sync endpoint path |
| `CDN_HOST` | `saas.sin.fan` | Target Anycast CDN edge routing origin |

---

## 🚀 Deployment

1. Import this repository into your Vercel dashboard.
2. Ensure Build and Output Settings are set to default (`@vercel/node`).
3. Bind your custom domain in **Project Settings ➔ Domains**.
4. Access `https://your-domain.com/` for the telemetry monitoring UI or `https://your-domain.com/sub` for stream metadata profiles.

---

## 📄 License
MIT License. Open source for enterprise telemetry and distributed network observability research.
