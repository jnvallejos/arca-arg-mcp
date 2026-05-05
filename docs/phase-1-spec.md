# Phase 1 Spec — WSAA Authentication & Token Caching

**Repo:** `arca-arg-mcp`
**Stack:** TypeScript, soap, Node crypto (XML signing), Vitest
**Approach:** TDD strict, granular commits, feature branch + PR
**Branch:** `phase-1-wsaa`

---

## 1. Goal of Phase 1

Implement WSAA (Web Service de Autenticación y Autorización) end-to-end. WSAA is the gatekeeper of every other ARCA service: without a valid Token de Acceso (TA), no other web service responds.

At the end of Phase 1:
- The server reads ARCA configuration from environment variables
- Can sign a TRA (Ticket de Requerimiento de Acceso) XML with the user's private key + certificate using PKCS#7/CMS
- Can call WSAA's `loginCms` SOAP method and parse the returned TA
- Caches the TA on disk (per CUIT, per service) to avoid re-authenticating until expiration
- Provides an internal `getValidToken(service)` API used by future tools
- Exposes a diagnostic MCP tool `arca_status` that reports config state and last token info (without exposing the raw token)
- Phase 0 code (ping tool, scaffolding) is **untouched**

**Phase 1 does NOT yet emit invoices or query Padrón.** Just authentication.

---

## 2. Folder Structure

```
arca-arg-mcp/
├── docs/
│   ├── phase-0-spec.md
│   └── phase-1-spec.md            (NEW)
├── src/
│   ├── index.ts                    (unchanged)
│   ├── server.ts                   (modified: add arca_status tool)
│   ├── config/
│   │   ├── env.ts                  (NEW: loads & validates env vars)
│   │   └── types.ts                (NEW: ArcaConfig type, ArcaEnv enum)
│   ├── wsaa/
│   │   ├── tra.ts                  (NEW: TRA XML builder)
│   │   ├── signer.ts               (NEW: PKCS#7 CMS signing)
│   │   ├── client.ts               (NEW: SOAP call to WSAA loginCms)
│   │   ├── ta-cache.ts             (NEW: file-based token cache)
│   │   ├── auth.ts                 (NEW: high-level getValidToken)
│   │   └── types.ts                (NEW: WSAA-specific types)
│   ├── tools/
│   │   ├── ping.ts                 (unchanged)
│   │   └── arca-status.ts          (NEW)
│   └── lib/
│       ├── errors.ts               (NEW: ArcaError, AuthenticationError, etc.)
│       ├── log.ts                  (NEW: stderr logger helper)
│       └── path.ts                 (NEW: path resolution utilities)
├── tests/
│   ├── ping.test.ts                (unchanged)
│   ├── config/
│   │   └── env.test.ts
│   ├── wsaa/
│   │   ├── tra.test.ts
│   │   ├── signer.test.ts
│   │   ├── client.test.ts
│   │   ├── ta-cache.test.ts
│   │   └── auth.test.ts
│   ├── tools/
│   │   └── arca-status.test.ts
│   ├── lib/
│   │   ├── log.test.ts
│   │   └── path.test.ts
│   └── fixtures/
│       ├── test-cert.pem           (test certificate, NOT real ARCA cert)
│       ├── test-key.pem            (test private key, NOT real)
│       ├── valid-ta.xml            (sample TA XML response)
│       └── README.md               (explains fixtures)
└── package.json                    (modified: new deps)
```

**Naming convention:** kebab-case for files, PascalCase for types, camelCase for functions.

---

## 3. Configuration Layer

### 3.1 Environment variables

The server reads these from `process.env` at startup:

| Variable | Required | Example | Notes |
|---|---|---|---|
| `ARCA_ENV` | Yes | `homologation` or `production` | Selects WS endpoints |
| `ARCA_CUIT` | Yes | `20239312345` | 11-digit CUIT, no dashes |
| `ARCA_CERT_PATH` | Yes | `/Users/javier/arca/cert.pem` | Absolute or relative; resolved to absolute |
| `ARCA_KEY_PATH` | Yes | `/Users/javier/arca/private.key` | Same as cert |
| `ARCA_CACHE_DIR` | No | `~/.arca-arg-mcp/cache` | Default: `~/.arca-arg-mcp/cache` |

