import { describe, expect, it } from 'vitest';
import { buildFeCaeRequest } from '../../src/wsfe/builder.js';
import type { EmitirFacturaInput } from '../../src/wsfe/types.js';

const AUTH_CUIT = '20239312345';

function baseFacturaB(overrides: Partial<EmitirFacturaInput> = {}): EmitirFacturaInput {
  return {
    tipoComprobante: 6,
    puntoVenta: 1,
    concepto: 1,
    tipoDocReceptor: 99,
    numeroDocReceptor: '0',
    fechaComprobante: '2026-04-15',
    importeNeto: 100,
    iva: [{ alicuota: '21', baseImponible: 100, importe: 21 }],
    importeTotal: 121,
    ...overrides,
  };
}

function baseFacturaA(overrides: Partial<EmitirFacturaInput> = {}): EmitirFacturaInput {
  return {
    tipoComprobante: 1,
    puntoVenta: 1,
    concepto: 1,
    tipoDocReceptor: 80,
    numeroDocReceptor: '30711111119',
    fechaComprobante: '2026-04-15',
    importeNeto: 1000,
    iva: [{ alicuota: '21', baseImponible: 1000, importe: 210 }],
    importeTotal: 1210,
    ...overrides,
  };
}

function baseFacturaC(overrides: Partial<EmitirFacturaInput> = {}): EmitirFacturaInput {
  return {
    tipoComprobante: 11,
    puntoVenta: 1,
    concepto: 1,
    tipoDocReceptor: 99,
    numeroDocReceptor: '0',
    fechaComprobante: '2026-04-15',
    importeNeto: 100,
    importeTotal: 100,
    ...overrides,
  };
}

