import { db, users, roles, sessions, auditLogs } from '@/db';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { exigirAltaDeUsuario } from '@/services/suscripcion/planRepositorio';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { esSistemas } from '@/utils/rolMatch';

export interface CreateUserInput {
  companyId: string;
  name: string;
  email: string;
  passwordRaw: string;
  roleId: string;
  avatarUrl?: string | null;
  avatarPath?: string | null;
}

export class AdminRepository {
  static async getUsers(companyId: string) {
    const data = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        createdAt: users.createdAt,
        avatarUrl: users.avatarUrl,
        avatarPath: users.avatarPath,
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.companyId, companyId)))
      .orderBy(desc(users.createdAt));

    return data;
  }

  static async getRoles() {
    return await db.select()
      .from(roles)
      .orderBy(roles.name);
  }

  static async createUser(data: CreateUserInput) {
    return await db.transaction(async (tx) => {
      // 1. LOTE 299: el plan, con la regla unica. Antes solo se limitaba si habia
      //    una suscripcion `active` (sin ella, usuarios sin limite) y dos altas a la
      //    vez contaban las dos N-1. Ahora: plan vigente (`trialing` incluido) y la
      //    cuenta bajo un candado por empresa, DENTRO de esta transaccion. Lanza
      //    `PlanNoPermiteError` (403 sin plan, 409 con el cupo lleno).
      await exigirAltaDeUsuario(tx, data.companyId);

      // 2. Check email exists
      const existing = await tx.select().from(users).where(eq(users.email, data.email));
      if (existing.length > 0) throw new Error('El correo electrónico ya está en uso');

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(data.passwordRaw, salt);

      const [newUser] = await tx.insert(users).values({
        id: uuidv4(),
        companyId: data.companyId,
        roleId: data.roleId,
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        status: 'active',
        avatarUrl: data.avatarUrl || null,
        avatarPath: data.avatarPath || null
      }).returning();

      return {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        status: newUser.status,
        avatarUrl: newUser.avatarUrl,
        avatarPath: newUser.avatarPath
      };
    });
  }

  static async updateUser(
    userId: string,
    companyId: string,
    data: {
      name: string;
      email: string;
      passwordRaw?: string;
      roleId: string;
      avatarUrl?: string | null;
      avatarPath?: string | null;
    },
    /** Quien lo hace, para el registro. Lote 177. */
    actorId?: string,
  ) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.companyId, companyId)));
      if (!existing) throw new Error('Usuario no encontrado');

      const existingEmail = await tx
        .select()
        .from(users)
        .where(and(eq(users.email, data.email.toLowerCase()), eq(users.companyId, companyId)));
      const otherUserUsingEmail = existingEmail.find(u => u.id !== userId);
      if (otherUserUsingEmail) throw new Error('El correo electrónico ya está en uso');

      const updateData: Partial<typeof users.$inferInsert> = {
        name: data.name,
        email: data.email.toLowerCase(),
        roleId: data.roleId,
        avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : existing.avatarUrl,
        avatarPath: data.avatarPath !== undefined ? data.avatarPath : existing.avatarPath,
        updatedAt: new Date()
      };

      const cambiaLaClave = !!(data.passwordRaw && data.passwordRaw.trim().length >= 6);
      if (cambiaLaClave) {
        const salt = await bcrypt.genSalt(10);
        updateData.passwordHash = await bcrypt.hash(data.passwordRaw!, salt);
      }

      // Auditoria P1-16 (2026-09-03): el SELECT de arriba si valida
      // companyId, pero este UPDATE final solo filtraba por userId -- sin
      // ninguna via de explotacion demostrada hoy (el SELECT previo ya
      // corta el paso), pero repetir companyId aqui es defensa en
      // profundidad barata: si algun dia se quita o se rompe ese SELECT,
      // este UPDATE por si solo sigue sin poder tocar un usuario de otra
      // empresa.
      const [updated] = await tx
        .update(users)
        .set(updateData)
        .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
        .returning();

      // Lote 177: cambiarle la contraseña a alguien CIERRA SUS SESIONES.
      //
      // Hasta ahora se le cambiaba la clave y quien tuviera su sesion abierta
      // seguia dentro -- incluido el motivo por el que se le cambia. Decidido
      // por el dueño el 2026-09-21: el mismo criterio que la recuperacion por
      // correo. Va DENTRO de la transaccion: cambiar la clave y no cerrar la
      // sesion es justo el estado que no debe existir ni un instante.
      if (cambiaLaClave) {
        await tx.update(sessions)
          .set({ invalidatedAt: new Date() })
          .where(and(eq(sessions.userId, userId), isNull(sessions.invalidatedAt)));

        await tx.insert(auditLogs).values({
          // Evento de cuenta: no pertenece a PRUEBA ni a PRODUCCION. Mismo
          // criterio que el acceso y que la recuperacion.
          modo: 'PRODUCCION',
          companyId,
          userId: actorId ?? userId,
          action: 'password_reset_admin',
          entityType: 'users',
          entityId: userId,
          oldValues: {},
          newValues: { motivo: 'Contraseña asignada por administración; se cerraron las sesiones del usuario.' },
        });
      }

      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        status: updated.status,
        avatarUrl: updated.avatarUrl,
        avatarPath: updated.avatarPath
      };
    });
  }

  static async toggleUserStatus(userId: string, companyId: string, actingUserRole: string) {
    const [userWithRole] = await db
      .select({
         user: users,
         roleName: roles.name
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, userId), eq(users.companyId, companyId)));
      
    if (!userWithRole) throw new Error('Usuario no encontrado');

    // Auditoria P0-02 (2026-09-03): antes .includes('sistema'), que
    // trataba como "de sistemas" (protegido de suspension) a cualquier rol
    // cuyo nombre contuviera esas letras. Ver utils/rolMatch.ts.
    const isTargetSystem = esSistemas(userWithRole.roleName);

    if (isTargetSystem) {
       throw new Error('No se puede suspender o activar a un usuario con el rol de sistemas.');
    }

    const newStatus = userWithRole.user.status === 'active' ? 'inactive' : 'active';

    // LOTE 299: reactivar ocupa cupo igual que dar de alta, y pasa por la misma
    // guarda. Antes se contaba FUERA de cualquier transaccion: dos reactivaciones
    // a la vez pasaban las dos. Ahora la cuenta y el cambio van en la misma
    // transaccion, bajo el candado de la empresa. Desactivar no pide nada.
    return await db.transaction(async (tx) => {
      if (newStatus === 'active') {
        await exigirAltaDeUsuario(tx, companyId);
      }

      // Auditoria P1-16 (2026-09-03): mismo caso que updateUser -- el SELECT
      // de arriba ya valida companyId, esto es defensa en profundidad.
      const [updated] = await tx.update(users)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
        .returning();

      return { id: updated.id, status: updated.status };
    });
  }

  static async createRole(name: string, description: string) {
    const roleNameClean = name.trim().toLowerCase();
    
    // Check if role name already exists
    const existing = await db
      .select()
      .from(roles)
      .where(eq(roles.name, roleNameClean));
 
    if (existing.length > 0) {
      throw new Error(`El rol "${name}" ya existe.`);
    }
 
    const [newRole] = await db
      .insert(roles)
      .values({
        id: uuidv4(),
        name: roleNameClean,
        description: description.trim(),
        isFixed: false, // Custom roles are never fixed
      })
      .returning();
 
    return newRole;
  }
}
