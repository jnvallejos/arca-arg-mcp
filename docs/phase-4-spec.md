# Phase 4 Spec — WSFEX (Factura E, Exportación)

**Repo:** `arca-arg-mcp`
**Stack:** TypeScript, soap, fast-xml-parser, Vitest
**Approach:** TDD strict, granular commits, feature branch + PR
**Branch:** `phase-4-wsfex`

---

## 1. Goal of Phase 4

Implement WSFEX (Web Service de Facturación Electrónica de Exportación), the ARCA service used to authorize Factura E (export invoices). This is the use case for Argentine freelancers and companies billing foreign clients in foreign currency — a major draw for the project's primary target audience.

At the end of Phase 4:
- Server exposes 4 new MCP tools:
  - `arca_emitir_factura_exportacion` — issue a new Factura E
  - `arca_obtener_ultimo_comprobante_exportacion` — query the last authorized Factura E for a punto de venta
  - `arca_consultar_factura_exportacion` — retrieve full details of an existing Factura E
  - `arca_obtener_cotizacion_moneda` — get ARCA's current exchange rate for a foreign currency
- WSAA token for `wsfex` is fetched and cached (reuses Phase 1 layer; no changes)
- WSFEX SOAP responses parsed into strongly-typed objects with the same discriminated-union pattern as WSFE
- Friendly Spanish-language output, with hint table for known WSFEX error codes
- New smoke script `scripts/smoke-wsfex.ts` performs an end-to-end real Factura E emission against ARCA homologation. The aggregate `npm run smoke` runs `wsaa → padron → wsfe → wsfex` in sequence.
- Phase 0/1/2/3 code is **untouched** (only `src/server.ts` modified to register new tools, `package.json` modified to chain the new smoke entry)

**Out of scope for Phase 4 (deferred to V2):**
- Permisos de embarque (PERMISO_EMBARQUE) — used for physical-goods export, not the freelance services use case
- Notas de Crédito de Exportación (tipo 21)
- Notas de Débito de Exportación (tipo 20)
- Comprobantes asociados (CmpAsoc) — same reason as WSFE

---

## 2. WSFEX Background

### 2.1 What WSFEX does

WSFEX (`wsfexv1`) takes a request describing a single Factura E (export invoice) and returns a **CAE** (Código de Autorización Electrónico). Unlike WSFE, WSFEX:

- Always carries foreign-currency amounts plus the cotización ARCA used to convert
- Identifies the receiver as a foreign client (no CUIT, just a name and country)
- Requires a destination country code
- Does NOT include IVA breakdown (export is exempt under Argentine tax law)
- Has its own incoterm and language code tables

### 2.2 Endpoints

- Homologation: `https://wswhomo.afip.gov.ar/wsfexv1/service.asmx?WSDL`
- Production: `https://servicios1.afip.gov.ar/wsfexv1/service.asmx?WSDL`

Service name for WSAA: `wsfex`

### 2.3 Operations used in V1

| Operation | Purpose | Tool that uses it |
|---|---|---|
| `FEXAuthorize` | Authorize a single Factura E | `arca_emitir_factura_exportacion` |
| `FEXGetLast_CMP` | Get last authorized number | `arca_obtener_ultimo_comprobante_exportacion` |
| `FEXGetCMP` | Retrieve a previously emitted Factura E | `arca_consultar_factura_exportacion` |
| `FEXGetPARAM_Ctz` | Get current ARCA exchange rate for a currency | `arca_obtener_cotizacion_moneda` |

`FEXGetPARAM_MON` (currency table), `FEXGetPARAM_DST_pais` (country table), `FEXGetPARAM_Idiomas` (language table), `FEXGetPARAM_Incoterms`, etc. are NOT called at runtime. We use static tables.

`FEXDummy` (health check) is not used.

### 2.4 Invoice types in V1

Only this type is exposed:

| Código | Tipo | Issuer |
|---|---|---|
| 19 | Factura E | Any (RI, Monotributo, Exento) |

Note: tipos 20 (NC E), 21 (ND E) deferred to a future phase.

### 2.5 Currency

V1 supports a curated list of the most common foreign currencies:

| Código WSFEX | Moneda |
|---|---|
| `DOL` | US Dollar |
| `060` | Euro |
| `002` | Pound Sterling |
| `006` | Real Brasileño |
| `010` | Peso Chileno |
| `011` | Peso Uruguayo |
| `012` | Yen Japonés |
| `014` | Yuan Renminbi |
| `019` | Won Sur-coreano |
| `030` | Franco Suizo |
| `031` | Peso Mexicano |
| `091` | Dólar Canadiense |

