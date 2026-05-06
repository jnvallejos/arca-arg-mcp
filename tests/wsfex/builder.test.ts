import { describe, expect, it } from 'vitest';
import { buildFexAuthorizeRequest } from '../../src/wsfex/builder.js';
import type { EmitirFacturaExportacionInput } from '../../src/wsfex/types.js';

const AUTH_CUIT = '20239312345';

function baseInput(
  overrides: Partial<EmitirFacturaExportacionInput> = {},
): EmitirFacturaExportacionInput {
  return {
    tipoComprobante: 19,
    puntoVenta: 1,
    concepto: 2,
    fechaComprobante: '2026-04-15',
    destinoPais: 200,
    cliente: {
      nombre: 'TEST CLIENT INC',
      domicilio: '123 Main St, NY, USA',
      idImpositivoExterior: 'TEST-EIN-12345',
    },
    moneda: 'DOL',
    cotizacion: 1180.5,
    idiomaComprobante: 2,
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
    importeTotal: 100,
    ...overrides,
  };
}

describe('buildFexAuthorizeRequest', () => {
  it('produces a Cmp envelope with Cbte_Tipo=19 (Factura E)', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 123);
    expect(r.Cmp.Cbte_Tipo).toBe(19);
  });

  it('uses the explicit numeroComprobante for Cbte_nro', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 123);
    expect(r.Cmp.Cbte_nro).toBe(123);
  });

  it('forwards Punto_vta from input', () => {
    const r = buildFexAuthorizeRequest(baseInput({ puntoVenta: 7 }), AUTH_CUIT, 1);
    expect(r.Cmp.Punto_vta).toBe(7);
  });

  it('converts YYYY-MM-DD to YYYYMMDD in Fecha_cbte', () => {
    const r = buildFexAuthorizeRequest(baseInput({ fechaComprobante: '2026-04-15' }), AUTH_CUIT, 1);
    expect(r.Cmp.Fecha_cbte).toBe('20260415');
  });

  it('forces Permiso_existente="N" (no PERMISO_EMBARQUE in V1)', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Permiso_existente).toBe('N');
  });

  it('forces Permisos to be an empty Permiso array', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Permisos).toEqual({ Permiso: [] });
  });

  it('forces Cmps_asoc to be an empty Cmp_asoc array (no comprobantes asociados in V1)', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Cmps_asoc).toEqual({ Cmp_asoc: [] });
  });

  it('forces Opcionales to be an empty Opcional array (no opcionales in V1)', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Opcionales).toEqual({ Opcional: [] });
  });

  it('forces Cuit_pais_cliente=0 (no CUIT for foreign client)', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Cuit_pais_cliente).toBe(0);
  });

  it('forwards client name and domicilio', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Cliente).toBe('TEST CLIENT INC');
    expect(r.Cmp.Domicilio_cliente).toBe('123 Main St, NY, USA');
  });

  it('includes Id_impositivo when provided', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Id_impositivo).toBe('TEST-EIN-12345');
  });

  it('omits Id_impositivo when not provided', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({
        cliente: { nombre: 'TEST CLIENT INC', domicilio: '123 Main St, NY, USA' },
      }),
      AUTH_CUIT,
      1,
    );
    expect(r.Cmp.Id_impositivo).toBeUndefined();
  });

  it('forwards Moneda_Id and Moneda_ctz', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({ moneda: 'DOL', cotizacion: 1180.5 }),
      AUTH_CUIT,
      1,
    );
    expect(r.Cmp.Moneda_Id).toBe('DOL');
    expect(r.Cmp.Moneda_ctz).toBe(1180.5);
  });

  it('forwards destinoPais as Dst_cmp', () => {
    const r = buildFexAuthorizeRequest(baseInput({ destinoPais: 200 }), AUTH_CUIT, 1);
    expect(r.Cmp.Dst_cmp).toBe(200);
  });

  it('forwards idiomaComprobante as Idioma_cbte', () => {
    const r = buildFexAuthorizeRequest(baseInput({ idiomaComprobante: 2 }), AUTH_CUIT, 1);
    expect(r.Cmp.Idioma_cbte).toBe(2);
  });

  it('forwards concepto as Tipo_expo', () => {
    const r = buildFexAuthorizeRequest(baseInput({ concepto: 2 }), AUTH_CUIT, 1);
    expect(r.Cmp.Tipo_expo).toBe(2);
  });

  it('rounds Imp_total to 2 decimals', () => {
    const r = buildFexAuthorizeRequest(baseInput({ importeTotal: 100.123 }), AUTH_CUIT, 1);
    expect(r.Cmp.Imp_total).toBe(100.12);
  });

  it('builds Items with PascalCase field names from camelCase input', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({
        items: [
          {
            codigoProducto: 'SKU-001',
            descripcion: 'Hours of consulting',
            cantidad: 10,
            unidadMedida: 7,
            precioUnitario: 50,
            importeTotal: 500,
          },
        ],
      }),
      AUTH_CUIT,
      1,
    );
    expect(r.Cmp.Items.Item).toHaveLength(1);
    const item = r.Cmp.Items.Item[0];
    expect(item.Pro_codigo).toBe('SKU-001');
    expect(item.Pro_ds).toBe('Hours of consulting');
    expect(item.Pro_qty).toBe(10);
    expect(item.Pro_umed).toBe(7);
    expect(item.Pro_precio_uni).toBe(50);
    expect(item.Pro_total_item).toBe(500);
  });

  it('preserves up to 6 decimals for Pro_qty (cantidad fractional)', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({
        items: [
          {
            codigoProducto: 'SKU',
            descripcion: 'd',
            cantidad: 1.123456,
            unidadMedida: 7,
            precioUnitario: 100,
            importeTotal: 112.35,
          },
        ],
      }),
      AUTH_CUIT,
      1,
    );
    expect(r.Cmp.Items.Item[0].Pro_qty).toBeCloseTo(1.123456, 6);
  });

  it('rounds Pro_precio_uni and Pro_total_item to 2 decimals', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({
        items: [
          {
            codigoProducto: 'SKU',
            descripcion: 'd',
            cantidad: 1,
            unidadMedida: 7,
            precioUnitario: 100.123,
            importeTotal: 100.149,
          },
        ],
      }),
      AUTH_CUIT,
      1,
    );
    const item = r.Cmp.Items.Item[0];
    expect(item.Pro_precio_uni).toBe(100.12);
    expect(item.Pro_total_item).toBe(100.15);
  });

  it('includes Fecha_pago when provided (converted to YYYYMMDD)', () => {
    const r = buildFexAuthorizeRequest(baseInput({ fechaPago: '2026-05-15' }), AUTH_CUIT, 1);
    expect(r.Cmp.Fecha_pago).toBe('20260515');
  });

  it('omits Fecha_pago when not provided', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Fecha_pago).toBeUndefined();
  });

  it('includes Incoterms and Incoterms_Ds when provided', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({ incoterms: 'FOB', incotermsDescripcion: 'Free On Board NY' }),
      AUTH_CUIT,
      1,
    );
    expect(r.Cmp.Incoterms).toBe('FOB');
    expect(r.Cmp.Incoterms_Ds).toBe('Free On Board NY');
  });

  it('omits Incoterms and Incoterms_Ds when neither is provided', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Incoterms).toBeUndefined();
    expect(r.Cmp.Incoterms_Ds).toBeUndefined();
  });

  it('includes Observaciones when provided', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({ observaciones: 'Test note for foreign client' }),
      AUTH_CUIT,
      1,
    );
    expect(r.Cmp.Observaciones).toBe('Test note for foreign client');
  });

  it('omits Observaciones when not provided', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 1);
    expect(r.Cmp.Observaciones).toBeUndefined();
  });

  it('uses the request Id field as numeroComprobante', () => {
    const r = buildFexAuthorizeRequest(baseInput(), AUTH_CUIT, 555);
    expect(r.Cmp.Id).toBe(555);
  });

  it('produces multi-item requests when input has multiple items', () => {
    const r = buildFexAuthorizeRequest(
      baseInput({
        items: [
          {
            codigoProducto: 'A',
            descripcion: 'Item A',
            cantidad: 1,
            unidadMedida: 7,
            precioUnitario: 50,
            importeTotal: 50,
          },
          {
            codigoProducto: 'B',
            descripcion: 'Item B',
            cantidad: 2,
            unidadMedida: 7,
            precioUnitario: 25,
            importeTotal: 50,
          },
        ],
        importeTotal: 100,
      }),
      AUTH_CUIT,
      1,
    );
    expect(r.Cmp.Items.Item).toHaveLength(2);
    expect(r.Cmp.Items.Item[1].Pro_codigo).toBe('B');
  });
});
