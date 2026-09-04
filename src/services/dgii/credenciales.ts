import { and, eq } from 'drizzle-orm';
import { db, msellerApiKeys, companySettings } from '@/db';
import { decryptAsync } from '@/utils/encryption';
import type { EntornoDgii } from './entorno';

/**
 * Las credenciales de mSeller para hablar con un entorno concreto.
 *
 * ─── COMO SE REPARTEN ──────────────────────────────────────────────────────
 *
 * El correo y la contraseña son de la EMPRESA: los mismos para los tres
 * ambientes. Viven en `company_settings`, que es donde ya estaban.
 *
 * La clave de API es del AMBIENTE: mSeller emite una distinta para pruebas,
 * certificación y producción. Vive en `mseller_api_keys`, con clave
 * (empresa, entorno).
 *
 * No se duplica el correo ni la contraseña por ambiente a propósito: un dato
 * repetido en tres sitios se desincroniza, y un cambio de contraseña aplicado en
 * dos de tres deja el tercero roto sin que nadie se entere hasta que falla un
 * envío.
 *
 * ─── POR QUE EXISTE (hallazgos ISO-14 e ISO-16) ────────────────────────────
 *
 * ISO-14 — tres rutas leían las credenciales de variables de entorno cuando la
 * empresa no las tenía (`settings?.msellerEmail || process.env.MSELLER_EMAIL`).
 * En multiempresa eso es una fuga: una empresa sin credenciales propias enviaba
 * sus comprobantes con la cuenta de otra, y no fallaba.
 *
 * ISO-16 — había una sola clave de API por empresa. Al pasar a producción había
 * que sustituirla, y el modo PRUEBA dejaba de funcionar a partir de entonces.
 *
 * ─── EL CRITERIO ───────────────────────────────────────────────────────────
 *
 * Esto resuelve o falla. No hay respaldo, ni global ni de otro ambiente: unas
 * credenciales que aparecen de la nada mandan comprobantes fiscales a la cuenta
 * equivocada, y eso no se descubre hasta que la DGII pregunta.
 */
export interface CredencialesMseller {
  email: string;
  password: string;
  apiKeyEncrypted: string;
}

const NOMBRE: Record<string, string> = {
  TesteCF: 'Pruebas',
  CerteCF: 'Certificación',
  eCF: 'Producción',
};

export async function credencialesMseller(
  companyId: string,
  entorno: EntornoDgii,
  tx: typeof db = db
): Promise<CredencialesMseller> {
  const [ajustes] = await tx
    .select({
      email: companySettings.msellerEmail,
      passwordEncrypted: companySettings.msellerPasswordEncrypted,
    })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);

  if (!ajustes?.email || !ajustes?.passwordEncrypted) {
    throw new Error(
      'No hay usuario y contraseña de mSeller configurados para esta empresa. ' +
      'Configúrelos en Ajustes > mSeller.'
    );
  }

  const [clave] = await tx
    .select({ apiKeyEncrypted: msellerApiKeys.apiKeyEncrypted })
    .from(msellerApiKeys)
    .where(and(
      eq(msellerApiKeys.companyId, companyId),
      eq(msellerApiKeys.entorno, entorno)
    ))
    .limit(1);

  if (!clave?.apiKeyEncrypted) {
    throw new Error(
      `No hay clave de API de mSeller para el ambiente de ${NOMBRE[entorno] || entorno}. ` +
      `Configúrela en Ajustes > mSeller. Cada ambiente lleva la suya: la de pruebas no sirve ` +
      `para producción ni al revés.`
    );
  }

  const password = await decryptAsync(ajustes.passwordEncrypted);
  if (!password) {
    throw new Error(
      'La contraseña de mSeller guardada no se pudo leer. Vuelva a guardarla en Ajustes > mSeller.'
    );
  }

  return { email: ajustes.email, password, apiKeyEncrypted: clave.apiKeyEncrypted };
}

/** Qué ambientes tienen clave de API, para pintarlo en Ajustes. Sin secretos. */
export async function entornosConCredenciales(companyId: string, tx: typeof db = db): Promise<string[]> {
  const filas = await tx
    .select({ entorno: msellerApiKeys.entorno })
    .from(msellerApiKeys)
    .where(eq(msellerApiKeys.companyId, companyId));
  return filas.map((f) => f.entorno);
}
