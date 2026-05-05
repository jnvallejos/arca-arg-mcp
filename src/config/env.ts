import { constants, accessSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../lib/errors.js';
import { resolvePath } from '../lib/path.js';
import type { ArcaConfig } from './types.js';

const envSchema = z.object({
  ARCA_ENV: z.enum(['homologation', 'production'], {
    errorMap: () => ({
      message: 'ARCA_ENV must be either "homologation" or "production"',
    }),
  }),
  ARCA_CUIT: z
    .string({ required_error: 'ARCA_CUIT not set. Expected an 11-digit CUIT (no dashes).' })
    .regex(/^[0-9]{11}$/, 'ARCA_CUIT must be exactly 11 numeric digits, no dashes or spaces.'),
  ARCA_CERT_PATH: z
    .string({
      required_error:
        'ARCA_CERT_PATH not set. Expected an absolute or relative path to your X.509 certificate (PEM format).',
    })
    .min(1, 'ARCA_CERT_PATH must not be empty.'),
  ARCA_KEY_PATH: z
    .string({
      required_error:
        'ARCA_KEY_PATH not set. Expected an absolute or relative path to your private key (PEM format).',
    })
    .min(1, 'ARCA_KEY_PATH must not be empty.'),
  ARCA_CACHE_DIR: z.string().optional(),
});

type EnvShape = z.infer<typeof envSchema>;

export function loadConfig(): ArcaConfig {
  const parsed = parseEnv();

  const certPath = resolvePath(parsed.ARCA_CERT_PATH);
  const keyPath = resolvePath(parsed.ARCA_KEY_PATH);

  assertReadable(certPath, 'ARCA_CERT_PATH');
  assertReadable(keyPath, 'ARCA_KEY_PATH');

  const cacheDir = parsed.ARCA_CACHE_DIR
    ? resolvePath(parsed.ARCA_CACHE_DIR)
    : join(homedir(), '.arca-arg-mcp', 'cache');

  return {
    env: parsed.ARCA_ENV,
    cuit: parsed.ARCA_CUIT,
    certPath,
    keyPath,
    cacheDir,
  };
}

function parseEnv(): EnvShape {
  const result = envSchema.safeParse({
    ARCA_ENV: process.env.ARCA_ENV,
    ARCA_CUIT: process.env.ARCA_CUIT,
    ARCA_CERT_PATH: process.env.ARCA_CERT_PATH,
    ARCA_KEY_PATH: process.env.ARCA_KEY_PATH,
    ARCA_CACHE_DIR: process.env.ARCA_CACHE_DIR,
  });

  if (result.success) {
    return result.data;
  }

  const first = result.error.issues[0];
  if (!first) {
    throw new ConfigError('Invalid ARCA configuration.');
  }
  const varName = first.path[0] ?? 'ARCA_*';
  throw new ConfigError(`${String(varName)}: ${first.message}`);
}

function assertReadable(path: string, varName: string): void {
  try {
    accessSync(path, constants.R_OK);
  } catch {
    throw new ConfigError(
      `${varName}: file at ${path} does not exist or is not readable. Verify the path and the file permissions.`,
    );
  }
}
