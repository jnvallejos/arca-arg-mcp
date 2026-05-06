import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { feCompUltimoAutorizado } from '../wsfe/client.js';
import { formatUltimoComprobante } from '../wsfe/formatter.js';

const inputSchema = z
  .object({
    puntoVenta: z.number().int().positive(),
    tipoComprobante: z.union([z.literal(1), z.literal(6), z.literal(11)]),
  })
  .strict();

export const arcaObtenerUltimoComprobanteTool: Tool = {
  name: 'arca_obtener_ultimo_comprobante',
  description:
    'Devuelve el último número de comprobante autorizado por ARCA (ex-AFIP) para un punto de venta y tipo (Factura A=1, B=6, C=11). Útil para saber el próximo número antes de emitir.',
  inputSchema: {
    type: 'object',
    properties: {
      puntoVenta: { type: 'number', description: 'Punto de venta habilitado.' },
      tipoComprobante: {
        type: 'number',
        enum: [1, 6, 11],
        description: '1 = Factura A, 6 = Factura B, 11 = Factura C.',
      },
    },
    required: ['puntoVenta', 'tipoComprobante'],
  },
};

export async function handleArcaObtenerUltimoComprobante(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { puntoVenta, tipoComprobante } = inputSchema.parse(args);
  const ultimo = await feCompUltimoAutorizado(puntoVenta, tipoComprobante, config);
  return {
    content: [{ type: 'text', text: formatUltimoComprobante(ultimo) }],
  };
}
