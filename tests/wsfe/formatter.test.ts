import { describe, expect, it } from 'vitest';
import {
  formatComprobanteConsultado,
  formatResultadoEmision,
  formatTiposComprobanteList,
  formatUltimoComprobante,
} from '../../src/wsfe/formatter.js';
import type {
  ComprobanteAutorizado,
  ComprobanteConsultado,
  ComprobanteRechazado,
  UltimoComprobante,
} from '../../src/wsfe/types.js';

function makeAprobado(overrides: Partial<ComprobanteAutorizado> = {}): ComprobanteAutorizado {
  return {
    status: 'aprobado',
    cae: '75000000000000',
    fechaVencimientoCae: '2026-04-25',
    numeroComprobante: 12345,
    tipoComprobante: 6,
    puntoVenta: 1,
    fechaComprobante: '2026-04-15',
    importeTotal: 100000,
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
    observaciones: [
      { code: 10017, message: 'El número de comprobante no es el siguiente esperado.' },
    ],
    errores: [],
    ...overrides,
  };
}

describe('formatResultadoEmision (APROBADO)', () => {
  it('renders the success header with the ✅ emoji', () => {
    const out = formatResultadoEmision(makeAprobado());
    expect(out).toContain('✅');
    expect(out).toContain('Factura emitida con éxito');
  });

  it('shows tipo, punto de venta, número, and fecha', () => {
    const out = formatResultadoEmision(makeAprobado());
    expect(out).toContain('Factura B');
    expect(out).toContain('Punto de venta: 0001');
    expect(out).toContain('Número: 00012345');
    expect(out).toContain('15/04/2026');
  });

  it('formats importes in Argentine number format ($ 100.000,00)', () => {
    const out = formatResultadoEmision(makeAprobado({ importeTotal: 100000 }));
    expect(out).toContain('100.000,00');
    expect(out).toContain('$');
  });

  it('shows the CAE and its vencimiento', () => {
    const out = formatResultadoEmision(makeAprobado());
    expect(out).toContain('CAE: 75000000000000');
    expect(out).toContain('Vencimiento del CAE: 25/04/2026');
  });

  it('appends an observaciones section when ARCA returns warnings on success', () => {
    const out = formatResultadoEmision(
      makeAprobado({
        observaciones: [{ code: 10063, message: 'Observación no bloqueante.' }],
      }),
    );
    expect(out).toContain('Observaciones de ARCA');
    expect(out).toContain('10063');
    expect(out).toContain('Observación no bloqueante');
  });

  it('uses Factura A label for tipoComprobante=1', () => {
    const out = formatResultadoEmision(makeAprobado({ tipoComprobante: 1 }));
    expect(out).toContain('Factura A');
  });

  it('uses Factura C label for tipoComprobante=11', () => {
    const out = formatResultadoEmision(makeAprobado({ tipoComprobante: 11 }));
    expect(out).toContain('Factura C');
  });
});

describe('formatResultadoEmision (RECHAZADO)', () => {
  it('renders the rejection header with the ❌ emoji', () => {
    const out = formatResultadoEmision(makeRechazado());
    expect(out).toContain('❌');
    expect(out).toContain('Factura rechazada por ARCA');
  });

  it('lists every observación under an Errores section', () => {
    const out = formatResultadoEmision(makeRechazado());
    expect(out).toContain('Errores');
    expect(out).toContain('10017');
    expect(out).toContain('El número de comprobante no es el siguiente esperado');
  });

  it('attaches the lightbulb hint for known error codes', () => {
    const out = formatResultadoEmision(makeRechazado());
    expect(out).toContain('💡');
    expect(out).toContain('arca_obtener_ultimo_comprobante');
  });

  it('also lists top-level Errors collection when present', () => {
    const out = formatResultadoEmision(
      makeRechazado({ errores: [{ code: 1006, message: 'Schema error.' }] }),
    );
    expect(out).toContain('1006');
    expect(out).toContain('Schema error');
  });

  it('shows "Número intentado" for the rejected number', () => {
    const out = formatResultadoEmision(makeRechazado({ numeroComprobante: 12346 }));
    expect(out).toContain('Número intentado: 00012346');
  });

  it('does not contain the success ✅ emoji', () => {
    const out = formatResultadoEmision(makeRechazado());
    expect(out).not.toContain('✅');
  });
});

