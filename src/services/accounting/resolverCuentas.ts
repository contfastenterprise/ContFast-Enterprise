import { and, eq } from 'drizzle-orm';
import { accountingMappings, bankAccounts, chartOfAccounts, type DbTransaction } from '@/db';

/**
 * Resolución de cuentas contables para el registro automático de asientos.
 *
 * ─── POR QUÉ EXISTE ────────────────────────────────────────────────────────
 *
 * Hasta ahora cada módulo resolvía sus cuentas con una copia de
 * `getOrCreateAccount(tx, companyId, codigo, nombre, tipo)`, que busca por
 * CÓDIGO LITERAL, ignora el nombre, y **crea la cuenta si no la encuentra**.
 * Los códigos estaban escritos contra un plan de cuentas de tres niveles que
 * no es el que el sistema siembra. Consecuencias verificadas en producción:
 *
 *   · `1.1.02` se usaba como "Efectivo en Bancos" en compras, pero en el
 *     catálogo real es CUENTAS POR COBRAR. Ocho cheques en garantía por
 *     2.642.619,83 quedaron acreditando la deuda de los clientes.
 *   · `2.1.01` es una cuenta de AGRUPACIÓN. Postear contra ella duplica el
 *     saldo entre padre e hijo. La hija transaccional, `2.1.01.01`, existía
 *     desde el principio y nadie la usaba.
 *   · Las cuentas creadas al vuelo nacían con `nature` y `level` por defecto,
 *     lo que invierte signos y rompe los totales por jerarquía de la balanza.
 *
 * Hallazgos JRN-01, JRN-02, JRN-12, INV-04, ARP-02, ARP-16.
 *
 * ─── EL CRITERIO ───────────────────────────────────────────────────────────
 *
 * Estas funciones NO crean cuentas. Resuelven, validan y, si no pueden, fallan
 * con un mensaje que dice qué configurar. Una cuenta creada sola es la causa
 * del desorden que se está corrigiendo: es preferible una operación detenida
 * que un asiento en la cuenta equivocada.
 *
 * El orden de resolución es: primero `accounting_mappings` — la tabla de
 * configuración que existe desde siempre y que ningún asiento consultaba —, y
 * si no hay mapeo, el código por defecto. Ese orden es el primer paso hacia el
 * resolvedor único de la Fase 2.
 */

interface CuentaValidada {
  id: string;
  code: string;
  name: string;
}

/** Comprueba que la cuenta sea de la empresa, esté activa y admita movimientos. */
async function validarCuenta(
  tx: DbTransaction,
  companyId: string,
  accountId: string,
  contexto: string
): Promise<CuentaValidada> {
  const [cuenta] = await tx
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      isTransactional: chartOfAccounts.isTransactional,
      status: chartOfAccounts.status,
      deletedAt: chartOfAccounts.deletedAt,
    })
    .from(chartOfAccounts)
    .where(and(
      eq(chartOfAccounts.id, accountId),
      eq(chartOfAccounts.companyId, companyId)
    ))
    .limit(1);

  if (!cuenta) {
    throw new Error(`${contexto}: la cuenta contable indicada no existe o no pertenece a la empresa.`);
  }
  if (cuenta.deletedAt || cuenta.status !== 'active') {
    throw new Error(`${contexto}: la cuenta ${cuenta.code} ${cuenta.name} no está activa.`);
  }
  if (!cuenta.isTransactional) {
    throw new Error(
      `${contexto}: la cuenta ${cuenta.code} ${cuenta.name} es una cuenta de agrupación y no admite movimientos. ` +
      `Use una cuenta transaccional (por ejemplo, una de sus subcuentas).`
    );
  }

  return { id: cuenta.id, code: cuenta.code, name: cuenta.name };
}

