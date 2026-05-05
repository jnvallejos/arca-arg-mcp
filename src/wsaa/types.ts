export interface TRA {
  uniqueId: number;
  generationTime: Date;
  expirationTime: Date;
  service: string;
}

export interface TA {
  token: string;
  sign: string;
  generationTime: Date;
  expirationTime: Date;
  /** CN of issuer cert per WSAA response. */
  source: string;
  /** CN of subject cert per WSAA response. */
  destination: string;
  /** Service this TA was issued for. Not in the WSAA response; we add it for cache keying. */
  service: string;
}

export type ServiceName = 'wsfe' | 'wsfex' | 'ws_sr_padron_a13';
