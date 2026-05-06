# Phase 3 Spec — WSFE (Factura A, B, C)

**Repo:** `arca-arg-mcp`
**Stack:** TypeScript, soap, fast-xml-parser, Vitest
**Approach:** TDD strict, granular commits, feature branch + PR
**Branch:** `phase-3-wsfe`

---

## 1. Goal of Phase 3

Implement WSFE (Web Service de Facturación Electrónica), the ARCA service used to authorize electronic invoices Type A, B, and C — the bread-and-butter use case for Argentine monotributistas and small Responsables Inscriptos.

At the end of Phase 3:
- Server exposes 4 new MCP tools:
  - `arca_emitir_factura` — issue a new invoice (Factura A, B, or C)
  - `arca_obtener_ultimo_comprobante` — query the last authorized invoice number for a given punto de venta + tipo
  - `arca_consultar_comprobante` — retrieve full details (including CAE) for an existing invoice
  - `arca_listar_tipos_comprobante` — list the invoice types this server supports
- WSAA token for `wsfe` is fetched and cached (reuses Phase 1 layer; no changes to Phase 1 code)
- WSFE SOAP responses parsed into strongly-typed objects with discriminated unions for success vs rejection vs validation errors
- Friendly Spanish-language output for the LLM, with hints attached to common WSFE error codes
- New smoke script `scripts/smoke-wsfe.ts` performs an end-to-end real invoice emission against ARCA homologation. The aggregate `npm run smoke` runs `wsaa → padron → wsfe` in sequence.
- Phase 0/1/2 code is **untouched** (only `src/server.ts` modified to register new tools, `package.json` modified to chain the new smoke entry)

**Out of scope for Phase 3 (deferred to Phase 3.5 — see `arca-arg-mcp-profile.md` "Backlog post-V1"):**
- Notas de Crédito (tipos 3, 8, 13)
- Notas de Débito (tipos 2, 7, 12)
- Comprobantes asociados (the WSFE field exists but is not exposed in the MCP tool input)

---

## 2. WSFE Background

### 2.1 What WSFE does

WSFE (`wsfev1`) takes a request describing one or more invoices and returns a **CAE** (Código de Autorización Electrónico) for each authorized one, plus rejection reasons for any that fail validation. The CAE is what makes the invoice fiscally valid.

### 2.2 Endpoints

- Homologation: `https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL`
- Production: `https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL`

Service name for WSAA: `wsfe`

### 2.3 Operations used in V1

| Operation | Purpose | Tool that uses it |
|---|---|---|
| `FECAESolicitar` | Request CAE for a new invoice | `arca_emitir_factura` |
| `FECompUltimoAutorizado` | Get last authorized number | `arca_obtener_ultimo_comprobante` |
| `FECompConsultar` | Retrieve a previously emitted invoice | `arca_consultar_comprobante` |
| `FEParamGetTiposCbte` | (Not called; we use a static table) | `arca_listar_tipos_comprobante` |

`FEDummy` (health check) is not used. `arca_status` already covers diagnostics.

### 2.4 Invoice types in V1

Only these types are exposed:

| Código | Tipo | Issuer | Receiver |
|---|---|---|---|
| 1 | Factura A | Responsable Inscripto | RI / Monotributo (with conditions) |
| 6 | Factura B | Responsable Inscripto | Consumidor Final / Exento / etc. |
| 11 | Factura C | Monotributista | Anyone |

### 2.5 Concept (Concepto)

Each invoice has a "concepto" describing what's being invoiced. **All three are supported in V1:**

- `1` — Productos
- `2` — Servicios
- `3` — Productos y servicios

For `2` and `3`, three additional date fields are required: `FchServDesde`, `FchServHasta`, `FchVtoPago`. The MCP tool input collects them only when relevant.

### 2.6 IVA (VAT)

Factura A and B include IVA. The Argentine alícuotas (rates) and their WSFE codes:

| Alícuota label | WSFE code |
|---|---|
| `0` | 3 |
| `2.5` | 9 |
| `5` | 8 |
| `10.5` | 4 |
| `21` | 5 |
| `27` | 6 |

Factura C (monotributista) does NOT carry IVA — the request must omit the `Iva` array entirely.

### 2.7 Currency

V1 supports only **PES** (Argentine pesos). Foreign currency on Factura A/B/C is rare and adds complexity (`MonCotiz` field, exchange-rate lookup). Foreign currency belongs in WSFEX (Phase 4), which is the natural home for export invoices.

The MCP tool input does not expose currency at all in V1. Internally, the request is built with `MonId='PES'` and `MonCotiz=1`.

### 2.8 Document type of receiver

WSFE codes for the receiver's document type:

| Código | Document |
|---|---|
| 80 | CUIT |
| 86 | CUIL |
| 87 | CDI (Clave de Identificación) |
| 89 | LE (Libreta de Enrolamiento) |
| 90 | LC (Libreta Cívica) |
| 91 | CI Extranjera |
| 96 | DNI |
| 99 | Consumidor Final / Sin identificar |

V1 supports all of these on input. For Factura B with low totals, `99` (Consumidor Final, document number `0`) is the common case.

