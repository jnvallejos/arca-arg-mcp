import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
import { buildFexAuthorizeRequest } from '../src/wsfex/builder.js';
import { fexAuthorize, fexGetLastCmp, fexGetParamCtz } from '../src/wsfex/client.js';
import type {
  EmitirFacturaExportacionInput,
  ResultadoEmisionExportacion,
} from '../src/wsfex/types.js';

const LABEL_WIDTH = 30;

function pad(label: string): string {
  const base = `${label}:`.padEnd(LABEL_WIDTH);
  return base.endsWith(' ') ? base : `${base} `;
}

/**
 * Pure formatter for the smoke-wsfex summary. Returns the body lines printed
 * after the `[smoke-wsfex] ` prefix. The CAE value is NEVER included; only its
 * character length is reported. Error and observation codes are surfaced
 * (numeric only); literal messages are omitted because some carry data
 * echoes that should not appear in scrollback.
 */
export function formatWsfexSmokeSummary(r: ResultadoEmisionExportacion): string[] {
  if (r.status === 'aprobado') {
    return [
      'Resultado: APROBADO',
      `  ${pad('tipoComprobante')}${r.tipoComprobante}`,
      `  ${pad('numeroComprobante')}${r.numeroComprobante}`,
      `  ${pad('puntoVenta')}${r.puntoVenta}`,
      `  ${pad('importeTotal')}${r.importeTotal}`,
      `  ${pad('moneda')}${r.moneda}`,
      `  ${pad('cotizacion')}${r.cotizacion}`,
      `  ${pad('cae length')}${r.cae.length} chars (not displayed)`,
      `  ${pad('fechaVencimientoCae')}${r.fechaVencimientoCae}`,
      `  ${pad('observaciones')}0`,
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
  console.log(`[smoke-wsfex] ${line}`);
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

  log('Querying current ARCA cotización for DOL...');
  const ctz = await fexGetParamCtz('DOL', config);
  log(`Cotización: ${ctz.cotizacion} (date ${ctz.fechaCotizacion})`);

  log(`Querying last authorized number for PV=${puntoVenta}, Factura E...`);
  const ultimo = await fexGetLastCmp(puntoVenta, config);
  const next = ultimo.numero + 1;
  log(`Last number: ${ultimo.numero}. Next will be ${next}.`);

  const today = todayIsoDate();
  const input: EmitirFacturaExportacionInput = {
    tipoComprobante: 19,
    puntoVenta,
    concepto: 2,
    fechaComprobante: today,
    destinoPais: 200,
    cliente: {
      nombre: 'TEST CLIENT INC',
      domicilio: '123 Main St, NY, USA',
      idImpositivoExterior: 'TEST-EIN-12345',
    },
    moneda: 'DOL',
    cotizacion: ctz.cotizacion,
    idiomaComprobante: 2,
    items: [
      {
        codigoProducto: 'TEST-001',
        descripcion: 'Consulting services',
        cantidad: 1,
        unidadMedida: 7,
        precioUnitario: 100,
        importeTotal: 100,
      },
    ],
    importeTotal: 100,
    fechaPago: today,
  };

  log('Emitting test Factura E (DOL 100 to TEST CLIENT INC, ESTADOS UNIDOS)...');
  const request = buildFexAuthorizeRequest(input, config.cuit, next);
  const result = await fexAuthorize(request, config);

  for (const line of formatWsfexSmokeSummary(result)) {
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
