import { describe, expect, it } from 'vitest';
import { formatWsfexSmokeSummary } from '../../scripts/smoke-wsfex.js';
import type {
  ComprobanteExportacionAutorizado,
  ComprobanteExportacionRechazado,
} from '../../src/wsfex/types.js';

const SECRET_CAE = '75123456789012';

function makeAprobado(
  overrides: Partial<ComprobanteExportacionAutorizado> = {},
): ComprobanteExportacionAutorizado {
  return {
    status: 'aprobado',
    cae: SECRET_CAE,
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

function makeRechazado(
  overrides: Partial<ComprobanteExportacionRechazado> = {},
): ComprobanteExportacionRechazado {
  return {
    status: 'rechazado',
    numeroComprobante: 124,
    tipoComprobante: 19,
    puntoVenta: 1,
    errores: [{ code: 500, message: 'numero incorrecto' }],
    observaciones: [],
    ...overrides,
  };
}

describe('formatWsfexSmokeSummary (APROBADO)', () => {
  it('starts with the "Resultado: APROBADO" header line', () => {
    const lines = formatWsfexSmokeSummary(makeAprobado());
    expect(lines[0]).toBe('Resultado: APROBADO');
  });

  it('reports tipoComprobante, numeroComprobante, puntoVenta, importeTotal, moneda, cotizacion', () => {
    const lines = formatWsfexSmokeSummary(makeAprobado());
    const joined = lines.join('\n');
    expect(joined).toMatch(/tipoComprobante:\s+19\b/);
    expect(joined).toMatch(/numeroComprobante:\s+123\b/);
    expect(joined).toMatch(/puntoVenta:\s+1\b/);
    expect(joined).toMatch(/importeTotal:\s+100\b/);
    expect(joined).toMatch(/moneda:\s+DOL\b/);
    expect(joined).toMatch(/cotizacion:\s+1180\.5\b/);
  });

  it('reports the CAE length only and never includes the literal CAE value', () => {
    const lines = formatWsfexSmokeSummary(makeAprobado({ cae: SECRET_CAE }));
    const joined = lines.join('\n');
    expect(joined).toMatch(/cae length:\s+\d+ chars/);
    expect(joined).not.toContain(SECRET_CAE);
  });

  it('reports fechaVencimientoCae verbatim (not redacted)', () => {
    const lines = formatWsfexSmokeSummary(makeAprobado());
    expect(lines.join('\n')).toContain('2026-04-25');
  });
});

describe('formatWsfexSmokeSummary (RECHAZADO)', () => {
  it('starts with the "Resultado: RECHAZADO" header line', () => {
    const lines = formatWsfexSmokeSummary(makeRechazado());
    expect(lines[0]).toBe('Resultado: RECHAZADO');
  });

  it('reports the rejected number under "numeroComprobante intentado"', () => {
    const lines = formatWsfexSmokeSummary(makeRechazado({ numeroComprobante: 124 }));
    expect(lines.join('\n')).toMatch(/numeroComprobante intentado:\s+124\b/);
  });

  it('reports error codes only, no messages', () => {
    const lines = formatWsfexSmokeSummary(
      makeRechazado({
        errores: [{ code: 500, message: 'numero incorrecto secret detail' }],
      }),
    );
    const joined = lines.join('\n');
    expect(joined).toContain('500');
    expect(joined).not.toContain('numero incorrecto secret detail');
  });

  it('reports observation count separately from errors', () => {
    const lines = formatWsfexSmokeSummary(
      makeRechazado({
        errores: [{ code: 607, message: 'cotizacion fail' }],
        observaciones: [
          { code: 999, message: 'a' },
          { code: 998, message: 'b' },
        ],
      }),
    );
    const joined = lines.join('\n');
    expect(joined).toMatch(/errores:\s+\[607/);
    expect(joined).toMatch(/observaciones:\s+2\b/);
    expect(joined).not.toContain('cotizacion fail');
  });

  it('never includes the success ✅ emoji', () => {
    const lines = formatWsfexSmokeSummary(makeRechazado());
    expect(lines.join('\n')).not.toContain('✅');
  });
});

describe('CAE redaction safety', () => {
  it('NEVER includes the literal CAE in any output line', () => {
    const lines = formatWsfexSmokeSummary(makeAprobado({ cae: SECRET_CAE }));
    for (const line of lines) {
      expect(line).not.toContain(SECRET_CAE);
    }
  });

  it('reports the CAE length matching the number of characters', () => {
    const cae = 'A'.repeat(14);
    const lines = formatWsfexSmokeSummary(makeAprobado({ cae }));
    const joined = lines.join('\n');
    expect(joined).toContain('14 chars');
    expect(joined).not.toContain(cae);
  });
});
