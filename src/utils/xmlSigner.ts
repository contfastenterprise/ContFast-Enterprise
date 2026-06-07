import crypto from 'crypto';
// @ts-ignore
import { SignedXml } from 'xml-crypto';
import forge from 'node-forge';

interface SignXmlParams {
  xml: string;
  p12Buffer: Buffer;
  password?: string;
  elementToSignXPath?: string;
}

/**
 * Signs an XML document using a PKCS#12 (.p12/.pfx) digital certificate.
 * Conforms to the DGII e-CF XMLDSIG envelope requirement.
 */
export function signXml({
  xml,
  p12Buffer,
  password = '',
  elementToSignXPath = "//*[local-name()='ECF']"
}: SignXmlParams): string {
  // 1. Extract private key and certificates from .p12 buffer using node-forge
  let privateKeyPem = '';
  let certificatePem = '';

  try {
    const p12Der = p12Buffer.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    // Extract private key (supports PKCS#8 shrouded and unshrouded bags)
    const shroudedKeyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const shroudedKeyBag = shroudedKeyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (shroudedKeyBag && shroudedKeyBag.key) {
      privateKeyPem = forge.pki.privateKeyToPem(shroudedKeyBag.key);
    } else {
      const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
      const keyBag = keyBags[forge.pki.oids.keyBag]?.[0];
      if (keyBag && keyBag.key) {
        privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
      }
    }

    // Extract certificate
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (certBag && certBag.cert) {
      certificatePem = forge.pki.certificateToPem(certBag.cert);
    }
  } catch (error: any) {
    throw new Error(`Failed to extract digital certificate: ${error.message}`);
  }

  if (!privateKeyPem || !certificatePem) {
    throw new Error('Private key or Certificate PEM could not be extracted from the .p12 file.');
  }

  // 2. Clean up certificate for X509Certificate element (needs raw base64 without headers/newlines)
  const cleanCert = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/[\r\n]/g, '')
    .trim();

  // 3. Initialize xml-crypto SignedXml
  const sig = new SignedXml();

  // Reference the element to sign (usually ECF root)
  sig.addReference({
    xpath: elementToSignXPath,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#'
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256'
  });

  // Configure algorithms conforming to DGII requirements
  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';

  // Inject KeyInfo containing X509Data
  (sig as any).keyInfoProvider = {
    getKeyInfo: () => {
      return `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`;
    },
    getKey: () => {
      return Buffer.from(privateKeyPem);
    }
  };

  // Compute signature and inject it into ECF root element
  try {
    sig.computeSignature(xml, {
      location: {
        reference: elementToSignXPath,
        action: 'append' // Signature is appended inside ECF
      }
    });
  } catch (err: any) {
    throw new Error(`XMLDSIG computation failed: ${err.message}`);
  }

  return sig.getSignedXml();
}
