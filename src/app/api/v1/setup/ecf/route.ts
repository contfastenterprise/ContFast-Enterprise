import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import forge from 'node-forge';

const ecfSchema = z.object({
  certP12Base64: z.string().min(10, 'El archivo de certificado (.p12) es requerido en formato Base64'),
  certPassword: z.string().min(1, 'La contraseña del certificado es requerida'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = ecfSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { certP12Base64, certPassword } = result.data;
    const p12Buffer = Buffer.from(certP12Base64, 'base64');

    // Attempt to parse/extract the certificate to verify key/cert extraction using node-forge
    try {
      const p12Der = p12Buffer.toString('binary');
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certPassword);

      // Extract private key check
      let hasKey = false;
      const shroudedKeyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const shroudedKeyBag = shroudedKeyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
      if (shroudedKeyBag && shroudedKeyBag.key) {
        hasKey = true;
      } else {
        const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
        const keyBag = keyBags[forge.pki.oids.keyBag]?.[0];
        if (keyBag && keyBag.key) {
          hasKey = true;
        }
      }

      // Extract certificate check
      let hasCert = false;
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      if (certBag && certBag.cert) {
        hasCert = true;
      }

      if (!hasKey || !hasCert) {
        throw new Error('No se pudo extraer la clave privada o el certificado del archivo.');
      }
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CERTIFICATE',
            message: `El certificado digital .p12 o la contraseña son incorrectos. Detalles: ${err.message}`
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Certificado digital verificado con éxito'
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: error.message } },
      { status: 400 }
    );
  }
}
