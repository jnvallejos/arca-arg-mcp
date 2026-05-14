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

  it('appends a hint for code 1671 mentioning the YYYY-MM-DD format', () => {
    const out = describeWsfexError(1671, 'formato invalido');
    expect(out).toContain('formato invalido');
    expect(out).toContain('YYYY-MM-DD');
    expect(out).toContain('💡');
  });

  it('appends a hint for code 1672 mentioning concepto 2 and 4', () => {
    const out = describeWsfexError(1672, 'fecha_pago requerida');
    expect(out).toContain('fecha_pago requerida');
    expect(out).toContain('fechaPago');
    expect(out).toMatch(/2.*Servicios/);
    expect(out).toMatch(/4.*Otros/);
    expect(out).toContain('💡');
  });

  it('appends a hint for code 1674 mentioning fechaComprobante ordering', () => {
    const out = describeWsfexError(1674, 'fecha de pago anterior');
    expect(out).toContain('fecha de pago anterior');
    expect(out).toContain('fechaPago');
    expect(out).toContain('fechaComprobante');
    expect(out).toContain('💡');
  });

  it('appends a hint for code 1550 mentioning Permiso_existente', () => {
    const out = describeWsfexError(1550, 'permiso requerido');
    expect(out).toContain('permiso requerido');
    expect(out).toContain('Permiso_existente');
    expect(out).toContain('💡');
  });

  it('appends a hint for code 1736 mentioning Tipo_expo 2 and 4', () => {
    const out = describeWsfexError(1736, 'permiso no permitido');
    expect(out).toContain('permiso no permitido');
    expect(out).toContain('Tipo_expo');
    expect(out).toContain('💡');
  });

  it('appends a hint for code 1820 mentioning Cmps_asoc collection', () => {
    const out = describeWsfexError(1820, 'coleccion vacia');
    expect(out).toContain('coleccion vacia');
    expect(out).toContain('Cmps_asoc');
    expect(out).toContain('💡');
  });
});

describe('WSFEX_ERROR_HINTS table', () => {
  it('covers the documented common WSFEX codes', () => {
    expect(WSFEX_ERROR_HINTS[500]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[607]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[608]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[609]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[650]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[1550]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[1671]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[1672]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[1674]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[1736]).toBeDefined();
    expect(WSFEX_ERROR_HINTS[1820]).toBeDefined();
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
