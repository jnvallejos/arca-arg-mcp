import { XMLParser } from 'fast-xml-parser';
import { WsfexError } from '../lib/errors.js';
import type {
  CodigoMoneda,
  CodigoPais,
  ComprobanteExportacionAutorizado,
  ComprobanteExportacionConsultado,
  ComprobanteExportacionRechazado,
  CotizacionMoneda,
  ItemFacturaExportacion,
  ObservacionWsfex,
  TipoComprobanteExportacion,
  UltimoComprobanteExportacion,
} from './types.js';

/**
 * `FEXAuthorizeResponse` does not include `Imp_total`, `Moneda_Id`, or
 * `Moneda_ctz` in `FEXResultAuth`, so the parser cannot produce a fully
 * formed `ComprobanteExportacionAutorizado`. The client is responsible for
 * stamping those fields from the original request after parsing. Same lesson
 * learned from Phase 3's `importeTotal` fix-up.
 */
type ParsedAprobado = Omit<
  ComprobanteExportacionAutorizado,
  'importeTotal' | 'moneda' | 'cotizacion'
>;
export type ParsedResultadoExportacion = ParsedAprobado | ComprobanteExportacionRechazado;

const ARRAY_TAGS = new Set(['FEXErr', 'FEXEvents', 'Item']);

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

interface RawErr {
  ErrCode?: string;
  ErrMsg?: string;
}

interface RawEvent {
  EventCode?: string;
  EventMsg?: string;
}

interface RawAuthResultAuth {
  Cuit?: string;
  Cbte_Tipo?: string;
  Punto_vta?: string;
  Cbte_nro?: string;
  Fecha_cbte?: string;
  Resultado?: string;
  Motivos_Obs?: string;
  Reproceso?: string;
  Cae?: string;
  Fch_venc_Cae?: string;
}

interface RawAuthResult {
  FEXResultAuth?: RawAuthResultAuth;
  FEXErr?: RawErr[];
  FEXEvents?: RawErr[];
}

/**
 * Parses a `FEXAuthorizeResponse` XML document into a discriminated
 * `ParsedResultadoExportacion`. Business rejections (`Resultado='R'`) DO NOT
 * throw; they return a `ComprobanteExportacionRechazado` so the caller can
 * surface the outcome to the user. Throws {@link WsfexError} only for
 * unparseable XML or structurally malformed responses.
 *
 * The `aprobado` variant intentionally omits `importeTotal`, `moneda`, and
 * `cotizacion` because `FEXAuthorizeResponse` does not echo them. The client
 * stamps those fields from the original request.
 */
export function parseFexAuthorizeResponse(xml: string): ParsedResultadoExportacion {
  const root = parseRoot(xml);
  const result = findResult<RawAuthResult>(root, 'FEXAuthorizeResult');
  if (!result || !result.FEXResultAuth) {
    throw new WsfexError('UNKNOWN', 'WSFEX response did not contain FEXResultAuth.');
  }

  const auth = result.FEXResultAuth;
  const puntoVenta = parseIntOr(auth.Punto_vta, 0);
  const tipoComprobante = parseIntOr(auth.Cbte_Tipo, 19) as TipoComprobanteExportacion;
  const numeroComprobante = parseIntOr(auth.Cbte_nro, 0);
  const errores = mapErrors(result.FEXErr);

  if (auth.Resultado === 'A') {
    const aprobado: ParsedAprobado = {
      status: 'aprobado',
      cae: auth.Cae ?? '',
      fechaVencimientoCae: fromWsfexDate(auth.Fch_venc_Cae ?? ''),
      numeroComprobante,
      tipoComprobante,
      puntoVenta,
      fechaComprobante: fromWsfexDate(auth.Fecha_cbte ?? ''),
    };
    return aprobado;
  }

  const observaciones = mapMotivosObs(auth.Motivos_Obs);
  const rechazado: ComprobanteExportacionRechazado = {
    status: 'rechazado',
    numeroComprobante,
    tipoComprobante,
    puntoVenta,
    errores,
    observaciones,
  };
  return rechazado;
}

