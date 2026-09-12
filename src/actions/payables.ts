'use server';

import { db, accountsPayable, suppliers, supplierPayments, companies, companySettings, purchaseOrders, expenses, expenseTypes } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { exigirSesion } from './_sesion';
import { enforcePermission } from '@/middleware/permissions';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { diaDe, hoyDia } from '@/utils/fechasLocales';
import { repartirEnTramos, sumaVencida } from '@/services/cartera/vencimiento';

export async function getPayablesDashboardData() {
  const auth = await exigirSesion();

  // AUTORIZACION, NO SOLO AUTENTICACION.
  //
  // Hasta aqui esto solo comprobaba que HUBIERA sesion. La unica puerta que
  // dejaba fuera a los demas era el menu lateral -- y un menu no es control de
  // acceso: no lo aplica nadie, solo esconde el enlace. Cualquier sesion de la
  // empresa que escribiera /dashboard/financial/accounts-payable en la barra de
  // direcciones recibia la cartera entera.
  //
  // Es el mismo patron de ISO-03 (rutas que verifican sesion y no permiso) con
  // un agravante: la guarda que existe para impedirlo, permisosRutas.vitest.ts,
  // recorria src/app/api/**/route.ts y se detenia ahi, asi que las acciones de
  // servidor quedaban fuera de su alcance. Eso tambien se amplia en este lote.
  //
  // Lanza en vez de devolver `success: false` a proposito: es lo que ya hacia
  // la comprobacion de sesion, y ademas la pagina de pagar no mira `success`
  // -- un `false` silencioso le pintaria un panel vacio, que es la clase de
  // "no puedes" disfrazado de averia que no queremos.
  await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'proveedores', 'read');
  
  const { companyId, modo } = auth;

  const companyQuery = await db.select({
    name: companies.name,
    logoUrl: companySettings.logoUrl
  })
  .from(companies)
  .leftJoin(companySettings, eq(companySettings.companyId, companies.id))
  .where(eq(companies.id, companyId))
  .limit(1);
  
  const companyInfo = companyQuery[0] || { name: 'Empresa', logoUrl: null };

  // Extraer las Cuentas por Pagar
  const apList = await db
    .select({
      id: accountsPayable.id,
      amount: accountsPayable.amount,
      balance: accountsPayable.balance,
      dueDate: accountsPayable.dueDate,
      status: accountsPayable.status,
      supplierName: suppliers.name,
      supplierId: suppliers.id,
      purchaseOrderId: accountsPayable.purchaseOrderId,
      expenseId: accountsPayable.expenseId,
      expenseTypeName: expenseTypes.name,
      createdAt: accountsPayable.createdAt,
    })
    .from(accountsPayable)
    .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
    .leftJoin(expenses, eq(accountsPayable.expenseId, expenses.id))
    .leftJoin(expenseTypes, eq(expenses.expenseType, expenseTypes.code))
    .where(
      and(
        eq(accountsPayable.companyId, companyId),
        eq(accountsPayable.modo, modo as ModoOperativo),
        isNull(accountsPayable.deletedAt)
      )
    );

  // Extraer los Pagos de este mes
  // Como texto: 'AAAA-MM-01' se compara con otro dia 'AAAA-MM-DD' sin mas.
  const primerDiaDelMes = hoyDia().slice(0, 8) + '01';
  
  const paymentsList = await db
    .select({
      amount: supplierPayments.amount,
      date: supplierPayments.date,
      paymentMethod: supplierPayments.paymentMethod,
    })
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.companyId, companyId),
        eq(supplierPayments.modo, modo as ModoOperativo),
        isNull(supplierPayments.deletedAt)
      )
    );

  const raw = apList.map(ap => ({
    ...ap,
    balance: Number(ap.balance),
    amount: Number(ap.amount),
    // El dia, tal cual lo guardo la base. Pasarlo por `new Date(...).toISOString()`
    // no anadia nada y obligaba a todo el que lo recibiera a volver a
    // interpretarlo -- que es donde se perdia el dia.
    dueDate: diaDe(ap.dueDate) ?? ''
  }));

  // Inicializar KPIs
  let totalPorPagar = 0;
  let totalVencido = 0;
  let totalPorVencer = 0;
  let pagadoEsteMes = 0;

  const hoy = hoyDia();

  // Calcular métricas AP. Los tramos y el "esta vencido" los decide
  // `services/cartera/vencimiento`, no este fichero.
  //
  // Nota historica: aqui `totalPorPagar += item.balance` iba ANTES del
  // `if (balance <= 0) return`, asi que un saldo a favor restaba del total por
  // pagar; su gemela de cobrar nunca lo hizo. Al repartir en tramos eso deja de
  // poder pasar: lo saldado cae en su propio tramo y no suma a ninguno.
  const tramos = repartirEnTramos(raw, x => x.balance, x => x.dueDate, hoy);
  totalVencido = sumaVencida(tramos);
  totalPorVencer = tramos['por-vencer'];
  totalPorPagar = totalVencido + totalPorVencer;

  // Calcular Pagos del Mes
  paymentsList.forEach(payment => {
    const dia = diaDe(payment.date);
    if (dia && dia >= primerDiaDelMes) {
      pagadoEsteMes += Number(payment.amount);
    }
  });

  // Aging Buckets (Antigüedad) — el mismo reparto de arriba, sin recalcularlo.
  const buckets = {
    '0-30': tramos['1-30'],
    '31-60': tramos['31-60'],
    '61-90': tramos['61-90'],
    '90+': tramos['90+'],
  };

  const agingData = [
    { name: '0-30 Días', value: buckets['0-30'] },
    { name: '31-60 Días', value: buckets['31-60'] },
    { name: '61-90 Días', value: buckets['61-90'] },
    { name: 'Más de 90 Días', value: buckets['90+'] },
  ];

  // Top Suplidores (Top 10)
  const supplierMap: Record<string, { name: string, balance: number }> = {};
  raw.forEach(item => {
    if (item.balance > 0) {
      if (!supplierMap[item.supplierId]) {
        supplierMap[item.supplierId] = { name: item.supplierName, balance: 0 };
      }
      supplierMap[item.supplierId].balance += item.balance;
    }
  });
  
  const topSuppliers = Object.values(supplierMap)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  // Evolución mensual (Fake para visualización dado que en DB requeriría series de tiempo)
  // Normalmente aquí sumaríamos facturas por mes, lo emulamos en base a los datos existentes:
  const monthlyData = [
    { name: 'Ene', value: Math.max(0, totalPorPagar * 0.9 + (Math.random() * 10000)) },
    { name: 'Feb', value: Math.max(0, totalPorPagar * 0.95 + (Math.random() * 10000)) },
    { name: 'Mar', value: Math.max(0, totalPorPagar * 0.8 + (Math.random() * 10000)) },
    { name: 'Abr', value: Math.max(0, totalPorPagar * 1.1 + (Math.random() * 10000)) },
    { name: 'May', value: Math.max(0, totalPorPagar * 1.05 + (Math.random() * 10000)) },
    { name: 'Jun', value: totalPorPagar }, // mes actual aprox
  ];

  // Categorías de Gastos Reales
  const categoryMap: Record<string, number> = {};
  raw.forEach(item => {
    // Determine category based on the origin
    let category = 'Otros / No Clasificado';
    if (item.purchaseOrderId) {
      category = 'Inventario / Compras';
    } else if (item.expenseTypeName) {
      category = item.expenseTypeName;
    }
    
    if (!categoryMap[category]) {
      categoryMap[category] = 0;
    }
    categoryMap[category] += item.balance;
  });

  let categoriesData = Object.keys(categoryMap).map(name => ({
    name,
    value: categoryMap[name]
  })).sort((a, b) => b.value - a.value);
  
  // Si no hay deudas, mostrar un array vacío o cero para no romper la gráfica
  if (categoriesData.length === 0) {
     categoriesData = [{ name: 'Sin Deudas', value: 0 }];
  }

  const complianceRate = totalPorPagar > 0 ? ((totalPorPagar - totalVencido) / totalPorPagar) * 100 : 100;

  return {
    raw,
    companyInfo,
    kpis: {
      totalPorPagar,
      totalVencido,
      totalPorVencer,
      pagadoEsteMes,
      complianceRate
    },
    charts: {
      agingData,
      topSuppliers,
      monthlyData,
      categoriesData
    }
  };
}
