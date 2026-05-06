import * as soap from 'soap';
import type { ArcaConfig, ArcaEnv } from '../config/types.js';
import { WsfexError } from '../lib/errors.js';
import { getValidToken } from '../wsaa/auth.js';
import {
  type ParsedResultadoExportacion,
  parseFexAuthorizeResponse,
  parseFexGetCmpResponse,
  parseFexGetLastCmpResponse,
  parseFexGetParamCtzResponse,
} from './parser.js';
import type {
  CodigoMoneda,
  ComprobanteExportacionConsultado,
  CotizacionMoneda,
  FexAuthorizeRequest,
  ResultadoEmisionExportacion,
  UltimoComprobanteExportacion,
} from './types.js';

const WSFEX_ENDPOINTS: Record<ArcaEnv, string> = {
  homologation: 'https://wswhomo.afip.gov.ar/wsfexv1/service.asmx',
  production: 'https://servicios1.afip.gov.ar/wsfexv1/service.asmx',
};

const WSFEX_SERVICE = 'wsfex' as const;
const FACTURA_E_TIPO = 19;

interface SoapErrorLike {
  message?: string;
  body?: string;
  response?: { body?: string; statusCode?: number };
  code?: string;
}

interface WsfexSoapClient {
  FEXAuthorizeAsync: (args: unknown) => Promise<unknown>;
  FEXGetLast_CMPAsync: (args: unknown) => Promise<unknown>;
  FEXGetCMPAsync: (args: unknown) => Promise<unknown>;
  FEXGetPARAM_CtzAsync: (args: unknown) => Promise<unknown>;
}

/**
 * Calls `FEXAuthorize` to authorize a single Factura E. Business rejections
 * (`Resultado='R'`) DO NOT throw; they are surfaced as a
 * `ComprobanteExportacionRechazado` discriminated-union variant. Throwing is
 * reserved for genuine errors (network, auth, malformed response).
 *
 * Same stamping pattern as WSFE's Phase 3 fix-up: the FEXAuthorize response
 * does not echo `importeTotal`, `moneda`, `cotizacion`, `cliente`, or
 * `destinoPais`, so the client reads them from the original request and
 * stamps them onto the aprobado result.
 */
export async function fexAuthorize(
  request: FexAuthorizeRequest,
  config: ArcaConfig,
): Promise<ResultadoEmisionExportacion> {
  const ta = await getValidToken(config, WSFEX_SERVICE);
  const client = await loadClient(config);

  const raw = await invokeSoap(
    () =>
      client.FEXAuthorizeAsync({
        Auth: { Token: ta.token, Sign: ta.sign, Cuit: config.cuit },
        Cmp: request.Cmp,
      }),
    'FEXAuthorize',
  );

  const xml = extractRawResponse(raw);
  const parsed = safeParse(() => parseFexAuthorizeResponse(xml), 'parse FEXAuthorize response');
  return withRequestData(parsed, request);
}

function withRequestData(
  parsed: ParsedResultadoExportacion,
  request: FexAuthorizeRequest,
): ResultadoEmisionExportacion {
  if (parsed.status === 'aprobado') {
    return {
      ...parsed,
      importeTotal: request.Cmp.Imp_total,
      moneda: request.Cmp.Moneda_Id as CodigoMoneda,
      cotizacion: request.Cmp.Moneda_ctz,
      cliente: {
        nombre: request.Cmp.Cliente,
        domicilio: request.Cmp.Domicilio_cliente,
        idImpositivoExterior: request.Cmp.Id_impositivo,
      },
      destinoPais: request.Cmp.Dst_cmp,
    };
  }
  return parsed;
}

/**
 * Calls `FEXGetLast_CMP` and returns the last authorized number for the
 * requested punto de venta (Factura E only). Returns `numero=0` when no
 * Factura E has been issued yet for that PV.
 */
export async function fexGetLastCmp(
  puntoVenta: number,
  config: ArcaConfig,
): Promise<UltimoComprobanteExportacion> {
  const ta = await getValidToken(config, WSFEX_SERVICE);
  const client = await loadClient(config);

  const raw = await invokeSoap(
    () =>
      client.FEXGetLast_CMPAsync({
        Auth: {
          Token: ta.token,
          Sign: ta.sign,
          Cuit: config.cuit,
          Pto_venta: puntoVenta,
          Cbte_Tipo: FACTURA_E_TIPO,
        },
      }),
    'FEXGetLast_CMP',
  );

  const xml = extractRawResponse(raw);
  return safeParse(() => parseFexGetLastCmpResponse(xml), 'parse FEXGetLast_CMP response');
}

