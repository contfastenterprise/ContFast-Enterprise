import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema/bank";
import { eq } from "drizzle-orm";

export class GetBankBalancesTool implements Tool {
  public readonly id = "get_bank_balances";
  public readonly name = "Saldos Bancarios";
  public readonly description = "Devuelve el saldo de todas las cuentas bancarias activas de la empresa.";
  
  public readonly schema = {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Razón para solicitar cuentas bancarias."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["bank:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    try {
      const accounts = await db
        .select({
          bankName: bankAccounts.bankName,
          accountNumber: bankAccounts.accountNumber,
          currency: bankAccounts.currency,
          balance: bankAccounts.balance
        })
        .from(bankAccounts)
        .where(
          eq(bankAccounts.companyId, context.tenantId)
        );

      return {
        success: true,
        accounts: accounts.map(a => ({
          bankName: a.bankName,
          accountNumber: '****' + a.accountNumber.slice(-4),
          currency: a.currency,
          balance: Number(a.balance)
        })),
        printInstructions: "Informar al usuario que puede conciliar bancos en el módulo Bancos."
      };
    } catch (error) {
      throw new Error(`Error en bancos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