### 3.2 `src/config/types.ts`

```typescript
export type ArcaEnv = 'homologation' | 'production';

export interface ArcaConfig {
  env: ArcaEnv;
  cuit: string;
  certPath: string;
  keyPath: string;
  cacheDir: string;
}

export interface WsaaEndpoints {
  url: string;
  serviceUrls: Record<string, string>;
}
```

### 3.3 `src/config/env.ts`

Exported function `loadConfig(): ArcaConfig` that:

1. Reads each env var
2. Validates with Zod
3. Resolves `~/...` and relative paths to absolute (uses `resolvePath` from `src/lib/path.ts`)
4. Verifies cert and key files exist and are readable (fs.accessSync)
5. Throws a clear `ConfigError` if anything fails, with which env var was wrong and why

**No file content reading at config load time.** Just verify files exist. Reading happens at signing time.

**CUIT validation:** Phase 1 validates only the **format** of `ARCA_CUIT` (must be exactly 11 numeric digits, no dashes, no spaces). The check digit (módulo 11 algorithm) is **not** validated here. Reasons:
- The format check catches the most common user errors (typos with dashes, copy-paste mistakes)
- The check digit can be incorrect even if the algorithm passes (ARCA's database is the source of truth)
- Phase 2 (Padrón A13) provides actual confirmation that the CUIT exists in ARCA's records
- Adding mod-11 validation in Phase 1 would duplicate logic and provide false confidence

**Decisions:**
- `zod` is added as a runtime dep (not just dev). Used here and in subsequent phases for tool input validation.
- `ARCA_ENV` default: there is **no default**. Explicit choice required. Better to fail loud than to default to homologation and confuse a prod user.
- Error messages must include the offending env var name. Example: `"ARCA_CERT_PATH not set. Expected absolute or relative path to your X.509 certificate (PEM format)."`

### 3.4 Logging at startup

The server logs (to **stderr**, not stdout) its configuration state at startup:

**Homologation:**
```
[arca-arg-mcp] Starting in HOMOLOGATION mode (ARCA_ENV=homologation)
[arca-arg-mcp] CUIT: 20239312345
[arca-arg-mcp] WSAA endpoint: https://wsaahomo.afip.gov.ar/ws/services/LoginCms
[arca-arg-mcp] Cert path: /Users/javier/arca/homo/cert.pem
[arca-arg-mcp] Cache dir: /Users/javier/.arca-arg-mcp/cache
```

**Production (with prominent warning):**
```
[arca-arg-mcp] ⚠️  Starting in PRODUCTION mode. CAEs will be legally valid.
[arca-arg-mcp] CUIT: 20239312345
[arca-arg-mcp] WSAA endpoint: https://wsaa.afip.gov.ar/ws/services/LoginCms
...
```

The `⚠️` is the **only** allowed exception to the "no emoji" rule, and only on this prod warning line. Justification: visual contrast for a critical log that the user must not miss.

**Implementation note:** All startup logs use the `logStderr()` helper from `src/lib/log.ts` (see section 3.5). The helper handles the `[arca-arg-mcp]` prefix consistently, so callers just pass the message body.

### 3.5 `src/lib/log.ts`

A minimal stderr logging helper. No external dependency.

```typescript
const PREFIX = '[arca-arg-mcp]';

export function logStderr(message: string): void {
  console.error(`${PREFIX} ${message}`);
}

export function logStderrWarn(message: string): void {
  console.error(`${PREFIX} ⚠️  ${message}`);
}
```

**Decisions:**
- Two functions, not a `level` parameter. Simpler call site, no string-vs-enum question.
- Always to stderr. stdout is reserved for MCP protocol on stdio transport.
- No timestamp, no log level, no structured fields. This is for human-readable startup messages, not observability.
- `logStderrWarn` adds the `⚠️` emoji documented above (the only allowed emoji, only on prod warnings).
- If a phase later needs richer logging, add it then. For Phase 1's 4-5 startup messages, this is enough.

### 3.6 `src/lib/path.ts`

Path resolution utilities used by config loading.

```typescript
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

/**
 * Resolves a path that may start with `~` (home dir) or be relative to CWD.
 * Always returns an absolute path.
 */
export function resolvePath(input: string): string {
  if (input.startsWith('~/')) {
    return resolve(homedir(), input.slice(2));
  }
  if (input === '~') {
    return homedir();
  }
  if (isAbsolute(input)) {
    return input;
  }
  return resolve(process.cwd(), input);
}
```

**Decisions:**
- Pure function, no I/O, easily testable.
- Uses Node's built-in `path` and `os`. No external dependencies.
- `~/` and `~` handled explicitly; deeper tilde patterns (`~user/`) not supported in V1 (rare, adds complexity).
- Falls back to CWD-relative resolution for any non-absolute, non-tilde input.

---

## 4. WSAA Implementation

### 4.1 What WSAA does (background)

WSAA is the AFIP/ARCA authentication service. The flow:

1. Client builds a **TRA** (Ticket de Requerimiento de Acceso) — XML with: service name, generation timestamp, expiration timestamp, unique nonce.
2. Client signs the TRA with their X.509 cert + private key, producing **CMS** (PKCS#7) — base64 encoded.
3. Client calls WSAA SOAP method `loginCms` with the signed CMS.
4. WSAA responds with a **TA** (Ticket de Acceso) — XML containing: token (opaque string), sign (signature), expiration timestamp.
5. Client stores TA and uses it for subsequent calls to `wsfev1`, `wsfexv1`, etc.
6. TA is valid for **12 hours**. Re-request only after expiration.

**Critical:** the TA is **per service**. Asking for `wsfe` token doesn't give you a `ws_sr_padron_a13` token. Each service requires its own TRA.

### 4.2 `src/wsaa/types.ts`

```typescript
export interface TRA {
  uniqueId: number;
  generationTime: Date;
  expirationTime: Date;
  service: string;
}

export interface TA {
  token: string;
  sign: string;
  generationTime: Date;
  expirationTime: Date;
  source: string;       // CN of issuer cert per WSAA response
  destination: string;  // CN of subject cert per WSAA response
  service: string;      // not in WSAA response; we add it for cache keying
}

export type ServiceName =
  | 'wsfe'
  | 'wsfex'
  | 'ws_sr_padron_a13'; // services we'll authenticate against in V1
```

### 4.3 `src/wsaa/tra.ts`

Pure function: `buildTra(service: ServiceName, now: Date = new Date()): { tra: TRA; xml: string }`.

```typescript
export function buildTra(
  service: ServiceName,
  now: Date = new Date(),
): { tra: TRA; xml: string };
```

XML format (from ARCA docs):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>1234567890</uniqueId>
    <generationTime>2026-05-04T12:00:00-03:00</generationTime>
    <expirationTime>2026-05-04T12:10:00-03:00</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>
```

**Decisions:**
- `uniqueId` = Unix timestamp in seconds (32-bit safe until 2038; ARCA accepts this idiom)
- `generationTime` = `now`
- `expirationTime` = `now` + 10 minutes (ARCA accepts up to 10 min window; smaller is better)
- Times in **ARG timezone** (-03:00) per ARCA convention. Use `Intl.DateTimeFormat` or manual offset; do not depend on system TZ.
- XML built by string concatenation with proper escaping (no XML library needed for this trivial case; tradeoff is minor and avoids a dep)

### 4.4 `src/wsaa/signer.ts`

The hard part. Sign a TRA XML with PKCS#7/CMS using cert + key from disk.

```typescript
export async function signCms(
  xml: string,
  certPem: string,  // file content, not path
  keyPem: string,   // file content, not path
): Promise<string>; // base64-encoded CMS
```

**Implementation strategy:**

Node has no built-in PKCS#7 CMS signing API. Two options:

**Option 1: `node-forge` library**
- Pure JS implementation
- Well-tested, widely used
- Adds ~200KB of deps
- Provides `forge.pkcs7.createSignedData` API

**Option 2: Shell out to `openssl` CLI**
- Zero JS deps
- Requires `openssl` available on the user's machine (it is, on Mac/Linux/WSL)
- Fragile: depends on system openssl version
- Harder to test in CI on Windows

**Decision: Option 1 (node-forge).**

Reasons:
- Cross-platform without external dep
- Easier to test
- 200KB is fine for this use case (not bundled to browser)
- AfipSDK and other Node libraries use `node-forge`; established pattern

**Add `node-forge` (`^1.3.0`) to deps. Add `@types/node-forge` (`^1.3.0`) to devDeps.**

**Algorithm:**
1. Parse cert PEM with `forge.pki.certificateFromPem`
2. Parse key PEM with `forge.pki.privateKeyFromPem`
3. Create signed data container with `forge.pkcs7.createSignedData()`
4. Set content to UTF-8 bytes of the TRA XML
5. Add signer with `addSigner({ key, certificate, digestAlgorithm: forge.pki.oids.sha256 })`
6. Sign and convert to DER
7. Base64-encode the DER bytes

### 4.5 `src/wsaa/client.ts`

SOAP client to call WSAA. Uses `soap` (the `vpulim/node-soap` package, version `^1.9.0`).

**Note on dependency choice:** the original spec proposed `strong-soap`. We migrated to `soap` for two reasons: (1) `soap` ships official TypeScript types built-in, while `strong-soap` has had an open issue for missing types since 2018; (2) `soap` has 14× more weekly downloads (~716K vs ~50K), translating to better community support and faster bug resolution. Both libraries have nearly identical API surface (`createClientAsync` + method calls), so the migration cost is minimal and isolated to this client module.

```typescript
export async function callLoginCms(
  cmsBase64: string,
  endpoint: string,
): Promise<string>; // raw TA XML response
```

**Implementation:**

WSAA WSDL is fixed (per env):
- Homologation: `https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl`
- Production: `https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl`

Steps:
1. Create soap client: `await soap.createClientAsync(wsdlUrl)`
2. Call `client.loginCmsAsync({ in0: cmsBase64 })`
3. Extract `result.loginCmsReturn` (string with TA XML inside)
4. Return that string

**Error handling:**

WSAA returns SOAP faults for:
- `coe.alreadyAuthenticated` — TRA was already used (replay protection)
- `coe.tokenAlreadyEmitted` — same as above, slight variation
- `coe.invalidSignature` — bad cert or key
- `cms.bad` — malformed CMS
- `coe.expirationTimeBeforeGenerationTime` — bad TRA timestamps

The client catches SOAP faults and re-throws as typed errors:

```typescript
export class WsaaError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WsaaError';
  }
}
```

The caller (auth.ts) decides how to react. For example, on `tokenAlreadyEmitted`, the auth layer can wait 1 second and retry once with a new TRA.

### 4.6 Parsing the TA response

WSAA returns this XML inside the `loginCmsReturn` SOAP element:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<loginTicketResponse version="1.0">
  <header>
    <source>CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239</source>
    <destination>SERIALNUMBER=CUIT 20239312345, CN=tu-sistema, O=Tu Nombre, C=AR</destination>
    <uniqueId>1234567890</uniqueId>
    <generationTime>2026-05-04T12:00:00.000-03:00</generationTime>
    <expirationTime>2026-05-05T00:00:00.000-03:00</expirationTime>
  </header>
  <credentials>
    <token>PD94bWwgdmVyc2lvbj0iMS4wIi...</token>
    <sign>aBc123XyZ...</sign>
  </credentials>
</loginTicketResponse>
```