### 2.9 Tributos

`Tributos` is an optional collection in the request (e.g. impuestos internos, percepciones provinciales). **Out of scope for V1.** The tool input does not expose it; the request always sends an empty `Tributos` array. If a user needs tributos, that is V2.

### 2.10 Condición Frente al IVA del Receptor (RG 5616)

Resolución General N° 5616 (in force in production) makes the receiver's IVA condition mandatory for every comprobante. The field is sent in WSFE as `CondicionIVAReceptorId`. Without it, ARCA rejects the comprobante with observation code `10246`:

> "Campo Condicion Frente al IVA del receptor es obligatorio conforme a lo reglamentado por la Resolucion General Nro 5616. Para mas informacion consular metodo FEParamGetCondicionIvaReceptor"

The 11 codes accepted by `FEParamGetCondicionIvaReceptor`:

| Código | Condición |
|---|---|
| 1 | IVA Responsable Inscripto |
| 4 | IVA Sujeto Exento |
| 5 | Consumidor Final |
| 6 | Responsable Monotributo |
| 7 | Sujeto No Categorizado |
| 8 | Proveedor del Exterior |
| 9 | Cliente del Exterior |
| 10 | IVA Liberado - Ley Nº 19.640 |
| 13 | Monotributista Social |
| 15 | IVA No Alcanzado |
| 16 | Monotributo Trabajador Independiente Promovido |

**Decisions:**

- The field is **mandatory** in the tool input (`condicionIvaReceptor`). No defaults, no auto-fill based on `tipoDocReceptor`. Explicit > implicit. The LLM (or human caller) must supply it.
- **No cross-validation** between `tipoComprobante` and `condicionIvaReceptor` in our code. ARCA owns the matrix of which condición is allowed for which tipo de comprobante and may change it. We pass the value through and let ARCA reject if invalid; the error hint table surfaces 10246 clearly if ARCA ever returns it.
- Static table — never queried at runtime via `FEParamGetCondicionIvaReceptor`.

---

## 3. Folder Structure

```
arca-arg-mcp/
├── docs/
│   ├── ... (existing)
│   └── phase-3-spec.md            (NEW)
├── scripts/
│   ├── smoke-wsaa.ts               (unchanged)
│   ├── smoke-padron.ts             (unchanged)
│   └── smoke-wsfe.ts               (NEW)
├── src/
│   ├── ... (Phase 0/1/2 unchanged)
│   ├── wsfe/
│   │   ├── codes.ts                (NEW: tipos comprobante, alicuotas IVA, doc types)
│   │   ├── errors.ts               (NEW: hint table for known WSFE codes)
│   │   ├── builder.ts              (NEW: builds FECAERequest from tool input)
│   │   ├── parser.ts               (NEW: parses FECAESolicitar/FECompUltimoAutorizado/FECompConsultar responses)
│   │   ├── formatter.ts            (NEW: human-readable Spanish output)
│   │   ├── client.ts               (NEW: SOAP client for the 3 used operations)
│   │   └── types.ts                (NEW: input/output types, discriminated unions)
│   └── tools/
│       ├── ... (existing unchanged)
│       ├── arca-emitir-factura.ts                   (NEW)
│       ├── arca-obtener-ultimo-comprobante.ts       (NEW)
│       ├── arca-consultar-comprobante.ts            (NEW)
│       └── arca-listar-tipos-comprobante.ts         (NEW)
├── tests/
│   ├── ... (existing)
│   ├── wsfe/
│   │   ├── codes.test.ts
│   │   ├── errors.test.ts
│   │   ├── builder.test.ts
│   │   ├── parser.test.ts
│   │   ├── formatter.test.ts
│   │   └── client.test.ts
│   ├── tools/
│   │   ├── arca-emitir-factura.test.ts
│   │   ├── arca-obtener-ultimo-comprobante.test.ts
│   │   ├── arca-consultar-comprobante.test.ts
│   │   └── arca-listar-tipos-comprobante.test.ts
│   ├── scripts/
│   │   └── smoke-wsfe.test.ts                       (NEW)
│   └── fixtures/
│       ├── ... (existing)
│       ├── wsfe-fecae-success.xml                   (NEW)
│       ├── wsfe-fecae-success-with-observations.xml (NEW)
│       ├── wsfe-fecae-rejected.xml                  (NEW)
│       ├── wsfe-fecae-error-validacion.xml          (NEW)
│       ├── wsfe-fecomp-consultar-found.xml          (NEW)
│       ├── wsfe-fecomp-consultar-not-found.xml      (NEW)
│       └── wsfe-fecomp-ultimo-autorizado.xml        (NEW)
└── package.json                    (no new deps; new smoke entry only)
```

---

## 4. Type System

### 4.1 `src/wsfe/types.ts`