/**
 * Cuenta contable de una CUENTA BANCARIA concreta.
 *
 * Sale del enlace explícito `bank_accounts.chart_account_id` (migración 0039).
 * Antes se adivinaba con `find(a => a.name.toLowerCase().includes('banco'))`,
 * de modo que todos los bancos se contabilizaban contra el mismo — normalmente
 * contra "Efectivo en Caja y Bancos", que además es de agrupación.
 *
 * Valida de paso que la cuenta bancaria sea de la empresa: el id llega del
 * cuerpo de la petición.
 */
export async function resolverCuentaDeBanco(
  tx: DbTransaction,
  companyId: string,
  bankAccountId: string,
  contexto = 'Movimiento bancario'
): Promise<CuentaValidada> {
  // Sin cuenta bancaria no hay nada que resolver. Se distingue del caso "no
  // existe" a proposito: el mensaje tiene que decir que falta elegirla, no
  // insinuar que el dato es invalido.
  if (!bankAccountId) {
    throw new Error(
      `${contexto}: debe seleccionar la cuenta bancaria de origen. ` +
      `Es de donde saldra el dinero y determina contra que cuenta se contabiliza.`
    );
  }

  const [banco] = await tx
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      accountNumber: bankAccounts.accountNumber,
      chartAccountId: bankAccounts.chartAccountId,
      status: bankAccounts.status,
      deletedAt: bankAccounts.deletedAt,
    })
    .from(bankAccounts)
    .where(and(
      eq(bankAccounts.id, bankAccountId),
      eq(bankAccounts.companyId, companyId)
    ))
    .limit(1);

  if (!banco) {
    throw new Error(`${contexto}: la cuenta bancaria indicada no existe o no pertenece a la empresa.`);
  }
  if (banco.deletedAt || banco.status !== 'active') {
    throw new Error(`${contexto}: la cuenta bancaria "${banco.bankName} ${banco.accountNumber}" no está activa.`);
  }
  if (!banco.chartAccountId) {
    throw new Error(
      `${contexto}: la cuenta bancaria "${banco.bankName} ${banco.accountNumber}" no tiene cuenta contable asignada, ` +
      `así que el movimiento no se puede contabilizar. Asígnela en el módulo de Bancos.`
    );
  }

  return await validarCuenta(tx, companyId, banco.chartAccountId, contexto);
}

/**
 * Cuenta contable configurada para una clave de `accounting_mappings`.
 *
 * Si no hay mapeo, cae al código por defecto. Si tampoco existe, falla: nunca
 * crea la cuenta.
 */
export async function resolverCuentaPorMapeo(
  tx: DbTransaction,
  companyId: string,
  mappingKey: string,
  codigoPorDefecto: string,
  contexto: string
): Promise<CuentaValidada> {
  const [mapeo] = await tx
    .select({ accountId: accountingMappings.accountId })
    .from(accountingMappings)
    .where(and(
      eq(accountingMappings.companyId, companyId),
      eq(accountingMappings.mappingKey, mappingKey)
    ))
    .limit(1);

  if (mapeo?.accountId) {
    return await validarCuenta(tx, companyId, mapeo.accountId, contexto);
  }

  const [porCodigo] = await tx
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(and(
      eq(chartOfAccounts.companyId, companyId),
      eq(chartOfAccounts.code, codigoPorDefecto)
    ))
    .limit(1);

  if (!porCodigo) {
    throw new Error(
      `${contexto}: no hay ninguna cuenta configurada para "${mappingKey}" y tampoco existe la cuenta ` +
      `${codigoPorDefecto} en el catálogo. Configúrela en Ajustes > Contabilidad.`
    );
  }

  return await validarCuenta(tx, companyId, porCodigo.id, contexto);
}

/**
 * Cuenta de CUENTAS POR PAGAR a proveedores.
 *
 * Por defecto `2.1.01.01`, la hija transaccional. NUNCA `2.1.01`, que es la
 * agrupación contra la que se venía posteando.
 */
export async function resolverCuentaPorPagar(
  tx: DbTransaction,
  companyId: string,
  contexto = 'Cuentas por pagar'
): Promise<CuentaValidada> {
  return await resolverCuentaPorMapeo(tx, companyId, 'supplier_payable', '2.1.01.01', contexto);
}
