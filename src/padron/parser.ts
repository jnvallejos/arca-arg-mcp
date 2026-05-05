import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { PadronError } from '../lib/errors.js';
import type {
  ActividadPadron,
  CategoriaMonotributo,
  DomicilioPadron,
  ImpuestoPadron,
  PersonaPadron,
} from './types.js';

const ARRAY_TAGS = new Set(['actividad', 'impuesto', 'domicilio']);

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

const estadoClaveSchema = z.enum(['ACTIVO', 'INACTIVO', 'BAJA']);
const estadoImpuestoSchema = z.enum(['ACTIVO', 'INACTIVO', 'BAJA']);
const tipoPersonaSchema = z.enum(['FISICA', 'JURIDICA']);

const actividadSchema = z.object({
  idActividad: z.number().int(),
  descripcionActividad: z.string(),
  periodo: z.string(),
  orden: z.number().int(),
  nomenclador: z.number().int(),
});

const impuestoSchema = z.object({
  idImpuesto: z.number().int(),
  descripcionImpuesto: z.string(),
  periodo: z.string(),
  estado: estadoImpuestoSchema,
});

const domicilioSchema = z.object({
  direccion: z.string(),
  localidad: z.string(),
  codPostal: z.string(),
  descripcionProvincia: z.string(),
  tipoDomicilio: z.string(),
  estado: z.string(),
});

const categoriaSchema = z.object({
  descripcionCategoria: z.string(),
  periodo: z.string(),
});

const personaFisicaSchema = z.object({
  tipoPersona: z.literal('FISICA'),
  cuit: z.string().regex(/^\d{11}$/),
  estadoClave: estadoClaveSchema,
  nombre: z.string(),
  apellido: z.string(),
  tipoDocumento: z.string().optional(),
  numeroDocumento: z.string().optional(),
  fechaNacimiento: z.string().optional(),
  mesCierre: z.number().int().optional(),
  domicilios: z.array(domicilioSchema),
  actividades: z.array(actividadSchema),
  impuestos: z.array(impuestoSchema),
  categoriaMonotributo: categoriaSchema.nullable(),
});

const personaJuridicaSchema = z.object({
  tipoPersona: z.literal('JURIDICA'),
  cuit: z.string().regex(/^\d{11}$/),
  estadoClave: estadoClaveSchema,
  razonSocial: z.string(),
  fechaContratoSocial: z.string().optional(),
  mesCierre: z.number().int().optional(),
  domicilios: z.array(domicilioSchema),
  actividades: z.array(actividadSchema),
  impuestos: z.array(impuestoSchema),
  categoriaMonotributo: categoriaSchema.nullable(),
});

const personaSchema = z.discriminatedUnion('tipoPersona', [
  personaFisicaSchema,
  personaJuridicaSchema,
]);

interface RawPersona {
  idPersona?: string;
  tipoPersona?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  fechaNacimiento?: string;
  fechaContratoSocial?: string;
  mesCierre?: string;
  domicilio?: RawDomicilio[];
  actividad?: RawActividad[];
  impuesto?: RawImpuesto[];
  categoria?: RawCategoria;
}

interface RawDomicilio {
  direccion?: string;
  localidad?: string;
  codPostal?: string;
  descripcionProvincia?: string;
  tipoDomicilio?: string;
  estado?: string;
}

interface RawActividad {
  idActividad?: string;
  descripcionActividad?: string;
  periodo?: string;
  orden?: string;
  nomenclador?: string;
}

interface RawImpuesto {
  idImpuesto?: string;
  descripcionImpuesto?: string;
  periodo?: string;
  estado?: string;
}

interface RawCategoria {
  descripcionCategoria?: string;
  periodo?: string;
}

/**
 * Parses a Padrón A13 SOAP response (or its inner persona payload) into a
 * strongly-typed {@link PersonaPadron}. Throws {@link PadronError} for
 * malformed XML, missing required fields, or unknown discriminator values.
 */
