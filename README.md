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
- [x] Phase 1 — WSAA authentication
- [x] Phase 2 — Padrón (CUIT lookup)
- [x] Phase 3 — WSFE (Factura A, B, C)
- [ ] Phase 4 — WSFEX (Factura E)
- [ ] Phase 5 — Release v1.0.0

## Why this exists

ARCA's web services are SOAP, idiosyncratic, and badly documented — every Argentine
developer who has ever needed to invoice from code has rediscovered the same edge cases
the hard way. This project wraps them as MCP tools so an LLM (or any MCP client) can
drive them with a clean, typed interface, instead of every team rebuilding the same
auth and signing layer from scratch.

## Prerequisites

- **Node.js 20** or higher
- **`openssl`** available on your `PATH` (preinstalled on macOS and most Linux
  distributions; on Windows install via Git Bash, WSL, or a native package such as
  the Win32 OpenSSL binaries)
- A valid **AFIP / ARCA Clave Fiscal** — the same login a real Argentine taxpayer
  uses to access the ARCA portal

## Quick start

For readers who already have a CUIT and an ARCA-issued certificate:

```bash
git clone https://github.com/jnvallejos/arca-arg-mcp.git
cd arca-arg-mcp
npm install
npm run build
# After completing "Obtaining ARCA test credentials" below:
ARCA_ENV=homologation \
ARCA_CUIT=<your-cuit> \
ARCA_CERT_PATH=<path-to-cert.pem> \
ARCA_KEY_PATH=<path-to-private.key> \
npm run smoke
```

If `npm run smoke` prints `Smoke test PASSED`, you're ready to wire it up to a client.
See **Using with Claude Desktop** below.

## Obtaining ARCA test credentials

Authenticating against ARCA requires an X.509 certificate that ARCA itself issues to
your CUIT. The flow below walks through the homologation (test) environment end to
end. Production follows the same shape but uses different ARCA portals; do not
attempt production until homologation works.

The certificate self-service portal is called **WSASS** (*Web Services Autogestión
de Certificados*). All ARCA UI labels are in Spanish; URLs and button names below
are reproduced verbatim.

### 1. Generate an RSA private key

In a directory you control (suggested: `~/.arca/homo/`):

```bash
mkdir -p ~/.arca/homo && cd ~/.arca/homo
openssl genrsa -out private.key 2048
chmod 600 private.key
```

The key is yours; never upload it, never commit it, never share it.

### 2. Generate a Certificate Signing Request (CSR)

```bash
openssl req -new -key private.key \
  -subj "/C=AR/O=Your Name/CN=arca-arg-mcp/serialNumber=CUIT XXXXXXXXXXX" \
  -out request.csr
```

Replace:

- `Your Name` with your full legal name (or your company name if you're using a
  company CUIT)
- `XXXXXXXXXXX` with your 11-digit CUIT, no dashes or spaces
- The `CN` (`arca-arg-mcp`) is just an alias and can be any alphanumeric value

The `serialNumber=CUIT XXXXXXXXXXX` format with a literal space between `CUIT` and
the digits is **required by ARCA**. Do not reformat it.

### 3. Adhere to the WSASS service

WSASS is opt-in. You enable it once per Clave Fiscal.

1. Open <https://www.arca.gob.ar>
2. Click **"Acceso con Clave Fiscal"** and log in with your Clave Fiscal
3. From the service list, click **"ARCA"**, then **"Servicios Interactivos"**, then
   **"WSASS — Autogestión Certificados Homologación"**
4. If the service is not listed: open **"Administrador de Relaciones de Clave
   Fiscal"** (also from the main service list), click **ADHERIR SERVICIO**, click
   the **ARCA** button, then **Servicios Interactivos**, locate **"WSASS —
   Autogestión Certificados Homologación"**, and confirm the authorization
5. Log out and back in — the service appears in the menu only after re-authentication

### 4. Create a DN and submit the CSR

Inside WSASS:

1. Click **Nuevo Certificado**
2. **Nombre simbólico del DN:** any alphanumeric alias (no dashes, no spaces).
   Suggestion: `arcaargmcphomo`
3. **CUIT del contribuyente:** prefilled with your CUIT
4. **Solicitud de certificado en formato PKCS#10:** paste the entire content of
   `request.csr` (including the `-----BEGIN CERTIFICATE REQUEST-----` and
   `-----END CERTIFICATE REQUEST-----` lines)
5. Click **Crear DN y obtener certificado**

ARCA returns a PEM-formatted X.509 certificate in the **Resultado** box. Copy the
entire block, including the `-----BEGIN CERTIFICATE-----` /
`-----END CERTIFICATE-----` lines.

### 5. Save the certificate

