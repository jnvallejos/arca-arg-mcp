import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WsfeError } from '../../src/lib/errors.js';
import {
  parseFeCaeResponse,
  parseFeCompConsultarResponse,
  parseFeCompUltimoAutorizadoResponse,
} from '../../src/wsfe/parser.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const success = readFileSync(join(FIXTURES, 'wsfe-fecae-success.xml'), 'utf-8');
const successObs = readFileSync(
  join(FIXTURES, 'wsfe-fecae-success-with-observations.xml'),
  'utf-8',
);
const rejected = readFileSync(join(FIXTURES, 'wsfe-fecae-rejected.xml'), 'utf-8');
const errorValid = readFileSync(join(FIXTURES, 'wsfe-fecae-error-validacion.xml'), 'utf-8');
const consultarFound = readFileSync(join(FIXTURES, 'wsfe-fecomp-consultar-found.xml'), 'utf-8');
const consultarNotFound = readFileSync(
  join(FIXTURES, 'wsfe-fecomp-consultar-not-found.xml'),
  'utf-8',
);
const ultimoAutorizado = readFileSync(join(FIXTURES, 'wsfe-fecomp-ultimo-autorizado.xml'), 'utf-8');

describe('parseFeCaeResponse', () => {
  it('parses Resultado=A into ComprobanteAutorizado with all key fields', () => {
    const r = parseFeCaeResponse(success);
    expect(r.status).toBe('aprobado');
    if (r.status !== 'aprobado') return;
    expect(r.cae).toBe('75000000000000');
    expect(r.fechaVencimientoCae).toBe('2026-04-25');
    expect(r.numeroComprobante).toBe(12345);
    expect(r.tipoComprobante).toBe(6);
    expect(r.puntoVenta).toBe(1);
    expect(r.fechaComprobante).toBe('2026-04-15');
    expect(r.observaciones).toEqual([]);
  });

  it('preserves observaciones on a successful response', () => {
    const r = parseFeCaeResponse(successObs);
    expect(r.status).toBe('aprobado');
    if (r.status !== 'aprobado') return;
    expect(r.observaciones).toHaveLength(2);
    expect(r.observaciones[0].code).toBe(10063);
    expect(r.observaciones[0].message).toContain('observaciones no bloqueantes');
    expect(r.observaciones[1].code).toBe(10071);
  });

  it('parses Resultado=R into ComprobanteRechazado without throwing', () => {
    const r = parseFeCaeResponse(rejected);
    expect(r.status).toBe('rechazado');
    if (r.status !== 'rechazado') return;
    expect(r.numeroComprobante).toBe(12347);
    expect(r.tipoComprobante).toBe(6);
    expect(r.puntoVenta).toBe(1);
    expect(r.observaciones).toHaveLength(1);
    expect(r.observaciones[0].code).toBe(10017);
    expect(r.errores).toEqual([]);
  });

  it('preserves top-level Errors collection on a rejected response', () => {
    const r = parseFeCaeResponse(errorValid);
    expect(r.status).toBe('rechazado');
    if (r.status !== 'rechazado') return;
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].code).toBe(1006);
    expect(r.errores[0].message).toContain('schema');
    expect(r.observaciones).toHaveLength(1);
    expect(r.observaciones[0].code).toBe(10018);
  });

  it("treats Resultado='P' (parcial) as a Rechazado in V1", () => {
    const partial = success.replaceAll('<Resultado>A</Resultado>', '<Resultado>P</Resultado>');
    const r = parseFeCaeResponse(partial);
    expect(r.status).toBe('rechazado');
  });

  it('throws WsfeError when the XML is unparseable', () => {
    expect(() => parseFeCaeResponse('<not valid')).toThrow(WsfeError);
  });

  it('throws WsfeError when the response lacks FECAEDetResponse', () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body><FECAESolicitarResponse><FECAESolicitarResult><FeCabResp>' +
      '<Cuit>20239312345</Cuit><Resultado>A</Resultado></FeCabResp></FECAESolicitarResult>' +
      '</FECAESolicitarResponse></soap:Body></soap:Envelope>';
    expect(() => parseFeCaeResponse(xml)).toThrow(WsfeError);
  });
});

describe('parseFeCompUltimoAutorizadoResponse', () => {
  it('parses an existing last-number response', () => {
    const r = parseFeCompUltimoAutorizadoResponse(ultimoAutorizado);
    expect(r.puntoVenta).toBe(1);
    expect(r.tipoComprobante).toBe(6);
    expect(r.numero).toBe(12344);
  });

  it('returns numero=0 when CbteNro is 0 (no comprobantes yet)', () => {
    const xml = ultimoAutorizado.replace('<CbteNro>12344</CbteNro>', '<CbteNro>0</CbteNro>');
    const r = parseFeCompUltimoAutorizadoResponse(xml);
    expect(r.numero).toBe(0);
  });

  it('throws WsfeError when the response is malformed', () => {
    expect(() => parseFeCompUltimoAutorizadoResponse('<bad')).toThrow(WsfeError);
  });
});

describe('parseFeCompConsultarResponse', () => {
  it('parses a found comprobante with CAE and importe details', () => {
    const r = parseFeCompConsultarResponse(consultarFound);
    expect(r.numeroComprobante).toBe(12345);
    expect(r.tipoComprobante).toBe(6);
    expect(r.puntoVenta).toBe(1);
    expect(r.fechaComprobante).toBe('2026-04-15');
    expect(r.cae).toBe('75000000000000');
    expect(r.fechaVencimientoCae).toBe('2026-04-25');
    expect(r.importeTotal).toBe(121);
    expect(r.importeNeto).toBe(100);
    expect(r.concepto).toBe(1);
    expect(r.tipoDocReceptor).toBe(99);
    expect(r.numeroDocReceptor).toBe('0');
  });

  it('parses CondicionIVAReceptorId from the response when present', () => {
    const r = parseFeCompConsultarResponse(consultarFound);
    expect(r.condicionIvaReceptor).toBe(5);
  });

  it('leaves condicionIvaReceptor undefined when the tag is absent', () => {
    const xml = consultarFound.replace(
      /<CondicionIVAReceptorId>\d+<\/CondicionIVAReceptorId>\s*/,
      '',
    );
    const r = parseFeCompConsultarResponse(xml);
    expect(r.condicionIvaReceptor).toBeUndefined();
  });

  it('throws WsfeError(NOT_FOUND) when the response indicates no comprobante exists', () => {
    expect(() => parseFeCompConsultarResponse(consultarNotFound)).toThrow(WsfeError);
    try {
      parseFeCompConsultarResponse(consultarNotFound);
    } catch (err) {
      expect(err).toBeInstanceOf(WsfeError);
      expect((err as WsfeError).code).toBe('NOT_FOUND');
    }
  });

  it('throws WsfeError when the response is malformed', () => {
    expect(() => parseFeCompConsultarResponse('<bad')).toThrow(WsfeError);
  });
});