interface RawLastResultGet {
  Cbte_Tipo?: string;
  Pto_venta?: string;
  Cbte_nro?: string;
  Fecha_cbte?: string;
}

interface RawLastResult {
  FEXResult_LastCMP?: RawLastResultGet;
  FEXErr?: RawErr[];
}

/**
 * Parses a `FEXGetLast_CMPResponse` XML document into an
 * `UltimoComprobanteExportacion`. Returns `numero=0` when ARCA has no record
 * of any Factura E for the requested PV.
 */
export function parseFexGetLastCmpResponse(xml: string): UltimoComprobanteExportacion {
  const root = parseRoot(xml);
  const result = findResult<RawLastResult>(root, 'FEXGetLast_CMPResult');
  if (!result || !result.FEXResult_LastCMP) {
    throw new WsfexError('UNKNOWN', 'WSFEX response did not contain FEXResult_LastCMP.');
  }
  const r = result.FEXResult_LastCMP;
  return {
    puntoVenta: parseIntOr(r.Pto_venta, 0),
    tipoComprobante: parseIntOr(r.Cbte_Tipo, 19) as TipoComprobanteExportacion,
    numero: parseIntOr(r.Cbte_nro, 0),
  };
}

interface RawItem {
  Pro_codigo?: string;
  Pro_ds?: string;
  Pro_qty?: string;
  Pro_umed?: string;
  Pro_precio_uni?: string;
  Pro_total_item?: string;
}

interface RawGetCmpResultGet {
  Cuit?: string;
  Cbte_Tipo?: string;
  Punto_vta?: string;
  Cbte_nro?: string;
  Fecha_cbte?: string;
  Imp_total?: string;
  Tipo_expo?: string;
  Permiso_existente?: string;
  Dst_cmp?: string;
  Cliente?: string;
  Cuit_pais_cliente?: string;
  Domicilio_cliente?: string;
  Id_impositivo?: string;
  Moneda_Id?: string;
  Moneda_ctz?: string;
  Idioma_cbte?: string;
  Cae?: string;
  Fch_venc_Cae?: string;
  Resultado?: string;
  Items?: { Item?: RawItem[] };
}

interface RawGetCmpResult {
  FEXResultGet?: RawGetCmpResultGet;
  FEXErr?: RawErr[];
  FEXEvents?: RawEvent[];
}

/**
 * Parses a `FEXGetCMPResponse` XML document into a
 * `ComprobanteExportacionConsultado`. Throws {@link WsfexError}('NOT_FOUND')
 * when ARCA reports the comprobante does not exist for the requested key.
 */
export function parseFexGetCmpResponse(xml: string): ComprobanteExportacionConsultado {
  const root = parseRoot(xml);
  const result = findResult<RawGetCmpResult>(root, 'FEXGetCMPResult');
  if (!result) {
    throw new WsfexError('UNKNOWN', 'WSFEX response did not contain FEXGetCMPResult.');
  }
  if (!result.FEXResultGet) {
    const errs = mapErrors(result.FEXErr);
    if (errs.some((e) => isNotFoundMessage(e.message))) {
      throw new WsfexError('NOT_FOUND', errs[0].message);
    }
    throw new WsfexError(
      'UNKNOWN',
      errs.length > 0 ? errs[0].message : 'WSFEX response did not contain FEXResultGet.',
    );
  }

  const r = result.FEXResultGet;
  return {
    numeroComprobante: parseIntOr(r.Cbte_nro, 0),
    tipoComprobante: parseIntOr(r.Cbte_Tipo, 19) as TipoComprobanteExportacion,
    puntoVenta: parseIntOr(r.Punto_vta, 0),
    fechaComprobante: fromWsfexDate(r.Fecha_cbte ?? ''),
    cae: r.Cae ?? '',
    fechaVencimientoCae: fromWsfexDate(r.Fch_venc_Cae ?? ''),
    importeTotal: parseFloatOr(r.Imp_total, 0),
    moneda: (r.Moneda_Id ?? 'DOL') as CodigoMoneda,
    cotizacion: parseFloatOr(r.Moneda_ctz, 0),
    destinoPais: parseIntOr(r.Dst_cmp, 0) as CodigoPais,
    cliente: {
      nombre: r.Cliente ?? '',
      domicilio: r.Domicilio_cliente ?? '',
      idImpositivoExterior: r.Id_impositivo || undefined,
    },
    items: mapItems(r.Items?.Item),
    observaciones: mapEvents(result.FEXEvents),
  };
}

