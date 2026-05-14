import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
import { getPersona } from '../src/padron/client.js';
import type { PersonaPadron } from '../src/padron/types.js';

const LABEL_WIDTH = 30;

function pad(label: string): string {
  const base = `${label}:`.padEnd(LABEL_WIDTH);
  return base.endsWith(' ') ? base : `${base} `;
}

function redacted(value: string): string {
  return `(${value.length} chars, redacted)`;
}

function summarizeMonotributo(persona: PersonaPadron): string {
  const cat = persona.categoriaMonotributo;
  if (!cat) return 'no';
  return `yes (${cat.descripcionCategoria})`;
}

/**
 * Pure formatter for the smoke-padron summary. Returns the body lines printed
 * after the `[smoke-padron] ` prefix. Names, address strings, activity
 * descriptions and impuesto descriptions are NEVER included; only lengths and
 * counts are reported. The redaction is the centerpiece of the unit tests.
 */
export function formatPersonaSummary(persona: PersonaPadron): string[] {
  const lines: string[] = ['Persona retrieved:'];
  lines.push(`  ${pad('tipoPersona')}${persona.tipoPersona}`);
  lines.push(`  ${pad('cuit')}${persona.cuit}`);
  lines.push(`  ${pad('estadoClave')}${persona.estadoClave}`);

  if (persona.tipoPersona === 'FISICA') {
    lines.push(`  ${pad('nombre')}${redacted(persona.nombre)}`);
    lines.push(`  ${pad('apellido')}${redacted(persona.apellido)}`);
  } else {
    lines.push(`  ${pad('razonSocial')}${redacted(persona.razonSocial)}`);
  }

  lines.push(`  ${pad('domicilios')}${persona.domicilios.length}`);
  lines.push(`  ${pad('actividades')}${persona.actividades.length}`);
  lines.push(`  ${pad('impuestos')}${persona.impuestos.length}`);
  lines.push(`  ${pad('monotributo')}${summarizeMonotributo(persona)}`);
  return lines;
}

/* v8 ignore start */
function log(line: string): void {
  console.log(`[smoke-padron] ${line}`);
}

async function main(): Promise<void> {
  log('Loading config...');
  const config = loadConfig();
  log(`env=${config.env} cuit=${config.cuit}`);

  const cuitToQuery = process.env.SMOKE_CUIT?.trim() || config.cuit;
  log(`Looking up CUIT: ${cuitToQuery}`);

  const persona = await getPersona(cuitToQuery, config);
  for (const line of formatPersonaSummary(persona)) {
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