```bash
cd ~/.arca/homo
# Paste content into cert.pem using your editor of choice, or with a heredoc:
cat > cert.pem << 'EOF'
-----BEGIN CERTIFICATE-----
... paste here ...
-----END CERTIFICATE-----
EOF
chmod 644 cert.pem
```

### 6. Authorize the certificate for a web service

WSASS distinguishes between **owning a certificate** and **authorizing it to talk
to a specific web service**. You must do both.

Inside WSASS:

1. Click **Crear autorización a servicio**
2. **Nombre simbólico del DN a autorizar:** select the alias you created in step 4
3. **CUIT representado:** your own CUIT
4. **Servicio al que desea acceder:** for the smoke test, choose
   **`wsfe — Factura electrónica`**
5. Click **Crear autorización de acceso**

You should see *"OK. Autorización fue creada (...)"*. The certificate is now
authorized to authenticate against WSAA for the `wsfe` service in homologation.

## Configuration

The server reads these environment variables at startup:

| Variable          | Required | Example                          | Notes                                                           |
| ----------------- | -------- | -------------------------------- | --------------------------------------------------------------- |
| `ARCA_ENV`        | Yes      | `homologation` or `production`   | Selects the WSAA endpoint. No default; explicit choice required |
| `ARCA_CUIT`       | Yes      | `20111111112`                    | 11-digit CUIT, no dashes, no spaces                             |
| `ARCA_CERT_PATH`  | Yes      | `~/.arca/homo/cert.pem`          | Absolute, relative, or `~`-prefixed path; resolved at startup   |
| `ARCA_KEY_PATH`   | Yes      | `~/.arca/homo/private.key`       | Same rules as `ARCA_CERT_PATH`                                  |
| `ARCA_CACHE_DIR`  | No       | `~/.arca-arg-mcp/cache`          | Where TA cache files are stored (default shown)                 |

The cert and key files must exist and be readable at startup. The CUIT is validated
for format only (11 numeric digits). The CUIT check digit is not validated here;
that's confirmed by ARCA itself when the first authentication call succeeds.

## Running the smoke tests

There are two smoke scripts, runnable individually or as a chained pair:

- `npm run smoke:wsaa` — exercises the full WSAA flow against ARCA homologation:
  build TRA, sign with PKCS#7 / CMS, call `loginCms`, parse the TA, and write it
  to disk.
- `npm run smoke:padron` — looks up a CUIT in the Padrón A13 web service,
  reusing the WSAA token. Requires the certificate to be authorized for
  `ws_sr_padron_a13` (see step 6 of **Obtaining ARCA test credentials** and pick
  that service when authorizing).
- `npm run smoke:wsfe` — emits a real **Factura B** in the homologation
  environment against Consumidor Final (`tipoDocReceptor=99`,
  `numeroDocReceptor='0'`, `importeTotal=$121,00`) and prints the returned
  CAE length (the CAE itself is never displayed). The certificate must be
  authorized for `wsfe`. Optionally set `SMOKE_PV` to override the default
  punto de venta `1`. Homologation invoices have no fiscal validity, do not
  appear in the productive padrón, and do not affect declarations.
- `npm run smoke` — runs `smoke:wsaa`, then `smoke:padron`, then `smoke:wsfe`
  in sequence (fail-fast). Useful for a single end-to-end check after setup.

```bash
ARCA_ENV=homologation \
ARCA_CUIT=20111111112 \
ARCA_CERT_PATH=~/.arca/homo/cert.pem \
ARCA_KEY_PATH=~/.arca/homo/private.key \
npm run smoke
```

The WSAA smoke writes a TA to `~/.arca-arg-mcp/cache/ta-<cuit>-wsfe.json` on
the first run. Subsequent runs within ~12 hours reuse the cache and complete in
milliseconds. To force a fresh authentication, delete the cache file.

By default `smoke:padron` looks up your own CUIT (every CUIT can look itself
up). To look up a different CUIT, set `SMOKE_CUIT`:

```bash
SMOKE_CUIT=30711111119 npm run smoke:padron
```

Both scripts redact sensitive data: `smoke:wsaa` prints token / sign lengths
only; `smoke:padron` prints field lengths and counts only — never names,
addresses, or activity descriptions.

### Common failures

- `ConfigError: ARCA_CERT_PATH: file at ... does not exist or is not readable.`
  Fix the path. Tilde (`~`) expansion only works for `~/...`, not `~user/...`.
- `WsaaError: coe.invalidSignature: ...` — the cert and key don't match, or you
  submitted a CSR generated from a different key. Regenerate the key + CSR + cert.
