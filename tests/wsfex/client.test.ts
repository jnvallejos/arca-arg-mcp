import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfexError } from '../../src/lib/errors.js';
import type { TA } from '../../src/wsaa/types.js';
import type { FexAuthorizeRequest } from '../../src/wsfex/types.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const successXml = readFileSync(join(FIXTURES, 'wsfex-authorize-success.xml'), 'utf-8');
const rejectedXml = readFileSync(join(FIXTURES, 'wsfex-authorize-rejected.xml'), 'utf-8');
const lastXml = readFileSync(join(FIXTURES, 'wsfex-getlastcmp.xml'), 'utf-8');
const getCmpFoundXml = readFileSync(join(FIXTURES, 'wsfex-getcmp-found.xml'), 'utf-8');
const getCmpNotFoundXml = readFileSync(join(FIXTURES, 'wsfex-getcmp-not-found.xml'), 'utf-8');
const getCtzXml = readFileSync(join(FIXTURES, 'wsfex-getparam-ctz.xml'), 'utf-8');

const fexAuthorizeMock = vi.fn();
const fexGetLastMock = vi.fn();
const fexGetCmpMock = vi.fn();
const fexGetParamCtzMock = vi.fn();
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
  service: 'wsfex',
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

function makeRequest(): FexAuthorizeRequest {
  return {
    Cmp: {
      Id: 123,
      Fecha_cbte: '20260415',
      Cbte_Tipo: 19,
      Punto_vta: 1,
      Cbte_nro: 123,
      Tipo_expo: 2,
      Permiso_existente: 'N',
      Dst_cmp: 200,
      Cliente: 'TEST CLIENT INC',
      Cuit_pais_cliente: 0,
      Domicilio_cliente: '123 Main St, NY, USA',
      Moneda_Id: 'DOL',
      Moneda_ctz: 1180.5,
      Imp_total: 100,
      Idioma_cbte: 2,
      Permisos: { Permiso: [] },
      Cmps_asoc: { Cmp_asoc: [] },
      Opcionales: { Opcional: [] },
      Items: {
        Item: [
          {
            Pro_codigo: 'TEST-001',
            Pro_ds: 'Consulting services',
            Pro_qty: 1,
            Pro_umed: 7,
            Pro_precio_uni: 100,
            Pro_total_item: 100,
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  fexAuthorizeMock.mockReset();
  fexGetLastMock.mockReset();
  fexGetCmpMock.mockReset();
  fexGetParamCtzMock.mockReset();
  createClientAsyncMock.mockReset();
  getValidTokenMock.mockReset();
  getValidTokenMock.mockResolvedValue(FAKE_TA);
  createClientAsyncMock.mockResolvedValue({
    FEXAuthorizeAsync: fexAuthorizeMock,
    FEXGetLast_CMPAsync: fexGetLastMock,
    FEXGetCMPAsync: fexGetCmpMock,
    FEXGetPARAM_CtzAsync: fexGetParamCtzMock,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('fexAuthorize', () => {
  it('passes the wsfex service name to getValidToken', async () => {
    fexAuthorizeMock.mockResolvedValue([{}, successXml]);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    await fexAuthorize(makeRequest(), makeConfig());
    expect(getValidTokenMock).toHaveBeenCalledWith(expect.anything(), 'wsfex');
  });

  it('builds the SOAP request with Auth (Token, Sign, Cuit) and Cmp', async () => {
    fexAuthorizeMock.mockResolvedValue([{}, successXml]);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    const req = makeRequest();
    await fexAuthorize(req, makeConfig({ cuit: '20239312345' }));
    const args = fexAuthorizeMock.mock.calls[0][0];
    expect(args.Auth.Token).toBe('fake-token');
    expect(args.Auth.Sign).toBe('fake-sign');
    expect(String(args.Auth.Cuit)).toBe('20239312345');
    expect(args.Cmp).toEqual(req.Cmp);
  });

  it('uses the homologation endpoint when env is homologation', async () => {
    fexAuthorizeMock.mockResolvedValue([{}, successXml]);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    await fexAuthorize(makeRequest(), makeConfig({ env: 'homologation' }));
    const wsdl = createClientAsyncMock.mock.calls[0][0] as string;
    expect(wsdl).toContain('wswhomo.afip.gov.ar');
    expect(wsdl).toContain('wsfexv1');
  });

  it('uses the production endpoint when env is production', async () => {
    fexAuthorizeMock.mockResolvedValue([{}, successXml]);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    await fexAuthorize(makeRequest(), makeConfig({ env: 'production' }));
    const wsdl = createClientAsyncMock.mock.calls[0][0] as string;
    expect(wsdl).toContain('servicios1.afip.gov.ar');
    expect(wsdl).not.toContain('wswhomo');
  });

  it('parses APROBADO responses without throwing', async () => {
    fexAuthorizeMock.mockResolvedValue([{}, successXml]);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    const r = await fexAuthorize(makeRequest(), makeConfig());
    expect(r.status).toBe('aprobado');
  });

  it('stamps importeTotal/moneda/cotizacion from the request onto a successful result', async () => {
    // FEXAuthorizeResponse does not echo Imp_total, Moneda_Id, or Moneda_ctz.
    // The client must read them from the original request and stamp them
    // into the aprobado result so callers see a fully-formed comprobante.
    fexAuthorizeMock.mockResolvedValue([{}, successXml]);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    const req = makeRequest();
    req.Cmp.Imp_total = 12345.67;
    req.Cmp.Moneda_Id = '060';
    req.Cmp.Moneda_ctz = 1300.5;
    const r = await fexAuthorize(req, makeConfig());
    expect(r.status).toBe('aprobado');
    if (r.status !== 'aprobado') return;
    expect(r.importeTotal).toBe(12345.67);
    expect(r.moneda).toBe('060');
    expect(r.cotizacion).toBe(1300.5);
  });

  it('parses RECHAZADO responses without throwing', async () => {
    fexAuthorizeMock.mockResolvedValue([{}, rejectedXml]);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    const r = await fexAuthorize(makeRequest(), makeConfig());
    expect(r.status).toBe('rechazado');
  });

  it('throws WsfexError with code SERVICE_UNAVAILABLE on network failures', async () => {
    fexAuthorizeMock.mockRejectedValue(new Error('ETIMEDOUT'));
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    const promise = fexAuthorize(makeRequest(), makeConfig());
    await expect(promise).rejects.toBeInstanceOf(WsfexError);
    await expect(promise).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('throws WsfexError with code AUTH_FAILED on token-related faults', async () => {
    fexAuthorizeMock.mockRejectedValue({
      message: 'Token invalido',
      body: '<faultstring>Token invalido</faultstring>',
    });
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    await expect(fexAuthorize(makeRequest(), makeConfig())).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('throws WsfexError when the raw response is unparseable', async () => {
    fexAuthorizeMock.mockResolvedValue([{}, '<not valid']);
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    await expect(fexAuthorize(makeRequest(), makeConfig())).rejects.toBeInstanceOf(WsfexError);
  });

  it('throws WsfexError when the WSDL cannot be loaded', async () => {
    createClientAsyncMock.mockReset();
    createClientAsyncMock.mockRejectedValue(new Error('ENOTFOUND'));
    const { fexAuthorize } = await import('../../src/wsfex/client.js');
    await expect(fexAuthorize(makeRequest(), makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});

describe('fexGetLastCmp', () => {
  it('passes the wsfex service name to getValidToken', async () => {
    fexGetLastMock.mockResolvedValue([{}, lastXml]);
    const { fexGetLastCmp } = await import('../../src/wsfex/client.js');
    await fexGetLastCmp(1, makeConfig());
    expect(getValidTokenMock).toHaveBeenCalledWith(expect.anything(), 'wsfex');
  });

  it('builds the SOAP request with Auth and Auth_param', async () => {
    fexGetLastMock.mockResolvedValue([{}, lastXml]);
    const { fexGetLastCmp } = await import('../../src/wsfex/client.js');
    await fexGetLastCmp(7, makeConfig());
    const args = fexGetLastMock.mock.calls[0][0];
    expect(args.Auth.Token).toBe('fake-token');
    expect(args.Auth.Pto_venta).toBe(7);
    expect(args.Auth.Cbte_Tipo).toBe(19);
  });

  it('parses the response into UltimoComprobanteExportacion', async () => {
    fexGetLastMock.mockResolvedValue([{}, lastXml]);
    const { fexGetLastCmp } = await import('../../src/wsfex/client.js');
    const r = await fexGetLastCmp(1, makeConfig());
    expect(r.numero).toBe(122);
    expect(r.tipoComprobante).toBe(19);
  });

  it('throws WsfexError on network failures', async () => {
    fexGetLastMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { fexGetLastCmp } = await import('../../src/wsfex/client.js');
    await expect(fexGetLastCmp(1, makeConfig())).rejects.toBeInstanceOf(WsfexError);
  });
});

describe('fexGetCmp', () => {
  it('parses a found comprobante', async () => {
    fexGetCmpMock.mockResolvedValue([{}, getCmpFoundXml]);
    const { fexGetCmp } = await import('../../src/wsfex/client.js');
    const r = await fexGetCmp(1, 123, makeConfig());
    expect(r.cae).toBe('75000000000000');
    expect(r.numeroComprobante).toBe(123);
    expect(r.cliente.nombre).toBe('TEST CLIENT INC');
  });

  it('builds Cmp_param with Cbte_tipo, Punto_vta, and Cbte_nro', async () => {
    fexGetCmpMock.mockResolvedValue([{}, getCmpFoundXml]);
    const { fexGetCmp } = await import('../../src/wsfex/client.js');
    await fexGetCmp(1, 123, makeConfig());
    const args = fexGetCmpMock.mock.calls[0][0];
    expect(args.Cmp.Cbte_tipo).toBe(19);
    expect(args.Cmp.Punto_vta).toBe(1);
    expect(args.Cmp.Cbte_nro).toBe(123);
  });

  it('throws WsfexError(NOT_FOUND) when ARCA reports no such comprobante', async () => {
    fexGetCmpMock.mockResolvedValue([{}, getCmpNotFoundXml]);
    const { fexGetCmp } = await import('../../src/wsfex/client.js');
    const promise = fexGetCmp(1, 99999, makeConfig());
    await expect(promise).rejects.toBeInstanceOf(WsfexError);
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws WsfexError on network failures', async () => {
    fexGetCmpMock.mockRejectedValue(new Error('ETIMEDOUT'));
    const { fexGetCmp } = await import('../../src/wsfex/client.js');
    await expect(fexGetCmp(1, 123, makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});

describe('fexGetParamCtz', () => {
  it('passes the wsfex service name to getValidToken', async () => {
    fexGetParamCtzMock.mockResolvedValue([{}, getCtzXml]);
    const { fexGetParamCtz } = await import('../../src/wsfex/client.js');
    await fexGetParamCtz('DOL', makeConfig());
    expect(getValidTokenMock).toHaveBeenCalledWith(expect.anything(), 'wsfex');
  });

  it('builds the SOAP request with the moneda code', async () => {
    fexGetParamCtzMock.mockResolvedValue([{}, getCtzXml]);
    const { fexGetParamCtz } = await import('../../src/wsfex/client.js');
    await fexGetParamCtz('DOL', makeConfig());
    const args = fexGetParamCtzMock.mock.calls[0][0];
    expect(args.Auth.Token).toBe('fake-token');
    expect(args.Mon_id).toBe('DOL');
  });

  it('parses cotización and fecha', async () => {
    fexGetParamCtzMock.mockResolvedValue([{}, getCtzXml]);
    const { fexGetParamCtz } = await import('../../src/wsfex/client.js');
    const r = await fexGetParamCtz('DOL', makeConfig());
    expect(r.moneda).toBe('DOL');
    expect(r.cotizacion).toBe(1180.5);
    expect(r.fechaCotizacion).toBe('2026-04-15');
  });

  it('throws WsfexError on network failures', async () => {
    fexGetParamCtzMock.mockRejectedValue(new Error('ETIMEDOUT'));
    const { fexGetParamCtz } = await import('../../src/wsfex/client.js');
    await expect(fexGetParamCtz('DOL', makeConfig())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
