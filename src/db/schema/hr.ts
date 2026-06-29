import { pgTable, uuid, varchar, text, timestamp, decimal, date, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';

export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('departments_company_idx').on(table.companyId),
}));

export const positions = pgTable('positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('positions_company_idx').on(table.companyId),
}));

export const employees = pgTable('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  employeeCode: varchar('employee_code', { length: 50 }).notNull(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  cedula: varchar('cedula', { length: 20 }).notNull(),
  birthDate: date('birth_date').notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
  photoUrl: text('photo_url'),
  gender: varchar('gender', { length: 20 }), // masculino | femenino
  civilStatus: varchar('civil_status', { length: 50 }), // soltero | casado | divorciado | viudo | union_libre
  nationality: varchar('nationality', { length: 100 }),
  departmentId: uuid('department_id').references(() => departments.id),
  positionId: uuid('position_id').references(() => positions.id),
  contractType: varchar('contract_type', { length: 50 }).notNull(), // fijo | indefinido | temporal | por_obra
  paymentFrequency: varchar('payment_frequency', { length: 20 }).default('mensual').notNull(), // mensual | quincenal | semanal
  salary: decimal('salary', { precision: 18, scale: 2 }).notNull(),
  hireDate: date('hire_date').notNull(),
  terminationDate: date('termination_date'),
  status: varchar('status', { length: 50 }).default('active').notNull(), // active | inactive | suspended | cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('employees_company_idx').on(table.companyId),
  codeIdx: index('employees_code_idx').on(table.employeeCode),
  cedulaIdx: index('employees_cedula_idx').on(table.cedula),
}));

export const payrolls = pgTable('payrolls', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  paymentDate: date('payment_date').notNull(),
  frequency: varchar('frequency', { length: 20 }).default('mensual').notNull(), // mensual | quincenal | semanal
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft | calculated | approved | paid | cancelled
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('payrolls_company_idx').on(table.companyId),
}));

export const payrollDetails = pgTable('payroll_details', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  payrollId: uuid('payroll_id').notNull().references(() => payrolls.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  baseSalary: decimal('base_salary', { precision: 18, scale: 2 }).notNull(),
  overtimeAmount: decimal('overtime_amount', { precision: 18, scale: 2 }).default('0.00').notNull(),
  bonusAmount: decimal('bonus_amount', { precision: 18, scale: 2 }).default('0.00').notNull(),
  commissionAmount: decimal('commission_amount', { precision: 18, scale: 2 }).default('0.00').notNull(),
  grossSalary: decimal('gross_salary', { precision: 18, scale: 2 }).notNull(),
  afp: decimal('afp', { precision: 18, scale: 2 }).default('0.00').notNull(),
  sfs: decimal('sfs', { precision: 18, scale: 2 }).default('0.00').notNull(),
  isr: decimal('isr', { precision: 18, scale: 2 }).default('0.00').notNull(),
  otherDeductions: decimal('other_deductions', { precision: 18, scale: 2 }).default('0.00').notNull(),
  netSalary: decimal('net_salary', { precision: 18, scale: 2 }).notNull(),
  // Employer contributions (TSS)
  afpEmployer: decimal('afp_employer', { precision: 18, scale: 2 }).default('0.00').notNull(),
  sfsEmployer: decimal('sfs_employer', { precision: 18, scale: 2 }).default('0.00').notNull(),
  riskEmployer: decimal('risk_employer', { precision: 18, scale: 2 }).default('0.00').notNull(),
  infotepEmployer: decimal('infotep_employer', { precision: 18, scale: 2 }).default('0.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('payroll_details_company_idx').on(table.companyId),
  payrollIdx: index('payroll_details_payroll_idx').on(table.payrollId),
  employeeIdx: index('payroll_details_employee_idx').on(table.employeeId),
}));

export const overtimeRecords = pgTable('overtime_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  dateWorked: date('date_worked').notNull(),
  hours: decimal('hours', { precision: 6, scale: 2 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // diurna | nocturna | festiva | doble
  amount: decimal('amount', { precision: 18, scale: 2 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | processed | cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('overtime_records_company_idx').on(table.companyId),
  employeeIdx: index('overtime_records_employee_idx').on(table.employeeId),
}));

export const employeeIncome = pgTable('employee_income', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  type: varchar('type', { length: 50 }).notNull(), // productividad | comision | transporte | combustible | incentivo | otro
  description: text('description'),
  amount: decimal('amount', { precision: 18, scale: 2 }).notNull(),
  date: date('date').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | processed | cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('employee_income_company_idx').on(table.companyId),
  employeeIdx: index('employee_income_employee_idx').on(table.employeeId),
}));

