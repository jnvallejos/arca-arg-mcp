import { describe, expect, it } from 'vitest';

describe('arca_listar_tipos_comprobante tool', () => {
  it('exposes a Tool definition', async () => {
    const { arcaListarTiposComprobanteTool } = await import(
      '../../src/tools/arca-listar-tipos-comprobante.js'
    );
    expect(arcaListarTiposComprobanteTool.name).toBe('arca_listar_tipos_comprobante');
    expect(arcaListarTiposComprobanteTool.description).toMatch(/tipos|comprobante/i);
  });

  it('takes no input', async () => {
    const { handleArcaListarTiposComprobante } = await import(
      '../../src/tools/arca-listar-tipos-comprobante.js'
    );
    const out = await handleArcaListarTiposComprobante({});
    expect(out.content).toHaveLength(1);
  });

  it('returns the V1 list with Factura A, B, C', async () => {
    const { handleArcaListarTiposComprobante } = await import(
      '../../src/tools/arca-listar-tipos-comprobante.js'
    );
    const out = await handleArcaListarTiposComprobante({});
    expect(out.content[0].text).toContain('Factura A');
    expect(out.content[0].text).toContain('Factura B');
    expect(out.content[0].text).toContain('Factura C');
  });

  it('mentions that Notas de Crédito and Notas de Débito are not in V1', async () => {
    const { handleArcaListarTiposComprobante } = await import(
      '../../src/tools/arca-listar-tipos-comprobante.js'
    );
    const out = await handleArcaListarTiposComprobante({});
    expect(out.content[0].text).toMatch(/cr[ée]dito.*d[ée]bito|Notas de Cr[ée]dito/i);
  });

  it('rejects extraneous arguments (strict empty schema)', async () => {
    const { handleArcaListarTiposComprobante } = await import(
      '../../src/tools/arca-listar-tipos-comprobante.js'
    );
    await expect(handleArcaListarTiposComprobante({ extra: 'nope' })).rejects.toThrow();
  });
});
