import { db, invoices, checks, expenses, withTenantMode, invoiceLines, products, productCategories, apPayments, accountsPayable, cashSessions } from '@/db';
import { eq, and, desc, sql, gte, lte, ne, isNull, inArray } from 'drizzle-orm';
import { accountingPeriods } from '@/db';
import { diasDeCobertura, DIAS_AVISO_PERIODOS } from '@/services/accounting/coberturaPeriodos';
import {
  limiteDeAvisoDeCheques,
  urgenciaDelCheque,
  tituloDelCheque,
  cajaSinCerrar,
  diasAbierta,
  diferenciaSinResolver,
  claseDeDiferencia,
} from '@/services/avisos/vencimientos';
import {
  periodosCerrados,
  declaracionesPendientes,
  tituloDeclaracion,
  DIA_LIMITE_DECLARACION,
  type DeclaracionPendiente,
} from '@/services/dgii/declaracionesPendientes';
import { declaracionesDgii } from '@/db';

interface DashboardAlert {
  id: string;
  type: 'invoice_rejected' | 'check_due' | 'periodos_por_agotarse' | 'caja_sin_cerrar'
      | 'caja_con_diferencia' | 'declaracion_pendiente';
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
}

export class DashboardRepository {
  
  static async getStats(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const allInvoices = await db.select({
      id: invoices.id,
      ncf: invoices.ncf,
      ecfType: invoices.ecfType,
      status: invoices.status,
      total: invoices.total,
      createdAt: invoices.createdAt,
      dgiiMessage: invoices.dgiiMessage
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        inArray(invoices.status, ['accepted', 'signed', 'submitted']),
        isNull(invoices.deletedAt)
      )
    );

    let invoicesToday = 0;
    let invoicesTodayAmount = 0;
    let invoicesYesterday = 0;
    let invoicesYesterdayAmount = 0;
    let pendingDgii = 0;
    let monthlySales = 0;
    let alertCount = 0;
    let totalInvoices = allInvoices.length;
    let alertsDetails: DashboardAlert[] = [];

    for (const inv of allInvoices) {
      const invDate = new Date(inv.createdAt);
      const totalAmount = parseFloat(inv.total) || 0;

      // Today stats
      if (invDate >= today) {
        invoicesToday++;
        invoicesTodayAmount += totalAmount;
      }
      // Yesterday stats
      else if (invDate >= yesterday && invDate < today) {
        invoicesYesterday++;
        invoicesYesterdayAmount += totalAmount;
      }

      // Monthly sales
      if (invDate >= startOfMonth) {
        if (inv.status === 'accepted' || inv.status === 'signed' || inv.status === 'submitted') {
          monthlySales += totalAmount;
        }
      }

      // Pending DGII (Drafts or Submitted waiting for response)
      if (inv.status === 'draft' || inv.status === 'submitted') {
        pendingDgii++;
      }
    }

    // Lote 148: el aviso de comprobante rechazado vivia DENTRO del bucle de
    // arriba, sobre facturas pedidas con `status IN ('accepted', 'signed',
    // 'submitted')`. Una rechazada no podia llegar nunca, y el aviso no salio
    // jamas. Medido el 2026-09-16: dos e-44 rechazadas en PRUEBA sin aviso. Van
    // con su propia consulta; la de arriba sigue siendo la de las ventas.
    const rechazados = await db.select({
      id: invoices.id,
      ncf: invoices.ncf,
      dgiiMessage: invoices.dgiiMessage,
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        eq(invoices.status, 'rejected'),
        isNull(invoices.deletedAt)
      )
    )
    .orderBy(desc(invoices.createdAt));

    for (const inv of rechazados) {
      alertCount++;
      alertsDetails.push({
        id: inv.id,
        type: 'invoice_rejected',
        title: `Factura ${inv.ncf || 'sin NCF'} rechazada`,
        description: inv.dgiiMessage || 'Error de validación en la DGII',
        actionText: 'Revisar Factura',
        actionLink: `/dashboard/invoices/${inv.id}`
      });
    }

    let invoicesTodayChangePct = 0;
    if (invoicesYesterday > 0) {
      invoicesTodayChangePct = Math.round(((invoicesToday - invoicesYesterday) / invoicesYesterday) * 100);
    } else if (invoicesToday > 0) {
      invoicesTodayChangePct = 100;
    }

    // Query due guarantee checks count and details.
    // IMPORTANTE: esta consulta debe coincidir 1:1 con la que alimenta la pestana
    // "Cheques en Garantia" (ApRepository.findPendingGuaranteeChecks). Si solo se
    // consultara la tabla `checks`, un cheque huerfano (sin ap_payment, con la CxP
    // borrada o soft-deleted) dispararia la alerta para siempre mientras la pantalla
    // aparece vacia, y no habria forma de limpiarlo desde la UI.
    //  Lote 158: el aviso salia el dia del cobro o despues (`due_date <= hoy`).
    //  Un cheque en garantia se cobra contra la cuenta ESE dia: enterarse
    //  entonces es enterarse tarde. Ahora entra tambien lo que vence dentro de
    //  `DIAS_AVISO_CHEQUE` (3, decidido por el dueño el 2026-09-18), sin dejar
    //  fuera lo ya vencido. Medido ese dia: el cheque 123, de RD$144.092,15,
    //  vencia al dia siguiente y no avisaba nada.
    const limiteCheques = limiteDeAvisoDeCheques(today);
    const dueChecks = await db.select({
      id: checks.id,
      checkNumber: checks.checkNumber,
      payee: checks.payee,
      amount: checks.amount,
      dueDate: checks.dueDate
    }).from(checks)
    .innerJoin(apPayments, eq(apPayments.checkId, checks.id))
    .innerJoin(accountsPayable, eq(accountsPayable.id, apPayments.apId))
    .where(
      withTenantMode(
        checks,
        ctx,
        eq(checks.isGuarantee, true),
        eq(checks.status, 'pending'),
        lte(checks.dueDate, limiteCheques),
        isNull(checks.deletedAt),
        // El pago debe seguir pendiente de aplicar
        eq(apPayments.status, 'pending_guarantee'),
        eq(apPayments.modo, modo),
        // La cuenta por pagar debe seguir viva y con balance
        isNull(accountsPayable.deletedAt),
        eq(accountsPayable.modo, modo),
        sql`${accountsPayable.balance} > 0`
      )
    );
    const dueGuaranteeChecksCount = dueChecks.length;
    
    //  `due_date` es nullable en la tabla. Un cheque sin fecha de cobro no
    //  entra por el filtro de SQL (una comparacion con NULL nunca es cierta) y
    //  tampoco tendria de que avisar: se descarta aqui de forma explicita.
    for (const check of dueChecks.filter((c): c is typeof c & { dueDate: string } => !!c.dueDate)) {
      const urgencia = urgenciaDelCheque(check.dueDate, today);
      alertsDetails.push({
        id: check.id,
        type: 'check_due',
        title: tituloDelCheque(check.checkNumber, check.dueDate, today),
        description: urgencia === 'proximo'
          ? `Cheque a nombre de ${check.payee} por RD$ ${parseFloat(check.amount).toLocaleString('es-DO')}. Tenga el fondo listo en el banco.`
          : `Cheque a nombre de ${check.payee} por RD$ ${parseFloat(check.amount).toLocaleString('es-DO')} listo para cobro.`,
        actionText: 'Ir a Compras',
        actionLink: '/dashboard/purchases?tab=cheques'
      });
    }

    // Lote 145: los periodos contables se acaban sin aviso. Medido el
    // 2026-09-16: las seis empresas terminaban el 31/12/2026, y sin periodo
    // abierto no se registra ni una factura. El aviso sale con margen para que
    // alguien pulse "Abrir los proximos 12 meses" antes, no despues.
    const periodosAbiertos = await db.select({
      startDate: accountingPeriods.startDate,
      endDate: accountingPeriods.endDate,
    }).from(accountingPeriods)
      .where(and(
        eq(accountingPeriods.companyId, companyId),
        eq(accountingPeriods.modo, modo),
        eq(accountingPeriods.status, 'open')
      ));
    const diasCubiertos = diasDeCobertura(periodosAbiertos, new Date());
    let avisoPeriodos = 0;
    if (diasCubiertos < DIAS_AVISO_PERIODOS) {
      avisoPeriodos = 1;
      alertsDetails.push({
        id: `periodos-${modo}`,
        type: 'periodos_por_agotarse',
        title: diasCubiertos === 0
          ? 'No hay período contable abierto para hoy'
          : `Los períodos contables se acaban en ${diasCubiertos} día(s)`,
        description: diasCubiertos === 0
          ? 'Sin período abierto no se puede registrar ninguna factura, compra ni cobro.'
          : 'Cuando se acaben no se podrá registrar ninguna factura, compra ni cobro. Ábralos antes.',
        actionText: 'Abrir períodos',
        actionLink: '/dashboard/accounting?tab=periods'
      });
    }

    //  Lote 158: la caja que no se cerro. Medido el 2026-09-18: una sesion
    //  abierta desde el 06/08 (43 dias) en PRODUCCION y otra de 17 dias en
    //  PRUEBA, y de la unica sesion cerrada en toda la historia, ninguna se
    //  cerro el mismo dia. Mientras sigue abierta, el arqueo no cuadra contra
    //  nada y los cobros en efectivo se siguen metiendo dentro.
    //
    //  No se cierra sola, a proposito: cerrar una caja es contar el efectivo.
    //  Lo que faltaba era que alguien lo dijera.
    const sesionesAbiertas = await db.select({
      id: cashSessions.id,
      openedAt: cashSessions.openedAt,
    }).from(cashSessions)
      .where(withTenantMode(cashSessions, ctx, eq(cashSessions.status, 'open')));

    const cajasSinCerrar = sesionesAbiertas.filter((s) => cajaSinCerrar({ status: 'open', openedAt: s.openedAt }, today));
    for (const sesion of cajasSinCerrar) {
      const dias = diasAbierta(sesion.openedAt, today);
      alertsDetails.push({
        id: `caja-${sesion.id}`,
        type: 'caja_sin_cerrar',
        title: dias === 1 ? 'La caja de ayer sigue abierta' : `La caja lleva ${dias} días abierta`,
        description: 'Mientras no se cierre, el arqueo no cuadra contra nada y los cobros en efectivo siguen entrando en esa sesión.',
        actionText: 'Ir a Caja',
        actionLink: '/dashboard/cash'
      });
    }

    //  Lote 176: un arqueo que no cuadro y que nadie ha resuelto.
    //
    //  La caja ya esta asentada operacion por operacion, asi que un arqueo que
    //  cuadra no necesita nada. Pero una diferencia se quedaba SOLO en el
    //  resumen de la sesion: el mayor seguia diciendo que hay un dinero que no
    //  esta, y nada lo decia. No se asienta sola a proposito (decision del
    //  dueño, 2026-09-21): a que cuenta va un faltante es contable y cambia
    //  segun el caso. El aviso se queda hasta que un responsable lo aprueba,
    //  y entonces se apaga solo -- nadie tiene que descartarlo a mano.
    const cerradasConDiferencia = await db.select({
      id: cashSessions.id,
      status: cashSessions.status,
      difference: cashSessions.difference,
      approvedAt: cashSessions.approvedAt,
      closedAt: cashSessions.closedAt,
    }).from(cashSessions)
      .where(withTenantMode(cashSessions, ctx, eq(cashSessions.status, 'closed')));

    for (const sesion of cerradasConDiferencia.filter(diferenciaSinResolver)) {
      const clase = claseDeDiferencia(sesion.difference);
      const importe = Math.abs(parseFloat(sesion.difference || '0'));
      const dinero = importe.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      alertsDetails.push({
        id: `caja-diferencia-${sesion.id}`,
        type: 'caja_con_diferencia',
        title: clase === 'faltante'
          ? `Faltan RD$ ${dinero} en el arqueo de caja`
          : `Sobran RD$ ${dinero} en el arqueo de caja`,
        description: clase === 'faltante'
          ? 'Se contó menos efectivo del que el sistema esperaba. Mientras no se revise, el mayor sigue contando ese dinero como si estuviera en la caja.'
          : 'Se contó más efectivo del que el sistema esperaba. Hay una entrada que no quedó registrada.',
        actionText: 'Revisar el arqueo',
        actionLink: '/dashboard/cash'
      });
    }

    //  Lote 159: el 606 y el 607 del mes cerrado. Se arman a mano -alguien
    //  entra, elige el mes y pulsa exportar- y nada avisaba de que el mes
    //  hubiera cerrado. Medido el 2026-09-18 en Latin Doors: julio (35 compras,
    //  23 comprobantes) y agosto (33 y 17) ya habian pasado el plazo del dia 15
    //  sin que nada lo dijera.
    //
    //  El aviso NO genera ni guarda el fichero: lleva a la pantalla, donde el
    //  TXT se produce al descargarlo y por tanto siempre esta al dia. Se apaga
    //  cuando alguien marca ese periodo como presentado.
    const periodos = periodosCerrados(today);
    let declaracionesPorPresentar: DeclaracionPendiente[] = [];
    if (periodos.length > 0) {
      const desde = `${periodos[periodos.length - 1].slice(0, 4)}-${periodos[periodos.length - 1].slice(4, 6)}-01`;
      const [comprasPorPeriodo, ventasPorPeriodo, marcadas] = await Promise.all([
        db.select({ periodo: sql<string>`to_char(${expenses.issueDate}, 'YYYYMM')`, n: sql<number>`count(*)::int` })
          .from(expenses)
          .where(withTenantMode(expenses, ctx, isNull(expenses.deletedAt), sql`coalesce(${expenses.ncf}, '') <> ''`, gte(expenses.issueDate, desde)))
          .groupBy(sql`to_char(${expenses.issueDate}, 'YYYYMM')`),
        db.select({ periodo: sql<string>`to_char(${invoices.createdAt}, 'YYYYMM')`, n: sql<number>`count(*)::int` })
          .from(invoices)
          .where(withTenantMode(invoices, ctx, isNull(invoices.deletedAt), sql`${invoices.status} not in ('draft', 'rejected', 'void')`, gte(invoices.createdAt, new Date(`${desde}T00:00:00-04:00`))))
          .groupBy(sql`to_char(${invoices.createdAt}, 'YYYYMM')`),
        db.select({ tipo: declaracionesDgii.tipo, periodo: declaracionesDgii.periodo })
          .from(declaracionesDgii)
          .where(withTenantMode(declaracionesDgii, ctx)),
      ]);

      const con606 = new Set(comprasPorPeriodo.filter((f) => f.n > 0).map((f) => f.periodo));
      const con607 = new Set(ventasPorPeriodo.filter((f) => f.n > 0).map((f) => f.periodo));
      const presentadas = new Set(marcadas.map((m) => `${m.tipo}|${m.periodo}`));

      declaracionesPorPresentar = declaracionesPendientes({
        ahora: today,
        conDatos: (tipo, periodo) => (tipo === '606' ? con606 : con607).has(periodo),
        presentada: (tipo, periodo) => presentadas.has(`${tipo}|${periodo}`),
      });

      for (const d of declaracionesPorPresentar) {
        alertsDetails.push({
          id: `declaracion-${d.tipo}-${d.periodo}`,
          type: 'declaracion_pendiente',
          title: tituloDeclaracion(d),
          description: d.vencida
            ? `El formato ${d.tipo} de ese mes no consta presentado y el plazo de la DGII (día ${DIA_LIMITE_DECLARACION}) ya pasó.`
            : `Descárguelo y preséntelo en la Oficina Virtual antes del ${d.limite}.`,
          actionText: `Ir al ${d.tipo}`,
          actionLink: `/dashboard/reports/${d.tipo}?period=${d.periodo}`,
        });
      }
    }

    return {
      invoicesToday,
      invoicesTodayAmount,
      invoicesTodayChangePct,
      pendingDgii,
      monthlySales,
      alertCount: alertCount + dueGuaranteeChecksCount + avisoPeriodos + cajasSinCerrar.length + declaracionesPorPresentar.length,
      totalInvoices,
      monthlyGoal: 2000000, // Fixed for now
      dueGuaranteeChecksCount,
      alertsDetails
    };
  }

