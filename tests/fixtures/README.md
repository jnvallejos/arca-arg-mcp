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

## Why these are committed to the repo

Test fixtures need to be deterministic and available in CI. Generating the
self-signed certificate in CI on every run would slow the pipeline and
introduce flakiness. Because the fixtures contain no secrets and no
ARCA-issued credentials, committing them is safe.
