CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text,
	"amount" numeric(18, 2) NOT NULL,
	"date" date NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text,
	"amount" numeric(18, 2) NOT NULL,
	"date" date NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"notes" text,
	"status" varchar(50) DEFAULT 'approved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"preaviso" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"cesantia" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"vacaciones" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"navidad" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"otros" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"status" varchar(50) DEFAULT 'calculated' NOT NULL,
	"settlement_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_vacations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"generated_days" integer DEFAULT 0 NOT NULL,
	"taken_days" integer DEFAULT 0 NOT NULL,
	"available_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_code" varchar(50) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"cedula" varchar(20) NOT NULL,
	"birth_date" date NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"photo_url" text,
	"gender" varchar(20),
	"civil_status" varchar(50),
	"nationality" varchar(100),
	"department_id" uuid,
	"position_id" uuid,
	"contract_type" varchar(50) NOT NULL,
	"salary" numeric(18, 2) NOT NULL,
	"hire_date" date NOT NULL,
	"termination_date" date,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "isr_brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"from_amount" numeric(18, 2) NOT NULL,
	"to_amount" numeric(18, 2),
	"fixed_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date_worked" date NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"afp_employee" numeric(5, 4) DEFAULT '0.0287' NOT NULL,
	"sfs_employee" numeric(5, 4) DEFAULT '0.0304' NOT NULL,
	"afp_employer" numeric(5, 4) DEFAULT '0.0710' NOT NULL,
	"sfs_employer" numeric(5, 4) DEFAULT '0.0709' NOT NULL,
	"infotep_employer" numeric(5, 4) DEFAULT '0.0100' NOT NULL,
	"risk_employer" numeric(5, 4) DEFAULT '0.0110' NOT NULL,
	"overtime_diurna_rate" numeric(5, 2) DEFAULT '1.35' NOT NULL,
	"overtime_nocturna_rate" numeric(5, 2) DEFAULT '1.85' NOT NULL,
	"overtime_festiva_rate" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"overtime_doble_rate" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"payroll_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"base_salary" numeric(18, 2) NOT NULL,
	"overtime_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"bonus_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"commission_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"gross_salary" numeric(18, 2) NOT NULL,
	"afp" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"sfs" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"isr" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"other_deductions" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"net_salary" numeric(18, 2) NOT NULL,
	"afp_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"sfs_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"risk_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"infotep_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payrolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payment_date" date NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_income" ADD CONSTRAINT "employee_income_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_income" ADD CONSTRAINT "employee_income_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_settlements" ADD CONSTRAINT "employee_settlements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_settlements" ADD CONSTRAINT "employee_settlements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_vacations" ADD CONSTRAINT "employee_vacations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_vacations" ADD CONSTRAINT "employee_vacations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_configs" ADD CONSTRAINT "payroll_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_payroll_id_payrolls_id_fk" FOREIGN KEY ("payroll_id") REFERENCES "public"."payrolls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "departments_company_idx" ON "departments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_deductions_company_idx" ON "employee_deductions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_deductions_employee_idx" ON "employee_deductions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_income_company_idx" ON "employee_income" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_income_employee_idx" ON "employee_income" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_leaves_company_idx" ON "employee_leaves" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_leaves_employee_idx" ON "employee_leaves" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_settlements_company_idx" ON "employee_settlements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_settlements_employee_idx" ON "employee_settlements" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_vacations_company_idx" ON "employee_vacations" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_vacations_employee_idx" ON "employee_vacations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employees_code_idx" ON "employees" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX "employees_cedula_idx" ON "employees" USING btree ("cedula");--> statement-breakpoint
CREATE INDEX "overtime_records_company_idx" ON "overtime_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "overtime_records_employee_idx" ON "overtime_records" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_configs_company_idx" ON "payroll_configs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_details_company_idx" ON "payroll_details" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_details_payroll_idx" ON "payroll_details" USING btree ("payroll_id");--> statement-breakpoint
CREATE INDEX "payroll_details_employee_idx" ON "payroll_details" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payrolls_company_idx" ON "payrolls" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "positions_company_idx" ON "positions" USING btree ("company_id");