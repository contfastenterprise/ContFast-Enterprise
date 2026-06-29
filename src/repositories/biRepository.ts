import { db } from '@/db';
import { 
  invoices, invoiceLines, products, productCategories, 
  customers, suppliers, inventoryLevels, inventoryMovements, 
  warehouses, users, expenses, expenseLines, 
  accountsReceivable, accountsPayable, quotes, deliveryNotes,
  retentions, invoiceRetentions, payrolls, payrollDetails
} from '@/db/schema';
import { eq, and, gte, lte, sql, desc, asc, isNull, inArray, notInArray } from 'drizzle-orm';

export interface BIFilters {
  startDate?: string;
  endDate?: string;
  warehouseId?: string;
  userId?: string;
  categoryId?: string;
  customerId?: string;
  supplierId?: string;
  status?: string;
  ecfType?: string;
}

export class BIRepository {
  
  private static activeSalesStatuses = ['accepted', 'signed', 'submitted'];

  private static applyInvoiceFilters(filters: BIFilters) {
    const conds = [];
    if (filters.startDate) conds.push(gte(sql`DATE(${invoices.createdAt})`, filters.startDate));
    if (filters.endDate) conds.push(lte(sql`DATE(${invoices.createdAt})`, filters.endDate));
    if (filters.warehouseId && filters.warehouseId !== 'all') conds.push(eq(invoices.warehouseId, filters.warehouseId));
    if (filters.userId && filters.userId !== 'all') conds.push(eq(invoices.userId, filters.userId));
    if (filters.customerId && filters.customerId !== 'all') conds.push(eq(invoices.customerId, filters.customerId));
    if (filters.status && filters.status !== 'all') conds.push(eq(invoices.status, filters.status));
    if (filters.ecfType && filters.ecfType !== 'all') conds.push(eq(invoices.ecfType, filters.ecfType));
    return conds;
  }

  private static applyExpenseFilters(filters: BIFilters) {
    const conds = [];
    if (filters.startDate) conds.push(gte(expenses.issueDate, filters.startDate));
    if (filters.endDate) conds.push(lte(expenses.issueDate, filters.endDate));
    if (filters.warehouseId && filters.warehouseId !== 'all') conds.push(eq(expenses.warehouseId, filters.warehouseId));
    if (filters.supplierId && filters.supplierId !== 'all') conds.push(eq(expenses.supplierId, filters.supplierId));
    return conds;
  }

