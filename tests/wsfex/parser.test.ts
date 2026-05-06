import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WsfexError } from '../../src/lib/errors.js';
import {
  parseFexAuthorizeResponse,
  parseFexGetCmpResponse,
  parseFexGetLastCmpResponse,
  parseFexGetParamCtzResponse,
} from '../../src/wsfex/parser.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const success = readFileSync(join(FIXTURES, 'wsfex-authorize-success.xml'), 'utf-8');
const rejected = readFileSync(join(FIXTURES, 'wsfex-authorize-rejected.xml'), 'utf-8');
const errorValid = readFileSync(join(FIXTURES, 'wsfex-authorize-error-validacion.xml'), 'utf-8');
const getCmpFound = readFileSync(join(FIXTURES, 'wsfex-getcmp-found.xml'), 'utf-8');
const getCmpNotFound = readFileSync(join(FIXTURES, 'wsfex-getcmp-not-found.xml'), 'utf-8');
const getLast = readFileSync(join(FIXTURES, 'wsfex-getlastcmp.xml'), 'utf-8');
const getCtz = readFileSync(join(FIXTURES, 'wsfex-getparam-ctz.xml'), 'utf-8');

describe('parseFexAuthorizeResponse', () => {
  it('parses Resultado=A into a ComprobanteExportacionAutorizado', () => {
    const r = parseFexAuthorizeResponse(success);
    expect(r.status).toBe('aprobado');
    if (r.status !== 'aprobado') return;
    expect(r.cae).toBe('75000000000000');
    expect(r.fechaVencimientoCae).toBe('2026-04-25');
    expect(r.numeroComprobante).toBe(123);
    expect(r.tipoComprobante).toBe(19);
    expect(r.puntoVenta).toBe(1);
    expect(r.fechaComprobante).toBe('2026-04-15');
  });

  it('does not assign importeTotal/moneda/cotizacion on a successful response', () => {
    // FEXAuthorize response does not echo Imp_total / Moneda / Moneda_ctz —
    // the client is responsible for stamping those from the original request.
    const r = parseFexAuthorizeResponse(success);
    expect(r.status).toBe('aprobado');
    expect('importeTotal' in r).toBe(false);
    expect('moneda' in r).toBe(false);
    expect('cotizacion' in r).toBe(false);
  });

  it('parses Resultado=R into ComprobanteExportacionRechazado without throwing', () => {
    const r = parseFexAuthorizeResponse(rejected);
    expect(r.status).toBe('rechazado');
    if (r.status !== 'rechazado') return;
    expect(r.numeroComprobante).toBe(124);
    expect(r.tipoComprobante).toBe(19);
    expect(r.puntoVenta).toBe(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].code).toBe(500);
    expect(r.errores[0].message).toContain('número de comprobante');
  });

  it('parses multiple errores from a validation-failed response', () => {
    const r = parseFexAuthorizeResponse(errorValid);
    expect(r.status).toBe('rechazado');
    if (r.status !== 'rechazado') return;
    expect(r.errores).toHaveLength(2);
    const codes = r.errores.map((e) => e.code).sort();
    expect(codes).toEqual([607, 650]);
  });

  it('throws WsfexError when the XML is unparseable', () => {
    expect(() => parseFexAuthorizeResponse('<not valid')).toThrow(WsfexError);
  });

  it('throws WsfexError when the response lacks FEXResultAuth', () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body><FEXAuthorizeResponse><FEXAuthorizeResult></FEXAuthorizeResult>' +
      '</FEXAuthorizeResponse></soap:Body></soap:Envelope>';
    expect(() => parseFexAuthorizeResponse(xml)).toThrow(WsfexError);
  });
});

describe('parseFexGetLastCmpResponse', () => {
  it('parses an existing last-number response', () => {
    const r = parseFexGetLastCmpResponse(getLast);
    expect(r.puntoVenta).toBe(1);
    expect(r.tipoComprobante).toBe(19);
    expect(r.numero).toBe(122);
  });

  it('returns numero=0 when Cbte_nro is 0 (no comprobantes yet)', () => {
    const xml = getLast.replace('<Cbte_nro>122</Cbte_nro>', '<Cbte_nro>0</Cbte_nro>');
    const r = parseFexGetLastCmpResponse(xml);
    expect(r.numero).toBe(0);
  });

  it('throws WsfexError when the response is malformed', () => {
    expect(() => parseFexGetLastCmpResponse('<bad')).toThrow(WsfexError);
  });
});

describe('parseFexGetCmpResponse', () => {
  it('parses a found comprobante with all key fields', () => {
    const r = parseFexGetCmpResponse(getCmpFound);
    expect(r.numeroComprobante).toBe(123);
    expect(r.tipoComprobante).toBe(19);
    expect(r.puntoVenta).toBe(1);
    expect(r.fechaComprobante).toBe('2026-04-15');
    expect(r.cae).toBe('75000000000000');
    expect(r.fechaVencimientoCae).toBe('2026-04-25');
    expect(r.importeTotal).toBe(100);
    expect(r.moneda).toBe('DOL');
    expect(r.cotizacion).toBe(1180.5);
    expect(r.destinoPais).toBe(200);
    expect(r.cliente.nombre).toBe('TEST CLIENT INC');
    expect(r.cliente.domicilio).toBe('123 Main St, NY, USA');
    expect(r.cliente.idImpositivoExterior).toBe('TEST-EIN-12345');
  });

  it('parses items into a populated array', () => {
    const r = parseFexGetCmpResponse(getCmpFound);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].codigoProducto).toBe('TEST-001');
    expect(r.items[0].descripcion).toBe('Consulting services');
    expect(r.items[0].cantidad).toBe(1);
    expect(r.items[0].unidadMedida).toBe(7);
    expect(r.items[0].precioUnitario).toBe(100);
    expect(r.items[0].importeTotal).toBe(100);
  });

  it('throws WsfexError(NOT_FOUND) when ARCA reports the comprobante does not exist', () => {
    expect(() => parseFexGetCmpResponse(getCmpNotFound)).toThrow(WsfexError);
    try {
      parseFexGetCmpResponse(getCmpNotFound);
    } catch (err) {
      expect(err).toBeInstanceOf(WsfexError);
      expect((err as WsfexError).code).toBe('NOT_FOUND');
    }
  });

  it('throws WsfexError when the response is malformed', () => {
    expect(() => parseFexGetCmpResponse('<bad')).toThrow(WsfexError);
  });
});

describe('parseFexGetParamCtzResponse', () => {
  it('parses moneda, cotización, and fecha', () => {
    const r = parseFexGetParamCtzResponse(getCtz);
    expect(r.moneda).toBe('DOL');
    expect(r.cotizacion).toBe(1180.5);
    expect(r.fechaCotizacion).toBe('2026-04-15');
  });

  it('throws WsfexError when the response is malformed', () => {
    expect(() => parseFexGetParamCtzResponse('<bad')).toThrow(WsfexError);
  });

  it('throws WsfexError when the response lacks the expected result block', () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body></soap:Body></soap:Envelope>';
    expect(() => parseFexGetParamCtzResponse(xml)).toThrow(WsfexError);
  });
});
