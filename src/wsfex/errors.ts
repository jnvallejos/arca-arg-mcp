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
  1550: 'El campo `Permiso_existente` debe estar presente con valor "N" (productos) o vacío (servicios/otros). Si concepto es 2 o 4, el campo debe enviarse vacío, no omitirse.',
  1671: 'El campo `fechaPago` debe tener formato YYYY-MM-DD.',
  1672: 'La fecha de pago (`fechaPago`) es obligatoria para concepto 2 (Servicios) y 4 (Otros) en WSFEX. Pasala junto al request de emisión.',
  1674: 'La fecha de pago (`fechaPago`) debe ser igual o posterior a la fecha de emisión (`fechaComprobante`).',
  1736: 'Para Tipo_expo 2 (Servicios) o 4 (Otros) no se pueden informar `Permisos` ni `Permiso_existente=N`. Los permisos de embarque solo aplican a Tipo_expo 1 (Bienes).',
  1820: 'Si se envía la colección `Cmps_asoc`, debe contener al menos un `Cmp_asoc`. Las colecciones vacías deben omitirse del request.',
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