describe('formatTiposComprobanteList', () => {
  it('includes all V1 tipos with codes 1, 6, 11', () => {
    const out = formatTiposComprobanteList();
    expect(out).toContain('Factura A');
    expect(out).toContain('Factura B');
    expect(out).toContain('Factura C');
    expect(out).toMatch(/\b1\b/);
    expect(out).toMatch(/\b6\b/);
    expect(out).toMatch(/\b11\b/);
  });

  it('mentions that Notas de Crédito and Notas de Débito are not in V1', () => {
    const out = formatTiposComprobanteList();
    expect(out).toMatch(/notas de cr[ée]dito.*notas de d[ée]bito|cr[ée]dito.*d[ée]bito/i);
    expect(out).toMatch(/no est[áa]n? disponibles? en v1|no.*disponibles|no.*v1/i);
  });
});

describe('formatUltimoComprobante', () => {
  function makeUltimo(overrides: Partial<UltimoComprobante> = {}): UltimoComprobante {
    return { puntoVenta: 1, tipoComprobante: 6, numero: 12345, ...overrides };
  }

  it('formats the number with leading zeros (8 digits)', () => {
    const out = formatUltimoComprobante(makeUltimo({ numero: 12345 }));
    expect(out).toContain('00012345');
  });

  it('handles the "no invoice yet" case (numero=0)', () => {
    const out = formatUltimoComprobante(makeUltimo({ numero: 0 }));
    expect(out).toMatch(/aún no|no hay/i);
  });

  it('formats the punto de venta with leading zeros (4 digits)', () => {
    const out = formatUltimoComprobante(makeUltimo({ puntoVenta: 7 }));
    expect(out).toContain('0007');
  });

  it('uses the correct factura label per tipo', () => {
    expect(formatUltimoComprobante(makeUltimo({ tipoComprobante: 1 }))).toContain('Factura A');
    expect(formatUltimoComprobante(makeUltimo({ tipoComprobante: 6 }))).toContain('Factura B');
    expect(formatUltimoComprobante(makeUltimo({ tipoComprobante: 11 }))).toContain('Factura C');
  });
});

describe('formatComprobanteConsultado', () => {
  function makeConsultado(overrides: Partial<ComprobanteConsultado> = {}): ComprobanteConsultado {
    return {
      numeroComprobante: 12345,
      tipoComprobante: 6,
      puntoVenta: 1,
      fechaComprobante: '2026-04-15',
      cae: '75000000000000',
      fechaVencimientoCae: '2026-04-25',
      importeTotal: 121,
      importeNeto: 100,
      concepto: 1,
      tipoDocReceptor: 99,
      numeroDocReceptor: '0',
      observaciones: [],
      ...overrides,
    };
  }

  it('renders detalle del comprobante header', () => {
    const out = formatComprobanteConsultado(makeConsultado());
    expect(out).toMatch(/Detalle del comprobante/i);
  });

  it('shows tipo, número, punto de venta, fecha, CAE', () => {
    const out = formatComprobanteConsultado(makeConsultado());
    expect(out).toContain('Factura B');
    expect(out).toContain('00012345');
    expect(out).toContain('0001');
    expect(out).toContain('15/04/2026');
    expect(out).toContain('75000000000000');
  });

  it('uses Argentine number format for importeTotal', () => {
    const out = formatComprobanteConsultado(makeConsultado({ importeTotal: 121 }));
    expect(out).toContain('121,00');
  });
});