```typescript
export type TipoComprobante = 1 | 6 | 11;       // V1: Factura A, B, C only
export type Concepto = 1 | 2 | 3;
export type TipoDocReceptor = 80 | 86 | 87 | 89 | 90 | 91 | 96 | 99;
export type AlicuotaIva = '0' | '2.5' | '5' | '10.5' | '21' | '27';
/** Condición frente al IVA del receptor (RG 5616). */
export type CondicionIvaReceptor = 1 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 13 | 15 | 16;

export interface IvaItem {
  alicuota: AlicuotaIva;
  baseImponible: number;   // ARS amount before IVA
  importe: number;         // IVA amount
}

/** Input passed by the LLM to `arca_emitir_factura`. */
export interface EmitirFacturaInput {
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
  numeroComprobante?: number;       // optional; if absent, server fetches last+1
  concepto: Concepto;
  tipoDocReceptor: TipoDocReceptor;
  numeroDocReceptor: string;        // for ConsumidorFinal (99): '0'
  condicionIvaReceptor: CondicionIvaReceptor; // mandatory per RG 5616
  fechaComprobante: string;         // YYYY-MM-DD
  importeNeto: number;              // ARS, for IVA-bearing invoices (Factura A/B); omit for C
  iva?: IvaItem[];                  // omit for Factura C
  importeTotal: number;             // ARS, includes IVA + tributos
  importeExento?: number;           // ARS amount exempt from IVA
  importeNoGravado?: number;        // ARS amount not subject to IVA
  servicio?: {                      // required when concepto is 2 or 3
    fechaDesde: string;             // YYYY-MM-DD
    fechaHasta: string;             // YYYY-MM-DD
    fechaVencimientoPago: string;   // YYYY-MM-DD
  };
}

/** Successful CAE response. */
export interface ComprobanteAutorizado {
  status: 'aprobado';
  cae: string;
  fechaVencimientoCae: string;      // YYYY-MM-DD
  numeroComprobante: number;
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
  fechaComprobante: string;
  observaciones: ObservacionWsfe[]; // may be present even on success
}

/** Rejected by ARCA business rules (the call succeeded but the comprobante was not authorized). */
export interface ComprobanteRechazado {
  status: 'rechazado';
  observaciones: ObservacionWsfe[];
  errores: ObservacionWsfe[];
  numeroComprobante: number;
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
}

export type ResultadoEmision = ComprobanteAutorizado | ComprobanteRechazado;

export interface ObservacionWsfe {
  code: number;     // ARCA's numeric code (e.g. 10017)
  message: string;  // ARCA's literal text
}

/** Output of `arca_obtener_ultimo_comprobante`. */
export interface UltimoComprobante {
  puntoVenta: number;
  tipoComprobante: TipoComprobante;
  numero: number;   // 0 if no invoice has been issued for this PV+tipo
}

/** Output of `arca_consultar_comprobante`. Mirrors `ComprobanteAutorizado` in shape. */
export interface ComprobanteConsultado {
  numeroComprobante: number;
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
  fechaComprobante: string;
  cae: string;
  fechaVencimientoCae: string;
  importeTotal: number;
  // ...other fields as returned by FECompConsultar
}
```

**Decisions:**
- Discriminated union `ResultadoEmision` lets callers branch on `status` cleanly. ARCA can return "rejected" without throwing — this is not an exception, it is a business outcome.
- `iva` is optional in the input; mandatory if `tipoComprobante` is 1 or 6 (Factura A/B), forbidden if it is 11 (Factura C). Validation enforces this in the tool layer.
- All field names in input are TypeScript-friendly camelCase. The builder translates to WSFE's bizarre PascalCase (`CbteDesde`, `MonId`, etc.).

### 4.2 `src/wsfe/codes.ts`

```typescript
export const TIPOS_COMPROBANTE_V1 = {
  1: { name: 'Factura A', issuer: 'Responsable Inscripto' },
  6: { name: 'Factura B', issuer: 'Responsable Inscripto' },
  11: { name: 'Factura C', issuer: 'Monotributista' },
} as const;

export const ALICUOTAS_IVA_CODE: Record<AlicuotaIva, number> = {
  '0': 3,
  '2.5': 9,
  '5': 8,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

export const TIPOS_DOC_RECEPTOR = {
  80: 'CUIT',
  86: 'CUIL',
  87: 'CDI',
  89: 'LE',
  90: 'LC',
  91: 'CI Extranjera',
  96: 'DNI',
  99: 'Consumidor Final / Sin identificar',
} as const;
```

These are static tables — never fetched at runtime. ARCA changes them rarely; if they do, it's a one-line PR.

### 4.3 `src/wsfe/errors.ts`

A small lookup of the most common WSFE error codes with hints for the LLM, so when ARCA returns "Error 10017", the user gets a Spanish explanation of what likely happened.

```typescript
export const WSFE_ERROR_HINTS: Record<number, string> = {
  10015: 'El CUIT del receptor no está registrado en el padrón de ARCA.',
  10016: 'La fecha del comprobante está fuera del rango permitido (10 días anteriores o posteriores a hoy).',
  10017: 'El número de comprobante no es el siguiente esperado. Probá con `arca_obtener_ultimo_comprobante` para conocer el próximo correcto.',
  10018: 'Los importes no coinciden: importeTotal debe ser igual a importeNeto + suma de IVAs + importeExento + importeNoGravado.',
  10019: 'El receptor no admite ese tipo de comprobante (por ejemplo, Consumidor Final no admite Factura A con totales altos).',
  10048: 'Para concepto 2 (Servicios) o 3 (Productos y Servicios) hay que enviar fecha de servicio desde, hasta y vencimiento de pago.',
  // ...the rest are added as we encounter them in real homologation calls
};

export function describeWsfeError(code: number, originalMessage: string): string {
  const hint = WSFE_ERROR_HINTS[code];
  if (!hint) return originalMessage;
  return `${originalMessage}\n💡 ${hint}`;
}
```