export const employeeDeductions = pgTable('employee_deductions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  type: varchar('type', { length: 50 }).notNull(), // prestamo | cooperativa | seguro | embargo | otro
  description: text('description'),
  amount: decimal('amount', { precision: 18, scale: 2 }).notNull(),
  date: date('date').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | processed | cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('employee_deductions_company_idx').on(table.companyId),
  employeeIdx: index('employee_deductions_employee_idx').on(table.employeeId),
}));

export const employeeVacations = pgTable('employee_vacations', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  generatedDays: integer('generated_days').default(0).notNull(),
  takenDays: integer('taken_days').default(0).notNull(),
  availableDays: integer('available_days').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('employee_vacations_company_idx').on(table.companyId),
  employeeIdx: uniqueIndex('employee_vacations_employee_idx').on(table.employeeId),
}));

export const employeeLeaves = pgTable('employee_leaves', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  type: varchar('type', { length: 50 }).notNull(), // maternidad | paternidad | enfermedad | accidente | permiso
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  notes: text('notes'),
  status: varchar('status', { length: 50 }).default('approved').notNull(), // approved | active | completed | cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('employee_leaves_company_idx').on(table.companyId),
  employeeIdx: index('employee_leaves_employee_idx').on(table.employeeId),
}));

export const employeeSettlements = pgTable('employee_settlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  preaviso: decimal('preaviso', { precision: 18, scale: 2 }).default('0.00').notNull(),
  cesantia: decimal('cesantia', { precision: 18, scale: 2 }).default('0.00').notNull(),
  vacaciones: decimal('vacaciones', { precision: 18, scale: 2 }).default('0.00').notNull(),
  navidad: decimal('navidad', { precision: 18, scale: 2 }).default('0.00').notNull(),
  otros: decimal('otros', { precision: 18, scale: 2 }).default('0.00').notNull(),
  total: decimal('total', { precision: 18, scale: 2 }).default('0.00').notNull(),
  status: varchar('status', { length: 50 }).default('calculated').notNull(), // calculated | paid | cancelled
  settlementDate: date('settlement_date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('employee_settlements_company_idx').on(table.companyId),
  employeeIdx: index('employee_settlements_employee_idx').on(table.employeeId),
}));

export const isrBrackets = pgTable('isr_brackets', {
  id: uuid('id').defaultRandom().primaryKey(),
  year: integer('year').notNull(),
  fromAmount: decimal('from_amount', { precision: 18, scale: 2 }).notNull(),
  toAmount: decimal('to_amount', { precision: 18, scale: 2 }),
  fixedAmount: decimal('fixed_amount', { precision: 18, scale: 2 }).default('0.00').notNull(),
  percentage: decimal('percentage', { precision: 5, scale: 2 }).notNull(), // e.g. 15.00, 20.00, 25.00
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const payrollConfigs = pgTable('payroll_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  afpEmployee: decimal('afp_employee', { precision: 5, scale: 4 }).default('0.0287').notNull(), // 2.87%
  sfsEmployee: decimal('sfs_employee', { precision: 5, scale: 4 }).default('0.0304').notNull(), // 3.04%
  afpEmployer: decimal('afp_employer', { precision: 5, scale: 4 }).default('0.0710').notNull(), // 7.10%
  sfsEmployer: decimal('sfs_employer', { precision: 5, scale: 4 }).default('0.0709').notNull(), // 7.09%
  infotepEmployer: decimal('infotep_employer', { precision: 5, scale: 4 }).default('0.0100').notNull(), // 1.00%
  riskEmployer: decimal('risk_employer', { precision: 5, scale: 4 }).default('0.0110').notNull(), // 1.10% default
  overtimeDiurnaRate: decimal('overtime_diurna_rate', { precision: 5, scale: 2 }).default('1.35').notNull(),
  overtimeNocturnaRate: decimal('overtime_nocturna_rate', { precision: 5, scale: 2 }).default('1.85').notNull(),
  overtimeFestivaRate: decimal('overtime_festiva_rate', { precision: 5, scale: 2 }).default('2.00').notNull(),
  overtimeDobleRate: decimal('overtime_doble_rate', { precision: 5, scale: 2 }).default('2.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: uniqueIndex('payroll_configs_company_idx').on(table.companyId),
}));
