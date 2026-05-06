import { describe, expect, it } from 'vitest';
import {
  ALICUOTAS_IVA_CODE,
  CONDICIONES_IVA_RECEPTOR,
  TIPOS_COMPROBANTE_V1,
  TIPOS_DOC_RECEPTOR,
} from '../../src/wsfe/codes.js';

describe('TIPOS_COMPROBANTE_V1', () => {
  it('contains exactly the three V1 tipos: Factura A (1), B (6), C (11)', () => {
    const keys = Object.keys(TIPOS_COMPROBANTE_V1)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    expect(keys).toEqual([1, 6, 11]);
  });

  it('labels Factura A as Responsable Inscripto', () => {
    expect(TIPOS_COMPROBANTE_V1[1].name).toBe('Factura A');
    expect(TIPOS_COMPROBANTE_V1[1].issuer).toBe('Responsable Inscripto');
  });

  it('labels Factura B as Responsable Inscripto', () => {
    expect(TIPOS_COMPROBANTE_V1[6].name).toBe('Factura B');
    expect(TIPOS_COMPROBANTE_V1[6].issuer).toBe('Responsable Inscripto');
  });

  it('labels Factura C as Monotributista', () => {
    expect(TIPOS_COMPROBANTE_V1[11].name).toBe('Factura C');
    expect(TIPOS_COMPROBANTE_V1[11].issuer).toBe('Monotributista');
  });

  it('does NOT include any nota de crédito or débito tipo', () => {
    const ncNd = [2, 3, 7, 8, 12, 13];
    for (const t of ncNd) {
      expect((TIPOS_COMPROBANTE_V1 as Record<number, unknown>)[t]).toBeUndefined();
    }
  });
});

describe('ALICUOTAS_IVA_CODE', () => {
  it('maps each alícuota to the documented WSFE code', () => {
    expect(ALICUOTAS_IVA_CODE['0']).toBe(3);
    expect(ALICUOTAS_IVA_CODE['2.5']).toBe(9);
    expect(ALICUOTAS_IVA_CODE['5']).toBe(8);
    expect(ALICUOTAS_IVA_CODE['10.5']).toBe(4);
    expect(ALICUOTAS_IVA_CODE['21']).toBe(5);
    expect(ALICUOTAS_IVA_CODE['27']).toBe(6);
  });

  it('covers exactly the six V1 alícuotas', () => {
    expect(Object.keys(ALICUOTAS_IVA_CODE).sort()).toEqual(
      ['0', '10.5', '2.5', '21', '27', '5'].sort(),
    );
  });
});

describe('TIPOS_DOC_RECEPTOR', () => {
  it('includes CUIT (80) and Consumidor Final (99)', () => {
    expect(TIPOS_DOC_RECEPTOR[80]).toBe('CUIT');
    expect(TIPOS_DOC_RECEPTOR[99]).toMatch(/Consumidor Final/i);
  });

  it('includes the full set of WSFE document types', () => {
    const keys = Object.keys(TIPOS_DOC_RECEPTOR)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    expect(keys).toEqual([80, 86, 87, 89, 90, 91, 96, 99]);
  });

  it('labels DNI (96)', () => {
    expect(TIPOS_DOC_RECEPTOR[96]).toBe('DNI');
  });
});

describe('CONDICIONES_IVA_RECEPTOR', () => {
  it('contains exactly the 11 RG 5616 codes', () => {
    const keys = Object.keys(CONDICIONES_IVA_RECEPTOR)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    expect(keys).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16]);
  });

  it('labels code 1 as IVA Responsable Inscripto', () => {
    expect(CONDICIONES_IVA_RECEPTOR[1]).toBe('IVA Responsable Inscripto');
  });

  it('labels code 5 as Consumidor Final', () => {
    expect(CONDICIONES_IVA_RECEPTOR[5]).toBe('Consumidor Final');
  });

  it('labels code 6 as Responsable Monotributo', () => {
    expect(CONDICIONES_IVA_RECEPTOR[6]).toBe('Responsable Monotributo');
  });

  it('labels code 16 as Monotributo Trabajador Independiente Promovido', () => {
    expect(CONDICIONES_IVA_RECEPTOR[16]).toBe(
      'Monotributo Trabajador Independiente Promovido',
    );
  });

  it('does not include legacy or unsupported codes', () => {
    const unsupported = [0, 2, 3, 11, 12, 14, 17];
    for (const code of unsupported) {
      expect((CONDICIONES_IVA_RECEPTOR as Record<number, unknown>)[code]).toBeUndefined();
    }
  });
});