Codes from ARCA's `FEXGetPARAM_MON`. The full list has ~50 currencies; we expose the ~12 most commonly used in Argentine export practice. Adding more is a one-line PR.

### 2.6 Country codes (destino)

WSFEX requires a destination country code from the `DST_pais` table. Same approach: static table with the most common destinations:

| Código | País |
|---|---|
| 91  | ESPAÑA |
| 200 | ESTADOS UNIDOS |
| 201 | URUGUAY |
| 203 | BRASIL |
| 212 | CHILE |
| 218 | MEXICO |
| 226 | CANADA |
| 410 | ALEMANIA |
| 412 | FRANCIA |
| 416 | ITALIA |
| 426 | REINO UNIDO |
| 497 | SUIZA |

The full list has ~250 countries; we expose top destinations.

### 2.7 Concept (Concepto)

WSFEX uses similar concepto codes to WSFE:

- `1` — Productos
- `2` — Servicios
- `4` — Otros

Concepts `1` and `2` are the common ones for the freelance audience. `4` is rarely used; supported on input but no special handling.

### 2.8 IVA

**Not applicable.** Export is IVA-exempt under Argentine tax law. The WSFEX request does not have an IVA section. Tools must reject any IVA in the input.

### 2.9 Cotización

The exchange rate ARCA applies to the comprobante. Two important rules:

1. The cotización must match what ARCA's table says for that day, within a tolerance.
2. For currency `PES` (Argentine pesos in a Factura E — rare but possible), cotización is `1`.

We expose this via `arca_obtener_cotizacion_moneda` as a separate tool. The user (or LLM) typically calls it first, gets the value, then calls `arca_emitir_factura_exportacion` with that exact value.

Auto-fetching cotización inside `arca_emitir_factura_exportacion` was considered and rejected — making it explicit gives the user a chance to abort if the rate is unexpected.

---

## 3. Folder Structure

```
arca-arg-mcp/
├── docs/
│   ├── ... (existing)
│   └── phase-4-spec.md            (NEW)
├── scripts/
│   ├── ... (existing 3)
│   └── smoke-wsfex.ts              (NEW)
├── src/
│   ├── ... (Phase 0/1/2/3 unchanged)
│   ├── wsfex/
│   │   ├── codes.ts                (NEW: monedas, países, idiomas, incoterms)
│   │   ├── errors.ts               (NEW: hint table for known WSFEX codes)
│   │   ├── builder.ts              (NEW: builds FEXAuthorizeRequest)
│   │   ├── parser.ts               (NEW: parses 4 WSFEX response shapes)
│   │   ├── formatter.ts            (NEW: human-readable Spanish output)
│   │   ├── client.ts               (NEW: SOAP client for the 4 used operations)
│   │   └── types.ts                (NEW: input/output types)
│   └── tools/
│       ├── ... (existing unchanged)
│       ├── arca-emitir-factura-exportacion.ts                  (NEW)
│       ├── arca-obtener-ultimo-comprobante-exportacion.ts      (NEW)
│       ├── arca-consultar-factura-exportacion.ts               (NEW)
│       └── arca-obtener-cotizacion-moneda.ts                   (NEW)
├── tests/
│   ├── ... (existing)
│   ├── wsfex/
│   │   ├── codes.test.ts
│   │   ├── errors.test.ts
│   │   ├── builder.test.ts
│   │   ├── parser.test.ts
│   │   ├── formatter.test.ts
│   │   └── client.test.ts
│   ├── tools/
│   │   ├── arca-emitir-factura-exportacion.test.ts
│   │   ├── arca-obtener-ultimo-comprobante-exportacion.test.ts
│   │   ├── arca-consultar-factura-exportacion.test.ts
│   │   └── arca-obtener-cotizacion-moneda.test.ts
│   ├── scripts/
│   │   └── smoke-wsfex.test.ts                                  (NEW)
│   └── fixtures/
│       ├── ... (existing)
│       ├── wsfex-authorize-success.xml                          (NEW)
│       ├── wsfex-authorize-rejected.xml                         (NEW)
│       ├── wsfex-authorize-error-validacion.xml                 (NEW)
│       ├── wsfex-getcmp-found.xml                               (NEW)
│       ├── wsfex-getcmp-not-found.xml                           (NEW)
│       ├── wsfex-getlastcmp.xml                                 (NEW)
│       └── wsfex-getparam-ctz.xml                               (NEW)
└── package.json                    (no new deps; new smoke entry only)
```

---

## 4. Type System

### 4.1 `src/wsfex/types.ts`

