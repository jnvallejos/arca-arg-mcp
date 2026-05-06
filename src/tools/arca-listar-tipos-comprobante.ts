import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { formatTiposComprobanteList } from '../wsfe/formatter.js';

const inputSchema = z.object({}).strict();

export const arcaListarTiposComprobanteTool: Tool = {
  name: 'arca_listar_tipos_comprobante',
  description:
    'Lista los tipos de comprobante de venta soportados por este servidor (Factura A, B y C). Útil para que el LLM elija el tipo correcto antes de emitir.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleArcaListarTiposComprobante(
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  inputSchema.parse(args);
  return {
    content: [{ type: 'text', text: formatTiposComprobanteList() }],
  };
}
