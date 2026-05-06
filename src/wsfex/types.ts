/** WSFEX comprobante types exposed by V1: only Factura E. */
export type TipoComprobanteExportacion = 19;

/** Concepto: 1 productos, 2 servicios, 4 otros. */
export type ConceptoExportacion = 1 | 2 | 4;

/** Curated set of WSFEX currency codes. */
export type CodigoMoneda =
  | 'DOL'
  | '060'
  | '002'
  | '006'
  | '010'
  | '011'
  | '012'
  | '014'
  | '019'
  | '030'
  | '031'
  | '091';

/** Open numeric country code (full WSFEX `DST_pais` table is ~250 entries). */
export type CodigoPais = number;

/** Comprobante language codes. 1=Español, 2=Inglés, 3=Portugués. */
export type CodigoIdioma = 1 | 2 | 3;

/** Standard ICC 2020 incoterms accepted by WSFEX. */
export type Incoterms =
  | 'EXW'
  | 'FOB'
  | 'CIF'
  | 'CFR'
  | 'FAS'
  | 'FCA'
  | 'CPT'
  | 'CIP'
  | 'DAP'
  | 'DDP'
  | 'DPU';

/** A line item on a Factura E. Foreign-currency amounts. */
export interface ItemFacturaExportacion {
  /** Free-form internal SKU (`Pro_codigo`). */
  codigoProducto: string;
  /** Item description (`Pro_ds`). */
  descripcion: string;
  /** Quantity. May be fractional for services. */
  cantidad: number;
  /** ARCA unit-of-measure code (`Pro_umed`). 7=unidades, 1=kg, 2=metros, etc. */
  unidadMedida: number;
  /** Foreign-currency amount per unit (`Pro_precio_uni`). */
  precioUnitario: number;
  /** Foreign-currency line total (`Pro_total_item`). Should equal cantidad * precioUnitario. */
  importeTotal: number;
}

/** Foreign client (receiver of the Factura E). No CUIT — identified by name. */
export interface ClienteExportacion {
  nombre: string;
  domicilio: string;
  /** VAT/EIN/etc. identifier in the receiver's country. Optional. */
  idImpositivoExterior?: string;
}

/** Service-related dates required when concepto is 2 (Servicios). */
export interface ServicioPeriodoExportacion {
  fechaDesde: string;
  fechaHasta: string;
  fechaVencimientoPago: string;
}

/** Input passed by the LLM to `arca_emitir_factura_exportacion`. */
export interface EmitirFacturaExportacionInput {
  tipoComprobante: TipoComprobanteExportacion;
  puntoVenta: number;
  /** Optional. When omitted, the tool layer fetches the next available number. */
  numeroComprobante?: number;
  concepto: ConceptoExportacion;
  /** YYYY-MM-DD. */
  fechaComprobante: string;
  destinoPais: CodigoPais;
  cliente: ClienteExportacion;
  moneda: CodigoMoneda;
  /** Foreign-currency to ARS rate as published by ARCA for the day. Must be positive. */
  cotizacion: number;
  idiomaComprobante: CodigoIdioma;
  incoterms?: Incoterms;
  incotermsDescripcion?: string;
  /** Non-empty list of items. */
  items: ItemFacturaExportacion[];
  /** Foreign-currency total. Must equal the sum of items[].importeTotal (2-decimal tolerance). */
  importeTotal: number;
  /** Optional payment due date (YYYY-MM-DD). */
  fechaPago?: string;
  observaciones?: string;
}

/** A single ARCA observation (warning or error code attached to a response). */
export interface ObservacionWsfex {
  code: number;
  message: string;
}

/** Successful CAE response from `FEXAuthorize`. */
export interface ComprobanteExportacionAutorizado {
  status: 'aprobado';
  cae: string;
  fechaVencimientoCae: string;
  numeroComprobante: number;
  tipoComprobante: TipoComprobanteExportacion;
  puntoVenta: number;
  fechaComprobante: string;
  /** Foreign-currency total stamped from the original request (response does not echo it). */
  importeTotal: number;
  moneda: CodigoMoneda;
  cotizacion: number;
}

/** Rejection from ARCA business validation (Resultado='R'). */
export interface ComprobanteExportacionRechazado {
  status: 'rechazado';
  numeroComprobante: number;
  tipoComprobante: TipoComprobanteExportacion;
  puntoVenta: number;
  errores: ObservacionWsfex[];
  observaciones: ObservacionWsfex[];
}

export type ResultadoEmisionExportacion =
  | ComprobanteExportacionAutorizado
  | ComprobanteExportacionRechazado;

/** Output of `arca_obtener_ultimo_comprobante_exportacion`. */
export interface UltimoComprobanteExportacion {
  puntoVenta: number;
  tipoComprobante: TipoComprobanteExportacion;
  /** `0` if no Factura E has been authorized for this PV yet. */
  numero: number;
}

/** Detail returned by `FEXGetCMP`. */
export interface ComprobanteExportacionConsultado {
  numeroComprobante: number;
  tipoComprobante: TipoComprobanteExportacion;
  puntoVenta: number;
  fechaComprobante: string;
  cae: string;
  fechaVencimientoCae: string;
  importeTotal: number;
  moneda: CodigoMoneda;
  cotizacion: number;
  destinoPais: CodigoPais;
  cliente: ClienteExportacion;
  items: ItemFacturaExportacion[];
  observaciones: ObservacionWsfex[];
}

/** Output of `arca_obtener_cotizacion_moneda` (`FEXGetPARAM_Ctz`). */
export interface CotizacionMoneda {
  moneda: CodigoMoneda;
  cotizacion: number;
  fechaCotizacion: string;
}

/* ------------------------- Internal request shape ------------------------- */

export interface FexItem {
  Pro_codigo: string;
  Pro_ds: string;
  Pro_qty: number;
  Pro_umed: number;
  Pro_precio_uni: number;
  Pro_total_item: number;
}

export interface FexCmp {
  Id: number;
  Fecha_cbte: string;
  Cbte_Tipo: number;
  Punto_vta: number;
  Cbte_nro: number;
  Tipo_expo: number;
  Permiso_existente: 'N';
  Dst_cmp: number;
  Cliente: string;
  Cuit_pais_cliente: 0;
  Domicilio_cliente: string;
  Id_impositivo?: string;
  Moneda_Id: string;
  Moneda_ctz: number;
  Imp_total: number;
  Idioma_cbte: number;
  Incoterms?: string;
  Incoterms_Ds?: string;
  Permisos: { Permiso: never[] };
  Cmps_asoc: { Cmp_asoc: never[] };
  Opcionales: { Opcional: never[] };
  Items: { Item: FexItem[] };
  Fecha_pago?: string;
  Observaciones?: string;
}

export interface FexAuthorizeRequest {
  Cmp: FexCmp;
}
