import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfexError } from '../../src/lib/errors.js';
import type { UltimoComprobanteExportacion } from '../../src/wsfex/types.js';

const fexGetLastCmpMock = vi.fn();

vi.mock('../../src/wsfex/client.js', () => ({
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

function ultimo(numero: number): UltimoComprobanteExportacion {
  return { puntoVenta: 1, tipoComprobante: 19, numero };
}

describe('arca_obtener_ultimo_comprobante_exportacion tool', () => {
  beforeEach(() => {
    fexGetLastCmpMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition with the expected name', async () => {
    const { arcaObtenerUltimoComprobanteExportacionTool } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante-exportacion.js'
    );
    expect(arcaObtenerUltimoComprobanteExportacionTool.name).toBe(
      'arca_obtener_ultimo_comprobante_exportacion',
    );
  });

  it('rejects negative puntoVenta', async () => {
    const { handleArcaObtenerUltimoComprobanteExportacion } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante-exportacion.js'
    );
    await expect(
      handleArcaObtenerUltimoComprobanteExportacion(makeConfig(), { puntoVenta: -1 }),
    ).rejects.toThrow();
    expect(fexGetLastCmpMock).not.toHaveBeenCalled();
  });

  it('rejects missing puntoVenta', async () => {
    const { handleArcaObtenerUltimoComprobanteExportacion } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante-exportacion.js'
    );
    await expect(
      handleArcaObtenerUltimoComprobanteExportacion(makeConfig(), {}),
    ).rejects.toThrow();
  });

  it('returns formatted output', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(122));
    const { handleArcaObtenerUltimoComprobanteExportacion } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante-exportacion.js'
    );
    const out = await handleArcaObtenerUltimoComprobanteExportacion(makeConfig(), {
      puntoVenta: 1,
    });
    expect(out.content[0].text).toContain('00000122');
    expect(out.content[0].text).toContain('Factura E');
  });

  it('handles "no invoice yet" case', async () => {
    fexGetLastCmpMock.mockResolvedValue(ultimo(0));
    const { handleArcaObtenerUltimoComprobanteExportacion } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante-exportacion.js'
    );
    const out = await handleArcaObtenerUltimoComprobanteExportacion(makeConfig(), {
      puntoVenta: 1,
    });
    expect(out.content[0].text).toMatch(/aún no|no hay/i);
  });

  it('propagates WsfexError to the caller', async () => {
    fexGetLastCmpMock.mockRejectedValue(new WsfexError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaObtenerUltimoComprobanteExportacion } = await import(
      '../../src/tools/arca-obtener-ultimo-comprobante-exportacion.js'
    );
    await expect(
      handleArcaObtenerUltimoComprobanteExportacion(makeConfig(), { puntoVenta: 1 }),
    ).rejects.toBeInstanceOf(WsfexError);
  });
});
