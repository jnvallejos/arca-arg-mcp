import forge from 'node-forge';
import { ArcaError } from '../lib/errors.js';

/**
 * Signs the TRA XML with the user's certificate and private key, producing a
 * detached PKCS#7 / CMS SignedData structure (base64-encoded DER).
 *
 * The output is what WSAA's `loginCms` SOAP method expects as `in0`.
 */
export async function signCms(
  xml: string,
  certPem: string,
  keyPem: string,
): Promise<string> {
  const certificate = parseCertificate(certPem);
  const privateKey = parsePrivateKey(keyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, 'utf8');
  p7.addCertificate(certificate);
  p7.addSigner({
    key: privateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: false });

  const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(derBytes);
}

function parseCertificate(pem: string): forge.pki.Certificate {
  try {
    return forge.pki.certificateFromPem(pem);
  } catch (err) {
    throw new ArcaError(`Invalid certificate PEM: ${(err as Error).message}`);
  }
}

function parsePrivateKey(pem: string): forge.pki.PrivateKey {
  try {
    return forge.pki.privateKeyFromPem(pem);
  } catch (err) {
    throw new ArcaError(`Invalid private key PEM: ${(err as Error).message}`);
  }
}
