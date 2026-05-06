import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
import { buildFeCaeRequest } from '../src/wsfe/builder.js';
import { feCaeSolicitar, feCompUltimoAutorizado } from '../src/wsfe/client.js';
import type { EmitirFacturaInput, ResultadoEmision } from '../src/wsfe/types.js';

const LABEL_WIDTH = 30;

function pad(label: string): string {
  const base = `${label}:`.padEnd(LABEL_WIDTH);
  return base.endsWith(' ') ? base : `${base} `;
}

/**
 * Pure formatter for the smoke-wsfe summary. Returns the body lines printed
 * after the `[smoke-wsfe] ` prefix. The CAE value is NEVER included; only its
 * character length is reported. Error and observation codes are surfaced
 * (numeric only); literal messages are omitted because some carry data
 * echoes (CUITs, importes) that should not appear in scrollback.
 */
export function formatWsfeSmokeSummary(r: ResultadoEmision): string[] {
  if (r.status === 'aprobado') {
    return [
      'Resultado: APROBADO',
      `  ${pad('tipoComprobante')}${r.tipoComprobante}`,
      `  ${pad('numeroComprobante')}${r.numeroComprobante}`,
      `  ${pad('puntoVenta')}${r.puntoVenta}`,
      `  ${pad('importeTotal')}${r.importeTotal}`,
      `  ${pad('cae length')}${r.cae.length} chars (not displayed)`,
      `  ${pad('fechaVencimientoCae')}${r.fechaVencimientoCae}`,
      `  ${pad('observaciones')}${r.observaciones.length}`,
    ];
  }
  return [
    'Resultado: RECHAZADO',
    `  ${pad('tipoComprobante')}${r.tipoComprobante}`,
    `  ${pad('numeroComprobante intentado')}${r.numeroComprobante}`,
    `  ${pad('puntoVenta')}${r.puntoVenta}`,
    `  ${pad('errores')}[${r.errores.map((e) => e.code).join(', ')}]`,
    `  ${pad('observaciones')}${r.observaciones.length}`,
    `  ${pad('observaciones codes')}[${r.observaciones.map((o) => o.code).join(', ')}]`,
  ];
}

/* v8 ignore start */
function log(line: string): void {
  console.log(`[smoke-wsfe] ${line}`);
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main(): Promise<void> {
  log('Loading config...');
  const config = loadConfig();
  log(`env=${config.env} cuit=${config.cuit}`);

  const puntoVenta = Number.parseInt(process.env.SMOKE_PV ?? '1', 10);
  log(`Querying last authorized number for PV=${puntoVenta}, Factura B...`);
  const ultimo = await feCompUltimoAutorizado(puntoVenta, 6, config);
  const next = ultimo.numero + 1;
  log(`Last number: ${ultimo.numero}. Next will be ${next}.`);

  const input: EmitirFacturaInput = {
    tipoComprobante: 6,
    puntoVenta,
    concepto: 1,
    tipoDocReceptor: 99,
    numeroDocReceptor: '0',
    fechaComprobante: todayIsoDate(),
    importeNeto: 100,
    iva: [{ alicuota: '21', baseImponible: 100, importe: 21 }],
    importeTotal: 121,
  };

  log('Emitting test invoice (Factura B, Consumidor Final, total $121,00)...');
  const request = buildFeCaeRequest(input, config.cuit, next);
  const result = await feCaeSolicitar(request, config);

  for (const line of formatWsfeSmokeSummary(result)) {
    log(line);
  }

  if (result.status === 'aprobado') {
    log('Smoke test PASSED');
    return;
  }
  log('Smoke test FAILED (ARCA rejected the comprobante)');
  process.exit(1);
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
