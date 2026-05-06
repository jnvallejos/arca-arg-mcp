import { ALICUOTAS_IVA_CODE } from './codes.js';
import type {
  EmitirFacturaInput,
  FeCaeDetRequest,
  FeCaeRequest,
  FeIvaAlic,
  IvaItem,
} from './types.js';

/**
 * Builds the WSFE `FECAESolicitar` request payload from a validated tool input
 * plus an explicit comprobante number (resolved by the tool layer).
 *
 * Pure function. Forces project invariants: `MonId='PES'`, `MonCotiz=1`,
 * `Tributos` empty, `CantReg=1`, no IVA for Factura C, service dates only
 * when concepto is 2 or 3. All importes are rounded defensively to 2
 * decimals.
 *
 * The `authenticatedCuit` parameter is kept in the signature so the SOAP
 * client can pass it as part of the `Auth` envelope; it is not stamped into
 * the detail body itself.
 */
export function buildFeCaeRequest(
  input: EmitirFacturaInput,
  _authenticatedCuit: string,
  numeroComprobante: number,
): FeCaeRequest {
  const det = buildDetail(input, numeroComprobante);
  return {
    FeCabReq: {
      CantReg: 1,
      PtoVta: input.puntoVenta,
      CbteTipo: input.tipoComprobante,
    },
    FeDetReq: { FECAEDetRequest: [det] },
  };
}

function buildDetail(input: EmitirFacturaInput, numero: number): FeCaeDetRequest {
  const ivaArray = input.iva && input.tipoComprobante !== 11 ? buildIva(input.iva) : undefined;
  const impIva = ivaArray ? sumImportes(input.iva ?? []) : 0;

  const det: FeCaeDetRequest = {
    Concepto: input.concepto,
    DocTipo: input.tipoDocReceptor,
    DocNro: parseDocNumber(input.numeroDocReceptor),
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: toWsfeDate(input.fechaComprobante),
    ImpTotal: round2(input.importeTotal),
    ImpTotConc: round2(input.importeNoGravado ?? 0),
    ImpNeto: round2(input.importeNeto),
    ImpOpEx: round2(input.importeExento ?? 0),
    ImpIVA: round2(impIva),
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
  };

  if (input.concepto === 2 || input.concepto === 3) {
    if (input.servicio) {
      det.FchServDesde = toWsfeDate(input.servicio.fechaDesde);
      det.FchServHasta = toWsfeDate(input.servicio.fechaHasta);
      det.FchVtoPago = toWsfeDate(input.servicio.fechaVencimientoPago);
    }
  }

  if (ivaArray) {
    det.Iva = { AlicIva: ivaArray };
  }

  return det;
}

function buildIva(items: IvaItem[]): FeIvaAlic[] {
  return items.map((item) => ({
    Id: ALICUOTAS_IVA_CODE[item.alicuota],
    BaseImp: round2(item.baseImponible),
    Importe: round2(item.importe),
  }));
}

function sumImportes(items: IvaItem[]): number {
  return items.reduce((acc, item) => acc + item.importe, 0);
}

function toWsfeDate(input: string): string {
  return input.replace(/-/g, '');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseDocNumber(input: string): number {
  const n = Number.parseInt(input, 10);
  return Number.isNaN(n) ? 0 : n;
}