Parse with `fast-xml-parser` (add as runtime dep) or with regex (acceptable here; structure is fixed per WSAA spec).

**Decision: `fast-xml-parser` (`^4.5.0`).**

Reasons:
- Adding it now avoids regex parsing later in WSFE response parsing where structure is more complex
- Standard tool in Node ecosystem
- Returns strongly-typed objects when configured

### 4.7 `src/wsaa/ta-cache.ts`

File-based cache for TAs. Avoids re-authenticating on every tool call.

**File location:** `${cacheDir}/ta-${cuit}-${service}.json`

**File format:**

```json
{
  "token": "PD94bWwgdmVyc2lvbj0i...",
  "sign": "aBc123XyZ...",
  "generationTime": "2026-05-04T15:00:00.000Z",
  "expirationTime": "2026-05-05T03:00:00.000Z",
  "service": "wsfe",
  "source": "CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239",
  "destination": "SERIALNUMBER=CUIT 20239312345, ..."
}
```

**API:**

```typescript
export async function readTa(
  cacheDir: string,
  cuit: string,
  service: ServiceName,
): Promise<TA | null>;

export async function writeTa(
  cacheDir: string,
  cuit: string,
  service: ServiceName,
  ta: TA,
): Promise<void>;

export async function deleteTa(
  cacheDir: string,
  cuit: string,
  service: ServiceName,
): Promise<void>;
```

