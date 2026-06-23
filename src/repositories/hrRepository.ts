import {
  db,
  employees,
  departments,
  positions,
  payrolls,
  payrollDetails,
  overtimeRecords,
  employeeIncome,
  employeeDeductions,
  employeeVacations,
  employeeLeaves,
  employeeSettlements,
  isrBrackets,
  payrollConfigs,
  auditLogs,
} from '@/db';
import { eq, and, isNull, sql, desc, or, between, like } from 'drizzle-orm';
import { PayrollCalculationService } from '@/services/payrollCalculationService';

export class HRRepository {
  // ─── DEPARTMENTS & POSITIONS ───────────────────────────────────────────────

  static async findDepartments(companyId: string) {
    return db
      .select()
      .from(departments)
      .where(and(eq(departments.companyId, companyId), isNull(departments.deletedAt)))
      .orderBy(departments.name);
  }

  static async createDepartment(data: { companyId: string; name: string; description?: string }) {
    const [inserted] = await db.insert(departments).values(data).returning();
    return inserted;
  }

  static async updateDepartment(id: string, companyId: string, data: { name: string; description?: string }) {
    const [updated] = await db
      .update(departments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(departments.id, id), eq(departments.companyId, companyId)))
      .returning();
    return updated;
  }

  static async deleteDepartment(id: string, companyId: string) {
    const [deleted] = await db
      .update(departments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(departments.id, id), eq(departments.companyId, companyId)))
      .returning();
    return deleted;
  }

  static async findPositions(companyId: string) {
    return db
      .select()
      .from(positions)
      .where(and(eq(positions.companyId, companyId), isNull(positions.deletedAt)))
      .orderBy(positions.name);
  }

  static async createPosition(data: { companyId: string; name: string; description?: string }) {
    const [inserted] = await db.insert(positions).values(data).returning();
    return inserted;
  }

  static async updatePosition(id: string, companyId: string, data: { name: string; description?: string }) {
    const [updated] = await db
      .update(positions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(positions.id, id), eq(positions.companyId, companyId)))
      .returning();
    return updated;
  }

  static async deletePosition(id: string, companyId: string) {
    const [deleted] = await db
      .update(positions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(positions.id, id), eq(positions.companyId, companyId)))
      .returning();
    return deleted;
  }

  // ─── EMPLOYEES CRUD ────────────────────────────────────────────────────────

  static async findEmployeeById(id: string, companyId: string) {
    const [emp] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.companyId, companyId), isNull(employees.deletedAt)))
      .limit(1);
    return emp;
  }

  static async findEmployees(companyId: string, search?: string, limit = 50, offset = 0) {
    let whereClause = and(eq(employees.companyId, companyId), isNull(employees.deletedAt));

    if (search) {
      whereClause = and(
        eq(employees.companyId, companyId),
        isNull(employees.deletedAt),
        or(
          like(employees.firstName, `%${search}%`),
          like(employees.lastName, `%${search}%`),
          like(employees.cedula, `%${search}%`),
          like(employees.employeeCode, `%${search}%`)
        )
      );
    }

    const data = await db
      .select()
      .from(employees)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(employees.createdAt));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(whereClause);

    return {
      data,
      total: Number(countResult?.count || 0),
    };
  }

  static async createEmployee(companyId: string, data: any) {
    return db.transaction(async (tx) => {
      // 1. Create employee record
      const [newEmp] = await tx
        .insert(employees)
        .values({
          ...data,
          companyId,
          salary: data.salary.toString(),
        })
        .returning();

      // 2. Initialize vacation record
      await tx.insert(employeeVacations).values({
        companyId,
        employeeId: newEmp.id,
        generatedDays: 0,
        takenDays: 0,
        availableDays: 0,
      });

      return newEmp;
    });
  }

  static async updateEmployee(id: string, companyId: string, data: any) {
    const [updated] = await db
      .update(employees)
      .set({
        ...data,
        salary: data.salary ? data.salary.toString() : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(employees.id, id), eq(employees.companyId, companyId)))
      .returning();
    return updated;
  }

  static async deleteEmployee(id: string, companyId: string) {
    const [deleted] = await db
      .update(employees)
      .set({ deletedAt: new Date(), updatedAt: new Date(), status: 'cancelled' })
      .where(and(eq(employees.id, id), eq(employees.companyId, companyId)))
      .returning();
    return deleted;
  }

  // ─── PAYROLL MANAGEMENT ───────────────────────────────────────────────────

  static async getPayrollConfig(companyId: string): Promise<any> {
    const [config] = await db
      .select()
      .from(payrollConfigs)
      .where(eq(payrollConfigs.companyId, companyId))
      .limit(1);
    return config;
  }

  static async updatePayrollConfig(companyId: string, data: any) {
    const [updated] = await db
      .update(payrollConfigs)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(payrollConfigs.companyId, companyId))
      .returning();
    return updated;
  }

  static async getIsrBrackets() {
    return db.select().from(isrBrackets).orderBy(isrBrackets.fromAmount);
  }

  static async findPayrollById(id: string, companyId: string) {
    const [payroll] = await db
      .select()
      .from(payrolls)
      .where(and(eq(payrolls.id, id), eq(payrolls.companyId, companyId), isNull(payrolls.deletedAt)))
      .limit(1);
    return payroll;
  }

  static async findPayrolls(companyId: string, limit = 50, offset = 0) {
    const data = await db
      .select()
      .from(payrolls)
      .where(and(eq(payrolls.companyId, companyId), isNull(payrolls.deletedAt)))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(payrolls.periodStart));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(payrolls)
      .where(and(eq(payrolls.companyId, companyId), isNull(payrolls.deletedAt)));

    return {
      data,
      total: Number(countResult?.count || 0),
    };
  }

  static async findPayrollDetails(payrollId: string, companyId: string) {
    return db
      .select({
        id: payrollDetails.id,
        payrollId: payrollDetails.payrollId,
        employeeId: payrollDetails.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        cedula: employees.cedula,
        baseSalary: payrollDetails.baseSalary,
        overtimeAmount: payrollDetails.overtimeAmount,
        bonusAmount: payrollDetails.bonusAmount,
        commissionAmount: payrollDetails.commissionAmount,
        grossSalary: payrollDetails.grossSalary,
        afp: payrollDetails.afp,
        sfs: payrollDetails.sfs,
        isr: payrollDetails.isr,
        otherDeductions: payrollDetails.otherDeductions,
        netSalary: payrollDetails.netSalary,
        afpEmployer: payrollDetails.afpEmployer,
        sfsEmployer: payrollDetails.sfsEmployer,
        riskEmployer: payrollDetails.riskEmployer,
        infotepEmployer: payrollDetails.infotepEmployer,
      })
      .from(payrollDetails)
      .innerJoin(employees, eq(payrollDetails.employeeId, employees.id))
      .where(and(eq(payrollDetails.payrollId, payrollId), eq(payrollDetails.companyId, companyId)))
      .orderBy(employees.firstName);
  }

  static async createPayroll(companyId: string, data: { periodStart: string; periodEnd: string; paymentDate: string; createdBy?: string }) {
    return db.transaction(async (tx) => {
      // 1. Create payroll record
      const [payroll] = await tx
        .insert(payrolls)
        .values({
          companyId,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          paymentDate: data.paymentDate,
          status: 'draft',
          createdBy: data.createdBy,
        })
        .returning();

      // 2. Perform initial calculations
      await this.recalculatePayrollTx(tx, payroll.id, companyId);

      return payroll;
    });
  }

  static async recalculatePayroll(payrollId: string, companyId: string) {
    return db.transaction(async (tx) => {
      await this.recalculatePayrollTx(tx, payrollId, companyId);
    });
  }

  private static async recalculatePayrollTx(tx: any, payrollId: string, companyId: string) {
    // 1. Clear existing details
    await tx.delete(payrollDetails).where(eq(payrollDetails.payrollId, payrollId));

    // 2. Fetch payroll period
    const [payroll] = await tx.select().from(payrolls).where(eq(payrolls.id, payrollId)).limit(1);
    if (!payroll) throw new Error('Payroll period not found');

    const start = payroll.periodStart;
    const end = payroll.periodEnd;

    // 3. Fetch active employees
    const activeEmployees = await tx
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, 'active'), isNull(employees.deletedAt)));

    // 4. Fetch laws configuration and ISR Brackets
    const config = await tx
      .select()
      .from(payrollConfigs)
      .where(eq(payrollConfigs.companyId, companyId))
      .limit(1)
      .then((rows: any[]) => rows[0]);

    const brackets = await tx.select().from(isrBrackets).orderBy(isrBrackets.fromAmount);

    // 5. For each employee, fetch incomes/deductions and compute details
    for (const emp of activeEmployees) {
      // Fetch Overtime sum for this employee in period
      const [overtimeSum] = await tx
        .select({ total: sql<string>`sum(amount)` })
        .from(overtimeRecords)
        .where(
          and(
            eq(overtimeRecords.employeeId, emp.id),
            eq(overtimeRecords.status, 'pending'),
            between(overtimeRecords.dateWorked, start, end)
          )
        );

      // Fetch Commissions/Bonuses (employee_income) sum in period
      const incomes = await tx
        .select()
        .from(employeeIncome)
        .where(
          and(
            eq(employeeIncome.employeeId, emp.id),
            eq(employeeIncome.status, 'pending'),
            between(employeeIncome.date, start, end)
          )
        );
      
      let commissionSum = 0;
      let bonusSum = 0;
      for (const inc of incomes) {
        if (inc.type === 'comision') commissionSum += Number(inc.amount);
        else bonusSum += Number(inc.amount);
      }

      // Fetch Deductions sum in period
      const [deductionSum] = await tx
        .select({ total: sql<string>`sum(amount)` })
        .from(employeeDeductions)
        .where(
          and(
            eq(employeeDeductions.employeeId, emp.id),
            eq(employeeDeductions.status, 'pending'),
            between(employeeDeductions.date, start, end)
          )
        );

      // Calculate details using service
      const payrollCalcs = PayrollCalculationService.calculateDetails({
        baseSalary: Number(emp.salary),
        overtimeAmount: Number(overtimeSum?.total || 0),
        bonusAmount: bonusSum,
        commissionAmount: commissionSum,
        otherDeductions: Number(deductionSum?.total || 0),
        isrBrackets: brackets.map((b: any) => ({
          fromAmount: Number(b.fromAmount),
          toAmount: b.toAmount ? Number(b.toAmount) : null,
          fixedAmount: Number(b.fixedAmount),
          percentage: Number(b.percentage),
        })),
        config: {
          afpEmployee: Number(config.afpEmployee),
          sfsEmployee: Number(config.sfsEmployee),
          afpEmployer: Number(config.afpEmployer),
          sfsEmployer: Number(config.sfsEmployer),
          infotepEmployer: Number(config.infotepEmployer),
          riskEmployer: Number(config.riskEmployer),
          overtimeDiurnaRate: Number(config.overtimeDiurnaRate),
          overtimeNocturnaRate: Number(config.overtimeNocturnaRate),
          overtimeFestivaRate: Number(config.overtimeFestivaRate),
          overtimeDobleRate: Number(config.overtimeDobleRate),
        },
      });

      // Insert payroll details row
      await tx.insert(payrollDetails).values({
        companyId,
        payrollId,
        employeeId: emp.id,
        baseSalary: payrollCalcs.baseSalary.toString(),
        overtimeAmount: payrollCalcs.overtimeAmount.toString(),
        bonusAmount: payrollCalcs.bonusAmount.toString(),
        commissionAmount: payrollCalcs.commissionAmount.toString(),
        grossSalary: payrollCalcs.grossSalary.toString(),
        afp: payrollCalcs.afp.toString(),
        sfs: payrollCalcs.sfs.toString(),
        isr: payrollCalcs.isr.toString(),
        otherDeductions: payrollCalcs.otherDeductions.toString(),
        netSalary: payrollCalcs.netSalary.toString(),
        afpEmployer: payrollCalcs.afpEmployer.toString(),
        sfsEmployer: payrollCalcs.sfsEmployer.toString(),
        riskEmployer: payrollCalcs.riskEmployer.toString(),
        infotepEmployer: payrollCalcs.infotepEmployer.toString(),
      });
    }

    // Set status to calculated
    await tx.update(payrolls).set({ status: 'calculated' }).where(eq(payrolls.id, payrollId));
  }

  static async approvePayroll(payrollId: string, companyId: string, userId: string) {
    return db.transaction(async (tx) => {
      const [payroll] = await tx.select().from(payrolls).where(eq(payrolls.id, payrollId)).limit(1);
      if (!payroll) throw new Error('Nómina no encontrada');
      if (payroll.status !== 'calculated' && payroll.status !== 'draft') {
        throw new Error('Solo se pueden aprobar nóminas calculadas o borradores');
      }

      const start = payroll.periodStart;
      const end = payroll.periodEnd;

      // 1. Update status to approved
      await tx.update(payrolls).set({ status: 'approved', updatedAt: new Date() }).where(eq(payrolls.id, payrollId));

      // 2. Mark overtime records, incomes, and deductions as processed in this period
      const details = await tx.select().from(payrollDetails).where(eq(payrollDetails.payrollId, payrollId));
      const employeeIds = details.map((d: any) => d.employeeId);

      if (employeeIds.length > 0) {
        // Mark overtime records as processed
        await tx
          .update(overtimeRecords)
          .set({ status: 'processed' })
          .where(
            and(
              between(overtimeRecords.dateWorked, start, end),
              eq(overtimeRecords.status, 'pending')
            )
          );

        // Mark incomes as processed
        await tx
          .update(employeeIncome)
          .set({ status: 'processed' })
          .where(
            and(
              between(employeeIncome.date, start, end),
              eq(employeeIncome.status, 'pending')
            )
          );

        // Mark deductions as processed
        await tx
          .update(employeeDeductions)
          .set({ status: 'processed' })
          .where(
            and(
              between(employeeDeductions.date, start, end),
              eq(employeeDeductions.status, 'pending')
            )
          );
      }

      // 3. Log Audit Trail
      await tx.insert(auditLogs).values({
        companyId,
        userId,
        action: 'approve_payroll',
        entityType: 'payrolls',
        entityId: payrollId,
        oldValues: { status: payroll.status },
        newValues: { status: 'approved' },
        ipAddress: 'System',
      });
    });
  }

  static async deletePayroll(payrollId: string, companyId: string) {
    const [payroll] = await db.select().from(payrolls).where(eq(payrolls.id, payrollId)).limit(1);
    if (payroll && payroll.status !== 'draft' && payroll.status !== 'calculated') {
      throw new Error('No se pueden eliminar nóminas aprobadas o pagadas');
    }
    
    return db.transaction(async (tx) => {
      await tx.delete(payrollDetails).where(eq(payrollDetails.payrollId, payrollId));
      return tx
        .update(payrolls)
        .set({ deletedAt: new Date(), updatedAt: new Date(), status: 'cancelled' })
        .where(and(eq(payrolls.id, payrollId), eq(payrolls.companyId, companyId)))
        .returning();
    });
  }

  // ─── ADDITIONAL ENTRIES (OVERTIME, INCOME, DEDUCTIONS) ────────────────────

  static async createOvertimeRecord(companyId: string, data: any) {
    const config = await this.getPayrollConfig(companyId);
    const employee = await this.findEmployeeById(data.employeeId, companyId);
    if (!employee) throw new Error('Empleado no encontrado');

    const amount = PayrollCalculationService.calculateOvertime(
      Number(employee.salary),
      Number(data.hours),
      data.type,
      config
    );

    const [inserted] = await db
      .insert(overtimeRecords)
      .values({
        ...data,
        companyId,
        hours: data.hours.toString(),
        amount: amount.toString(),
        status: 'pending',
      })
      .returning();
    return inserted;
  }

  static async createIncomeRecord(companyId: string, data: any) {
    const [inserted] = await db
      .insert(employeeIncome)
      .values({
        ...data,
        companyId,
        amount: data.amount.toString(),
        status: 'pending',
      })
      .returning();
    return inserted;
  }

  static async createDeductionRecord(companyId: string, data: any) {
    const [inserted] = await db
      .insert(employeeDeductions)
      .values({
        ...data,
        companyId,
        amount: data.amount.toString(),
        status: 'pending',
      })
      .returning();
    return inserted;
  }

  // ─── VACATIONS & LEAVES ───────────────────────────────────────────────────

  static async findVacations(companyId: string) {
    return db
      .select({
        id: employeeVacations.id,
        employeeId: employeeVacations.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        generatedDays: employeeVacations.generatedDays,
        takenDays: employeeVacations.takenDays,
        availableDays: employeeVacations.availableDays,
      })
      .from(employeeVacations)
      .innerJoin(employees, eq(employeeVacations.employeeId, employees.id))
      .where(eq(employeeVacations.companyId, companyId))
      .orderBy(employees.firstName);
  }

  static async updateVacationDays(employeeId: string, companyId: string, generated: number, taken: number) {
    const [vac] = await db
      .select()
      .from(employeeVacations)
      .where(and(eq(employeeVacations.employeeId, employeeId), eq(employeeVacations.companyId, companyId)))
      .limit(1);

    const newGen = (vac?.generatedDays || 0) + generated;
    const newTaken = (vac?.takenDays || 0) + taken;
    const newAvail = Math.max(0, newGen - newTaken);

    const [updated] = await db
      .update(employeeVacations)
      .set({
        generatedDays: newGen,
        takenDays: newTaken,
        availableDays: newAvail,
        updatedAt: new Date(),
      })
      .where(and(eq(employeeVacations.employeeId, employeeId), eq(employeeVacations.companyId, companyId)))
      .returning();
    return updated;
  }

  static async findLeaves(companyId: string) {
    return db
      .select({
        id: employeeLeaves.id,
        employeeId: employeeLeaves.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        type: employeeLeaves.type,
        startDate: employeeLeaves.startDate,
        endDate: employeeLeaves.endDate,
        notes: employeeLeaves.notes,
        status: employeeLeaves.status,
      })
      .from(employeeLeaves)
      .innerJoin(employees, eq(employeeLeaves.employeeId, employees.id))
      .where(eq(employeeLeaves.companyId, companyId))
      .orderBy(desc(employeeLeaves.createdAt));
  }

  static async createLeave(companyId: string, data: any) {
    const [inserted] = await db
      .insert(employeeLeaves)
      .values({
        ...data,
        companyId,
        status: 'approved',
      })
      .returning();
    return inserted;
  }

  static async findOvertimeRecords(companyId: string) {
    return db
      .select({
        id: overtimeRecords.id,
        employeeId: overtimeRecords.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        dateWorked: overtimeRecords.dateWorked,
        hours: overtimeRecords.hours,
        type: overtimeRecords.type,
        amount: overtimeRecords.amount,
        status: overtimeRecords.status,
        createdAt: overtimeRecords.createdAt,
      })
      .from(overtimeRecords)
      .innerJoin(employees, eq(overtimeRecords.employeeId, employees.id))
      .where(eq(overtimeRecords.companyId, companyId))
      .orderBy(desc(overtimeRecords.dateWorked));
  }

  static async deleteOvertimeRecord(id: string, companyId: string) {
    const [deleted] = await db
      .delete(overtimeRecords)
      .where(and(eq(overtimeRecords.id, id), eq(overtimeRecords.companyId, companyId)))
      .returning();
    return deleted;
  }

  static async findIncomeRecords(companyId: string) {
    return db
      .select({
        id: employeeIncome.id,
        employeeId: employeeIncome.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        type: employeeIncome.type,
        description: employeeIncome.description,
        amount: employeeIncome.amount,
        date: employeeIncome.date,
        status: employeeIncome.status,
        createdAt: employeeIncome.createdAt,
      })
      .from(employeeIncome)
      .innerJoin(employees, eq(employeeIncome.employeeId, employees.id))
      .where(eq(employeeIncome.companyId, companyId))
      .orderBy(desc(employeeIncome.date));
  }

  static async deleteIncomeRecord(id: string, companyId: string) {
    const [deleted] = await db
      .delete(employeeIncome)
      .where(and(eq(employeeIncome.id, id), eq(employeeIncome.companyId, companyId)))
      .returning();
    return deleted;
  }

  static async findDeductionRecords(companyId: string) {
    return db
      .select({
        id: employeeDeductions.id,
        employeeId: employeeDeductions.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        type: employeeDeductions.type,
        description: employeeDeductions.description,
        amount: employeeDeductions.amount,
        date: employeeDeductions.date,
        status: employeeDeductions.status,
        createdAt: employeeDeductions.createdAt,
      })
      .from(employeeDeductions)
      .innerJoin(employees, eq(employeeDeductions.employeeId, employees.id))
      .where(eq(employeeDeductions.companyId, companyId))
      .orderBy(desc(employeeDeductions.date));
  }

  static async deleteDeductionRecord(id: string, companyId: string) {
    const [deleted] = await db
      .delete(employeeDeductions)
      .where(and(eq(employeeDeductions.id, id), eq(employeeDeductions.companyId, companyId)))
      .returning();
    return deleted;
  }

  static async createSettlement(companyId: string, data: any) {
    const [inserted] = await db
      .insert(employeeSettlements)
      .values({
        ...data,
        companyId,
        preaviso: data.preaviso.toString(),
        cesantia: data.cesantia.toString(),
        vacaciones: data.vacaciones.toString(),
        navidad: data.navidad.toString(),
        otros: (data.otros || 0).toString(),
        total: data.total.toString(),
        status: data.status || 'calculated',
        settlementDate: data.settlementDate,
      })
      .returning();

    // If settlement is paid or created, update employee status to inactive/suspended
    if (data.status === 'paid' || data.status === 'calculated') {
      await db
        .update(employees)
        .set({ status: 'inactive', terminationDate: data.settlementDate })
        .where(and(eq(employees.id, data.employeeId), eq(employees.companyId, companyId)));
    }

    return inserted;
  }

  static async findSettlements(companyId: string) {
    return db
      .select({
        id: employeeSettlements.id,
        employeeId: employeeSettlements.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        preaviso: employeeSettlements.preaviso,
        cesantia: employeeSettlements.cesantia,
        vacaciones: employeeSettlements.vacaciones,
        navidad: employeeSettlements.navidad,
        otros: employeeSettlements.otros,
        total: employeeSettlements.total,
        status: employeeSettlements.status,
        settlementDate: employeeSettlements.settlementDate,
        createdAt: employeeSettlements.createdAt,
      })
      .from(employeeSettlements)
      .innerJoin(employees, eq(employeeSettlements.employeeId, employees.id))
      .where(eq(employeeSettlements.companyId, companyId))
      .orderBy(desc(employeeSettlements.settlementDate));
  }

  static async findSettlementById(id: string, companyId: string) {
    const [settlement] = await db
      .select({
        id: employeeSettlements.id,
        employeeId: employeeSettlements.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        cedula: employees.cedula,
        hireDate: employees.hireDate,
        salary: employees.salary,
        preaviso: employeeSettlements.preaviso,
        cesantia: employeeSettlements.cesantia,
        vacaciones: employeeSettlements.vacaciones,
        navidad: employeeSettlements.navidad,
        otros: employeeSettlements.otros,
        total: employeeSettlements.total,
        status: employeeSettlements.status,
        settlementDate: employeeSettlements.settlementDate,
        createdAt: employeeSettlements.createdAt,
      })
      .from(employeeSettlements)
      .innerJoin(employees, eq(employeeSettlements.employeeId, employees.id))
      .where(and(eq(employeeSettlements.id, id), eq(employeeSettlements.companyId, companyId)))
      .limit(1);
    return settlement;
  }

  static async deleteSettlement(id: string, companyId: string) {
    const [deleted] = await db
      .delete(employeeSettlements)
      .where(and(eq(employeeSettlements.id, id), eq(employeeSettlements.companyId, companyId)))
      .returning();
    return deleted;
  }

  // ─── AUDIT TRAILS LOGGING ─────────────────────────────────────────────────

  static async logAudit(companyId: string, userId: string, action: string, entityType: string, entityId: string, oldValues?: any, newValues?: any) {
    await db.insert(auditLogs).values({
      companyId,
      userId,
      action,
      entityType,
      entityId,
      oldValues,
      newValues,
      ipAddress: 'System',
    });
  }
}
