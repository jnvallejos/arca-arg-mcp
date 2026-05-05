# Phase 1 Smoke Spec — End-to-End WSAA Verification & Setup Documentation

**Repo:** `arca-arg-mcp`
**Stack:** TypeScript, soap, node-forge, Vitest
**Approach:** Lightweight follow-up to Phase 1. No new MCP tools.
**Branch:** `phase-1-smoke`

---

## 1. Goal

Phase 1 shipped the WSAA layer with full unit-test coverage, but the only end-to-end validation
performed so far was the read-only `arca_status` tool, which inspects config and cache without
actually authenticating against ARCA.

Before moving on to Phase 2 (Padrón), we want two things:

1. A repeatable, scriptable way to confirm the full WSAA flow works against ARCA homologation
   on a developer's own machine: TRA build → CMS sign → SOAP call → TA parse → cache write.
2. A README good enough that an external developer (recruiter, freelance client, anyone reading
   this as a portfolio piece) can clone the repo, follow the instructions, and have a working
   server inside ~15 minutes.

This phase delivers both: a `npm run smoke` script and a substantial README expansion.

**No new MCP tool. No changes to `src/`.**

---

## 2. Folder Structure

```
arca-arg-mcp/
├── docs/
│   ├── phase-0-spec.md
│   ├── phase-1-spec.md
│   └── phase-1-smoke-spec.md       (NEW)
├── scripts/                         (NEW directory)
│   └── smoke-wsaa.ts                (NEW)
├── tests/
│   └── scripts/
│       └── smoke-wsaa.test.ts       (NEW)
├── README.md                        (heavily expanded)
└── package.json                     (modified: add `smoke` script)
```

Naming convention: kebab-case for files, PascalCase for types, camelCase for functions. Same as
prior phases.

---

## 3. The Smoke Script

### 3.1 What it does

`scripts/smoke-wsaa.ts` is a standalone Node script (run via `tsx`) that:

1. Loads ARCA configuration from environment variables (reusing `loadConfig` from `src/config/env.ts`).
2. Calls `getValidToken('wsfe')` from `src/wsaa/auth.ts`.
3. Prints a redacted summary of the resulting TA to stdout.
4. Exits with code 0 on success, non-zero on any failure.

Exactly one service is exercised: `wsfe`. That is the service we know is authorized in ARCA
homologation (per the README setup instructions). Future smoke variants for `wsfex` or
`ws_sr_padron_a13` can be added later if needed; out of scope here.

### 3.2 Output format

On success:

```
[smoke] Loading config...
[smoke] env=homologation cuit=20111111112
[smoke] Requesting TA for service: wsfe
[smoke] TA acquired:
[smoke]   service:        wsfe
[smoke]   generationTime: 2026-05-05T15:03:00.000Z
[smoke]   expirationTime: 2026-05-06T03:03:00.000Z (11h 59m from now)
[smoke]   source:         CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239
[smoke]   destination:    SERIALNUMBER=CUIT 20111111112, CN=arcaargmcphomo
[smoke]   token length:   3812 chars (not displayed)
[smoke]   sign length:    344 chars (not displayed)
[smoke]   cached at:      /Users/dev/.arca-arg-mcp/cache/ta-20111111112-wsfe.json
[smoke] Smoke test PASSED
```

On failure (any thrown error from auth):

```
[smoke] Smoke test FAILED:
[smoke]   <ErrorName>: <message>
[smoke]   (stack trace)
```

All output goes to stdout. The script exits with code 1 on failure.

### 3.3 What it must NOT do

- Must not print the raw `token` or `sign` strings. Lengths only.
- Must not require any new dependencies. Reuses `tsx` (already a devDep) for execution.
- Must not write tests as fixtures; those go in `tests/scripts/smoke-wsaa.test.ts` (see §5).
- Must not be wired into any MCP tool. It is a developer-only script.
- Must not modify any file under `src/`. It only imports from `src/`.

### 3.4 `package.json` changes

