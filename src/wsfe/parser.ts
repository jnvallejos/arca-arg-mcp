import { XMLParser } from 'fast-xml-parser';
import { WsfeError } from '../lib/errors.js';
import type {
  ComprobanteAutorizado,
  ComprobanteConsultado,
  ComprobanteRechazado,
  Concepto,
  CondicionIvaReceptor,
  ObservacionWsfe,
  ResultadoEmision,
  TipoComprobante,
  TipoDocReceptor,
  UltimoComprobante,
} from './types.js';

const ARRAY_TAGS = new Set(['FECAEDetResponse', 'Obs', 'Err']);

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

interface RawObs {
  Code?: string;
  Msg?: string;
}

interface RawDet {
  Concepto?: string;
  DocTipo?: string;
  DocNro?: string;
  CbteDesde?: string;
  CbteHasta?: string;
  CbteFch?: string;
  Resultado?: string;
  CAE?: string;
  CAEFchVto?: string;
  ImpTotal?: string;
  Observaciones?: { Obs?: RawObs[] };
}

interface RawCab {
  Cuit?: string;
  PtoVta?: string;
  CbteTipo?: string;
  Resultado?: string;
}

interface RawFeCaeResult {
  FeCabResp?: RawCab;
  FeDetResp?: { FECAEDetResponse?: RawDet[] };
  Errors?: { Err?: RawObs[] };
}

/**
 * Parses a `FECAESolicitarResponse` XML document into a discriminated
 * `ResultadoEmision`. Business rejections (`Resultado='R'` or `'P'`) DO NOT
 * throw; they return a `ComprobanteRechazado` so the caller can surface the
 * outcome to the user. Throws {@link WsfeError} only for unparseable XML or
 * structurally malformed responses.
 */
export function parseFeCaeResponse(xml: string): ResultadoEmision {
  const root = parseRoot(xml);
  const result = findResult<RawFeCaeResult>(root, 'FECAESolicitarResult');
  if (!result) {
    throw new WsfeError('UNKNOWN', 'WSFE response did not contain FECAESolicitarResult.');
  }

  const det = result.FeDetResp?.FECAEDetResponse?.[0];
  if (!det) {
    throw new WsfeError('UNKNOWN', 'WSFE response did not contain FECAEDetResponse detail.');
  }

  const cab = result.FeCabResp ?? {};
  const puntoVenta = parseIntOr(cab.PtoVta, 0);
  const tipoComprobante = parseIntOr(cab.CbteTipo, 0) as TipoComprobante;
  const numeroComprobante = parseIntOr(det.CbteDesde, 0);
  const observaciones = mapObservaciones(det.Observaciones?.Obs);
  const errores = mapObservaciones(result.Errors?.Err);

  const detResultado = det.Resultado ?? cab.Resultado;
  if (detResultado === 'A') {
    const aprobado: ComprobanteAutorizado = {
      status: 'aprobado',
      cae: det.CAE ?? '',
      fechaVencimientoCae: fromWsfeDate(det.CAEFchVto ?? ''),
      numeroComprobante,
      tipoComprobante,
      puntoVenta,
      fechaComprobante: fromWsfeDate(det.CbteFch ?? ''),
      importeTotal: parseFloatOr(det.ImpTotal, 0),
      observaciones,
    };
    return aprobado;
  }

  const rechazado: ComprobanteRechazado = {
    status: 'rechazado',
    observaciones,
    errores,
    numeroComprobante,
    tipoComprobante,
    puntoVenta,
  };
  return rechazado;
}

interface RawUltimoResult {
  PtoVta?: string;
  CbteTipo?: string;
  CbteNro?: string;
}

/**
 * Parses a `FECompUltimoAutorizadoResponse` XML document into an
 * `UltimoComprobante`. Returns `numero=0` when ARCA has no record of a
 * comprobante for the requested PV+tipo.
 */
