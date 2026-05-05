import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcaConfig } from '../../src/config/types.js';
import { PadronError } from '../../src/lib/errors.js';
import type { PersonaPadron } from '../../src/padron/types.js';

const getPersonaMock = vi.fn();

vi.mock('../../src/padron/client.js', () => ({
  getPersona: (...args: unknown[]) => getPersonaMock(...args),
}));

function makeConfig(): ArcaConfig {
  return {
    env: 'homologation',
    cuit: '20239312345',
    certPath: '/tmp/cert.pem',
    keyPath: '/tmp/private.key',
    cacheDir: '/tmp/cache',
  };
}

function makePersona(): PersonaPadron {
  return {
    tipoPersona: 'FISICA',
    cuit: '20111111112',
    estadoClave: 'ACTIVO',
    nombre: 'JUAN',
    apellido: 'PEREZ',
    domicilios: [],
    actividades: [],
    impuestos: [],
    categoriaMonotributo: null,
  };
}

describe('arca_consultar_cuit tool', () => {
  beforeEach(() => {
    getPersonaMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a Tool definition with name arca_consultar_cuit', async () => {
    const { arcaConsultarCuitTool } = await import('../../src/tools/arca-consultar-cuit.js');
    expect(arcaConsultarCuitTool.name).toBe('arca_consultar_cuit');
    expect(arcaConsultarCuitTool.description).toMatch(/padr/i);
    expect(arcaConsultarCuitTool.inputSchema).toBeDefined();
  });

  it('rejects CUIT with dashes', async () => {
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    await expect(
      handleArcaConsultarCuit(makeConfig(), { cuit: '20-11111111-2' }),
    ).rejects.toThrow();
    expect(getPersonaMock).not.toHaveBeenCalled();
  });

  it('rejects CUIT shorter than 11 digits', async () => {
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    await expect(handleArcaConsultarCuit(makeConfig(), { cuit: '2011111' })).rejects.toThrow();
    expect(getPersonaMock).not.toHaveBeenCalled();
  });

  it('rejects CUIT longer than 11 digits', async () => {
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    await expect(
      handleArcaConsultarCuit(makeConfig(), { cuit: '201111111120000' }),
    ).rejects.toThrow();
    expect(getPersonaMock).not.toHaveBeenCalled();
  });

  it('rejects non-numeric CUIT', async () => {
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    await expect(handleArcaConsultarCuit(makeConfig(), { cuit: '2011111111A' })).rejects.toThrow();
    expect(getPersonaMock).not.toHaveBeenCalled();
  });

  it('rejects when cuit is missing', async () => {
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    await expect(handleArcaConsultarCuit(makeConfig(), {})).rejects.toThrow();
  });

  it('returns formatted persona text on successful lookup', async () => {
    getPersonaMock.mockResolvedValue(makePersona());
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    const result = await handleArcaConsultarCuit(makeConfig(), { cuit: '20111111112' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('CUIT: 20-11111111-2');
    expect(result.content[0].text).toContain('Persona física');
    expect(getPersonaMock).toHaveBeenCalledWith('20111111112', expect.any(Object));
  });

  it('returns a friendly "no encontrado" message on PadronError NOT_FOUND', async () => {
    getPersonaMock.mockRejectedValue(new PadronError('NOT_FOUND', 'No existe persona'));
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    const result = await handleArcaConsultarCuit(makeConfig(), { cuit: '20999999990' });
    expect(result.content[0].text).toMatch(/no .*encontr|no se encontr/i);
    expect(result.content[0].text).toContain('20999999990');
  });

  it('returns a friendly auth-failure message on PadronError AUTH_FAILED', async () => {
    getPersonaMock.mockRejectedValue(new PadronError('AUTH_FAILED', 'token rejected'));
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    const result = await handleArcaConsultarCuit(makeConfig(), { cuit: '20111111112' });
    expect(result.content[0].text).toMatch(/autenticaci|auth/i);
  });

  it('returns a friendly unavailable message on PadronError SERVICE_UNAVAILABLE', async () => {
    getPersonaMock.mockRejectedValue(new PadronError('SERVICE_UNAVAILABLE', 'down'));
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    const result = await handleArcaConsultarCuit(makeConfig(), { cuit: '20111111112' });
    expect(result.content[0].text).toMatch(/no .*disponible|unavailable/i);
  });

  it('returns a generic message on PadronError UNKNOWN', async () => {
    getPersonaMock.mockRejectedValue(new PadronError('UNKNOWN', 'mystery'));
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    const result = await handleArcaConsultarCuit(makeConfig(), { cuit: '20111111112' });
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('propagates non-PadronError errors to the caller', async () => {
    getPersonaMock.mockRejectedValue(new TypeError('boom'));
    const { handleArcaConsultarCuit } = await import('../../src/tools/arca-consultar-cuit.js');
    await expect(
      handleArcaConsultarCuit(makeConfig(), { cuit: '20111111112' }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