Add to the `scripts` section:

```json
"smoke": "tsx scripts/smoke-wsaa.ts"
```

No new deps. The CLI is `npm run smoke` and it inherits env vars from the shell.

---

## 4. README Expansion

The current README is ~30 lines. The expanded version targets a complete onboarding experience.

### 4.1 New top-level sections (in order)

1. **What it is / what it does** — keep current intro, tighten wording.
2. **Status** — keep current checklist.
3. **Why this exists** (NEW, ~3 sentences) — short framing: ARCA web services are SOAP, idiosyncratic, and badly documented; this exposes them as MCP tools so an LLM can use them.
4. **Prerequisites** (NEW)
5. **Quick start** (NEW)
6. **Obtaining ARCA test credentials** (NEW, the longest section)
7. **Configuration** (NEW)
8. **Running the smoke test** (NEW)
9. **Using with Claude Desktop** (NEW)
10. **Development** (expanded from current minimal section)
11. **Project structure** (NEW, a brief tree)
12. **License** — keep.

### 4.2 Section content

#### Prerequisites

Plain bullet list. Required:

- Node.js 20 or higher
- `openssl` available on PATH (already on macOS and most Linux; on Windows, install via Git Bash, WSL, or native package)
- A valid AFIP / ARCA Clave Fiscal (Argentine tax authority login). The same credentials used to access the ARCA portal as a real Argentine taxpayer.

#### Quick start

A 5-line snippet for the experienced reader who already has credentials:

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

Followed by: "If `npm run smoke` prints `Smoke test PASSED`, you're ready to wire it up to a client. See **Using with Claude Desktop** below."

#### Obtaining ARCA test credentials

This is the section that solves the "no dev should have to figure this out alone" problem. A
numbered, reproducible walkthrough. **All language is English** (this is a public repo);
URLs and ARCA UI labels stay in Spanish where they appear in Spanish.

Subsections:

**1. Generate an RSA private key**

Run, in a directory you control (suggested: `~/.arca/homo/`):

```bash
mkdir -p ~/.arca/homo && cd ~/.arca/homo
openssl genrsa -out private.key 2048
chmod 600 private.key
```

The key is yours; never upload it, never commit it, never share it.

**2. Generate a Certificate Signing Request (CSR)**

```bash
openssl req -new -key private.key \
  -subj "/C=AR/O=Your Name/CN=arca-arg-mcp/serialNumber=CUIT XXXXXXXXXXX" \
  -out request.csr
```