/**
 * Calls `FEXGetCMP` and returns the full detail of a previously authorized
 * Factura E. Throws {@link WsfexError}('NOT_FOUND') when ARCA reports the
 * comprobante does not exist.
 */
export async function fexGetCmp(
  puntoVenta: number,
  numeroComprobante: number,
  config: ArcaConfig,
): Promise<ComprobanteExportacionConsultado> {
  const ta = await getValidToken(config, WSFEX_SERVICE);
  const client = await loadClient(config);

  const raw = await invokeSoap(
    () =>
      client.FEXGetCMPAsync({
        Auth: { Token: ta.token, Sign: ta.sign, Cuit: config.cuit },
        Cmp: {
          Cbte_tipo: FACTURA_E_TIPO,
          Punto_vta: puntoVenta,
          Cbte_nro: numeroComprobante,
        },
      }),
    'FEXGetCMP',
  );

  const xml = extractRawResponse(raw);
  return safeParse(() => parseFexGetCmpResponse(xml), 'parse FEXGetCMP response');
}

/**
 * Calls `FEXGetPARAM_Ctz` and returns the cotización ARCA published for the
 * given currency on the current day.
 */
export async function fexGetParamCtz(
  monedaId: CodigoMoneda,
  config: ArcaConfig,
): Promise<CotizacionMoneda> {
  const ta = await getValidToken(config, WSFEX_SERVICE);
  const client = await loadClient(config);

  const raw = await invokeSoap(
    () =>
      client.FEXGetPARAM_CtzAsync({
        Auth: { Token: ta.token, Sign: ta.sign, Cuit: config.cuit },
        Mon_id: monedaId,
      }),
    'FEXGetPARAM_Ctz',
  );

  const xml = extractRawResponse(raw);
  return safeParse(() => parseFexGetParamCtzResponse(xml), 'parse FEXGetPARAM_Ctz response');
}

async function loadClient(config: ArcaConfig): Promise<WsfexSoapClient> {
  const wsdlUrl = `${WSFEX_ENDPOINTS[config.env]}?WSDL`;
  try {
    return (await soap.createClientAsync(wsdlUrl)) as unknown as WsfexSoapClient;
  } catch (err) {
    throw new WsfexError(
      'SERVICE_UNAVAILABLE',
      `Could not load WSFEX WSDL at ${wsdlUrl}: ${(err as Error).message}`,
    );
  }
}

async function invokeSoap(call: () => Promise<unknown>, op: string): Promise<unknown> {
  try {
    return await call();
  } catch (err) {
    throw mapSoapError(err as SoapErrorLike, op);
  }
}

function safeParse<T>(parse: () => T, context: string): T {
  try {
    return parse();
  } catch (err) {
    if (err instanceof WsfexError) throw err;
    throw new WsfexError('UNKNOWN', `Could not ${context}: ${(err as Error).message}`);
  }
}

function extractRawResponse(raw: unknown): string {
  if (Array.isArray(raw) && raw.length >= 2 && typeof raw[1] === 'string') {
    return raw[1];
  }
  throw new WsfexError('UNKNOWN', 'WSFEX response did not contain a raw XML payload.');
}

function mapSoapError(err: SoapErrorLike, op: string): WsfexError {
  const body = err.body ?? err.response?.body ?? '';
  const message = err.message ?? '';
  const haystack = `${body}\n${message}`;

  if (isAuthFault(haystack)) {
    return new WsfexError(
      'AUTH_FAILED',
      `WSFEX rejected the WSAA token on ${op}: ${message || 'authentication failure'}`,
    );
  }
  if (isServiceUnavailable(err, haystack)) {
    return new WsfexError(
      'SERVICE_UNAVAILABLE',
      `WSFEX service is unreachable on ${op}: ${message || 'no response'}`,
    );
  }
  if (body) {
    return new WsfexError(
      'UNKNOWN',
      `WSFEX returned an unrecognized SOAP fault on ${op}: ${message || 'no message'}`,
    );
  }
  return new WsfexError('UNKNOWN', `WSFEX call ${op} failed: ${message || 'no message'}`);
}

function isAuthFault(haystack: string): boolean {
  return /token\b.*invalid|invalid.*token|sign\b.*invalid|invalid.*sign|unauthor|no autoriz|coe\.expir|token.*venc/i.test(
    haystack,
  );
}

function isServiceUnavailable(err: SoapErrorLike, haystack: string): boolean {
  const status = err.response?.statusCode ?? 0;
  if (status >= 500 && status < 600) return true;
  return /econnrefused|econnreset|enotfound|etimedout|socket hang up|service unavailable/i.test(
    haystack,
  );
}
