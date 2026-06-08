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
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.companyId, companyId)))
      .orderBy(desc(users.createdAt));

    return data;
  }

  static async getRoles(companyId: string) {
    // Currently returns roles created for this company, plus any global fixed roles if applicable
    return await db.select()
      .from(roles)
      .where(eq(roles.companyId, companyId))
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
        status: 'active'
      }).returning();

      return {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        status: newUser.status
      };
    });
  }

  static async toggleUserStatus(userId: string, companyId: string) {
    const [user] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.companyId, companyId)));
    if (!user) throw new Error('Usuario no encontrado');

    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    
    const [updated] = await db.update(users)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return { id: updated.id, status: updated.status };
  }
}