- `WsaaError: <unauthorized service>` — the cert is valid but not authorized for
  `wsfe` (or `ws_sr_padron_a13` for `smoke:padron`, or `wsfe` for `smoke:wsfe`).
  Repeat step 6 of **Obtaining ARCA test credentials**, picking the service you
  need.
- `PadronError: NOT_FOUND: ...` — the CUIT doesn't exist in ARCA's records.
  Double-check `SMOKE_CUIT` (or your own `ARCA_CUIT`).

## Using with Claude Desktop

Add the server to Claude Desktop's MCP config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS;
equivalent path on Linux/Windows):

```json
{
  "mcpServers": {
    "arca-arg-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/arca-arg-mcp/dist/index.js"],
      "env": {
        "ARCA_ENV": "homologation",
        "ARCA_CUIT": "20111111112",
        "ARCA_CERT_PATH": "/absolute/path/to/cert.pem",
        "ARCA_KEY_PATH": "/absolute/path/to/private.key"
      }
    }
  }
}
```

Restart Claude Desktop. The available tools (`ping`, `arca_status`,
`arca_consultar_cuit`, plus whatever future phases add) will appear in the
chat UI.

### Tools available

- **`ping`** — health check; returns `pong`.
- **`arca_status`** — reports current ARCA configuration and cached token
  status without exposing the raw token.
- **`arca_consultar_cuit`** — looks up a CUIT in the ARCA Padrón A13 web
  service and returns the person's tax data (legal name / razón social,
  estado, actividades, domicilio, condición tributaria). Useful for validating
  a CUIT before invoicing.
- **`arca_emitir_factura`** — emits a Factura A (1), B (6), or C (11) via
  WSFE and returns the CAE. If `numeroComprobante` is omitted, the server
  fetches the last authorized number and uses the next one. Supports concepto
  Productos, Servicios, or both. Argentine pesos only in V1 (foreign currency
  belongs to WSFEX in Phase 4). Notas de Crédito and Notas de Débito are not
  exposed in V1. Requires `condicionIvaReceptor` (RG 5616) — the receiver's
  IVA condition code: `1`=Responsable Inscripto, `4`=Sujeto Exento,
  `5`=Consumidor Final, `6`=Monotributo, `7`=No Categorizado,
  `8`=Proveedor del Exterior, `9`=Cliente del Exterior,
  `10`=IVA Liberado Ley 19.640, `13`=Monotributista Social,
  `15`=IVA No Alcanzado, `16`=Monotributo Trabajador Independiente Promovido.
- **`arca_obtener_ultimo_comprobante`** — returns the last authorized
  comprobante number for a given punto de venta and tipo (1 / 6 / 11).
  Useful for figuring out the next number before emitting.
- **`arca_consultar_comprobante`** — retrieves the full detail of a
  previously authorized comprobante (date, importes, CAE, vencimiento) by
  punto de venta, tipo, and número. Surfaces a friendly "no se encontró"
  message when ARCA has no record of the comprobante.
- **`arca_listar_tipos_comprobante`** — lists the comprobante types this
  server supports (Factura A, B, C). Helps the LLM pick the right `tipoComprobante`
  before calling `arca_emitir_factura`.

## Development

Requires Node.js 20+.

```bash
npm install            # install deps
npm test               # run the full Vitest suite
npm run lint           # Biome lint (zero-warning policy)
npm run typecheck      # strict TypeScript check
npm run build          # compile to dist/
npm run smoke          # end-to-end WSAA + Padrón + WSFE verification (real credentials required)
npm run smoke:wsaa     # WSAA smoke only
npm run smoke:padron   # Padrón smoke only (set SMOKE_CUIT to look up a specific CUIT)
npm run smoke:wsfe     # WSFE smoke only — emits a real Factura B in homologation (set SMOKE_PV to override punto de venta)
```

`npm run smoke*` scripts are **not** wired into CI — they require a real
ARCA-issued certificate. CI runs unit and integration tests only.

## Project structure

```
arca-arg-mcp/
├── docs/             phase-by-phase implementation specs
├── scripts/          developer-only scripts (smoke-wsaa.ts, smoke-padron.ts, smoke-wsfe.ts)
├── src/
│   ├── config/       env loading and ARCA endpoint table
│   ├── lib/          shared utilities (logging, paths, errors)
│   ├── padron/       Padrón A13 SOAP client, parser, formatter
│   ├── tools/        MCP tool handlers (ping, arca_status, arca_consultar_cuit, arca_emitir_factura, ...)
│   ├── wsaa/         WSAA auth: TRA build, CMS signing, SOAP client, TA cache
│   └── wsfe/         WSFE Factura A/B/C: codes, builder, parser, formatter, SOAP client
└── tests/            Vitest unit and integration tests, mirroring src/
```

## License

MIT — see [LICENSE](LICENSE).
