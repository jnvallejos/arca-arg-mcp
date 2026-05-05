import type { ServiceName, TRA } from './types.js';

const TRA_VALIDITY_MS = 10 * 60 * 1000;
const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Builds a TRA (Ticket de Requerimiento de Acceso) for the requested service.
 * Returns both the structured TRA and the serialized XML ready to sign.
 */
export function buildTra(service: ServiceName, now: Date = new Date()): { tra: TRA; xml: string } {
  const generationTime = new Date(now.getTime());
  const expirationTime = new Date(now.getTime() + TRA_VALIDITY_MS);

  const tra: TRA = {
    uniqueId: Math.floor(now.getTime() / 1000),
    generationTime,
    expirationTime,
    service,
  };

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${tra.uniqueId}</uniqueId>
    <generationTime>${formatArgTime(generationTime)}</generationTime>
    <expirationTime>${formatArgTime(expirationTime)}</expirationTime>
  </header>
  <service>${escapeXml(service)}</service>
</loginTicketRequest>
`;

  return { tra, xml };
}

/**
 * Formats a Date as `YYYY-MM-DDTHH:MM:SS-03:00`. Argentina has been at UTC-3
 * year-round (no DST) since 2009, so a fixed offset is correct.
 */
function formatArgTime(d: Date): string {
  const ar = new Date(d.getTime() - ARG_OFFSET_MS);
  const yyyy = ar.getUTCFullYear();
  const mm = String(ar.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ar.getUTCDate()).padStart(2, '0');
  const hh = String(ar.getUTCHours()).padStart(2, '0');
  const min = String(ar.getUTCMinutes()).padStart(2, '0');
  const ss = String(ar.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