export function parseFeCompUltimoAutorizadoResponse(xml: string): UltimoComprobante {
  const root = parseRoot(xml);
  const result = findResult<RawUltimoResult>(root, 'FECompUltimoAutorizadoResult');
  if (!result) {
    throw new WsfeError('UNKNOWN', 'WSFE response did not contain FECompUltimoAutorizadoResult.');
  }
  return {
    puntoVenta: parseIntOr(result.PtoVta, 0),
    tipoComprobante: parseIntOr(result.CbteTipo, 0) as TipoComprobante,
    numero: parseIntOr(result.CbteNro, 0),
  };
}

interface RawConsultarResult {
  ResultGet?: {
    Concepto?: string;
    DocTipo?: string;
    DocNro?: string;
    CbteDesde?: string;
    CbteFch?: string;
    ImpTotal?: string;
    ImpNeto?: string;
    CodAutorizacion?: string;
    FchVto?: string;
    PtoVta?: string;
    CbteTipo?: string;
    CondicionIVAReceptorId?: string;
    Observaciones?: { Obs?: RawObs[] };
  };
  Errors?: { Err?: RawObs[] };
}

/**
 * Parses a `FECompConsultarResponse` XML document into a
 * `ComprobanteConsultado`. Throws {@link WsfeError}('NOT_FOUND') when ARCA
 * reports the comprobante does not exist for the requested key.
 */
export function parseFeCompConsultarResponse(xml: string): ComprobanteConsultado {
  const root = parseRoot(xml);
  const result = findResult<RawConsultarResult>(root, 'FECompConsultarResult');
  if (!result) {
    throw new WsfeError('UNKNOWN', 'WSFE response did not contain FECompConsultarResult.');
  }

  if (!result.ResultGet) {
    const errs = mapObservaciones(result.Errors?.Err);
    if (errs.some((e) => isNotFoundMessage(e.message))) {
      throw new WsfeError('NOT_FOUND', errs[0].message);
    }
    throw new WsfeError(
      'UNKNOWN',
      errs.length > 0 ? errs[0].message : 'WSFE response did not contain ResultGet.',
    );
  }

  const r = result.ResultGet;
  const condicionRaw = r.CondicionIVAReceptorId;
  const condicionParsed =
    condicionRaw === undefined || condicionRaw === ''
      ? Number.NaN
      : Number.parseInt(condicionRaw, 10);
  const condicionIvaReceptor = Number.isNaN(condicionParsed)
    ? undefined
    : (condicionParsed as CondicionIvaReceptor);

  return {
    numeroComprobante: parseIntOr(r.CbteDesde, 0),
    tipoComprobante: parseIntOr(r.CbteTipo, 0) as TipoComprobante,
    puntoVenta: parseIntOr(r.PtoVta, 0),
    fechaComprobante: fromWsfeDate(r.CbteFch ?? ''),
    cae: r.CodAutorizacion ?? '',
    fechaVencimientoCae: fromWsfeDate(r.FchVto ?? ''),
    importeTotal: parseFloatOr(r.ImpTotal, 0),
    importeNeto: parseFloatOr(r.ImpNeto, 0),
    concepto: parseIntOr(r.Concepto, 1) as Concepto,
    tipoDocReceptor: parseIntOr(r.DocTipo, 99) as TipoDocReceptor,
    numeroDocReceptor: r.DocNro ?? '0',
    condicionIvaReceptor,
    observaciones: mapObservaciones(r.Observaciones?.Obs),
  };
}

function parseRoot(xml: string): unknown {
  try {
    return xmlParser.parse(xml);
  } catch (err) {
    throw new WsfeError('UNKNOWN', `Could not parse WSFE response XML: ${(err as Error).message}`);
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

function mapObservaciones(raw: RawObs[] | undefined): ObservacionWsfe[] {
  if (!raw) return [];
  return raw
    .filter((o) => o && (o.Code !== undefined || o.Msg !== undefined))
    .map((o) => ({ code: parseIntOr(o.Code, 0), message: o.Msg ?? '' }));
}

function isNotFoundMessage(msg: string): boolean {
  return /no existe|no autorizado para los par|comprobante.*no existe/i.test(msg);
}

function fromWsfeDate(input: string): string {
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
