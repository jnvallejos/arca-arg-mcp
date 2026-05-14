import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { fexGetLastCmp } from '../wsfex/client.js';
import { formatUltimoComprobanteExportacion } from '../wsfex/formatter.js';

const inputSchema = z
  .object({
    puntoVenta: z.number().int().positive(),
  })
  .strict();

export const arcaObtenerUltimoComprobanteExportacionTool: Tool = {
  name: 'arca_obtener_ultimo_comprobante_exportacion',
  description:
    'Devuelve el último número de Factura E (tipo 19) autorizado por ARCA (ex-AFIP) para un punto de venta. Útil para saber el próximo número antes de emitir.',
  inputSchema: {
    type: 'object',
    properties: {
      puntoVenta: { type: 'number', description: 'Punto de venta habilitado.' },
    },
    required: ['puntoVenta'],
  },
};

export async function handleArcaObtenerUltimoComprobanteExportacion(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { puntoVenta } = inputSchema.parse(args);
  const ultimo = await fexGetLastCmp(puntoVenta, config);
  return {
    content: [{ type: 'text', text: formatUltimoComprobanteExportacion(ultimo) }],
  };
}
