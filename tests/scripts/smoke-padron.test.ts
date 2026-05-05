import { describe, expect, it } from 'vitest';
import { formatPersonaSummary } from '../../scripts/smoke-padron.js';
import type { PersonaFisicaPadron, PersonaJuridicaPadron } from '../../src/padron/types.js';

const SECRET_NOMBRE = 'CARLOS ALBERTO';
const SECRET_APELLIDO = 'GONZALEZ-MARTINEZ';
const SECRET_RAZON_SOCIAL = 'CONFIDENTIAL TRADING SA';

function makeFisica(overrides: Partial<PersonaFisicaPadron> = {}): PersonaFisicaPadron {
  return {
    tipoPersona: 'FISICA',
    cuit: '20111111112',
    estadoClave: 'ACTIVO',
    nombre: SECRET_NOMBRE,
    apellido: SECRET_APELLIDO,
    domicilios: [
      {
        direccion: 'CALLE FALSA 123',
        localidad: 'CABA',
        codPostal: '1437',
        descripcionProvincia: 'CABA',
        tipoDomicilio: 'FISCAL',
        estado: 'ACTIVO',
      },
    ],
    actividades: [
      {
        idActividad: 620100,
        descripcionActividad: 'CONFIDENTIAL ACTIVITY DESCRIPTION',
        periodo: '202101',
        orden: 1,
        nomenclador: 883,
      },
      {
        idActividad: 620900,
        descripcionActividad: 'OTHER CONFIDENTIAL ACTIVITY',
        periodo: '202101',
        orden: 2,
        nomenclador: 883,
      },
    ],
    impuestos: [
      {
        idImpuesto: 20,
        descripcionImpuesto: 'CONFIDENTIAL TAX A',
        periodo: '202101',
        estado: 'ACTIVO',
      },
      {
        idImpuesto: 21,
        descripcionImpuesto: 'CONFIDENTIAL TAX B',
        periodo: '202101',
        estado: 'ACTIVO',
      },
      {
        idImpuesto: 22,
        descripcionImpuesto: 'CONFIDENTIAL TAX C',
        periodo: '202101',
        estado: 'BAJA',
      },
    ],
    categoriaMonotributo: {
      descripcionCategoria: 'MONOTRIBUTO CATEGORÍA B',
      periodo: '202401',
    },
    ...overrides,
  };
}

function makeJuridica(overrides: Partial<PersonaJuridicaPadron> = {}): PersonaJuridicaPadron {
  return {
    tipoPersona: 'JURIDICA',
    cuit: '30711111119',
    estadoClave: 'ACTIVO',
    razonSocial: SECRET_RAZON_SOCIAL,
    domicilios: [],
    actividades: [],
    impuestos: [],
    categoriaMonotributo: null,
    ...overrides,
  };
}

describe('formatPersonaSummary', () => {
  it('starts with the "Persona retrieved:" header line', () => {
    const lines = formatPersonaSummary(makeFisica());
    expect(lines[0]).toBe('Persona retrieved:');
  });

  it('formats persona física with length-redacted nombre and apellido', () => {
    const lines = formatPersonaSummary(makeFisica());
    const joined = lines.join('\n');
    expect(joined).toMatch(/nombre:\s+\(\d+ chars, redacted\)/);
    expect(joined).toMatch(/apellido:\s+\(\d+ chars, redacted\)/);
    expect(joined).toContain(`(${SECRET_NOMBRE.length} chars, redacted)`);
    expect(joined).toContain(`(${SECRET_APELLIDO.length} chars, redacted)`);
  });

  it('formats persona jurídica with length-redacted razonSocial', () => {
    const lines = formatPersonaSummary(makeJuridica());
    const joined = lines.join('\n');
    expect(joined).toMatch(/razonSocial:\s+\(\d+ chars, redacted\)/);
    expect(joined).toContain(`(${SECRET_RAZON_SOCIAL.length} chars, redacted)`);
    expect(joined).not.toMatch(/nombre:/);
    expect(joined).not.toMatch(/apellido:/);
  });

  it('redacts the entire nombre even if it is a single character', () => {
    const lines = formatPersonaSummary(makeFisica({ nombre: 'X', apellido: 'Y' }));
    const joined = lines.join('\n');
    expect(joined).toContain('(1 chars, redacted)');
    expect(joined).not.toMatch(/nombre:\s+X/);
    expect(joined).not.toMatch(/apellido:\s+Y/);
  });

  it('reports correct counts for domicilios, actividades, impuestos', () => {
    const persona = makeFisica();
    const lines = formatPersonaSummary(persona);
    const joined = lines.join('\n');
    expect(joined).toMatch(/domicilios:\s+1\b/);
    expect(joined).toMatch(/actividades:\s+2\b/);
    expect(joined).toMatch(/impuestos:\s+3\b/);
  });

  it('reports tipoPersona and cuit and estadoClave verbatim', () => {
    const lines = formatPersonaSummary(makeFisica());
    const joined = lines.join('\n');
    expect(joined).toMatch(/tipoPersona:\s+FISICA/);
    expect(joined).toMatch(/cuit:\s+20111111112/);
    expect(joined).toMatch(/estadoClave:\s+ACTIVO/);
  });

  it('reports monotributo as "yes (<categoría>)" when present', () => {
    const lines = formatPersonaSummary(makeFisica());
    const joined = lines.join('\n');
    expect(joined).toMatch(/monotributo:\s+yes\s*\([^)]+\)/);
  });

  it('reports monotributo as "no" when categoriaMonotributo is null', () => {
    const lines = formatPersonaSummary(makeJuridica());
    const joined = lines.join('\n');
    expect(joined).toMatch(/monotributo:\s+no\b/);
  });

  it('never includes the literal nombre, apellido, or razonSocial values', () => {
    const fisicaLines = formatPersonaSummary(makeFisica());
    const fisicaJoined = fisicaLines.join('\n');
    expect(fisicaJoined).not.toContain(SECRET_NOMBRE);
    expect(fisicaJoined).not.toContain(SECRET_APELLIDO);

    const juridicaLines = formatPersonaSummary(makeJuridica());
    const juridicaJoined = juridicaLines.join('\n');
    expect(juridicaJoined).not.toContain(SECRET_RAZON_SOCIAL);
  });

  it('never includes any actividad description or impuesto description', () => {
    const lines = formatPersonaSummary(makeFisica());
    const joined = lines.join('\n');
    expect(joined).not.toContain('CONFIDENTIAL ACTIVITY DESCRIPTION');
    expect(joined).not.toContain('OTHER CONFIDENTIAL ACTIVITY');
    expect(joined).not.toContain('CONFIDENTIAL TAX A');
    expect(joined).not.toContain('CONFIDENTIAL TAX B');
    expect(joined).not.toContain('CONFIDENTIAL TAX C');
  });

  it('never includes any domicilio direccion or localidad string', () => {
    const lines = formatPersonaSummary(makeFisica());
    const joined = lines.join('\n');
    expect(joined).not.toContain('CALLE FALSA 123');
    expect(joined).not.toContain('CABA');
    expect(joined).not.toContain('1437');
  });
});