```typescript
export type TipoComprobanteExportacion = 19;
export type ConceptoExportacion = 1 | 2 | 4;
export type CodigoMoneda =
  | 'DOL' | '060' | '002' | '006' | '010' | '011' | '012' | '014'
  | '019' | '030' | '031' | '091';
export type CodigoPais = number;        // open numeric (full table is ~250)
export type CodigoIdioma = 1 | 2 | 3;   // 1=ESP, 2=ENG, 3=PORT (most common)
export type Incoterms = 'EXW' | 'FOB' | 'CIF' | 'CFR' | 'FAS' | 'FCA' | 'CPT' | 'CIP' | 'DAP' | 'DDP' | 'DPU';

export interface ItemFacturaExportacion {
  codigoProducto: string;        // free-form, your internal SKU
  descripcion: string;
  cantidad: number;              // can be fractional for services
  unidadMedida: number;          // ARCA code. Common: 7=unit, 1=kg, 2=meter
  precioUnitario: number;        // foreign-currency amount per unit
  importeTotal: number;          // = cantidad * precioUnitario
}

export interface EmitirFacturaExportacionInput {
  tipoComprobante: 19;
  puntoVenta: number;
  numeroComprobante?: number;    // optional; if absent, server fetches last+1
  concepto: ConceptoExportacion;
  fechaComprobante: string;      // YYYY-MM-DD
  destinoPais: CodigoPais;
  cliente: {
    nombre: string;              // foreign client legal name
    domicilio: string;
    idImpositivoExterior?: string;  // VAT/EIN/etc; optional
  };
  moneda: CodigoMoneda;
  cotizacion: number;            // foreign-currency to ARS rate (positive)
  idiomaComprobante: CodigoIdioma;
  incoterms?: Incoterms;
  incotermsDescripcion?: string;
  items: ItemFacturaExportacion[];   // at least 1
  importeTotal: number;          // sum of items.importeTotal
  fechaPago?: string;            // YYYY-MM-DD; optional
  observaciones?: string;        // free-form notes
}

export interface ComprobanteExportacionAutorizado {
  status: 'aprobado';
  cae: string;
  fechaVencimientoCae: string;     // YYYY-MM-DD
  numeroComprobante: number;
  tipoComprobante: 19;
  puntoVenta: number;
  fechaComprobante: string;
  importeTotal: number;            // foreign currency, stamped from the original request
  moneda: CodigoMoneda;            // stamped from the original request
  cotizacion: number;              // stamped from the original request
  cliente: ClienteExportacion;     // stamped from the original request
  destinoPais: CodigoPais;         // stamped from the original request
}

export interface ComprobanteExportacionRechazado {
  status: 'rechazado';
  numeroComprobante: number;
  tipoComprobante: 19;
  puntoVenta: number;
  errores: ObservacionWsfex[];
  observaciones: ObservacionWsfex[];
}

export type ResultadoEmisionExportacion =
  | ComprobanteExportacionAutorizado
  | ComprobanteExportacionRechazado;

export interface ObservacionWsfex {
  code: number;
  message: string;
}

export interface UltimoComprobanteExportacion {
  puntoVenta: number;
  tipoComprobante: 19;
  numero: number;     // 0 if no Factura E issued yet for this PV
}

export interface ComprobanteExportacionConsultado {
  numeroComprobante: number;
  tipoComprobante: 19;
  puntoVenta: number;
  fechaComprobante: string;
  cae: string;
  fechaVencimientoCae: string;
  importeTotal: number;
  moneda: CodigoMoneda;
  cotizacion: number;
  destinoPais: CodigoPais;
  cliente: { nombre: string; domicilio: string; idImpositivoExterior?: string };
  items: ItemFacturaExportacion[];
  observaciones: ObservacionWsfex[];
}

export interface CotizacionMoneda {
  moneda: CodigoMoneda;
  cotizacion: number;
  fechaCotizacion: string;          // YYYY-MM-DD
}
```

**Decisions:**
- `cliente` is a nested object so all foreign-client fields stay grouped
- `items` has its own type because export invoices always itemize (services or goods)
- `fechaPago` is optional but recommended for services
- Discriminated union `ResultadoEmisionExportacion` mirrors WSFE pattern
- All field names in input use camelCase; the builder translates to WSFEX's mixed-case (`Cmp_tot`, `Moneda_Id`, `Cliente`, etc.)

### 4.2 `src/wsfex/codes.ts`

