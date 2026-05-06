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
const structuralError = readFileSync(
  join(FIXTURES, 'wsfex-authorize-structural-error.xml'),
  'utf-8',
);
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

  it('returns rechazado when FEXResultAuth is missing but FEXErr is populated', () => {
    const r = parseFexAuthorizeResponse(structuralError);
    expect(r.status).toBe('rechazado');
    if (r.status !== 'rechazado') return;
    expect(r.numeroComprobante).toBe(0);
    expect(r.tipoComprobante).toBe(19);
    expect(r.puntoVenta).toBe(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].code).toBe(1550);
    expect(r.errores[0].message).toContain('Permiso_existente');
    expect(r.observaciones).toEqual([]);
  });

  it('still throws when neither FEXResultAuth nor FEXErr is present', () => {
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

  it('parses Fecha_ctz in compact yyyymmdd format', () => {
    const xml = getCtz.replace(
      '<Fecha_ctz>20260415</Fecha_ctz>',
      '<Fecha_ctz>20260415</Fecha_ctz>',
    );
    const r = parseFexGetParamCtzResponse(xml);
    expect(r.fechaCotizacion).toBe('2026-04-15');
  });

  it('parses Fecha_ctz in ISO yyyy-mm-dd format', () => {
    const xml = getCtz.replace(
      '<Fecha_ctz>20260415</Fecha_ctz>',
      '<Fecha_ctz>2026-04-15</Fecha_ctz>',
    );
    const r = parseFexGetParamCtzResponse(xml);
    expect(r.fechaCotizacion).toBe('2026-04-15');
  });

  it('returns empty string for unknown date format', () => {
    const xml = getCtz.replace(
      '<Fecha_ctz>20260415</Fecha_ctz>',
      '<Fecha_ctz>15/04/2026</Fecha_ctz>',
    );
    const r = parseFexGetParamCtzResponse(xml);
    expect(r.fechaCotizacion).toBe('');
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

describe('parser fallback branches', () => {
  it('Motivos_Obs without a "NNN: msg" prefix is preserved as code=0', () => {
    const xml = rejected.replace(
      '<Motivos_Obs>00500: El número de comprobante no es el siguiente esperado.</Motivos_Obs>',
      '<Motivos_Obs>Free-form motivo without numeric prefix</Motivos_Obs>',
    );
    const r = parseFexAuthorizeResponse(xml);
    expect(r.status).toBe('rechazado');
    if (r.status !== 'rechazado') return;
    expect(r.observaciones).toEqual([
      { code: 0, message: 'Free-form motivo without numeric prefix' },
    ]);
  });

  it('empty Motivos_Obs yields no observaciones', () => {
    const xml = rejected.replace(
      '<Motivos_Obs>00500: El número de comprobante no es el siguiente esperado.</Motivos_Obs>',
      '<Motivos_Obs></Motivos_Obs>',
    );
    const r = parseFexAuthorizeResponse(xml);
    if (r.status !== 'rechazado') return;
    expect(r.observaciones).toEqual([]);
  });

  it('GetCmp with non-numeric Cbte_nro falls back to 0', () => {
    const xml = getCmpFound.replace(
      '<Cbte_nro>123</Cbte_nro>',
      '<Cbte_nro>not-a-number</Cbte_nro>',
    );
    const r = parseFexGetCmpResponse(xml);
    expect(r.numeroComprobante).toBe(0);
  });

  it('GetCmp with non-numeric Imp_total falls back to 0', () => {
    const xml = getCmpFound.replace('<Imp_total>100.00</Imp_total>', '<Imp_total>NaN</Imp_total>');
    const r = parseFexGetCmpResponse(xml);
    expect(r.importeTotal).toBe(0);
  });

  it('GetCmp without Items section yields an empty items array', () => {
    const xml = getCmpFound.replace(/<Items>[\s\S]*<\/Items>/, '');
    const r = parseFexGetCmpResponse(xml);
    expect(r.items).toEqual([]);
  });

  it('GetCmp with an item that has non-numeric Pro_qty falls back to 0', () => {
    const xml = getCmpFound.replace('<Pro_qty>1</Pro_qty>', '<Pro_qty>abc</Pro_qty>');
    const r = parseFexGetCmpResponse(xml);
    expect(r.items[0].cantidad).toBe(0);
  });

  it('GetCmp with empty Id_impositivo yields undefined idImpositivoExterior', () => {
    const xml = getCmpFound.replace(
      '<Id_impositivo>TEST-EIN-12345</Id_impositivo>',
      '<Id_impositivo></Id_impositivo>',
    );
    const r = parseFexGetCmpResponse(xml);
    expect(r.cliente.idImpositivoExterior).toBeUndefined();
  });

  it('GetCmp NOT_FOUND when no FEXResultGet and no errors at all', () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body><FEXGetCMPResponse><FEXGetCMPResult></FEXGetCMPResult>' +
      '</FEXGetCMPResponse></soap:Body></soap:Envelope>';
    expect(() => parseFexGetCmpResponse(xml)).toThrow(WsfexError);
  });

  it('GetLastCmp with empty Cbte_nro tag falls back to 0', () => {
    const xml = getLast.replace('<Cbte_nro>122</Cbte_nro>', '<Cbte_nro></Cbte_nro>');
    const r = parseFexGetLastCmpResponse(xml);
    expect(r.numero).toBe(0);
  });

  it('FEXAuthorize without Fecha_cbte tag yields empty fechaComprobante', () => {
    const xml = success.replace(/<Fecha_cbte>\d+<\/Fecha_cbte>/, '<Fecha_cbte></Fecha_cbte>');
    const r = parseFexAuthorizeResponse(xml);
    if (r.status !== 'aprobado') return;
    expect(r.fechaComprobante).toBe('');
  });

  it('GetCmp surfaces FEXEvents into observaciones with EventCode/EventMsg', () => {
    const xml = getCmpFound.replace(
      '</FEXResultGet>',
      `</FEXResultGet>
        <FEXEvents>
          <EventCode>1100</EventCode>
          <EventMsg>Mensaje informativo de ARCA</EventMsg>
        </FEXEvents>`,
    );
    const r = parseFexGetCmpResponse(xml);
    expect(r.observaciones).toHaveLength(1);
    expect(r.observaciones[0]).toEqual({ code: 1100, message: 'Mensaje informativo de ARCA' });
  });
});
