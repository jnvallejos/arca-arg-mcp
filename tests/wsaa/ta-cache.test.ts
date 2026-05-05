import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteTa, readTa, writeTa } from '../../src/wsaa/ta-cache.js';
import type { TA } from '../../src/wsaa/types.js';

const CUIT = '20239312345';
const SERVICE = 'wsfe';

function makeTa(overrides: Partial<TA> = {}): TA {
  return {
    token: 'fake-token',
    sign: 'fake-sign',
    generationTime: new Date('2026-05-04T12:00:00.000Z'),
    expirationTime: new Date('2026-05-05T00:00:00.000Z'),
    source: 'CN=wsaahomo, O=AFIP',
    destination: 'SERIALNUMBER=CUIT 20239312345',
    service: 'wsfe',
    ...overrides,
  };
}

describe('ta-cache', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'arca-ta-test-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe('readTa', () => {
    it('returns null when file does not exist', async () => {
      const result = await readTa(cacheDir, CUIT, SERVICE);
      expect(result).toBeNull();
    });

    it('returns null when the file is malformed JSON', async () => {
      const path = join(cacheDir, `ta-${CUIT}-${SERVICE}.json`);
      writeFileSync(path, '{ this is not json');
      const result = await readTa(cacheDir, CUIT, SERVICE);
      expect(result).toBeNull();
    });

    it('returns the parsed TA when file is valid', async () => {
      const ta = makeTa();
      await writeTa(cacheDir, CUIT, SERVICE, ta);
      const result = await readTa(cacheDir, CUIT, SERVICE);
      expect(result).not.toBeNull();
      expect(result?.token).toBe(ta.token);
      expect(result?.sign).toBe(ta.sign);
      expect(result?.expirationTime.toISOString()).toBe(ta.expirationTime.toISOString());
    });

    it('returns null when expirationTime is missing or unparseable', async () => {
      const path = join(cacheDir, `ta-${CUIT}-${SERVICE}.json`);
      writeFileSync(path, JSON.stringify({ token: 'x', sign: 'y' }));
      const result = await readTa(cacheDir, CUIT, SERVICE);
      expect(result).toBeNull();
    });
  });

  describe('writeTa', () => {
    it('creates the cache directory if it does not exist', async () => {
      const newDir = join(cacheDir, 'nested', 'cache');
      await writeTa(newDir, CUIT, SERVICE, makeTa());
      expect(existsSync(newDir)).toBe(true);
    });

    it('writes files with mode 0600 (owner read/write only)', async () => {
      await writeTa(cacheDir, CUIT, SERVICE, makeTa());
      const path = join(cacheDir, `ta-${CUIT}-${SERVICE}.json`);
      const stats = statSync(path);
      // Mask off the file-type bits, leave only permission bits
      const perms = stats.mode & 0o777;
      expect(perms).toBe(0o600);
    });

    it('overwrites an existing cache file', async () => {
      await writeTa(cacheDir, CUIT, SERVICE, makeTa({ token: 'first' }));
      await writeTa(cacheDir, CUIT, SERVICE, makeTa({ token: 'second' }));
      const result = await readTa(cacheDir, CUIT, SERVICE);
      expect(result?.token).toBe('second');
    });

    it('persists the JSON payload at ta-{cuit}-{service}.json', async () => {
      await writeTa(cacheDir, CUIT, SERVICE, makeTa({ token: 'unique-token' }));
      const path = join(cacheDir, `ta-${CUIT}-${SERVICE}.json`);
      const raw = readFileSync(path, 'utf-8');
      expect(raw).toContain('"token": "unique-token"');
    });
  });

  describe('deleteTa', () => {
    it('removes the cache file', async () => {
      await writeTa(cacheDir, CUIT, SERVICE, makeTa());
      const path = join(cacheDir, `ta-${CUIT}-${SERVICE}.json`);
      expect(existsSync(path)).toBe(true);
      await deleteTa(cacheDir, CUIT, SERVICE);
      expect(existsSync(path)).toBe(false);
    });

    it('is idempotent when the file is already gone', async () => {
      await expect(deleteTa(cacheDir, CUIT, SERVICE)).resolves.toBeUndefined();
    });
  });
});
