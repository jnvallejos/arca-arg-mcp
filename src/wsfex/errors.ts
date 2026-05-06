/**
 * Friendly Spanish-language hints attached to common WSFEX error codes. Used
 * by the formatter to enrich ARCA's literal messages with actionable advice
 * pointing at the right MCP tool to call next.
 *
 * The lightbulb emoji (`💡`) is one of the three emojis allowed by project
 * conventions for user-facing tool output.
 */
export const WSFEX_ERROR_HINTS: Record<number, string> = {
  500: 'El número de comprobante no es el siguiente esperado. Probá con `arca_obtener_ultimo_comprobante_exportacion` para conocer el próximo correcto.',
  607: 'La cotización no coincide con la tabla ARCA del día. Probá con `arca_obtener_cotizacion_moneda` para obtener el valor exacto.',
  608: 'El país de destino no está en la tabla de países permitidos por ARCA. Verificá el código.',
  609: 'La moneda no está habilitada para el comprobante. Verificá el código.',
  650: 'El idioma del comprobante debe ser un código válido (1=Español, 2=Inglés, 3=Portugués).',
};

/**
 * Returns the original ARCA message, optionally followed by a lightbulb hint
 * line if the error code has a known explanation. Pure function.
 */
export function describeWsfexError(code: number, originalMessage: string): string {
  const hint = WSFEX_ERROR_HINTS[code];
  if (!hint) return originalMessage;
  return `${originalMessage}\n💡 ${hint}`;
}
