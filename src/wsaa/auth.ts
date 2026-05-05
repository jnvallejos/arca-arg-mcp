import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import type { ArcaConfig } from '../config/types.js';
import { WSAA_ENDPOINTS } from '../config/types.js';
import { WsaaError } from '../lib/errors.js';
import { callLoginCms, parseTaResponse } from './client.js';
import { signCms } from './signer.js';
import { readTa, writeTa } from './ta-cache.js';
import { buildTra } from './tra.js';
import type { ServiceName, TA } from './types.js';

const SAFETY_BUFFER_MS = 60 * 1000;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_FAULT_CODES = new Set(['coe.tokenAlreadyEmitted', 'coe.alreadyAuthenticated']);

/**
 * Returns a TA for the requested service, reusing the on-disk cache when the
 * cached TA still has more than {@link SAFETY_BUFFER_MS} milliseconds of life,
 * and otherwise authenticating against WSAA and refreshing the cache.
 *
 * Retries once when WSAA reports the TA was already emitted (a benign race
 * condition triggered by parallel callers), then propagates any further errors.
 */
export async function getValidToken(config: ArcaConfig, service: ServiceName): Promise<TA> {
  const cached = await readTa(config.cacheDir, config.cuit, service);
  if (cached && cached.expirationTime.getTime() > Date.now() + SAFETY_BUFFER_MS) {
    return cached;
  }

  return refreshToken(config, service);
}

async function refreshToken(config: ArcaConfig, service: ServiceName): Promise<TA> {
  const endpoint = WSAA_ENDPOINTS[config.env].url;
  const [certPem, keyPem] = await Promise.all([
    readFile(config.certPath, 'utf-8'),
    readFile(config.keyPath, 'utf-8'),
  ]);

  try {
    return await authenticate(config, service, endpoint, certPem, keyPem);
  } catch (err) {
    if (err instanceof WsaaError && RETRYABLE_FAULT_CODES.has(err.code)) {
      await wait(RETRY_DELAY_MS);
      return await authenticate(config, service, endpoint, certPem, keyPem);
    }
    throw err;
  }
}

async function authenticate(
  config: ArcaConfig,
  service: ServiceName,
  endpoint: string,
  certPem: string,
  keyPem: string,
): Promise<TA> {
  const { xml } = buildTra(service);
  const cms = await signCms(xml, certPem, keyPem);
  const rawResponse = await callLoginCms(cms, endpoint);
  const ta = parseTaResponse(rawResponse, service);
  await writeTa(config.cacheDir, config.cuit, service, ta);
  return ta;
}
