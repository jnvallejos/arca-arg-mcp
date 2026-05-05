import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsaaError } from '../../src/lib/errors.js';
import { getValidToken } from '../../src/wsaa/auth.js';
import type { TA } from '../../src/wsaa/types.js';

const callLoginCmsMock = vi.fn();
const parseTaResponseMock = vi.fn();
const readTaMock = vi.fn();
const writeTaMock = vi.fn();
const signCmsMock = vi.fn();

vi.mock('../../src/wsaa/client.js', () => ({
  callLoginCms: (...args: unknown[]) => callLoginCmsMock(...args),
  parseTaResponse: (...args: unknown[]) => parseTaResponseMock(...args),
}));

vi.mock('../../src/wsaa/ta-cache.js', () => ({
  readTa: (...args: unknown[]) => readTaMock(...args),
  writeTa: (...args: unknown[]) => writeTaMock(...args),
  deleteTa: vi.fn(),
}));

vi.mock('../../src/wsaa/signer.js', () => ({
  signCms: (...args: unknown[]) => signCmsMock(...args),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(async () => '---fake pem---'),
  };
});

function makeConfig(cacheDir: string): ArcaConfig {
  return {
    env: 'homologation',
    cuit: '20239312345',
    certPath: '/tmp/cert.pem',
    keyPath: '/tmp/private.key',
    cacheDir,
  };
}

function makeTa(overrides: Partial<TA> = {}): TA {
  return {
    token: 'token',
    sign: 'sign',
    generationTime: new Date('2026-05-04T12:00:00.000Z'),
    expirationTime: new Date('2026-05-05T00:00:00.000Z'),
    source: 'CN=wsaahomo',
    destination: 'CN=test',
    service: 'wsfe',
    ...overrides,
  };
}

describe('getValidToken', () => {
  let cacheDir: string;
  let config: ArcaConfig;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'arca-auth-test-'));
    config = makeConfig(cacheDir);
    callLoginCmsMock.mockReset();
    parseTaResponseMock.mockReset();
    readTaMock.mockReset();
    writeTaMock.mockReset();
    signCmsMock.mockReset();
    signCmsMock.mockResolvedValue('cms-base64');
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('returns the cached token when expirationTime is comfortably in the future', async () => {
    const cached = makeTa({
      token: 'cached-token',
      expirationTime: new Date(Date.now() + 60 * 60 * 1000),
    });
    readTaMock.mockResolvedValue(cached);

    const result = await getValidToken(config, 'wsfe');
    expect(result.token).toBe('cached-token');
    expect(callLoginCmsMock).not.toHaveBeenCalled();
    expect(writeTaMock).not.toHaveBeenCalled();
  });

  it('fetches a new token when no cached token exists', async () => {
    readTaMock.mockResolvedValue(null);
    const fresh = makeTa({ token: 'fresh-token' });
    callLoginCmsMock.mockResolvedValue('<xml>raw</xml>');
    parseTaResponseMock.mockReturnValue(fresh);

    const result = await getValidToken(config, 'wsfe');
    expect(result.token).toBe('fresh-token');
    expect(callLoginCmsMock).toHaveBeenCalledTimes(1);
  });

  it('fetches a new token when the cached token has already expired', async () => {
    const expired = makeTa({ expirationTime: new Date(Date.now() - 60 * 1000) });
    readTaMock.mockResolvedValue(expired);
    callLoginCmsMock.mockResolvedValue('<xml>raw</xml>');
    parseTaResponseMock.mockReturnValue(makeTa({ token: 'fresh' }));

    const result = await getValidToken(config, 'wsfe');
    expect(result.token).toBe('fresh');
    expect(callLoginCmsMock).toHaveBeenCalledTimes(1);
  });

  it('fetches a new token when the cached token expires within the 60s safety buffer', async () => {
    const nearlyExpired = makeTa({ expirationTime: new Date(Date.now() + 30 * 1000) });
    readTaMock.mockResolvedValue(nearlyExpired);
    callLoginCmsMock.mockResolvedValue('<xml>raw</xml>');
    parseTaResponseMock.mockReturnValue(makeTa({ token: 'rotated' }));

    const result = await getValidToken(config, 'wsfe');
    expect(result.token).toBe('rotated');
    expect(callLoginCmsMock).toHaveBeenCalledTimes(1);
  });

  it('persists the new token to the cache after a successful fetch', async () => {
    readTaMock.mockResolvedValue(null);
    const fresh = makeTa({ token: 'cached-after-fetch' });
    callLoginCmsMock.mockResolvedValue('<xml>raw</xml>');
    parseTaResponseMock.mockReturnValue(fresh);

    await getValidToken(config, 'wsfe');
    expect(writeTaMock).toHaveBeenCalledWith(cacheDir, config.cuit, 'wsfe', fresh);
  });

  it('passes the correct service name through to the TRA → CMS → WSAA pipeline', async () => {
    readTaMock.mockResolvedValue(null);
    callLoginCmsMock.mockResolvedValue('<xml>raw</xml>');
    parseTaResponseMock.mockImplementation((_xml: string, service: string) =>
      makeTa({ service }),
    );

    const result = await getValidToken(config, 'ws_sr_padron_a13');
    expect(result.service).toBe('ws_sr_padron_a13');
    expect(parseTaResponseMock).toHaveBeenCalledWith(expect.any(String), 'ws_sr_padron_a13');
  });

  it('retries once on tokenAlreadyEmitted and returns the second response', async () => {
    readTaMock.mockResolvedValue(null);
    callLoginCmsMock
      .mockRejectedValueOnce(new WsaaError('coe.tokenAlreadyEmitted', 'already emitted'))
      .mockResolvedValueOnce('<xml>second</xml>');
    parseTaResponseMock.mockReturnValue(makeTa({ token: 'after-retry' }));

    const result = await getValidToken(config, 'wsfe');
    expect(result.token).toBe('after-retry');
    expect(callLoginCmsMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on alreadyAuthenticated', async () => {
    readTaMock.mockResolvedValue(null);
    callLoginCmsMock
      .mockRejectedValueOnce(new WsaaError('coe.alreadyAuthenticated', 'already auth'))
      .mockResolvedValueOnce('<xml>second</xml>');
    parseTaResponseMock.mockReturnValue(makeTa());

    await expect(getValidToken(config, 'wsfe')).resolves.toBeDefined();
    expect(callLoginCmsMock).toHaveBeenCalledTimes(2);
  });

  it('propagates the error when the retry also fails', async () => {
    readTaMock.mockResolvedValue(null);
    callLoginCmsMock
      .mockRejectedValueOnce(new WsaaError('coe.tokenAlreadyEmitted', 'first'))
      .mockRejectedValueOnce(new WsaaError('coe.tokenAlreadyEmitted', 'second'));

    await expect(getValidToken(config, 'wsfe')).rejects.toBeInstanceOf(WsaaError);
    expect(callLoginCmsMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on unrelated WsaaErrors', async () => {
    readTaMock.mockResolvedValue(null);
    callLoginCmsMock.mockRejectedValue(new WsaaError('coe.invalidSignature', 'bad sig'));
    await expect(getValidToken(config, 'wsfe')).rejects.toMatchObject({
      code: 'coe.invalidSignature',
    });
    expect(callLoginCmsMock).toHaveBeenCalledTimes(1);
  });
});
