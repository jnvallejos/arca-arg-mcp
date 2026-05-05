# Phase 2 Spec — Padrón A13 (CUIT Lookup)

**Repo:** `arca-arg-mcp`
**Stack:** TypeScript, soap, fast-xml-parser, Vitest
**Approach:** TDD strict, granular commits, feature branch + PR
**Branch:** `phase-2-padron`

---

## 1. Goal of Phase 2

Implement the Padrón A13 web service. This service lets you look up the tax data of a CUIT: legal name, tax category (monotributista / responsable inscripto / etc.), registered activities, address, and current status (active / cancelled / etc.).

At the end of Phase 2:
- Server exposes a new MCP tool `arca_consultar_cuit` that accepts a CUIT and returns the person's tax data
- WSAA token for `ws_sr_padron_a13` service is fetched and cached (reuses Phase 1 layer)
- Padrón A13 SOAP responses are parsed into strongly-typed objects
- Response data is presented to the user in a clean, human-readable format
- A new smoke script `scripts/smoke-padron.ts` validates the full Padrón flow end-to-end against ARCA homologation, runnable via `npm run smoke:padron`. The aggregate `npm run smoke` runs WSAA smoke, then Padrón smoke, in sequence.
- Phase 0 and Phase 1 code is **untouched** (only `src/server.ts` modified to register the new tool, and `package.json` modified to add the new smoke script entries)

**Phase 2 does NOT yet emit invoices.** This is a read-only validation tool.

---

## 2. Why Padrón First (before WSFE)

Padrón is intentionally Phase 2, before WSFE in Phase 3. Reasons:

1. **Validates the WSAA→service auth flow end-to-end with low risk.** Padrón is read-only. If the auth flow has a bug, Padrón shows it without putting the user at risk of emitting bad invoices.
2. **Padrón is structurally simpler than WSFE.** Smaller request, smaller response, fewer edge cases. Good intermediate step.
3. **Useful tool on its own.** Validating a CUIT before invoicing is a real use case. Even if WSFE/WSFEX never get used, Padrón has independent value.
4. **Demonstrates a complete, independent ARCA WS integration.** A reviewer reading the repo at Phase 2 already has a working tool to evaluate.

---

## 3. Folder Structure

```
arca-arg-mcp/
├── docs/
│   ├── phase-0-spec.md
│   ├── phase-1-spec.md
│   ├── phase-1-smoke-spec.md
│   └── phase-2-spec.md            (NEW)
├── scripts/
│   ├── smoke-wsaa.ts               (unchanged from phase-1-smoke)
│   └── smoke-padron.ts             (NEW)
├── src/
│   ├── ... (Phase 0/1 unchanged)
│   ├── padron/
│   │   ├── client.ts               (NEW: SOAP client for Padrón A13)
│   │   ├── parser.ts               (NEW: XML response parser)
│   │   ├── formatter.ts            (NEW: human-readable text formatting)
│   │   └── types.ts                (NEW: PersonaPadron, ActividadPadron, etc.)
│   └── tools/
│       ├── ping.ts                 (unchanged)
│       ├── arca-status.ts          (unchanged)
│       └── arca-consultar-cuit.ts  (NEW)
├── tests/
│   ├── ... (existing unchanged)
│   ├── padron/
│   │   ├── client.test.ts
│   │   ├── parser.test.ts
│   │   └── formatter.test.ts
│   ├── scripts/
│   │   ├── smoke-wsaa.test.ts      (unchanged)
│   │   └── smoke-padron.test.ts    (NEW)
│   ├── tools/
│   │   └── arca-consultar-cuit.test.ts
│   └── fixtures/
│       ├── ... (existing)
│       ├── padron-persona-fisica-monotributo.xml      (NEW)
│       ├── padron-persona-juridica-ri.xml             (NEW)
│       ├── padron-persona-cancelada.xml               (NEW)
│       └── padron-cuit-not-found.xml                  (NEW)
└── package.json                    (no new deps; new scripts only)
```

