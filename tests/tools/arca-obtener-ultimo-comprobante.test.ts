import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfeError } from '../../src/lib/errors.js';
import type { UltimoComprobante } from '../../src/wsfe/types.js';

const feCompUltimoAutorizadoMock = vi.fn();

vi.mock('../../src/wsfe/client.js', () => ({
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

function ultimo(overrides: Partial<UltimoComprobante> = {}): UltimoComprobante {
  return { puntoVenta: 1, tipoComprobante: 6, numero: 12344, ...overrides };
}

describe('arca_obtener_ultimo_comprobante tool', () => {
  beforeEach(() => {
    feCompUltimoAutorizadoMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition', async () => {
    const { arcaObtenerUltimoComprobanteTool } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante.js'
    );
    expect(arcaObtenerUltimoComprobanteTool.name).toBe('arca_obtener_ultimo_comprobante');
  });

  it('rejects unsupported tipoComprobante (e.g., 3)', async () => {
    const { handleArcaObtenerUltimoComprobante } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante.js'
    );
    await expect(
      handleArcaObtenerUltimoComprobante(makeConfig(), { puntoVenta: 1, tipoComprobante: 3 }),
    ).rejects.toThrow();
  });

  it('rejects negative puntoVenta', async () => {
    const { handleArcaObtenerUltimoComprobante } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante.js'
    );
    await expect(
      handleArcaObtenerUltimoComprobante(makeConfig(), { puntoVenta: -1, tipoComprobante: 6 }),
    ).rejects.toThrow();
  });

  it('rejects non-integer puntoVenta', async () => {
    const { handleArcaObtenerUltimoComprobante } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante.js'
    );
    await expect(
      handleArcaObtenerUltimoComprobante(makeConfig(), { puntoVenta: 1.5, tipoComprobante: 6 }),
    ).rejects.toThrow();
  });

  it('returns formatted output with the last number', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue(ultimo({ numero: 12344 }));
    const { handleArcaObtenerUltimoComprobante } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante.js'
    );
    const out = await handleArcaObtenerUltimoComprobante(makeConfig(), {
      puntoVenta: 1,
      tipoComprobante: 6,
    });
    expect(out.content).toHaveLength(1);
    expect(out.content[0].text).toContain('Factura B');
    expect(out.content[0].text).toContain('00012344');
    expect(feCompUltimoAutorizadoMock).toHaveBeenCalledWith(1, 6, expect.any(Object));
  });

  it('returns the "no hay" message when numero is 0', async () => {
    feCompUltimoAutorizadoMock.mockResolvedValue(ultimo({ numero: 0 }));
    const { handleArcaObtenerUltimoComprobante } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante.js'
    );
    const out = await handleArcaObtenerUltimoComprobante(makeConfig(), {
      puntoVenta: 1,
      tipoComprobante: 6,
    });
    expect(out.content[0].text).toMatch(/aún no|no hay/i);
  });

  it('propagates WsfeError to the caller', async () => {
    feCompUltimoAutorizadoMock.mockRejectedValue(new WsfeError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaObtenerUltimoComprobante } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante.js'
    );
    await expect(
      handleArcaObtenerUltimoComprobante(makeConfig(), { puntoVenta: 1, tipoComprobante: 6 }),
    ).rejects.toBeInstanceOf(WsfeError);
  });
});
