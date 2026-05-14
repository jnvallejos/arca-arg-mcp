import { describe, expect, it } from 'vitest';
import { formatWsfeSmokeSummary } from '../../scripts/smoke-wsfe.js';
import type { ComprobanteAutorizado, ComprobanteRechazado } from '../../src/wsfe/types.js';

const SECRET_CAE = '75123456789012';

function makeAprobado(overrides: Partial<ComprobanteAutorizado> = {}): ComprobanteAutorizado {
  return {
    status: 'aprobado',
    cae: SECRET_CAE,
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

function makeRechazado(overrides: Partial<ComprobanteRechazado> = {}): ComprobanteRechazado {
  return {
    status: 'rechazado',
    numeroComprobante: 12346,
    tipoComprobante: 6,
    puntoVenta: 1,
    observaciones: [{ code: 10017, message: 'numero incorrecto' }],
    errores: [],
    ...overrides,
  };
}

describe('formatWsfeSmokeSummary (APROBADO)', () => {
  it('starts with the "Resultado: APROBADO" header line', () => {
    const lines = formatWsfeSmokeSummary(makeAprobado());
    expect(lines[0]).toBe('Resultado: APROBADO');
  });

  it('reports tipoComprobante, numeroComprobante, puntoVenta, importeTotal verbatim', () => {
    const lines = formatWsfeSmokeSummary(makeAprobado());
    const joined = lines.join('\n');
    expect(joined).toMatch(/tipoComprobante:\s+6\b/);
    expect(joined).toMatch(/numeroComprobante:\s+12345\b/);
    expect(joined).toMatch(/puntoVenta:\s+1\b/);
    expect(joined).toMatch(/importeTotal:\s+121\b/);
  });

  it('reports the CAE length only and never includes the literal CAE value', () => {
    const lines = formatWsfeSmokeSummary(makeAprobado({ cae: SECRET_CAE }));
    const joined = lines.join('\n');
    expect(joined).toMatch(/cae length:\s+\d+ chars/);
    expect(joined).not.toContain(SECRET_CAE);
  });

  it('reports fechaVencimientoCae verbatim (not redacted)', () => {
    const lines = formatWsfeSmokeSummary(makeAprobado());
    expect(lines.join('\n')).toContain('2026-04-25');
  });

  it('reports observation count only', () => {
    const lines = formatWsfeSmokeSummary(
      makeAprobado({
        observaciones: [
          { code: 10063, message: 'Observación A' },
          { code: 10071, message: 'Observación B' },
        ],
      }),
    );
    const joined = lines.join('\n');
    expect(joined).toMatch(/observaciones:\s+2\b/);
    expect(joined).not.toContain('Observación A');
    expect(joined).not.toContain('Observación B');
  });
});

describe('formatWsfeSmokeSummary (RECHAZADO)', () => {
  it('starts with the "Resultado: RECHAZADO" header line', () => {
    const lines = formatWsfeSmokeSummary(makeRechazado());
    expect(lines[0]).toBe('Resultado: RECHAZADO');
  });

  it('reports the rejected number under "numeroComprobante intentado"', () => {
    const lines = formatWsfeSmokeSummary(makeRechazado({ numeroComprobante: 12346 }));
    expect(lines.join('\n')).toMatch(/numeroComprobante intentado:\s+12346\b/);
  });

  it('reports error codes only, no messages', () => {
    const lines = formatWsfeSmokeSummary(
      makeRechazado({
        observaciones: [{ code: 10017, message: 'numero incorrecto secret detail' }],
      }),
    );
    const joined = lines.join('\n');
    expect(joined).toContain('10017');
    expect(joined).not.toContain('numero incorrecto secret detail');
  });

  it('reports observation count separately from errors', () => {
    const lines = formatWsfeSmokeSummary(
      makeRechazado({
        errores: [{ code: 1006, message: 'schema fail' }],
        observaciones: [
          { code: 10017, message: 'a' },
          { code: 10018, message: 'b' },
        ],
      }),
    );
    const joined = lines.join('\n');
    expect(joined).toMatch(/errores:\s+\[1006/);
    expect(joined).toMatch(/observaciones:\s+2\b/);
    expect(joined).not.toContain('schema fail');
  });

  it('never includes the success ✅ emoji', () => {
    const lines = formatWsfeSmokeSummary(makeRechazado());
    expect(lines.join('\n')).not.toContain('✅');
  });
});

describe('CAE redaction safety', () => {
  it('NEVER includes the literal CAE in any output line, regardless of result variant', () => {
    const aproLines = formatWsfeSmokeSummary(makeAprobado({ cae: SECRET_CAE }));
    for (const line of aproLines) {
      expect(line).not.toContain(SECRET_CAE);
    }
  });

  it('reports the CAE length matching the number of characters', () => {
    const cae = 'A'.repeat(14);
    const lines = formatWsfeSmokeSummary(makeAprobado({ cae }));
    const joined = lines.join('\n');
    expect(joined).toContain('14 chars');
    expect(joined).not.toContain(cae);
  });
});

describe('format invariants', () => {
  it('indents APROBADO body lines with two spaces and aligns labels to a 30-char column', () => {
    const lines = formatWsfeSmokeSummary(makeAprobado());
    for (const line of lines.slice(1)) {
      expect(line.startsWith('  ')).toBe(true);
      const body = line.slice(2);
      const match = body.match(/^([^:]+:\s+)\S/);
      expect(match, `line "${line}" must have aligned label column`).not.toBeNull();
      const labelColumn = match?.[1] ?? '';
      expect(labelColumn.length).toBeGreaterThanOrEqual(30);
    }
  });

  it('indents RECHAZADO body lines with two spaces and aligns labels to a 30-char column', () => {
    const lines = formatWsfeSmokeSummary(makeRechazado());
    for (const line of lines.slice(1)) {
      expect(line.startsWith('  ')).toBe(true);
      const body = line.slice(2);
      const match = body.match(/^([^:]+:\s+)\S/);
      expect(match, `line "${line}" must have aligned label column`).not.toBeNull();
      const labelColumn = match?.[1] ?? '';
      expect(labelColumn.length).toBeGreaterThanOrEqual(30);
    }
  });
});
