import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { buildFexAuthorizeRequest } from '../wsfex/builder.js';
import { fexAuthorize, fexGetLastCmp } from '../wsfex/client.js';
import { formatResultadoEmisionExportacion } from '../wsfex/formatter.js';
import type { EmitirFacturaExportacionInput } from '../wsfex/types.js';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const itemSchema = z.object({
  codigoProducto: z.string().min(1),
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  unidadMedida: z.number().int().nonnegative(),
  precioUnitario: z.number().nonnegative(),
  importeTotal: z.number().nonnegative(),
});

const inputSchema = z
  .object({
    tipoComprobante: z.literal(19),
    puntoVenta: z.number().int().positive(),
    numeroComprobante: z.number().int().positive().optional(),
    concepto: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    fechaComprobante: z.string().regex(dateRegex, 'fechaComprobante must be YYYY-MM-DD.'),
    destinoPais: z.number().int().positive(),
    cliente: z.object({
      nombre: z.string().min(1),
      domicilio: z.string().min(1),
      idImpositivoExterior: z.string().min(1).optional(),
    }),
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
    cotizacion: z.number().positive(),
    idiomaComprobante: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    incoterms: z
      .enum(['EXW', 'FOB', 'CIF', 'CFR', 'FAS', 'FCA', 'CPT', 'CIP', 'DAP', 'DDP', 'DPU'])
      .optional(),
    incotermsDescripcion: z.string().optional(),
    items: z.array(itemSchema).min(1, 'items must contain at least one entry.'),
    importeTotal: z.number().nonnegative(),
    fechaPago: z.string().regex(dateRegex).optional(),
    observaciones: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    const sum = input.items.reduce((acc, i) => acc + i.importeTotal, 0);
    if (Math.abs(sum - input.importeTotal) > 0.01) {
      ctx.addIssue({
        code: 'custom',
        message: `importeTotal (${input.importeTotal}) does not match the sum of items[].importeTotal (${sum.toFixed(2)}).`,
      });
    }

    if ((input.concepto === 2 || input.concepto === 4) && !input.fechaPago) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Fecha de pago (fechaPago) es obligatoria para concepto 2 (Servicios) y 4 (Otros) según WSFEX.',
        path: ['fechaPago'],
      });
    }

    if (input.fechaPago && input.fechaPago < input.fechaComprobante) {
      ctx.addIssue({
        code: 'custom',
        message:
          'fechaPago debe ser igual o posterior a fechaComprobante (validación ARCA 1674).',
        path: ['fechaPago'],
      });
    }
  });

export const arcaEmitirFacturaExportacionTool: Tool = {
  name: 'arca_emitir_factura_exportacion',
  description:
    'Emite una Factura E (exportación, tipo 19) en ARCA (ex-AFIP) vía WSFEX y devuelve el CAE. Soporta moneda extranjera con cotización explícita: el usuario debe consultar `arca_obtener_cotizacion_moneda` antes y pasar el valor exacto. Si no se pasa numeroComprobante, el servidor consulta el último autorizado y usa el siguiente. No expone permisos de embarque, comprobantes asociados ni opcionales en V1.',
  inputSchema: {
    type: 'object',
    properties: {
      tipoComprobante: { type: 'number', enum: [19], description: '19 = Factura E.' },
      puntoVenta: { type: 'number', description: 'Punto de venta habilitado.' },
      numeroComprobante: {
        type: 'number',
        description: 'Optional. If absent, the server fetches last+1.',
      },
      concepto: {
        type: 'number',
        enum: [1, 2, 4],
        description: '1 = Productos, 2 = Servicios, 4 = Otros.',
      },
      fechaComprobante: {
        type: 'string',
        description: 'YYYY-MM-DD.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      destinoPais: {
        type: 'number',
        description:
          'Código de país de destino (tabla DST_pais). Ejemplos: 200=USA, 203=Brasil, 91=España, 426=Reino Unido.',
      },
      cliente: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          domicilio: { type: 'string' },
          idImpositivoExterior: {
            type: 'string',
            description: 'VAT/EIN/etc. del receptor en su país. Opcional.',
          },
        },
        required: ['nombre', 'domicilio'],
      },
      moneda: {
        type: 'string',
        enum: ['DOL', '060', '002', '006', '010', '011', '012', '014', '019', '030', '031', '091'],
        description:
          'Código de moneda WSFEX. DOL=USD, 060=EUR, 002=GBP, 006=BRL, 010=CLP, 011=UYU, 012=JPY, 014=CNY, 019=KRW, 030=CHF, 031=MXN, 091=CAD.',
      },
      cotizacion: {
        type: 'number',
        description:
          'Cotización ARCA del día (positiva). Usar `arca_obtener_cotizacion_moneda` para obtener el valor exacto.',
      },
      idiomaComprobante: {
        type: 'number',
        enum: [1, 2, 3],
        description: '1 = Español, 2 = Inglés, 3 = Portugués.',
      },
      incoterms: {
        type: 'string',
        enum: ['EXW', 'FOB', 'CIF', 'CFR', 'FAS', 'FCA', 'CPT', 'CIP', 'DAP', 'DDP', 'DPU'],
        description: 'Incoterm ICC 2020. Opcional.',
      },
      incotermsDescripcion: { type: 'string', description: 'Descripción libre del incoterm.' },
      items: {
        type: 'array',
        description: 'Lista de ítems. Al menos uno.',
        items: {
          type: 'object',
          properties: {
            codigoProducto: { type: 'string' },
            descripcion: { type: 'string' },
            cantidad: { type: 'number' },
            unidadMedida: { type: 'number' },
            precioUnitario: { type: 'number' },
            importeTotal: { type: 'number' },
          },
          required: [
            'codigoProducto',
            'descripcion',
            'cantidad',
            'unidadMedida',
            'precioUnitario',
            'importeTotal',
          ],
        },
      },
      importeTotal: {
        type: 'number',
        description: 'Total en moneda extranjera. Debe coincidir con la suma de items.',
      },
      fechaPago: {
        type: 'string',
        description: 'YYYY-MM-DD. Opcional.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      observaciones: { type: 'string', description: 'Notas libres. Opcional.' },
    },
    required: [
      'tipoComprobante',
      'puntoVenta',
      'concepto',
      'fechaComprobante',
      'destinoPais',
      'cliente',
      'moneda',
      'cotizacion',
      'idiomaComprobante',
      'items',
      'importeTotal',
    ],
  },
};

export async function handleArcaEmitirFacturaExportacion(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = inputSchema.parse(args) as EmitirFacturaExportacionInput;

  const numero = await resolveNumeroComprobante(input, config);
  const request = buildFexAuthorizeRequest(input, config.cuit, numero);
  const result = await fexAuthorize(request, config);

  return {
    content: [{ type: 'text', text: formatResultadoEmisionExportacion(result) }],
  };
}

async function resolveNumeroComprobante(
  input: EmitirFacturaExportacionInput,
  config: ArcaConfig,
): Promise<number> {
  if (input.numeroComprobante !== undefined) return input.numeroComprobante;
  const last = await fexGetLastCmp(input.puntoVenta, config);
  return last.numero + 1;
}
