import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { fexGetParamCtz } from '../wsfex/client.js';
import { formatCotizacionMoneda } from '../wsfex/formatter.js';

const inputSchema = z
  .object({
    moneda: z.enum([
      'DOL',
      '060',
      '002',
      '006',
      '010',
      '011',
      '012',
      '014',
      '019',
      '030',
      '031',
      '091',
    ]),
  })
  .strict();

export const arcaObtenerCotizacionMonedaTool: Tool = {
  name: 'arca_obtener_cotizacion_moneda',
  description:
    'Devuelve la cotización vigente publicada por ARCA para una moneda extranjera (ARS por unidad). Usalo antes de emitir una Factura E para conocer el valor exacto que ARCA aceptará en el campo `cotizacion`.',
  inputSchema: {
    type: 'object',
    properties: {
      moneda: {
        type: 'string',
        enum: ['DOL', '060', '002', '006', '010', '011', '012', '014', '019', '030', '031', '091'],
        description:
          'Código WSFEX. DOL=USD, 060=EUR, 002=GBP, 006=BRL, 010=CLP, 011=UYU, 012=JPY, 014=CNY, 019=KRW, 030=CHF, 031=MXN, 091=CAD.',
      },
    },
    required: ['moneda'],
  },
};

export async function handleArcaObtenerCotizacionMoneda(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { moneda } = inputSchema.parse(args);
  const ctz = await fexGetParamCtz(moneda, config);
  return {
    content: [{ type: 'text', text: formatCotizacionMoneda(ctz) }],
  };
}
