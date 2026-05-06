import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { WsfexError } from '../lib/errors.js';
import { fexGetCmp } from '../wsfex/client.js';
import { formatComprobanteExportacionConsultado } from '../wsfex/formatter.js';

const inputSchema = z
  .object({
    puntoVenta: z.number().int().positive(),
    numeroComprobante: z.number().int().positive(),
  })
  .strict();

export const arcaConsultarFacturaExportacionTool: Tool = {
  name: 'arca_consultar_factura_exportacion',
  description:
    'Recupera el detalle completo de una Factura E (tipo 19) previamente autorizada (cliente, importes, moneda, cotización, CAE, vencimiento) por punto de venta y número. Devuelve un mensaje amigable cuando ARCA no encuentra el comprobante.',
  inputSchema: {
    type: 'object',
    properties: {
      puntoVenta: { type: 'number', description: 'Punto de venta habilitado.' },
      numeroComprobante: { type: 'number', description: 'Número de Factura E a consultar.' },
    },
    required: ['puntoVenta', 'numeroComprobante'],
  },
};

export async function handleArcaConsultarFacturaExportacion(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { puntoVenta, numeroComprobante } = inputSchema.parse(args);
  try {
    const detalle = await fexGetCmp(puntoVenta, numeroComprobante, config);
    return {
      content: [{ type: 'text', text: formatComprobanteExportacionConsultado(detalle) }],
    };
  } catch (err) {
    if (err instanceof WsfexError && err.code === 'NOT_FOUND') {
      return {
        content: [
          {
            type: 'text',
            text: `No se encontró la Factura E ${formatPuntoVenta(puntoVenta)}-${formatNumero(numeroComprobante)}.`,
          },
        ],
      };
    }
    throw err;
  }
}

function formatPuntoVenta(pv: number): string {
  return String(pv).padStart(4, '0');
}

function formatNumero(n: number): string {
  return String(n).padStart(8, '0');
}
