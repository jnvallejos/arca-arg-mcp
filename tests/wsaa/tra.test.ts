import { describe, expect, it } from 'vitest';
import { buildTra } from '../../src/wsaa/tra.js';

describe('buildTra', () => {
  it('produces a TRA with the requested service', () => {
    const { tra } = buildTra('wsfe');
    expect(tra.service).toBe('wsfe');
  });

  it('returns generationTime equal to the provided now', () => {
    const now = new Date('2026-05-04T15:00:00.000Z');
    const { tra } = buildTra('wsfe', now);
    expect(tra.generationTime.toISOString()).toBe(now.toISOString());
  });

  it('sets expirationTime exactly 10 minutes after generationTime', () => {
    const now = new Date('2026-05-04T15:00:00.000Z');
    const { tra } = buildTra('wsfe', now);
    const delta = tra.expirationTime.getTime() - tra.generationTime.getTime();
    expect(delta).toBe(10 * 60 * 1000);
  });

  it('sets uniqueId to the unix timestamp in seconds', () => {
    const now = new Date('2026-05-04T15:00:00.000Z');
    const { tra } = buildTra('wsfe', now);
    expect(tra.uniqueId).toBe(Math.floor(now.getTime() / 1000));
  });

  it('emits a UTF-8 XML declaration', () => {
    const { xml } = buildTra('wsfe');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('renders generationTime in ARG timezone (-03:00)', () => {
    const now = new Date('2026-05-04T15:00:00.000Z'); // 12:00:00 in -03:00
    const { xml } = buildTra('wsfe', now);
    expect(xml).toContain('<generationTime>2026-05-04T12:00:00-03:00</generationTime>');
    expect(xml).toContain('<expirationTime>2026-05-04T12:10:00-03:00</expirationTime>');
  });

  it('includes the requested service inside the XML body', () => {
    const { xml } = buildTra('ws_sr_padron_a13');
    expect(xml).toContain('<service>ws_sr_padron_a13</service>');
  });

  it('escapes XML-significant characters in service name (defensive)', () => {
    const { xml } = buildTra('w<sfe' as never);
    expect(xml).toContain('<service>w&lt;sfe</service>');
  });

  it('produces different uniqueIds for TRAs built one second apart', () => {
    const a = buildTra('wsfe', new Date('2026-05-04T15:00:00.000Z'));
    const b = buildTra('wsfe', new Date('2026-05-04T15:00:01.000Z'));
    expect(b.tra.uniqueId).toBe(a.tra.uniqueId + 1);
  });

  it('matches the loginTicketRequest version="1.0" envelope', () => {
    const { xml } = buildTra('wsfe');
    expect(xml).toContain('<loginTicketRequest version="1.0">');
    expect(xml).toContain('</loginTicketRequest>');
  });
});
