import { describe, expect, it } from 'vitest';
import { WSFEX_ERROR_HINTS, describeWsfexError } from '../../src/wsfex/errors.js';

describe('describeWsfexError', () => {
  it('appends a hint when the error code is known', () => {
    const out = describeWsfexError(607, 'cotizacion no coincide');
    expect(out).toContain('cotizacion no coincide');
    expect(out).toContain('arca_obtener_cotizacion_moneda');
  });

  it('returns the ARCA message unchanged when the code is unknown', () => {
    const out = describeWsfexError(999999, 'mensaje raro');
    expect(out).toBe('mensaje raro');
  });

  it('hint output includes the lightbulb prefix', () => {
    const out = describeWsfexError(607, 'algo');
    expect(out).toContain('💡');
  });

  it('separates hint from message with a newline', () => {
    const out = describeWsfexError(607, 'algo');
    expect(out.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(out.split('\n')[0]).toBe('algo');
  });

  it('multiple unrelated codes yield distinct hints', () => {
    const a = describeWsfexError(500, 'a');
    const b = describeWsfexError(607, 'b');
    expect(a).not.toBe(b);
    expect(a).toContain('arca_obtener_ultimo_comprobante_exportacion');
    expect(b).toContain('arca_obtener_cotizacion_moneda');
  });
});

describe('WSFEX_ERROR_HINTS table', () => {
  it('covers the documented common WSFEX codes', () => {
    expect(WSFEX_ERROR_HINTS[500]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[607]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[608]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[609]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[650]).toBeDefined();
  });

  it('hint for 607 mentions the cotización tool', () => {
    expect(WSFEX_ERROR_HINTS[607]).toMatch(/arca_obtener_cotizacion_moneda/);
  });

  it('hint for 500 mentions the ultimo-comprobante-exportacion tool', () => {
    expect(WSFEX_ERROR_HINTS[500]).toMatch(/arca_obtener_ultimo_comprobante_exportacion/);
  });

  it('all hints are non-empty Spanish strings', () => {
    for (const code of Object.keys(WSFEX_ERROR_HINTS)) {
      const hint = WSFEX_ERROR_HINTS[Number(code)];
      expect(hint.length).toBeGreaterThan(10);
    }
  });
});
