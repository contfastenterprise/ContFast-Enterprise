import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users, auditLogs } from '@/db';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { esquemaDelRegistro, empresaDelRegistro } from '@/services/auth/registroDeEmpresa';
import { crearEmpresaConSuSiembra, rncYaTieneEmpresa } from '@/services/empresas/altaDeEmpresa';
import { RNC_YA_REGISTRADO, esRncRepetidoEnLaBase } from '@/services/empresas/rncDeLaEmpresa';

/**
 * Registro publico: crea una empresa NUEVA y su primer usuario (administracion).
 *
 * Lote 287: la empresa nace con la razon social y el RNC que se escriben, no con
 * los datos fijos de antes ("Empresa Demo S.R.L.", 101001001), y con la misma alta
 * que Administracion (`crearEmpresaConSuSiembra`: ajustes, nomina, catalogo,
 * periodos y permisos), todo en UNA transaccion con el usuario: si algo falla a
 * medias no queda una empresa sin nadie que pueda entrar.
 */

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    // Preset 'auth' (5/min): el unico con fallback en memoria cuando Redis no esta
    // disponible. Antes decia 'strict', que no existe en RATE_LIMIT_PRESETS y habria
    // lanzado un TypeError en cuanto Redis conectara.
    const isAllowed = await checkRateLimit(ip, 'auth');
    if (!isAllowed) {
      return NextResponse.json({ success: false, error: { message: 'Demasiadas solicitudes. Intente más tarde.' } }, { status: 429 });
    }

    const body: unknown = await req.json();

    // SEGURIDAD (auditoria F0-02): el registro publico NO puede incorporar usuarios
    // a una empresa que ya existe. Antes bastaba con enviar su RNC —dato publico, que
    // la propia app expone en /api/v1/dgii/rnc/[rnc]— para obtener una cuenta activa
    // con rol 'administracion' en el tenant ajeno, sin invitacion ni verificacion.
    // Para sumar usuarios a una empresa existente se usa POST /api/v1/admin/users,
    // que exige sesion y permiso de administracion.
    //
    // Lote 287: se mira en el cuerpo CRUDO y ANTES de validar, asi que cualquier
    // peticion que traiga `rnc` se rechaza, valga lo que valga el resto. El RNC de la
    // empresa NUEVA viaja en `rncEmpresa`, otro nombre a proposito: `rnc` sigue
    // significando "unirme a una empresa existente", y eso no se concede nunca.
    const rnc = body && typeof body === 'object' ? (body as { rnc?: unknown }).rnc : undefined;
    if (rnc) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REGISTRATION_CLOSED',
            message: 'Para unirte a una empresa existente necesitas una invitación de su administrador.',
          },
        },
        { status: 403 }
      );
    }

    const parsed = esquemaDelRegistro.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const { fullName, email, password } = parsed.data;
    const empresaPedida = empresaDelRegistro(parsed.data);

    // Check if email already exists
    const [existingUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existingUser) {
      return NextResponse.json({ success: false, error: { message: 'El correo electrónico ya está registrado.' } }, { status: 400 });
    }

    // Lote 287: un RNC que ya tiene empresa se RECHAZA (409), con la misma regla que
    // Administracion. Nunca da acceso a esa empresa (F0-02, arriba): se dice que
    // existe y a quien pedirle una cuenta, nada mas.
    if (await rncYaTieneEmpresa(db, empresaPedida.rnc)) {
      return NextResponse.json({ success: false, error: { code: 'RNC_YA_REGISTRADO', message: RNC_YA_REGISTRADO } }, { status: 409 });
    }

    // Hash Password (fuera de la transaccion: bcrypt tarda y no toca la base)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let newUser: { id: string; name: string; email: string };
    try {
      newUser = await db.transaction(async (tx) => {
        const { empresa, roles: allRoles } = await crearEmpresaConSuSiembra(tx, { ...empresaPedida, status: 'active' });
        const companyId: string = empresa.id;

        // El primer usuario de la empresa la administra.
        const adminRole = allRoles.find((r) => r.name === 'administracion');
        if (!adminRole) throw new Error('No existe el rol administracion');

        const [usuario] = await tx
          .insert(users)
          .values({
            companyId,
            roleId: adminRole.id,
            name: fullName,
            email: email.toLowerCase(),
            passwordHash,
            status: 'active',
          })
          .returning({
            id: users.id,
            name: users.name,
            email: users.email,
          });

        // Create Audit Log
        await tx.insert(auditLogs).values({
          // Evento de cuenta, no de entorno: al autenticarse todavia no se ha
          // elegido PRUEBA ni PRODUCCION. Se registra en PRODUCCION, que es
          // ademas el valor por omision de la columna.
          modo: 'PRODUCCION' as const,
          companyId,
          userId: usuario.id,
          action: 'user_registered',
          entityType: 'users',
          entityId: usuario.id,
          newValues: { email: usuario.email, name: usuario.name, empresa: empresa.name, rnc: empresa.rnc },
          ipAddress: ip,
        });

        return usuario;
      });
    } catch (e: unknown) {
      // Dos registros a la vez con el mismo RNC: los dos pasan la consulta de
      // arriba y el segundo choca con el indice unico. El mismo 409, no un 500.
      if (esRncRepetidoEnLaBase(e)) {
        return NextResponse.json({ success: false, error: { code: 'RNC_YA_REGISTRADO', message: RNC_YA_REGISTRADO } }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({
      success: true,
      message: 'Usuario registrado exitosamente.',
      data: {
        user: newUser,
      },
    });
  } catch (error: unknown) {
    console.error('Registration API error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Ha ocurrido un error interno en el servidor.' } },
      { status: 500 }
    );
  }
}
