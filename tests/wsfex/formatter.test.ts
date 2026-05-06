import { describe, expect, it } from 'vitest';
import {
  formatComprobanteExportacionConsultado,
  formatCotizacionMoneda,
  formatResultadoEmisionExportacion,
  formatUltimoComprobanteExportacion,
} from '../../src/wsfex/formatter.js';
import type {
  ComprobanteExportacionAutorizado,
  ComprobanteExportacionConsultado,
  ComprobanteExportacionRechazado,
  CotizacionMoneda,
  UltimoComprobanteExportacion,
} from '../../src/wsfex/types.js';

function makeAprobado(
  overrides: Partial<ComprobanteExportacionAutorizado> = {},
): ComprobanteExportacionAutorizado {
  return {
    status: 'aprobado',
    cae: '75000000000000',
    fechaVencimientoCae: '2026-04-25',
    numeroComprobante: 123,
    tipoComprobante: 19,
    puntoVenta: 1,
    fechaComprobante: '2026-04-15',
    importeTotal: 5000,
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
    errores: [{ code: 500, message: 'El número de comprobante no es el siguiente esperado.' }],
    observaciones: [],
    ...overrides,
  };
}

describe('formatResultadoEmisionExportacion (APROBADO)', () => {
  it('renders the success header with the ✅ emoji', () => {
    const out = formatResultadoEmisionExportacion(makeAprobado());
    expect(out).toContain('✅');
    expect(out).toContain('Factura E emitida con éxito');
  });

  it('shows tipo, punto de venta, número, and fecha', () => {
    const out = formatResultadoEmisionExportacion(makeAprobado());
    expect(out).toContain('Factura E');
    expect(out).toContain('Punto de venta: 0001');
    expect(out).toContain('Número: 00000123');
    expect(out).toContain('15/04/2026');
  });

  it('formats foreign-currency importe in en-US format with prefix', () => {
    const out = formatResultadoEmisionExportacion(makeAprobado({ importeTotal: 5000, moneda: 'DOL' }));
    expect(out).toContain('USD 5,000.00');
  });

  it('formats cotización in Argentine number format (1.180,50 ARS)', () => {
    const out = formatResultadoEmisionExportacion(makeAprobado({ cotizacion: 1180.5 }));
    expect(out).toContain('1.180,50');
  });

  it('shows the CAE and its vencimiento', () => {
    const out = formatResultadoEmisionExportacion(makeAprobado());
    expect(out).toContain('CAE: 75000000000000');
    expect(out).toContain('Vencimiento del CAE: 25/04/2026');
  });

  it('falls back to currency code when label not in static table', () => {
    // moneda 'DOL' has a label; for an unknown code it should still print the code
    const out = formatResultadoEmisionExportacion(makeAprobado({ moneda: '060' }));
    expect(out).toMatch(/EUR|060/);
  });
});

describe('formatResultadoEmisionExportacion (RECHAZADO)', () => {
  it('renders the rejection header with the ❌ emoji', () => {
    const out = formatResultadoEmisionExportacion(makeRechazado());
    expect(out).toContain('❌');
    expect(out).toContain('Factura E rechazada por ARCA');
  });

  it('lists each error under an Errores section', () => {
    const out = formatResultadoEmisionExportacion(makeRechazado());
    expect(out).toContain('Errores');
    expect(out).toContain('500');
    expect(out).toContain('El número de comprobante no es el siguiente esperado');
  });

  it('attaches the lightbulb hint for known error codes', () => {
    const out = formatResultadoEmisionExportacion(makeRechazado());
    expect(out).toContain('💡');
    expect(out).toContain('arca_obtener_ultimo_comprobante_exportacion');
  });

  it('shows "Número intentado" for the rejected number', () => {
    const out = formatResultadoEmisionExportacion(makeRechazado({ numeroComprobante: 124 }));
    expect(out).toContain('Número intentado: 00000124');
  });

  it('does not contain the success ✅ emoji', () => {
    const out = formatResultadoEmisionExportacion(makeRechazado());
    expect(out).not.toContain('✅');
  });

  it('renders both errores and observaciones when both are present', () => {
    const out = formatResultadoEmisionExportacion(
      makeRechazado({
        observaciones: [{ code: 999, message: 'observation' }],
        errores: [{ code: 500, message: 'error' }],
      }),
    );
    expect(out).toContain('500');
    expect(out).toContain('999');
  });
});