interface RawCtzResultGet {
  Mon_id?: string;
  Mon_ctz?: string;
  Fecha_ctz?: string;
}

interface RawCtzResult {
  FEXResultGet?: RawCtzResultGet;
  FEXErr?: RawErr[];
}

/**
 * Parses a `FEXGetPARAM_CtzResponse` XML document into a `CotizacionMoneda`.
 */
export function parseFexGetParamCtzResponse(xml: string): CotizacionMoneda {
  const root = parseRoot(xml);
  const result = findResult<RawCtzResult>(root, 'FEXGetPARAM_CtzResult');
  if (!result || !result.FEXResultGet) {
    throw new WsfexError('UNKNOWN', 'WSFEX response did not contain FEXGetPARAM_Ctz result.');
  }
  const r = result.FEXResultGet;
  return {
    moneda: (r.Mon_id ?? 'DOL') as CodigoMoneda,
    cotizacion: parseFloatOr(r.Mon_ctz, 0),
    fechaCotizacion: fromWsfexDate(r.Fecha_ctz ?? ''),
  };
}

function parseRoot(xml: string): unknown {
  try {
    return xmlParser.parse(xml);
  } catch (err) {
    throw new WsfexError(
      'UNKNOWN',
      `Could not parse WSFEX response XML: ${(err as Error).message}`,
    );
  }
}

function findResult<T>(node: unknown, key: string): T | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (key in obj) {
    return obj[key] as T;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = findResult<T>(v, key);
      if (found) return found;
    }
  }
  return null;
}

function mapErrors(raw: RawErr[] | undefined): ObservacionWsfex[] {
  if (!raw) return [];
  return raw
    .filter((o) => o && (o.ErrCode !== undefined || o.ErrMsg !== undefined))
    .map((o) => ({ code: parseIntOr(o.ErrCode, 0), message: o.ErrMsg ?? '' }));
}

function mapEvents(raw: RawEvent[] | undefined): ObservacionWsfex[] {
  if (!raw) return [];
  return raw
    .filter((e) => e && (e.EventCode !== undefined || e.EventMsg !== undefined))
    .map((e) => ({ code: parseIntOr(e.EventCode, 0), message: e.EventMsg ?? '' }));
}

function mapMotivosObs(text: string | undefined): ObservacionWsfex[] {
  if (!text || text.trim() === '') return [];
  // ARCA returns "00500: message" style strings — split into code+message
  // when the prefix matches; otherwise treat the whole thing as a message
  // with code 0.
  const match = /^\s*0*(\d+)\s*:\s*(.*)$/s.exec(text);
  if (match) {
    return [{ code: Number.parseInt(match[1], 10), message: match[2].trim() }];
  }
  return [{ code: 0, message: text.trim() }];
}

function mapItems(raw: RawItem[] | undefined): ItemFacturaExportacion[] {
  if (!raw) return [];
  return raw.map((i) => ({
    codigoProducto: i.Pro_codigo ?? '',
    descripcion: i.Pro_ds ?? '',
    cantidad: parseFloatOr(i.Pro_qty, 0),
    unidadMedida: parseIntOr(i.Pro_umed, 0),
    precioUnitario: parseFloatOr(i.Pro_precio_uni, 0),
    importeTotal: parseFloatOr(i.Pro_total_item, 0),
  }));
}

function isNotFoundMessage(msg: string): boolean {
  return /no existe|no autorizado para los par|comprobante.*no existe/i.test(msg);
}

function fromWsfexDate(input: string): string {
  if (!input || !/^\d{8}$/.test(input)) return '';
  return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseFloatOr(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? fallback : n;
}