**Decisions:**
- `readTa` returns `null` if file doesn't exist or is malformed (not an error; just means "no cache").
- `readTa` does NOT check expiration. It returns whatever it has; expiration check is the caller's job.
- File mode: 0600 (readable only by owner). Defensive against multi-user systems. Use `fs.writeFile(path, content, { mode: 0o600 })`.
- `cacheDir` is created with `fs.mkdir(cacheDir, { recursive: true, mode: 0o700 })` if not exists.
- All paths use absolute paths to avoid CWD-related bugs.

### 4.8 `src/wsaa/auth.ts`

The high-level orchestrator. Used by all subsequent tools.

```typescript
export async function getValidToken(
  config: ArcaConfig,
  service: ServiceName,
): Promise<TA>;
```

**Algorithm:**

1. Try `readTa(cacheDir, cuit, service)`.
2. If TA exists and `expirationTime > now + 60s` (60-second safety buffer): return it.
3. Otherwise, build TRA, sign, call WSAA, parse response, write to cache, return.
4. If WSAA fails with `tokenAlreadyEmitted` or `alreadyAuthenticated`: wait 1 second, retry once with a fresh TRA. If retry fails too, propagate error.

**Decisions:**
- 60-second safety buffer ensures we don't use a TA that's about to expire mid-call.
- Single retry for replay-protection errors. No exponential backoff. Real failures escalate fast.
- Concurrent calls to `getValidToken` for the same service are NOT serialized in V1. Two calls can both miss cache and both authenticate. That's acceptable for V1; ARCA tolerates concurrent auth requests.

