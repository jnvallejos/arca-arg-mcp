import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfeError } from '../../src/lib/errors.js';
import type {
  ComprobanteAutorizado,
  ComprobanteRechazado,
  EmitirFacturaInput,
  UltimoComprobante,
} from '../../src/wsfe/types.js';

const feCaeSolicitarMock = vi.fn();
const feCompUltimoAutorizadoMock = vi.fn();

vi.mock('../../src/wsfe/client.js', () => ({
  feCaeSolicitar: (...args: unknown[]) => feCaeSolicitarMock(...args),
  feCompUltimoAutorizado: (...args: unknown[]) => feCompUltimoAutorizadoMock(...args),
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

function baseFacturaB(overrides: Partial<EmitirFacturaInput> = {}): EmitirFacturaInput {
  return {
    tipoComprobante: 6,
    puntoVenta: 1,
    concepto: 1,
    tipoDocReceptor: 99,
    numeroDocReceptor: '0',
    fechaComprobante: '2026-04-15',
    importeNeto: 100,
    iva: [{ alicuota: '21', baseImponible: 100, importe: 21 }],
    importeTotal: 121,
    ...overrides,
  };
}

function aprobado(overrides: Partial<ComprobanteAutorizado> = {}): ComprobanteAutorizado {
  return {
    status: 'aprobado',
    cae: '75000000000000',
    fechaVencimientoCae: '2026-04-25',
    numeroComprobante: 12345,
    tipoComprobante: 6,
    puntoVenta: 1,
    fechaComprobante: '2026-04-15',
    importeTotal: 121,
    observaciones: [],
    ...overrides,
  };
}

function rechazado(overrides: Partial<ComprobanteRechazado> = {}): ComprobanteRechazado {
  return {
    status: 'rechazado',
    numeroComprobante: 12346,
    tipoComprobante: 6,
    puntoVenta: 1,
    observaciones: [{ code: 10017, message: 'mal numero' }],
    errores: [],
    ...overrides,
  };
}

function ultimo(numero: number): UltimoComprobante {
  return { puntoVenta: 1, tipoComprobante: 6, numero };
}

describe('arca_emitir_factura tool', () => {
  beforeEach(() => {
    feCaeSolicitarMock.mockReset();
    feCompUltimoAutorizadoMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition with name arca_emitir_factura', async () => {
    const { arcaEmitirFacturaTool } = await import('../../src/tools/arca-emitir-factura.js');
    expect(arcaEmitirFacturaTool.name).toBe('arca_emitir_factura');
    expect(arcaEmitirFacturaTool.description).toMatch(/factura/i);
  });

  it('rejects unsupported tipoComprobante (e.g., 3)', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), { ...baseFacturaB(), tipoComprobante: 3 }),
    ).rejects.toThrow();
    expect(feCaeSolicitarMock).not.toHaveBeenCalled();
  });

  it('rejects Factura C (11) when iva is provided', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), {
        ...baseFacturaB(),
        tipoComprobante: 11,
      }),
    ).rejects.toThrow(/factura c/i);
  });

  it('rejects Factura A (1) without iva', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), {
        ...baseFacturaB(),
        tipoComprobante: 1,
        iva: undefined,
      }),
    ).rejects.toThrow(/iva/i);
  });

  it('rejects Factura B (6) without iva', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), { ...baseFacturaB(), iva: undefined }),
    ).rejects.toThrow(/iva/i);
  });

  it('rejects concepto 2 (Servicios) without service dates', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), { ...baseFacturaB(), concepto: 2 }),
    ).rejects.toThrow(/service/i);
  });

  it('rejects concepto 1 (Productos) with service dates', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), {
        ...baseFacturaB(),
        servicio: {
          fechaDesde: '2026-04-01',
          fechaHasta: '2026-04-30',
          fechaVencimientoPago: '2026-05-15',
        },
      }),
    ).rejects.toThrow(/productos/i);
  });

  it('rejects malformed fechaComprobante', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), { ...baseFacturaB(), fechaComprobante: '15/04/2026' }),
    ).rejects.toThrow();
  });

  it('rejects negative importeTotal', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), { ...baseFacturaB(), importeTotal: -1 }),
    ).rejects.toThrow();
  });

  it('rejects unsupported tipoDocReceptor', async () => {
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(
      handleArcaEmitirFactura(makeConfig(), {
        ...baseFacturaB(),
        tipoDocReceptor: 77,
      }),
    ).rejects.toThrow();
  });

  it('auto-resolves numeroComprobante when not provided', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue(ultimo(12344));
    feCaeSolicitarMock.mockResolvedValue(aprobado({ numeroComprobante: 12345 }));
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await handleArcaEmitirFactura(makeConfig(), baseFacturaB());
    expect(feCompUltimoAutorizadoMock).toHaveBeenCalledWith(1, 6, expect.any(Object));
    const requestArg = feCaeSolicitarMock.mock.calls[0][0];
    expect(requestArg.FeDetReq.FECAEDetRequest[0].CbteDesde).toBe(12345);
  });

  it('uses the provided numeroComprobante when present (no last-number lookup)', async () => {
    feCaeSolicitarMock.mockResolvedValue(aprobado({ numeroComprobante: 99 }));
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await handleArcaEmitirFactura(makeConfig(), { ...baseFacturaB(), numeroComprobante: 99 });
    expect(feCompUltimoAutorizadoMock).not.toHaveBeenCalled();
    const requestArg = feCaeSolicitarMock.mock.calls[0][0];
    expect(requestArg.FeDetReq.FECAEDetRequest[0].CbteDesde).toBe(99);
  });

  it('returns formatted APROBADO output with ✅ and CAE', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue(ultimo(12344));
    feCaeSolicitarMock.mockResolvedValue(aprobado());
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    const out = await handleArcaEmitirFactura(makeConfig(), baseFacturaB());
    expect(out.content).toHaveLength(1);
    expect(out.content[0].text).toContain('✅');
    expect(out.content[0].text).toContain('75000000000000');
  });

  it('returns formatted RECHAZADO output without throwing', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue(ultimo(12344));
    feCaeSolicitarMock.mockResolvedValue(rechazado());
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    const out = await handleArcaEmitirFactura(makeConfig(), baseFacturaB());
    expect(out.content[0].text).toContain('❌');
    expect(out.content[0].text).toContain('10017');
  });

  it('propagates WsfeError to the caller', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue(ultimo(12344));
    feCaeSolicitarMock.mockRejectedValue(new WsfeError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    await expect(handleArcaEmitirFactura(makeConfig(), baseFacturaB())).rejects.toBeInstanceOf(
      WsfeError,
    );
  });

  it('accepts Factura C (no iva) and emits successfully', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue({ puntoVenta: 1, tipoComprobante: 11, numero: 0 });
    feCaeSolicitarMock.mockResolvedValue(aprobado({ tipoComprobante: 11, numeroComprobante: 1 }));
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    const out = await handleArcaEmitirFactura(makeConfig(), {
      ...baseFacturaB(),
      tipoComprobante: 11,
      iva: undefined,
    });
    expect(out.content[0].text).toContain('Factura C');
  });

  it('accepts concepto=2 with service dates', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue(ultimo(0));
    feCaeSolicitarMock.mockResolvedValue(aprobado({ numeroComprobante: 1 }));
    const { handleArcaEmitirFactura } = await import('../../src/tools/arca-emitir-factura.js');
    const out = await handleArcaEmitirFactura(makeConfig(), {
      ...baseFacturaB(),
      concepto: 2,
      servicio: {
        fechaDesde: '2026-04-01',
        fechaHasta: '2026-04-30',
        fechaVencimientoPago: '2026-05-15',
      },
    });
    expect(out.content[0].text).toContain('✅');
    const requestArg = feCaeSolicitarMock.mock.calls[0][0];
    expect(requestArg.FeDetReq.FECAEDetRequest[0].FchServDesde).toBe('20260401');
  });
});