  // ─── 1. GENERAL EXECUTIVE DASHBOARD ─────────────────────────────────────────
  static async getGeneralStats(companyId: string, filters: BIFilters) {
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const startOfYearStr = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

    // Sales Aggregations
    const invoiceConds = this.applyInvoiceFilters(filters);
    const [salesAgg] = await db.select({
      todaySales: sql<number>`SUM(CASE WHEN DATE(${invoices.createdAt}) = ${todayStr} THEN CAST(${invoices.total} AS numeric) ELSE 0 END)`,
      monthSales: sql<number>`SUM(CASE WHEN DATE(${invoices.createdAt}) >= ${startOfMonthStr} THEN CAST(${invoices.total} AS numeric) ELSE 0 END)`,
      yearSales: sql<number>`SUM(CASE WHEN DATE(${invoices.createdAt}) >= ${startOfYearStr} THEN CAST(${invoices.total} AS numeric) ELSE 0 END)`,
      totalInvoices: sql<number>`COUNT(${invoices.id})`
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      isNull(invoices.deletedAt),
      ...invoiceConds
    ));

    // COGS (Cost of Goods Sold) for net profit calculation
    const [cogsAgg] = await db.select({
      totalCogs: sql<number>`SUM(CAST(${invoiceLines.quantity} AS numeric) * CAST(${products.cost} AS numeric))`
    }).from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .innerJoin(products, eq(invoiceLines.productId, products.id))
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      isNull(invoices.deletedAt),
      ...invoiceConds
    ));

    // Purchases (Expenses) for Month
    const expenseConds = this.applyExpenseFilters(filters);
    const [purchasesAgg] = await db.select({
      monthPurchases: sql<number>`SUM(CASE WHEN ${expenses.issueDate} >= ${startOfMonthStr} THEN CAST(${expenses.amount} AS numeric) ELSE 0 END)`
    }).from(expenses)
    .where(and(
      eq(expenses.companyId, companyId),
      isNull(expenses.deletedAt),
      ...expenseConds
    ));

    // Customer and Product Counts
    const [customerCountResult] = await db.select({ val: sql<number>`COUNT(${customers.id})` })
      .from(customers).where(and(eq(customers.companyId, companyId), eq(customers.status, 'active'), isNull(customers.deletedAt)));
    const [productCountResult] = await db.select({ val: sql<number>`COUNT(${products.id})` })
      .from(products).where(and(eq(products.companyId, companyId), eq(products.status, 'active'), isNull(products.deletedAt)));

    // Inventory Cost and Value
    const [inventoryAgg] = await db.select({
      totalCost: sql<number>`SUM(CAST(${inventoryLevels.quantity} AS numeric) * CAST(${products.cost} AS numeric))`,
      totalValue: sql<number>`SUM(CAST(${inventoryLevels.quantity} AS numeric) * CAST(${products.price} AS numeric))`
    }).from(inventoryLevels)
    .innerJoin(products, eq(inventoryLevels.productId, products.id))
    .where(and(
      eq(inventoryLevels.companyId, companyId),
      isNull(products.deletedAt),
      filters.warehouseId && filters.warehouseId !== 'all' ? eq(inventoryLevels.warehouseId, filters.warehouseId) : undefined,
      filters.categoryId && filters.categoryId !== 'all' ? eq(products.categoryId, filters.categoryId) : undefined
    ));

    // Stock Alerts
    const [stockAlerts] = await db.select({
      outOfStock: sql<number>`COUNT(CASE WHEN CAST(${inventoryLevels.quantity} AS numeric) <= 0 THEN 1 END)`,
      lowStock: sql<number>`COUNT(CASE WHEN CAST(${inventoryLevels.quantity} AS numeric) > 0 AND CAST(${inventoryLevels.quantity} AS numeric) <= CAST(${inventoryLevels.minStock} AS numeric) THEN 1 END)`
    }).from(inventoryLevels)
    .innerJoin(products, eq(inventoryLevels.productId, products.id))
    .where(and(
      eq(inventoryLevels.companyId, companyId),
      isNull(products.deletedAt),
      filters.warehouseId && filters.warehouseId !== 'all' ? eq(inventoryLevels.warehouseId, filters.warehouseId) : undefined
    ));

    // Receivables (CxC) and Payables (CxP)
    const [receivablesAgg] = await db.select({
      pendingAmount: sql<number>`SUM(CAST(${accountsReceivable.balance} AS numeric))`,
      overdueCount: sql<number>`COUNT(CASE WHEN ${accountsReceivable.dueDate} < ${todayStr} AND CAST(${accountsReceivable.balance} AS numeric) > 0 THEN 1 END)`,
      indebtedCount: sql<number>`COUNT(DISTINCT ${accountsReceivable.customerId})`
    }).from(accountsReceivable)
    .where(and(
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.status, 'pending'),
      isNull(accountsReceivable.deletedAt),
      filters.customerId && filters.customerId !== 'all' ? eq(accountsReceivable.customerId, filters.customerId) : undefined
    ));

    const [payablesAgg] = await db.select({
      pendingAmount: sql<number>`SUM(CAST(${accountsPayable.balance} AS numeric))`
    }).from(accountsPayable)
    .where(and(
      eq(accountsPayable.companyId, companyId),
      eq(accountsPayable.status, 'pending'),
      isNull(accountsPayable.deletedAt),
      filters.supplierId && filters.supplierId !== 'all' ? eq(accountsPayable.supplierId, filters.supplierId) : undefined
    ));

    // Estimated Profit Calculation
    const revenue = Number(salesAgg?.monthSales) || 0;
    const cogs = Number(cogsAgg?.totalCogs) || 0;
    const estimatedProfit = revenue - cogs;

    // Inventory Rotation Rate (COGS / Inventory Cost)
    const invCost = Number(inventoryAgg?.totalCost) || 0;
    const inventoryTurnover = invCost > 0 ? (cogs / invCost) : 0;

    return {
      salesToday: Number(salesAgg?.todaySales) || 0,
      salesMonth: Number(salesAgg?.monthSales) || 0,
      salesYear: Number(salesAgg?.yearSales) || 0,
      countInvoices: Number(salesAgg?.totalInvoices) || 0,
      countCustomers: Number(customerCountResult?.val) || 0,
      countProducts: Number(productCountResult?.val) || 0,
      productsOutOfStock: Number(stockAlerts?.outOfStock) || 0,
      productsLowStock: Number(stockAlerts?.lowStock) || 0,
      overdueInvoices: Number(receivablesAgg?.overdueCount) || 0,
      indebtedCustomers: Number(receivablesAgg?.indebtedCount) || 0,
      receivablesAmount: Number(receivablesAgg?.pendingAmount) || 0,
      payablesAmount: Number(payablesAgg?.pendingAmount) || 0,
      purchasesMonth: Number(purchasesAgg?.monthPurchases) || 0,
      estimatedProfit,
      inventoryCost: invCost,
      inventoryValue: Number(inventoryAgg?.totalValue) || 0,
      inventoryTurnover,
    };
  }

  // ─── 2. PRODUCT ANALYSIS ────────────────────────────────────────────────────
  static async getProductStats(companyId: string, filters: BIFilters) {
    const invoiceConds = this.applyInvoiceFilters(filters);
    
    // Top Sold Products by Volume & Profit
    const items = await db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: productCategories.name,
      quantitySold: sql<number>`SUM(CAST(${invoiceLines.quantity} AS numeric))`,
      revenue: sql<number>`SUM(CAST(${invoiceLines.total} AS numeric))`,
      costOfSold: sql<number>`SUM(CAST(${invoiceLines.quantity} AS numeric) * CAST(${products.cost} AS numeric))`,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .innerJoin(products, eq(invoiceLines.productId, products.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      isNull(invoices.deletedAt),
      filters.categoryId && filters.categoryId !== 'all' ? eq(products.categoryId, filters.categoryId) : undefined,
      ...invoiceConds
    ))
    .groupBy(products.id, products.name, products.sku, productCategories.name)
    .orderBy(desc(sql`SUM(CAST(${invoiceLines.quantity} AS numeric))`));

    const mappedItems = items.map(item => {
      const quantity = Number(item.quantitySold) || 0;
      const revenue = Number(item.revenue) || 0;
      const cost = Number(item.costOfSold) || 0;
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        category: item.category || 'Sin Categoría',
        quantity,
        revenue,
        profit,
        margin
      };
    });

    const top10 = mappedItems.slice(0, 10);
    const top20 = mappedItems.slice(0, 20);
    const bottom10 = [...mappedItems].reverse().filter(p => p.quantity > 0).slice(0, 10);

    // Products with No Movement (unsold products)
    const soldProductIds = items.map(item => item.id);
    let unsoldQuery = db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.price,
      cost: products.cost,
    }).from(products)
    .where(and(
      eq(products.companyId, companyId),
      eq(products.status, 'active'),
      isNull(products.deletedAt),
      filters.categoryId && filters.categoryId !== 'all' ? eq(products.categoryId, filters.categoryId) : undefined
    ));

    const allProducts = await unsoldQuery;
    const noMovement = allProducts
      .filter(p => !soldProductIds.includes(p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku || 'N/A',
        price: Number(p.price) || 0,
        cost: Number(p.cost) || 0
      }));

    // Profitability Rankings
    const highestProfit = [...mappedItems].sort((a, b) => b.profit - a.profit).slice(0, 10);
    const lowestProfit = [...mappedItems].sort((a, b) => a.profit - b.profit).slice(0, 10);
    const highestMargin = [...mappedItems].filter(p => p.revenue > 1000).sort((a, b) => b.margin - a.margin).slice(0, 10);
    const lowestMargin = [...mappedItems].filter(p => p.revenue > 1000).sort((a, b) => a.margin - b.margin).slice(0, 10);

    // Product Return Rates (based on returns/refunds in inventory_movements)
    const returns = await db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      quantityReturned: sql<number>`SUM(ABS(CAST(${inventoryMovements.quantity} AS numeric)))`
    }).from(inventoryMovements)
    .innerJoin(products, eq(inventoryMovements.productId, products.id))
    .where(and(
      eq(inventoryMovements.companyId, companyId),
      eq(inventoryMovements.type, 'refund'),
      filters.startDate ? gte(inventoryMovements.createdAt, new Date(filters.startDate)) : undefined,
      filters.endDate ? lte(inventoryMovements.createdAt, new Date(filters.endDate)) : undefined
    ))
    .groupBy(products.id, products.name, products.sku)
    .orderBy(desc(sql`SUM(ABS(CAST(${inventoryMovements.quantity} AS numeric)))`))
    .limit(10);

    return {
      top10,
      top20,
      bottom10,
      noMovement,
      highestProfit,
      lowestProfit,
      highestMargin,
      lowestMargin,
      returns: returns.map(r => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        quantity: Number(r.quantityReturned) || 0
      }))
    };
  }

  // ─── 3. INVENTORY FLOW & ROTATION ──────────────────────────────────────────
  static async getInventoryStats(companyId: string, filters: BIFilters) {
    // Flow Aggregations
    const movementsConds = [eq(inventoryMovements.companyId, companyId)];
    if (filters.startDate) movementsConds.push(gte(inventoryMovements.createdAt, new Date(filters.startDate)));
    if (filters.endDate) movementsConds.push(lte(inventoryMovements.createdAt, new Date(filters.endDate)));
    if (filters.warehouseId && filters.warehouseId !== 'all') movementsConds.push(eq(inventoryMovements.warehouseId, filters.warehouseId));

    const flows = await db.select({
      type: inventoryMovements.type,
      totalQuantity: sql<number>`SUM(ABS(CAST(${inventoryMovements.quantity} AS numeric)))`
    }).from(inventoryMovements)
    .where(and(...movementsConds))
    .groupBy(inventoryMovements.type);

    const flowMap = flows.reduce((acc, f) => {
      acc[f.type] = Number(f.totalQuantity) || 0;
      return acc;
    }, {} as Record<string, number>);

    // Stock levels details
    const levels = await db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: productCategories.name,
      warehouse: warehouses.name,
      stock: sql<number>`CAST(${inventoryLevels.quantity} AS numeric)`,
      minStock: sql<number>`CAST(${inventoryLevels.minStock} AS numeric)`,
      maxStock: sql<number>`CAST(${inventoryLevels.maxStock} AS numeric)`,
      cost: sql<number>`CAST(${products.cost} AS numeric)`,
      price: sql<number>`CAST(${products.price} AS numeric)`,
    })
    .from(inventoryLevels)
    .innerJoin(products, eq(inventoryLevels.productId, products.id))
    .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(
      eq(inventoryLevels.companyId, companyId),
      isNull(products.deletedAt),
      filters.warehouseId && filters.warehouseId !== 'all' ? eq(inventoryLevels.warehouseId, filters.warehouseId) : undefined,
      filters.categoryId && filters.categoryId !== 'all' ? eq(products.categoryId, filters.categoryId) : undefined
    ));

    const mappedLevels = levels.map(l => {
      const stock = Number(l.stock) || 0;
      const minStock = Number(l.minStock) || 0;
      const maxStock = Number(l.maxStock) || 0;
      const cost = Number(l.cost) || 0;
      const price = Number(l.price) || 0;

      let status = 'normal';
      if (stock <= 0) status = 'exhausted';
      else if (stock <= minStock) status = 'critical';
      else if (maxStock > 0 && stock > maxStock) status = 'excessive';

      return {
        id: l.id,
        name: l.name,
        sku: l.sku,
        category: l.category || 'Sin Categoría',
        warehouse: l.warehouse,
        stock,
        minStock,
        maxStock,
        cost,
        price,
        valueCost: stock * cost,
        valuePrice: stock * price,
        status
      };
    });

    // Rotation calculations by category and warehouse
    const rotationByCategory: Record<string, { cost: number; stockValue: number }> = {};
    const rotationByWarehouse: Record<string, { cost: number; stockValue: number }> = {};

    mappedLevels.forEach(lvl => {
      if (!rotationByCategory[lvl.category]) rotationByCategory[lvl.category] = { cost: 0, stockValue: 0 };
      rotationByCategory[lvl.category].stockValue += lvl.valueCost;

      if (!rotationByWarehouse[lvl.warehouse]) rotationByWarehouse[lvl.warehouse] = { cost: 0, stockValue: 0 };
      rotationByWarehouse[lvl.warehouse].stockValue += lvl.valueCost;
    });

    // Fetch sales cost (COGS) grouped by category
    const salesByCategory = await db.select({
      category: productCategories.name,
      totalCost: sql<number>`SUM(CAST(${invoiceLines.quantity} AS numeric) * CAST(${products.cost} AS numeric))`
    }).from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .innerJoin(products, eq(invoiceLines.productId, products.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      isNull(invoices.deletedAt),
      ...this.applyInvoiceFilters(filters)
    ))
    .groupBy(productCategories.name);

    salesByCategory.forEach(s => {
      const cat = s.category || 'Sin Categoría';
      if (rotationByCategory[cat]) {
        rotationByCategory[cat].cost = Number(s.totalCost) || 0;
      }
    });

    // Fetch sales cost (COGS) grouped by warehouse
    const salesByWarehouse = await db.select({
      warehouse: warehouses.name,
      totalCost: sql<number>`SUM(CAST(${invoiceLines.quantity} AS numeric) * CAST(${products.cost} AS numeric))`
    }).from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .innerJoin(products, eq(invoiceLines.productId, products.id))
    .innerJoin(warehouses, eq(invoices.warehouseId, warehouses.id))
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      isNull(invoices.deletedAt),
      ...this.applyInvoiceFilters(filters)
    ))
    .groupBy(warehouses.name);

    salesByWarehouse.forEach(s => {
      const wh = s.warehouse;
      if (rotationByWarehouse[wh]) {
        rotationByWarehouse[wh].cost = Number(s.totalCost) || 0;
      }
    });

    const categoryRotations = Object.entries(rotationByCategory).map(([name, val]) => ({
      name,
      rotation: val.stockValue > 0 ? (val.cost / val.stockValue) : 0,
      stockValue: val.stockValue,
      salesCost: val.cost
    }));

    const warehouseRotations = Object.entries(rotationByWarehouse).map(([name, val]) => ({
      name,
      rotation: val.stockValue > 0 ? (val.cost / val.stockValue) : 0,
      stockValue: val.stockValue,
      salesCost: val.cost
    }));

    return {
      flows: {
        sales: flowMap['sale'] || 0,
        purchases: flowMap['purchase'] || 0,
        refunds: flowMap['refund'] || flowMap['return'] || 0,
        adjustments: flowMap['adjustment'] || 0,
        transfersIn: flowMap['transfer_in'] || 0,
        transfersOut: flowMap['transfer_out'] || 0,
      },
      stockLevels: mappedLevels,
      categoryRotations,
      warehouseRotations
    };
  }

  // ─── 4. CUSTOMER ANALYTICS & RANKING ────────────────────────────────────────
  static async getCustomerStats(companyId: string, filters: BIFilters) {
    const invoiceConds = this.applyInvoiceFilters(filters);

    // Spender rankings
    const spenders = await db.select({
      id: customers.id,
      name: customers.name,
      rnc: customers.rncCedula,
      phone: customers.phone,
      createdAt: customers.createdAt,
      invoiceCount: sql<number>`COUNT(${invoices.id})`,
      totalSpent: sql<number>`SUM(CAST(${invoices.total} AS numeric))`,
      lastPurchaseDate: sql<string>`MAX(${invoices.createdAt})`
    })
    .from(customers)
    .innerJoin(invoices, eq(invoices.customerId, customers.id))
    .where(and(
      eq(customers.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      isNull(invoices.deletedAt),
      ...invoiceConds
    ))
    .groupBy(customers.id, customers.name, customers.rncCedula, customers.phone, customers.createdAt)
    .orderBy(desc(sql`SUM(CAST(${invoices.total} AS numeric))`));

    const totalDays = filters.startDate && filters.endDate 
      ? Math.max(1, (new Date(filters.endDate).getTime() - new Date(filters.startDate).getTime()) / (1000 * 3600 * 24))
      : 30;

    const mappedSpenders = spenders.map((s, index) => {
      const total = Number(s.totalSpent) || 0;
      const count = Number(s.invoiceCount) || 0;
      const averageTicket = count > 0 ? (total / count) : 0;
      // frequency: purchases per week
      const frequency = totalDays > 0 ? (count / totalDays) * 7 : 0;

      return {
        id: s.id,
        ranking: index + 1,
        name: s.name,
        rnc: s.rnc,
        phone: s.phone || 'N/A',
        createdAt: s.createdAt,
        invoiceCount: count,
        totalSpent: total,
        averageTicket,
        frequency,
        lastPurchase: s.lastPurchaseDate ? new Date(s.lastPurchaseDate).toISOString().split('T')[0] : 'N/A'
      };
    });

    // Inactive customers (no purchases in last 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const inactiveCustomers = await db.select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      rnc: customers.rncCedula,
      lastPurchaseDate: sql<string>`MAX(${invoices.createdAt})`
    })
    .from(customers)
    .innerJoin(invoices, eq(invoices.customerId, customers.id))
    .where(and(
      eq(customers.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      isNull(invoices.deletedAt)
    ))
    .groupBy(customers.id, customers.name, customers.phone, customers.rncCedula)
    .having(sql`MAX(${invoices.createdAt}) < ${sixtyDaysAgo}`);

    // Customer debts
    const debts = await db.select({
      customerId: accountsReceivable.customerId,
      name: customers.name,
      totalDebt: sql<number>`SUM(CAST(${accountsReceivable.balance} AS numeric))`
    }).from(accountsReceivable)
    .innerJoin(customers, eq(accountsReceivable.customerId, customers.id))
    .where(and(
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.status, 'pending'),
      isNull(accountsReceivable.deletedAt)
    ))
    .groupBy(accountsReceivable.customerId, customers.name)
    .orderBy(desc(sql`SUM(CAST(${accountsReceivable.balance} AS numeric))`));

    const debtMap = debts.reduce((acc, d) => {
      acc[d.customerId] = Number(d.totalDebt) || 0;
      return acc;
    }, {} as Record<string, number>);

    const enrichedSpenders = mappedSpenders.map(s => ({
      ...s,
      debt: debtMap[s.id] || 0
    }));

    // New customers in period
    const newCustomers = await db.select({
      id: customers.id,
      name: customers.name,
      createdAt: customers.createdAt
    }).from(customers)
    .where(and(
      eq(customers.companyId, companyId),
      isNull(customers.deletedAt),
      filters.startDate ? gte(customers.createdAt, new Date(filters.startDate)) : undefined,
      filters.endDate ? lte(customers.createdAt, new Date(filters.endDate)) : undefined
    ));

    return {
      ranking: enrichedSpenders,
      newCustomersCount: newCustomers.length,
      newCustomersDetails: newCustomers.slice(0, 10),
      inactiveCustomers: inactiveCustomers.map(ic => ({
        id: ic.id,
        name: ic.name,
        phone: ic.phone || 'N/A',
        rnc: ic.rnc,
        lastPurchase: ic.lastPurchaseDate ? new Date(ic.lastPurchaseDate).toISOString().split('T')[0] : 'N/A'
      }))
    };
  }

  // ─── 5. BILLING & SALES TRENDS ──────────────────────────────────────────────
  static async getBillingStats(companyId: string, filters: BIFilters) {
    const invoiceConds = this.applyInvoiceFilters(filters);

    // Sales by hour
    const salesByHour = await db.select({
      hour: sql<number>`EXTRACT(HOUR FROM ${invoices.createdAt})`,
      amount: sql<number>`SUM(CAST(${invoices.total} AS numeric))`
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      ...invoiceConds
    ))
    .groupBy(sql`EXTRACT(HOUR FROM ${invoices.createdAt})`)
    .orderBy(asc(sql`EXTRACT(HOUR FROM ${invoices.createdAt})`));

    // Sales by day of week
    const salesByDayOfWeek = await db.select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${invoices.createdAt})`, // 0 (Sunday) to 6 (Saturday)
      amount: sql<number>`SUM(CAST(${invoices.total} AS numeric))`
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      ...invoiceConds
    ))
    .groupBy(sql`EXTRACT(DOW FROM ${invoices.createdAt})`)
    .orderBy(asc(sql`EXTRACT(DOW FROM ${invoices.createdAt})`));

    // Sales breakdown by type (e-CF)
    const ecfBreakdown = await db.select({
      ecfType: invoices.ecfType,
      count: sql<number>`COUNT(${invoices.id})`,
      amount: sql<number>`SUM(CAST(${invoices.total} AS numeric))`
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      ...invoiceConds
    ))
    .groupBy(invoices.ecfType);

    // Sales by seller (User)
    const salesBySeller = await db.select({
      sellerId: invoices.userId,
      sellerName: users.name,
      amount: sql<number>`SUM(CAST(${invoices.total} AS numeric))`,
      count: sql<number>`COUNT(${invoices.id})`
    }).from(invoices)
    .innerJoin(users, eq(invoices.userId, users.id))
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses),
      ...invoiceConds
    ))
    .groupBy(invoices.userId, users.name)
    .orderBy(desc(sql`SUM(CAST(${invoices.total} AS numeric))`));

    // Historical dynamic comparisons (monthly evolution)
    const monthlySales = await db.select({
      year: sql<number>`EXTRACT(YEAR FROM ${invoices.createdAt})`,
      month: sql<number>`EXTRACT(MONTH FROM ${invoices.createdAt})`,
      amount: sql<number>`SUM(CAST(${invoices.total} AS numeric))`
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, this.activeSalesStatuses)
    ))
    .groupBy(sql`EXTRACT(YEAR FROM ${invoices.createdAt})`, sql`EXTRACT(MONTH FROM ${invoices.createdAt})`)
    .orderBy(asc(sql`EXTRACT(YEAR FROM ${invoices.createdAt})`), asc(sql`EXTRACT(MONTH FROM ${invoices.createdAt})`));

    // Detailed Invoices Stats counts
    const statusCounts = await db.select({
      status: invoices.status,
      count: sql<number>`COUNT(${invoices.id})`,
      amount: sql<number>`SUM(CAST(${invoices.total} AS numeric))`
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      ...invoiceConds
    ))
    .groupBy(invoices.status);

    return {
      hourly: salesByHour.map(h => ({ hour: Number(h.hour), amount: Number(h.amount) || 0 })),
      weekly: salesByDayOfWeek.map(w => ({ day: Number(w.dayOfWeek), amount: Number(w.amount) || 0 })),
      ecf: ecfBreakdown.map(e => ({ type: e.ecfType, count: Number(e.count) || 0, amount: Number(e.amount) || 0 })),
      sellers: salesBySeller.map(s => ({ id: s.sellerId, name: s.sellerName, amount: Number(s.amount) || 0, count: Number(s.count) || 0 })),
      monthlyHistory: monthlySales.map(m => ({ year: Number(m.year), month: Number(m.month), amount: Number(m.amount) || 0 })),
      statusCounts: statusCounts.map(sc => ({ status: sc.status, count: Number(sc.count) || 0, amount: Number(sc.amount) || 0 }))
    };
  }

  // ─── 6. PURCHASES & EXPENSES ────────────────────────────────────────────────
  static async getPurchaseStats(companyId: string, filters: BIFilters) {
    const expenseConds = this.applyExpenseFilters(filters);

    // Purchases by supplier
    const supplierPurchases = await db.select({
      id: suppliers.id,
      name: suppliers.name,
      rnc: suppliers.rnc,
      count: sql<number>`COUNT(${expenses.id})`,
      amount: sql<number>`SUM(CAST(${expenses.amount} AS numeric))`
    }).from(expenses)
    .innerJoin(suppliers, eq(expenses.supplierId, suppliers.id))
    .where(and(
      eq(expenses.companyId, companyId),
      isNull(expenses.deletedAt),
      ...expenseConds
    ))
    .groupBy(suppliers.id, suppliers.name, suppliers.rnc)
    .orderBy(desc(sql`SUM(CAST(${expenses.amount} AS numeric))`));

    // Top purchased products
    const purchasedProducts = await db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      quantity: sql<number>`SUM(CAST(${expenseLines.quantity} AS numeric))`,
      amount: sql<number>`SUM(CAST(${expenseLines.total} AS numeric))`,
      avgCost: sql<number>`AVG(CAST(${expenseLines.unitCost} AS numeric))`
    }).from(expenseLines)
    .innerJoin(expenses, eq(expenseLines.expenseId, expenses.id))
    .innerJoin(products, eq(expenseLines.productId, products.id))
    .where(and(
      eq(expenses.companyId, companyId),
      isNull(expenses.deletedAt),
      ...expenseConds
    ))
    .groupBy(products.id, products.name, products.sku)
    .orderBy(desc(sql`SUM(CAST(${expenseLines.quantity} AS numeric))`))
    .limit(20);

    // Expenses monthly comparison
    const monthlyExpenses = await db.select({
      year: sql<number>`EXTRACT(YEAR FROM ${expenses.issueDate})`,
      month: sql<number>`EXTRACT(MONTH FROM ${expenses.issueDate})`,
      amount: sql<number>`SUM(CAST(${expenses.amount} AS numeric))`
    }).from(expenses)
    .where(and(
      eq(expenses.companyId, companyId),
      isNull(expenses.deletedAt)
    ))
    .groupBy(sql`EXTRACT(YEAR FROM ${expenses.issueDate})`, sql`EXTRACT(MONTH FROM ${expenses.issueDate})`)
    .orderBy(asc(sql`EXTRACT(YEAR FROM ${expenses.issueDate})`), asc(sql`EXTRACT(MONTH FROM ${expenses.issueDate})`));

    // AP Payments breakdown (pagadas vs pendientes)
    const [apStats] = await db.select({
      totalAp: sql<number>`SUM(CAST(${accountsPayable.amount} AS numeric))`,
      balanceAp: sql<number>`SUM(CAST(${accountsPayable.balance} AS numeric))`
    }).from(accountsPayable)
    .where(eq(accountsPayable.companyId, companyId));

    const totalAp = Number(apStats?.totalAp) || 0;
    const balanceAp = Number(apStats?.balanceAp) || 0;
    const paidAp = Math.max(0, totalAp - balanceAp);

    return {
      suppliers: supplierPurchases.map(s => ({
        id: s.id,
        name: s.name,
        rnc: s.rnc,
        count: Number(s.count) || 0,
        amount: Number(s.amount) || 0
      })),
      topProducts: purchasedProducts.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        quantity: Number(p.quantity) || 0,
        amount: Number(p.amount) || 0,
        avgCost: Number(p.avgCost) || 0
      })),
      monthlyHistory: monthlyExpenses.map(m => ({
        year: Number(m.year),
        month: Number(m.month),
        amount: Number(m.amount) || 0
      })),
      apStatus: {
        total: totalAp,
        pending: balanceAp,
        paid: paidAp
      }
    };
  }
}
