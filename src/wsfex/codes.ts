/**
 * WSFEX comprobante types exposed by V1: Factura E only.
 * Notas de Crédito de Exportación (21) and Notas de Débito de Exportación
 * (20) are deferred to a later phase.
 */
export const TIPOS_COMPROBANTE_EXPORTACION = {
  19: { name: 'Factura E', issuer: 'Any (Export)' },
} as const;

/**
 * Curated subset of WSFEX `FEXGetPARAM_MON` currency codes — the ~12 most
 * commonly used in Argentine export practice. ARCA's full table has ~50
 * entries; adding more is a one-line PR. Static — never queried at runtime.
 */
export const MONEDAS_WSFEX = {
  DOL: 'US Dollar',
  '060': 'Euro',
  '002': 'Pound Sterling',
  '006': 'Real Brasileño',
  '010': 'Peso Chileno',
  '011': 'Peso Uruguayo',
  '012': 'Yen Japonés',
  '014': 'Yuan Renminbi',
  '019': 'Won Sur-coreano',
  '030': 'Franco Suizo',
  '031': 'Peso Mexicano',
  '091': 'Dólar Canadiense',
} as const;

/**
 * Curated subset of WSFEX `FEXGetPARAM_DST_pais` country codes — the top
 * destinations for Argentine export invoicing. ARCA's full table has ~250
 * countries.
 */
export const PAISES_WSFEX = {
  91: 'ESPAÑA',
  200: 'ESTADOS UNIDOS',
  201: 'URUGUAY',
  203: 'BRASIL',
  212: 'CHILE',
  218: 'MEXICO',
  226: 'CANADA',
  410: 'ALEMANIA',
  412: 'FRANCIA',
  416: 'ITALIA',
  426: 'REINO UNIDO',
  497: 'SUIZA',
} as const;

/**
 * WSFEX comprobante language codes. Used as `Idioma_cbte` in the request.
 */
export const IDIOMAS_WSFEX = {
  1: 'Español',
  2: 'Inglés',
  3: 'Portugués',
} as const;

/**
 * Incoterms accepted by WSFEX. The 11 standard ICC 2020 codes.
 */
export const INCOTERMS_WSFEX = {
  EXW: 'Ex Works',
  FOB: 'Free On Board',
  CIF: 'Cost, Insurance and Freight',
  CFR: 'Cost and Freight',
  FAS: 'Free Alongside Ship',
  FCA: 'Free Carrier',
  CPT: 'Carriage Paid To',
  CIP: 'Carriage and Insurance Paid To',
  DAP: 'Delivered At Place',
  DDP: 'Delivered Duty Paid',
  DPU: 'Delivered at Place Unloaded',
} as const;
