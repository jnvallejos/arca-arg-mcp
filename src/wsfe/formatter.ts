import { TIPOS_COMPROBANTE_V1 } from './codes.js';
import { describeWsfeError } from './errors.js';
import type {
  ComprobanteAutorizado,
  ComprobanteConsultado,
  ComprobanteRechazado,
  ObservacionWsfe,
  ResultadoEmision,
  TipoComprobante,
  UltimoComprobante,
} from './types.js';

const ARS_FORMAT = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Renders a `ResultadoEmision` as Spanish-language plain text. The success
 * variant starts with `✅`; the rejection variant starts with `❌`. Both
 * surface ARCA observations with codes, messages, and (for known codes) a
 * lightbulb hint that points the LLM at the right next step.
 */
export function formatResultadoEmision(result: ResultadoEmision): string {
  if (result.status === 'aprobado') {
    return formatAprobado(result);
  }
  return formatRechazado(result);
}

function formatAprobado(r: ComprobanteAutorizado): string {
  const lines: string[] = [];
  lines.push('✅ Factura emitida con éxito');
  lines.push('');
  lines.push(`Tipo: ${tipoLabel(r.tipoComprobante)}`);
  lines.push(`Punto de venta: ${formatPuntoVenta(r.puntoVenta)}`);
  lines.push(`Número: ${formatNumero(r.numeroComprobante)}`);
  lines.push(`Fecha: ${formatArgDate(r.fechaComprobante)}`);
  lines.push('');
  lines.push(`Importe total: $ ${ARS_FORMAT.format(r.importeTotal)}`);
  lines.push('');
  lines.push(`CAE: ${r.cae}`);
  lines.push(`Vencimiento del CAE: ${formatArgDate(r.fechaVencimientoCae)}`);

  if (r.observaciones.length > 0) {
    lines.push('');
    lines.push('Observaciones de ARCA:');
    for (const o of r.observaciones) {
      pushObservacion(lines, o);
    }
  }
  return lines.join('\n');
}

function formatRechazado(r: ComprobanteRechazado): string {
  const lines: string[] = [];
  lines.push('❌ Factura rechazada por ARCA');
  lines.push('');
  lines.push(`Tipo: ${tipoLabel(r.tipoComprobante)}`);
  lines.push(`Punto de venta: ${formatPuntoVenta(r.puntoVenta)}`);
  lines.push(`Número intentado: ${formatNumero(r.numeroComprobante)}`);

  if (r.observaciones.length > 0 || r.errores.length > 0) {
    lines.push('');
    lines.push('Errores:');
    for (const o of r.observaciones) {
      pushObservacion(lines, o);
    }
    for (const o of r.errores) {
      pushObservacion(lines, o);
    }
  }
  return lines.join('\n');
}

/**
 * Renders an `UltimoComprobante` lookup result. The number is zero-padded to
 * 8 digits to match the printed-invoice convention.
 */
export function formatUltimoComprobante(u: UltimoComprobante): string {
  if (u.numero === 0) {
    return `Aún no hay comprobantes autorizados para ${tipoLabel(u.tipoComprobante)} en el punto de venta ${formatPuntoVenta(u.puntoVenta)}.`;
  }
  return `Último número autorizado para ${tipoLabel(u.tipoComprobante)} en punto de venta ${formatPuntoVenta(u.puntoVenta)}: ${formatNumero(u.numero)}`;
}

/**
 * Renders a `ComprobanteConsultado` returned by `arca_consultar_comprobante`.
 * Same field set as the success-emission rendering, but the header reads
 * "Detalle del comprobante" so the user can tell the two flows apart.
 */
export function formatComprobanteConsultado(c: ComprobanteConsultado): string {
  const lines: string[] = [];
  lines.push('Detalle del comprobante:');
  lines.push('');
  lines.push(`Tipo: ${tipoLabel(c.tipoComprobante)}`);
  lines.push(`Punto de venta: ${formatPuntoVenta(c.puntoVenta)}`);
  lines.push(`Número: ${formatNumero(c.numeroComprobante)}`);
  lines.push(`Fecha: ${formatArgDate(c.fechaComprobante)}`);
  lines.push('');
  lines.push(`Importe neto: $ ${ARS_FORMAT.format(c.importeNeto)}`);
  lines.push(`Importe total: $ ${ARS_FORMAT.format(c.importeTotal)}`);
  lines.push('');
  lines.push(`CAE: ${c.cae}`);
  lines.push(`Vencimiento del CAE: ${formatArgDate(c.fechaVencimientoCae)}`);

  if (c.observaciones.length > 0) {
    lines.push('');
    lines.push('Observaciones de ARCA:');
    for (const o of c.observaciones) {
      pushObservacion(lines, o);
    }
  }
  return lines.join('\n');
}

/** Renders the static V1 tipos-comprobante table. */
export function formatTiposComprobanteList(): string {
  const lines: string[] = [];
  lines.push('Tipos de comprobante soportados por este servidor (V1):');
  lines.push('');
  lines.push('| Código | Tipo        | Emisor                     |');
  lines.push('|--------|-------------|----------------------------|');
  for (const code of [1, 6, 11] as TipoComprobante[]) {
    const t = TIPOS_COMPROBANTE_V1[code];
    lines.push(`| ${String(code).padEnd(6)} | ${t.name.padEnd(11)} | ${t.issuer.padEnd(26)} |`);
  }
  lines.push('');
  lines.push('Notas de Crédito y Notas de Débito no están disponibles en V1.');
  return lines.join('\n');
}

function pushObservacion(lines: string[], o: ObservacionWsfe): void {
  const described = describeWsfeError(o.code, o.message);
  const [first, ...rest] = described.split('\n');
  lines.push(`  - ${o.code}: ${first}`);
  for (const r of rest) {
    lines.push(`    ${r}`);
  }
}

function tipoLabel(tipo: TipoComprobante): string {
  return TIPOS_COMPROBANTE_V1[tipo]?.name ?? `Tipo ${tipo}`;
}

function formatPuntoVenta(pv: number): string {
  return String(pv).padStart(4, '0');
}

function formatNumero(n: number): string {
  return String(n).padStart(8, '0');
}

function formatArgDate(input: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!match) return input;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
