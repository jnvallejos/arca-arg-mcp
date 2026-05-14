import * as soap from 'soap';
import type { ArcaConfig, ArcaEnv } from '../config/types.js';
import { WsfeError } from '../lib/errors.js';
import { getValidToken } from '../wsaa/auth.js';
import {
  type ParsedResultado,
  parseFeCaeResponse,
  parseFeCompConsultarResponse,
  parseFeCompUltimoAutorizadoResponse,
} from './parser.js';
import type {
  ComprobanteConsultado,
  FeCaeRequest,
  ResultadoEmision,
  TipoComprobante,
  UltimoComprobante,
} from './types.js';

const WSFE_ENDPOINTS: Record<ArcaEnv, string> = {
  homologation: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  production: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

const WSFE_SERVICE = 'wsfe' as const;

interface SoapErrorLike {
  message?: string;
  body?: string;
  response?: { body?: string; statusCode?: number };
  code?: string;
}

interface WsfeSoapClient {
  FECAESolicitarAsync: (args: unknown) => Promise<unknown>;
  FECompUltimoAutorizadoAsync: (args: unknown) => Promise<unknown>;
  FECompConsultarAsync: (args: unknown) => Promise<unknown>;
}

/**
 * Calls `FECAESolicitar` to authorize a single comprobante. Business
 * rejections (`Resultado='R'` or `'P'`) DO NOT throw; they are surfaced as a
 * `ComprobanteRechazado` discriminated-union variant. Throwing is reserved
 * for genuine errors (network, auth, malformed response).
 */
export async function feCaeSolicitar(
  request: FeCaeRequest,
  config: ArcaConfig,
): Promise<ResultadoEmision> {
  const ta = await getValidToken(config, WSFE_SERVICE);
  const client = await loadClient(config);

  const raw = await invokeSoap(
    () =>
      client.FECAESolicitarAsync({
        Auth: { Token: ta.token, Sign: ta.sign, Cuit: config.cuit },
        FeCAEReq: request,
      }),
    'FECAESolicitar',
  );

  const xml = extractRawResponse(raw);
  const parsed = safeParse(() => parseFeCaeResponse(xml), 'parse FECAESolicitar response');
  return withImporte(parsed, request);
}

function withImporte(parsed: ParsedResultado, request: FeCaeRequest): ResultadoEmision {
  if (parsed.status === 'aprobado') {
    return {
      ...parsed,
      importeTotal: request.FeDetReq.FECAEDetRequest[0].ImpTotal,
    };
  }
  return parsed;
}

/**
 * Calls `FECompUltimoAutorizado` and returns the last authorized number for
 * the requested PV+tipo. Returns `numero=0` when no comprobante has been
 * issued yet (per ARCA convention).
 */
export async function feCompUltimoAutorizado(
  puntoVenta: number,
  tipoComprobante: TipoComprobante,
  config: ArcaConfig,
): Promise<UltimoComprobante> {
  const ta = await getValidToken(config, WSFE_SERVICE);
  const client = await loadClient(config);

  const raw = await invokeSoap(
    () =>
      client.FECompUltimoAutorizadoAsync({
        Auth: { Token: ta.token, Sign: ta.sign, Cuit: config.cuit },
        PtoVta: puntoVenta,
        CbteTipo: tipoComprobante,
      }),
    'FECompUltimoAutorizado',
  );

  const xml = extractRawResponse(raw);
  return safeParse(
    () => parseFeCompUltimoAutorizadoResponse(xml),
    'parse FECompUltimoAutorizado response',
  );
}

/**
 * Calls `FECompConsultar` and returns the full detail of a previously
 * authorized comprobante. Throws {@link WsfeError}('NOT_FOUND') when ARCA
 * reports the comprobante does not exist.
 */
export async function feCompConsultar(
  puntoVenta: number,
  tipoComprobante: TipoComprobante,
  numeroComprobante: number,
  config: ArcaConfig,
): Promise<ComprobanteConsultado> {
  const ta = await getValidToken(config, WSFE_SERVICE);
  const client = await loadClient(config);

  const raw = await invokeSoap(
    () =>
      client.FECompConsultarAsync({
        Auth: { Token: ta.token, Sign: ta.sign, Cuit: config.cuit },
        FeCompConsReq: {
          PtoVta: puntoVenta,
          CbteTipo: tipoComprobante,
          CbteNro: numeroComprobante,
        },
      }),
    'FECompConsultar',
  );

  const xml = extractRawResponse(raw);
  return safeParse(() => parseFeCompConsultarResponse(xml), 'parse FECompConsultar response');
}

async function loadClient(config: ArcaConfig): Promise<WsfeSoapClient> {
  const wsdlUrl = `${WSFE_ENDPOINTS[config.env]}?WSDL`;
  try {
    return (await soap.createClientAsync(wsdlUrl)) as unknown as WsfeSoapClient;
  } catch (err) {
    throw new WsfeError(
      'SERVICE_UNAVAILABLE',
      `No se pudo cargar el WSDL de WSFE en ${wsdlUrl}: ${(err as Error).message}`,
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
    if (err instanceof WsfeError) throw err;
    throw new WsfeError('UNKNOWN', `Could not ${context}: ${(err as Error).message}`);
  }
}

function extractRawResponse(raw: unknown): string {
  if (Array.isArray(raw) && raw.length >= 2 && typeof raw[1] === 'string') {
    return raw[1];
  }
  throw new WsfeError('UNKNOWN', 'WSFE response did not contain a raw XML payload.');
}

function mapSoapError(err: SoapErrorLike, op: string): WsfeError {
  const body = err.body ?? err.response?.body ?? '';
  const message = err.message ?? '';
  const haystack = `${body}\n${message}`;

  if (isAuthFault(haystack)) {
    return new WsfeError(
      'AUTH_FAILED',
      `WSFE rechazó el token de WSAA en ${op}: ${message || 'falla de autenticación'}`,
    );
  }
  if (isServiceUnavailable(err, haystack)) {
    return new WsfeError(
      'SERVICE_UNAVAILABLE',
      `El servicio de WSFE no está disponible en ${op}: ${message || 'sin respuesta'}`,
    );
  }
  if (body) {
    return new WsfeError(
      'UNKNOWN',
      `WSFE devolvió una falla SOAP no reconocida en ${op}: ${message || 'sin mensaje'}`,
    );
  }
  return new WsfeError('UNKNOWN', `La llamada a WSFE ${op} falló: ${message || 'sin mensaje'}`);
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
