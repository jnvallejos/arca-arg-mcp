import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { PadronError } from '../lib/errors.js';
import { getPersona } from '../padron/client.js';
import { formatPersonaForUser } from '../padron/formatter.js';

const inputSchema = z.object({
  cuit: z.string().regex(/^\d{11}$/, 'CUIT must be 11 numeric digits, no dashes or spaces.'),
});

export const arcaConsultarCuitTool: Tool = {
  name: 'arca_consultar_cuit',
  description:
    'Consulta el padrón de ARCA (ex-AFIP) y devuelve los datos fiscales de un CUIT: razón social/nombre, condición tributaria, actividades, domicilio. Útil para validar un CUIT antes de facturarle.',
  inputSchema: {
    type: 'object',
    properties: {
      cuit: {
        type: 'string',
        description: '11-digit CUIT to look up. No dashes, no spaces.',
        pattern: '^\\d{11}$',
      },
    },
    required: ['cuit'],
  },
};

export async function handleArcaConsultarCuit(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { cuit } = inputSchema.parse(args);

  try {
    const persona = await getPersona(cuit, config);
    return {
      content: [{ type: 'text', text: formatPersonaForUser(persona) }],
    };
  } catch (error) {
    if (error instanceof PadronError) {
      return {
        content: [{ type: 'text', text: friendlyErrorMessage(error, cuit) }],
      };
    }
    throw error;
  }
}

function friendlyErrorMessage(error: PadronError, cuit: string): string {
  switch (error.code) {
    case 'NOT_FOUND':
      return `No se encontró el CUIT ${cuit} en el padrón de ARCA.`;
    case 'AUTH_FAILED':
      return `Error de autenticación con ARCA al consultar el CUIT ${cuit}: ${error.message}`;
    case 'SERVICE_UNAVAILABLE':
      return `El servicio de Padrón de ARCA no está disponible en este momento (CUIT ${cuit}). ${error.message}`;
    default:
      return `Error consultando el CUIT ${cuit} en el padrón de ARCA: ${error.message}`;
  }
}
