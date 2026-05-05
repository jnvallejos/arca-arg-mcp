import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { arcaStatusTool, handleArcaStatus } from '../../src/tools/arca-status.js';
import { writeTa } from '../../src/wsaa/ta-cache.js';
import type { TA } from '../../src/wsaa/types.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const TEST_CERT = join(FIXTURES, 'test-cert.pem');
const TEST_KEY = join(FIXTURES, 'test-key.pem');

const REAL_TOKEN = 'PD94bWwgdmVyc2lvbj0iMS4wIj8-PHNzbz4...';
const REAL_SIGN = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789...';

function makeTa(overrides: Partial<TA> = {}): TA {
  return {
    token: REAL_TOKEN,
    sign: REAL_SIGN,
    generationTime: new Date(Date.now() - 60 * 60 * 1000),
    expirationTime: new Date(Date.now() + 11 * 60 * 60 * 1000),
    source: 'CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239',
    destination: 'SERIALNUMBER=CUIT 20239312345, CN=test',
    service: 'wsfe',
    ...overrides,
  };
}

function makeConfig(cacheDir: string, overrides: Partial<ArcaConfig> = {}): ArcaConfig {
  return {
    env: 'homologation',
    cuit: '20239312345',
    certPath: TEST_CERT,
    keyPath: TEST_KEY,
    cacheDir,
    ...overrides,
  };
}

async function statusText(config: ArcaConfig): Promise<string> {
  const result = await handleArcaStatus(config, {});
  expect(result.content[0]?.type).toBe('text');
  return result.content[0]?.text ?? '';
}

describe('arcaStatusTool definition', () => {
  it('exposes the correct tool name', () => {
    expect(arcaStatusTool.name).toBe('arca_status');
  });

  it('has a non-empty description', () => {
    expect(arcaStatusTool.description?.length ?? 0).toBeGreaterThan(10);
  });

  it('declares an empty input schema', () => {
    expect(arcaStatusTool.inputSchema.required).toEqual([]);
  });
});

describe('handleArcaStatus', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'arca-status-test-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('reports HOMOLOGATION environment with correct WSAA endpoint', async () => {
    const text = await statusText(makeConfig(cacheDir, { env: 'homologation' }));
    expect(text).toContain('HOMOLOGATION');
    expect(text).toContain('wsaahomo.afip.gov.ar');
  });

  it('reports PRODUCTION environment with correct WSAA endpoint', async () => {
    const text = await statusText(makeConfig(cacheDir, { env: 'production' }));
    expect(text).toContain('PRODUCTION');
    expect(text).toContain('wsaa.afip.gov.ar');
    expect(text).not.toContain('wsaahomo');
  });

  it('reports the configured CUIT', async () => {
    const text = await statusText(makeConfig(cacheDir, { cuit: '20111111112' }));
    expect(text).toContain('20111111112');
  });

  it('reports cert validity dates extracted from the cert file', async () => {
    const text = await statusText(makeConfig(cacheDir));
    // Self-signed test cert is valid for 10 years; just check year shows up
    expect(text).toMatch(/cert/i);
    expect(text).toMatch(/20\d{2}/);
  });

  it('reports cert subject CN', async () => {
    const text = await statusText(makeConfig(cacheDir));
    expect(text).toContain('CN=test');
  });

  it('reports "valid" for cached tokens with future expiration', async () => {
    await writeTa(cacheDir, '20239312345', 'wsfe', makeTa());
    const text = await statusText(makeConfig(cacheDir));
    expect(text.toLowerCase()).toMatch(/wsfe.*valid/);
  });

  it('reports "expired" for cached tokens with past expiration', async () => {
    await writeTa(
      cacheDir,
      '20239312345',
      'wsfe',
      makeTa({ expirationTime: new Date(Date.now() - 60 * 60 * 1000) }),
    );
    const text = await statusText(makeConfig(cacheDir));
    expect(text.toLowerCase()).toMatch(/wsfe.*expired/);
  });

  it('reports "not cached" for services with no cache file', async () => {
    const text = await statusText(makeConfig(cacheDir));
    expect(text.toLowerCase()).toMatch(/wsfex.*not cached/);
    expect(text.toLowerCase()).toMatch(/ws_sr_padron_a13.*not cached/);
  });

  it('NEVER includes the raw token string in output', async () => {
    await writeTa(cacheDir, '20239312345', 'wsfe', makeTa());
    const text = await statusText(makeConfig(cacheDir));
    expect(text).not.toContain(REAL_TOKEN);
  });

  it('NEVER includes the raw sign string in output', async () => {
    await writeTa(cacheDir, '20239312345', 'wsfe', makeTa());
    const text = await statusText(makeConfig(cacheDir));
    expect(text).not.toContain(REAL_SIGN);
  });

  it('reports cache directory path', async () => {
    const text = await statusText(makeConfig(cacheDir));
    expect(text).toContain(cacheDir);
  });

  it('handles a missing cert file gracefully (reports the error inline)', async () => {
    const badConfig = makeConfig(cacheDir, { certPath: '/nonexistent/cert.pem' });
    const text = await statusText(badConfig);
    expect(text.toLowerCase()).toMatch(/cert/);
    expect(text.toLowerCase()).toMatch(/error|unreadable|missing|not/);
  });

  it('handles a corrupt TA cache file without crashing', async () => {
    writeFileSync(join(cacheDir, 'ta-20239312345-wsfe.json'), '{ corrupt');
    const text = await statusText(makeConfig(cacheDir));
    expect(text.toLowerCase()).toMatch(/wsfe.*not cached/);
  });
});
