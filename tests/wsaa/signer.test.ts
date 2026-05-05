import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { signCms } from '../../src/wsaa/signer.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const certPem = readFileSync(join(FIXTURES, 'test-cert.pem'), 'utf-8');
const keyPem = readFileSync(join(FIXTURES, 'test-key.pem'), 'utf-8');

const SAMPLE_TRA =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<loginTicketRequest version="1.0">\n' +
  '  <header><uniqueId>1</uniqueId>' +
  '<generationTime>2026-05-04T12:00:00-03:00</generationTime>' +
  '<expirationTime>2026-05-04T12:10:00-03:00</expirationTime></header>' +
  '<service>wsfe</service></loginTicketRequest>';

describe('signCms', () => {
  it('produces a non-empty base64 string', async () => {
    const result = await signCms(SAMPLE_TRA, certPem, keyPem);
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces a base64 string with no whitespace', async () => {
    const result = await signCms(SAMPLE_TRA, certPem, keyPem);
    expect(result).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it('produces a CMS that decodes back to a SignedData structure', async () => {
    const result = await signCms(SAMPLE_TRA, certPem, keyPem);
    const der = Buffer.from(result, 'base64').toString('binary');
    const asn1 = forge.asn1.fromDer(der);
    expect(() => forge.pkcs7.messageFromAsn1(asn1)).not.toThrow();
  });

  it('embeds the signing certificate inside the CMS structure', async () => {
    const result = await signCms(SAMPLE_TRA, certPem, keyPem);
    const der = Buffer.from(result, 'base64').toString('binary');
    const asn1 = forge.asn1.fromDer(der);
    const message = forge.pkcs7.messageFromAsn1(asn1) as unknown as {
      certificates: forge.pki.Certificate[];
    };
    expect(message.certificates.length).toBeGreaterThan(0);
    const subject = message.certificates[0]?.subject.attributes
      .map((a) => `${a.shortName ?? a.name}=${a.value}`)
      .join(',');
    expect(subject).toContain('CN=test');
  });

  it('throws when cert PEM is malformed', async () => {
    await expect(signCms(SAMPLE_TRA, 'not a pem', keyPem)).rejects.toThrow();
  });

  it('throws when key PEM is malformed', async () => {
    await expect(signCms(SAMPLE_TRA, certPem, 'not a pem')).rejects.toThrow();
  });
});
