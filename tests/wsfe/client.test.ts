import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfeError } from '../../src/lib/errors.js';
import type { TA } from '../../src/wsaa/types.js';
import type { FeCaeRequest } from '../../src/wsfe/types.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const successXml = readFileSync(join(FIXTURES, 'wsfe-fecae-success.xml'), 'utf-8');
const rejectedXml = readFileSync(join(FIXTURES, 'wsfe-fecae-rejected.xml'), 'utf-8');
const ultimoXml = readFileSync(join(FIXTURES, 'wsfe-fecomp-ultimo-autorizado.xml'), 'utf-8');
const consultarFoundXml = readFileSync(join(FIXTURES, 'wsfe-fecomp-consultar-found.xml'), 'utf-8');
const consultarNotFoundXml = readFileSync(
  join(FIXTURES, 'wsfe-fecomp-consultar-not-found.xml'),
  'utf-8',
);

const fecaeSolicitarMock = vi.fn();
const fecompUltimoAutorizadoMock = vi.fn();
const fecompConsultarMock = vi.fn();
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
  generationTime: new Date('2026-04-15T12:00:00.000Z'),
  expirationTime: new Date('2026-04-16T00:00:00.000Z'),
  source: 'CN=wsaahomo',
  destination: 'CN=test',
  service: 'wsfe',
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

function makeRequest(): FeCaeRequest {
  return {
    FeCabReq: { CantReg: 1, PtoVta: 1, CbteTipo: 6 },
    FeDetReq: {
      FECAEDetRequest: [
        {
          Concepto: 1,
          DocTipo: 99,
          DocNro: 0,
          CbteDesde: 12345,
          CbteHasta: 12345,
          CbteFch: '20260415',
          ImpTotal: 121,
          ImpTotConc: 0,
          ImpNeto: 100,
          ImpOpEx: 0,
          ImpIVA: 21,
          ImpTrib: 0,
          MonId: 'PES',
          MonCotiz: 1,
          Iva: { AlicIva: [{ Id: 5, BaseImp: 100, Importe: 21 }] },
        },
      ],
    },
  };
}

