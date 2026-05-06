import { describe, expect, it } from 'vitest';
import { describeWsfeError, WSFE_ERROR_HINTS } from '../../src/wsfe/errors.js';

describe('describeWsfeError', () => {
  it('appends a hint when the error code is known', () => {
    const out = describeWsfeError(10017, 'numero comprobante incorrecto');
    expect(out).toContain('numero comprobante incorrecto');
    expect(out).toContain('arca_obtener_ultimo_comprobante');
  });

  it('returns the ARCA message unchanged when the code is unknown', () => {
    const out = describeWsfeError(999999, 'mensaje raro');
    expect(out).toBe('mensaje raro');
  });

  it('hint output includes the lightbulb prefix', () => {
    const out = describeWsfeError(10017, 'algo');
    expect(out).toContain('💡');
  });

  it('separates hint from message with a newline', () => {
    const out = describeWsfeError(10017, 'algo');
    expect(out.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(out.split('\n')[0]).toBe('algo');
  });

  it('multiple unrelated codes yield distinct hints', () => {
    const a = describeWsfeError(10015, 'a');
    const b = describeWsfeError(10017, 'b');
    expect(a).not.toBe(b);
    expect(a).toContain('padrón');
    expect(b).toContain('arca_obtener_ultimo_comprobante');
  });
});

describe('WSFE_ERROR_HINTS table', () => {
  it('covers the documented common WSFE codes', () => {
    expect(WSFE_ERROR_HINTS[10015]).toBeDefined();
    expect(WSFE_ERROR_HINTS[10016]).toBeDefined();
    expect(WSFE_ERROR_HINTS[10017]).toBeDefined();
    expect(WSFE_ERROR_HINTS[10018]).toBeDefined();
    expect(WSFE_ERROR_HINTS[10019]).toBeDefined();
    expect(WSFE_ERROR_HINTS[10048]).toBeDefined();
  });

  it('all hints are non-empty Spanish strings', () => {
    for (const code of Object.keys(WSFE_ERROR_HINTS)) {
      const hint = WSFE_ERROR_HINTS[Number(code)];
      expect(hint.length).toBeGreaterThan(10);
    }
  });
});
