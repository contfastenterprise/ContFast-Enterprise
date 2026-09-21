/**
 * Recuperar el acceso cuando alguien olvida su contraseña.
 *
 * POR QUE NO EXISTIA (lote 177)
 * -----------------------------
 * No habia ninguna ruta: quien olvidaba su contraseña tenia que pedirle a
 * alguien con acceso a la base que se la cambiara a mano. La tabla
 * `password_resets` estaba en el esquema **desde el principio y con la forma
 * correcta** -- `token_hash`, `expires_at`, `used_at` -- y con CERO referencias
 * en `src/`: nadie la escribia ni la leia (medido el 2026-09-21; 0 filas en
 * PRODUCCION). Mismo caso que `notifications` antes del lote 160.
 *
 * LAS DECISIONES DE SEGURIDAD, Y POR QUE
 * --------------------------------------
 * 1. NO SE DICE SI LA CUENTA EXISTE. La respuesta es la misma para un correo
 *    registrado y para uno que no. Si cambiara, este formulario seria un
 *    comprobador de cuentas: cualquiera podria averiguar quien tiene acceso al
 *    sistema probando correos. Por eso `RESPUESTA_NEUTRA` es una constante y no
 *    un mensaje que se arma segun el caso.
 *
 * 2. EL ENLACE SE GUARDA CIFRADO. En la tabla va el SHA-256 del token, no el
 *    token. Quien consiga leer la base no puede entrar con lo que ve: tendria
 *    que invertir el hash. El token viaja solo en el correo.
 *    SHA-256 y no bcrypt a proposito: bcrypt esta pensado para secretos con
 *    poca entropia (contraseñas que la gente elige). Esto son 32 bytes al azar;
 *    lo que protege es la entropia, y un hash lento solo haria lenta cada
 *    comprobacion.
 *
 * 3. CADUCA Y SE USA UNA SOLA VEZ. Una hora. Un enlace que sigue sirviendo
 *    mañana es una contraseña escrita en el historial del correo.
 *
 * 4. AL CAMBIARLA SE CIERRAN LAS SESIONES. Si alguien pide recuperar el acceso
 *    es porque puede que no sea el unico que lo tiene. Cambiar la contraseña y
 *    dejar viva la sesion del intruso no recupera nada.
 *
 * Sin base de datos y sin React: lo usan las dos rutas y las dos pantallas.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { esAdminOSistemas } from '@/utils/rolMatch';

/** Cuanto vale un enlace de recuperacion. */
export const MINUTOS_DE_VIGENCIA = 60;

/**
 * Lo que se responde SIEMPRE al pedir recuperar el acceso, exista o no la
 * cuenta. Es una constante justamente para que nadie la "mejore" contando mas
 * en uno de los dos casos.
 */
export const RESPUESTA_NEUTRA =
  'Si ese correo pertenece a una cuenta, le enviamos un enlace para restablecer la contraseña. Revise su bandeja de entrada y la carpeta de correo no deseado.';

/**
 * ¿Quien puede recuperar su acceso por correo? (decision del dueño, 2026-09-21)
 *
 * SOLO ADMINISTRACION Y SISTEMAS. Al resto le cambia la contraseña un
 * administrador desde Usuarios. El motivo es de control: en una empresa
 * pequeña, el correo de un cajero suele estar tan a mano como su puesto, y un
 * enlace que llega ahi abre la caja del dia. Quien administra si necesita poder
 * volver a entrar sin depender de nadie.
 *
 * Comparacion EXACTA de rol (`rolMatch`), no `includes`: con `includes`, un rol
 * llamado "admin de ventas" pasaria por administracion. Ver auditoria P0-02.
 */
export function puedeRecuperarSolo(roleName: string | null | undefined): boolean {
  return esAdminOSistemas(roleName);
}

/** Un token nuevo: el que viaja en el correo y el que se guarda. */
export function generarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashDelToken(token) };
}

export function hashDelToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * ¿Son el mismo token? En tiempo constante.
 *
 * La busqueda va por indice sobre el hash, asi que esto no es imprescindible;
 * esta para que comparar dos tokens nunca dependa de cuantos caracteres
 * coinciden, si alguien lo usa en otro sitio.
 */
export function mismoToken(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export function caducidad(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() + MINUTOS_DE_VIGENCIA * 60 * 1000);
}

/**
 * Por que ese enlace no sirve, o null si sirve.
 *
 * Los tres motivos se dicen distinto a proposito: aqui ya no hay nada que
 * proteger -- quien tiene el enlace lo tiene -- y saber si caduco o si ya se
 * uso es lo que le dice a la persona que hacer (pedir otro, o darse cuenta de
 * que ya lo cambio).
 */
export function motivoParaNoUsarElEnlace(
  reset: { expiresAt?: Date | string | null; usedAt?: Date | string | null } | null | undefined,
  ahora: Date = new Date(),
): string | null {
  if (!reset) return 'Este enlace no es válido. Solicite uno nuevo.';
  if (reset.usedAt) return 'Este enlace ya se usó. Si necesita cambiar la contraseña otra vez, solicite uno nuevo.';
  const vence = reset.expiresAt instanceof Date ? reset.expiresAt : new Date(reset.expiresAt ?? 0);
  if (Number.isNaN(vence.getTime()) || vence.getTime() <= ahora.getTime()) {
    return `Este enlace caducó (vale ${MINUTOS_DE_VIGENCIA} minutos). Solicite uno nuevo.`;
  }
  return null;
}

/** El correo con el que se pide recuperar el acceso. */
export const esquemaPedirEnlace = z.object({
  email: z.string().min(1, 'Ingrese su correo electrónico').email('Ese correo no tiene un formato válido'),
});

/**
 * La contraseña nueva.
 *
 * El minimo son 6 caracteres, el mismo que exige el acceso: poner aqui una
 * regla mas dura que la del login dejaria cuentas que no se pueden recuperar
 * sin cambiar tambien su contraseña actual.
 */
export const esquemaNuevaContrasena = z.object({
  token: z.string().min(1, 'Falta el enlace de recuperación'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmacion: z.string().min(1, 'Repita la contraseña'),
}).refine((d) => d.password === d.confirmacion, {
  path: ['confirmacion'],
  message: 'Las dos contraseñas no coinciden',
});

export type PedirEnlace = z.infer<typeof esquemaPedirEnlace>;
export type NuevaContrasena = z.infer<typeof esquemaNuevaContrasena>;

/** El enlace que va en el correo. */
export function enlaceDeRecuperacion(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;
}
