import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema/bank";
import { eq } from "drizzle-orm";
import { BankRepository } from '@/repositories/bankRepository';

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
      // El saldo se pide al repositorio, que devuelve el del entorno del
      // usuario. Leer `bankAccounts.balance` a pelo daba siempre la cifra de
      // PRODUCCION, aunque quien preguntara estuviera en el entorno de
      // practicas.
      const accounts = await BankRepository.getBankAccounts(context.tenantId, context.modo);

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
