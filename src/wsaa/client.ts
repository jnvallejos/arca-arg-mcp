import { XMLParser } from 'fast-xml-parser';
import * as soap from 'soap';
import { WsaaError } from '../lib/errors.js';
import type { ServiceName, TA } from './types.js';

interface LoginCmsResult {
  loginCmsReturn?: string;
}

interface SoapFaultLike {
  body?: string;
  response?: { body?: string };
  cause?: { root?: { Envelope?: { Body?: { Fault?: unknown } } } };
  message?: string;
}

const KNOWN_FAULT_CODES = [
  'coe.tokenAlreadyEmitted',
  'coe.alreadyAuthenticated',
  'coe.invalidSignature',
  'coe.expirationTimeBeforeGenerationTime',
  'cms.bad',
];

/**
 * Calls WSAA's `loginCms` SOAP method and returns the raw `loginCmsReturn`
 * payload (a string containing the TA XML). Faults are mapped to {@link WsaaError}.
 */
export async function callLoginCms(cmsBase64: string, endpoint: string): Promise<string> {
  const wsdlUrl = endpoint.endsWith('?wsdl') ? endpoint : `${endpoint}?wsdl`;

  let client: soap.Client;
  try {
    client = await soap.createClientAsync(wsdlUrl);
  } catch (err) {
    throw new WsaaError(
      'wsaa.wsdlUnavailable',
      `Could not load WSAA WSDL at ${wsdlUrl}: ${(err as Error).message}`,
    );
  }

  let raw: [LoginCmsResult, ...unknown[]];
  try {
    const fn = (client as unknown as { loginCmsAsync: (args: unknown) => Promise<unknown> })
      .loginCmsAsync;
    raw = (await fn({ in0: cmsBase64 })) as [LoginCmsResult, ...unknown[]];
  } catch (err) {
    throw mapSoapFaultToWsaaError(err as SoapFaultLike);
  }

  const result = Array.isArray(raw) ? raw[0] : (raw as LoginCmsResult);
  if (!result || typeof result.loginCmsReturn !== 'string') {
    throw new WsaaError(
      'wsaa.invalidResponse',
      'WSAA response did not contain a loginCmsReturn payload.',
    );
  }
  return result.loginCmsReturn;
}

/**
 * Parses the inner `loginTicketResponse` XML returned by WSAA into a structured TA.
 * The `service` argument is attached for cache keying since WSAA does not echo it.
 */
export function parseTaResponse(xml: string, service: ServiceName): TA {
  let parsed: Record<string, unknown>;
  try {
    parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml);
  } catch (err) {
    throw new WsaaError(
      'wsaa.malformedResponse',
      `Could not parse WSAA response XML: ${(err as Error).message}`,
    );
  }

  const response = (parsed.loginTicketResponse ?? {}) as {
    header?: {
      source?: string;
      destination?: string;
      generationTime?: string;
      expirationTime?: string;
    };
    credentials?: { token?: string; sign?: string };
  };

  const credentials = response.credentials;
  const header = response.header;
  if (
    !credentials?.token ||
    !credentials.sign ||
    !header?.generationTime ||
    !header.expirationTime
  ) {
    throw new WsaaError(
      'wsaa.malformedResponse',
      'WSAA response is missing required token, sign, or timestamp fields.',
    );
  }

  return {
    token: credentials.token,
    sign: credentials.sign,
    source: header.source ?? '',
    destination: header.destination ?? '',
    generationTime: new Date(header.generationTime),
    expirationTime: new Date(header.expirationTime),
    service,
  };
}

function mapSoapFaultToWsaaError(err: SoapFaultLike): WsaaError {
  const faultBody = err.body ?? err.response?.body;
  if (faultBody) {
    for (const code of KNOWN_FAULT_CODES) {
      if (faultBody.includes(code)) {
        return new WsaaError(code, err.message ?? code);
      }
    }
    return new WsaaError(
      'wsaa.fault',
      err.message ?? 'WSAA returned a SOAP fault with an unrecognized code.',
    );
  }
  return new WsaaError('wsaa.unknown', err.message ?? 'WSAA call failed.');
}
