import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePadronResponse } from '../../src/padron/parser.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const fisica = readFileSync(join(FIXTURES, 'padron-persona-fisica-monotributo.xml'), 'utf-8');
const juridica = readFileSync(join(FIXTURES, 'padron-persona-juridica-ri.xml'), 'utf-8');
const cancelada = readFileSync(join(FIXTURES, 'padron-persona-cancelada.xml'), 'utf-8');

describe('parsePadronResponse', () => {
  it('parses a persona física monotributista correctly', () => {
    const persona = parsePadronResponse(fisica);
    expect(persona.tipoPersona).toBe('FISICA');
    if (persona.tipoPersona !== 'FISICA') return;
    expect(persona.cuit).toBe('20111111112');
    expect(persona.estadoClave).toBe('ACTIVO');
    expect(persona.nombre).toBe('JUAN');
    expect(persona.apellido).toBe('PEREZ');
    expect(persona.tipoDocumento).toBe('DNI');
    expect(persona.numeroDocumento).toBe('11111111');
    expect(persona.fechaNacimiento).toBe('1990-01-15');
    expect(persona.mesCierre).toBe(12);
    expect(persona.categoriaMonotributo).not.toBeNull();
    expect(persona.categoriaMonotributo?.descripcionCategoria).toBe('MONOTRIBUTO CATEGORIA B');
    expect(persona.categoriaMonotributo?.periodo).toBe('202401');
  });

  it('parses a persona jurídica RI correctly', () => {
    const persona = parsePadronResponse(juridica);
    expect(persona.tipoPersona).toBe('JURIDICA');
    if (persona.tipoPersona !== 'JURIDICA') return;
    expect(persona.cuit).toBe('30711111119');
    expect(persona.razonSocial).toBe('ACME SA');
    expect(persona.fechaContratoSocial).toBe('2010-03-01');
    expect(persona.mesCierre).toBe(6);
    expect(persona.estadoClave).toBe('ACTIVO');
  });

  it('parses a persona with multiple actividades', () => {
    const persona = parsePadronResponse(juridica);
    expect(persona.actividades).toHaveLength(3);
    expect(persona.actividades[0].idActividad).toBe(620100);
    expect(persona.actividades[1].idActividad).toBe(620900);
    expect(persona.actividades[2].idActividad).toBe(631110);
  });

  it('parses a persona with multiple impuestos', () => {
    const persona = parsePadronResponse(juridica);
    expect(persona.impuestos).toHaveLength(3);
    const ids = persona.impuestos.map((i) => i.idImpuesto);
    expect(ids).toContain(30);
    expect(ids).toContain(11);
    expect(ids).toContain(301);
  });

  it('parses a persona with no categoriaMonotributo (RI case)', () => {
    const persona = parsePadronResponse(juridica);
    expect(persona.categoriaMonotributo).toBeNull();
  });

  it('handles single-element actividad as array', () => {
    const persona = parsePadronResponse(fisica);
    expect(Array.isArray(persona.actividades)).toBe(true);
    expect(persona.actividades).toHaveLength(1);
    expect(persona.actividades[0].idActividad).toBe(620100);
    expect(persona.actividades[0].descripcionActividad).toContain('CONSULTORES EN INFORMATICA');
    expect(persona.actividades[0].periodo).toBe('202101');
    expect(persona.actividades[0].orden).toBe(1);
    expect(persona.actividades[0].nomenclador).toBe(883);
  });

  it('handles single-element impuesto as array', () => {
    const persona = parsePadronResponse(fisica);
    expect(Array.isArray(persona.impuestos)).toBe(true);
    expect(persona.impuestos).toHaveLength(1);
    expect(persona.impuestos[0].idImpuesto).toBe(20);
    expect(persona.impuestos[0].descripcionImpuesto).toBe('GANANCIAS PERSONAS FISICAS');
    expect(persona.impuestos[0].estado).toBe('ACTIVO');
  });

  it('handles single-element domicilio as array', () => {
    const persona = parsePadronResponse(fisica);
    expect(Array.isArray(persona.domicilios)).toBe(true);
    expect(persona.domicilios).toHaveLength(1);
    expect(persona.domicilios[0].direccion).toBe('CALLE FALSA 123');
    expect(persona.domicilios[0].localidad).toBe('CABA');
    expect(persona.domicilios[0].codPostal).toBe('1437');
    expect(persona.domicilios[0].tipoDomicilio).toBe('FISCAL');
    expect(persona.domicilios[0].estado).toBe('ACTIVO');
  });

  it('parses a persona with estadoClave BAJA and minimal optional fields', () => {
    const persona = parsePadronResponse(cancelada);
    expect(persona.tipoPersona).toBe('FISICA');
    expect(persona.estadoClave).toBe('BAJA');
    expect(persona.domicilios).toEqual([]);
    expect(persona.actividades).toEqual([]);
    expect(persona.impuestos).toEqual([]);
    expect(persona.categoriaMonotributo).toBeNull();
  });

  it('throws on malformed XML', () => {
    expect(() => parsePadronResponse('<not valid xml')).toThrow(/parse|xml/i);
  });

  it('throws on missing required field (idPersona)', () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body><ns2:getPersonaResponse xmlns:ns2="x"><personaReturn><persona>' +
      '<tipoPersona>FISICA</tipoPersona><estadoClave>ACTIVO</estadoClave>' +
      '<nombre>JOHN</nombre><apellido>DOE</apellido>' +
      '</persona></personaReturn></ns2:getPersonaResponse></soap:Body></soap:Envelope>';
    expect(() => parsePadronResponse(xml)).toThrow();
  });

  it('throws on unknown tipoPersona value', () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body><ns2:getPersonaResponse xmlns:ns2="x"><personaReturn><persona>' +
      '<idPersona>20111111112</idPersona><tipoPersona>ALIEN</tipoPersona>' +
      '<estadoClave>ACTIVO</estadoClave><nombre>X</nombre><apellido>Y</apellido>' +
      '</persona></personaReturn></ns2:getPersonaResponse></soap:Body></soap:Envelope>';
    expect(() => parsePadronResponse(xml)).toThrow();
  });

  it('preserves field-level data fidelity for the persona física fixture', () => {
    const persona = parsePadronResponse(fisica);
    expect(persona).toEqual({
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
          descripcionActividad:
            'SERVICIOS DE CONSULTORES EN INFORMATICA Y SUMINISTROS DE PROGRAMAS DE INFORMATICA',
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
        descripcionCategoria: 'MONOTRIBUTO CATEGORIA B',
        periodo: '202401',
      },
    });
  });
});