describe('formatUltimoComprobanteExportacion', () => {
  function makeUltimo(
    overrides: Partial<UltimoComprobanteExportacion> = {},
  ): UltimoComprobanteExportacion {
    return { puntoVenta: 1, tipoComprobante: 19, numero: 122, ...overrides };
  }

  it('formats the number with leading zeros (8 digits)', () => {
    const out = formatUltimoComprobanteExportacion(makeUltimo({ numero: 122 }));
    expect(out).toContain('00000122');
  });

  it('handles the "no invoice yet" case (numero=0)', () => {
    const out = formatUltimoComprobanteExportacion(makeUltimo({ numero: 0 }));
    expect(out).toMatch(/aún no|no hay/i);
  });

  it('formats the punto de venta with leading zeros (4 digits)', () => {
    const out = formatUltimoComprobanteExportacion(makeUltimo({ puntoVenta: 7 }));
    expect(out).toContain('0007');
  });

  it('uses the Factura E label', () => {
    const out = formatUltimoComprobanteExportacion(makeUltimo());
    expect(out).toContain('Factura E');
  });
});

describe('formatComprobanteExportacionConsultado', () => {
  function makeConsultado(
    overrides: Partial<ComprobanteExportacionConsultado> = {},
  ): ComprobanteExportacionConsultado {
    return {
      numeroComprobante: 123,
      tipoComprobante: 19,
      puntoVenta: 1,
      fechaComprobante: '2026-04-15',
      cae: '75000000000000',
      fechaVencimientoCae: '2026-04-25',
      importeTotal: 100,
      moneda: 'DOL',
      cotizacion: 1180.5,
      destinoPais: 200,
      cliente: {
        nombre: 'TEST CLIENT INC',
        domicilio: '123 Main St, NY, USA',
        idImpositivoExterior: 'TEST-EIN-12345',
      },
      items: [
        {
          codigoProducto: 'TEST-001',
          descripcion: 'Consulting services',
          cantidad: 1,
          unidadMedida: 7,
          precioUnitario: 100,
          importeTotal: 100,
        },
      ],
      observaciones: [],
      ...overrides,
    };
  }

  it('renders detalle del comprobante header', () => {
    const out = formatComprobanteExportacionConsultado(makeConsultado());
    expect(out).toMatch(/Detalle del comprobante/i);
  });

  it('shows tipo, número, punto de venta, fecha, CAE', () => {
    const out = formatComprobanteExportacionConsultado(makeConsultado());
    expect(out).toContain('Factura E');
    expect(out).toContain('00000123');
    expect(out).toContain('0001');
    expect(out).toContain('15/04/2026');
    expect(out).toContain('75000000000000');
  });

  it('shows the foreign client name and country', () => {
    const out = formatComprobanteExportacionConsultado(makeConsultado());
    expect(out).toContain('TEST CLIENT INC');
    expect(out).toContain('ESTADOS UNIDOS');
  });

  it('shows currency, amount, and cotización', () => {
    const out = formatComprobanteExportacionConsultado(makeConsultado());
    expect(out).toContain('USD 100.00');
    expect(out).toContain('1.180,50');
  });
});

describe('formatCotizacionMoneda', () => {
  function makeCtz(overrides: Partial<CotizacionMoneda> = {}): CotizacionMoneda {
    return {
      moneda: 'DOL',
      cotizacion: 1180.5,
      fechaCotizacion: '2026-04-15',
      ...overrides,
    };
  }

  it('formats the cotización text with the moneda label', () => {
    const out = formatCotizacionMoneda(makeCtz());
    expect(out).toMatch(/USD|DOL/i);
    expect(out).toContain('1.180,50');
  });

  it('formats the fecha in Argentine format (DD/MM/YYYY)', () => {
    const out = formatCotizacionMoneda(makeCtz());
    expect(out).toContain('15/04/2026');
  });

  it('mentions ARS as the destination currency', () => {
    const out = formatCotizacionMoneda(makeCtz());
    expect(out).toMatch(/ARS|peso/i);
  });
});