---

## 5. The `arca_status` Diagnostic Tool

### 5.1 Tool definition

A new MCP tool that lets the user verify their config and see what's cached, without exposing sensitive data.

```typescript
export const arcaStatusTool: Tool = {
  name: 'arca_status',
  description:
    'Reports the current ARCA configuration and cached token status. Useful for verifying setup before emitting invoices.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
```

### 5.2 Tool output

Returns a structured text response:

```
ARCA configuration:
  Environment: HOMOLOGATION
  CUIT: 20239312345
  Cert path: /Users/javier/arca/homo/cert.pem (valid, expires 2027-08-15)
  Key path: /Users/javier/arca/homo/private.key (readable)
  Cache dir: /Users/javier/.arca-arg-mcp/cache

Cached tokens:
  wsfe: valid until 2026-05-05 03:00:00 (11h 23m remaining)
  wsfex: not cached
  ws_sr_padron_a13: expired (2026-05-04 09:00:00)

WSAA endpoint: https://wsaahomo.afip.gov.ar/ws/services/LoginCms
```

**Decisions:**
- The actual token string is NEVER included in output. Only metadata (expiration, cached/not cached).
- Cert validity is parsed from the cert file (using `node-forge`) without exposing it.
- Times shown in ARG timezone for user convenience.
- "Cache dir" path shown literally so the user knows where to look if they want to inspect.

### 5.3 Handler

