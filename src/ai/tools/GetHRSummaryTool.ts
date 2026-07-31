import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { employees } from "@/db/schema/hr";
import { eq, and, sql } from "drizzle-orm";

export class GetHRSummaryTool implements Tool {
  public readonly id = "get_hr_summary";
  public readonly name = "Resumen de Recursos Humanos";
  public readonly description = "Muestra la cantidad de empleados activos y la sumatoria mensual de salarios (carga de nómina base).";
  
  public readonly schema = {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Razón para solicitar reporte de RRHH."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["hr:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    try {
      const [result] = await db
        .select({
          totalEmployees: sql<number>`COUNT(${employees.id})`,
          totalMonthlySalary: sql<number>`COALESCE(SUM(${employees.salary}), 0)`
        })
        .from(employees)
        .where(
          and(
            eq(employees.companyId, context.tenantId),
            eq(employees.status, 'active')
          )
        );

      return {
        success: true,
        summary: {
          activeEmployeesCount: Number(result?.totalEmployees || 0),
          baseMonthlyPayrollCost: Number(result?.totalMonthlySalary || 0)
        }
      };
    } catch (error) {
      throw new Error(`Error RRHH: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
