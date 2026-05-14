import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { WsfexError } from '../../src/lib/errors.js';
import type { CotizacionMoneda } from '../../src/wsfex/types.js';

const fexGetParamCtzMock = vi.fn();

vi.mock('../../src/wsfex/client.js', () => ({
  fexGetParamCtz: (...args: unknown[]) => fexGetParamCtzMock(...args),
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

function ctz(overrides: Partial<CotizacionMoneda> = {}): CotizacionMoneda {
  return {
    moneda: 'DOL',
    cotizacion: 1180.5,
    fechaCotizacion: '2026-04-15',
    ...overrides,
  };
}

describe('arca_obtener_cotizacion_moneda tool', () => {
  beforeEach(() => {
    fexGetParamCtzMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition with the expected name', async () => {
    const { arcaObtenerCotizacionMonedaTool } = await import(
      '../../src/tools/arca-obtener-cotizacion-moneda.js'
    );
    expect(arcaObtenerCotizacionMonedaTool.name).toBe('arca_obtener_cotizacion_moneda');
  });

  it('rejects an unknown moneda code', async () => {
    const { handleArcaObtenerCotizacionMoneda } = await import(
      '../../src/tools/arca-obtener-cotizacion-moneda.js'
    );
    await expect(
      handleArcaObtenerCotizacionMoneda(makeConfig(), { moneda: 'XYZ' }),
    ).rejects.toThrow();
    expect(fexGetParamCtzMock).not.toHaveBeenCalled();
  });

  it('rejects missing moneda', async () => {
    const { handleArcaObtenerCotizacionMoneda } = await import(
      '../../src/tools/arca-obtener-cotizacion-moneda.js'
    );
    await expect(handleArcaObtenerCotizacionMoneda(makeConfig(), {})).rejects.toThrow();
  });

  it('returns formatted cotización output for DOL', async () => {
    fexGetParamCtzMock.mockResolvedValue(ctz());
    const { handleArcaObtenerCotizacionMoneda } = await import(
      '../../src/tools/arca-obtener-cotizacion-moneda.js'
    );
    const out = await handleArcaObtenerCotizacionMoneda(makeConfig(), { moneda: 'DOL' });
    expect(out.content[0].text).toContain('1.180,50');
    expect(out.content[0].text).toContain('15/04/2026');
    expect(out.content[0].text).toMatch(/USD|DOL/);
  });

  it('forwards the moneda code to fexGetParamCtz', async () => {
    fexGetParamCtzMock.mockResolvedValue(ctz({ moneda: '060', cotizacion: 1300 }));
    const { handleArcaObtenerCotizacionMoneda } = await import(
      '../../src/tools/arca-obtener-cotizacion-moneda.js'
    );
    await handleArcaObtenerCotizacionMoneda(makeConfig(), { moneda: '060' });
    expect(fexGetParamCtzMock).toHaveBeenCalledWith('060', expect.any(Object));
  });

  it('propagates WsfexError', async () => {
    fexGetParamCtzMock.mockRejectedValue(new WsfexError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaObtenerCotizacionMoneda } = await import(
      '../../src/tools/arca-obtener-cotizacion-moneda.js'
    );
    await expect(
      handleArcaObtenerCotizacionMoneda(makeConfig(), { moneda: 'DOL' }),
    ).rejects.toBeInstanceOf(WsfexError);
  });
});
