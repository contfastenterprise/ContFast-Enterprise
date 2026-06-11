import { db } from '../src/db';
import { companies, warehouses, userWarehouses, products, inventoryLevels, invoices, expenses } from '../src/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq, isNull } from 'drizzle-orm';

async function main() {
  console.log('Iniciando migración a Multialmacén...');

  // 1. Obtener todas las compañías
  const allCompanies = await db.select().from(companies);

  for (const company of allCompanies) {
    console.log(`\nProcesando compañía: ${company.name} (${company.id})`);

    // 2. Revisar si ya existe el Almacén Principal
    const existingWarehouses = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.companyId, company.id));

    let mainWarehouseId = existingWarehouses.length > 0 ? existingWarehouses[0].id : null;

    if (!mainWarehouseId) {
      mainWarehouseId = uuidv4();
      console.log(`Creando Almacén Principal para ${company.name} (ID: ${mainWarehouseId})...`);
      
      await db.insert(warehouses).values({
        id: mainWarehouseId,
        companyId: company.id,
        name: 'Almacén Principal',
        code: 'ALM-01',
        address: 'Dirección Principal',
        status: 'active'
      });
    } else {
      console.log(`El Almacén Principal ya existe (ID: ${mainWarehouseId}).`);
    }

    // 3. Inicializar inventory_levels para todos los productos existentes
    const companyProducts = await db
      .select()
      .from(products)
      .where(eq(products.companyId, company.id));

    console.log(`Encontrados ${companyProducts.length} productos. Inicializando niveles de inventario...`);
    
    for (const product of companyProducts) {
      const existingLevel = await db
        .select()
        .from(inventoryLevels)
        .where(eq(inventoryLevels.productId, product.id));

      if (existingLevel.length === 0) {
        await db.insert(inventoryLevels).values({
          id: uuidv4(),
          companyId: company.id,
          productId: product.id,
          warehouseId: mainWarehouseId,
          quantity: '0.0000', // We set it to 0 as we don't have global stock before this point explicitly mapped
          minStock: '0.0000'
        });
      }
    }

    // 4. Actualizar facturas (invoices) que no tienen warehouseId
    const invoicesWithoutWarehouse = await db
      .select()
      .from(invoices)
      .where(isNull(invoices.warehouseId));
    
    if (invoicesWithoutWarehouse.length > 0) {
      console.log(`Asignando Almacén Principal a ${invoicesWithoutWarehouse.length} facturas antiguas...`);
      // Update invoices that belong to this company
      const companyInvoices = invoicesWithoutWarehouse.filter(inv => inv.companyId === company.id);
      for (const inv of companyInvoices) {
        await db.update(invoices).set({ warehouseId: mainWarehouseId }).where(eq(invoices.id, inv.id));
      }
    }

    // 5. Actualizar compras (expenses) que no tienen warehouseId
    const expensesWithoutWarehouse = await db
      .select()
      .from(expenses)
      .where(isNull(expenses.warehouseId));

    if (expensesWithoutWarehouse.length > 0) {
      console.log(`Asignando Almacén Principal a ${expensesWithoutWarehouse.length} compras/gastos antiguos...`);
      const companyExpenses = expensesWithoutWarehouse.filter(exp => exp.companyId === company.id);
      for (const exp of companyExpenses) {
        await db.update(expenses).set({ warehouseId: mainWarehouseId }).where(eq(expenses.id, exp.id));
      }
    }
  }

  console.log('\nMigración completada exitosamente.');
  process.exit(0);
}

main().catch(console.error);