  static async getCategorySales(companyId: string, days: number = 30, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const sales = await db.select({
      categoryName: productCategories.name,
      totalAmount: sql<number>`sum(${invoiceLines.total})`,
    }).from(invoiceLines)
      .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(
        and(
          withTenantMode(invoices, ctx, gte(invoices.createdAt, startOfRange), inArray(invoices.status, ['accepted', 'signed', 'submitted']), isNull(invoices.deletedAt))
        )
      )
      .groupBy(productCategories.name);

    const grandTotalResult = await db.select({
      realTotal: sql<number>`sum(${invoices.total})`
    }).from(invoices)
      .where(
        and(
          withTenantMode(invoices, ctx, gte(invoices.createdAt, startOfRange), inArray(invoices.status, ['accepted', 'signed', 'submitted']), isNull(invoices.deletedAt))
        )
      );
    
    const realTotal = Number(grandTotalResult[0]?.realTotal) || 0;
    const lineTotalSum = sales.reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0);
    
    const PREDEFINED_COLORS = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6', 
      '#6366f1', '#d946ef'
    ];
    
    const sortedSales = sales.sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0));
    let distributedTotal = 0;

    return sortedSales.map((s, idx) => {
      const lineAmount = Number(s.totalAmount) || 0;
      const pct = lineTotalSum > 0 ? (lineAmount / lineTotalSum) : 0;
      const name = s.categoryName || 'Sin Categoría';
      
      let amount = 0;
      if (idx === sortedSales.length - 1) {
        amount = realTotal - distributedTotal;
      } else {
        amount = realTotal * pct;
        distributedTotal += amount;
      }

      const value = realTotal > 0 ? Math.round(pct * 100) : 0;

      return {
        name,
        value,
        amount,
        color: PREDEFINED_COLORS[idx % PREDEFINED_COLORS.length]
      };
    });
  }

  static async getCollectionStatus(companyId: string, days: number = 30, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const collection = await db.select({
      paymentStatus: invoices.paymentStatus,
      totalAmount: sql<number>`sum(${invoices.total})`,
    }).from(invoices)
      .where(
        and(
          withTenantMode(invoices, ctx, gte(invoices.createdAt, startOfRange), inArray(invoices.status, ['accepted', 'signed', 'submitted']), isNull(invoices.deletedAt))
        )
      )
      .groupBy(invoices.paymentStatus);

    let paid = 0;
    let unpaid = 0;
    let partial = 0;

    for (const row of collection) {
      const amount = Number(row.totalAmount) || 0;
      if (row.paymentStatus === 'paid') paid += amount;
      else if (row.paymentStatus === 'partial') partial += amount;
      else unpaid += amount; // 'unpaid'
    }

    const total = paid + unpaid + partial;
    
    return [
      { name: 'Cobrada', value: total > 0 ? Math.round((paid / total) * 100) : 0, amount: paid, color: '#10b981' },
      { name: 'Abonada', value: total > 0 ? Math.round((partial / total) * 100) : 0, amount: partial, color: '#f59e0b' },
      { name: 'Pendiente', value: total > 0 ? Math.round((unpaid / total) * 100) : 0, amount: unpaid, color: '#ef4444' }
    ];
  }

  static async getWeeklyChart(companyId: string, days: number = 7, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        gte(invoices.createdAt, startOfRange),
        inArray(invoices.status, ['accepted', 'signed', 'submitted']),
        isNull(invoices.deletedAt)
      )
    );

    if (days === 28) {
      const chartData = [];
      for (let w = 0; w < 4; w++) {
        const weekStart = new Date(startOfRange);
        weekStart.setUTCDate(weekStart.getUTCDate() + (w * 7));
        
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        weekEnd.setUTCHours(23, 59, 59, 999);

        let amount = 0;
        for (const inv of weekInvoices) {
          const invDate = new Date(inv.createdAt);
          if (invDate >= weekStart && invDate <= weekEnd) {
            amount += (parseFloat(inv.total) || 0);
          }
        }

        chartData.push({
          day: `${w + 1} semana`,
          amount
        });
      }
      
      const maxAmount = Math.max(...chartData.map(c => c.amount), 1);
      return chartData.map(c => ({
        day: c.day,
        amount: c.amount,
        pct: Math.round((c.amount / maxAmount) * 100)
      }));
    }

    const dayObjects = [];
    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setUTCDate(d.getUTCDate() - i);
      dayObjects.push(d);
    }

    const chartData = dayObjects.map(d => {
      let amount = 0;
      for (const inv of weekInvoices) {
        const invDate = new Date(inv.createdAt);
        if (
          invDate.getUTCDate() === d.getUTCDate() &&
          invDate.getUTCMonth() === d.getUTCMonth() &&
          invDate.getUTCFullYear() === d.getUTCFullYear()
        ) {
          amount += (parseFloat(inv.total) || 0);
        }
      }

      return {
        day: mapDayName[d.getUTCDay() as keyof typeof mapDayName],
        amount
      };
    });

    const maxAmount = Math.max(...chartData.map(c => c.amount), 1);
    return chartData.map(c => ({
      day: c.day,
      amount: c.amount,
      pct: Math.round((c.amount / maxAmount) * 100)
    }));
  }

  static async getRecentActivity(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    return await db.select({
      id: invoices.id,
      ncf: invoices.ncf,
      ecfType: invoices.ecfType,
      status: invoices.status,
      total: invoices.total,
      createdAt: invoices.createdAt,
      buyerName: invoices.buyerName,
      buyerRnc: invoices.buyerRnc
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        ne(invoices.status, 'draft'),
        isNull(invoices.deletedAt)
      )
    )
    .orderBy(desc(invoices.createdAt))
    .limit(10);
  }

  static async getComparisonChart(companyId: string, days: number = 7, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        gte(invoices.createdAt, startOfRange),
        inArray(invoices.status, ['accepted', 'signed', 'submitted']),
        isNull(invoices.deletedAt)
      )
    );

    const weekExpenses = await db.select({
      amount: expenses.amount,
      createdAt: expenses.createdAt
    }).from(expenses)
    .where(
      withTenantMode(
        expenses,
        ctx,
        gte(expenses.createdAt, startOfRange)
      )
    );

    if (days === 28) {
      const chartData = [];
      for (let w = 0; w < 4; w++) {
        const weekStart = new Date(startOfRange);
        weekStart.setUTCDate(weekStart.getUTCDate() + (w * 7));
        
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        weekEnd.setUTCHours(23, 59, 59, 999);

        let sales = 0;
        let purchases = 0;
        for (const inv of weekInvoices) {
          const invDate = new Date(inv.createdAt);
          if (invDate >= weekStart && invDate <= weekEnd) {
            sales += parseFloat(inv.total) || 0;
          }
        }
        for (const exp of weekExpenses) {
          const expDate = new Date(exp.createdAt);
          if (expDate >= weekStart && expDate <= weekEnd) {
            purchases += parseFloat(exp.amount) || 0;
          }
        }

        chartData.push({
          day: `${w + 1} semana`,
          sales,
          purchases
        });
      }
      return chartData;
    }

    const dayObjects = [];
    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setUTCDate(d.getUTCDate() - i);
      dayObjects.push(d);
    }

    const chartData = dayObjects.map(d => {
      let sales = 0;
      let purchases = 0;
      for (const inv of weekInvoices) {
        const invDate = new Date(inv.createdAt);
        if (
          invDate.getUTCDate() === d.getUTCDate() &&
          invDate.getUTCMonth() === d.getUTCMonth() &&
          invDate.getUTCFullYear() === d.getUTCFullYear()
        ) {
          sales += parseFloat(inv.total) || 0;
        }
      }
      for (const exp of weekExpenses) {
        const expDate = new Date(exp.createdAt);
        if (
          expDate.getUTCDate() === d.getUTCDate() &&
          expDate.getUTCMonth() === d.getUTCMonth() &&
          expDate.getUTCFullYear() === d.getUTCFullYear()
        ) {
          purchases += parseFloat(exp.amount) || 0;
        }
      }

      return {
        day: mapDayName[d.getUTCDay() as keyof typeof mapDayName],
        sales,
        purchases
      };
    });

    return chartData;
  }

  static async getTopCustomers(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthInvoices = await db.select({
      total: invoices.total,
      buyerName: invoices.buyerName
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        gte(invoices.createdAt, startOfMonth)
      )
    );

    const customerTotals: Record<string, number> = {};
    for (const inv of monthInvoices) {
      const name = inv.buyerName || 'Consumidor Final';
      customerTotals[name] = (customerTotals[name] || 0) + (parseFloat(inv.total) || 0);
    }

    const sorted = Object.entries(customerTotals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return sorted;
  }
}