This is the **only** place the codebase uses the lightbulb emoji. Same applies to the formatter's `✅` and `❌`. Tests assert these emojis appear in user-facing tool output and never in commit messages or stderr logs.

---

## 5. Implementation

### 5.1 `src/wsfe/builder.ts`

```typescript
export function buildFeCaeRequest(
  input: EmitirFacturaInput,
  authenticatedCuit: string,
  numeroComprobante: number,
): FeCaeRequest;
```

Pure function. Takes the validated input plus the authenticated CUIT and an explicit comprobante number, returns the WSFE request payload (a JS object that `soap` will serialize to XML).

**Algorithm:**

1. Convert all dates from `YYYY-MM-DD` to WSFE's `YYYYMMDD` format
2. Build the `Iva` array (only if Factura A/B)
3. Build the request envelope:
   - `FeCabReq` (header): CantReg=1, PtoVta, CbteTipo
   - `FeDetReq.FECAEDetRequest`: one entry with all the fields
4. Force `MonId='PES'`, `MonCotiz=1`
5. Force `Tributos` empty
6. Include service dates only when concepto is 2 or 3

**Decisions:**
- The builder accepts `numeroComprobante` as a parameter (not from input). Resolution of "what number is next?" lives in the tool layer, which calls `arca_obtener_ultimo_comprobante` if needed. The builder is dumb on purpose.
- All numeric fields in WSFE expect specific decimal places (typically 2). The builder rounds defensively to 2 decimals using a helper, never trusts the input to be pre-rounded.

### 5.2 `src/wsfe/parser.ts`

```typescript
export function parseFeCaeResponse(rawResponse: unknown): ResultadoEmision;
export function parseFeCompConsultarResponse(rawResponse: unknown): ComprobanteConsultado;
export function parseFeCompUltimoAutorizadoResponse(rawResponse: unknown): UltimoComprobante;
```

