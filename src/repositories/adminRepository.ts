import { db, users, roles } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

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
      // Check email exists
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
    }
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

      const updateData: any = {
        name: data.name,
        email: data.email.toLowerCase(),
        roleId: data.roleId,
        avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : existing.avatarUrl,
        avatarPath: data.avatarPath !== undefined ? data.avatarPath : existing.avatarPath,
        updatedAt: new Date()
      };

      if (data.passwordRaw && data.passwordRaw.trim().length >= 6) {
        const salt = await bcrypt.genSalt(10);
        updateData.passwordHash = await bcrypt.hash(data.passwordRaw, salt);
      }

      const [updated] = await tx
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

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

    const isTargetSystem = userWithRole.roleName?.toLowerCase().includes('sistema');

    if (isTargetSystem) {
       throw new Error('No se puede suspender o activar a un usuario con el rol de sistemas.');
    }

    const newStatus = userWithRole.user.status === 'active' ? 'inactive' : 'active';
    
    const [updated] = await db.update(users)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return { id: updated.id, status: updated.status };
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
