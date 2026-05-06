import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfexError } from '../../src/lib/errors.js';
import type {
  ComprobanteExportacionAutorizado,
  ComprobanteExportacionRechazado,
  EmitirFacturaExportacionInput,
  UltimoComprobanteExportacion,
} from '../../src/wsfex/types.js';

const fexAuthorizeMock = vi.fn();
const fexGetLastCmpMock = vi.fn();

vi.mock('../../src/wsfex/client.js', () => ({
  fexAuthorize: (...args: unknown[]) => fexAuthorizeMock(...args),
  fexGetLastCmp: (...args: unknown[]) => fexGetLastCmpMock(...args),
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

function baseInput(
  overrides: Partial<EmitirFacturaExportacionInput> = {},
): EmitirFacturaExportacionInput {
  return {
    tipoComprobante: 19,
    puntoVenta: 1,
    concepto: 2,
    fechaComprobante: '2026-04-15',
    destinoPais: 200,
    cliente: {
      nombre: 'TEST CLIENT INC',
      domicilio: '123 Main St, NY, USA',
      idImpositivoExterior: 'TEST-EIN-12345',
    },
    moneda: 'DOL',
    cotizacion: 1180.5,
    idiomaComprobante: 2,
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
    importeTotal: 100,
    ...overrides,
  };
}

function aprobado(
  overrides: Partial<ComprobanteExportacionAutorizado> = {},
): ComprobanteExportacionAutorizado {
  return {
    status: 'aprobado',
    cae: '75000000000000',
    fechaVencimientoCae: '2026-04-25',
    numeroComprobante: 123,
    tipoComprobante: 19,
    puntoVenta: 1,
    fechaComprobante: '2026-04-15',
    importeTotal: 100,
    moneda: 'DOL',
    cotizacion: 1180.5,
    ...overrides,
  };
}

function rechazado(
  overrides: Partial<ComprobanteExportacionRechazado> = {},
): ComprobanteExportacionRechazado {
  return {
    status: 'rechazado',
    numeroComprobante: 124,
    tipoComprobante: 19,
    puntoVenta: 1,
    errores: [{ code: 500, message: 'mal numero' }],
    observaciones: [],
    ...overrides,
  };
}

function ultimo(numero: number): UltimoComprobanteExportacion {
  return { puntoVenta: 1, tipoComprobante: 19, numero };
}

describe('arca_emitir_factura_exportacion tool', () => {
  beforeEach(() => {
    fexAuthorizeMock.mockReset();
    fexGetLastCmpMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition with name arca_emitir_factura_exportacion', async () => {
    const { arcaEmitirFacturaExportacionTool } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    expect(arcaEmitirFacturaExportacionTool.name).toBe('arca_emitir_factura_exportacion');
    expect(arcaEmitirFacturaExportacionTool.description).toMatch(/factura\s*e|exportac/i);
  });

  it('rejects tipoComprobante !== 19', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), { ...baseInput(), tipoComprobante: 1 }),
    ).rejects.toThrow();
    expect(fexAuthorizeMock).not.toHaveBeenCalled();
  });

  it('rejects cotización <= 0', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), { ...baseInput(), cotizacion: 0 }),
    ).rejects.toThrow();
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), { ...baseInput(), cotizacion: -1 }),
    ).rejects.toThrow();
  });

  it('rejects an empty items array', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), { ...baseInput(), items: [] }),
    ).rejects.toThrow();
  });

  it('rejects importeTotal mismatch (>0.01 tolerance)', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), {
        ...baseInput(),
        items: [
          {
            codigoProducto: 'A',
            descripcion: 'a',
            cantidad: 1,
            unidadMedida: 7,
            precioUnitario: 50,
            importeTotal: 50,
          },
          {
            codigoProducto: 'B',
            descripcion: 'b',
            cantidad: 1,
            unidadMedida: 7,
            precioUnitario: 50,
            importeTotal: 50,
          },
        ],
        importeTotal: 200,
      }),
    ).rejects.toThrow(/importe/i);
  });

  it('accepts importeTotal within 0.01 tolerance of items sum', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(122));
    fexAuthorizeMock.mockResolvedValue(aprobado());
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    const input = baseInput({
      items: [
        {
          codigoProducto: 'A',
          descripcion: 'a',
          cantidad: 1,
          unidadMedida: 7,
          precioUnitario: 99.995,
          importeTotal: 99.995,
        },
      ],
      importeTotal: 100,
    });
    await expect(handleArcaEmitirFacturaExportacion(makeConfig(), input)).resolves.toBeDefined();
  });

  it('rejects malformed fechaComprobante', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), {
        ...baseInput(),
        fechaComprobante: '15/04/2026',
      }),
    ).rejects.toThrow();
  });

  it('rejects an unknown moneda code', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), {
        ...baseInput(),
        moneda: 'XYZ' as never,
      }),
    ).rejects.toThrow();
  });

  it('rejects an unknown idiomaComprobante code', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), {
        ...baseInput(),
        idiomaComprobante: 9 as never,
      }),
    ).rejects.toThrow();
  });

  it('auto-resolves numeroComprobante when not provided', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(122));
    fexAuthorizeMock.mockResolvedValue(aprobado({ numeroComprobante: 123 }));
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await handleArcaEmitirFacturaExportacion(makeConfig(), baseInput());
    expect(fexGetLastCmpMock).toHaveBeenCalledWith(1, expect.any(Object));
    const requestArg = fexAuthorizeMock.mock.calls[0][0];
    expect(requestArg.Cmp.Cbte_nro).toBe(123);
  });

  it('uses the provided numeroComprobante when present (no last-number lookup)', async () => {
    fexAuthorizeMock.mockResolvedValue(aprobado({ numeroComprobante: 99 }));
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await handleArcaEmitirFacturaExportacion(makeConfig(), {
      ...baseInput(),
      numeroComprobante: 99,
    });
    expect(fexGetLastCmpMock).not.toHaveBeenCalled();
    const requestArg = fexAuthorizeMock.mock.calls[0][0];
    expect(requestArg.Cmp.Cbte_nro).toBe(99);
  });

  it('returns formatted APROBADO output with ✅ and CAE', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(122));
    fexAuthorizeMock.mockResolvedValue(aprobado());
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    const out = await handleArcaEmitirFacturaExportacion(makeConfig(), baseInput());
    expect(out.content).toHaveLength(1);
    expect(out.content[0].text).toContain('✅');
    expect(out.content[0].text).toContain('75000000000000');
    expect(out.content[0].text).toContain('Factura E');
  });

  it('returns formatted RECHAZADO output without throwing', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(122));
    fexAuthorizeMock.mockResolvedValue(rechazado());
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    const out = await handleArcaEmitirFacturaExportacion(makeConfig(), baseInput());
    expect(out.content[0].text).toContain('❌');
    expect(out.content[0].text).toContain('500');
  });

  it('propagates WsfexError to the caller', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(122));
    fexAuthorizeMock.mockRejectedValue(new WsfexError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), baseInput()),
    ).rejects.toBeInstanceOf(WsfexError);
  });

  it('forwards moneda and cotización into the SOAP request', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(122));
    fexAuthorizeMock.mockResolvedValue(aprobado());
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await handleArcaEmitirFacturaExportacion(makeConfig(), {
      ...baseInput(),
      moneda: '060',
      cotizacion: 1300.0,
    });
    const requestArg = fexAuthorizeMock.mock.calls[0][0];
    expect(requestArg.Cmp.Moneda_Id).toBe('060');
    expect(requestArg.Cmp.Moneda_ctz).toBe(1300);
  });

  it('rejects negative item importes', async () => {
    const { handleArcaEmitirFacturaExportacion } = await import(
      '../../src/tools/arca-emitir-factura-exportacion.js'
    );
    await expect(
      handleArcaEmitirFacturaExportacion(makeConfig(), {
        ...baseInput(),
        items: [
          {
            codigoProducto: 'A',
            descripcion: 'a',
            cantidad: -1,
            unidadMedida: 7,
            precioUnitario: 100,
            importeTotal: -100,
          },
        ],
        importeTotal: -100,
      }),
    ).rejects.toThrow();
  });
});
