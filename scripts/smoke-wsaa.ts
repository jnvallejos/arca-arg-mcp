import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
import { getValidToken } from '../src/wsaa/auth.js';
import type { ServiceName, TA } from '../src/wsaa/types.js';

const SMOKE_SERVICE: ServiceName = 'wsfe';
const LABEL_WIDTH = 30;

function pad(label: string): string {
  const base = `${label}:`.padEnd(LABEL_WIDTH);
  return base.endsWith(' ') ? base : `${base} `;
}

function formatRemaining(expirationTime: Date, now: Date): string {
  const diffMs = expirationTime.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 'expired';
  }
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m from now`;
}

/**
 * Pure formatter for the smoke-test summary. Produces the body lines printed
 * after the `[smoke] ` prefix. The raw `token` and `sign` strings are NEVER
 * included in any returned line; only their character lengths are reported.
 */
export function formatTaSummary(ta: TA, cachePath: string, now: Date): string[] {
  return [
    'TA acquired:',
    `  ${pad('service')}${ta.service}`,
    `  ${pad('generationTime')}${ta.generationTime.toISOString()}`,
    `  ${pad('expirationTime')}${ta.expirationTime.toISOString()} (${formatRemaining(ta.expirationTime, now)})`,
    `  ${pad('source')}${ta.source}`,
    `  ${pad('destination')}${ta.destination}`,
    `  ${pad('token length')}${ta.token.length} chars (not displayed)`,
    `  ${pad('sign length')}${ta.sign.length} chars (not displayed)`,
    `  ${pad('cached at')}${cachePath}`,
  ];
}

/* v8 ignore start */
function log(line: string): void {
  console.log(`[smoke-wsaa] ${line}`);
}

function cacheFilePath(cacheDir: string, cuit: string, service: ServiceName): string {
  return join(cacheDir, `ta-${cuit}-${service}.json`);
}

async function main(): Promise<void> {
  log('Loading config...');
  const config = loadConfig();
  log(`env=${config.env} cuit=${config.cuit}`);

  log(`Requesting TA for service: ${SMOKE_SERVICE}`);
  const ta = await getValidToken(config, SMOKE_SERVICE);
  const cachePath = cacheFilePath(config.cacheDir, config.cuit, SMOKE_SERVICE);
  for (const line of formatTaSummary(ta, cachePath, new Date())) {
    log(line);
  }
  log('Smoke test PASSED');
}

function isInvokedAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isInvokedAsScript()) {
  main().catch((err: unknown) => {
    log('Smoke test FAILED:');
    if (err instanceof Error) {
      log(`  ${err.name}: ${err.message}`);
      if (err.stack) {
        log(`  ${err.stack}`);
      }
    } else {
      log(`  ${String(err)}`);
    }
    process.exit(1);
  });
}
/* v8 ignore stop */