```typescript
export const TIPOS_COMPROBANTE_EXPORTACION = {
  19: { name: 'Factura E', issuer: 'Any (Export)' },
} as const;

export const MONEDAS_WSFEX = {
  'DOL': 'US Dollar',
  '060': 'Euro',
  '002': 'Pound Sterling',
  '006': 'Real Brasileño',
  '010': 'Peso Chileno',
  '011': 'Peso Uruguayo',
  '012': 'Yen Japonés',
  '014': 'Yuan Renminbi',
  '019': 'Won Sur-coreano',
  '030': 'Franco Suizo',
  '031': 'Peso Mexicano',
  '091': 'Dólar Canadiense',
} as const;

export const PAISES_WSFEX = {
  91:  'ESPAÑA',
  200: 'ESTADOS UNIDOS',
  201: 'URUGUAY',
  203: 'BRASIL',
  212: 'CHILE',
  218: 'MEXICO',
  226: 'CANADA',
  410: 'ALEMANIA',
  412: 'FRANCIA',
  416: 'ITALIA',
  426: 'REINO UNIDO',
  497: 'SUIZA',
} as const;

export const IDIOMAS_WSFEX = {
  1: 'Español',
  2: 'Inglés',
  3: 'Portugués',
} as const;

export const INCOTERMS_WSFEX = {
  'EXW': 'Ex Works',
  'FOB': 'Free On Board',
  'CIF': 'Cost, Insurance and Freight',
  'CFR': 'Cost and Freight',
  'FAS': 'Free Alongside Ship',
  'FCA': 'Free Carrier',
  'CPT': 'Carriage Paid To',
  'CIP': 'Carriage and Insurance Paid To',
  'DAP': 'Delivered At Place',
  'DDP': 'Delivered Duty Paid',
  'DPU': 'Delivered at Place Unloaded',
} as const;
```

### 4.3 `src/wsfex/errors.ts`

```typescript
export const WSFEX_ERROR_HINTS: Record<number, string> = {
  500: 'El número de comprobante no es el siguiente esperado. Probá con `arca_obtener_ultimo_comprobante_exportacion` para conocer el próximo correcto.',
  607: 'La cotización no coincide con la tabla ARCA del día. Probá con `arca_obtener_cotizacion_moneda` para obtener el valor exacto.',
  608: 'El país de destino no está en la tabla de países permitidos por ARCA. Verificá el código.',
  609: 'La moneda no está habilitada para el comprobante. Verificá el código.',
  650: 'El idioma del comprobante debe ser un código válido (1=Español, 2=Inglés, 3=Portugués).',
  // more added when discovered against real homologation
};

export function describeWsfexError(code: number, originalMessage: string): string {
  const hint = WSFEX_ERROR_HINTS[code];
  if (!hint) return originalMessage;
  return `${originalMessage}\n💡 ${hint}`;
}
```

---

## 5. Implementation

### 5.1 `src/wsfex/builder.ts`

```typescript
export function buildFexAuthorizeRequest(
  input: EmitirFacturaExportacionInput,
  authenticatedCuit: string,
  numeroComprobante: number,
): FexAuthorizeRequest;
```

Pure function. Takes the validated input plus the authenticated CUIT and an explicit numeroComprobante, returns the WSFEX request payload.

**Algorithm:**

1. Convert all dates from `YYYY-MM-DD` to WSFEX's `YYYYMMDD` format
2. Build the `Items` array, mapping camelCase to WSFEX's PascalCase (`Pro_codigo`, `Pro_ds`, `Pro_qty`, etc.)
3. Build the `Cmp` envelope with:
   - `Cbte_Tipo: 19`
   - `Punto_vta`, `Cbte_nro`, `Tipo_expo`, `Permiso_existente: 'N'` (export of services)
   - `Dst_cmp`, `Cliente`, `Cuit_pais_cliente: 0` (no CUIT for foreign client)
   - `Domicilio_cliente`, `Id_impositivo` (if provided)
   - `Moneda_Id`, `Moneda_ctz`
   - `Imp_total`, `Idioma_cbte`
   - `Incoterms`, `Incoterms_Ds` (if provided)
   - `Permisos: { Permiso: [] }` — always empty in V1 (no PERMISO_EMBARQUE)
   - `CmpAsoc: { Cmp_asoc: [] }` — always empty in V1
   - `Opcionales: { Opcional: [] }` — always empty in V1
   - `Items`, `Fecha_pago` (if provided), `Observaciones` (if provided)

**Decisions:**
- Builder rejects negative quantities, prices, totals via TypeScript types (input already validated by Zod)
- All numeric fields rounded to 2 decimals defensively, except `Pro_qty` which can have up to 6 decimals (WSFEX accepts decimals for cantidad)
- The `Permiso_existente='N'` is hardcoded since V1 doesn't support PERMISO_EMBARQUE

