import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { WsfeError } from '../lib/errors.js';
import { TIPOS_COMPROBANTE_V1 } from '../wsfe/codes.js';
import { feCompConsultar } from '../wsfe/client.js';
import { formatComprobanteConsultado } from '../wsfe/formatter.js';
import type { TipoComprobante } from '../wsfe/types.js';

const inputSchema = z
  .object({
    puntoVenta: z.number().int().positive(),
    tipoComprobante: z.union([z.literal(1), z.literal(6), z.literal(11)]),
    numeroComprobante: z.number().int().positive(),
  })
  .strict();

export const arcaConsultarComprobanteTool: Tool = {
  name: 'arca_consultar_comprobante',
  description:
    'Consulta un comprobante previamente emitido en ARCA (ex-AFIP) por punto de venta, tipo y número, y devuelve sus datos completos incluyendo el CAE.',
  inputSchema: {
    type: 'object',
    properties: {
      puntoVenta: { type: 'number' },
      tipoComprobante: {
        type: 'number',
        enum: [1, 6, 11],
        description: '1 = Factura A, 6 = Factura B, 11 = Factura C.',
      },
      numeroComprobante: { type: 'number', description: 'Número de comprobante a consultar.' },
    },
    required: ['puntoVenta', 'tipoComprobante', 'numeroComprobante'],
  },
};

export async function handleArcaConsultarComprobante(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { puntoVenta, tipoComprobante, numeroComprobante } = inputSchema.parse(args);

  try {
    const comprobante = await feCompConsultar(puntoVenta, tipoComprobante, numeroComprobante, config);
    return {
      content: [{ type: 'text', text: formatComprobanteConsultado(comprobante) }],
    };
  } catch (error) {
    if (error instanceof WsfeError && error.code === 'NOT_FOUND') {
      return {
        content: [
          {
            type: 'text',
            text: notFoundMessage(tipoComprobante, puntoVenta, numeroComprobante),
          },
        ],
      };
    }
    throw error;
  }
}

function notFoundMessage(
  tipo: TipoComprobante,
  puntoVenta: number,
  numero: number,
): string {
  const label = TIPOS_COMPROBANTE_V1[tipo].name;
  const pv = String(puntoVenta).padStart(4, '0');
  const num = String(numero).padStart(8, '0');
  return `No se encontró el comprobante ${label} ${pv}-${num}.`;
}
