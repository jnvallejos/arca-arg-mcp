export type ArcaEnv = 'homologation' | 'production';

export interface ArcaConfig {
  env: ArcaEnv;
  cuit: string;
  certPath: string;
  keyPath: string;
  cacheDir: string;
}

export interface WsaaEndpoints {
  /** Service URL (without `?wsdl`). Used for display and as base for SOAP requests. */
  url: string;
  /** Per-service ARCA endpoints; populated as new services are added in later phases. */
  serviceUrls: Record<string, string>;
}

export const WSAA_ENDPOINTS: Record<ArcaEnv, WsaaEndpoints> = {
  homologation: {
    url: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    serviceUrls: {},
  },
  production: {
    url: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    serviceUrls: {},
  },
};
