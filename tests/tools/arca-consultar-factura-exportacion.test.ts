import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfexError } from '../../src/lib/errors.js';
import type { ComprobanteExportacionConsultado } from '../../src/wsfex/types.js';

const fexGetCmpMock = vi.fn();

vi.mock('../../src/wsfex/client.js', () => ({
  fexGetCmp: (...args: unknown[]) => fexGetCmpMock(...args),
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

function consultado(
  overrides: Partial<ComprobanteExportacionConsultado> = {},
): ComprobanteExportacionConsultado {
  return {
    numeroComprobante: 123,
    tipoComprobante: 19,
    puntoVenta: 1,
    fechaComprobante: '2026-04-15',
    cae: '75000000000000',
    fechaVencimientoCae: '2026-04-25',
    importeTotal: 100,
    moneda: 'DOL',
    cotizacion: 1180.5,
    destinoPais: 200,
    cliente: { nombre: 'TEST CLIENT INC', domicilio: '123 Main St, NY, USA' },
    items: [
      {
        codigoProducto: 'TEST-001',
        descripcion: 'Consulting services',
        cantidad: 1,
        unidadMedida: 7,
        precioUnitario: 100,
        importeTotal: 100,
      },
    ],
    observaciones: [],
    ...overrides,
  };
}

describe('arca_consultar_factura_exportacion tool', () => {
  beforeEach(() => {
    fexGetCmpMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition with the expected name', async () => {
    const { arcaConsultarFacturaExportacionTool } = await import(
      '../../src/tools/arca-consultar-factura-exportacion.js'
    );
    expect(arcaConsultarFacturaExportacionTool.name).toBe('arca_consultar_factura_exportacion');
  });

  it('rejects missing puntoVenta', async () => {
    const { handleArcaConsultarFacturaExportacion } = await import(
      '../../src/tools/arca-consultar-factura-exportacion.js'
    );
    await expect(
      handleArcaConsultarFacturaExportacion(makeConfig(), { numeroComprobante: 123 }),
    ).rejects.toThrow();
  });

  it('rejects missing numeroComprobante', async () => {
    const { handleArcaConsultarFacturaExportacion } = await import(
      '../../src/tools/arca-consultar-factura-exportacion.js'
    );
    await expect(
      handleArcaConsultarFacturaExportacion(makeConfig(), { puntoVenta: 1 }),
    ).rejects.toThrow();
  });

  it('returns formatted detail on success', async () => {
    fexGetCmpMock.mockResolvedValue(consultado());
    const { handleArcaConsultarFacturaExportacion } = await import(
      '../../src/tools/arca-consultar-factura-exportacion.js'
    );
    const out = await handleArcaConsultarFacturaExportacion(makeConfig(), {
      puntoVenta: 1,
      numeroComprobante: 123,
    });
    expect(out.content[0].text).toMatch(/Detalle del comprobante/i);
    expect(out.content[0].text).toContain('TEST CLIENT INC');
    expect(out.content[0].text).toContain('75000000000000');
  });

  it('returns "no se encontró" friendly message on NOT_FOUND', async () => {
    fexGetCmpMock.mockRejectedValue(new WsfexError('NOT_FOUND', 'no existe'));
    const { handleArcaConsultarFacturaExportacion } = await import(
      '../../src/tools/arca-consultar-factura-exportacion.js'
    );
    const out = await handleArcaConsultarFacturaExportacion(makeConfig(), {
      puntoVenta: 1,
      numeroComprobante: 99999,
    });
    expect(out.content[0].text).toMatch(/no se encontr/i);
    expect(out.content[0].text).toContain('Factura E');
  });

  it('propagates non-NOT_FOUND WsfexError', async () => {
    fexGetCmpMock.mockRejectedValue(new WsfexError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaConsultarFacturaExportacion } = await import(
      '../../src/tools/arca-consultar-factura-exportacion.js'
    );
    await expect(
      handleArcaConsultarFacturaExportacion(makeConfig(), {
        puntoVenta: 1,
        numeroComprobante: 123,
      }),
    ).rejects.toBeInstanceOf(WsfexError);
  });
});
