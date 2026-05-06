import type { AlicuotaIva } from './types.js';

/**
 * Comprobante types exposed by V1: Factura A, B, and C only.
 * Notas de Crédito and Notas de Débito are deferred to a later phase.
 */
export const TIPOS_COMPROBANTE_V1 = {
  1: { name: 'Factura A', issuer: 'Responsable Inscripto' },
  6: { name: 'Factura B', issuer: 'Responsable Inscripto' },
  11: { name: 'Factura C', issuer: 'Monotributista' },
} as const;

/**
 * Argentine IVA alícuota labels mapped to WSFE numeric codes.
 * The label is what the LLM passes; the code is what WSFE expects.
 */
export const ALICUOTAS_IVA_CODE: Record<AlicuotaIva, number> = {
  '0': 3,
  '2.5': 9,
  '5': 8,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

/**
 * Receiver document types accepted by WSFE.
 * Code `99` (Consumidor Final / Sin identificar) is the typical Factura B
 * recipient when the receiver is not registered in ARCA.
 */
export const TIPOS_DOC_RECEPTOR = {
  80: 'CUIT',
  86: 'CUIL',
  87: 'CDI',
  89: 'LE',
  90: 'LC',
  91: 'CI Extranjera',
  96: 'DNI',
  99: 'Consumidor Final / Sin identificar',
} as const;