Pure functions over the SOAP response object (`soap` library returns a parsed JS structure, not raw XML — but for ARCA's quirks we sometimes need fast-xml-parser as a fallback; tests use whichever is appropriate).

**FECAESolicitar response handling:**

ARCA returns a `FeDetResp.FECAEDetResponse` array even for single comprobantes (always force-array, same pattern as Padrón). Each element has a `Resultado` field with values:
- `'A'` (Aprobado) → `ComprobanteAutorizado`
- `'R'` (Rechazado) → `ComprobanteRechazado`
- `'P'` (Parcial) → treat as `ComprobanteRechazado` for V1; the partial-approval flow is too rare to handle properly in V1

`Observaciones` and `Errores` may both be present even on success (warnings). The parser preserves them.

### 5.3 `src/wsfe/formatter.ts`

```typescript
export function formatResultadoEmision(r: ResultadoEmision): string;
export function formatComprobanteConsultado(c: ComprobanteConsultado): string;
export function formatUltimoComprobante(u: UltimoComprobante): string;
export function formatTiposComprobanteList(): string;
```

Pure functions producing Spanish-language plain-text output. Examples:

**Successful emission:**

```
✅ Factura emitida con éxito

Tipo: Factura B
Punto de venta: 0001
Número: 00012345
Fecha: 15/04/2026

Importe total: $ 100.000,00

CAE: 75123456789012
Vencimiento del CAE: 25/04/2026
```

**Rejected emission:**

```
❌ Factura rechazada por ARCA

Tipo: Factura B
Punto de venta: 0001
Número intentado: 00012346

Errores:
  - 10017: El número de comprobante no es el siguiente esperado.
    💡 Probá con `arca_obtener_ultimo_comprobante` para conocer el próximo correcto.
```

**Successful with observations:**

The output starts with the `✅` block, followed by a `Observaciones de ARCA:` section listing each one.

**Decisions:**
- Argentine number formatting (`$ 100.000,00`, period thousands, comma decimal). Use `Intl.NumberFormat('es-AR', ...)`.
- Argentine date formatting `DD/MM/YYYY`. Same helper as Padrón formatter (extracted to `src/lib/format.ts` if duplication grows; otherwise inlined).

### 5.4 `src/wsfe/client.ts`

```typescript
export async function feCaeSolicitar(
  request: FeCaeRequest,
  config: ArcaConfig,
): Promise<ResultadoEmision>;

export async function feCompUltimoAutorizado(
  puntoVenta: number,
  tipoComprobante: TipoComprobante,
  config: ArcaConfig,
): Promise<UltimoComprobante>;

export async function feCompConsultar(
  puntoVenta: number,
  tipoComprobante: TipoComprobante,
  numeroComprobante: number,
  config: ArcaConfig,
): Promise<ComprobanteConsultado>;
```

**Algorithm (shared across the three):**

1. Get TA: `const ta = await getValidToken(config, 'wsfe');`
2. Build the `Auth` envelope: `{ Token: ta.token, Sign: ta.sign, Cuit: config.cuit }`
3. Create soap client to WSFE endpoint
4. Call the appropriate operation
5. Parse and return

**Error handling:**

- Network/HTTP errors → `WsfeError('SERVICE_UNAVAILABLE', ...)`
- Auth-related faults → `WsfeError('AUTH_FAILED', ...)`
- Comprobante-not-found in `feCompConsultar` → `WsfeError('NOT_FOUND', ...)`
- Anything else → `WsfeError('UNKNOWN', ...)`
- Note: business rejections (`Resultado='R'`) do NOT throw. They return a `ComprobanteRechazado`. Throwing is reserved for genuine errors.

**No retries in V1.** Same policy as Padrón.

### 5.5 Tools

#### 5.5.1 `arca_emitir_factura`

Input schema (Zod):

```typescript
const inputSchema = z.object({
  tipoComprobante: z.union([z.literal(1), z.literal(6), z.literal(11)]),
  puntoVenta: z.number().int().positive(),
  numeroComprobante: z.number().int().positive().optional(),
  concepto: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  tipoDocReceptor: z.union([
    z.literal(80), z.literal(86), z.literal(87), z.literal(89),
    z.literal(90), z.literal(91), z.literal(96), z.literal(99),
  ]),
  numeroDocReceptor: z.string().regex(/^\d+$/),
  condicionIvaReceptor: z.union([
    z.literal(1), z.literal(4), z.literal(5), z.literal(6), z.literal(7),
    z.literal(8), z.literal(9), z.literal(10), z.literal(13), z.literal(15), z.literal(16),
  ]),
  fechaComprobante: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  importeNeto: z.number().nonnegative(),
  iva: z.array(z.object({
    alicuota: z.enum(['0', '2.5', '5', '10.5', '21', '27']),
    baseImponible: z.number().nonnegative(),
    importe: z.number().nonnegative(),
  })).optional(),
  importeTotal: z.number().nonnegative(),
  importeExento: z.number().nonnegative().optional(),
  importeNoGravado: z.number().nonnegative().optional(),
  servicio: z.object({
    fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fechaVencimientoPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional(),
}).superRefine((input, ctx) => {
  if (input.tipoComprobante === 11 && input.iva) {
    ctx.addIssue({ code: 'custom', message: 'Factura C does not carry IVA; remove the iva array.' });
  }
  if ((input.tipoComprobante === 1 || input.tipoComprobante === 6) && !input.iva) {
    ctx.addIssue({ code: 'custom', message: 'Factura A and B require an iva array.' });
  }
  if ((input.concepto === 2 || input.concepto === 3) && !input.servicio) {
    ctx.addIssue({ code: 'custom', message: 'Concepto 2 or 3 requires service dates.' });
  }
  if (input.concepto === 1 && input.servicio) {
    ctx.addIssue({ code: 'custom', message: 'Concepto 1 (Productos) must not include service dates.' });
  }
});
```

Handler algorithm:

1. Validate input with Zod
2. Resolve `numeroComprobante`:
   - If input has it, use it
   - Otherwise, call `feCompUltimoAutorizado(puntoVenta, tipoComprobante, config)` and use `result.numero + 1`
3. Build request via `buildFeCaeRequest`
4. Call `feCaeSolicitar`
5. Format with `formatResultadoEmision`
6. Return `{ content: [{ type: 'text', text }] }`

**Decision:** the auto-resolve of `numeroComprobante` is a quality-of-life feature. The LLM rarely knows the right number; making the tool look it up automatically reduces error rates dramatically.

#### 5.5.2 `arca_obtener_ultimo_comprobante`

Input:
```typescript
{ puntoVenta: number, tipoComprobante: 1 | 6 | 11 }
```

Handler: validate, call client, format. Output example:

```
Último número autorizado para Factura B en punto de venta 0001: 00012345
```

#### 5.5.3 `arca_consultar_comprobante`

Input:
```typescript
{ puntoVenta: number, tipoComprobante: 1 | 6 | 11, numeroComprobante: number }
```

Handler: validate, call client, format. Output mirrors the successful-emission format but with header `Detalle del comprobante:`.

If WSFE returns "comprobante no existe", surface as friendly text rather than throwing:

```
No se encontró el comprobante Factura B 0001-00099999.
```

#### 5.5.4 `arca_listar_tipos_comprobante`

No input (`z.object({}).strict()`). Returns the static table:

```
Tipos de comprobante soportados por este servidor (V1):

| Código | Tipo        | Emisor                     |
|--------|-------------|----------------------------|
| 1      | Factura A   | Responsable Inscripto      |
| 6      | Factura B   | Responsable Inscripto      |
| 11     | Factura C   | Monotributista             |

Notas de Crédito y Notas de Débito no están disponibles en V1.
```

**Decision:** this tool exists specifically so the LLM does not have to invent codes. When the user says "emití una factura", the LLM lists this first to clarify which type, then calls `arca_emitir_factura`.

### 5.6 `src/server.ts` registration

Four single-line additions to register the new tools and route them in `CallToolRequestSchema`. Same pattern as Phase 2.

---

## 6. Smoke Script — WSFE

`scripts/smoke-wsfe.ts` performs a real end-to-end invoice emission against ARCA homologation.

### 6.1 What it does

1. Loads ARCA configuration via `loadConfig`
2. Calls `feCompUltimoAutorizado` to find the next number
3. Builds a minimal Factura B request with hardcoded sane defaults:
   - `puntoVenta`: from env var `SMOKE_PV` (default `1`)
   - `tipoComprobante`: `6` (Factura B)
   - `concepto`: `1` (Productos)
   - Receiver: `tipoDocReceptor=99, numeroDocReceptor='0'` (Consumidor Final)
   - `fechaComprobante`: today
   - `importeNeto`: `100`, `iva: [{alicuota:'21', baseImponible:100, importe:21}]`, `importeTotal`: `121`
4. Calls `feCaeSolicitar`
5. Prints a redacted summary
6. Exits 0 on success (CAE returned), 1 on rejection or error

### 6.2 Output format

On success:

```
[smoke-wsfe] Loading config...
[smoke-wsfe] env=homologation cuit=20111111112
[smoke-wsfe] Querying last authorized number for PV=1, Factura B...
[smoke-wsfe] Last number: 12344. Next will be 12345.
[smoke-wsfe] Emitting test invoice (Factura B, Consumidor Final, total $121,00)...
[smoke-wsfe] Resultado: APROBADO
[smoke-wsfe]   tipoComprobante:    6
[smoke-wsfe]   numeroComprobante:  12345
[smoke-wsfe]   puntoVenta:         1
[smoke-wsfe]   importeTotal:       121
[smoke-wsfe]   cae length:         14 chars (not displayed)
[smoke-wsfe]   fechaVencimientoCae: 2026-05-15
[smoke-wsfe]   observaciones:      0
[smoke-wsfe] Smoke test PASSED
```

On rejection:

```
[smoke-wsfe] Resultado: RECHAZADO
[smoke-wsfe]   tipoComprobante:    6
[smoke-wsfe]   numeroComprobante intentado: 12345
[smoke-wsfe]   errores:            [10017]
[smoke-wsfe]   observaciones:      0
[smoke-wsfe] Smoke test FAILED (ARCA rejected the comprobante)
```

### 6.3 Redaction

- The `cae` value is **not** printed. Length only. Same rationale as the WSAA token.
- Error and observation **codes** are printed. Their literal messages are not (some include data echoes like CUIT).

### 6.4 Pure formatter

```typescript
export function formatWsfeSmokeSummary(r: ResultadoEmision): string[];
```

Tested in isolation with fixtures simulating both APROBADO and RECHAZADO.

### 6.5 Why it's safe to emit a real invoice

ARCA homologation is explicitly designed for this:
- Invoices emitted there have no fiscal validity
- They do not appear in the productive padrón
- They do not affect declarations
- The same pattern is used by every Argentine WSFE library (AfipSDK, vousys, TusFacturasAPP) for their integration tests

The smoke runs against a Consumidor Final (tipoDocReceptor=99, numeroDocReceptor='0') which is the safest possible test case.

### 6.6 `package.json` scripts

```json
"smoke": "npm run smoke:wsaa && npm run smoke:padron && npm run smoke:wsfe",
"smoke:wsaa": "tsx scripts/smoke-wsaa.ts",
"smoke:padron": "tsx scripts/smoke-padron.ts",
"smoke:wsfe": "tsx scripts/smoke-wsfe.ts"
```

`smoke:wsfe` accepts `SMOKE_PV` env var optionally; everything else inherits from the standard `ARCA_*` env vars.

### 6.7 Tests

`tests/scripts/smoke-wsfe.test.ts` covers `formatWsfeSmokeSummary` with both APROBADO and RECHAZADO inputs. Coverage: 100% on `formatWsfeSmokeSummary`. `main()` excluded with `/* v8 ignore start */` / `/* v8 ignore stop */`.

---

## 7. Test Strategy

Same approach as previous phases.

### 7.1 Test fixtures

`tests/fixtures/`:

- `wsfe-fecae-success.xml` — Successful single-comprobante CAE (sanitized CAE)
- `wsfe-fecae-success-with-observations.xml` — Approved but with non-blocking observations
- `wsfe-fecae-rejected.xml` — Resultado='R' with errors
- `wsfe-fecae-error-validacion.xml` — Schema-level error before reaching business validation
- `wsfe-fecomp-consultar-found.xml` — Existing comprobante details
- `wsfe-fecomp-consultar-not-found.xml` — "Comprobante no existe"
- `wsfe-fecomp-ultimo-autorizado.xml` — Returns last number

All fixtures sanitized: placeholder CUITs, fake CAEs (`75000000000000`), fake amounts.

### 7.2 Unit tests

#### `tests/wsfe/codes.test.ts`
```
describe codes
  TIPOS_COMPROBANTE_V1 contains exactly 1, 6, 11
  ALICUOTAS_IVA_CODE maps each alícuota to the documented WSFE code
  TIPOS_DOC_RECEPTOR includes CUIT (80) and Consumidor Final (99)
```

#### `tests/wsfe/errors.test.ts`
```
describe describeWsfeError
  appends hint when error code is known
  returns ARCA message unchanged when code is unknown
  hint includes the lightbulb prefix
  multiple unrelated codes yield distinct hints
```

#### `tests/wsfe/builder.test.ts`
```
describe buildFeCaeRequest
  converts YYYY-MM-DD to YYYYMMDD
  maps alícuota '21' to ARCA code 5
  builds Iva array with correct structure for Factura A
  omits Iva entirely for Factura C
  omits Tributos (always)
  includes service dates when concepto is 2
  includes service dates when concepto is 3
  omits service dates when concepto is 1
  forces MonId='PES' and MonCotiz=1
  rounds importes to 2 decimals
  uses the explicit numeroComprobante passed in
```

#### `tests/wsfe/parser.test.ts`
```
describe parseFeCaeResponse
  parses APROBADO into ComprobanteAutorizado
  parses RECHAZADO into ComprobanteRechazado
  preserves observaciones on success
  preserves errores on rejection
  treats Resultado='P' as Rechazado in V1

describe parseFeCompUltimoAutorizadoResponse
  returns numero=0 when no invoice exists for the PV+tipo

describe parseFeCompConsultarResponse
  parses a found comprobante
  throws WsfeError('NOT_FOUND') when ARCA reports comprobante does not exist
```

#### `tests/wsfe/formatter.test.ts`
```
describe formatResultadoEmision
  formats APROBADO with all key fields
  formats RECHAZADO with errors section
  uses Argentine number format ($ 100.000,00)
  uses Argentine date format (DD/MM/YYYY)
  includes hint text from describeWsfeError when applicable

describe formatTiposComprobanteList
  includes all V1 tipos
  mentions that NC and ND are not in V1

describe formatUltimoComprobante
  formats with leading zeros (00012345)
  handles "no invoice yet" case (numero=0)
```

#### `tests/wsfe/client.test.ts`
```
describe feCaeSolicitar
  passes correct service name to getValidToken
  passes Auth envelope with token, sign, cuit
  parses APROBADO responses
  parses RECHAZADO responses (does not throw)
  throws WsfeError on network failure
  throws WsfeError on auth failure
  throws WsfeError on malformed response

describe feCompUltimoAutorizado
  passes correct service name
  parses response correctly

describe feCompConsultar
  passes correct service name
  throws WsfeError('NOT_FOUND') when comprobante missing
```

#### `tests/tools/arca-emitir-factura.test.ts`
```
describe arca_emitir_factura tool
  rejects Factura C with iva
  rejects Factura A without iva
  rejects concepto 2 without service dates
  rejects concepto 1 with service dates
  rejects malformed fechaComprobante
  auto-resolves numeroComprobante when not provided
  uses provided numeroComprobante when present
  returns formatted APROBADO output
  returns formatted RECHAZADO output (no throw)
  propagates WsfeError to caller
```

#### `tests/tools/arca-obtener-ultimo-comprobante.test.ts`
```
rejects unsupported tipoComprobante (e.g., 3)
rejects negative puntoVenta
returns formatted output
```

#### `tests/tools/arca-consultar-comprobante.test.ts`
```
rejects unsupported tipoComprobante
returns formatted detail on success
returns "no se encontró" friendly message on NOT_FOUND
propagates other errors
```

#### `tests/tools/arca-listar-tipos-comprobante.test.ts`
```
returns the V1 list
mentions NC and ND are out of V1
takes no input
```

---

## 8. Commit Convention — Phase 3

Same Conventional Commits. Allowed scopes:

- `wsfe`: `src/wsfe/*`
- `tools`: `src/tools/*`, server registration
- `scripts`: `scripts/smoke-wsfe.ts`
- `lib`: `src/lib/errors.ts` (for new `WsfeError`)
- `docs`: `docs/*`, README updates
- `chore`: `package.json` script entries
- `test`: any test file

**Granularity:** TDD pair per commit.

**Example commit sequence (illustrative, ~28 commits):**

```
docs: add phase-3-spec.md
feat(lib): add wsfeerror class extending arcaerror
test(wsfe): add codes table tests
feat(wsfe): add tipos comprobante and alicuota tables
test(wsfe): add error hint tests
feat(wsfe): add wsfe error hints with describewsfeerror
test(wsfe): add type definitions tests
feat(wsfe): add input and output type definitions
test(wsfe): add request builder tests for factura b
feat(wsfe): implement fecae request builder
test(wsfe): add builder tests for factura c without iva
feat(wsfe): handle factura c iva omission in builder
test(wsfe): add builder tests for service-concept invoices
feat(wsfe): handle service dates for concepto 2 and 3
test(wsfe): add response parser tests for aprobado
feat(wsfe): implement fecae response parser
test(wsfe): add parser tests for rechazado and observations
feat(wsfe): handle rejected and partial response shapes
test(wsfe): add fecomp parsers tests
feat(wsfe): implement fecomp ultimo and consultar parsers
test(wsfe): add formatter tests for emision result
feat(wsfe): implement spanish-language formatter
test(wsfe): add soap client tests with mocked auth and soap
feat(wsfe): implement wsfe soap client
test(tools): add arca_emitir_factura tool tests
feat(tools): implement arca_emitir_factura tool
test(tools): add tool tests for ultimo comprobante consultar and listar
feat(tools): implement remaining wsfe tools
feat(server): register four wsfe tools in mcp server
test(scripts): add formatwsfesmokesumary tests
feat(scripts): add wsfe smoke script with redacted output
chore: chain smoke:wsfe in npm run smoke
docs: document wsfe tools and smoke:wsfe in readme
```

A trailing `chore` for biome auto-fix is acceptable.

---

## 9. What NOT to Do in Phase 3

- **Do not** modify Phase 0/1/2 code beyond:
  - registering the new tools in `src/server.ts`
  - chaining `smoke:wsfe` in `package.json`
- **Do not** implement Notas de Crédito (3, 8, 13) or Notas de Débito (2, 7, 12). Phase 3.5.
- **Do not** implement WSFEX. Phase 4.
- **Do not** support foreign currency. WSFEX (Phase 4) handles export.
- **Do not** support `Tributos` array. V2.
- **Do not** support `CbtesAsoc` (comprobantes asociados) input. V2.
- **Do not** support `Opcionales` (extra fields). V2.
- **Do not** add `FEDummy` (health check) operation. `arca_status` is enough.
- **Do not** add `FEParamGet*` operations to fetch tables at runtime. Static tables only.
- **Do not** support batch invoice emission (FECAESolicitar accepts up to 250 invoices per call). V1 emits one at a time.
- **Do not** add caching of comprobante data. Always fresh.
- **Do not** add NPM packages. Phase 3 reuses Phase 1/2 deps.
- **Do not** wire `npm run smoke` (or `smoke:wsfe`) into CI.
- **Do not** print the CAE value in smoke output. Length only.
- **Do not** auto-default `condicionIvaReceptor` based on `tipoDocReceptor` or anything else. The field is required and explicit.

---

## 10. Acceptance Criteria for Phase 3

Before opening the PR:

- [ ] `npm install` clean
- [ ] `npm run lint` zero warnings
- [ ] `npm run typecheck` zero errors
- [ ] `npm test` all green
- [ ] Coverage > 85% on `src/wsfe/`, `src/tools/arca-emitir-factura.ts`, `src/tools/arca-obtener-ultimo-comprobante.ts`, `src/tools/arca-consultar-comprobante.ts`, `src/tools/arca-listar-tipos-comprobante.ts`, `scripts/smoke-wsfe.ts` (excluding `main()`)
- [ ] `npm run build` produces `dist/`
- [ ] All WSFE fixtures committed under `tests/fixtures/` with sanitized data
- [ ] `tests/fixtures/README.md` updated to document new fixtures
- [ ] All commits follow conventional commits with allowed scopes
- [ ] No AI signatures in any commit
- [ ] `docs/phase-3-spec.md` is committed
- [ ] Phase 0/1/2 code unchanged in this PR diff except `src/server.ts` and `package.json`
- [ ] README updated with the four new tools and the new `smoke:wsfe` command
- [ ] PR opened on branch `phase-3-wsfe` against `main`, NOT merged

After opening the PR:

- [ ] CI green
- [ ] Manual verification by the user: `npm run smoke:wsfe` with real homologation credentials authorized for `wsfe` prints `Smoke test PASSED` and emits a Factura B test invoice. (Performed by the user during review.)

---

## 11. Branch & PR Workflow — Phase 3

Same pattern as previous phases:

1. `git checkout main && git pull` (after Phase 2 follow-up merged)
2. `git checkout -b phase-3-wsfe`
3. Implement following section 8 commit sequence
4. Verify acceptance criteria from section 10 locally
5. Push: `git push -u origin phase-3-wsfe`
6. Open PR: `gh pr create --base main --head phase-3-wsfe --title "Phase 3: WSFE invoice emission (Factura A, B, C)"` with body containing summary + acceptance checklist + note "Adds four MCP tools for issuing and querying Factura A, B, and C via WSFE. Notas de Crédito and Notas de Débito deferred to Phase 3.5 per backlog."
7. Do NOT merge.
8. Report: "Phase 3 complete. PR opened: <URL>. Acceptance criteria checked. Awaiting review." and stop.

---

## 12. Handoff to Phase 4 (preview, not in scope)

Phase 4 will add:
- WSFEX (wsfexv1) SOAP client
- Tools: `arca_emitir_factura_exportacion`, `arca_obtener_ultimo_comprobante_exportacion`, `arca_consultar_factura_exportacion`, `arca_obtener_cotizacion_moneda`
- Country code table (CMP)
- Foreign currency support (only inside WSFEX)
- A new `scripts/smoke-wsfex.ts` chained into `npm run smoke`

Phase 3 stays focused. No WSFEX anticipation. Notas de Crédito and Notas de Débito remain on the V1.1 backlog (Phase 3.5).
