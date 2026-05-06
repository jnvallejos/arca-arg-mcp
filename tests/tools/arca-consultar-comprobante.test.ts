import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfeError } from '../../src/lib/errors.js';
import type { ComprobanteConsultado } from '../../src/wsfe/types.js';

const feCompConsultarMock = vi.fn();

vi.mock('../../src/wsfe/client.js', () => ({
  feCompConsultar: (...args: unknown[]) => feCompConsultarMock(...args),
}));

function makeConfig(): ArcaConfig {
  return {
    env: 'homologation',
    cuit: '20239312345',
    certPath: '/tmp/cert.pem',
    keyPath: '/tmp/private.key',
    cacheDir: '/tmp/cache',
  };
}

function makeConsultado(overrides: Partial<ComprobanteConsultado> = {}): ComprobanteConsultado {
  return {
    numeroComprobante: 12345,
    tipoComprobante: 6,
    puntoVenta: 1,
    fechaComprobante: '2026-04-15',
    cae: '75000000000000',
    fechaVencimientoCae: '2026-04-25',
    importeTotal: 121,
    importeNeto: 100,
    concepto: 1,
    tipoDocReceptor: 99,
    numeroDocReceptor: '0',
    observaciones: [],
    ...overrides,
  };
}

describe('arca_consultar_comprobante tool', () => {
  beforeEach(() => {
    feCompConsultarMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition', async () => {
    const { arcaConsultarComprobanteTool } = await import(
      '../../src/tools/arca-consultar-comprobante.js'
    );
    expect(arcaConsultarComprobanteTool.name).toBe('arca_consultar_comprobante');
  });

  it('rejects unsupported tipoComprobante', async () => {
    const { handleArcaConsultarComprobante } = await import(
      '../../src/tools/arca-consultar-comprobante.js'
    );
    await expect(
      handleArcaConsultarComprobante(makeConfig(), {
        puntoVenta: 1,
        tipoComprobante: 3,
        numeroComprobante: 1,
      }),
    ).rejects.toThrow();
  });

  it('rejects negative numeroComprobante', async () => {
    const { handleArcaConsultarComprobante } = await import(
      '../../src/tools/arca-consultar-comprobante.js'
    );
    await expect(
      handleArcaConsultarComprobante(makeConfig(), {
        puntoVenta: 1,
        tipoComprobante: 6,
        numeroComprobante: -1,
      }),
    ).rejects.toThrow();
  });

  it('returns formatted detail on success', async () => {
    feCompConsultarMock.mockResolvedValue(makeConsultado());
    const { handleArcaConsultarComprobante } = await import(
      '../../src/tools/arca-consultar-comprobante.js'
    );
    const out = await handleArcaConsultarComprobante(makeConfig(), {
      puntoVenta: 1,
      tipoComprobante: 6,
      numeroComprobante: 12345,
    });
    expect(out.content[0].text).toMatch(/Detalle del comprobante/i);
    expect(out.content[0].text).toContain('75000000000000');
  });

  it('returns "no se encontró" friendly message on WsfeError NOT_FOUND', async () => {
    feCompConsultarMock.mockRejectedValue(new WsfeError('NOT_FOUND', 'no existe'));
    const { handleArcaConsultarComprobante } = await import(
      '../../src/tools/arca-consultar-comprobante.js'
    );
    const out = await handleArcaConsultarComprobante(makeConfig(), {
      puntoVenta: 1,
      tipoComprobante: 6,
      numeroComprobante: 99999,
    });
    expect(out.content[0].text).toMatch(/no se encontr/i);
    expect(out.content[0].text).toContain('Factura B');
    expect(out.content[0].text).toContain('00099999');
  });

  it('propagates other WsfeError variants to the caller', async () => {
    feCompConsultarMock.mockRejectedValue(new WsfeError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaConsultarComprobante } = await import(
      '../../src/tools/arca-consultar-comprobante.js'
    );
    await expect(
      handleArcaConsultarComprobante(makeConfig(), {
        puntoVenta: 1,
        tipoComprobante: 6,
        numeroComprobante: 1,
      }),
    ).rejects.toBeInstanceOf(WsfeError);
  });

  it('passes positional args to feCompConsultar in the right order', async () => {
    feCompConsultarMock.mockResolvedValue(makeConsultado());
    const { handleArcaConsultarComprobante } = await import(
      '../../src/tools/arca-consultar-comprobante.js'
    );
    await handleArcaConsultarComprobante(makeConfig(), {
      puntoVenta: 7,
      tipoComprobante: 1,
      numeroComprobante: 99,
    });
    expect(feCompConsultarMock).toHaveBeenCalledWith(7, 1, 99, expect.any(Object));
  });
});
