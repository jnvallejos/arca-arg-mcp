/** WSFE comprobante types supported by V1: Factura A, B, and C. */
export type TipoComprobante = 1 | 6 | 11;

/** Concepto: 1 productos, 2 servicios, 3 productos y servicios. */
export type Concepto = 1 | 2 | 3;

/** WSFE document type codes for the receiver. */
export type TipoDocReceptor = 80 | 86 | 87 | 89 | 90 | 91 | 96 | 99;

/** Argentine IVA rate labels accepted by the tool input. */
export type AlicuotaIva = '0' | '2.5' | '5' | '10.5' | '21' | '27';

export interface IvaItem {
  alicuota: AlicuotaIva;
  /** ARS amount before IVA. */
  baseImponible: number;
  /** ARS amount of IVA. */
  importe: number;
}

/** Service-related dates required when concepto is 2 or 3. */
export interface ServicioPeriodo {
  fechaDesde: string;
  fechaHasta: string;
  fechaVencimientoPago: string;
}

/** Input passed by the LLM to `arca_emitir_factura`. */
export interface EmitirFacturaInput {
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
  /** Optional. When omitted, the tool layer fetches the next available number. */
  numeroComprobante?: number;
  concepto: Concepto;
  tipoDocReceptor: TipoDocReceptor;
  /** Receiver document number. For Consumidor Final (99) use `'0'`. */
  numeroDocReceptor: string;
  /** YYYY-MM-DD. */
  fechaComprobante: string;
  /** ARS amount before IVA. Always present (`0` for Factura C with no taxable base). */
  importeNeto: number;
  /** Required for Factura A (1) and B (6); forbidden for Factura C (11). */
  iva?: IvaItem[];
  /** ARS total including IVA, exempt and non-taxed amounts. */
  importeTotal: number;
  /** Exempt amount (no IVA). */
  importeExento?: number;
  /** Non-taxed amount (outside IVA scope). */
  importeNoGravado?: number;
  /** Required when concepto is 2 or 3; forbidden when concepto is 1. */
  servicio?: ServicioPeriodo;
}

/** A single ARCA observation (warning or error code attached to a response). */
export interface ObservacionWsfe {
  code: number;
  message: string;
}

/** Successful CAE response from `FECAESolicitar`. */
export interface ComprobanteAutorizado {
  status: 'aprobado';
  cae: string;
  fechaVencimientoCae: string;
  numeroComprobante: number;
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
  fechaComprobante: string;
  importeTotal: number;
  observaciones: ObservacionWsfe[];
}

/** Rejection from ARCA business validation (Resultado = 'R' or 'P'). */
export interface ComprobanteRechazado {
  status: 'rechazado';
  observaciones: ObservacionWsfe[];
  errores: ObservacionWsfe[];
  numeroComprobante: number;
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
}

export type ResultadoEmision = ComprobanteAutorizado | ComprobanteRechazado;

/** Output of `arca_obtener_ultimo_comprobante`. */
export interface UltimoComprobante {
  puntoVenta: number;
  tipoComprobante: TipoComprobante;
  /** `0` if no comprobante has been authorized for this PV+tipo. */
  numero: number;
}

/** Detail returned by `FECompConsultar`. */
export interface ComprobanteConsultado {
  numeroComprobante: number;
  tipoComprobante: TipoComprobante;
  puntoVenta: number;
  fechaComprobante: string;
  cae: string;
  fechaVencimientoCae: string;
  importeTotal: number;
  importeNeto: number;
  concepto: Concepto;
  tipoDocReceptor: TipoDocReceptor;
  numeroDocReceptor: string;
  observaciones: ObservacionWsfe[];
}

/* ------------------------- Internal request shape ------------------------- */

export interface FeIvaAlic {
  Id: number;
  BaseImp: number;
  Importe: number;
}

export interface FeCaeDetRequest {
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  CbteDesde: number;
  CbteHasta: number;
  CbteFch: string;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpIVA: number;
  ImpTrib: number;
  MonId: 'PES';
  MonCotiz: 1;
  FchServDesde?: string;
  FchServHasta?: string;
  FchVtoPago?: string;
  Iva?: { AlicIva: FeIvaAlic[] };
}

export interface FeCabRequest {
  CantReg: 1;
  PtoVta: number;
  CbteTipo: number;
}

export interface FeCaeRequest {
  FeCabReq: FeCabRequest;
  FeDetReq: { FECAEDetRequest: FeCaeDetRequest[] };
}
