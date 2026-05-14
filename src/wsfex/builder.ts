import type {
  EmitirFacturaExportacionInput,
  FexAuthorizeRequest,
  FexCmp,
  FexItem,
  ItemFacturaExportacion,
} from './types.js';

/**
 * Builds the WSFEX `FEXAuthorize` request payload from a validated tool input
 * plus an explicit comprobante number (resolved by the tool layer).
 *
 * Pure function. Forces project invariants: `Cuit_pais_cliente=0`. When
 * `concepto` is 1 (goods), `Permiso_existente='N'` is sent. When `concepto`
 * is 2 (services) or 4 (other), `Permiso_existente=''` is sent (tag present,
 * value empty). The `Permisos`, `Cmps_asoc`, and `Opcionales` collections
 * are all omitted entirely in V1; sending them as empty tags triggers ARCA
 * errors 1736/1820 (CmpAsoc and Opcionales are deferred to V2). Numeric
 * importes are rounded defensively to 2 decimals; `Pro_qty` keeps up to 6
 * decimals so fractional-hour services round-trip cleanly.
 *
 * The `authenticatedCuit` parameter is kept in the signature so the SOAP
 * client can pass it as part of the `Auth` envelope; it is not stamped into
 * the `Cmp` body itself.
 */
export function buildFexAuthorizeRequest(
  input: EmitirFacturaExportacionInput,
  _authenticatedCuit: string,
  numeroComprobante: number,
): FexAuthorizeRequest {
  const cmp: FexCmp = {
    Id: numeroComprobante,
    Fecha_cbte: toWsfexDate(input.fechaComprobante),
    Cbte_Tipo: input.tipoComprobante,
    Punto_vta: input.puntoVenta,
    Cbte_nro: numeroComprobante,
    Tipo_expo: input.concepto,
    Permiso_existente: input.concepto === 1 ? 'N' : '',
    Dst_cmp: input.destinoPais,
    Cliente: input.cliente.nombre,
    Cuit_pais_cliente: 0,
    Domicilio_cliente: input.cliente.domicilio,
    Moneda_Id: input.moneda,
    Moneda_ctz: input.cotizacion,
    Imp_total: round2(input.importeTotal),
    Idioma_cbte: input.idiomaComprobante,
    Items: { Item: input.items.map(toFexItem) },
  };

  if (input.cliente.idImpositivoExterior) {
    cmp.Id_impositivo = input.cliente.idImpositivoExterior;
  }
  if (input.incoterms) {
    cmp.Incoterms = input.incoterms;
  }
  if (input.incotermsDescripcion) {
    cmp.Incoterms_Ds = input.incotermsDescripcion;
  }
  if (input.fechaPago) {
    cmp.Fecha_pago = toWsfexDate(input.fechaPago);
  }
  if (input.observaciones) {
    cmp.Observaciones = input.observaciones;
  }

  return { Cmp: cmp };
}

function toFexItem(item: ItemFacturaExportacion): FexItem {
  return {
    Pro_codigo: item.codigoProducto,
    Pro_ds: item.descripcion,
    Pro_qty: round6(item.cantidad),
    Pro_umed: item.unidadMedida,
    Pro_precio_uni: round2(item.precioUnitario),
    Pro_total_item: round2(item.importeTotal),
  };
}

function toWsfexDate(input: string): string {
  return input.replace(/-/g, '');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
