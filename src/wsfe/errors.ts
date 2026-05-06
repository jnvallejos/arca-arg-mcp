/**
 * Friendly Spanish-language hints attached to common WSFE error codes. Used
 * by the formatter to enrich ARCA's literal messages with actionable advice.
 *
 * The lightbulb emoji (`💡`) is one of the three emojis allowed by the
 * project conventions for user-facing tool output.
 */
export const WSFE_ERROR_HINTS: Record<number, string> = {
  10015: 'El CUIT del receptor no está registrado en el padrón de ARCA.',
  10016:
    'La fecha del comprobante está fuera del rango permitido (10 días anteriores o posteriores a hoy).',
  10017:
    'El número de comprobante no es el siguiente esperado. Probá con `arca_obtener_ultimo_comprobante` para conocer el próximo correcto.',
  10018:
    'Los importes no coinciden: importeTotal debe ser igual a importeNeto + suma de IVAs + importeExento + importeNoGravado.',
  10019:
    'El receptor no admite ese tipo de comprobante (por ejemplo, Consumidor Final no admite Factura A con totales altos).',
  10048:
    'Para concepto 2 (Servicios) o 3 (Productos y Servicios) hay que enviar fecha de servicio desde, hasta y vencimiento de pago.',
};

/**
 * Returns the original ARCA message, optionally followed by a lightbulb hint
 * line if the error code has a known explanation. Pure function.
 */
export function describeWsfeError(code: number, originalMessage: string): string {
  const hint = WSFE_ERROR_HINTS[code];
  if (!hint) return originalMessage;
  return `${originalMessage}\n💡 ${hint}`;
}
