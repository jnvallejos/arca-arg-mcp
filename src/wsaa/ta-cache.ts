import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServiceName, TA } from './types.js';

interface PersistedTa {
  token: string;
  sign: string;
  generationTime: string;
  expirationTime: string;
  source: string;
  destination: string;
  service: string;
}

function cachePath(cacheDir: string, cuit: string, service: ServiceName): string {
  return join(cacheDir, `ta-${cuit}-${service}.json`);
}

export async function readTa(
  cacheDir: string,
  cuit: string,
  service: ServiceName,
): Promise<TA | null> {
  let raw: string;
  try {
    raw = await readFile(cachePath(cacheDir, cuit, service), 'utf-8');
  } catch {
    return null;
  }

  let parsed: PersistedTa;
  try {
    parsed = JSON.parse(raw) as PersistedTa;
  } catch {
    return null;
  }

  const generationTime = new Date(parsed.generationTime);
  const expirationTime = new Date(parsed.expirationTime);
  if (Number.isNaN(generationTime.getTime()) || Number.isNaN(expirationTime.getTime())) {
    return null;
  }

  return {
    token: parsed.token,
    sign: parsed.sign,
    generationTime,
    expirationTime,
    source: parsed.source,
    destination: parsed.destination,
    service: parsed.service,
  };
}

export async function writeTa(
  cacheDir: string,
  cuit: string,
  service: ServiceName,
  ta: TA,
): Promise<void> {
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });

  const payload: PersistedTa = {
    token: ta.token,
    sign: ta.sign,
    generationTime: ta.generationTime.toISOString(),
    expirationTime: ta.expirationTime.toISOString(),
    source: ta.source,
    destination: ta.destination,
    service: ta.service,
  };

  await writeFile(cachePath(cacheDir, cuit, service), `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function deleteTa(
  cacheDir: string,
  cuit: string,
  service: ServiceName,
): Promise<void> {
  try {
    await unlink(cachePath(cacheDir, cuit, service));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}