---

## 4. Padrón A13 SOAP Service

### 4.1 Endpoints

- Homologation: `https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13?wsdl`
- Production: `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?wsdl`

Service name for WSAA: `ws_sr_padron_a13`

### 4.2 Operations

The Padrón A13 WSDL exposes several operations. We use only one in V1:

**`getPersona`** — Single CUIT lookup.

Request parameters:
- `token` (string) — TA token from WSAA
- `sign` (string) — TA sign from WSAA
- `cuitRepresentada` (long) — Authenticated CUIT (caller's CUIT)
- `idPersona` (long) — CUIT being queried

Returns: a complex XML structure with all the person's tax data.

Other operations (`getPersonaList_v2`, `dummy`, etc.) are NOT included in V1.

---

## 5. Implementation

### 5.1 `src/padron/types.ts`

```typescript
export type TipoPersona = 'FISICA' | 'JURIDICA';
export type EstadoClave = 'ACTIVO' | 'INACTIVO' | 'BAJA';

export interface ActividadPadron {
  idActividad: number;
  descripcionActividad: string;
  periodo: string;
  orden: number;
  nomenclador: number;
}

export interface ImpuestoPadron {
  idImpuesto: number;
  descripcionImpuesto: string;
  periodo: string;
  estado: 'ACTIVO' | 'INACTIVO' | 'BAJA';
}

export interface CategoriaMonotributo {
  descripcionCategoria: string;
  periodo: string;
}

export interface DomicilioPadron {
  direccion: string;
  localidad: string;
  codPostal: string;
  descripcionProvincia: string;
  tipoDomicilio: string;
  estado: string;
}

export interface PersonaFisicaPadron {
  tipoPersona: 'FISICA';
  cuit: string;
  estadoClave: EstadoClave;
  nombre: string;
  apellido: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  fechaNacimiento?: string;
  mesCierre?: number;
  domicilios: DomicilioPadron[];
  actividades: ActividadPadron[];
  impuestos: ImpuestoPadron[];
  categoriaMonotributo: CategoriaMonotributo | null;
}

export interface PersonaJuridicaPadron {
  tipoPersona: 'JURIDICA';
  cuit: string;
  estadoClave: EstadoClave;
  razonSocial: string;
  fechaContratoSocial?: string;
  mesCierre?: number;
  domicilios: DomicilioPadron[];
  actividades: ActividadPadron[];
  impuestos: ImpuestoPadron[];
  categoriaMonotributo: CategoriaMonotributo | null;
}

export type PersonaPadron = PersonaFisicaPadron | PersonaJuridicaPadron;
```

**Decisions:**
- Discriminated union by `tipoPersona` lets TS infer correct fields at usage sites
- `domicilios`, `actividades`, `impuestos` are arrays even when there's only one
- `categoriaMonotributo` is `null` for non-monotributistas
- All field names in **Spanish** matching the source XML to ease debugging against ARCA docs

### 5.2 `src/padron/client.ts`

```typescript
export async function getPersona(
  cuitToQuery: string,
  config: ArcaConfig,
): Promise<PersonaPadron>;
```

**Algorithm:**

1. Get TA: `const ta = await getValidToken(config, 'ws_sr_padron_a13');`
2. Create SOAP client to Padrón endpoint based on `config.env`
3. Call `getPersona({ token: ta.token, sign: ta.sign, cuitRepresentada: config.cuit, idPersona: cuitToQuery })`
4. Parse response with `parsePadronResponse(rawXml)`
5. Return parsed PersonaPadron

**Error handling:**

- SOAP fault containing "No existe persona" → throw `PadronError('NOT_FOUND', ...)`
- SOAP fault from token issue → throw `PadronError('AUTH_FAILED', ...)`
- Network/HTTP error → throw `PadronError('SERVICE_UNAVAILABLE', ...)`
- Anything else → throw `PadronError('UNKNOWN', ...)`

**No retries in V1.**

### 5.3 `src/padron/parser.ts`

```typescript
export function parsePadronResponse(xml: string): PersonaPadron;
```

Pure function. Takes raw XML string from Padrón, returns typed `PersonaPadron`.

**Implementation:**

1. Parse with `fast-xml-parser` (already a dep from Phase 1)
2. Walk the JSON tree to extract fields
3. Force `actividad`, `impuesto`, `domicilio` to always be arrays via `arrayMode` config or post-processing
4. Build the discriminated union based on `tipoPersona`
5. Apply Zod validation to the final object before returning

### 5.4 `src/padron/formatter.ts`

```typescript
export function formatPersonaForUser(persona: PersonaPadron): string;
```

**Output example for monotributista persona física:**

```
CUIT: 20-23931234-5 (ACTIVO)
Tipo: Persona física
Nombre: Vallejos Javier Nicolás
Categoría: Monotributo Categoría B (período 202401)

Domicilio fiscal:
  Jose C Paz 3634
  Ciudad Autónoma de Buenos Aires (CP 1437)

Actividades:
  - 620100 — Servicios de consultores en informática (desde 202101)

Impuestos activos:
  - Ganancias Personas Físicas (desde 202101)
```

**Output example for persona jurídica responsable inscripto:**

```
CUIT: 30-71234567-8 (ACTIVO)
Tipo: Persona jurídica (Responsable Inscripto)
Razón social: Acme S.A.

Domicilio fiscal:
  Av. Corrientes 1234
  Ciudad Autónoma de Buenos Aires (CP 1043)

Actividades:
  - 620100 — Servicios de consultores en informática (desde 202001)
  - 620900 — Servicios de informática NCP (desde 202001)

Impuestos activos:
  - IVA (desde 202001)
  - Ganancias Personas Jurídicas (desde 202001)
```

**Decisions:**
- CUIT formatted with dashes (`20-23931234-5`) for readability
- "Responsable Inscripto" derived from presence of IVA in `impuestos`
- Output is plain text, not markdown
- Capitalization adjusted from ALL CAPS to Title Case

### 5.5 `src/tools/arca-consultar-cuit.ts`

```typescript
import { z } from 'zod';

const inputSchema = z.object({
  cuit: z.string().regex(/^\d{11}$/, 'CUIT must be 11 digits'),
});

export const arcaConsultarCuitTool: Tool = {
  name: 'arca_consultar_cuit',
  description:
    "Consulta el padrón de ARCA (ex-AFIP) y devuelve los datos fiscales de un CUIT: razón social/nombre, condición tributaria, actividades, domicilio. Útil para validar un CUIT antes de facturarle.",
  inputSchema: {
    type: 'object',
    properties: {
      cuit: {
        type: 'string',
        description: '11-digit CUIT to look up. No dashes, no spaces.',
        pattern: '^\\d{11}$',
      },
    },
    required: ['cuit'],
  },
};

export async function handleArcaConsultarCuit(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { cuit } = inputSchema.parse(args);

  try {
    const persona = await getPersona(cuit, config);
    return {
      content: [
        { type: 'text', text: formatPersonaForUser(persona) },
      ],
    };
  } catch (error) {
    if (error instanceof PadronError) {
      const msg = friendlyErrorMessage(error, cuit);
      return { content: [{ type: 'text', text: msg }] };
    }
    throw error;
  }
}
```

### 5.6 `src/server.ts` registration

Add `arca_consultar_cuit` to the tool registry. Wire `handleArcaConsultarCuit(config, args)` to be called when the tool is invoked. No other changes to `src/server.ts`.

---

## 6. Smoke Script — Padrón

Phase 1's smoke script is `scripts/smoke-wsaa.ts`. Phase 2 adds **`scripts/smoke-padron.ts`** alongside it. They are independent files. The pattern: one smoke script per feature.

### 6.1 What it does

`scripts/smoke-padron.ts` is a standalone Node script that:

1. Loads ARCA configuration via `loadConfig` (reuses Phase 1 helper).
2. Reads a CUIT to query from the env var `SMOKE_CUIT`. If not set, falls back to `config.cuit` (the caller's own CUIT — every CUIT can look itself up).
3. Calls `getPersona(cuitToQuery, config)` from `src/padron/client.ts`.
4. Prints a redacted summary of the returned `PersonaPadron` to stdout.
5. Exits with code 0 on success, non-zero on any failure.

### 6.2 Output format

On success (persona física monotributista, abbreviated):

```
[smoke-padron] Loading config...
[smoke-padron] env=homologation cuit=20111111112
[smoke-padron] Looking up CUIT: 20111111112
[smoke-padron] Persona retrieved:
[smoke-padron]   tipoPersona:    FISICA
[smoke-padron]   cuit:           20111111112
[smoke-padron]   estadoClave:    ACTIVO
[smoke-padron]   nombre:         (1 chars, redacted)
[smoke-padron]   apellido:       (1 chars, redacted)
[smoke-padron]   domicilios:     1
[smoke-padron]   actividades:    2
[smoke-padron]   impuestos:      3
[smoke-padron]   monotributo:    yes (Categoría B)
[smoke-padron] Smoke test PASSED
```

For persona jurídica:
- `nombre` / `apellido` lines are replaced by `razonSocial: (N chars, redacted)`.

### 6.3 What it must NOT do

- Must not print the full `nombre`, `apellido`, or `razonSocial`. Length only, with `(N chars, redacted)`.
- Must not print full domicilio strings. Counts only.
- Must not print actividad descriptions. Counts only.
- Must not print impuesto descriptions. Counts only.
- Must not require any new dependencies.
- Must not modify `src/`.
- Must not invoke `getPersona` for any CUIT other than what env vars dictate.

### 6.4 Why redaction matters

Even in homologation, CUIT lookups can return real-looking data. The smoke output is meant to verify the **shape** of the response and confirm parsing works, not to display PII. A reviewer looking at terminal scrollback should not see names.

### 6.5 Pure formatter

Same pattern as Phase 1's `formatTaSummary`. Factor:

```typescript
export function formatPersonaSummary(persona: PersonaPadron): string[];
```

Pure function returning the body lines (the part after `[smoke-padron] `). Tested in isolation. The redaction logic (showing lengths instead of values) is the centerpiece of the unit tests.

### 6.6 `package.json` scripts

Replace the current single `smoke` entry with:

```json
"smoke": "npm run smoke:wsaa && npm run smoke:padron",
"smoke:wsaa": "tsx scripts/smoke-wsaa.ts",
"smoke:padron": "tsx scripts/smoke-padron.ts"
```

`npm run smoke` runs both in sequence, fail-fast (the `&&` chain stops if WSAA smoke fails). Each individual smoke remains runnable on its own. No new deps.

### 6.7 Tests

`tests/scripts/smoke-padron.test.ts` covers `formatPersonaSummary`. Tests include:

```
describe formatPersonaSummary
  formats persona física with length-redacted nombre and apellido
  formats persona jurídica with length-redacted razonSocial
  redacts the entire nombre even if it is a single character
  reports correct counts for domicilios, actividades, impuestos
  reports monotributo as "yes (<categoría>)" when present
  reports monotributo as "no" when categoriaMonotributo is null
  NEVER includes the literal nombre, apellido, or razonSocial values
  starts with the "Persona retrieved:" header line
```

Coverage target: 100% on `formatPersonaSummary`. The `main()` function of `smoke-padron.ts` is excluded from coverage with `/* v8 ignore start */` / `/* v8 ignore stop */`, same pattern as Phase 1's smoke.

`vitest.config.ts` already includes `scripts/**/*.ts` in coverage from Phase 1's smoke spec. No changes needed.

---

## 7. Test Strategy

Same approach as Phase 1: unit tests, fixture-based integration tests, no live ARCA calls in CI.

### 7.1 Test fixtures

`tests/fixtures/`:

- `padron-persona-fisica-monotributo.xml` — Realistic response for a monotributista (sanitized to fake CUIT and name)
- `padron-persona-juridica-ri.xml` — Persona jurídica RI with multiple actividades and impuestos
- `padron-persona-cancelada.xml` — `estadoClave=BAJA`
- `padron-cuit-not-found.xml` — SOAP fault for not-found case

All fixtures must use only fake data (placeholder CUITs `20111111112`, `30711111119`, generic names like `JUAN PEREZ`, `ACME SA`, etc.). No real-looking content.

### 7.2 Unit tests

#### `tests/padron/parser.test.ts`

```
describe parsePadronResponse
  parses a persona física monotributista correctly
  parses a persona jurídica RI correctly
  parses a persona with multiple actividades
  parses a persona with multiple impuestos
  parses a persona with no categoriaMonotributo (RI case)
  handles single-element actividad as array
  handles single-element impuesto as array
  handles single-element domicilio as array
  throws on malformed XML
  throws on missing required field (idPersona)
  throws on unknown tipoPersona value
  preserves field-level data fidelity (compares all fields against fixture)
```

#### `tests/padron/client.test.ts`

```
describe getPersona
  passes the correct service name to getValidToken
  builds correct SOAP request with token, sign, cuitRepresentada, idPersona
  parses successful response
  throws PadronError with code NOT_FOUND on "No existe persona" fault
  throws PadronError with code AUTH_FAILED on token-related fault
  throws PadronError with code SERVICE_UNAVAILABLE on HTTP 500
  throws PadronError with code UNKNOWN on unrecognized fault
```

Mocks: `getValidToken` returns canned TA, `soap` client returns fixture XML.

#### `tests/padron/formatter.test.ts`

```
describe formatPersonaForUser
  formats persona física monotributista with all sections
  formats persona jurídica RI without monotributo section
  formats CUIT with dashes
  capitalizes names from ALL CAPS to Title Case
  shows BAJA status prominently when estadoClave is BAJA
  handles missing optional fields gracefully (no "undefined" in output)
  uses ARG locale for date formatting
```

#### `tests/tools/arca-consultar-cuit.test.ts`

```
describe arca_consultar_cuit tool
  rejects CUIT with dashes
  rejects CUIT shorter than 11 digits
  rejects CUIT longer than 11 digits
  rejects non-numeric CUIT
  returns formatted persona on successful lookup
  returns friendly "no encontrado" message on PadronError NOT_FOUND
  propagates other errors to caller
```

---

## 8. Commit Convention — Phase 2

Same Conventional Commits. Allowed scopes for this phase:

- `padron`: `src/padron/*`
- `tools`: `src/tools/*`, including server registration
- `scripts`: `scripts/*`
- `lib`: `src/lib/*` (for new `PadronError` class)
- `docs`: `docs/*`, README updates
- `chore`: `package.json`, config tweaks
- `test`: any test file (test-only commits use this scope)

**Granularity:** TDD pair = one commit. Test commit immediately precedes implementation.

**Example commit sequence (illustrative, ~22 commits):**

```
docs: add phase-2-spec.md
feat(lib): add padronerror class extending arcaerror
test(padron): add padron type definitions tests
feat(padron): add types for personapadron discriminated union
test(padron): add response parser tests for persona fisica
feat(padron): implement parser for persona fisica responses
test(padron): add response parser tests for persona juridica
feat(padron): extend parser to handle persona juridica
test(padron): add multi-actividad and multi-impuesto parsing tests
feat(padron): handle array normalization in parser
test(padron): add formatter tests
feat(padron): implement human-readable formatter
test(padron): add soap client tests with mocked wsaa token
feat(padron): implement padron a13 soap client
test(padron): add error mapping tests
feat(padron): map soap faults to typed padronerror
test(tools): add arca_consultar_cuit tool tests
feat(tools): implement arca_consultar_cuit tool
feat(server): register arca_consultar_cuit in mcp server
test(scripts): add formatpersonasummary tests
feat(scripts): add padron smoke script with redacted output
chore: split smoke into smoke:wsaa and smoke:padron
docs: document npm run smoke:padron in readme
```

A trailing `chore` for biome auto-fix is acceptable if needed.

---

## 9. What NOT to Do in Phase 2

- **Do not** modify Phase 0 or Phase 1 code beyond:
  - registering the new tool in `src/server.ts`
  - splitting the `smoke` script entry in `package.json`
- **Do not** implement WSFE, WSFEX, or any other ARCA service. Phase 3+.
- **Do not** add `getPersonaList_v2` (batch lookup). V1 is single-CUIT only.
- **Do not** add `dummy` (Padrón ping) operation.
- **Do not** add caching of Padrón responses.
- **Do not** add formatting variations (JSON output, markdown table, etc.). One format per tool in V1.
- **Do not** add NPM packages.
- **Do not** parallel-fetch multiple CUITs even if the LLM passes an array.
- **Do not** print full nombre, apellido, razonSocial, domicilios, actividades, or impuestos in the smoke script output. Lengths and counts only.
- **Do not** wire `npm run smoke` (or `smoke:padron`) into CI.

---

## 10. Acceptance Criteria for Phase 2

Before opening the PR:

- [ ] `npm install` clean
- [ ] `npm run lint` zero warnings
- [ ] `npm run typecheck` zero errors
- [ ] `npm test` all green
- [ ] Coverage >85% on `src/padron/`, `src/tools/arca-consultar-cuit.ts`, `scripts/smoke-padron.ts` (excluding `main()`)
- [ ] `npm run build` produces `dist/`
- [ ] All Padrón fixtures committed under `tests/fixtures/` with sanitized data
- [ ] `tests/fixtures/README.md` updated to document new Padrón fixtures
- [ ] All commits follow conventional commits with allowed scopes
- [ ] No AI signatures in any commit
- [ ] `docs/phase-2-spec.md` is committed
- [ ] Phase 0 and Phase 1 code unchanged in this PR diff except (a) `src/server.ts` to register the new tool, (b) `package.json` to split the smoke script entries
- [ ] README updated with `arca_consultar_cuit` tool entry and `npm run smoke:padron` command
- [ ] PR opened on branch `phase-2-padron` against `main`, NOT merged

After opening the PR:

- [ ] CI green
- [ ] Manual verification by the user: `npm run smoke:padron` against real homologation credentials with `SMOKE_CUIT=<your-cuit>` (or default to caller's own CUIT) prints `Smoke test PASSED`. (Performed by the user during review; cannot run in CI.)

---

## 11. Branch & PR Workflow — Phase 2

Same pattern as Phase 1:

1. `git checkout main && git pull`
2. `git checkout -b phase-2-padron`
3. Implement following section 8 commit sequence
4. Verify acceptance criteria from section 10 locally
5. Push: `git push -u origin phase-2-padron`
6. Open PR: `gh pr create --base main --head phase-2-padron --title "Phase 2: Padrón A13 CUIT lookup"` with body containing summary + acceptance checklist + note "Adds CUIT lookup tool. Validates the WSAA→service auth flow end-to-end before WSFE in Phase 3."
7. Do NOT merge.
8. Report: "Phase 2 complete. PR opened: <URL>. Acceptance criteria checked. Awaiting review." and stop.

---

## 12. Handoff to Phase 3 (preview, not in scope)

Phase 3 will add:
- WSFE (wsfev1) SOAP client
- Tool `arca_emitir_factura` for issuing Factura A, B, or C
- Tool `arca_obtener_ultimo_comprobante` to get last comprobante number
- Tool `arca_consultar_comprobante` to retrieve a specific comprobante
- A new `scripts/smoke-wsfe.ts` and `npm run smoke:wsfe` entry, chained into `npm run smoke`

Phase 2 stays focused. No WSFE anticipation.