Replace:
- `Your Name` with your full legal name (or your company name if you're using a company CUIT)
- `XXXXXXXXXXX` with your 11-digit CUIT, no dashes or spaces
- The `CN` (`arca-arg-mcp`) is just an alias and can be anything alphanumeric

The `serialNumber=CUIT XXXXXXXXXXX` format with a literal space between `CUIT` and the digits is
**required by ARCA**. Do not reformat it.

**3. Adhere to the WSASS service**

ARCA's certificate self-service portal is called **WSASS**. You need to opt in to it once.

1. Open https://www.arca.gob.ar
2. Click **"Acceso con Clave Fiscal"** and log in with your Clave Fiscal
3. From the service list, click **"ARCA"**, then **"Servicios Interactivos"**, then **"WSASS — Autogestión Certificados Homologación"**
4. If the service is not listed: open **"Administrador de Relaciones de Clave Fiscal"** (also from the main service list), click **ADHERIR SERVICIO**, click the **ARCA** button, then **Servicios Interactivos**, locate **"WSASS — Autogestión Certificados Homologación"**, and confirm the authorization
5. Log out and back in — the service shows up in the menu only after re-authentication

**4. Create a DN and submit the CSR**

Inside WSASS:

1. Click **Nuevo Certificado**
2. **Nombre simbólico del DN:** any alphanumeric alias (no dashes, no spaces). Suggestion: `arcaargmcphomo`
3. **CUIT del contribuyente:** prefilled with your CUIT
4. **Solicitud de certificado en formato PKCS#10:** paste the entire content of `request.csr` (including the `-----BEGIN CERTIFICATE REQUEST-----` and `-----END CERTIFICATE REQUEST-----` lines)
5. Click **Crear DN y obtener certificado**

ARCA returns a PEM-formatted X.509 certificate in the **Resultado** box. Copy the entire block,
including the `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----` lines.

**5. Save the certificate**

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

**6. Authorize the certificate for a web service**

WSASS distinguishes between **owning a certificate** and **authorizing it to talk to a specific web
service**. You must do both.

Inside WSASS:

1. Click **Crear autorización a servicio**
2. **Nombre simbólico del DN a autorizar:** select the alias you created in step 4
3. **CUIT representado:** your own CUIT
4. **Servicio al que desea acceder:** for the smoke test, choose **`wsfe — Factura electrónica`**
5. Click **Crear autorización de acceso**

You should see: *"OK. Autorización fue creada (...)"*. The certificate is now authorized to
authenticate against WSAA for the `wsfe` service in homologation.

#### Configuration

Plain table of environment variables (mirror what's already in `phase-1-spec.md` §3.1). Required
vs optional, format, example.

#### Running the smoke test

```bash
ARCA_ENV=homologation \
ARCA_CUIT=20111111112 \
ARCA_CERT_PATH=~/.arca/homo/cert.pem \
ARCA_KEY_PATH=~/.arca/homo/private.key \
npm run smoke
```

Expected output: a multi-line summary ending in `Smoke test PASSED`. The first run will write a TA
to `~/.arca-arg-mcp/cache/ta-<cuit>-wsfe.json`. Subsequent runs (within ~12 hours) reuse the cache
and complete in milliseconds. To force a fresh authentication, delete the cache file.

Common failures:
- `ConfigError: ARCA_CERT_PATH: file at ... does not exist or is not readable.` — fix the path.
- `WsaaError: coe.invalidSignature: ...` — cert and key don't match, or you submitted a CSR generated from a different key. Regenerate the key + CSR + cert.
- `WsaaError: <unauthorized service>` — cert is valid but not authorized for `wsfe`. Repeat step 6 of the credentials walkthrough.

#### Using with Claude Desktop

Add to Claude Desktop's MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

Restart Claude Desktop. The available tools (`ping`, `arca_status`, plus whatever future phases
add) will appear in the chat UI.

#### Development

Keep current commands (`npm install`, `npm test`, `npm run build`) and add:

- `npm run lint` — Biome lint
- `npm run typecheck` — strict TypeScript check
- `npm run smoke` — end-to-end WSAA verification (requires real credentials, see above)

#### Project structure

A short tree of the top two levels of `src/` and `tests/`. Just enough to orient a reader. No prose
explanations beyond a one-line caption per directory.

### 4.3 What stays out of the README

- Architecture decisions (those live in `docs/phase-N-spec.md`)
- Code style rules (those live in `CLAUDE.md`)
- Detailed protocol explanations of WSAA / WSFE / etc. (link to ARCA docs instead)
- Anything related to specific employers, clients, or non-public projects

---

## 5. Test Strategy

The smoke script itself is not a unit-testable thing — it talks to a live network. But we can and
should test the **safe behaviors** of the script's logic in isolation.

### 5.1 `tests/scripts/smoke-wsaa.test.ts`

Tests for the formatting / redaction logic. The script must export the formatter function so it can
be tested without invoking `getValidToken`.

Concretely, factor the script as:

```typescript
// scripts/smoke-wsaa.ts
import { formatTaSummary } from './smoke-wsaa.js';
// ... main() that calls getValidToken and then logs formatTaSummary(ta, cachePath)
```

Where `formatTaSummary(ta: TA, cachePath: string, now: Date): string[]` is a pure function. Tests:

```
describe formatTaSummary
  includes the service name
  includes generationTime in ISO format
  includes expirationTime with human-readable remaining time
  includes source and destination strings verbatim
  reports token length, NEVER the token itself
  reports sign length, NEVER the sign itself
  includes the cache file path
```

Coverage target: 100% on `formatTaSummary`. The `main()` function is excluded from coverage
(it's I/O and live network).

### 5.2 What we do NOT test

- Live calls to ARCA (no real credentials in CI).
- The script's CLI invocation. Trust `tsx`.
- Output stream choice (`console.log`). Trivial.

### 5.3 Vitest config

Add `scripts/smoke-wsaa.ts` to coverage **inclusion**, with `main()` excluded via `/* v8 ignore start */`
and `/* v8 ignore stop */` comments around it. Same pattern as `src/index.ts` from Phase 0.

---

## 6. Commit Convention

Same Conventional Commits as Phase 1. Allowed scopes:

- `scripts`: `scripts/*` (new)
- `docs`: `README.md`, `docs/*`
- `chore`: `package.json` script entry

Example commit sequence (illustrative):

```
docs: add phase-1-smoke-spec.md
test(scripts): add formatTaSummary tests
feat(scripts): add wsaa smoke script with token redaction
chore: add npm run smoke entry
docs: expand README with setup, smoke test, and Claude Desktop instructions
```

5 commits total. No mixing of feat + test + docs in a single commit.

---

## 7. Acceptance Criteria

Before pushing the branch:

- [ ] `npm install` completes
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run typecheck` passes
- [ ] `npm test` all green
- [ ] Coverage > 85% on `scripts/smoke-wsaa.ts` excluding `main()`
- [ ] `npm run build` produces `dist/`
- [ ] `npm run smoke` is documented but NOT executed in CI (it requires real credentials)
- [ ] All commits follow conventional commits
- [ ] No AI signatures in any commit
- [ ] `docs/phase-1-smoke-spec.md` is committed
- [ ] No changes to `src/` (except imports from `scripts/` if needed)

After opening the PR:

- [ ] CI green
- [ ] Manual verification by the user: `npm run smoke` against real homologation credentials prints `Smoke test PASSED` and creates a cache file. (Performed by the user during review; cannot run in CI.)

---

## 8. What NOT to Do

- **Do not** add `npm run smoke` to CI. There are no real ARCA credentials in CI.
- **Do not** write a smoke script that exercises Padrón, WSFE, or WSFEX. Those services are out of
  scope for Phase 1 and authentication for them is not configured in this phase.
- **Do not** add new dependencies. `tsx` is already a devDep.
- **Do not** add interactive prompts to the smoke script. It must run unattended, given env vars.
- **Do not** modify Phase 1's `src/` code. The smoke script imports from it; that's all.
- **Do not** print the raw `token` or `sign` values, ever. Even on error.
- **Do not** add or reference real CUITs, real names, or real cert content in the README examples.
  All examples must use placeholder values (`20111111112`, `Your Name`, etc.).

---

## 9. Branch & PR Workflow

Same as prior phases:

1. `git checkout main && git pull` (after Phase 1 merged)
2. `git checkout -b phase-1-smoke`
3. Implement following section 6 commit sequence
4. Verify acceptance criteria from section 7 locally
5. Push: `git push -u origin phase-1-smoke`
6. Open PR: `gh pr create --base main --head phase-1-smoke --title "Phase 1 follow-up: smoke script and onboarding documentation"` with body containing summary + acceptance checklist + a one-line note that this is a documentation-and-tooling follow-up to Phase 1, not a new feature.
7. Do NOT merge.
8. Report: "Phase 1 smoke complete. PR opened: <URL>. Acceptance criteria checked. Awaiting review." and stop.

---

## 10. Handoff to Phase 2

Phase 2 (Padrón A13) is independent of this phase and can proceed once both Phase 1 and this
follow-up are merged. The README will gain a new entry under **Configuration** (the new tool
`arca_consultar_cuit`) and the **Status** checklist will tick off Phase 2.
