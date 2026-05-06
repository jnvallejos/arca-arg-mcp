import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArcaConfig } from '../config/types.js';
import { buildFeCaeRequest } from '../wsfe/builder.js';
import { feCaeSolicitar, feCompUltimoAutorizado } from '../wsfe/client.js';
import { formatResultadoEmision } from '../wsfe/formatter.js';
import type { EmitirFacturaInput } from '../wsfe/types.js';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const ivaItemSchema = z.object({
  alicuota: z.enum(['0', '2.5', '5', '10.5', '21', '27']),
  baseImponible: z.number().nonnegative(),
  importe: z.number().nonnegative(),
});

const inputSchema = z
  .object({
    tipoComprobante: z.union([z.literal(1), z.literal(6), z.literal(11)]),
    puntoVenta: z.number().int().positive(),
    numeroComprobante: z.number().int().positive().optional(),
    concepto: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    tipoDocReceptor: z.union([
      z.literal(80),
      z.literal(86),
      z.literal(87),
      z.literal(89),
      z.literal(90),
      z.literal(91),
      z.literal(96),
      z.literal(99),
    ]),
    numeroDocReceptor: z.string().regex(/^\d+$/, 'numeroDocReceptor must be all digits.'),
    fechaComprobante: z.string().regex(dateRegex, 'fechaComprobante must be YYYY-MM-DD.'),
    importeNeto: z.number().nonnegative(),
    iva: z.array(ivaItemSchema).optional(),
    importeTotal: z.number().nonnegative(),
    importeExento: z.number().nonnegative().optional(),
    importeNoGravado: z.number().nonnegative().optional(),
    servicio: z
      .object({
        fechaDesde: z.string().regex(dateRegex),
        fechaHasta: z.string().regex(dateRegex),
        fechaVencimientoPago: z.string().regex(dateRegex),
      })
      .optional(),
  })
  .superRefine((input, ctx) => {
    if (input.tipoComprobante === 11 && input.iva) {
      ctx.addIssue({
        code: 'custom',
        message: 'Factura C does not carry IVA; remove the iva array.',
      });
    }
    if ((input.tipoComprobante === 1 || input.tipoComprobante === 6) && !input.iva) {
      ctx.addIssue({
        code: 'custom',
        message: 'Factura A and B require an iva array.',
      });
    }
    if ((input.concepto === 2 || input.concepto === 3) && !input.servicio) {
      ctx.addIssue({
        code: 'custom',
        message: 'Concepto 2 or 3 requires service dates (fechaDesde, fechaHasta, fechaVencimientoPago).',
      });
    }
    if (input.concepto === 1 && input.servicio) {
      ctx.addIssue({
        code: 'custom',
        message: 'Concepto 1 (Productos) must not include service dates.',
      });
    }
  });

export const arcaEmitirFacturaTool: Tool = {
  name: 'arca_emitir_factura',
  description:
    'Emite una Factura A, B o C en ARCA (ex-AFIP) vía WSFE y devuelve el CAE. Si no se pasa numeroComprobante, el servidor consulta el último autorizado y usa el siguiente. Soporta concepto Productos, Servicios o ambos. Solo PESOS argentinos en V1.',
  inputSchema: {
    type: 'object',
    properties: {
      tipoComprobante: {
        type: 'number',
        enum: [1, 6, 11],
        description: '1 = Factura A, 6 = Factura B, 11 = Factura C.',
      },
      puntoVenta: { type: 'number', description: 'Punto de venta habilitado.' },
      numeroComprobante: {
        type: 'number',
        description: 'Optional. If absent, the server fetches last+1.',
      },
      concepto: {
        type: 'number',
        enum: [1, 2, 3],
        description: '1 = Productos, 2 = Servicios, 3 = Productos y Servicios.',
      },
      tipoDocReceptor: {
        type: 'number',
        enum: [80, 86, 87, 89, 90, 91, 96, 99],
        description:
          'Receiver document type. 80=CUIT, 86=CUIL, 87=CDI, 89=LE, 90=LC, 91=CI Extranjera, 96=DNI, 99=Consumidor Final.',
      },
      numeroDocReceptor: {
        type: 'string',
        description: 'Receiver document number. Use "0" for Consumidor Final.',
      },
      fechaComprobante: {
        type: 'string',
        description: 'YYYY-MM-DD.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      importeNeto: { type: 'number', description: 'ARS amount before IVA.' },
      iva: {
        type: 'array',
        description: 'Required for Factura A/B; forbidden for Factura C.',
        items: {
          type: 'object',
          properties: {
            alicuota: { type: 'string', enum: ['0', '2.5', '5', '10.5', '21', '27'] },
            baseImponible: { type: 'number' },
            importe: { type: 'number' },
          },
          required: ['alicuota', 'baseImponible', 'importe'],
        },
      },
      importeTotal: { type: 'number' },
      importeExento: { type: 'number' },
      importeNoGravado: { type: 'number' },
      servicio: {
        type: 'object',
        description: 'Required when concepto is 2 or 3.',
        properties: {
          fechaDesde: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          fechaHasta: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          fechaVencimientoPago: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
        required: ['fechaDesde', 'fechaHasta', 'fechaVencimientoPago'],
      },
    },
    required: [
      'tipoComprobante',
      'puntoVenta',
      'concepto',
      'tipoDocReceptor',
      'numeroDocReceptor',
      'fechaComprobante',
      'importeNeto',
      'importeTotal',
    ],
  },
};

export async function handleArcaEmitirFactura(
  config: ArcaConfig,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = inputSchema.parse(args) as EmitirFacturaInput;

  const numero = await resolveNumeroComprobante(input, config);
  const request = buildFeCaeRequest(input, config.cuit, numero);
  const result = await feCaeSolicitar(request, config);

  return {
    content: [{ type: 'text', text: formatResultadoEmision(result) }],
  };
}

async function resolveNumeroComprobante(
  input: EmitirFacturaInput,
  config: ArcaConfig,
): Promise<number> {
  if (input.numeroComprobante !== undefined) return input.numeroComprobante;
  const last = await feCompUltimoAutorizado(input.puntoVenta, input.tipoComprobante, config);
  return last.numero + 1;
}
