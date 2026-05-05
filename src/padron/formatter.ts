import type {
  ActividadPadron,
  CategoriaMonotributo,
  DomicilioPadron,
  EstadoClave,
  ImpuestoPadron,
  PersonaPadron,
} from './types.js';

/**
 * Formats a {@link PersonaPadron} as a human-readable plain-text block.
 * Used by the `arca_consultar_cuit` tool. Layout rules are documented in
 * `docs/phase-2-spec.md` §5.4.
 */
export function formatPersonaForUser(persona: PersonaPadron): string {
  const lines: string[] = [];

  if (persona.estadoClave !== 'ACTIVO') {
    lines.push(`[!] Persona ${baStateLabel(persona.estadoClave)} en ARCA.`);
    lines.push('');
  }

  lines.push(`CUIT: ${formatCuit(persona.cuit)} (${persona.estadoClave})`);
  lines.push(`Tipo: ${formatTipoLabel(persona)}`);

  if (persona.tipoPersona === 'FISICA') {
    const fullName = titleCase(`${persona.nombre} ${persona.apellido}`.trim());
    if (fullName) {
      lines.push(`Nombre: ${fullName}`);
    }
    if (persona.fechaNacimiento) {
      lines.push(`Fecha de nacimiento: ${formatArgDate(persona.fechaNacimiento)}`);
    }
  } else {
    if (persona.razonSocial) {
      lines.push(`Razón social: ${titleCase(persona.razonSocial)}`);
    }
    if (persona.fechaContratoSocial) {
      lines.push(`Fecha de contrato social: ${formatArgDate(persona.fechaContratoSocial)}`);
    }
  }

  if (persona.categoriaMonotributo) {
    lines.push(formatCategoria(persona.categoriaMonotributo));
  }

  const fiscal = pickFiscalDomicilio(persona.domicilios);
  if (fiscal) {
    lines.push('');
    lines.push('Domicilio fiscal:');
    lines.push(`  ${titleCase(fiscal.direccion)}`);
    lines.push(`  ${titleCase(fiscal.localidad)}${formatCp(fiscal.codPostal)}`);
  }

  if (persona.actividades.length > 0) {
    lines.push('');
    lines.push('Actividades:');
    for (const a of persona.actividades) {
      lines.push(`  - ${formatActividad(a)}`);
    }
  }

  const activeImpuestos = persona.impuestos.filter((i) => i.estado === 'ACTIVO');
  if (activeImpuestos.length > 0) {
    lines.push('');
    lines.push('Impuestos activos:');
    for (const i of activeImpuestos) {
      lines.push(`  - ${formatImpuesto(i)}`);
    }
  }

  return lines.join('\n');
}

function formatCuit(cuit: string): string {
  if (!/^\d{11}$/.test(cuit)) return cuit;
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

function baStateLabel(state: EstadoClave): string {
  if (state === 'BAJA') return 'dada de BAJA';
  return `en estado ${state}`;
}

function formatTipoLabel(persona: PersonaPadron): string {
  const base = persona.tipoPersona === 'FISICA' ? 'Persona física' : 'Persona jurídica';
  if (isResponsableInscripto(persona)) {
    return `${base} (Responsable Inscripto)`;
  }
  return base;
}

function isResponsableInscripto(persona: PersonaPadron): boolean {
  if (persona.categoriaMonotributo) return false;
  return persona.impuestos.some(
    (i) => /\bIVA\b/i.test(i.descripcionImpuesto) && i.estado === 'ACTIVO',
  );
}

function formatCategoria(c: CategoriaMonotributo): string {
  return `Categoría: ${titleCase(c.descripcionCategoria)} (período ${c.periodo})`;
}

function pickFiscalDomicilio(domicilios: DomicilioPadron[]): DomicilioPadron | undefined {
  return domicilios.find((d) => d.tipoDomicilio.toUpperCase() === 'FISCAL') ?? domicilios[0];
}

function formatCp(codPostal: string): string {
  if (!codPostal) return '';
  return ` (CP ${codPostal})`;
}

function formatActividad(a: ActividadPadron): string {
  const desc = titleCase(a.descripcionActividad);
  return `${a.idActividad} — ${desc} (desde ${a.periodo})`;
}

function formatImpuesto(i: ImpuestoPadron): string {
  return `${titleCase(i.descripcionImpuesto)} (desde ${i.periodo})`;
}

const TITLE_CASE_KEEP_UPPER = new Set(['IVA']);

function titleCase(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      const upper = word.toUpperCase();
      if (TITLE_CASE_KEEP_UPPER.has(upper)) return upper;
      if (word.length === 0) return word;
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function formatArgDate(input: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!match) return input;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
