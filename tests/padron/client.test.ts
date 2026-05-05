import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { PadronError } from '../../src/lib/errors.js';
import type { TA } from '../../src/wsaa/types.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const fisicaXml = readFileSync(join(FIXTURES, 'padron-persona-fisica-monotributo.xml'), 'utf-8');
const notFoundXml = readFileSync(join(FIXTURES, 'padron-cuit-not-found.xml'), 'utf-8');

const getPersonaAsyncMock = vi.fn();
const createClientAsyncMock = vi.fn();
const getValidTokenMock = vi.fn();

vi.mock('soap', () => ({
  default: {
    createClientAsync: (...args: unknown[]) => createClientAsyncMock(...args),
  },
  createClientAsync: (...args: unknown[]) => createClientAsyncMock(...args),
}));

vi.mock('../../src/wsaa/auth.js', () => ({
  getValidToken: (...args: unknown[]) => getValidTokenMock(...args),
}));

const FAKE_TA: TA = {
  token: 'fake-token',
  sign: 'fake-sign',
  generationTime: new Date('2026-05-05T12:00:00.000Z'),
  expirationTime: new Date('2026-05-06T00:00:00.000Z'),
  source: 'CN=wsaahomo',
  destination: 'CN=test',
  service: 'ws_sr_padron_a13',
};

function makeConfig(overrides: Partial<ArcaConfig> = {}): ArcaConfig {
  return {
    env: 'homologation',
    cuit: '20239312345',
    certPath: '/tmp/cert.pem',
    keyPath: '/tmp/private.key',
    cacheDir: '/tmp/cache',
    ...overrides,
  };
}

interface FaultLike {
  message: string;
  body?: string;
  response?: { body?: string; statusCode?: number };
}

function makeFault(faultBody: string, message = 'soap fault'): FaultLike {
  return { message, body: faultBody, response: { body: faultBody } };
}

describe('getPersona', () => {
  beforeEach(() => {
    getPersonaAsyncMock.mockReset();
    createClientAsyncMock.mockReset();
    getValidTokenMock.mockReset();
    getValidTokenMock.mockResolvedValue(FAKE_TA);
    createClientAsyncMock.mockResolvedValue({ getPersonaAsync: getPersonaAsyncMock });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes the correct service name to getValidToken', async () => {
    getPersonaAsyncMock.mockResolvedValue([{}, fisicaXml]);
    const { getPersona } = await import('../../src/padron/client.js');
    await getPersona('20111111112', makeConfig());
    expect(getValidTokenMock).toHaveBeenCalledWith(expect.anything(), 'ws_sr_padron_a13');
  });

  it('builds the SOAP request with token, sign, cuitRepresentada and idPersona', async () => {
    getPersonaAsyncMock.mockResolvedValue([{}, fisicaXml]);
    const { getPersona } = await import('../../src/padron/client.js');
    await getPersona('20111111112', makeConfig({ cuit: '20239312345' }));
    expect(getPersonaAsyncMock).toHaveBeenCalledTimes(1);
    const args = getPersonaAsyncMock.mock.calls[0][0];
    expect(args.token).toBe('fake-token');
    expect(args.sign).toBe('fake-sign');
    expect(String(args.cuitRepresentada)).toBe('20239312345');
    expect(String(args.idPersona)).toBe('20111111112');
  });

  it('uses the homologation Padrón endpoint when env is homologation', async () => {
    getPersonaAsyncMock.mockResolvedValue([{}, fisicaXml]);
    const { getPersona } = await import('../../src/padron/client.js');
    await getPersona('20111111112', makeConfig({ env: 'homologation' }));
    const wsdl = createClientAsyncMock.mock.calls[0][0] as string;
    expect(wsdl).toContain('awshomo.afip.gov.ar');
    expect(wsdl).toContain('personaServiceA13');
  });

  it('uses the production Padrón endpoint when env is production', async () => {
    getPersonaAsyncMock.mockResolvedValue([{}, fisicaXml]);
    const { getPersona } = await import('../../src/padron/client.js');
    await getPersona('20111111112', makeConfig({ env: 'production' }));
    const wsdl = createClientAsyncMock.mock.calls[0][0] as string;
    expect(wsdl).toContain('aws.afip.gov.ar');
    expect(wsdl).not.toContain('awshomo');
  });

  it('parses the raw SOAP response into a PersonaPadron', async () => {
    getPersonaAsyncMock.mockResolvedValue([{}, fisicaXml]);
    const { getPersona } = await import('../../src/padron/client.js');
    const persona = await getPersona('20111111112', makeConfig());
    expect(persona.tipoPersona).toBe('FISICA');
    expect(persona.cuit).toBe('20111111112');
  });

  it('throws PadronError with code NOT_FOUND on "No existe persona" fault', async () => {
    getPersonaAsyncMock.mockRejectedValue(makeFault(notFoundXml, 'No existe persona con ese Id'));
    const { getPersona } = await import('../../src/padron/client.js');
    const promise = getPersona('20999999990', makeConfig());
    await expect(promise).rejects.toBeInstanceOf(PadronError);
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws PadronError with code AUTH_FAILED on token-related faults', async () => {
    const fault = makeFault(
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
        '<soap:Body><soap:Fault><faultstring>Token invalido</faultstring></soap:Fault>' +
        '</soap:Body></soap:Envelope>',
      'Token invalido',
    );
    getPersonaAsyncMock.mockRejectedValue(fault);
    const { getPersona } = await import('../../src/padron/client.js');
    await expect(getPersona('20111111112', makeConfig())).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('throws PadronError with code SERVICE_UNAVAILABLE on HTTP 500-style errors', async () => {
    getPersonaAsyncMock.mockRejectedValue({
      message: 'connect ECONNREFUSED',
      response: { statusCode: 500 },
    });
    const { getPersona } = await import('../../src/padron/client.js');
    await expect(getPersona('20111111112', makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('throws PadronError with code SERVICE_UNAVAILABLE when network errors raise without HTTP details', async () => {
    getPersonaAsyncMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND awshomo.afip.gov.ar'));
    const { getPersona } = await import('../../src/padron/client.js');
    await expect(getPersona('20111111112', makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('throws PadronError with code UNKNOWN on unrecognized faults', async () => {
    getPersonaAsyncMock.mockRejectedValue(
      makeFault(
        '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
          '<soap:Body><soap:Fault><faultstring>Algun error raro</faultstring></soap:Fault>' +
          '</soap:Body></soap:Envelope>',
        'Algun error raro',
      ),
    );
    const { getPersona } = await import('../../src/padron/client.js');
    await expect(getPersona('20111111112', makeConfig())).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('throws PadronError with code SERVICE_UNAVAILABLE when WSDL cannot be loaded', async () => {
    createClientAsyncMock.mockReset();
    createClientAsyncMock.mockRejectedValue(new Error('ETIMEDOUT'));
    const { getPersona } = await import('../../src/padron/client.js');
    await expect(getPersona('20111111112', makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('throws PadronError with code UNKNOWN when the raw XML response is unparseable', async () => {
    getPersonaAsyncMock.mockResolvedValue([{}, '<not valid']);
    const { getPersona } = await import('../../src/padron/client.js');
    await expect(getPersona('20111111112', makeConfig())).rejects.toBeInstanceOf(PadronError);
  });
});
