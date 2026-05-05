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

## Why these are committed to the repo

Test fixtures need to be deterministic and available in CI. Generating the
self-signed certificate in CI on every run would slow the pipeline and
introduce flakiness. Because the fixtures contain no secrets and no
ARCA-issued credentials, committing them is safe.