```typescript
export async function handleArcaStatus(
  config: ArcaConfig,
  _args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }>;
```

Pure function (given config + filesystem access). Inspects:
- Cert file (parses with node-forge, extracts validity dates and subject CN)
- Cache directory (lists `ta-*.json` files, parses each, reports expiration)

---

## 6. Test Strategy — Phase 1

Phase 1 introduces three test categories: **unit tests** (pure functions, mocked filesystem), **integration tests** (real filesystem in temp dirs, mocked SOAP), and **fixture-based tests** (canned XML responses).

**No live ARCA tests in CI.** Real WSAA calls require valid certificates; we don't ship those. Live tests are run manually by the developer.

### 6.1 Test fixtures

`tests/fixtures/`:

- `test-cert.pem` — A self-signed test certificate. **Claude Code generates this in preflight** (before writing tests), running:
  ```bash
  openssl req -x509 -newkey rsa:2048 \
    -keyout tests/fixtures/test-key.pem \
    -out tests/fixtures/test-cert.pem \
    -days 3650 -nodes \
    -subj "/C=AR/O=Test Org/CN=test/serialNumber=CUIT 20000000000"
  ```
  The command must run in the project root and write directly to `tests/fixtures/`. The fixture certs are committed to the repo so CI can run tests without regenerating them. They expire in 10 years (3650 days), well beyond the project's lifetime as a portfolio piece.
- `test-key.pem` — Matching private key, generated together with the cert in the same openssl invocation.
- `valid-ta.xml` — A captured WSAA response (with token/sign sanitized to fake values). Used to test parsing. Claude Code creates this manually based on the structure documented in section 4.6.
- `wsaa-fault-already-emitted.xml` — A captured SOAP fault for replay testing. Same approach: handcrafted from the WSAA documentation.
- `README.md` — Documents what each fixture is, how it was generated, and explicit warning that these are NOT real ARCA-signed certs.

**Important:** test fixtures are checked into the repo. They are NOT real ARCA-signed certs. They're self-signed for testing only. The README must be explicit about this.

### 6.2 Unit tests

#### `tests/config/env.test.ts`

```
describe loadConfig
  loads valid configuration from env vars
  throws ConfigError when ARCA_ENV is missing
  throws ConfigError when ARCA_ENV is invalid (not homologation or production)
  throws ConfigError when ARCA_CUIT is missing
  throws ConfigError when ARCA_CUIT is malformed (not 11 digits)
  throws ConfigError when cert path does not exist
  throws ConfigError when key path does not exist
  resolves ~/path to absolute path
  defaults cacheDir to ~/.arca-arg-mcp/cache when not set
  uses ARCA_CACHE_DIR when set
```

Setup uses a `beforeEach` that snapshots `process.env`, clears ARCA vars, and a temp dir for fixture files. `afterEach` restores env.

#### `tests/wsaa/tra.test.ts`

```
describe buildTra
  produces a TRA with the requested service
  generationTime equals the now parameter
  expirationTime is 10 minutes after generationTime
  uniqueId is unix timestamp in seconds
  XML has proper UTF-8 declaration
  XML contains generationTime in ARG timezone format
  XML escapes special characters in service name (defensive)
  two consecutive TRAs have different uniqueIds when called in different seconds
```

#### `tests/wsaa/signer.test.ts`

```
describe signCms
  produces non-empty base64 string
  produced CMS is valid base64 (no whitespace, decodable)
  produced CMS verifies against the original cert (using forge to decode and verify)
  throws when cert PEM is malformed
  throws when key PEM is malformed
  throws when cert and key do not match
```

These tests use the test fixtures. Verification uses `forge.pkcs7.messageFromAsn1` to decode and validate the signature.

#### `tests/wsaa/ta-cache.test.ts`

```
describe ta-cache
  readTa returns null when file does not exist
  readTa returns null when file is malformed JSON
  readTa returns the parsed TA when file is valid
  writeTa creates the cache directory if not present
  writeTa creates files with mode 0600
  writeTa overwrites existing file
  deleteTa removes the file
  deleteTa is idempotent (no error if file already gone)
  cache key is correctly formed: ta-{cuit}-{service}.json
```

