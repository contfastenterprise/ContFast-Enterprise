import { 
  db, 
  chartOfAccounts, 
  journalEntries, 
  journalEntryLines, 
  accountsReceivable, 
  accountsPayable,
  accountingPeriods,
  accountingMappings
} from '@/db';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface NewAccount {
  companyId: string;
  code: string;
  name: string;
  type: string; // asset | liability | equity | revenue | expense
  nature?: 'debit' | 'credit';
  isTransactional?: boolean;
  parentId?: string | null;
}

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface NewJournalEntry {
  companyId: string;
  date: string;
  reference?: string;
  description: string;
  lines: JournalLineInput[];
}

export interface CreateJournalEntryInput {
  companyId: string;
  reference?: string;
  date: Date | string;
  description: string;
  lines: {
    accountId: string;
    debit: number;
    credit: number;
  }[];
}

function formatLocalDate(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class AccountingRepository {
  // ==========================================
  // CHART OF ACCOUNTS & SEEDING
  // ==========================================
  static async getChartOfAccounts(companyId: string) {
    const list = await db.select()
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId),
        isNull(chartOfAccounts.deletedAt)
      ))
      .orderBy(chartOfAccounts.code);

    if (list.length === 0) {
      // Seed default Dominican Chart of Accounts
      console.log(`Seeding standard Dominican Chart of Accounts for company: ${companyId}`);
      await this.seedDefaultChartOfAccounts(companyId);
      
      return await db.select()
        .from(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.companyId, companyId),
          isNull(chartOfAccounts.deletedAt)
        ))
        .orderBy(chartOfAccounts.code);
    }

    return list;
  }

  static async getChart(companyId: string) {
    return this.getChartOfAccounts(companyId);
  }

  static async getAccountByCode(companyId: string, code: string) {
    // Bootstrap if empty
    await this.getChartOfAccounts(companyId);

    const [account] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId), 
        eq(chartOfAccounts.code, code), 
        isNull(chartOfAccounts.deletedAt)
      ))
      .limit(1);
    return account || null;
  }

  static async createAccount(data: NewAccount) {
    // Check if code already exists
    const existing = await db.select().from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, data.companyId),
        eq(chartOfAccounts.code, data.code),
        isNull(chartOfAccounts.deletedAt)
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Ya existe una cuenta con este código en el catálogo.');
    }

    // Determine level and nature
    const codeClean = data.code.replace(/[^0-9.]/g, '');
    const level = codeClean.split('.').length;
    const firstDigit = codeClean.charAt(0);
    
    let nature: 'debit' | 'credit' = data.nature || 'debit';
    if (!data.nature) {
      if (['2', '3', '4'].includes(firstDigit)) {
        nature = 'credit';
      }
    }

    const [account] = await db.insert(chartOfAccounts).values({
      id: uuidv4(),
      companyId: data.companyId,
      code: data.code,
      name: data.name,
      type: data.type,
      nature,
      level,
      isTransactional: data.isTransactional !== undefined ? data.isTransactional : true,
      parentId: data.parentId || null,
      status: 'active',
    }).returning();

    return account;
  }

  // ==========================================
  // JOURNAL ENTRIES (WITH PERIOD CONTROLS)
  // ==========================================
  static async getJournalEntries(companyId: string, limit = 100, startDate?: string, endDate?: string) {
    const conditions = [
      eq(journalEntries.companyId, companyId),
      isNull(journalEntries.deletedAt)
    ];

    if (startDate) {
      conditions.push(sql`${journalEntries.date} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${journalEntries.date} <= ${endDate}`);
    }

    const entries = await db.select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt))
      .limit(limit);

    if (entries.length === 0) return [];

    const entryIds = entries.map(e => e.id);
    const lines = await db.select({
      id: journalEntryLines.id,
      journalEntryId: journalEntryLines.journalEntryId,
      accountId: journalEntryLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit,
    })
    .from(journalEntryLines)
    .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
    .where(sql`${journalEntryLines.journalEntryId} IN ${entryIds}`);

    return entries.map(entry => {
      const entryLines = lines.filter(l => l.journalEntryId === entry.id);
      const totalDebit = entryLines.reduce((acc, l) => acc + parseFloat(l.debit as any), 0);
      const totalCredit = entryLines.reduce((acc, l) => acc + parseFloat(l.credit as any), 0);
      return {
        ...entry,
        lines: entryLines,
        totalDebit,
        totalCredit
      };
    });
  }

  static async isPeriodOpen(companyId: string, dateStr: string, tx: any = db): Promise<boolean> {
    const formattedDate = formatLocalDate(dateStr);
    
    // Check if there are any periods defined
    const periodsCount = await tx.select({ count: sql<number>`count(*)` })
      .from(accountingPeriods)
      .where(eq(accountingPeriods.companyId, companyId));

    const count = Number(periodsCount[0]?.count || 0);
    if (count === 0) {
      // Auto-bootstrap an open period for the current year/month
      const d = new Date(formattedDate);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const periodName = `${month.toString().padStart(2, '0')}/${year}`;
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
      
      await tx.insert(accountingPeriods).values({
        id: uuidv4(),
        companyId,
        name: periodName,
        startDate,
        endDate,
        status: 'open'
      });
      return true;
    }

    const [period] = await tx.select()
      .from(accountingPeriods)
      .where(and(
        eq(accountingPeriods.companyId, companyId),
        eq(accountingPeriods.status, 'open'),
        sql`${formattedDate} BETWEEN ${accountingPeriods.startDate} AND ${accountingPeriods.endDate}`
      ))
      .limit(1);

    return !!period;
  }

  static async createJournalEntry(txOrData: any, dataInput?: CreateJournalEntryInput | NewJournalEntry) {
    let tx: any = db;
    let data: CreateJournalEntryInput | NewJournalEntry;

    if (dataInput === undefined) {
      data = txOrData;
    } else {
      tx = txOrData;
      data = dataInput;
    }

    // 1. Validate Double Entry balance (debits must equal credits!)
    const totalDebits = data.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredits = data.lines.reduce((sum, line) => sum + Number(line.credit), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(`Asiento contable descuadrado: Débitos ($${totalDebits.toFixed(2)}) no equivalen a Créditos ($${totalCredits.toFixed(2)}).`);
    }

    if (totalDebits === 0) {
      throw new Error('El asiento debe tener valores de débito o crédito.');
    }

    if (data.lines.length < 2) {
      throw new Error('Un asiento contable debe tener al menos dos líneas.');
    }

    const formattedDate = formatLocalDate(data.date);

    const executeInsertion = async (transactionContext: any) => {
      // 2. Validate open period
      const isOpen = await this.isPeriodOpen(data.companyId, formattedDate, transactionContext);
      if (!isOpen) {
        throw new Error(`El periodo contable para la fecha ${formattedDate} está cerrado o no existe.`);
      }

      // 3. Insert Journal Entry Header
      const entryId = uuidv4();
      const [entry] = await transactionContext
        .insert(journalEntries)
        .values({
          id: entryId,
          companyId: data.companyId,
          reference: data.reference || null,
          date: formattedDate,
          description: data.description,
          status: 'posted',
        })
        .returning();

      // 4. Insert Journal Entry Lines
      await transactionContext.insert(journalEntryLines).values(
        data.lines.map((line) => ({
          id: uuidv4(),
          companyId: data.companyId,
          journalEntryId: entryId,
          accountId: line.accountId,
          debit: line.debit.toString(),
          credit: line.credit.toString(),
        }))
      );

      return entry;
    };

    if (tx === db) {
      return await db.transaction(async (newTx) => {
        return await executeInsertion(newTx);
      });
    } else {
      return await executeInsertion(tx);
    }
  }

  // ==========================================
  // AUXILIAR BALANCES (RLS Tenancy Helpers)
  // ==========================================
  static async createAccountsReceivable(tx: any, data: {
    companyId: string;
    customerId: string;
    invoiceId: string;
    amount: number;
    dueDate: Date | string;
  }) {
    const [ar] = await tx
      .insert(accountsReceivable)
      .values({
        companyId: data.companyId,
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        amount: data.amount.toString(),
        balance: data.amount.toString(),
        dueDate: formatLocalDate(data.dueDate),
        status: 'pending',
      })
      .returning();
    return ar;
  }

  static async createAccountsPayable(tx: any, data: {
    companyId: string;
    supplierId: string;
    amount: number;
    dueDate: Date | string;
  }) {
    const [ap] = await tx
      .insert(accountsPayable)
      .values({
        companyId: data.companyId,
        supplierId: data.supplierId,
        amount: data.amount.toString(),
        balance: data.amount.toString(),
        dueDate: formatLocalDate(data.dueDate),
        status: 'pending',
      })
      .returning();
    return ap;
  }

  // ==========================================
  // CONFIGURATION BRIDGE MAPPINGS
  // ==========================================
  static async getMappings(companyId: string) {
    // Ensure chart exists
    const chart = await this.getChartOfAccounts(companyId);

    let mappings = await db.select({
      id: accountingMappings.id,
      mappingKey: accountingMappings.mappingKey,
      accountId: accountingMappings.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name
    })
    .from(accountingMappings)
    .innerJoin(chartOfAccounts, eq(accountingMappings.accountId, chartOfAccounts.id))
    .where(eq(accountingMappings.companyId, companyId));

    const defaultMappings = [
      { key: 'sales_revenue', code: '4.1.01' },
      { key: 'accounts_receivable', code: '1.1.02.01' },
      { key: 'cash', code: '1.1.01.01' },
      { key: 'bank', code: '1.1.01.02' },
      { key: 'itbis_sales', code: '2.1.02.01' },
      { key: 'itbis_purchases', code: '1.1.04.01' },
      { key: 'cost_of_goods_sold', code: '5.1.01' },
      { key: 'inventory', code: '1.1.03.01' },
      { key: 'supplier_payable', code: '2.1.01.01' }
    ];

    // Auto-seed mappings if any are missing (for legacy companies)
    if (mappings.length < defaultMappings.length && chart.length > 0) {
      const existingKeys = new Set(mappings.map((m: any) => m.mappingKey));
      const toInsert = [];

      for (const mapping of defaultMappings) {
        if (!existingKeys.has(mapping.key)) {
          const account = chart.find((a: any) => a.code === mapping.code);
          if (account) {
            toInsert.push({
              id: uuidv4(),
              companyId,
              mappingKey: mapping.key,
              accountId: account.id
            });
          }
        }
      }

      if (toInsert.length > 0) {
        await db.insert(accountingMappings).values(toInsert);
        // Re-fetch after seeding
        mappings = await db.select({
          id: accountingMappings.id,
          mappingKey: accountingMappings.mappingKey,
          accountId: accountingMappings.accountId,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name
        })
        .from(accountingMappings)
        .innerJoin(chartOfAccounts, eq(accountingMappings.accountId, chartOfAccounts.id))
        .where(eq(accountingMappings.companyId, companyId));
      }
    }

    return mappings;
  }

  static async updateMapping(companyId: string, mappingKey: string, accountId: string) {
    const existing = await db.select().from(accountingMappings)
      .where(and(
        eq(accountingMappings.companyId, companyId),
        eq(accountingMappings.mappingKey, mappingKey)
      ))
      .limit(1);

    if (existing.length > 0) {
      return await db.update(accountingMappings)
        .set({ accountId, updatedAt: new Date() })
        .where(eq(accountingMappings.id, existing[0].id))
        .returning();
    } else {
      return await db.insert(accountingMappings)
        .values({
          id: uuidv4(),
          companyId,
          mappingKey,
          accountId
        })
        .returning();
    }
  }

  // ==========================================
  // SEEDER IMPLEMENTATION
  // ==========================================
  public static async seedDefaultChartOfAccounts(companyId: string, externalTx?: any) {
    const execute = async (tx: any) => {
      // Standard Dominican Chart of Accounts
      const accountsList = [
        { code: '1', name: 'Activos', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1', name: 'Activo Corriente', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1.01', name: 'Efectivo en Caja y Bancos', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1.01.01', name: 'Caja General', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.01.02', name: 'Banco Popular', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.01.03', name: 'Banco de Reservas', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.02', name: 'Cuentas por Cobrar', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1.02.01', name: 'Cuentas por Cobrar Clientes', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.02.02', name: 'Otras Cuentas por Cobrar', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.03', name: 'Inventarios', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1.03.01', name: 'Inventario de Mercancía', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.04', name: 'Impuestos Anticipados', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1.04.01', name: 'ITBIS Pagado en Compras', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.04.02', name: 'Anticipos de ISR', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.2', name: 'Activos Fijos', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.2.01', name: 'Propiedades, Planta y Equipo', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.2.01.01', name: 'Equipos de Transporte', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.2.01.02', name: 'Equipos de Oficina', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.2.01.03', name: 'Depreciación Acumulada', type: 'asset', nature: 'credit', isTransactional: true },
        
        { code: '2', name: 'Pasivos', type: 'liability', nature: 'credit', isTransactional: false },
        { code: '2.1', name: 'Pasivos Corrientes', type: 'liability', nature: 'credit', isTransactional: false },
        { code: '2.1.01', name: 'Cuentas por Pagar', type: 'liability', nature: 'credit', isTransactional: false },
        { code: '2.1.01.01', name: 'Cuentas por Pagar Proveedores', type: 'liability', nature: 'credit', isTransactional: true },
        { code: '2.1.01.02', name: 'Otras Cuentas por Pagar', type: 'liability', nature: 'credit', isTransactional: true },
        { code: '2.1.02', name: 'Impuestos Retenidos y por Pagar', type: 'liability', nature: 'credit', isTransactional: false },
        { code: '2.1.02.01', name: 'ITBIS Cobrado en Ventas', type: 'liability', nature: 'credit', isTransactional: true },
        { code: '2.1.02.02', name: 'ITBIS Retenido por Pagar', type: 'liability', nature: 'credit', isTransactional: true },
        { code: '2.1.02.03', name: 'Retenciones de ISR por Pagar', type: 'liability', nature: 'credit', isTransactional: true },
        
        { code: '3', name: 'Patrimonio', type: 'equity', nature: 'credit', isTransactional: false },
        { code: '3.1', name: 'Capital Social', type: 'equity', nature: 'credit', isTransactional: false },
        { code: '3.1.01', name: 'Capital Suscrito y Pagado', type: 'equity', nature: 'credit', isTransactional: true },
        { code: '3.2', name: 'Resultados', type: 'equity', nature: 'credit', isTransactional: false },
        { code: '3.2.01', name: 'Utilidades Acumuladas', type: 'equity', nature: 'credit', isTransactional: true },
        
        { code: '4', name: 'Ingresos', type: 'revenue', nature: 'credit', isTransactional: false },
        { code: '4.1', name: 'Ingresos Operacionales', type: 'revenue', nature: 'credit', isTransactional: false },
        { code: '4.1.01', name: 'Ventas de Mercancías', type: 'revenue', nature: 'credit', isTransactional: true },
        { code: '4.1.02', name: 'Ventas de Servicios', type: 'revenue', nature: 'credit', isTransactional: true },
        
        { code: '5', name: 'Costos', type: 'expense', nature: 'debit', isTransactional: false },
        { code: '5.1', name: 'Costos de Ventas', type: 'expense', nature: 'debit', isTransactional: false },
        { code: '5.1.01', name: 'Costo de Ventas Mercancías', type: 'expense', nature: 'debit', isTransactional: true },
        
        { code: '6', name: 'Gastos', type: 'expense', nature: 'debit', isTransactional: false },
        { code: '6.1', name: 'Gastos Operacionales', type: 'expense', nature: 'debit', isTransactional: false },
        { code: '6.1.01', name: 'Gastos de Personal', type: 'expense', nature: 'debit', isTransactional: false },
        { code: '6.1.01.01', name: 'Sueldos y Salarios', type: 'expense', nature: 'debit', isTransactional: true },
        { code: '6.1.01.02', name: 'Retenciones TSS (SFS/AFP/TSS)', type: 'expense', nature: 'debit', isTransactional: true },
        { code: '6.1.02', name: 'Gastos Administrativos', type: 'expense', nature: 'debit', isTransactional: false },
        { code: '6.1.02.01', name: 'Gastos de Energía Eléctrica', type: 'expense', nature: 'debit', isTransactional: true },
        { code: '6.1.02.02', name: 'Gastos de Teléfono e Internet', type: 'expense', nature: 'debit', isTransactional: true },
        { code: '6.1.02.03', name: 'Gastos de Combustible y Transporte', type: 'expense', nature: 'debit', isTransactional: true },
        { code: '6.1.02.04', name: 'Alquileres / Arrendamientos', type: 'expense', nature: 'debit', isTransactional: true },
        { code: '6.1.02.05', name: 'Reparación y Mantenimiento', type: 'expense', nature: 'debit', isTransactional: true },
        { code: '6.1.02.06', name: 'Gastos Diversos', type: 'expense', nature: 'debit', isTransactional: true },
      ];

      // Track inserted account IDs by code to map parentId
      const codeToIdMap = new Map<string, string>();

      for (const account of accountsList) {
        const id = uuidv4();
        
        // Find parentId from map
        let parentId: string | null = null;
        if (account.code.includes('.')) {
          const lastDot = account.code.lastIndexOf('.');
          const parentCode = account.code.substring(0, lastDot);
          parentId = codeToIdMap.get(parentCode) || null;
        }

        const level = account.code.split('.').length;

        await tx.insert(chartOfAccounts).values({
          id,
          companyId,
          code: account.code,
          name: account.name,
          type: account.type,
          nature: account.nature as any,
          level,
          isTransactional: account.isTransactional,
          parentId,
          status: 'active'
        });

        codeToIdMap.set(account.code, id);
      }

      // Seed default bridge mappings
      const defaultMappings = [
        { key: 'sales_revenue', code: '4.1.01' },
        { key: 'accounts_receivable', code: '1.1.02.01' },
        { key: 'cash', code: '1.1.01.01' },
        { key: 'bank', code: '1.1.01.02' },
        { key: 'itbis_sales', code: '2.1.02.01' },
        { key: 'itbis_purchases', code: '1.1.04.01' },
        { key: 'cost_of_goods_sold', code: '5.1.01' },
        { key: 'inventory', code: '1.1.03.01' },
        { key: 'supplier_payable', code: '2.1.01.01' }
      ];

      for (const mapping of defaultMappings) {
        const accountId = codeToIdMap.get(mapping.code);
        if (accountId) {
          await tx.insert(accountingMappings).values({
            id: uuidv4(),
            companyId,
            mappingKey: mapping.key,
            accountId
          });
        }
      }
    };

    if (externalTx) {
      await execute(externalTx);
    } else {
      await db.transaction(execute);
    }
  }

  // ==========================================
  // REPORTS: LEDGER, TRIAL BALANCE, FINANCIALS
  // ==========================================
  static async getLedger(companyId: string, accountId: string, startDate: string, endDate: string) {
    const formattedStart = formatLocalDate(startDate);
    const formattedEnd = formatLocalDate(endDate);

    // 1. Get Account details
    const [account] = await db.select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)))
      .limit(1);

    if (!account) throw new Error('Cuenta no encontrada');

    // 2. Calculate Beginning Balance (Sum of debits/credits before startDate)
    const [prevTotals] = await db.select({
      debitSum: sql<string>`coalesce(sum(debit), 0)`,
      creditSum: sql<string>`coalesce(sum(credit), 0)`
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntryLines.companyId, companyId),
      eq(journalEntryLines.accountId, accountId),
      sql`${journalEntries.date} < ${formattedStart}`,
      isNull(journalEntries.deletedAt)
    ));

    const prevDebits = parseFloat(prevTotals?.debitSum || '0');
    const prevCredits = parseFloat(prevTotals?.creditSum || '0');
    const beginningBalance = account.nature === 'debit' ? (prevDebits - prevCredits) : (prevCredits - prevDebits);

    // 3. Get movements during range
    const movements = await db.select({
      id: journalEntryLines.id,
      date: journalEntries.date,
      reference: journalEntries.reference,
      description: journalEntries.description,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntryLines.companyId, companyId),
      eq(journalEntryLines.accountId, accountId),
      sql`${journalEntries.date} >= ${formattedStart}`,
      sql`${journalEntries.date} <= ${formattedEnd}`,
      isNull(journalEntries.deletedAt)
    ))
    .orderBy(journalEntries.date, journalEntries.createdAt);

    // 4. Project running balance
    let runningBalance = beginningBalance;
    const mappedMovements = movements.map(m => {
      const debit = parseFloat(m.debit || '0');
      const credit = parseFloat(m.credit || '0');
      if (account.nature === 'debit') {
        runningBalance += (debit - credit);
      } else {
        runningBalance += (credit - debit);
      }
      return {
        ...m,
        debit,
        credit,
        balance: runningBalance
      };
    });

    return {
      account,
      beginningBalance,
      movements: mappedMovements,
      endingBalance: runningBalance
    };
  }

  static async getTrialBalance(companyId: string, startDate: string, endDate: string) {
    const formattedStart = formatLocalDate(startDate);
    const formattedEnd = formatLocalDate(endDate);

    // Get all accounts
    const accounts = await this.getChartOfAccounts(companyId);

    // Get sums before startDate (Beginning balances)
    const prevSums = await db.select({
      accountId: journalEntryLines.accountId,
      debitSum: sql<string>`coalesce(sum(debit), 0)`,
      creditSum: sql<string>`coalesce(sum(credit), 0)`
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntryLines.companyId, companyId),
      sql`${journalEntries.date} < ${formattedStart}`,
      isNull(journalEntries.deletedAt)
    ))
    .groupBy(journalEntryLines.accountId);

    // Get sums in range (Period movements)
    const periodSums = await db.select({
      accountId: journalEntryLines.accountId,
      debitSum: sql<string>`coalesce(sum(debit), 0)`,
      creditSum: sql<string>`coalesce(sum(credit), 0)`
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntryLines.companyId, companyId),
      sql`${journalEntries.date} >= ${formattedStart}`,
      sql`${journalEntries.date} <= ${formattedEnd}`,
      isNull(journalEntries.deletedAt)
    ))
    .groupBy(journalEntryLines.accountId);

    const prevMap = new Map(prevSums.map(s => [s.accountId, s]));
    const periodMap = new Map(periodSums.map(s => [s.accountId, s]));

    // Construct the trial balance rows
    return accounts.map(acc => {
      const prev = prevMap.get(acc.id);
      const period = periodMap.get(acc.id);

      const prevDeb = parseFloat(prev?.debitSum || '0');
      const prevCred = parseFloat(prev?.creditSum || '0');
      const begBal = acc.nature === 'debit' ? (prevDeb - prevCred) : (prevCred - prevDeb);

      const deb = parseFloat(period?.debitSum || '0');
      const cred = parseFloat(period?.creditSum || '0');
      
      const endBal = acc.nature === 'debit' ? (begBal + deb - cred) : (begBal + cred - deb);

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        nature: acc.nature,
        level: acc.level,
        isTransactional: acc.isTransactional,
        beginningBalance: begBal,
        debit: deb,
        credit: cred,
        endingBalance: endBal
      };
    });
  }

  static async getFinancials(companyId: string, startDate: string, endDate: string) {
    const trialBalance = await this.getTrialBalance(companyId, startDate, endDate);

    // Filter and build Balance Sheet (Assets, Liabilities, Equity)
    const balanceSheet = trialBalance.filter(row => ['asset', 'liability', 'equity'].includes(row.type));
    
    // Filter and build Income Statement (Revenue, Expense)
    const incomeStatement = trialBalance.filter(row => ['revenue', 'expense'].includes(row.type));

    // Calculate totals based on level 1 accounts (or aggregate sum ofTransactional level)
    const calculateHierarchyTotal = (type: string) => {
      return trialBalance.filter(row => row.type === type && row.level === 1)
        .reduce((sum, row) => sum + row.endingBalance, 0);
    };

    const assets = calculateHierarchyTotal('asset');
    const liabilities = calculateHierarchyTotal('liability');
    const equity = calculateHierarchyTotal('equity');

    const revenues = calculateHierarchyTotal('revenue');
    const expenses = calculateHierarchyTotal('expense');
    const netIncome = revenues - expenses;

    return {
      balanceSheet: {
        rows: balanceSheet,
        totals: {
          assets,
          liabilities,
          equity,
          netIncome
        }
      },
      incomeStatement: {
        rows: incomeStatement,
        totals: {
          revenues,
          expenses,
          netIncome
        }
      }
    };
  }
}
