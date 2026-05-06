import { PAISES_WSFEX, TIPOS_COMPROBANTE_EXPORTACION } from './codes.js';
import { describeWsfexError } from './errors.js';
import type {
  CodigoMoneda,
  CodigoPais,
  ComprobanteExportacionAutorizado,
  ComprobanteExportacionConsultado,
  ComprobanteExportacionRechazado,
  CotizacionMoneda,
  ObservacionWsfex,
  ResultadoEmisionExportacion,
  TipoComprobanteExportacion,
  UltimoComprobanteExportacion,
} from './types.js';

const ARS_FORMAT = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const FOREIGN_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONEDA_PREFIX: Partial<Record<CodigoMoneda, string>> = {
  DOL: 'USD',
  '060': 'EUR',
  '002': 'GBP',
  '006': 'BRL',
  '010': 'CLP',
  '011': 'UYU',
  '012': 'JPY',
  '014': 'CNY',
  '019': 'KRW',
  '030': 'CHF',
  '031': 'MXN',
  '091': 'CAD',
};

/**
 * Renders a `ResultadoEmisionExportacion` as Spanish-language plain text. The
 * success variant starts with `✅`; the rejection variant starts with `❌`.
 * Foreign-currency amounts use US-English number formatting (the dominant
 * reading convention for export invoices); ARS amounts (cotización) use the
 * Argentine format with period thousands and comma decimal.
 */
export function formatResultadoEmisionExportacion(result: ResultadoEmisionExportacion): string {
  if (result.status === 'aprobado') {
    return formatAprobado(result);
  }
  return formatRechazado(result);
}

function formatAprobado(r: ComprobanteExportacionAutorizado): string {
  const lines: string[] = [];
  lines.push('✅ Factura E emitida con éxito');
  lines.push('');
  lines.push(`Tipo: ${tipoLabel(r.tipoComprobante)}`);
  lines.push(`Punto de venta: ${formatPuntoVenta(r.puntoVenta)}`);
  lines.push(`Número: ${formatNumero(r.numeroComprobante)}`);
  lines.push(`Fecha: ${formatArgDate(r.fechaComprobante)}`);
  lines.push('');
  lines.push(`Cliente: ${r.cliente.nombre}`);
  if (r.cliente.idImpositivoExterior) {
    lines.push(`ID impositivo: ${r.cliente.idImpositivoExterior}`);
  }
  lines.push(`Domicilio: ${r.cliente.domicilio}`);
  lines.push(`Destino: ${paisLabel(r.destinoPais)}`);
  lines.push('');
  lines.push(
    `Importe total: ${formatMonto(r.importeTotal, r.moneda)} (cotización ${ARS_FORMAT.format(r.cotizacion)} ARS)`,
  );
  lines.push('');
  lines.push(`CAE: ${r.cae}`);
  lines.push(`Vencimiento del CAE: ${formatArgDate(r.fechaVencimientoCae)}`);
  return lines.join('\n');
}

function formatRechazado(r: ComprobanteExportacionRechazado): string {
  const lines: string[] = [];
  lines.push('❌ Factura E rechazada por ARCA');
  lines.push('');
  lines.push(`Tipo: ${tipoLabel(r.tipoComprobante)}`);
  lines.push(`Punto de venta: ${formatPuntoVenta(r.puntoVenta)}`);
  lines.push(`Número intentado: ${formatNumero(r.numeroComprobante)}`);

  if (r.observaciones.length > 0 || r.errores.length > 0) {
    lines.push('');
    lines.push('Errores:');
    for (const o of r.errores) {
      pushObservacion(lines, o);
    }
    for (const o of r.observaciones) {
      pushObservacion(lines, o);
    }
  }
  return lines.join('\n');
}

/**
 * Renders an `UltimoComprobanteExportacion` lookup result. The number is
 * zero-padded to 8 digits to match the printed-invoice convention.
 */
export function formatUltimoComprobanteExportacion(u: UltimoComprobanteExportacion): string {
  if (u.numero === 0) {
    return `Aún no hay comprobantes autorizados para ${tipoLabel(u.tipoComprobante)} en el punto de venta ${formatPuntoVenta(u.puntoVenta)}.`;
  }
  return `Último número autorizado para ${tipoLabel(u.tipoComprobante)} en punto de venta ${formatPuntoVenta(u.puntoVenta)}: ${formatNumero(u.numero)}`;
}

/**
 * Renders a `ComprobanteExportacionConsultado` returned by
 * `arca_consultar_factura_exportacion`.
 */
export function formatComprobanteExportacionConsultado(
  c: ComprobanteExportacionConsultado,
): string {
  const lines: string[] = [];
  lines.push('Detalle del comprobante:');
  lines.push('');
  lines.push(`Tipo: ${tipoLabel(c.tipoComprobante)}`);
  lines.push(`Punto de venta: ${formatPuntoVenta(c.puntoVenta)}`);
  lines.push(`Número: ${formatNumero(c.numeroComprobante)}`);
  lines.push(`Fecha: ${formatArgDate(c.fechaComprobante)}`);
  lines.push('');
  lines.push(`Cliente: ${c.cliente.nombre}`);
  if (c.cliente.idImpositivoExterior) {
    lines.push(`ID impositivo: ${c.cliente.idImpositivoExterior}`);
  }
  lines.push(`Domicilio: ${c.cliente.domicilio}`);
  lines.push(`Destino: ${paisLabel(c.destinoPais)}`);
  lines.push('');
  lines.push(
    `Importe total: ${formatMonto(c.importeTotal, c.moneda)} (cotización ${ARS_FORMAT.format(c.cotizacion)} ARS)`,
  );
  lines.push('');
  lines.push(`CAE: ${c.cae}`);
  lines.push(`Vencimiento del CAE: ${formatArgDate(c.fechaVencimientoCae)}`);
  return lines.join('\n');
}

/**
 * Renders a `CotizacionMoneda` lookup result with the moneda label,
 * Argentine-formatted ARS rate, and Argentine-formatted date.
 */
export function formatCotizacionMoneda(c: CotizacionMoneda): string {
  return `Cotización ${monedaPrefix(c.moneda)} a ARS según ARCA: ${ARS_FORMAT.format(c.cotizacion)}\nFecha: ${formatArgDate(c.fechaCotizacion)}`;
}

function pushObservacion(lines: string[], o: ObservacionWsfex): void {
  const described = describeWsfexError(o.code, o.message);
  const [first, ...rest] = described.split('\n');
  lines.push(`  - ${o.code}: ${first}`);
  for (const r of rest) {
    lines.push(`    ${r}`);
  }
}

function formatMonto(amount: number, moneda: CodigoMoneda): string {
  return `${monedaPrefix(moneda)} ${FOREIGN_FORMAT.format(amount)}`;
}

function monedaPrefix(moneda: CodigoMoneda): string {
  return MONEDA_PREFIX[moneda] ?? moneda;
}

function tipoLabel(tipo: TipoComprobanteExportacion): string {
  return TIPOS_COMPROBANTE_EXPORTACION[tipo]?.name ?? `Tipo ${tipo}`;
}

function paisLabel(codigo: CodigoPais): string {
  return (PAISES_WSFEX as Record<number, string>)[codigo] ?? `País ${codigo}`;
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
