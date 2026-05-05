import { readFile } from 'node:fs/promises';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import forge from 'node-forge';
import type { ArcaConfig } from '../config/types.js';
import { WSAA_ENDPOINTS } from '../config/types.js';
import { readTa } from '../wsaa/ta-cache.js';
import type { ServiceName, TA } from '../wsaa/types.js';

const KNOWN_SERVICES: ServiceName[] = ['wsfe', 'wsfex', 'ws_sr_padron_a13'];

export const arcaStatusTool: Tool = {
  name: 'arca_status',
  description:
    'Reports the current ARCA configuration and cached token status. Useful for verifying setup before emitting invoices.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleArcaStatus(
  config: ArcaConfig,
  _args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lines: string[] = [];
  const endpoints = WSAA_ENDPOINTS[config.env];

  lines.push('ARCA configuration:');
  lines.push(`  Environment: ${config.env.toUpperCase()}`);
  lines.push(`  CUIT: ${config.cuit}`);
  lines.push(`  Cert path: ${config.certPath} (${await describeCert(config.certPath)})`);
  lines.push(`  Key path: ${config.keyPath}`);
  lines.push(`  Cache dir: ${config.cacheDir}`);
  lines.push('');
  lines.push('Cached tokens:');
  for (const service of KNOWN_SERVICES) {
    lines.push(`  ${service}: ${await describeCached(config.cacheDir, config.cuit, service)}`);
  }
  lines.push('');
  lines.push(`WSAA endpoint: ${endpoints.url}`);

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

async function describeCert(certPath: string): Promise<string> {
  let pem: string;
  try {
    pem = await readFile(certPath, 'utf-8');
  } catch {
    return 'error reading cert file';
  }

  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(pem);
  } catch {
    return 'invalid cert file';
  }

  const cn = cert.subject.getField('CN');
  const subject = cn?.value ? `CN=${cn.value}` : 'unknown subject';
  const expires = formatArgDate(cert.validity.notAfter);
  return `valid, ${subject}, expires ${expires}`;
}

async function describeCached(
  cacheDir: string,
  cuit: string,
  service: ServiceName,
): Promise<string> {
  const ta = await readTa(cacheDir, cuit, service);
  if (!ta) {
    return 'not cached';
  }
  const now = Date.now();
  if (ta.expirationTime.getTime() <= now) {
    return `expired (${formatArgDateTime(ta.expirationTime)})`;
  }
  return `valid until ${formatArgDateTime(ta.expirationTime)} (${formatRemaining(ta, now)})`;
}

function formatRemaining(ta: TA, now: number): string {
  const remainingMs = ta.expirationTime.getTime() - now;
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m remaining`;
}

const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

function formatArgDate(d: Date): string {
  const ar = new Date(d.getTime() - ARG_OFFSET_MS);
  return `${ar.getUTCFullYear()}-${pad(ar.getUTCMonth() + 1)}-${pad(ar.getUTCDate())}`;
}

function formatArgDateTime(d: Date): string {
  const ar = new Date(d.getTime() - ARG_OFFSET_MS);
  return (
    `${ar.getUTCFullYear()}-${pad(ar.getUTCMonth() + 1)}-${pad(ar.getUTCDate())} ` +
    `${pad(ar.getUTCHours())}:${pad(ar.getUTCMinutes())}:${pad(ar.getUTCSeconds())}`
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