### 5.2 `src/wsfex/parser.ts`

```typescript
export function parseFexAuthorizeResponse(rawResponse: unknown): ResultadoEmisionExportacion;
export function parseFexGetCmpResponse(rawResponse: unknown): ComprobanteExportacionConsultado;
export function parseFexGetLastCmpResponse(rawResponse: unknown): UltimoComprobanteExportacion;
export function parseFexGetParamCtzResponse(rawResponse: unknown): CotizacionMoneda;
```

Same pattern as WSFE's parser. WSFEX response has a flat shape compared to WSFE — only one comprobante per response. The pattern of "always-array for collections" applies to `Items`, `Errors`, `Observaciones`.

**FEXAuthorize response handling:**

WSFEX returns `FEXResultAuth.Resultado` with values:
- `'A'` (Aprobado) → `ComprobanteExportacionAutorizado`
- `'R'` (Rechazado) → `ComprobanteExportacionRechazado`

(WSFEX does not have a `'P'` partial state; only A/R.)

`Observaciones` and `Errors` may both be present even on success. Preserved.

### 5.3 `src/wsfex/formatter.ts`

```typescript
export function formatResultadoEmisionExportacion(r: ResultadoEmisionExportacion): string;
export function formatComprobanteExportacionConsultado(c: ComprobanteExportacionConsultado): string;
export function formatUltimoComprobanteExportacion(u: UltimoComprobanteExportacion): string;
export function formatCotizacionMoneda(c: CotizacionMoneda): string;
```

**Successful emission output:**

```
✅ Factura E emitida con éxito

Tipo: Factura E
Punto de venta: 0001
Número: 00000123
Fecha: 15/04/2026

Cliente: ACME INTERNATIONAL LLC
Destino: ESTADOS UNIDOS

Importe total: USD 5,000.00 (cotización 1.180,50 ARS)

CAE: 75123456789012
Vencimiento del CAE: 25/04/2026
```

**Cotización output:**

```
Cotización USD a ARS según ARCA: 1.180,50
Fecha: 15/04/2026
```

**Decisions:**
- Foreign currency uses `Intl.NumberFormat('en-US')` (`5,000.00`) since US English is the most common reading convention for foreign amounts
- ARS amounts use Argentine format (`1.180,50`)
- Country and currency labels are looked up from the static tables; falls back to the code if unknown

### 5.4 `src/wsfex/client.ts`

```typescript
export async function fexAuthorize(
  request: FexAuthorizeRequest,
  config: ArcaConfig,
): Promise<ResultadoEmisionExportacion>;

export async function fexGetLastCmp(
  puntoVenta: number,
  config: ArcaConfig,
): Promise<UltimoComprobanteExportacion>;

export async function fexGetCmp(
  puntoVenta: number,
  numeroComprobante: number,
  config: ArcaConfig,
): Promise<ComprobanteExportacionConsultado>;

export async function fexGetParamCtz(
  monedaId: CodigoMoneda,
  config: ArcaConfig,
): Promise<CotizacionMoneda>;
```

Same pattern as WSFE: get TA via `getValidToken(config, 'wsfex')`, build Auth envelope, call SOAP, parse, return.

**Same error handling pattern as WSFE:**

- Network/HTTP → `WsfexError('SERVICE_UNAVAILABLE', ...)`
- Auth-related faults → `WsfexError('AUTH_FAILED', ...)`
- Comprobante-not-found in `fexGetCmp` → `WsfexError('NOT_FOUND', ...)`
- Anything else → `WsfexError('UNKNOWN', ...)`

**Same stamping pattern as WSFE Phase 3 fix:**

`fexAuthorize` stamps `importeTotal`, `moneda`, `cotizacion`, `cliente`, and `destinoPais` from the request onto the `ComprobanteExportacionAutorizado` (since WSFEX's `FEXAuthorize` response also doesn't echo these fields). This is the same lesson learned from Phase 3's `importeTotal` fix-up.

**No retries in V1.**

### 5.5 Tools

#### 5.5.1 `arca_emitir_factura_exportacion`

Same shape as `arca_emitir_factura`. Input validation includes:
- `tipoComprobante` must be `19`
- `cotizacion` must be positive
- `items` must be non-empty array
- `importeTotal` must equal sum of `items[].importeTotal` (rounded to 2 decimals tolerance)
- For `moneda='PES'` (rare), `cotizacion` must be `1`

