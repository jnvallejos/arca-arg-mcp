import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WsaaError } from '../../src/lib/errors.js';
import { callLoginCms, parseTaResponse } from '../../src/wsaa/client.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const validTaXml = readFileSync(join(FIXTURES, 'valid-ta.xml'), 'utf-8');

const loginCmsAsyncMock = vi.fn();
const createClientAsyncMock = vi.fn();

vi.mock('soap', () => ({
  default: {
    createClientAsync: (...args: unknown[]) => createClientAsyncMock(...args),
  },
  createClientAsync: (...args: unknown[]) => createClientAsyncMock(...args),
}));

describe('callLoginCms', () => {
  beforeEach(() => {
    loginCmsAsyncMock.mockReset();
    createClientAsyncMock.mockReset();
    createClientAsyncMock.mockResolvedValue({ loginCmsAsync: loginCmsAsyncMock });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the loginCmsReturn payload from the SOAP response', async () => {
    loginCmsAsyncMock.mockResolvedValue([{ loginCmsReturn: validTaXml }]);
    const result = await callLoginCms('Y20tYmFzZTY0', 'https://wsaa/endpoint');
    expect(result).toContain('<loginTicketResponse');
  });

  it('appends ?wsdl to the endpoint when fetching the WSDL', async () => {
    loginCmsAsyncMock.mockResolvedValue([{ loginCmsReturn: validTaXml }]);
    await callLoginCms('cms', 'https://wsaa/endpoint');
    expect(createClientAsyncMock).toHaveBeenCalledWith('https://wsaa/endpoint?wsdl');
  });

  it('passes the cms payload as the in0 parameter', async () => {
    loginCmsAsyncMock.mockResolvedValue([{ loginCmsReturn: validTaXml }]);
    await callLoginCms('encoded-cms', 'https://wsaa/endpoint');
    expect(loginCmsAsyncMock).toHaveBeenCalledWith({ in0: 'encoded-cms' });
  });

  it('throws WsaaError with code "tokenAlreadyEmitted" on that fault', async () => {
    const fault = makeSoapFault(
      'coe.tokenAlreadyEmitted',
      'El CEE ya posee un TA valido para el acceso al WSN solicitado',
    );
    loginCmsAsyncMock.mockRejectedValue(fault);
    const promise = callLoginCms('cms', 'https://wsaa/endpoint');
    await expect(promise).rejects.toBeInstanceOf(WsaaError);
    await expect(promise).rejects.toMatchObject({ code: 'coe.tokenAlreadyEmitted' });
  });

  it('throws WsaaError with code "alreadyAuthenticated" on that fault', async () => {
    loginCmsAsyncMock.mockRejectedValue(
      makeSoapFault('coe.alreadyAuthenticated', 'CEE already authenticated'),
    );
    await expect(callLoginCms('cms', 'https://wsaa/endpoint')).rejects.toMatchObject({
      code: 'coe.alreadyAuthenticated',
    });
  });

  it('throws WsaaError with code "invalidSignature" on that fault', async () => {
    loginCmsAsyncMock.mockRejectedValue(
      makeSoapFault('coe.invalidSignature', 'Bad signature'),
    );
    await expect(callLoginCms('cms', 'https://wsaa/endpoint')).rejects.toMatchObject({
      code: 'coe.invalidSignature',
    });
  });

  it('uses generic code when fault structure is unrecognized', async () => {
    loginCmsAsyncMock.mockRejectedValue(new Error('boom'));
    const promise = callLoginCms('cms', 'https://wsaa/endpoint');
    await expect(promise).rejects.toBeInstanceOf(WsaaError);
    await expect(promise).rejects.toMatchObject({ code: 'wsaa.unknown' });
  });

  it('throws WsaaError when loginCmsReturn is missing from the SOAP response', async () => {
    loginCmsAsyncMock.mockResolvedValue([{}]);
    await expect(callLoginCms('cms', 'https://wsaa/endpoint')).rejects.toBeInstanceOf(
      WsaaError,
    );
  });
});

describe('parseTaResponse', () => {
  it('parses a valid loginTicketResponse XML into a TA', () => {
    const ta = parseTaResponse(validTaXml, 'wsfe');
    expect(ta.token).toBe('FAKE-TOKEN-FOR-TESTING-NOT-A-REAL-WSAA-TOKEN');
    expect(ta.sign).toBe('FAKE-SIGN-FOR-TESTING-NOT-A-REAL-WSAA-SIGN');
    expect(ta.source).toContain('CN=wsaahomo');
    expect(ta.destination).toContain('CUIT 20000000000');
    expect(ta.service).toBe('wsfe');
    expect(ta.generationTime.getTime()).not.toBeNaN();
    expect(ta.expirationTime.getTime()).not.toBeNaN();
    expect(ta.expirationTime.getTime()).toBeGreaterThan(ta.generationTime.getTime());
  });

  it('throws WsaaError when the XML is missing credentials', () => {
    const incomplete =
      '<?xml version="1.0"?><loginTicketResponse><header><source>x</source>' +
      '<destination>y</destination><uniqueId>1</uniqueId>' +
      '<generationTime>2026-01-01T00:00:00.000-03:00</generationTime>' +
      '<expirationTime>2026-01-01T00:10:00.000-03:00</expirationTime></header>' +
      '</loginTicketResponse>';
    expect(() => parseTaResponse(incomplete, 'wsfe')).toThrow(WsaaError);
  });

  it('throws WsaaError when the XML is malformed', () => {
    expect(() => parseTaResponse('<not valid', 'wsfe')).toThrow(WsaaError);
  });
});

interface FaultShape {
  body?: string;
  response?: { body?: string };
  cause?: { root?: { Envelope?: unknown } };
  message: string;
}

function makeSoapFault(code: string, faultString: string): FaultShape {
  const body = `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>${faultString}</faultstring><detail><exception><name>${code}</name></exception></detail></soapenv:Fault></soapenv:Body></soapenv:Envelope>`;
  return {
    body,
    response: { body },
    message: faultString,
  };
}
