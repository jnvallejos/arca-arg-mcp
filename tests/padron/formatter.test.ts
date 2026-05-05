import { describe, expect, it } from 'vitest';
import { formatPersonaForUser } from '../../src/padron/formatter.js';
import type { PersonaFisicaPadron, PersonaJuridicaPadron } from '../../src/padron/types.js';

function makeFisica(overrides: Partial<PersonaFisicaPadron> = {}): PersonaFisicaPadron {
  return {
    tipoPersona: 'FISICA',
    cuit: '20111111112',
    estadoClave: 'ACTIVO',
    nombre: 'JUAN',
    apellido: 'PEREZ',
    tipoDocumento: 'DNI',
    numeroDocumento: '11111111',
    fechaNacimiento: '1990-01-15',
    mesCierre: 12,
    domicilios: [
      {
        direccion: 'CALLE FALSA 123',
        localidad: 'CABA',
        codPostal: '1437',
        descripcionProvincia: 'CIUDAD AUTONOMA DE BUENOS AIRES',
        tipoDomicilio: 'FISCAL',
        estado: 'ACTIVO',
      },
    ],
    actividades: [
      {
        idActividad: 620100,
        descripcionActividad: 'SERVICIOS DE CONSULTORES EN INFORMATICA',
        periodo: '202101',
        orden: 1,
        nomenclador: 883,
      },
    ],
    impuestos: [
      {
        idImpuesto: 20,
        descripcionImpuesto: 'GANANCIAS PERSONAS FISICAS',
        periodo: '202101',
        estado: 'ACTIVO',
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
    razonSocial: 'ACME SA',
    fechaContratoSocial: '2010-03-01',
    mesCierre: 6,
    domicilios: [
      {
        direccion: 'AV CORRIENTES 1234',
        localidad: 'CABA',
        codPostal: '1043',
        descripcionProvincia: 'CIUDAD AUTONOMA DE BUENOS AIRES',
        tipoDomicilio: 'FISCAL',
        estado: 'ACTIVO',
      },
    ],
    actividades: [
      {
        idActividad: 620100,
        descripcionActividad: 'SERVICIOS DE CONSULTORES EN INFORMATICA',
        periodo: '202001',
        orden: 1,
        nomenclador: 883,
      },
      {
        idActividad: 620900,
        descripcionActividad: 'SERVICIOS DE INFORMATICA NCP',
        periodo: '202001',
        orden: 2,
        nomenclador: 883,
      },
    ],
    impuestos: [
      {
        idImpuesto: 30,
        descripcionImpuesto: 'IVA',
        periodo: '202001',
        estado: 'ACTIVO',
      },
      {
        idImpuesto: 11,
        descripcionImpuesto: 'GANANCIAS PERSONAS JURIDICAS',
        periodo: '202001',
        estado: 'ACTIVO',
      },
    ],
    categoriaMonotributo: null,
    ...overrides,
  };
}

describe('formatPersonaForUser', () => {
  it('formats persona física monotributista with all sections', () => {
    const out = formatPersonaForUser(makeFisica());
    expect(out).toContain('CUIT: 20-11111111-2 (ACTIVO)');
    expect(out).toContain('Tipo: Persona física');
    expect(out).toMatch(/Nombre:\s+Juan Perez/);
    expect(out).toContain('Categoría: Monotributo Categoría B (período 202401)');
    expect(out).toContain('Domicilio fiscal:');
    expect(out).toContain('Calle Falsa 123');
    expect(out).toContain('Actividades:');
    expect(out).toContain('620100');
    expect(out).toContain('Impuestos activos:');
    expect(out).toContain('Ganancias Personas Fisicas');
  });

  it('formats persona jurídica RI with the Responsable Inscripto label and no monotributo section', () => {
    const out = formatPersonaForUser(makeJuridica());
    expect(out).toContain('Tipo: Persona jurídica (Responsable Inscripto)');
    expect(out).toContain('Razón social: Acme Sa');
    expect(out).not.toContain('Categoría:');
    expect(out).not.toContain('Monotributo');
  });

  it('formats CUIT with dashes (XX-XXXXXXXX-X)', () => {
    const fisica = formatPersonaForUser(makeFisica());
    expect(fisica).toContain('20-11111111-2');
    const juridica = formatPersonaForUser(makeJuridica());
    expect(juridica).toContain('30-71111111-9');
  });

  it('capitalizes names from ALL CAPS to Title Case', () => {
    const out = formatPersonaForUser(makeFisica({ nombre: 'JUAN CARLOS', apellido: 'GARCIA' }));
    expect(out).toContain('Juan Carlos Garcia');
    expect(out).not.toContain('JUAN CARLOS GARCIA');
  });

  it('shows BAJA status prominently when estadoClave is BAJA', () => {
    const baja = makeFisica({
      estadoClave: 'BAJA',
      categoriaMonotributo: null,
      domicilios: [],
      actividades: [],
      impuestos: [],
    });
    const out = formatPersonaForUser(baja);
    expect(out).toContain('BAJA');
    const firstLine = out.split('\n')[0];
    expect(firstLine).toMatch(/baja/i);
  });

  it('handles missing optional fields gracefully (no "undefined" in output)', () => {
    const minimal = makeFisica({
      tipoDocumento: undefined,
      numeroDocumento: undefined,
      fechaNacimiento: undefined,
      mesCierre: undefined,
      domicilios: [],
      actividades: [],
      impuestos: [],
      categoriaMonotributo: null,
    });
    const out = formatPersonaForUser(minimal);
    expect(out).not.toMatch(/undefined/i);
    expect(out).not.toMatch(/null/);
  });

  it('uses ARG locale (DD/MM/YYYY) for fechaNacimiento and fechaContratoSocial', () => {
    const fisica = formatPersonaForUser(makeFisica());
    expect(fisica).toContain('15/01/1990');
    expect(fisica).not.toContain('1990-01-15');

    const juridica = formatPersonaForUser(makeJuridica());
    expect(juridica).toContain('01/03/2010');
    expect(juridica).not.toContain('2010-03-01');
  });

  it('lists every actividad with id and description', () => {
    const out = formatPersonaForUser(makeJuridica());
    expect(out).toContain('620100');
    expect(out).toContain('Servicios De Consultores En Informatica');
    expect(out).toContain('620900');
    expect(out).toContain('Servicios De Informatica Ncp');
  });

  it('only lists active impuestos in the "Impuestos activos" section', () => {
    const persona = makeJuridica({
      impuestos: [
        {
          idImpuesto: 30,
          descripcionImpuesto: 'IVA',
          periodo: '202001',
          estado: 'ACTIVO',
        },
        {
          idImpuesto: 99,
          descripcionImpuesto: 'IMPUESTO INACTIVO',
          periodo: '201801',
          estado: 'BAJA',
        },
      ],
    });
    const out = formatPersonaForUser(persona);
    expect(out).toContain('IVA');
    expect(out).not.toContain('Impuesto Inactivo');
  });
});