Handler:
1. Validate
2. Resolve numeroComprobante (via `fexGetLastCmp` if not provided)
3. Build request
4. Call `fexAuthorize`
5. Format with `formatResultadoEmisionExportacion`

#### 5.5.2 `arca_obtener_ultimo_comprobante_exportacion`

Input: `{ puntoVenta: number }`. (No tipoComprobante because the only one supported is 19.)

#### 5.5.3 `arca_consultar_factura_exportacion`

Input: `{ puntoVenta: number, numeroComprobante: number }`.

#### 5.5.4 `arca_obtener_cotizacion_moneda`

Input: `{ moneda: CodigoMoneda }`.

Returns the formatted cotización text. Error case: if the moneda code is not recognized by ARCA, surface as friendly text.

### 5.6 `src/server.ts` registration

Four single-line additions to register the new tools and route them. No other changes to `server.ts`.

---

## 6. Smoke Script — WSFEX

`scripts/smoke-wsfex.ts` performs a real end-to-end Factura E emission against ARCA homologation.

### 6.1 What it does

1. Loads ARCA configuration via `loadConfig`
2. Calls `fexGetParamCtz` for `'DOL'` to get current ARS-USD rate from ARCA
3. Calls `fexGetLastCmp` to find the next number
4. Builds a minimal Factura E request:
   - `puntoVenta`: from env var `SMOKE_PV` (default `1`)
   - `tipoComprobante`: `19`
   - `concepto`: `2` (Servicios)
   - `destinoPais`: `200` (ESTADOS UNIDOS)
   - `cliente`: `{ nombre: 'TEST CLIENT INC', domicilio: '123 Main St, NY, USA', idImpositivoExterior: 'TEST-EIN-12345' }`
   - `moneda`: `'DOL'`, `cotizacion`: from step 2
   - `idiomaComprobante`: `2` (English)
   - `items`: `[{ codigoProducto: 'TEST-001', descripcion: 'Consulting services', cantidad: 1, unidadMedida: 7, precioUnitario: 100, importeTotal: 100 }]`
   - `importeTotal`: `100` (USD)
5. Calls `fexAuthorize`
6. Prints redacted summary
7. Exits 0 on success, 1 on rejection or error

### 6.2 Output format

On success:

```
[smoke-wsfex] Loading config...
[smoke-wsfex] env=homologation cuit=20111111112
[smoke-wsfex] Querying current ARCA cotización for DOL...
[smoke-wsfex] Cotización: 1180.5 (date 2026-04-15)
[smoke-wsfex] Querying last authorized number for PV=1, Factura E...
[smoke-wsfex] Last number: 122. Next will be 123.
[smoke-wsfex] Emitting test Factura E (DOL 100 to TEST CLIENT INC, ESTADOS UNIDOS)...
[smoke-wsfex] Resultado: APROBADO
[smoke-wsfex]   tipoComprobante:    19
[smoke-wsfex]   numeroComprobante:  123
[smoke-wsfex]   puntoVenta:         1
[smoke-wsfex]   importeTotal:       100
[smoke-wsfex]   moneda:             DOL
[smoke-wsfex]   cotizacion:         1180.5
[smoke-wsfex]   cae length:         14 chars (not displayed)
[smoke-wsfex]   fechaVencimientoCae: 2026-04-25
[smoke-wsfex]   observaciones:      0
[smoke-wsfex] Smoke test PASSED
```

### 6.3 Redaction