beforeEach(() => {
  fecaeSolicitarMock.mockReset();
  fecompUltimoAutorizadoMock.mockReset();
  fecompConsultarMock.mockReset();
  createClientAsyncMock.mockReset();
  getValidTokenMock.mockReset();
  getValidTokenMock.mockResolvedValue(FAKE_TA);
  createClientAsyncMock.mockResolvedValue({
    FECAESolicitarAsync: fecaeSolicitarMock,
    FECompUltimoAutorizadoAsync: fecompUltimoAutorizadoMock,
    FECompConsultarAsync: fecompConsultarMock,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('feCaeSolicitar', () => {
  it('passes the wsfe service name to getValidToken', async () => {
    fecaeSolicitarMock.mockResolvedValue([{}, successXml]);
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    await feCaeSolicitar(makeRequest(), makeConfig());
    expect(getValidTokenMock).toHaveBeenCalledWith(expect.anything(), 'wsfe');
  });

  it('builds the SOAP request with Auth (Token, Sign, Cuit) and FeCAEReq', async () => {
    fecaeSolicitarMock.mockResolvedValue([{}, successXml]);
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    const req = makeRequest();
    await feCaeSolicitar(req, makeConfig({ cuit: '20239312345' }));
    const args = fecaeSolicitarMock.mock.calls[0][0];
    expect(args.Auth.Token).toBe('fake-token');
    expect(args.Auth.Sign).toBe('fake-sign');
    expect(String(args.Auth.Cuit)).toBe('20239312345');
    expect(args.FeCAEReq).toEqual(req);
  });

  it('uses the homologation endpoint when env is homologation', async () => {
    fecaeSolicitarMock.mockResolvedValue([{}, successXml]);
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    await feCaeSolicitar(makeRequest(), makeConfig({ env: 'homologation' }));
    const wsdl = createClientAsyncMock.mock.calls[0][0] as string;
    expect(wsdl).toContain('wswhomo.afip.gov.ar');
    expect(wsdl).toContain('wsfev1');
  });

  it('uses the production endpoint when env is production', async () => {
    fecaeSolicitarMock.mockResolvedValue([{}, successXml]);
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    await feCaeSolicitar(makeRequest(), makeConfig({ env: 'production' }));
    const wsdl = createClientAsyncMock.mock.calls[0][0] as string;
    expect(wsdl).toContain('servicios1.afip.gov.ar');
    expect(wsdl).not.toContain('wswhomo');
  });

  it('parses APROBADO responses without throwing', async () => {
    fecaeSolicitarMock.mockResolvedValue([{}, successXml]);
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    const r = await feCaeSolicitar(makeRequest(), makeConfig());
    expect(r.status).toBe('aprobado');
  });

  it('parses RECHAZADO responses without throwing', async () => {
    fecaeSolicitarMock.mockResolvedValue([{}, rejectedXml]);
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    const r = await feCaeSolicitar(makeRequest(), makeConfig());
    expect(r.status).toBe('rechazado');
  });

  it('throws WsfeError with code SERVICE_UNAVAILABLE on network failures', async () => {
    fecaeSolicitarMock.mockRejectedValue(new Error('ETIMEDOUT'));
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    const promise = feCaeSolicitar(makeRequest(), makeConfig());
    await expect(promise).rejects.toBeInstanceOf(WsfeError);
    await expect(promise).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('throws WsfeError with code AUTH_FAILED on token-related faults', async () => {
    fecaeSolicitarMock.mockRejectedValue({
      message: 'Token invalido',
      body: '<faultstring>Token invalido</faultstring>',
    });
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    await expect(feCaeSolicitar(makeRequest(), makeConfig())).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('throws WsfeError when the raw response is unparseable', async () => {
    fecaeSolicitarMock.mockResolvedValue([{}, '<not valid']);
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    await expect(feCaeSolicitar(makeRequest(), makeConfig())).rejects.toBeInstanceOf(WsfeError);
  });

  it('throws WsfeError when the WSDL cannot be loaded', async () => {
    createClientAsyncMock.mockReset();
    createClientAsyncMock.mockRejectedValue(new Error('ENOTFOUND'));
    const { feCaeSolicitar } = await import('../../src/wsfe/client.js');
    await expect(feCaeSolicitar(makeRequest(), makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});

describe('feCompUltimoAutorizado', () => {
  it('passes the wsfe service name to getValidToken', async () => {
    fecompUltimoAutorizadoMock.mockResolvedValue([{}, ultimoXml]);
    const { feCompUltimoAutorizado } = await import('../../src/wsfe/client.js');
    await feCompUltimoAutorizado(1, 6, makeConfig());
    expect(getValidTokenMock).toHaveBeenCalledWith(expect.anything(), 'wsfe');
  });

  it('builds the SOAP request with Auth and PtoVta and CbteTipo', async () => {
    fecompUltimoAutorizadoMock.mockResolvedValue([{}, ultimoXml]);
    const { feCompUltimoAutorizado } = await import('../../src/wsfe/client.js');
    await feCompUltimoAutorizado(7, 1, makeConfig());
    const args = fecompUltimoAutorizadoMock.mock.calls[0][0];
    expect(args.Auth.Token).toBe('fake-token');
    expect(args.PtoVta).toBe(7);
    expect(args.CbteTipo).toBe(1);
  });

  it('parses the response into UltimoComprobante', async () => {
    fecompUltimoAutorizadoMock.mockResolvedValue([{}, ultimoXml]);
    const { feCompUltimoAutorizado } = await import('../../src/wsfe/client.js');
    const r = await feCompUltimoAutorizado(1, 6, makeConfig());
    expect(r.numero).toBe(12344);
  });

  it('throws WsfeError on network failures', async () => {
    fecompUltimoAutorizadoMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { feCompUltimoAutorizado } = await import('../../src/wsfe/client.js');
    await expect(feCompUltimoAutorizado(1, 6, makeConfig())).rejects.toBeInstanceOf(WsfeError);
  });
});

describe('feCompConsultar', () => {
  it('parses a found comprobante', async () => {
    fecompConsultarMock.mockResolvedValue([{}, consultarFoundXml]);
    const { feCompConsultar } = await import('../../src/wsfe/client.js');
    const r = await feCompConsultar(1, 6, 12345, makeConfig());
    expect(r.cae).toBe('75000000000000');
    expect(r.numeroComprobante).toBe(12345);
  });

  it('builds a FeCompConsReq with PtoVta, CbteTipo, and CbteNro', async () => {
    fecompConsultarMock.mockResolvedValue([{}, consultarFoundXml]);
    const { feCompConsultar } = await import('../../src/wsfe/client.js');
    await feCompConsultar(1, 6, 12345, makeConfig());
    const args = fecompConsultarMock.mock.calls[0][0];
    expect(args.FeCompConsReq.PtoVta).toBe(1);
    expect(args.FeCompConsReq.CbteTipo).toBe(6);
    expect(args.FeCompConsReq.CbteNro).toBe(12345);
  });

  it('throws WsfeError(NOT_FOUND) when the response indicates no comprobante exists', async () => {
    fecompConsultarMock.mockResolvedValue([{}, consultarNotFoundXml]);
    const { feCompConsultar } = await import('../../src/wsfe/client.js');
    const promise = feCompConsultar(1, 6, 99999, makeConfig());
    await expect(promise).rejects.toBeInstanceOf(WsfeError);
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws WsfeError on network failures', async () => {
    fecompConsultarMock.mockRejectedValue(new Error('ETIMEDOUT'));
    const { feCompConsultar } = await import('../../src/wsfe/client.js');
    await expect(feCompConsultar(1, 6, 12345, makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