export function parsePadronResponse(xml: string): PersonaPadron {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (err) {
    throw new PadronError(
      'UNKNOWN',
      `Could not parse Padrón response XML: ${(err as Error).message}`,
    );
  }

  const raw = findPersona(parsed);
  if (!raw) {
    throw new PadronError('UNKNOWN', 'Padrón response did not contain a <persona> element.');
  }

  const tipoPersona = tipoPersonaSchema.safeParse(raw.tipoPersona);
  if (!tipoPersona.success) {
    throw new PadronError(
      'UNKNOWN',
      `Padrón response has unknown or missing tipoPersona: ${String(raw.tipoPersona)}`,
    );
  }

  const candidate =
    tipoPersona.data === 'FISICA' ? buildPersonaFisica(raw) : buildPersonaJuridica(raw);

  const result = personaSchema.safeParse(candidate);
  if (!result.success) {
    throw new PadronError('UNKNOWN', `Padrón response failed validation: ${result.error.message}`);
  }
  return result.data;
}

function findPersona(node: unknown): RawPersona | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (isPersonaShape(obj)) {
    return obj as RawPersona;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'persona') {
      const found = obj[key];
      if (found && typeof found === 'object') {
        return found as RawPersona;
      }
    }
    const child = obj[key];
    if (child && typeof child === 'object') {
      const found = findPersona(child);
      if (found) return found;
    }
  }
  return null;
}

function isPersonaShape(obj: Record<string, unknown>): boolean {
  return typeof obj.idPersona === 'string' && typeof obj.tipoPersona === 'string';
}

function buildPersonaFisica(raw: RawPersona) {
  return {
    tipoPersona: 'FISICA' as const,
    cuit: raw.idPersona ?? '',
    estadoClave: raw.estadoClave,
    nombre: raw.nombre ?? '',
    apellido: raw.apellido ?? '',
    tipoDocumento: raw.tipoDocumento,
    numeroDocumento: raw.numeroDocumento,
    fechaNacimiento: raw.fechaNacimiento,
    mesCierre: parseOptionalInt(raw.mesCierre),
    domicilios: mapDomicilios(raw.domicilio),
    actividades: mapActividades(raw.actividad),
    impuestos: mapImpuestos(raw.impuesto),
    categoriaMonotributo: mapCategoria(raw.categoria),
  };
}

function buildPersonaJuridica(raw: RawPersona) {
  return {
    tipoPersona: 'JURIDICA' as const,
    cuit: raw.idPersona ?? '',
    estadoClave: raw.estadoClave,
    razonSocial: raw.razonSocial ?? '',
    fechaContratoSocial: raw.fechaContratoSocial,
    mesCierre: parseOptionalInt(raw.mesCierre),
    domicilios: mapDomicilios(raw.domicilio),
    actividades: mapActividades(raw.actividad),
    impuestos: mapImpuestos(raw.impuesto),
    categoriaMonotributo: mapCategoria(raw.categoria),
  };
}

function mapDomicilios(raw: RawDomicilio[] | undefined): DomicilioPadron[] {
  if (!raw) return [];
  return raw.map((d) => ({
    direccion: d.direccion ?? '',
    localidad: d.localidad ?? '',
    codPostal: d.codPostal ?? '',
    descripcionProvincia: d.descripcionProvincia ?? '',
    tipoDomicilio: d.tipoDomicilio ?? '',
    estado: d.estado ?? '',
  }));
}

function mapActividades(raw: RawActividad[] | undefined): ActividadPadron[] {
  if (!raw) return [];
  return raw.map((a) => ({
    idActividad: parseInt10(a.idActividad),
    descripcionActividad: a.descripcionActividad ?? '',
    periodo: a.periodo ?? '',
    orden: parseInt10(a.orden),
    nomenclador: parseInt10(a.nomenclador),
  }));
}

function mapImpuestos(raw: RawImpuesto[] | undefined): ImpuestoPadron[] {
  if (!raw) return [];
  return raw.map((i) => ({
    idImpuesto: parseInt10(i.idImpuesto),
    descripcionImpuesto: i.descripcionImpuesto ?? '',
    periodo: i.periodo ?? '',
    estado: (i.estado ?? '') as ImpuestoPadron['estado'],
  }));
}

function mapCategoria(raw: RawCategoria | undefined): CategoriaMonotributo | null {
  if (!raw || !raw.descripcionCategoria) return null;
  return {
    descripcionCategoria: raw.descripcionCategoria,
    periodo: raw.periodo ?? '',
  };
}

function parseInt10(value: string | undefined): number {
  if (value === undefined || value === '') return Number.NaN;
  return Number.parseInt(value, 10);
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}