- The `cae` value is **not** printed. Length only.
- The full client name `'TEST CLIENT INC'` IS printed in the smoke output because we control it (it's a hardcoded test value, not real PII)

### 6.4 Pure formatter

```typescript
export function formatWsfexSmokeSummary(r: ResultadoEmisionExportacion): string[];
```

Tested in isolation.

### 6.5 `package.json` scripts

```json
"smoke": "npm run smoke:wsaa && npm run smoke:padron && npm run smoke:wsfe && npm run smoke:wsfex",
"smoke:wsfex": "tsx scripts/smoke-wsfex.ts"
```

Smoke chain extended; existing entries unchanged.

### 6.6 Tests

Same pattern as previous smoke tests. Coverage 100% on `formatWsfexSmokeSummary`. `main()` excluded with `/* v8 ignore start */` / `/* v8 ignore stop */`.

---

## 7. Test Strategy

### 7.1 Test fixtures

`tests/fixtures/`:

- `wsfex-authorize-success.xml` — Successful Factura E emission (sanitized CAE `75000000000000`, USD amounts)
- `wsfex-authorize-rejected.xml` — Resultado='R' with error 500 (wrong number)
- `wsfex-authorize-error-validacion.xml` — Schema-level error
- `wsfex-getcmp-found.xml` — Existing comprobante details
- `wsfex-getcmp-not-found.xml` — Comprobante does not exist
- `wsfex-getlastcmp.xml` — Returns last number
- `wsfex-getparam-ctz.xml` — Returns current cotización

All fixtures sanitized: placeholder CUITs, fake CAEs, fake amounts, fictional client names.

### 7.2 Unit tests

Same coverage targets as Phase 3 (>85% on all surface). Tests follow same naming convention.

#### `tests/wsfex/codes.test.ts`
- `MONEDAS_WSFEX` includes DOL, 060 (Euro)
- `PAISES_WSFEX` includes 200 (US), 203 (Brazil)
- `INCOTERMS_WSFEX` includes FOB and CIF

#### `tests/wsfex/errors.test.ts`
- `describeWsfexError` adds hint for known codes (607)
- Returns unchanged for unknown codes

#### `tests/wsfex/builder.test.ts`
- Maps fields to WSFEX names (Pro_codigo, Cmp.Moneda_Id, etc.)
- Forces empty Permisos, CmpAsoc, Opcionales arrays
- Permiso_existente='N' always
- Cuit_pais_cliente=0 always
- Includes Fecha_pago when provided
- Omits Fecha_pago when not provided

#### `tests/wsfex/parser.test.ts`
- Parses APROBADO into `ComprobanteExportacionAutorizado`
- Parses RECHAZADO without throwing
- Parses GetCmp response with all fields
- Parses GetLastCmp returning numero=0 when no comprobantes yet
- Parses GetParamCtz returning cotización + fecha
- Throws `WsfexError('NOT_FOUND')` from GetCmp when not found

#### `tests/wsfex/formatter.test.ts`
- `formatResultadoEmisionExportacion` shows ✅, foreign-currency in en-US format, cotización in ARS format
- `formatComprobanteExportacionConsultado` shows full details
- `formatCotizacionMoneda` formats single moneda+cotización+fecha
- `formatUltimoComprobanteExportacion` handles numero=0 case

#### `tests/wsfex/client.test.ts`
- `fexAuthorize` stamps importeTotal, moneda, cotizacion from request onto aprobado result
- `fexGetLastCmp` returns parsed structure
- `fexGetCmp` throws WsfexError('NOT_FOUND') on missing comprobante
- `fexGetParamCtz` returns parsed cotización
- All methods pass correct service name 'wsfex' to getValidToken

#### `tests/tools/arca-emitir-factura-exportacion.test.ts`
- Rejects tipoComprobante !== 19
- Rejects cotizacion <= 0
- Rejects empty items array
- Rejects importeTotal mismatch (>0.01 tolerance)
- Auto-resolves numeroComprobante when not provided
- Returns formatted APROBADO output
- Returns formatted RECHAZADO output (no throw)
- Propagates WsfexError to caller

#### `tests/tools/arca-obtener-cotizacion-moneda.test.ts`
- Rejects unknown moneda code
- Returns formatted cotización output
- Propagates WsfexError

(Other tool tests follow the same pattern.)

---

## 8. Commit Convention — Phase 4

Same Conventional Commits. Allowed scopes:

- `wsfex`: `src/wsfex/*`
- `tools`: `src/tools/*`, server registration
- `scripts`: `scripts/smoke-wsfex.ts`
- `lib`: `src/lib/errors.ts` (for new `WsfexError`)
- `docs`: `docs/*`, README updates
- `chore`: `package.json` script entries
- `test`: any test file

**Granularity:** TDD pair per commit. Roughly 30 commits expected.

**Example commit sequence (illustrative):**

```
docs: add phase-4-spec.md
feat(lib): add wsfexerror class extending arcaerror
test(wsfex): add codes table tests
feat(wsfex): add tipos comprobante monedas paises idiomas incoterms tables
test(wsfex): add error hint tests
feat(wsfex): add wsfex error hints with describewsfexerror
test(wsfex): add type definitions tests
feat(wsfex): add input and output type definitions
test(wsfex): add request builder tests for factura e service
feat(wsfex): implement fexauthorize request builder
test(wsfex): add response parser tests for aprobado
feat(wsfex): implement fexauthorize response parser
test(wsfex): add parser tests for rechazado
feat(wsfex): handle rejected response shapes
test(wsfex): add fex parsers tests for getcmp getlastcmp getparam
feat(wsfex): implement remaining response parsers
test(wsfex): add formatter tests for emision result
feat(wsfex): implement spanish-language formatter
test(wsfex): add soap client tests with mocked auth and soap
feat(wsfex): implement wsfex soap client
test(tools): add arca_emitir_factura_exportacion tool tests
feat(tools): implement arca_emitir_factura_exportacion tool
test(tools): add tool tests for ultimo consultar cotizacion exportacion
feat(tools): implement remaining wsfex tools
feat(server): register four wsfex tools in mcp server
test(scripts): add formatwsfexsmokesumary tests
feat(scripts): add wsfex smoke script with fictional test client
chore: chain smoke:wsfex in npm run smoke
docs: document wsfex tools and smoke:wsfex in readme
```

A trailing `chore` for biome auto-fix is acceptable.

---

## 9. What NOT to Do in Phase 4

- **Do not** modify Phase 0/1/2/3 code beyond:
  - registering the new tools in `src/server.ts`
  - chaining `smoke:wsfex` in `package.json`
- **Do not** implement PERMISO_EMBARQUE. Out of scope for V1 (services use case).
- **Do not** implement Notas de Crédito de Exportación (tipo 21) or Notas de Débito (tipo 20). V2.
- **Do not** support `CmpAsoc` or `Opcionales`. V2.
- **Do not** add `FEXGetPARAM_*` operations as runtime tools beyond cotización. Static tables only for monedas/países/idiomas/incoterms.
- **Do not** auto-fetch cotización inside `arca_emitir_factura_exportacion`. Make it explicit, two-step.
- **Do not** support batch emission. WSFEX's `FEXAuthorize` is one-comprobante-per-call by design.
- **Do not** add caching of cotización data. Always fresh from ARCA.
- **Do not** add NPM packages.
- **Do not** wire `npm run smoke` (or `smoke:wsfex`) into CI.
- **Do not** print the CAE value in smoke output. Length only.
- **Do not** include real client names, real EINs, or real countries in fixtures. Use `'TEST CLIENT INC'`, `'TEST-EIN-12345'`, etc.

---

## 10. Acceptance Criteria for Phase 4

Before opening the PR:

- [ ] `npm install` clean
- [ ] `npm run lint` zero warnings
- [ ] `npm run typecheck` zero errors
- [ ] `npm test` all green
- [ ] Coverage > 85% on `src/wsfex/`, all four `src/tools/arca-*-exportacion.ts` and `arca-obtener-cotizacion-moneda.ts`, `scripts/smoke-wsfex.ts` (excluding `main()`)
- [ ] `npm run build` produces `dist/`
- [ ] All WSFEX fixtures committed under `tests/fixtures/` with sanitized data
- [ ] `tests/fixtures/README.md` updated to document new fixtures
- [ ] All commits follow conventional commits with allowed scopes
- [ ] No AI signatures in any commit
- [ ] `docs/phase-4-spec.md` is committed
- [ ] Phase 0/1/2/3 code unchanged in this PR diff except `src/server.ts` and `package.json`
- [ ] README updated with the four new tools and the new `smoke:wsfex` command, plus mention of foreign-currency support
- [ ] PR opened on branch `phase-4-wsfex` against `main`, NOT merged

After opening the PR:

- [ ] CI green
- [ ] Manual verification by the user: `npm run smoke:wsfex` with real homologation credentials authorized for `wsfex` prints `Smoke test PASSED` and emits a Factura E test invoice with USD amounts.

---

## 11. Branch & PR Workflow — Phase 4

Same pattern as previous phases:

1. `git checkout main && git pull` (after Phase 3 merged)
2. `git checkout -b phase-4-wsfex`
3. Implement following section 8 commit sequence
4. Verify acceptance criteria from section 10 locally
5. Push: `git push -u origin phase-4-wsfex`
6. Open PR: `gh pr create --base main --head phase-4-wsfex --title "Phase 4: WSFEX export invoice emission (Factura E)"` with body containing summary + acceptance checklist + note "Adds four MCP tools for issuing and querying Factura E via WSFEX. Foreign currency support (~12 most common currencies). Permiso de embarque deferred to V2."
7. Do NOT merge.
8. Report: "Phase 4 complete. PR opened: <URL>. Acceptance criteria checked. Awaiting review." and stop.

---

## 12. Handoff to Phase 5 (preview, not in scope)

Phase 5 (final V1 phase) will:
- Polish README to portfolio quality (screenshots of MCP Inspector, Claude Desktop integration, demo gif)
- Tag and release `v1.0.0` to npm and GitHub Releases
- Final cross-cutting QA pass (smoke output uniformity, error message consistency, etc.)

Phase 4 stays focused. No anticipating Phase 5 cleanups.
