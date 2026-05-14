# Test Fixtures

These files exist exclusively to support the unit and integration tests in
`tests/`. **None of them contains real ARCA-issued credentials or real WSAA
responses.** Do not reuse them for any purpose other than running this
project's tests.

## `test-cert.pem` and `test-key.pem`

A self-signed X.509 certificate plus its matching RSA private key, generated
locally with OpenSSL. They are **not** registered with ARCA and cannot be used
to authenticate against any AFIP / ARCA endpoint. The certificate's subject
mirrors the shape ARCA uses (CN, O, serialNumber=CUIT ...) so that parsing
tests have a realistic structure to work with, but the CUIT (`20000000000`) is
intentionally invalid.

Regeneration command (run from the repo root):

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout tests/fixtures/test-key.pem \
  -out tests/fixtures/test-cert.pem \
  -days 3650 -nodes \
  -subj "/C=AR/O=Test Org/CN=test/serialNumber=CUIT 20000000000"
```

Validity is 10 years (3650 days). If the cert ever expires, regenerate with the
same command and commit the new files.

## `valid-ta.xml`

A handcrafted sample of the XML payload WSAA returns inside the
`loginCmsReturn` SOAP response, modeled on the structure documented in the
WSAA developer guide. The `token` and `sign` values are obviously fake strings
("FAKE-TOKEN-FOR-TESTING-...") so a leaked fixture cannot be mistaken for a
real credential. The `source` / `destination` strings preserve the canonical
shape so parsing tests exercise realistic input.

## `wsaa-fault-already-emitted.xml`

A handcrafted SOAP 1.1 fault representing the `coe.tokenAlreadyEmitted` error
WSAA returns when a CEE already has a valid TA for the requested service. Used
to exercise the fault-handling path in `src/wsaa/client.ts` and the retry path
in `src/wsaa/auth.ts`.

## `padron-persona-fisica-monotributo.xml`

A handcrafted SOAP envelope mirroring the shape Padrón A13's `getPersona`
returns for an active monotributista persona física. CUIT, names, address,
DNI, and activity descriptions are all sanitized placeholders (`20111111112`,
`JUAN PEREZ`, `CALLE FALSA 123`, …). Used by `tests/padron/parser.test.ts` to
exercise the single-element-array normalization, optional fields, and the
`categoriaMonotributo` branch.

## `padron-persona-juridica-ri.xml`

A handcrafted SOAP envelope for an active responsable inscripto persona
jurídica with multiple actividades, multiple impuestos (including IVA), no
`categoria` element, and a sanitized razón social (`ACME SA`, CUIT
`30711111119`). Drives the multi-element parsing tests and the
"Responsable Inscripto" label derivation in the formatter.

## `padron-persona-cancelada.xml`

A minimal handcrafted SOAP envelope for a persona física with
`estadoClave=BAJA` and no domicilios, actividades, or impuestos. Verifies that
the parser tolerates absent collection elements and that the formatter renders
the BAJA state prominently.

## `padron-cuit-not-found.xml`

A handcrafted SOAP fault representing the response Padrón A13 emits when the
queried CUIT does not exist in ARCA's records (`faultstring`: "No existe
persona con ese Id"). Drives the `NOT_FOUND` mapping in
`src/padron/client.ts`.

## `wsfe-fecae-success.xml`

Single-comprobante `FECAESolicitarResponse` envelope with `Resultado='A'` and
a sanitized CAE (`75000000000000`). Drives the parser's "approved" branch and
the formatter's `✅` rendering. The CUIT, importes, and CAE are all
placeholder values; nothing in this file corresponds to a real invoice.

## `wsfe-fecae-success-with-observations.xml`

Same shape as the success fixture, but the response includes a non-empty
`Observaciones` array with two entries. Verifies that warnings are preserved
on success and that the formatter surfaces them in a dedicated section.

## `wsfe-fecae-rejected.xml`

`FECAESolicitarResponse` with `Resultado='R'` at both the cabecera and
detalle levels, no CAE, and an `Observaciones` list explaining why ARCA
rejected the comprobante (code `10017`). Drives the discriminated-union
"rechazado" branch — note that this is a business rejection and must NOT
throw.

## `wsfe-fecae-error-validacion.xml`

`FECAESolicitarResponse` with `Resultado='R'` plus a top-level `Errors`
collection containing a schema-level error (`Code 1006`). Exercises the
parser's "errores" pathway separately from observaciones.

## `wsfe-fecomp-consultar-found.xml`

`FECompConsultarResponse` containing a `ResultGet` block with the full
detalle of a previously authorized Factura B (sanitized CAE
`75000000000000`). Drives `parseFeCompConsultarResponse`.

## `wsfe-fecomp-consultar-not-found.xml`

`FECompConsultarResponse` with no `ResultGet` and an `Errors` collection
containing the canonical "no existe" message. Drives the
`WsfeError('NOT_FOUND', ...)` mapping in the parser.

## `wsfe-fecomp-ultimo-autorizado.xml`

`FECompUltimoAutorizadoResponse` returning `PtoVta`, `CbteTipo`, and
`CbteNro=12344`. Drives the parser branch that resolves "next available
number".

## `wsfex-authorize-success.xml`

Single-comprobante `FEXAuthorizeResponse` envelope for a Factura E with
`Resultado='A'` and a sanitized CAE (`75000000000000`). Drives the parser's
"approved" branch and the formatter's `✅` rendering. Importes are USD
amounts, the receiver is `TEST CLIENT INC` to a US destination — all
fictional placeholder values.

## `wsfex-authorize-rejected.xml`

`FEXAuthorizeResponse` with `Resultado='R'`, no CAE, a `Motivos_Obs`
narrative, and a `FEXErr` with code `500` (wrong number). Drives the
discriminated-union "rechazado" branch — note that this is a business
rejection and must NOT throw.

## `wsfex-authorize-error-validacion.xml`

`FEXAuthorizeResponse` with `Resultado='R'` and multiple `FEXErr` entries
covering codes `607` (cotización mismatch) and `650` (idioma inválido).
Exercises the parser's multi-error pathway.

## `wsfex-authorize-structural-error.xml`

`FEXAuthorizeResponse` mirroring the shape ARCA returns when it rejects a
request before assigning a comprobante number: `FEXAuthorizeResult` contains
no `FEXResultAuth`, only a populated `FEXErr` block (here code `1550`,
`Permiso_existente` schema validation). Drives the parser branch that
surfaces this structural rejection as a `ComprobanteExportacionRechazado`
with the cabecera fields zeroed out, so the user sees the error message
instead of an opaque exception.

## `wsfex-getcmp-found.xml`

`FEXGetCMPResponse` containing a `FEXResultGet` block with the full detalle
of a previously authorized Factura E (sanitized CAE `75000000000000`,
fictional client `TEST CLIENT INC`, USD amounts). Drives
`parseFexGetCmpResponse`.

## `wsfex-getcmp-not-found.xml`

`FEXGetCMPResponse` with no `FEXResultGet` and a `FEXErr` collection
containing the canonical "no existe" message. Drives the
`WsfexError('NOT_FOUND', ...)` mapping in the parser.

## `wsfex-getlastcmp.xml`

`FEXGetLast_CMPResponse` returning `Pto_venta`, `Cbte_Tipo`, and
`Cbte_nro=122`. Drives the parser branch that resolves the next available
Factura E number.

## `wsfex-getparam-ctz.xml`

`FEXGetPARAM_CtzResponse` returning a sample cotización (`Mon_id=DOL`,
`Mon_ctz=1180.5`, `Fecha_ctz=20260415`). Drives `parseFexGetParamCtzResponse`
and the `arca_obtener_cotizacion_moneda` tool tests.

## Why these are committed to the repo

Test fixtures need to be deterministic and available in CI. Generating the
self-signed certificate in CI on every run would slow the pipeline and
introduce flakiness. Because the fixtures contain no secrets and no
ARCA-issued credentials, committing them is safe.
