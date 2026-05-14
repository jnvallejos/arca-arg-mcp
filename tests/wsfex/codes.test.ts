import { describe, expect, it } from 'vitest';
import {
  IDIOMAS_WSFEX,
  INCOTERMS_WSFEX,
  MONEDAS_WSFEX,
  PAISES_WSFEX,
  TIPOS_COMPROBANTE_EXPORTACION,
} from '../../src/wsfex/codes.js';

describe('TIPOS_COMPROBANTE_EXPORTACION', () => {
  it('contains exactly tipo 19 (Factura E)', () => {
    const keys = Object.keys(TIPOS_COMPROBANTE_EXPORTACION)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    expect(keys).toEqual([19]);
  });

  it('labels Factura E', () => {
    expect(TIPOS_COMPROBANTE_EXPORTACION[19].name).toBe('Factura E');
  });

  it('does NOT include nota de crédito (21) or nota de débito (20) tipos', () => {
    expect((TIPOS_COMPROBANTE_EXPORTACION as Record<number, unknown>)[20]).toBeUndefined();
    expect((TIPOS_COMPROBANTE_EXPORTACION as Record<number, unknown>)[21]).toBeUndefined();
  });
});

describe('MONEDAS_WSFEX', () => {
  it('includes US Dollar (DOL) and Euro (060)', () => {
    expect(MONEDAS_WSFEX.DOL).toBe('US Dollar');
    expect(MONEDAS_WSFEX['060']).toBe('Euro');
  });

  it('includes Pound Sterling (002), Real Brasileño (006), Peso Chileno (010)', () => {
    expect(MONEDAS_WSFEX['002']).toMatch(/Pound/i);
    expect(MONEDAS_WSFEX['006']).toMatch(/Brasil/i);
    expect(MONEDAS_WSFEX['010']).toMatch(/Chileno/i);
  });

  it('includes the curated set of ~12 currencies', () => {
    const keys = Object.keys(MONEDAS_WSFEX).sort();
    expect(keys).toEqual(
      ['002', '006', '010', '011', '012', '014', '019', '030', '031', '060', '091', 'DOL'].sort(),
    );
  });
});

describe('PAISES_WSFEX', () => {
  it('includes ESTADOS UNIDOS (200)', () => {
    expect(PAISES_WSFEX[200]).toBe('ESTADOS UNIDOS');
  });

  it('includes BRASIL (203)', () => {
    expect(PAISES_WSFEX[203]).toBe('BRASIL');
  });

  it('includes ESPAÑA (91)', () => {
    expect(PAISES_WSFEX[91]).toBe('ESPAÑA');
  });

  it('includes the curated set of top destinations', () => {
    const keys = Object.keys(PAISES_WSFEX)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    expect(keys).toEqual([91, 200, 201, 203, 212, 218, 226, 410, 412, 416, 426, 497]);
  });
});

describe('IDIOMAS_WSFEX', () => {
  it('includes Español (1), Inglés (2), Portugués (3)', () => {
    expect(IDIOMAS_WSFEX[1]).toMatch(/espa/i);
    expect(IDIOMAS_WSFEX[2]).toMatch(/ingl/i);
    expect(IDIOMAS_WSFEX[3]).toMatch(/portug/i);
  });

  it('contains exactly the three V1 languages', () => {
    const keys = Object.keys(IDIOMAS_WSFEX)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    expect(keys).toEqual([1, 2, 3]);
  });
});

describe('INCOTERMS_WSFEX', () => {
  it('includes FOB and CIF', () => {
    expect(INCOTERMS_WSFEX.FOB).toMatch(/Free On Board/i);
    expect(INCOTERMS_WSFEX.CIF).toMatch(/Cost.*Insurance.*Freight/i);
  });

  it('includes EXW, DDP, and DPU', () => {
    expect(INCOTERMS_WSFEX.EXW).toBeDefined();
    expect(INCOTERMS_WSFEX.DDP).toBeDefined();
    expect(INCOTERMS_WSFEX.DPU).toBeDefined();
  });

  it('contains the canonical set of incoterms used in WSFEX', () => {
    const keys = Object.keys(INCOTERMS_WSFEX).sort();
    expect(keys).toEqual(
      ['CFR', 'CIF', 'CIP', 'CPT', 'DAP', 'DDP', 'DPU', 'EXW', 'FAS', 'FCA', 'FOB'].sort(),
    );
  });
});
