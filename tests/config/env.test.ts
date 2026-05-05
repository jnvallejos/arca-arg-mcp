import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { ConfigError } from '../../src/lib/errors.js';

const REQUIRED_VARS = [
  'ARCA_ENV',
  'ARCA_CUIT',
  'ARCA_CERT_PATH',
  'ARCA_KEY_PATH',
  'ARCA_CACHE_DIR',
];

describe('loadConfig', () => {
  let tmpDir: string;
  let certPath: string;
  let keyPath: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of REQUIRED_VARS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'arca-env-test-'));
    certPath = join(tmpDir, 'cert.pem');
    keyPath = join(tmpDir, 'private.key');
    writeFileSync(certPath, 'fake cert');
    writeFileSync(keyPath, 'fake key');
  });

  afterEach(() => {
    for (const key of REQUIRED_VARS) {
      const previous = savedEnv[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads valid configuration from env vars', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    process.env.ARCA_CACHE_DIR = join(tmpDir, 'cache');

    const config = loadConfig();
    expect(config).toEqual({
      env: 'homologation',
      cuit: '20239312345',
      certPath,
      keyPath,
      cacheDir: join(tmpDir, 'cache'),
    });
  });

  it('throws ConfigError when ARCA_ENV is missing', () => {
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(/ARCA_ENV/);
  });

  it('throws ConfigError when ARCA_ENV is invalid', () => {
    process.env.ARCA_ENV = 'staging';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(/ARCA_ENV/);
  });

  it('throws ConfigError when ARCA_CUIT is missing', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    expect(() => loadConfig()).toThrow(/ARCA_CUIT/);
  });

  it('throws ConfigError when ARCA_CUIT has dashes', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20-23931234-5';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    expect(() => loadConfig()).toThrow(/ARCA_CUIT/);
  });

  it('throws ConfigError when ARCA_CUIT is too short', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '202393123';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    expect(() => loadConfig()).toThrow(/ARCA_CUIT/);
  });

  it('throws ConfigError when ARCA_CERT_PATH is missing', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_KEY_PATH = keyPath;
    expect(() => loadConfig()).toThrow(/ARCA_CERT_PATH/);
  });

  it('throws ConfigError when cert file does not exist', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = join(tmpDir, 'missing.pem');
    process.env.ARCA_KEY_PATH = keyPath;
    expect(() => loadConfig()).toThrow(/ARCA_CERT_PATH/);
  });

  it('throws ConfigError when key file does not exist', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = join(tmpDir, 'missing.key');
    expect(() => loadConfig()).toThrow(/ARCA_KEY_PATH/);
  });

  it('resolves ~/path to absolute path under home dir', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    process.env.ARCA_CACHE_DIR = '~/custom-cache';

    const config = loadConfig();
    expect(config.cacheDir.startsWith('/')).toBe(true);
    expect(config.cacheDir.endsWith('/custom-cache')).toBe(true);
  });

  it('defaults cacheDir to ~/.arca-arg-mcp/cache when not set', () => {
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;

    const config = loadConfig();
    expect(config.cacheDir.endsWith('/.arca-arg-mcp/cache')).toBe(true);
    expect(config.cacheDir.startsWith('/')).toBe(true);
  });

  it('uses ARCA_CACHE_DIR when set', () => {
    const customCache = join(tmpDir, 'custom-cache');
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;
    process.env.ARCA_CACHE_DIR = customCache;

    const config = loadConfig();
    expect(config.cacheDir).toBe(customCache);
  });

  it('accepts production environment', () => {
    process.env.ARCA_ENV = 'production';
    process.env.ARCA_CUIT = '20239312345';
    process.env.ARCA_CERT_PATH = certPath;
    process.env.ARCA_KEY_PATH = keyPath;

    const config = loadConfig();
    expect(config.env).toBe('production');
  });
});
