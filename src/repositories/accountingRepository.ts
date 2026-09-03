import { 
  db, 
  chartOfAccounts, 
  journalEntries, 
  journalEntryLines, 
  accountsReceivable, 
  accountsPayable,
  accountingPeriods,
  accountingMappings,
  expenseTypes
} from '@/db';
import { eq, and, desc, sql, isNull, inArray } from 'drizzle-orm';
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
  modo: 'PRODUCCION' | 'PRUEBA';
  date: string;
  reference?: string;
  description: string;
  lines: JournalLineInput[];
}

export interface CreateJournalEntryInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  reference?: string;
  date: Date | string;
  description: string;
  /**
   * Usuario que registra el asiento. Auditoria JRN-16.
   *
   * Opcional mientras se propaga por todos los caminos que asientan: hacerlo
   * obligatorio de golpe romperia los que hoy no llevan la sesion a mano. La
   * prueba `autorDelAsiento.vitest.ts` lleva la cuenta de los que faltan y no
   * deja que la lista crezca.
   */
  createdBy?: string | null;
  lines: {
    accountId: string;
    debit: number;
    credit: number;
  }[];
}

function formatLocalDate(date: Date | string): string {
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

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
  static async getJournalEntries(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    limit = 100,
    startDate?: string,
    endDate?: string
  ) {
    const conditions = [
      eq(journalEntries.companyId, companyId),
      // El libro diario es contabilidad. Sin este filtro, los asientos de las
      // facturas de practicas salian mezclados con los reales.
      eq(journalEntries.modo, modo),
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

  static async isPeriodOpen(companyId: string, dateStr: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION', tx: any = db): Promise<boolean> {
    const formattedDate = formatLocalDate(dateStr);
    
    // Auditoria JRN-11: aqui habia un "auto-bootstrap". Si la empresa no tenia
    // NINGUN periodo, esta funcion --que solo debe COMPROBAR-- creaba uno
    // abierto para el mes de la fecha y devolvia true.
    //
    // Dos problemas. El primero es de principio: un control que crea el dato que
    // esta validando no valida nada. El segundo es que solo saltaba con cero
    // periodos, de modo que una empresa con periodos de un anio y ninguno del
    // siguiente se quedaba bloqueada sin explicacion. Le paso a la empresa
    // 38a1a51e: tenia julio y no tenia agosto, y desde el 1 de agosto de 2026 no
    // pudo asentar nada.
    //
    // Ahora los periodos se siembran al crear la empresa
    // (`sembrarPeriodosContables`) y se abren desde Contabilidad > Periodos. Si
    // no hay periodo, esto devuelve false y quien llama falla con un mensaje que
    // dice que hay que abrirlo.
    const [period] = await tx.select()
      .from(accountingPeriods)
      .where(and(
        eq(accountingPeriods.companyId, companyId),
        eq(accountingPeriods.modo, modo),
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

    // Validacion por LINEA. Las de arriba miran totales, y hay asientos que
    // cuadran en total y no significan nada.
    //
    // Auditoria JRN-15: una linea tiene que llevar importe en el debe o en el
    // haber, nunca en los dos ni en ninguno, y nunca negativo. Dos lineas
    // {debe: 500, haber: 500} suman igual y no dicen nada; dos negativas que se
    // compensan tambien pasaban, porque `totalDebits !== 0` no las detecta.
    for (const line of data.lines) {
      const debe = Number(line.debit) || 0;
      const haber = Number(line.credit) || 0;
      if (debe < 0 || haber < 0) {
        throw new Error('Una línea de asiento no puede tener importes negativos.');
      }
      if (debe > 0 && haber > 0) {
        throw new Error('Una línea de asiento no puede tener débito y crédito a la vez.');
      }
      if (debe === 0 && haber === 0) {
        throw new Error('Una línea de asiento no puede tener débito y crédito en cero.');
      }
    }

    // Auditoria: un asiento cuyas lineas caen todas en la MISMA cuenta cuadra
    // perfectamente y no tiene efecto contable alguno.
    //
    // No es teorico: un ajuste bancario de 1.015.727,93 quedo con el debe y el
    // haber contra 1.1.01. El saldo del modulo de bancos subio y el mayor no se
    // movio. Ninguna de las validaciones anteriores lo detecta, porque cada
    // linea es valida por separado y los totales cuadran.
    const cuentasDistintas = new Set(data.lines.map((line: any) => line.accountId));
    if (cuentasDistintas.size < 2) {
      throw new Error(
        'Todas las líneas del asiento usan la misma cuenta contable: el asiento no tendría ningún efecto. ' +
        'Revise las cuentas seleccionadas.'
      );
    }

    const formattedDate = formatLocalDate(data.date);

    const executeInsertion = async (transactionContext: any) => {
      // 2. Validate open period
      const isOpen = await this.isPeriodOpen(data.companyId, formattedDate, data.modo, transactionContext);
      if (!isOpen) {
        throw new Error(
          `No hay un período contable abierto para la fecha ${formattedDate}: está cerrado o no se ha abierto todavía. ` +
          `Ábralo en Contabilidad > Períodos antes de registrar la operación.`
        );
      }

      // 2.1 Validar las cuentas del asiento (Auditoria P0-05, 2026-09-03).
      //
      // resolverCuentas.ts ya valida esto para quien lo usa -- pero este es el
      // UNICO punto por el que pasa CUALQUIER asiento, sin importar de donde
      // venga: las copias locales de `getOrCreateAccount` que aun quedan sin
      // migrar, un `debitAccountId` elegido a mano en el formulario, o codigo
      // futuro que se salte el resolvedor. Sin esto, la unica comprobacion
      // era la FK -- que no distingue una cuenta de OTRA empresa, inactiva,
      // borrada o de AGRUPACION (esta ultima es justo la que causo JRN-01:
      // dos saldos duplicados, padre e hijo, por un asiento posteado contra
      // la cuenta de agrupacion en vez de su hija transaccional).
      const idsDeCuentas = Array.from(cuentasDistintas) as string[];
      const cuentasEncontradas = await transactionContext
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
          inArray(chartOfAccounts.id, idsDeCuentas),
          eq(chartOfAccounts.companyId, data.companyId)
        ));

      const cuentaPorId = new Map(cuentasEncontradas.map((c: any) => [c.id, c]));
      for (const cuentaId of idsDeCuentas) {
        const cuenta: any = cuentaPorId.get(cuentaId);
        if (!cuenta) {
          throw new Error(`El asiento incluye una cuenta contable (id ${cuentaId}) que no existe o no pertenece a esta empresa.`);
        }
        if (cuenta.deletedAt || cuenta.status !== 'active') {
          throw new Error(`La cuenta ${cuenta.code} ${cuenta.name} no está activa: no admite nuevos movimientos.`);
        }
        if (!cuenta.isTransactional) {
          throw new Error(
            `La cuenta ${cuenta.code} ${cuenta.name} es una cuenta de agrupación y no admite movimientos directos. ` +
            `Use una de sus subcuentas transaccionales.`
          );
        }
      }

      // 3. Insert Journal Entry Header
      const entryId = uuidv4();
      const [entry] = await transactionContext
        .insert(journalEntries)
        .values({
          id: entryId,
          companyId: data.companyId,
          modo: data.modo,
          reference: data.reference || null,
          date: formattedDate,
          description: data.description,
          status: 'posted',
          createdBy: (data as any).createdBy || null,
        })
        .returning();

      // 4. Insert Journal Entry Lines
      await transactionContext.insert(journalEntryLines).values(
        data.lines.map((line) => ({
          id: uuidv4(),
          companyId: data.companyId,
          modo: data.modo,
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
    modo: 'PRODUCCION' | 'PRUEBA';
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
        modo: data.modo,
      })
      .returning();
    return ar;
  }

  static async createAccountsPayable(tx: any, data: {
    companyId: string;
    supplierId: string;
    amount: number;
    dueDate: Date | string;
    modo: 'PRODUCCION' | 'PRUEBA';
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
        modo: data.modo,
      })
      .returning();
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
  /**
   * Siembra los periodos contables que le faltan a una empresa, del mes indicado
   * hasta diciembre de ese anio, en los DOS entornos.
   *
   * --- POR QUE (auditoria JRN-11) ---------------------------------------
   *
   * Una empresa nacia sin ningun periodo. El unico sitio que los creaba era
   * `isPeriodOpen`, que creaba UNO --el del mes de la primera operacion-- y solo
   * cuando la empresa tenia cero. A partir de ahi nadie creaba ninguno mas, de
   * modo que al cambiar de mes la empresa se quedaba sin poder asentar y sin
   * ningun aviso previo.
   *
   * Le paso a la empresa 38a1a51e: tenia el periodo de julio de 2026 y ninguno de
   * agosto. Desde el 1 de agosto no pudo registrar ni una factura ni una compra,
   * y el error que veia el usuario no decia que faltara abrir el periodo.
   *
   * --- CRITERIO ---------------------------------------------------------
   *
   * Se siembra desde el mes en curso, no desde enero: una empresa dada de alta en
   * agosto no tiene por que poder asentar en enero. Todos nacen abiertos; cerrar
   * los que toque es trabajo de quien lleva la contabilidad.
   *
   * Es idempotente: mira lo que ya existe y solo inserta lo que falta, de manera
   * que se puede volver a llamar sin duplicar nada.
   *
   * Devuelve cuantos periodos creo.
   */
  public static async sembrarPeriodosContables(
    companyId: string,
    externalTx?: any,
    desde: Date = new Date()
  ): Promise<number> {
    const execute = async (tx: any) => {
      const anio = desde.getFullYear();
      const primerMes = desde.getMonth() + 1;

      const existentes = await tx
        .select({ startDate: accountingPeriods.startDate, modo: accountingPeriods.modo })
        .from(accountingPeriods)
        .where(eq(accountingPeriods.companyId, companyId));

      const yaEstan = new Set(existentes.map((p: any) => `${p.modo}|${p.startDate}`));

      const faltantes: { entorno: 'PRODUCCION' | 'PRUEBA'; mes: number }[] = [];
      for (const entorno of ['PRODUCCION', 'PRUEBA'] as const) {
        for (let mes = primerMes; mes <= 12; mes++) {
          const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
          if (yaEstan.has(`${entorno}|${startDate}`)) continue;
          faltantes.push({ entorno, mes });
        }
      }

      if (faltantes.length === 0) return 0;

      // El `modo` va escrito DENTRO del propio `.values(...)`. Armar el array
      // antes y pasarlo por variable seria mas corto, pero entonces la guarda de
      // `aislamientoModo.vitest.ts` no puede verlo -- solo mira la sentencia del
      // insert -- y la marcaria como una insercion sin entorno. Y hace bien en
      // desconfiar: la columna lleva DEFAULT 'PRODUCCION', asi que olvidar el
      // modo no falla, guarda la fila en el entorno equivocado sin avisar.
      await tx.insert(accountingPeriods).values(
        faltantes.map(({ entorno, mes }) => {
          const mm = String(mes).padStart(2, '0');
          const ultimoDia = new Date(anio, mes, 0).getDate();
          return {
            id: uuidv4(),
            companyId,
            modo: entorno,
            name: `${mm}/${anio}`,
            startDate: `${anio}-${mm}-01`,
            endDate: `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
            status: 'open',
          };
        })
      );

      return faltantes.length;
    };

    return externalTx ? await execute(externalTx) : await db.transaction(execute);
  }

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
  static async getLedger(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    accountId: string,
    startDate: string,
    endDate: string
  ) {
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
      // Se filtra por el modo del ASIENTO, no por el de la linea: el asiento
      // es el que pertenece a un entorno y sus lineas lo heredan. Filtrar
      // tambien la linea escondería una linea heredada con el sello
      // equivocado en vez de mostrarla descuadrada, que es peor.
      eq(journalEntries.modo, modo),
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
      eq(journalEntries.modo, modo),
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

  static async getTrialBalance(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    startDate: string,
    endDate: string
  ) {
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
      eq(journalEntries.modo, modo),
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
      eq(journalEntries.modo, modo),
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

  static async getFinancials(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    startDate: string,
    endDate: string
  ) {
    // El balance general y el estado de resultados salen enteros de la
    // balanza, asi que con acotarla alli quedan acotados los dos.
    const trialBalance = await this.getTrialBalance(companyId, modo, startDate, endDate);

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

  public static async seedDefaultExpenseTypes(companyId: string, externalTx?: any) {
    const execute = async (tx: any) => {
      const defaultTypes = [
        { code: '01', name: 'Gastos de Personal' },
        { code: '02', name: 'Trabajos, Suministros y Servicios' },
        { code: '03', name: 'Arrendamientos' },
        { code: '04', name: 'Gastos de Activos Fijos' },
        { code: '05', name: 'Gastos de Representación' },
        { code: '06', name: 'Otras Deducciones Admitidas' },
        { code: '07', name: 'Gastos Financieros' },
        { code: '08', name: 'Gastos Extraordinarios' },
        { code: '09', name: 'Costo de Venta' },
        { code: '10', name: 'Activos Fijos' }
      ];

      for (const type of defaultTypes) {
        await tx.insert(expenseTypes).values({
          companyId,
          code: type.code,
          name: type.name
        }).onConflictDoNothing();
      }
    };

    if (externalTx) {
      await execute(externalTx);
    } else {
      await db.transaction(async (tx) => {
        await execute(tx);
      });
    }
  }
}