Uses `fs.mkdtemp` for isolated temp dirs per test.

#### `tests/wsaa/client.test.ts`

```
describe callLoginCms
  parses a successful WSAA response into a TA
  throws WsaaError with code "alreadyAuthenticated" on that fault
  throws WsaaError with code "invalidSignature" on that fault
  throws WsaaError with generic code on unrecognized fault
  passes the cmsBase64 as the in0 parameter
```

SOAP client mocked at the `soap` package level. The actual HTTP layer is not tested. We trust `soap`'s own tests for that.

#### `tests/wsaa/auth.test.ts`

```
describe getValidToken
  returns cached token when valid and not near expiration
  fetches new token when no cache exists
  fetches new token when cached token is expired
  fetches new token when cached token expires within safety buffer (60s)
  retries once on tokenAlreadyEmitted error
  propagates error after retry fails
  caches the new token after fetch
  uses correct service name in TRA
```

Mocks: TA cache (memory-backed for tests), WSAA client (returns canned responses).

### 6.3 Tool tests

#### `tests/tools/arca-status.test.ts`

```
describe arca_status tool
  reports HOMOLOGATION environment correctly
  reports PRODUCTION environment correctly
  reports CUIT
  reports cert validity dates from cert file
  reports "cached, valid" for tokens with future expiration
  reports "expired" for tokens with past expiration
  reports "not cached" for services with no cache file
  never includes the raw token string in output
  never includes the raw sign string in output
```

The "never includes raw token" assertions are critical for portfolio credibility. Make them explicit.

### 6.4 Lib tests

#### `tests/lib/path.test.ts`

```
describe resolvePath
  resolves ~/foo to absolute path under home dir
  resolves ~ alone to home dir
  passes through absolute paths unchanged
  resolves relative paths against CWD
  handles trailing slashes correctly
  does not interpret ~user/foo as tilde expansion (V1 limitation)
```

#### `tests/lib/log.test.ts`

```
describe log helpers
  logStderr writes to stderr with [arca-arg-mcp] prefix
  logStderr does NOT write to stdout
  logStderrWarn writes to stderr with prefix and warning emoji
  multiple calls preserve output order
```

Tests use `vi.spyOn(console, 'error')` and `vi.spyOn(process.stdout, 'write')` to verify which stream receives the output.

---

## 7. Commit Convention — Phase 1

Same Conventional Commits as Phase 0. New scopes for this phase:

- `config`: `src/config/*`
- `wsaa`: `src/wsaa/*`
- `tools`: any tool (now includes arca-status)
- `lib`: `src/lib/*` (errors, shared utilities)
- `tests`: shared test utilities

Existing scopes still valid: `repo`, `ci`, `docs`, `chore`.

**Granularity rule (stricter from Phase 1 onward):** TDD pair = one commit. Test commit immediately precedes implementation commit. No mixing.

**Example commit sequence (illustrative):**

```
chore: add zod, node-forge, fast-xml-parser, soap deps
test(lib): add path resolution utility tests
feat(lib): implement resolvePath with home dir and absolute support
test(lib): add stderr logger tests
feat(lib): implement logStderr and logStderrWarn helpers
feat(lib): add ArcaError and WsaaError base error classes
test(config): add env loader tests
feat(config): implement env config loading with zod validation
test(wsaa): add TRA builder tests
feat(wsaa): implement TRA XML builder
test(wsaa): add CMS signer tests with test fixtures
feat(wsaa): implement PKCS7 CMS signing with node-forge
test(wsaa): add TA cache tests
feat(wsaa): implement file-based TA cache with 0600 mode
test(wsaa): add WSAA client tests with mocked SOAP
feat(wsaa): implement WSAA SOAP client with soap package
test(wsaa): add fault parsing tests
feat(wsaa): handle WSAA SOAP faults with typed errors
test(wsaa): add high-level getValidToken tests
feat(wsaa): implement getValidToken with cache + retry logic
test(tools): add arca_status tool tests
feat(tools): implement arca_status diagnostic tool
feat(server): register arca_status tool in MCP server
chore(server): log startup configuration to stderr
docs: add phase-1-spec.md
```

