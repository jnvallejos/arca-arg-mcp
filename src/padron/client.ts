import * as soap from 'soap';
import type { ArcaConfig, ArcaEnv } from '../config/types.js';
import { PadronError } from '../lib/errors.js';
import { getValidToken } from '../wsaa/auth.js';
import { parsePadronResponse } from './parser.js';
import type { PersonaPadron } from './types.js';

const PADRON_ENDPOINTS: Record<ArcaEnv, string> = {
  homologation: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
  production: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
};

const PADRON_SERVICE = 'ws_sr_padron_a13' as const;

interface SoapErrorLike {
  message?: string;
  body?: string;
  response?: { body?: string; statusCode?: number };
  code?: string;
}

/**
 * Looks up a CUIT in the Padrón A13 web service and returns its tax data as a
 * strongly-typed {@link PersonaPadron}.
 *
 * Authentication uses the WSAA layer (token cached on disk per service). On
 * failure the error is mapped to a {@link PadronError} with a discriminated
 * `code` so callers can branch without parsing message text.
 */
export async function getPersona(
  cuitToQuery: string,
  config: ArcaConfig,
): Promise<PersonaPadron> {
  const ta = await getValidToken(config, PADRON_SERVICE);

  const wsdlUrl = `${PADRON_ENDPOINTS[config.env]}?wsdl`;
  let client: soap.Client;
  try {
    client = await soap.createClientAsync(wsdlUrl);
  } catch (err) {
    throw new PadronError(
      'SERVICE_UNAVAILABLE',
      `Could not load Padrón WSDL at ${wsdlUrl}: ${(err as Error).message}`,
    );
  }

  let raw: unknown;
  try {
    const fn = (client as unknown as {
      getPersonaAsync: (args: unknown) => Promise<unknown>;
    }).getPersonaAsync;
    raw = await fn({
      token: ta.token,
      sign: ta.sign,
      cuitRepresentada: config.cuit,
      idPersona: cuitToQuery,
    });
  } catch (err) {
    throw mapErrorToPadronError(err as SoapErrorLike);
  }

  const rawResponse = extractRawResponse(raw);
  if (!rawResponse) {
    throw new PadronError('UNKNOWN', 'Padrón response did not contain a raw XML payload.');
  }

  try {
    return parsePadronResponse(rawResponse);
  } catch (err) {
    if (err instanceof PadronError) throw err;
    throw new PadronError(
      'UNKNOWN',
      `Could not parse Padrón response: ${(err as Error).message}`,
    );
  }
}

function extractRawResponse(raw: unknown): string | null {
  if (Array.isArray(raw) && raw.length >= 2 && typeof raw[1] === 'string') {
    return raw[1];
  }
  return null;
}

function mapErrorToPadronError(err: SoapErrorLike): PadronError {
  const body = err.body ?? err.response?.body ?? '';
  const message = err.message ?? '';
  const haystack = `${body}\n${message}`;

  if (/no existe persona/i.test(haystack)) {
    return new PadronError('NOT_FOUND', 'No persona registered with that CUIT in ARCA Padrón.');
  }
  if (isAuthFault(haystack)) {
    return new PadronError(
      'AUTH_FAILED',
      `Padrón rejected the WSAA token: ${message || 'authentication failure'}`,
    );
  }
  if (isServiceUnavailable(err, haystack)) {
    return new PadronError(
      'SERVICE_UNAVAILABLE',
      `Padrón service is unreachable: ${message || 'no response'}`,
    );
  }
  if (body) {
    return new PadronError(
      'UNKNOWN',
      `Padrón returned an unrecognized SOAP fault: ${message || 'no message'}`,
    );
  }
  return new PadronError('UNKNOWN', `Padrón call failed: ${message || 'no message'}`);
}

function isAuthFault(haystack: string): boolean {
  return /token\b.*invalid|invalid.*token|sign\b.*invalid|invalid.*sign|unauthor|no autoriz|coe\.expir/i.test(
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