describe('buildFeCaeRequest', () => {
  it('produces a header with CantReg=1, the requested PtoVta, and CbteTipo', () => {
    const r = buildFeCaeRequest(baseFacturaB({ puntoVenta: 7 }), AUTH_CUIT, 12345);
    expect(r.FeCabReq.CantReg).toBe(1);
    expect(r.FeCabReq.PtoVta).toBe(7);
    expect(r.FeCabReq.CbteTipo).toBe(6);
  });

  it('uses the explicit numeroComprobante for both CbteDesde and CbteHasta', () => {
    const r = buildFeCaeRequest(baseFacturaB(), AUTH_CUIT, 12345);
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.CbteDesde).toBe(12345);
    expect(det.CbteHasta).toBe(12345);
  });

  it('converts YYYY-MM-DD to YYYYMMDD in CbteFch', () => {
    const r = buildFeCaeRequest(baseFacturaB({ fechaComprobante: '2026-04-15' }), AUTH_CUIT, 1);
    expect(r.FeDetReq.FECAEDetRequest[0].CbteFch).toBe('20260415');
  });

  it('forces MonId="PES" and MonCotiz=1', () => {
    const r = buildFeCaeRequest(baseFacturaB(), AUTH_CUIT, 1);
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.MonId).toBe('PES');
    expect(det.MonCotiz).toBe(1);
  });

  it('forces ImpTrib to 0 (no Tributos in V1)', () => {
    const r = buildFeCaeRequest(baseFacturaA(), AUTH_CUIT, 1);
    expect(r.FeDetReq.FECAEDetRequest[0].ImpTrib).toBe(0);
  });

  it('builds Iva array with WSFE codes for Factura A', () => {
    const r = buildFeCaeRequest(baseFacturaA(), AUTH_CUIT, 1);
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.Iva).toBeDefined();
    expect(det.Iva?.AlicIva).toHaveLength(1);
    expect(det.Iva?.AlicIva[0].Id).toBe(5); // 21% → code 5
    expect(det.Iva?.AlicIva[0].BaseImp).toBe(1000);
    expect(det.Iva?.AlicIva[0].Importe).toBe(210);
    expect(det.ImpIVA).toBe(210);
  });

  it('builds Iva array with WSFE codes for Factura B', () => {
    const r = buildFeCaeRequest(baseFacturaB(), AUTH_CUIT, 1);
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.Iva).toBeDefined();
    expect(det.Iva?.AlicIva).toHaveLength(1);
    expect(det.Iva?.AlicIva[0].Id).toBe(5);
  });

  it('maps every alícuota label to the correct WSFE code', () => {
    const r = buildFeCaeRequest(
      baseFacturaA({
        iva: [
          { alicuota: '0', baseImponible: 0, importe: 0 },
          { alicuota: '2.5', baseImponible: 100, importe: 2.5 },
          { alicuota: '5', baseImponible: 100, importe: 5 },
          { alicuota: '10.5', baseImponible: 100, importe: 10.5 },
          { alicuota: '21', baseImponible: 100, importe: 21 },
          { alicuota: '27', baseImponible: 100, importe: 27 },
        ],
      }),
      AUTH_CUIT,
      1,
    );
    const ids = r.FeDetReq.FECAEDetRequest[0].Iva?.AlicIva.map((a) => a.Id);
    expect(ids).toEqual([3, 9, 8, 4, 5, 6]);
  });

  it('omits the Iva element entirely for Factura C', () => {
    const r = buildFeCaeRequest(baseFacturaC(), AUTH_CUIT, 1);
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.Iva).toBeUndefined();
    expect(det.ImpIVA).toBe(0);
  });

  it('includes service dates when concepto is 2 (Servicios)', () => {
    const r = buildFeCaeRequest(
      baseFacturaB({
        concepto: 2,
        servicio: {
          fechaDesde: '2026-04-01',
          fechaHasta: '2026-04-30',
          fechaVencimientoPago: '2026-05-15',
        },
      }),
      AUTH_CUIT,
      1,
    );
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.Concepto).toBe(2);
    expect(det.FchServDesde).toBe('20260401');
    expect(det.FchServHasta).toBe('20260430');
    expect(det.FchVtoPago).toBe('20260515');
  });

  it('includes service dates when concepto is 3 (Productos y Servicios)', () => {
    const r = buildFeCaeRequest(
      baseFacturaB({
        concepto: 3,
        servicio: {
          fechaDesde: '2026-04-01',
          fechaHasta: '2026-04-30',
          fechaVencimientoPago: '2026-05-15',
        },
      }),
      AUTH_CUIT,
      1,
    );
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.Concepto).toBe(3);
    expect(det.FchServDesde).toBe('20260401');
  });

  it('omits service dates when concepto is 1 (Productos)', () => {
    const r = buildFeCaeRequest(baseFacturaB({ concepto: 1 }), AUTH_CUIT, 1);
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.FchServDesde).toBeUndefined();
    expect(det.FchServHasta).toBeUndefined();
    expect(det.FchVtoPago).toBeUndefined();
  });

  it('rounds importes to 2 decimals', () => {
    const r = buildFeCaeRequest(
      baseFacturaA({
        importeNeto: 100.123,
        iva: [{ alicuota: '21', baseImponible: 100.123, importe: 21.0258 }],
        importeTotal: 121.149,
      }),
      AUTH_CUIT,
      1,
    );
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.ImpNeto).toBe(100.12);
    expect(det.ImpTotal).toBe(121.15);
    expect(det.ImpIVA).toBe(21.03);
    expect(det.Iva?.AlicIva[0].BaseImp).toBe(100.12);
    expect(det.Iva?.AlicIva[0].Importe).toBe(21.03);
  });

  it('passes DocTipo and DocNro for the receiver', () => {
    const r = buildFeCaeRequest(
      baseFacturaA({ tipoDocReceptor: 80, numeroDocReceptor: '30711111119' }),
      AUTH_CUIT,
      1,
    );
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.DocTipo).toBe(80);
    expect(det.DocNro).toBe(30711111119);
  });

  it('treats Consumidor Final document number "0" as numeric 0', () => {
    const r = buildFeCaeRequest(
      baseFacturaB({ tipoDocReceptor: 99, numeroDocReceptor: '0' }),
      AUTH_CUIT,
      1,
    );
    expect(r.FeDetReq.FECAEDetRequest[0].DocNro).toBe(0);
  });

  it('forwards optional importeExento and importeNoGravado as ImpOpEx and ImpTotConc', () => {
    const r = buildFeCaeRequest(
      baseFacturaA({
        importeExento: 50,
        importeNoGravado: 25,
      }),
      AUTH_CUIT,
      1,
    );
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.ImpOpEx).toBe(50);
    expect(det.ImpTotConc).toBe(25);
  });

  it('defaults ImpOpEx and ImpTotConc to 0 when not supplied', () => {
    const r = buildFeCaeRequest(baseFacturaB(), AUTH_CUIT, 1);
    const det = r.FeDetReq.FECAEDetRequest[0];
    expect(det.ImpOpEx).toBe(0);
    expect(det.ImpTotConc).toBe(0);
  });

  it('sums Iva.Importe to compute ImpIVA when multiple alícuotas are present', () => {
    const r = buildFeCaeRequest(
      baseFacturaA({
        iva: [
          { alicuota: '21', baseImponible: 100, importe: 21 },
          { alicuota: '10.5', baseImponible: 50, importe: 5.25 },
        ],
      }),
      AUTH_CUIT,
      1,
    );
    expect(r.FeDetReq.FECAEDetRequest[0].ImpIVA).toBe(26.25);
  });

  it('produces a single FECAEDetRequest entry (CantReg=1)', () => {
    const r = buildFeCaeRequest(baseFacturaB(), AUTH_CUIT, 1);
    expect(r.FeDetReq.FECAEDetRequest).toHaveLength(1);
  });
});