---

## 8. What NOT to Do in Phase 1

- **Do not** modify Phase 0 code beyond adding the `arca_status` tool to `src/server.ts`.
- **Do not** add other ARCA web service tools yet (Padrón is Phase 2; WSFE is Phase 3).
- **Do not** add cert generation tools. Out of scope permanently per design.
- **Do not** add `openssl` CLI dependency at runtime. `openssl` is used only in the test fixture generation step (preflight). Production code uses node-forge exclusively.
- **Do not** add a job queue for token refresh. Manual refresh on demand.
- **Do not** add WebSocket / SSE transport. stdio only.
- **Do not** add database persistence for TA cache. File-based is enough.
- **Do not** add encryption of cache files at rest. Mode 0600 is sufficient for local use.
- **Do not** add an external logger library (winston, pino, bunyan, etc.). The `logStderr` helper in `src/lib/log.ts` is sufficient for all Phase 1 needs.
- **Do not** add OpenTelemetry / metrics. Out of scope.
- **Do not** test against real ARCA endpoints in CI. Mocked SOAP only.
- **Do not** add NPM packages outside the allowed list with the version pins specified:
  - Production:
    - `@modelcontextprotocol/sdk` (already present)
    - `zod` (`^3.23.0`)
    - `node-forge` (`^1.3.0`)
    - `fast-xml-parser` (`^4.5.0`)
    - `soap` (`^1.9.0`)
  - Dev:
    - All Phase 0 dev deps
    - `@types/node-forge` (`^1.3.0`)

---

## 9. Acceptance Criteria for Phase 1

Before pushing the branch:

- [ ] `npm install` completes
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run typecheck` passes
- [ ] `npm test` all green
- [ ] Coverage >85% on `src/config/`, `src/lib/`, `src/wsaa/`, `src/tools/arca-status.ts`
- [ ] `npm run build` produces `dist/`
- [ ] All commits follow conventional commits with allowed scopes
- [ ] No AI signatures in any commit
- [ ] No test fixtures contain real ARCA cert data (only self-signed test certs)
- [ ] `tests/fixtures/README.md` documents fixtures clearly
- [ ] `docs/phase-1-spec.md` is committed
- [ ] Phase 0 code (ping tool, scaffolding) is unchanged in this PR diff (except `src/server.ts` to register `arca_status`)

After opening the PR:

- [ ] CI green on the PR
- [ ] Manual smoke test: run `dist/index.js` with valid env vars (homologation cert), verify startup logs are correct, verify `arca_status` tool returns expected output via MCP inspector or Claude Desktop. (This step is performed by the user during review, not by Claude Code; CI cannot do it because there are no real certs in CI.)

---

## 10. Branch & PR Workflow — Phase 1

Same as Phase 0:

1. `git checkout main && git pull` (after Phase 0 merged)
2. `git checkout -b phase-1-wsaa`
3. Implement following section 7 commit sequence
4. Verify acceptance criteria from section 9 locally
5. Push: `git push -u origin phase-1-wsaa`
6. Open PR: `gh pr create --base main --head phase-1-wsaa --title "Phase 1: WSAA Authentication and Token Caching"` with body containing summary + acceptance checklist + note "Adds WSAA layer foundation. No invoices yet; that's Phase 3."
7. Do NOT merge.
8. Report: "Phase 1 complete. PR opened: <URL>. Acceptance criteria checked. Awaiting review." and stop.

---

## 11. Handoff to Phase 2 (preview, not in scope)

Phase 2 will add:
- Padrón A13 SOAP client (calls `getPersona` and `getPersonaList_v2`)
- Tool `arca_consultar_cuit` that takes a CUIT and returns the person's tax data
- Reuses `getValidToken('ws_sr_padron_a13')` from Phase 1
- Adds Padrón-specific types and response parsing

Phase 1 stays focused on auth. No Padrón anticipation.
