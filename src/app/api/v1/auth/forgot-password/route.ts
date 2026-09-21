import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users, companies, roles, passwordResets } from '@/db';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { Logger } from '@/utils/logger';
import {
  RESPUESTA_NEUTRA,
  caducidad,
  enlaceDeRecuperacion,
  esquemaPedirEnlace,
  generarToken,
  MINUTOS_DE_VIGENCIA,
  puedeRecuperarSolo,
} from '@/services/auth/recuperarAcceso';

export const dynamic = 'force-dynamic';

/**
 * Pedir un enlace para restablecer la contraseña (lote 177).
 *
 * RESPONDE LO MISMO SIEMPRE. Exista la cuenta o no, esté activa o no, salga el
 * correo o falle el SMTP: 200 con `RESPUESTA_NEUTRA`. Si la respuesta cambiara
 * -- otro mensaje, otro codigo, o simplemente tardar mas -- este formulario
 * seria un comprobador de cuentas: cualquiera podria averiguar quien tiene
 * acceso al sistema probando correos.
 *
 * Por eso tampoco se devuelve error cuando el envio falla. Eso se REGISTRA
 * (`Logger`), que es donde tiene que verse, no en la respuesta.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  // Preset 'auth': el unico que se aplica aunque Redis no responda, en vez de
  // dejar pasar. Sin freno, esto es una forma comoda de mandar correos en masa
  // a cuentas ajenas -- y de probar correos uno a uno.
  const permitido = await checkRateLimit(ip, 'auth');
  if (!permitido) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espere unos minutos.' } },
      { status: 429 }
    );
  }

  const neutra = NextResponse.json({ success: true, message: RESPUESTA_NEUTRA });

  let email: string;
  try {
    const parsed = esquemaPedirEnlace.safeParse(await req.json());
    // Un correo mal escrito SI se dice: no revela nada de quien esta registrado
    // y evita que alguien espere un correo que nunca iba a salir.
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }
    email = parsed.data.email.toLowerCase().trim();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Petición inválida.' } },
      { status: 400 }
    );
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        name: users.name,
        email: users.email,
        status: users.status,
        rol: roles.name,
        empresa: companies.name,
      })
      .from(users)
      .innerJoin(companies, eq(users.companyId, companies.id))
      .innerJoin(roles, eq(users.roleId, roles.id))
      // Misma busqueda que el acceso: por correo en minusculas y sin borrar.
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    // Cuenta inexistente o inactiva: se sale por el MISMO sitio y con el mismo
    // mensaje. No es un `if` de conveniencia -- es la decision de seguridad.
    if (!user || user.status !== 'active') return neutra;

    // SOLO ADMINISTRACION Y SISTEMAS se recuperan solos (decision del dueño,
    // 2026-09-21). Al resto le cambia la contraseña un administrador desde
    // Usuarios. Y se sale por el MISMO sitio: si la respuesta cambiara, este
    // formulario diria quien es administrador, que es peor que decir quien
    // tiene cuenta.
    if (!puedeRecuperarSolo(user.rol)) return neutra;

    const { token, hash } = generarToken();

    // Los enlaces anteriores que sigan vivos se dan por usados: pedir uno nuevo
    // invalida el anterior. Si no, un enlace filtrado hace una hora seguiria
    // sirviendo aunque la persona ya haya pedido otro.
    await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

    await db.insert(passwordResets).values({
      userId: user.id,
      companyId: user.companyId,
      tokenHash: hash,
      expiresAt: caducidad(),
    });

    await enviarElEnlace(user.email, user.name, user.empresa, token);
  } catch (err: unknown) {
    // Ni un fallo de base ni uno de correo cambian lo que se responde.
    Logger.error('[recuperar-acceso] no se pudo procesar la solicitud', {
      error: (err as Error)?.message,
    });
  }

  return neutra;
}

/**
 * El correo con el enlace.
 *
 * Va directo por SMTP y no por la cola: quien esta mirando la pantalla espera
 * el correo AHORA, y la cola depende de Redis (cuya cuota se agoto el
 * 2026-09-19). Si el SMTP no esta configurado, se registra y ya: la respuesta
 * no cambia.
 */
async function enviarElEnlace(to: string, nombre: string, empresa: string, token: string) {
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  if (!base) {
    Logger.error('[recuperar-acceso] falta APP_URL: no se puede armar el enlace', { to });
    return;
  }
  const enlace = enlaceDeRecuperacion(base, token);

  const { getTransporter, getFromEmail } = await import('@/utils/mailer');
  const transporter = getTransporter();
  await transporter.sendMail({
    from: getFromEmail(empresa || 'ContFast'),
    to,
    subject: 'Restablecer su contraseña',
    text: [
      `Hola ${nombre},`,
      '',
      `Alguien pidió restablecer la contraseña de su cuenta en ${empresa}.`,
      `Si fue usted, abra este enlace (vale ${MINUTOS_DE_VIGENCIA} minutos y solo se puede usar una vez):`,
      '',
      enlace,
      '',
      'Si no fue usted, no hace falta que haga nada: su contraseña no ha cambiado.',
    ].join('\n'),
    html: `
      <p>Hola ${nombre},</p>
      <p>Alguien pidió restablecer la contraseña de su cuenta en <strong>${empresa}</strong>.</p>
      <p>Si fue usted, abra este enlace. Vale <strong>${MINUTOS_DE_VIGENCIA} minutos</strong> y solo se puede usar una vez:</p>
      <p><a href="${enlace}">Restablecer mi contraseña</a></p>
      <p style="color:#666;font-size:12px">Si no fue usted, no hace falta que haga nada: su contraseña no ha cambiado.</p>
    `,
  });
}
