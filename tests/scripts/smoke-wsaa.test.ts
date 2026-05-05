import { describe, expect, it } from 'vitest';
import { formatTaSummary } from '../../scripts/smoke-wsaa.js';
import type { TA } from '../../src/wsaa/types.js';

const SECRET_TOKEN = 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4=';
const SECRET_SIGN = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789signaturepayload';

function makeTa(overrides: Partial<TA> = {}): TA {
  return {
    token: SECRET_TOKEN,
    sign: SECRET_SIGN,
    generationTime: new Date('2026-05-05T15:03:00.000Z'),
    expirationTime: new Date('2026-05-06T03:03:00.000Z'),
    source: 'CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239',
    destination: 'SERIALNUMBER=CUIT 20111111112, CN=arcaargmcphomo',
    service: 'wsfe',
    ...overrides,
  };
}

const CACHE_PATH = '/Users/dev/.arca-arg-mcp/cache/ta-20111111112-wsfe.json';
// `now` is 4 minutes after generationTime, leaving 11h 56m of life.
const NOW = new Date('2026-05-05T15:07:00.000Z');

describe('formatTaSummary', () => {
  it('includes the service name', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    expect(lines.some((line) => /^\s+service:\s+wsfe$/.test(line))).toBe(true);
  });

  it('includes generationTime in ISO format', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    expect(lines.join('\n')).toContain('generationTime:');
    expect(lines.join('\n')).toContain('2026-05-05T15:03:00.000Z');
  });

  it('includes expirationTime with human-readable remaining time', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    const joined = lines.join('\n');
    expect(joined).toContain('expirationTime:');
    expect(joined).toContain('2026-05-06T03:03:00.000Z');
    expect(joined).toContain('(11h 56m from now)');
  });

  it('reports the remaining time as expired when the TA is past expiration', () => {
    const ta = makeTa({ expirationTime: new Date('2026-05-04T00:00:00.000Z') });
    const lines = formatTaSummary(ta, CACHE_PATH, NOW);
    expect(lines.join('\n')).toContain('(expired)');
  });

  it('includes source and destination strings verbatim', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    const joined = lines.join('\n');
    expect(joined).toContain('CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239');
    expect(joined).toContain('SERIALNUMBER=CUIT 20111111112, CN=arcaargmcphomo');
  });

  it('reports token length and never the token itself', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    const joined = lines.join('\n');
    expect(joined).toContain('token length:');
    expect(joined).toContain(`${SECRET_TOKEN.length} chars (not displayed)`);
    expect(joined).not.toContain(SECRET_TOKEN);
  });

  it('reports sign length and never the sign itself', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    const joined = lines.join('\n');
    expect(joined).toContain('sign length:');
    expect(joined).toContain(`${SECRET_SIGN.length} chars (not displayed)`);
    expect(joined).not.toContain(SECRET_SIGN);
  });

  it('includes the cache file path', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    expect(lines.join('\n')).toContain(CACHE_PATH);
  });

  it('starts with the "TA acquired:" header line', () => {
    const lines = formatTaSummary(makeTa(), CACHE_PATH, NOW);
    expect(lines[0]).toBe('TA acquired:');
  });
});
