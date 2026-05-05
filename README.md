# arca-arg-mcp

[![CI](https://github.com/jnvallejos/arca-arg-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jnvallejos/arca-arg-mcp/actions/workflows/ci.yml)

MCP (Model Context Protocol) server for Argentine tax compliance. Exposes ARCA (ex-AFIP) web services as tools usable from Claude Desktop, Claude Code, and any MCP-compatible client.

> **Status: in development.** This repo is being built phase by phase.

## What it will do

- Authenticate with ARCA via WSAA (certificate-based)
- Validate CUITs against the Padrón web service
- Emit electronic invoices (Factura A, B, C) via WSFE
- Emit export invoices (Factura E) via WSFEX

## Status

- [x] Phase 0 — Project setup and MCP scaffolding
- [ ] Phase 1 — WSAA authentication
- [ ] Phase 2 — Padrón (CUIT lookup)
- [ ] Phase 3 — WSFE (Factura A, B, C)
- [ ] Phase 4 — WSFEX (Factura E)
- [ ] Phase 5 — Release v1.0.0

## Development

Requires Node.js 20+.

```bash
npm install
npm test
npm run build
```

## License

MIT — see [LICENSE](LICENSE).
