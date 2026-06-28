import fs from 'fs';
import path from 'path';

// Force load environmental variables from .env
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const firstEqual = trimmed.indexOf('=');
        if (firstEqual !== -1) {
          const key = trimmed.substring(0, firstEqual).trim();
          const val = trimmed.substring(firstEqual + 1).trim();
          process.env[key] = val;
        }
      }
    });
    console.log('Forced .env variables loaded.');
    console.log('DATABASE_URL env var:', process.env.DATABASE_URL);
  }
} catch (e) {
  console.warn('Could not manually load .env file:', e);
}

async function runTests() {
  console.log('=== STARTING INTEGRATION TESTS ===');

  // Dynamically import to ensure process.env.DATABASE_URL is set before db is initialized
  const { db, companies, companySettings, roles, users, permissions, userPermissions, rolePermissions, cashRegisters, cashSessions, cashMovements, cashSessionSummary, auditLogs } = await import('../db');
  const { hasPermission } = await import('../middleware/permissions');
  const { CashService } = await import('../services/cashService');
  const { eq, and, isNull, inArray, or } = await import('drizzle-orm');

  let testCompanyId1 = '';
  let testCompanyId2 = '';
  let supervisorUserId = '';
  let cashierUserId1 = '';
  let cashierUserId2 = '';
  let cashierRoleId = '';
  let adminRoleId = '';
  let cashRegisterId = '';
  let permissionCajaReadId = '';
  let permissionCajaWriteId = '';
  let permissionFacturacionReadId = '';

  try {
    // ----------------------------------------------------
    // PRE-CLEANUP: Clear any leftover mock data from previous crashed runs
    // ----------------------------------------------------
    console.log('[PRE-CLEANUP] Clearing leftover test data...');
    // Find mock company IDs
    const mockCompanies = await db.select({ id: companies.id }).from(companies).where(
      and(
        isNull(companies.deletedAt),
        inArray(companies.rnc, ['101010101', '202020202'])
      )
    );
    const mockIds = mockCompanies.map(c => c.id);

    if (mockIds.length > 0) {
      console.log(`[PRE-CLEANUP] Found ${mockIds.length} leftover companies. Deleting related rows...`);
      
      // Delete in correct dependency order
      await db.delete(cashSessionSummary).where(inArray(cashSessionSummary.companyId, mockIds));
      await db.delete(cashMovements).where(inArray(cashMovements.companyId, mockIds));
      await db.delete(cashSessions).where(inArray(cashSessions.companyId, mockIds));
      await db.delete(cashRegisters).where(inArray(cashRegisters.companyId, mockIds));
      await db.delete(userPermissions).where(inArray(userPermissions.companyId, mockIds));
      await db.delete(rolePermissions).where(inArray(rolePermissions.companyId, mockIds));
      await db.delete(auditLogs).where(inArray(auditLogs.companyId, mockIds));
      await db.delete(companySettings).where(inArray(companySettings.companyId, mockIds));
      await db.delete(users).where(inArray(users.companyId, mockIds));
      await db.delete(companies).where(inArray(companies.id, mockIds));
    }
    console.log('[PRE-CLEANUP] Pre-cleanup completed.');

    // ----------------------------------------------------
    // SETUP: Create Test Entities
    // ----------------------------------------------------
    console.log('[SETUP] Creating mock companies and users...');

    // 1. Create Companies
    const [comp1] = await db.insert(companies).values({
      name: 'Empresa Test Integración 1',
      rnc: '101010101',
      businessActivity: 'Venta de software test 1',
    }).returning({ id: companies.id });
    testCompanyId1 = comp1.id;

    const [comp2] = await db.insert(companies).values({
      name: 'Empresa Test Integración 2',
      rnc: '202020202',
      businessActivity: 'Venta de software test 2',
    }).returning({ id: companies.id });
    testCompanyId2 = comp2.id;

    // 2. Create Company Settings
    await db.insert(companySettings).values({
      companyId: testCompanyId1,
      dgiiEnv: 'test',
      maxCashOutApprovalAmount: '500.00', // Override default to $500 for limit test
    });

    await db.insert(companySettings).values({
      companyId: testCompanyId2,
      dgiiEnv: 'test',
      maxCashOutApprovalAmount: '1000.00',
    });

    // 3. Retrieve global roles
    const allRoles = await db.select().from(roles);
    const roleSistemas = allRoles.find(r => r.name === 'sistemas')!;
    const roleAdmin = allRoles.find(r => r.name === 'administracion')!;
    const roleCajero = allRoles.find(r => r.name === 'cajero')!;
    adminRoleId = roleAdmin.id;
    cashierRoleId = roleCajero.id;

    // 4. Create Users
    const [superUser] = await db.insert(users).values({
      companyId: testCompanyId1,
      roleId: roleAdmin.id,
      name: 'Supervisor Test',
      email: 'supervisor@test.com',
      passwordHash: 'dummyhash',
    }).returning({ id: users.id });
    supervisorUserId = superUser.id;

    const [cashierUser1] = await db.insert(users).values({
      companyId: testCompanyId1,
      roleId: roleCajero.id,
      name: 'Cajero Test 1',
      email: 'cajero1@test.com',
      passwordHash: 'dummyhash',
    }).returning({ id: users.id });
    cashierUserId1 = cashierUser1.id;

    const [cashierUser2] = await db.insert(users).values({
      companyId: testCompanyId2, // Tenant Isolation check: User belongs to Company 2
      roleId: roleCajero.id, // Using same role id for test simplicity or isolated
      name: 'Cajero Test 2',
      email: 'cajero2@test.com',
      passwordHash: 'dummyhash',
    }).returning({ id: users.id });
    cashierUserId2 = cashierUser2.id;

    // Helper for permissions to avoid unique constraints key violations
    const getOrCreatePermission = async (module: string, action: string, description: string) => {
      const [existing] = await db
        .select()
        .from(permissions)
        .where(and(eq(permissions.module, module), eq(permissions.action, action)))
        .limit(1);
      if (existing) return existing;
      const [inserted] = await db.insert(permissions).values({
        module,
        action,
        description,
      }).returning();
      return inserted;
    };

    // 5. Create/Retrieve Permissions Catalog entries
    const permCajaRead = await getOrCreatePermission('caja', 'read', 'Ver caja');
    permissionCajaReadId = permCajaRead.id;

    const permCajaWrite = await getOrCreatePermission('caja', 'write', 'Crear transacciones de caja');
    permissionCajaWriteId = permCajaWrite.id;

    const permFactRead = await getOrCreatePermission('facturacion', 'read', 'Ver facturacion');
    permissionFacturacionReadId = permFactRead.id;

    // 6. Create Cash Register
    const [register] = await db.insert(cashRegisters).values({
      companyId: testCompanyId1,
      name: 'Caja Registradora Principal',
      code: 'REG-001',
    }).returning({ id: cashRegisters.id });
    cashRegisterId = register.id;

    console.log('[SETUP] Mock environment generated successfully.');

    // ----------------------------------------------------
    // TEST 1: Tenant Isolation
    // ----------------------------------------------------
    console.log('\n[TEST 1] Testing Tenancy Isolation...');
    const user1List = await db.select().from(users).where(eq(users.companyId, testCompanyId1));
    const user2List = await db.select().from(users).where(eq(users.companyId, testCompanyId2));

    if (user1List.some(u => u.companyId !== testCompanyId1)) {
      throw new Error('Tenant Isolation Failed: Company 1 queries returned Company 2 data.');
    }
    if (user2List.some(u => u.companyId !== testCompanyId2)) {
      throw new Error('Tenant Isolation Failed: Company 2 queries returned Company 1 data.');
    }
    console.log('=> Tenant Isolation PASSED.');

    // ----------------------------------------------------
    // TEST 2: Permissions Resolution Flow
    // ----------------------------------------------------
    console.log('\n[TEST 2] Testing Permissions Resolution Flow...');

    // A. Fixed Role: sistemas (Must always be true)
    const sistemasAllowed = await hasPermission(supervisorUserId, 'sistemas', adminRoleId, 'administracion', 'write');
    if (!sistemasAllowed) {
      throw new Error('Permissions Resolution Failed: "sistemas" should have access to administration:write.');
    }

    // B. Fixed Role: administracion (Operational full access, restricted audit)
    const adminAllowedOp = await hasPermission(supervisorUserId, 'administracion', adminRoleId, 'caja', 'write');
    const adminAllowedAudit = await hasPermission(supervisorUserId, 'administracion', adminRoleId, 'auditoria', 'write');
    if (!adminAllowedOp || adminAllowedAudit) {
      throw new Error(`Permissions Resolution Failed: "administracion" roles has wrong rules. Op allowed: ${adminAllowedOp}, Audit allowed: ${adminAllowedAudit}`);
    }

    // C. Default Role Permissions: cajero (facturacion:read should be false by default)
    const cashierDefaultAllowed = await hasPermission(cashierUserId1, 'cajero', cashierRoleId, 'facturacion', 'read');
    if (cashierDefaultAllowed) {
      throw new Error('Permissions Resolution Failed: Cajero should not have "facturacion:read" by default.');
    }

    // D. User Override: Grant "facturacion:read" explicitly to cashierUser1
    await db.insert(userPermissions).values({
      companyId: testCompanyId1,
      userId: cashierUserId1,
      permissionId: permissionFacturacionReadId,
      granted: true,
      updatedBy: supervisorUserId,
    });

    const cashierOverriddenAllowed = await hasPermission(cashierUserId1, 'cajero', cashierRoleId, 'facturacion', 'read');
    if (!cashierOverriddenAllowed) {
      throw new Error('Permissions Resolution Failed: Cajero should have "facturacion:read" after explicit override grant.');
    }

    // E. User Override: Deny "caja:read" explicitly to cashierUser1 (Default is true)
    await db.insert(userPermissions).values({
      companyId: testCompanyId1,
      userId: cashierUserId1,
      permissionId: permissionCajaReadId,
      granted: false,
      updatedBy: supervisorUserId,
    });

    const cashierOverriddenDenied = await hasPermission(cashierUserId1, 'cajero', cashierRoleId, 'caja', 'read');
    if (cashierOverriddenDenied) {
      throw new Error('Permissions Resolution Failed: Cajero should not have "caja:read" after explicit override deny.');
    }

    console.log('=> Permissions Resolution PASSED.');

    // ----------------------------------------------------
    // TEST 3: Cashier Restrictive Rules
    // ----------------------------------------------------
    console.log('\n[TEST 3] Testing Cashier Restrictive Rules...');

    // A. Negative initial fund (Should throw error)
    try {
      await CashService.openSession(cashierUserId1, testCompanyId1, cashRegisterId, -100);
      throw new Error('Cashier Rules Failed: Allowed opening session with negative initial fund.');
    } catch (e: any) {
      if (!e.message.includes('fondo inicial de caja no puede ser negativo')) {
        throw e;
      }
      console.log('A. Opening session with negative fund correctly blocked.');
    }

    // B. Open a valid session
    const session = await CashService.openSession(cashierUserId1, testCompanyId1, cashRegisterId, 1000);
    const sessionId = session.id;
    console.log(`B. Session opened successfully with ID: ${sessionId}`);

    // C. Open second session (Should throw error)
    try {
      await CashService.openSession(cashierUserId1, testCompanyId1, cashRegisterId, 500);
      throw new Error('Cashier Rules Failed: Allowed opening multiple active sessions for the same cashier.');
    } catch (e: any) {
      if (!e.message.includes('Ya tiene una sesión de caja activa')) {
        throw e;
      }
      console.log('C. Opening second active session correctly blocked.');
    }

    // D. Add movement: Outflow within threshold ($200 <= $500 max limit)
    const normalMove = await CashService.addMovement(
      cashierUserId1,
      testCompanyId1,
      sessionId,
      'cash_out',
      200,
      'Pago menor a proveedor'
    );
    if (normalMove.requiresApproval) {
      throw new Error('Cashier Rules Failed: Outflow within threshold flagged for supervisor approval.');
    }
    console.log('D. Movement within limit registered directly.');

    // E. Add movement: Outflow exceeding threshold ($600 > $500 max limit)
    const approvalMove = await CashService.addMovement(
      cashierUserId1,
      testCompanyId1,
      sessionId,
      'cash_out',
      600,
      'Pago mayor de compras'
    );
    if (!approvalMove.requiresApproval || approvalMove.reference !== 'pending_supervisor') {
      throw new Error('Cashier Rules Failed: Outflow exceeding threshold did not require supervisor approval.');
    }
    console.log('E. Movement exceeding limit correctly flagged for approval.');

    // F. Close session: With difference but NO justification (Should throw error)
    try {
      // Expected balance: 1000 (initial) - 200 (normal cash_out) - 600 (exceeded cash_out) = 200
      await CashService.closeSession(cashierUserId1, testCompanyId1, sessionId, 250); // Difference of +$50
      throw new Error('Cashier Rules Failed: Allowed closing session with difference and no justification.');
    } catch (e: any) {
      if (!e.message.includes('Debe proveer una justificación')) {
        throw e;
      }
      console.log('F. Closing with difference and no justification correctly blocked.');
    }

    // G. Close session: With difference AND justification (Should succeed)
    // Expected balance: 1000 (initial) - 200 (normal cash_out) - 600 (exceeded cash_out) = 200
    const closedSession = await CashService.closeSession(
      cashierUserId1,
      testCompanyId1,
      sessionId,
      150, // 150 actual balance vs 200 expected balance gives -50 difference
      'Faltante de $50 por vueltas inexactas'
    );
    console.log('[DEBUG] closedSession status:', closedSession.session?.status);
    console.log('[DEBUG] closedSession difference:', closedSession.session?.difference);
    console.log('[DEBUG] parsed difference:', parseFloat(closedSession.session?.difference || '0'));
    if (closedSession.session.status !== 'closed' || parseFloat(closedSession.session.difference || '0') !== -50) {
      throw new Error(`Cashier Rules Failed: Session closing failed with justification. Expected closed/ -50, got ${closedSession.session?.status}/ ${closedSession.session?.difference}`);
    }
    console.log('G. Session closed successfully with difference justification.');

    // H. Add movement to closed session (Should throw error)
    try {
      await CashService.addMovement(
        cashierUserId1,
        testCompanyId1,
        sessionId,
        'cash_in',
        100,
        'Entrada post-cierre'
      );
      throw new Error('Cashier Rules Failed: Allowed registering movements on closed cash session.');
    } catch (e: any) {
      if (!e.message.includes('La sesión de caja está cerrada')) {
        throw e;
      }
      console.log('H. Movement to closed session correctly blocked.');
    }

    console.log('=> Cashier Restrictive Rules PASSED.');

  } finally {
    // ----------------------------------------------------
    // CLEANUP: Delete Test Entities
    // ----------------------------------------------------
    console.log('\n[CLEANUP] Cleaning up test entities...');

    const testIds = [testCompanyId1, testCompanyId2].filter(Boolean);
    if (testIds.length > 0) {
      await db.delete(cashSessionSummary).where(inArray(cashSessionSummary.companyId, testIds));
      await db.delete(cashMovements).where(inArray(cashMovements.companyId, testIds));
      await db.delete(cashSessions).where(inArray(cashSessions.companyId, testIds));
      await db.delete(cashRegisters).where(inArray(cashRegisters.companyId, testIds));
      await db.delete(userPermissions).where(inArray(userPermissions.companyId, testIds));
      await db.delete(rolePermissions).where(inArray(rolePermissions.companyId, testIds));
      await db.delete(auditLogs).where(inArray(auditLogs.companyId, testIds));
      await db.delete(companySettings).where(inArray(companySettings.companyId, testIds));
      await db.delete(users).where(inArray(users.companyId, testIds));
      await db.delete(companies).where(inArray(companies.id, testIds));
    }
    console.log('[CLEANUP] Cleanup completed.');
  }

  console.log('\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch(err => {
  console.error('\n!!! TEST RUN ENCOUNTERED AN ERROR !!!');
  console.error(err);
  process.exit(1);
});
