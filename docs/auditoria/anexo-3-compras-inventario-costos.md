# AUDITORÍA FASES 5 Y 6 — COMPRAS, INVENTARIO Y COSTO DE VENTAS

## RESUMEN DEL FLUJO REAL OBSERVADO (10 líneas)

1. **Compra:** `POST /api/v1/expenses` inserta `expenses` + `expense_lines`, y si hay `warehouseId` sube `inventory_levels.quantity` y escribe un renglón en `inventory_movements` (kardex) con tipo `purchase`.
2. El **asiento de compra** se arma en la misma ruta: DÉBITO subtotal + DÉBITO ITBIS (`1.1.08`) + DÉBITO otros impuestos (`5.1.02`) / CRÉDITO neto a `2.1.01` CxP o `1.1.01` Efectivo, + CRÉDITO ISR retenido (`2.1.04`) e ITBIS retenido (`2.1.05`).
3. La cuenta de débito se decide por una sola condición: `hasInventory = !!(warehouseId && lines && lines.length > 0)` → `1.1.06 Inventario` si es cierta, `5.1.01 Costo de Ventas` si no. **No mira el producto, ni `tracksInventory`, ni `expenseType`.**
4. El **costo unitario comprado** (`expense_lines.unit_cost`) se guarda pero **nunca actualiza `products.cost`**: no hay promedio ponderado, ni FIFO, ni último costo.
5. El kardex `inventory_movements` **no tiene columna de costo**: es un libro de cantidades, no de valores.
6. **Venta:** `invoiceDbBooker.executeDbTransaction` asienta CxC/Caja / Ventas / ITBIS. **No existe en ninguna parte del código un asiento DÉBITO Costo de Ventas / CRÉDITO Inventario.**
7. La factura **no descuenta stock**: la deducción está diferida al **conduce de entrega** (`deliveryRepository.approveDeliveryNote` → `deductStock`), sobre `invoice.warehouseId`.
8. Solo la Nota de Crédito e-34 devuelve existencia en el momento de facturar, sin comprobar si hubo despacho previo.
9. Recepción de pedido a proveedor (`supplierOrderService.registerReception`) sube stock **sin ningún asiento contable** y sin enlace con la compra que después se registra por `/expenses`.
10. Resultado neto: **inventario perpetuo en cantidades, inventario periódico (y mal) en valores**; la cuenta contable de inventario y el almacén físico no se hablan, y no existe ningún proceso que los compare.

---

## HALLAZGOS

### INV-01 — 🔴 CRÍTICO — No existe el asiento de Costo de Ventas
**MÓDULO:** Facturación / Contabilidad / Inventario

**DESCRIPCIÓN:** Al emitir una factura de venta el sistema **no genera** el asiento DÉBITO Costo de Ventas / CRÉDITO Inventario. Tampoco lo genera el conduce de entrega, que es donde realmente sale la mercancía.

**CAUSA RAÍZ:** El motor de asientos de venta sólo contempla ingreso, ITBIS, retenciones y contrapartida de cobro. La deducción de stock (`deductStock`) es puramente cuantitativa y no llama a `AccountRepository.createJournalEntry`.

**ESCENARIO:** Se compra mercancía por RD$ 100,000 (débito Inventario) y se vende toda por RD$ 150,000. El Estado de Resultados muestra Ingresos 150,000 y Costo de Ventas 0 → utilidad bruta 150,000. El Balance sigue mostrando Inventario 100,000 aunque el almacén esté vacío.

**IMPACTO CONTABLE:** Utilidad bruta y neta sobrevaluadas por el 100 % del costo. Activo sobrevaluado permanentemente. ISR sobre una utilidad ficticia. Estados financieros no auditables.

**IMPACTO EN BD:** `journal_entry_lines` nunca contiene un renglón contra la cuenta de inventario por concepto de salida. `inventory_levels` baja pero la cuenta contable no.

**RIESGO MULTIEMPRESA:** Afecta por igual a todas las empresas del tenant; ninguna tiene costo de ventas real.

**EVIDENCIA:**
`src/services/invoice/invoiceDbBooker.ts:388-457` — el asiento completo de la venta:
```ts
      // Book automatic accounting journal entries (Double Entry)
      const accCxC = await this.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
      const accCaja = await this.getOrCreateAccount(tx, data.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');
      const accVentas = await this.getOrCreateAccount(tx, data.companyId, '4.1.01', 'Ingresos por Ventas', 'revenue');
      const accItbis = await this.getOrCreateAccount(tx, data.companyId, '2.1.03', 'ITBIS por Pagar', 'liability');
      ...
        journalLines = [
          { accountId: paymentAccount.id, debit: totals.totalNet, credit: 0 },
          { accountId: accVentas.id, debit: 0, credit: totals.subtotal - totals.totalDiscount },
        ];
```
`src/repositories/deliveryRepository.ts:300-315` — el despacho físico tampoco asienta:
```ts
      // 5. Deduct stock and write movements
      for (const line of note.lines) {
        const currentQty = Number(line.quantity);
        await deductStock(
          companyId, modo, line.productId, invoice.warehouseId!,
          currentQty, userId, 'sale', invoice.id,
          `Despacho físico Conduce ${note.deliveryNumber}`, tx
        );
      }
```
`src/repositories/accountingRepository.ts:595` — la clave de mapeo existe pero nadie la lee:
```ts
        { key: 'cost_of_goods_sold', code: '5.1.01' },
```

**SOLUCIÓN RECOMENDADA:** Emitir el asiento de costo dentro de la misma transacción que `deductStock` en `approveDeliveryNote` (y su reverso en `void`), con el costo valorado según INV-02. Para nota de crédito, el asiento inverso.

**RIESGO DE IMPLEMENTARLA:** Alto. Sin resolver antes INV-02 (valoración) el asiento se emitiría con `product.cost`, que es un valor arbitrario. Requiere además decidir el tratamiento del histórico: los períodos ya cerrados no pueden recibir el asiento retroactivo.

---

### INV-02 — 🔴 CRÍTICO — Inventario sin valoración: kardex de cantidades, costo fijo y mutable
**MÓDULO:** Inventario / Costos

**DESCRIPCIÓN:** Existe kardex (`inventory_movements`) pero **sin columna de costo unitario ni de valor**. El único costo del sistema es `products.cost`, un campo escalar editable a mano. **No hay recálculo de costo promedio ponderado, ni FIFO, ni último costo, en ningún punto de compra.**

**CAUSA RAÍZ:** El modelo de datos nunca previó capa de valoración. `expense_lines.unit_cost` se persiste pero no se propaga.

**ESCENARIO:** 100 unidades a RD$ 10 en almacén (`product.cost = 10`). Se compran 100 más a RD$ 25. El costo promedio debería quedar en 17.50; el sistema deja `product.cost = 10`. Todas las valoraciones de inventario y todos los reportes de margen quedan subvaluados en RD$ 750. Si un usuario edita el producto y pone 25, **todo el histórico se revalúa retroactivamente**, incluidos meses ya cerrados.

**IMPACTO CONTABLE:** Imposible determinar el costo de la mercancía vendida ni el valor razonable del inventario. Incumple NIIF/NIC 2 (costo promedio o FIFO obligatorios).

**IMPACTO EN BD:** `inventory_movements` no permite reconstruir el valor histórico. Todo reporte de valoración depende de un `products.cost` mutable no versionado.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/db/schema/inventory.ts:49-67` — kardex sin costo:
```ts
export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 50 }).notNull(),
  quantity: decimal('quantity', { precision: 15, scale: 4 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 15, scale: 4 }).notNull(),
  referenceId: uuid('reference_id'),
  description: text('description'),
```
`src/db/schema/products.ts:28` — único costo del sistema:
```ts
  cost: decimal('cost', { precision: 15, scale: 2 }).default('0.00').notNull(),
```
`src/app/api/v1/expenses/route.ts:177-251` — la compra escribe `unitCost` en la línea y sube stock, pero **no toca `products.cost`**:
```ts
          await tx.insert(expenseLines).values({
            ...
            unitCost: line.unitCost.toString(),
```
Búsqueda exhaustiva de actualizaciones de costo: `grep -rn "set({[^}]*cost" src` → **cero resultados**. Los únicos usos son lecturas (`invoiceDbBooker.ts:79`, `quoteService.ts:80,276`, `biRepository.ts:88,120`).

`src/repositories/biRepository.ts:86-98,118-130` — el COGS y la valoración del BI son estimaciones con el costo actual:
```ts
    const [cogsAgg] = await db.select({
      totalCogs: sql<number>`SUM(CAST(${invoiceLines.quantity} AS numeric) * CAST(${products.cost} AS numeric))`
```

**SOLUCIÓN RECOMENDADA:** Añadir `unit_cost` y `total_cost` a `inventory_movements`; añadir `average_cost` a `inventory_levels` (o a `products`); recalcular promedio ponderado en cada entrada (`addStock` con `type='purchase'`) dentro de la transacción y con bloqueo de fila; valorar las salidas con ese promedio.

**RIESGO DE IMPLEMENTARLA:** Muy alto. Es un cambio de modelo. Requiere migración con costeo inicial del inventario existente (un ajuste de apertura documentado) y bloqueo de escrituras durante la migración. `product.cost` debe pasar a ser sólo referencia/lista, nunca base de valoración.

---

### INV-03 — 🔴 CRÍTICO — Criterio erróneo para decidir Inventario vs. Costo/Gasto
**MÓDULO:** Compras / Contabilidad

**DESCRIPCIÓN:** El sistema decide la cuenta de débito de una compra **únicamente** por `warehouseId && lines.length > 0`. No consulta el tipo de producto (`tracksInventory`), ni el `expenseType` DGII (el `09` es precisamente "Compras que formarán parte del costo de venta"), ni la categoría. Consecuencias simétricas:

- Compra de **mercancía sin almacén seleccionado** → débito directo a `5.1.01 Costo de Ventas`, aunque el inventario sea perpetuo.
- Compra de **servicios puros** (mano de obra, flete, líneas sin `productId`) con un almacén seleccionado → débito a `1.1.06 Inventario de Mercancía`, **capitalizando un gasto**.

Además, cuando la línea es de un producto con `tracksInventory = false`, el stock correctamente no se mueve, **pero `hasInventory` sigue siendo `true`** y el importe se capitaliza igual.

**CAUSA RAÍZ:** Una sola bandera booleana derivada de la presencia de almacén, no de la naturaleza económica de lo comprado.

**ESCENARIO:** El formulario preselecciona el primer almacén (`setWarehouseId(whList[0].id)`). Un usuario registra en modo detalle una factura de "Servicios de Instalación" por RD$ 50,000 con línea sin producto. El asiento debita `1.1.06 Inventario` por 50,000. El almacén no recibe nada. Activo inflado en 50,000 y gasto omitido.

**IMPACTO CONTABLE:** Activo y utilidad sobrevaluados (caso servicios); costo de ventas anticipado y activo subvaluado (caso mercancía sin almacén). En ambos, la cuenta de inventario deja de ser conciliable.

**IMPACTO EN BD:** `journal_entry_lines` acumula débitos a la cuenta de inventario sin contraparte en `inventory_levels` y viceversa.

**RIESGO MULTIEMPRESA:** Uniforme; la magnitud depende del uso de cada empresa.

**EVIDENCIA:**
`src/app/api/v1/expenses/route.ts:173`:
```ts
      const hasInventory = !!(warehouseId && lines && lines.length > 0);
```
`src/app/api/v1/expenses/route.ts:345-349`:
```ts
        if (!accDebit) {
          accDebit = hasInventory
            ? await getOrCreateAccount(tx, session.companyId, '1.1.06', 'Inventario de Mercancía', 'asset')
            : await getOrCreateAccount(tx, session.companyId, '5.1.01', 'Costo de Ventas', 'cost');
        }
```
Idéntico en `src/app/api/v1/expenses/[id]/route.ts:678` y `:1014-1016`, y en `src/services/expenseService.ts:157-162`.

`src/app/dashboard/purchases/page.tsx:290-294` — el almacén viene preseleccionado:
```ts
      if (wh.success || wh.data) {
        const whList = wh.data || [];
        setWarehouses(whList);
        if (whList.length > 0) setWarehouseId(whList[0].id);
      }
```
`src/app/dashboard/purchases/page.tsx:816` — se envía siempre en modo detalle:
```ts
        warehouseId: isGeneralAmount ? null : (warehouseId || null),
```

**SOLUCIÓN RECOMENDADA:** Decidir **por línea**, no por cabecera: línea con `productId` y `tracksInventory = true` → Inventario; el resto → gasto/costo según la cuenta que el usuario asigne a esa línea. Añadir `debit_account_id` a `expense_lines`.

**RIESGO DE IMPLEMENTARLA:** Medio-alto. Cambia el asiento a multi-línea de débito y obliga a rediseñar la pantalla de compras. Las compras históricas quedan con el criterio antiguo.

---

### INV-04 — 🔴 CRÍTICO — Códigos de cuenta cableados que no corresponden al plan contable sembrado
**MÓDULO:** Contabilidad / Compras / Facturación

**DESCRIPCIÓN:** Los motores de asientos usan códigos literales que **no existen** en el plan de cuentas que el propio sistema siembra para cada empresa nueva, o que existen pero designan otra cosa. `getOrCreateAccount` los crea al vuelo como cuentas huérfanas. Detalle:

| Código usado al asentar | Nombre que le da el motor | Qué es en el plan sembrado |
|---|---|---|
| `1.1.06` | Inventario de Mercancía | **No existe** → cuenta huérfana. El inventario real es `1.1.03.01` |
| `1.1.08` | ITBIS Pagado en Compras | **No existe** → huérfana. El real es `1.1.04.01` |
| `2.1.03` | ITBIS por Pagar | **No existe** → huérfana. El real es `2.1.02.01` |
| `2.1.04` | ISR Retenido por Pagar | **No existe** → huérfana. El real es `2.1.02.03` |
| `2.1.05` | ITBIS Retenido por Pagar | **No existe** → huérfana. El real es `2.1.02.02` |
| `5.1.02` | Otros Impuestos y Tasas | **No existe** → huérfana |
| `1.1.01` | Efectivo en Caja y Bancos | Existe, pero **`isTransactional = false`** (cuenta de resumen) |
| `2.1.01` | Cuentas por Pagar | Existe, pero **`isTransactional = false`** (cuenta de resumen) |
| `1.1.02` | "Cuentas por Cobrar Clientes" (ventas) **y** "Efectivo en Bancos" (cheque en garantía de compras) | Existe como **"Cuentas por Cobrar"**, `isTransactional = false` |

El caso de `1.1.02` es el más grave: **la misma cuenta recibe los débitos de cuentas por cobrar de ventas y los créditos de banco de los cheques en garantía de compras.**

Y `1.1.03.01 Inventario de Mercancía` — la cuenta que el mapeo `inventory` señala y que aparece en el Balance — **nunca recibe un solo asiento.**

**CAUSA RAÍZ:** Cada motor de asientos define su propio `getOrCreateAccount` con códigos literales, en vez de leer `accounting_mappings`.

**ESCENARIO:** Empresa nueva. Se factura a crédito: débito a `1.1.02` (la cuenta de resumen "Cuentas por Cobrar"). Se registra una compra a crédito con cheque en garantía: crédito a `1.1.02` "Efectivo en Bancos". El saldo de `1.1.02` es la resta de dos conceptos incompatibles. El auditor no puede explicar ni una cifra.

**IMPACTO CONTABLE:** Balance con cuentas huérfanas fuera del árbol (`parentId = null`, `level = 1`), saldos en cuentas de resumen, y una cuenta mezclando activo circulante de dos naturalezas. La cuenta de inventario del Balance queda en cero para siempre.

**IMPACTO EN BD:** `chart_of_accounts` se puebla con cuentas sin `parentId`, sin `level` correcto, sin `nature`, y `is_transactional` por defecto `true`.

**RIESGO MULTIEMPRESA:** Cada empresa acumula su propio juego de huérfanas; el desorden es idéntico pero independiente.

**EVIDENCIA:**
`src/repositories/accountingRepository.ts:498-524` — plan sembrado:
```ts
        { code: '1.1.01', name: 'Efectivo en Caja y Bancos', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1.02', name: 'Cuentas por Cobrar', type: 'asset', nature: 'debit', isTransactional: false },
        { code: '1.1.03.01', name: 'Inventario de Mercancía', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '1.1.04.01', name: 'ITBIS Pagado en Compras', type: 'asset', nature: 'debit', isTransactional: true },
        { code: '2.1.01', name: 'Cuentas por Pagar', type: 'liability', nature: 'credit', isTransactional: false },
        { code: '2.1.02.01', name: 'ITBIS Cobrado en Ventas', type: 'liability', nature: 'credit', isTransactional: true },
        { code: '2.1.02.02', name: 'ITBIS Retenido por Pagar', type: 'liability', nature: 'credit', isTransactional: true },
        { code: '2.1.02.03', name: 'Retenciones de ISR por Pagar', type: 'liability', nature: 'credit', isTransactional: true },
```
`src/app/api/v1/expenses/route.ts:347,360,365,372,377` — códigos usados al asentar:
```ts
            ? await getOrCreateAccount(tx, session.companyId, '1.1.06', 'Inventario de Mercancía', 'asset')
          const accItbisPagado = await getOrCreateAccount(tx, session.companyId, '1.1.08', 'ITBIS Pagado en Compras', 'asset');
          const accOtrosImp = await getOrCreateAccount(tx, session.companyId, '5.1.02', 'Otros Impuestos y Tasas', 'expense');
          const accIsrRet = await getOrCreateAccount(tx, session.companyId, '2.1.04', 'ISR Retenido por Pagar', 'liability');
          const accItbisRet = await getOrCreateAccount(tx, session.companyId, '2.1.05', 'ITBIS Retenido por Pagar', 'liability');
```
`src/app/api/v1/expenses/route.ts:304-305` vs `src/services/invoice/invoiceDbBooker.ts:389` — colisión de `1.1.02`:
```ts
          const accBank = await getOrCreateAccount(tx, session.companyId, '1.1.02', 'Efectivo en Bancos', 'asset');
```
```ts
      const accCxC = await this.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
```
`src/app/api/v1/expenses/route.ts:19-28` — creación al vuelo sin `nature`, `level`, `parentId`:
```ts
  const [newAcc] = await tx
    .insert(chartOfAccounts)
    .values({ companyId, code, name, type, status: 'active' })
    .returning();
```

**SOLUCIÓN RECOMENDADA:** Un único resolvedor de cuentas que lea `accounting_mappings` (ya sembrado con las claves correctas) y **falle en voz alta** si falta el mapeo, en lugar de crear cuentas. Eliminar todos los `getOrCreateAccount` duplicados. Script de saneamiento que reasigne los renglones de las huérfanas a las cuentas del plan.

**RIESGO DE IMPLEMENTARLA:** Alto: reasignar `journal_entry_lines` históricos cambia saldos ya reportados. Debe hacerse con corte de período y asiento de reclasificación, no con `UPDATE` directo.

---

### INV-05 — 🔴 CRÍTICO — ISC, propina y proporcionalidad del ITBIS se capturan y nunca se contabilizan
**MÓDULO:** Compras / Impuestos

**DESCRIPCIÓN:** `expenses` tiene siete campos de impuestos. El asiento sólo usa cinco (`amount`, `itbis`, `otherTaxes`, `isrRetained`, `itbisRetained`). **`isc`, `tip` e `itbisProportionality` no aparecen en ningún asiento, ni en la cuenta por pagar, ni en el TXT 606.** El asiento cuadra internamente (débitos = créditos), pero el importe acreditado a Banco/CxP **es menor que lo realmente pagado**.

Nota positiva verificada: el ITBIS retenido y el ISR retenido **sí** se acreditan como pasivos (`2.1.04`/`2.1.05`) y **no** reducen el gasto — ese tratamiento es correcto (salvo por los códigos de cuenta, ver INV-04).

**CAUSA RAÍZ:** El generador de asiento se escribió sobre un subconjunto de los campos del formulario.

**ESCENARIO:** Compra en restaurante: subtotal 10,000, ITBIS 1,800, propina 1,000, ISC 500. Se paga 13,300 en efectivo. El asiento acredita Efectivo por 12,300. Faltan 1,500 → el saldo contable de efectivo queda 1,500 por encima del real, cada vez.

**IMPACTO CONTABLE:** Subvaluación acumulativa de gastos y de la salida de efectivo/CxP. Descuadre permanente e imposible de conciliar con el banco. El 606 remitido a la DGII omite el ISC y otros impuestos.

**IMPACTO EN BD:** `expenses.isc`, `.tip`, `.itbis_proportionality` guardan valores que ningún renglón de `journal_entry_lines` respalda. `accounts_payable.balance` también los excluye (`route.ts:259`).

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/app/api/v1/expenses/route.ts:161-167` — se persisten:
```ts
        itbis: (itbis || 0).toString(),
        itbisRetained: (itbisRetained || 0).toString(),
        itbisProportionality: (itbisProportionality || 0).toString(),
        isrRetained: (isrRetained || 0).toString(),
        isc: (isc || 0).toString(),
        otherTaxes: (otherTaxes || 0).toString(),
        tip: (tip || 0).toString(),
```
`src/app/api/v1/expenses/route.ts:324-331` — el asiento los ignora:
```ts
      const subtotalVal = parseFloat(amount);
      const itbisAmount = parseFloat(itbis || 0);
      const otherTaxesAmount = parseFloat(otherTaxes || 0);
      const isrRet = parseFloat(isrRetained || 0);
      const itbisRet = parseFloat(itbisRetained || 0);

      // Total net to pay: subtotal + itbis + otherTaxes - isrRet - itbisRet
      const netAmount = subtotalVal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;
```
`src/app/api/v1/expenses/route.ts:259` — la CxP tampoco los incluye:
```ts
        const apBalanceVal = (parseFloat(amount) + parseFloat(itbis || 0) + parseFloat(otherTaxes || 0) - parseFloat(itbisRetained || 0) - parseFloat(isrRetained || 0));
```
`src/app/dashboard/purchases/page.tsx:772,775` — pero el cheque en garantía **sí** usa el total con ISC:
```ts
  const grandTotal = totalSubtotal + totalItbis + globalIsc + globalOtherTaxes;
  ...
    setGcAmount(roundMoney(grandTotal));
```
→ el cheque se emite por un importe mayor que la CxP que amortiza.

`src/services/expenseService.generate606Txt` (`src/services/expenseService.ts:258-268`) omite ISC, otros impuestos y proporcionalidad del TXT DGII.

**SOLUCIÓN RECOMENDADA:** Incluir ISC y otros impuestos no recuperables en el débito de costo/gasto (o en cuenta propia), la propina en una cuenta de gasto, y la proporcionalidad del ITBIS como reclasificación del ITBIS pagado a costo. Recalcular `netAmount` y `apBalanceVal` con los siete campos.

**RIESGO DE IMPLEMENTARLA:** Bajo-medio en el código; medio en datos: las compras ya registradas quedan con el asiento incompleto y requieren asiento de ajuste.

---

### INV-06 — 🟠 ALTO — Compra registrada en "monto general" va por defecto a Costo de Ventas
**MÓDULO:** Compras / Contabilidad

**DESCRIPCIÓN:** En el modo "monto general" (sin líneas), la pantalla **preselecciona automáticamente la cuenta `5.1.01 Costo de Ventas`** como cuenta de débito. Todo gasto operativo registrado por esa vía —alquiler, energía, teléfono— aterriza en Costo de Ventas si el usuario no cambia el selector.

**CAUSA RAÍZ:** Valor por defecto del formulario, repetido en la carga inicial y en el reset.

**ESCENARIO:** Se registran 12 facturas de energía eléctrica del año por RD$ 600,000 en modo monto general sin tocar el selector. El Estado de Resultados presenta Costo de Ventas 600,000 y Gastos Operacionales 0. La utilidad bruta queda destruida y la utilidad neta es correcta sólo por casualidad.

**IMPACTO CONTABLE:** Márgenes brutos irreales. Los indicadores de rotación y margen del BI quedan sin sentido.

**IMPACTO EN BD:** `journal_entry_lines` con débitos masivos a `5.1.01` y las cuentas `6.1.02.*` del plan sembrado vacías.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/app/dashboard/purchases/page.tsx:295-301`:
```ts
      if (ac.success) {
        setAccountsList(ac.data || []);
        const defaultAcc = (ac.data || []).find((a: any) => a.code.startsWith('5.1.01') || a.name.toLowerCase().includes('costo de ventas'));
        if (defaultAcc) {
          setDebitAccountId(defaultAcc.id);
        }
      }
```
Repetido en `src/app/dashboard/purchases/page.tsx:643-648`.

**SOLUCIÓN RECOMENDADA:** No preseleccionar ninguna cuenta; obligar a elegir. Mejor: derivar la cuenta sugerida del `expenseType` DGII (`09` → costo; `02`, `03`, `06` → gasto).

**RIESGO DE IMPLEMENTARLA:** Bajo. Sólo frontend, ya hay validación `if (!debitAccountId) return toast.error(...)` en `page.tsx:795`.

---

### INV-07 — 🟠 ALTO — Los ajustes de inventario no generan asiento contable
**MÓDULO:** Inventario / Contabilidad

**DESCRIPCIÓN:** `POST /api/v1/inventory/adjustments` fija el saldo físico y escribe el movimiento de kardex, pero **no genera ningún asiento**. Un faltante o un sobrante nunca llega a la contabilidad.

**CAUSA RAÍZ:** La ruta no importa `AccountRepository`.

**ESCENARIO:** Conteo físico revela un faltante de 200 unidades. El usuario ajusta el nivel. El almacén queda correcto; la cuenta contable de inventario queda igual. La diferencia nunca se reconoce como pérdida.

**IMPACTO CONTABLE:** Pérdidas por merma, robo o error nunca reconocidas. Activo sobrevaluado. (Hoy el efecto está enmascarado porque la cuenta contable de inventario tampoco se mueve con las ventas — ver INV-01.)

**IMPACTO EN BD:** `inventory_movements` con `type='adjustment'` sin ningún `journal_entries.reference` que lo respalde. Nótese además que el movimiento se inserta **sin `referenceId`**, así que no hay documento de ajuste al que anclarlo.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/app/api/v1/inventory/adjustments/route.ts:120-135` — fin de la transacción, sin asiento:
```ts
      // 3. Registrar movimiento de ajuste
      const moveId = uuidv4();
      await tx.insert(inventoryMovements).values({
        id: moveId,
        companyId: session.companyId,
        modo: session.modo,
        productId: productId,
        warehouseId: warehouseId,
        userId: session.userId,
        type: 'adjustment',
        quantity: difference.toString(),
        balanceAfter: newQtyNum.toString(),
        description: `Ajuste manual: ${reason || 'Sin especificar'}`
      });

      return { moveId, currentBalance, newQuantity: newQtyNum, difference };
```
(El fichero no importa `AccountRepository`; ver `route.ts:1-6`.)

**SOLUCIÓN RECOMENDADA:** Al ajustar, emitir DÉBITO Pérdida/Merma de Inventario / CRÉDITO Inventario (faltante) o el inverso (sobrante), valorado al costo promedio. Depende de INV-02.

**RIESGO DE IMPLEMENTARLA:** Medio: sin costo válido el asiento sería por importe arbitrario o cero.

---

### INV-08 — 🟠 ALTO — Recepción de pedido y registro de compra suben stock por separado: doble conteo
**MÓDULO:** Compras / Pedidos a proveedor / Inventario

**DESCRIPCIÓN:** `supplierOrderService.registerReception` sube el stock al recibir el pedido, **sin asiento contable**. Después, la factura del proveedor se registra en `/expenses` con almacén y líneas, y el stock **vuelve a subir**. No existe ningún vínculo entre `purchase_orders` y `expenses` que impida la doble entrada: `createExpense` ni siquiera rellena `accounts_payable.purchase_order_id`, campo que sí existe en el esquema.

**CAUSA RAÍZ:** Dos flujos independientes que escriben en `inventory_levels` para el mismo hecho económico, sin conciliación.

**ESCENARIO:** Se emite pedido LD-2026-0716 por 100 unidades. Llega la mercancía, el almacenista registra la recepción → stock 100. Al día siguiente contabilidad recibe la factura y la registra en Compras con almacén y líneas → stock 200. El almacén físico tiene 100.

**IMPACTO CONTABLE:** Inventario físico duplicado; si además se corrige INV-01, el costo de ventas se calcularía sobre existencias inexistentes.

**IMPACTO EN BD:** Dos filas en `inventory_movements` tipo `purchase` con `referenceId` distinto (uno el `purchase_order_id`, otro el `expense_id`) por la misma mercancía. Imposible detectar automáticamente.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/services/supplierOrderService.ts:456-468` — recepción sin asiento:
```ts
        // Update inventory level ONLY at reception
        await addStock(
          companyId,
          modo,
          item.productId,
          order.warehouseId,
          rec.quantityToReceive,
          userId,
          'purchase',
          order.id,
          `Recepcion de pedido ${order.orderNumber}`,
          tx
        );
```
(No hay ninguna llamada a `createJournalEntry` en todo `supplierOrderService.ts`.)

`src/app/api/v1/expenses/route.ts:239-251` — la compra sube el stock otra vez:
```ts
            await tx.insert(inventoryMovements).values({
              ...
              type: 'purchase',
              quantity: qty.toString(),
              balanceAfter: balanceAfter.toString(),
              referenceId: newExpenseId,
              description: `Compra a suplidor / Gasto`
            });
```
`src/db/schema/accounting.ts:124` — el enlace existe pero nunca se usa:
```ts
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
```

**SOLUCIÓN RECOMENDADA:** Un solo punto de entrada de existencia. Opción recomendada: la recepción genera el movimiento de inventario y el asiento de "Mercancía en tránsito/recibida sin facturar"; la factura de compra sólo liquida ese pasivo y no vuelve a mover stock. Alternativa mínima: exigir que una compra con almacén referencie un pedido y descontar lo ya recibido.

**RIESGO DE IMPLEMENTARLA:** Alto: cambia el flujo operativo de almacén y el de contabilidad simultáneamente.

---

### INV-09 — 🟠 ALTO — Movimiento de stock por lectura-y-escritura sin bloqueo (condición de carrera)
**MÓDULO:** Inventario

**DESCRIPCIÓN:** `addStock` (el único punto de paso declarado del inventario) lee el nivel, calcula en JavaScript y escribe el resultado, **sin `SELECT ... FOR UPDATE` y sin `UPDATE ... SET quantity = quantity - x`**. La ruta `/expenses` replica esa misma lógica en línea, también sin bloqueo. Sólo `/inventory/adjustments` usa `.for('update')`.

**CAUSA RAÍZ:** Patrón read-modify-write sobre `inventory_levels`.

**ESCENARIO:** Dos conduces del mismo producto se aprueban simultáneamente. Ambas transacciones leen `quantity = 50`. Una descuenta 20 y escribe 30; la otra descuenta 15 y escribe 35. Se despacharon 35 unidades y el nivel dice 35 en lugar de 15: **20 unidades aparecen de la nada**. El `balance_after` del kardex de ambos movimientos es falso.

**IMPACTO CONTABLE:** Existencia inventada, no detectable por el kardex (que registra `balance_after` inconsistente sin que nada lo valide).

**IMPACTO EN BD:** `inventory_levels.quantity` divergente de `SUM(inventory_movements.quantity)`. La restricción `chk_inventory_no_negativo` no protege de esto (el resultado es positivo).

**RIESGO MULTIEMPRESA:** Uniforme; agravado en empresas con varios usuarios de despacho.

**EVIDENCIA:**
`src/services/inventoryService.ts:234-260`:
```ts
  let [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.companyId, companyId),
      eq(inventoryLevels.productId, productId), 
      eq(inventoryLevels.warehouseId, warehouseId),
      eq(inventoryLevels.modo, modo)
    )
  );
  ...
  const newQuantity = Number(level.quantity) + quantity;

  // Update level
  await tx.update(inventoryLevels)
    .set({ quantity: newQuantity.toString(), updatedAt: new Date() })
    .where(eq(inventoryLevels.id, level.id));
```
Sin `.for('update')`, a diferencia de `src/app/api/v1/inventory/adjustments/route.ts:87`:
```ts
      const levelResult = await tx.select().from(inventoryLevels).where(alcance).for('update');
```
`src/app/api/v1/expenses/route.ts:206-226` repite el patrón sin bloqueo.

Además, `checkStock` y `deductStock` son llamadas separadas en `deliveryRepository.ts:291` y `:303`: entre la comprobación y el descuento no hay bloqueo (TOCTOU).

**SOLUCIÓN RECOMENDADA:** En `addStock`, o bien `.for('update')` sobre el nivel antes de calcular, o bien `UPDATE inventory_levels SET quantity = quantity + $x ... RETURNING quantity` y usar el valor devuelto como `balanceAfter`. Eliminar la lógica duplicada de `/expenses` y hacerla llamar a `addStock`.

**RIESGO DE IMPLEMENTARLA:** Bajo. El `UPDATE ... RETURNING` es un cambio localizado. Vigilar deadlocks ordenando los bloqueos por `productId` cuando se procesan varias líneas.

---

### INV-10 — 🟠 ALTO — Borrar o editar una compra destruye el kardex y los asientos, sin control de período
**MÓDULO:** Compras / Contabilidad / Inventario

**DESCRIPCIÓN:** `DELETE` y `PUT` de una compra:
1. Revierten el nivel con `Math.max(0, currentBalance - qty)` — si la mercancía ya se vendió, la reversión **se recorta en silencio** y el inventario queda inflado.
2. Hacen `DELETE` **físico** de `inventory_movements` por `referenceId`: el rastro de auditoría desaparece.
3. Hacen `DELETE` **físico** de `journal_entries` y `journal_entry_lines`, **sin comprobar si el período está cerrado**. `createJournalEntry` sí valida el período abierto; la eliminación no.

**CAUSA RAÍZ:** Estrategia de "borrar y rehacer" en lugar de asientos de reverso.

**ESCENARIO:** Enero cerrado. En marzo se detecta un NCF mal tecleado en una compra de enero de RD$ 500,000 y se edita. El sistema borra el asiento de enero y crea uno nuevo con la fecha de emisión — que `createJournalEntry` rechazará por período cerrado, abortando la transacción... **pero sólo si el período de enero está efectivamente cerrado y registrado**; `isPeriodOpen` crea el período automáticamente si no existe (`accountingRepository.ts:240-256`), de modo que el asiento de enero se borra y se rehace sin que nadie lo note.

**IMPACTO CONTABLE:** Estados financieros ya emitidos cambian retroactivamente. Se pierde la trazabilidad exigida por la DGII. Inventario sobrevaluado por reversiones recortadas.

**IMPACTO EN BD:** Pérdida irreversible de filas de `inventory_movements` y `journal_entry_lines`. Los `expenses` sí tienen `deletedAt` pero el DELETE los borra en duro.

**RIESGO MULTIEMPRESA:** Limitado por rol (sólo "sistemas" borra, "administración o sistemas" edita), pero un usuario de sistemas opera sobre cualquier empresa tras `switch-company`.

**EVIDENCIA:**
`src/app/api/v1/expenses/[id]/route.ts:265-272` — reversión recortada:
```ts
            if (levelResult.length > 0) {
              const currentBalance = parseFloat(levelResult[0].balance);
              const balanceAfter = Math.max(0, currentBalance - qty);
              await tx
                .update(inventoryLevels)
                .set({ quantity: balanceAfter.toString(), updatedAt: new Date() })
                .where(eq(inventoryLevels.id, levelResult[0].id));
            }
```
`src/app/api/v1/expenses/[id]/route.ts:277-280` — kardex borrado:
```ts
      await tx
        .delete(inventoryMovements)
        .where(and(eq(inventoryMovements.referenceId, id), eq(inventoryMovements.companyId, session.companyId), eq(inventoryMovements.modo, session.modo)));
```
`src/app/api/v1/expenses/[id]/route.ts:637-644` — asientos borrados sin validar período:
```ts
      for (const je of jes) {
        await tx
          .delete(journalEntryLines)
          .where(and(eq(journalEntryLines.journalEntryId, je.id), eq(journalEntryLines.companyId, session.companyId), eq(journalEntryLines.modo, session.modo)));
        await tx
          .delete(journalEntries)
          .where(and(eq(journalEntries.id, je.id), eq(journalEntries.companyId, session.companyId)));
      }
```
Contraste — `src/repositories/accountingRepository.ts:302-306` sí valida al crear:
```ts
      const isOpen = await this.isPeriodOpen(data.companyId, formattedDate, data.modo, transactionContext);
      if (!isOpen) {
        throw new Error(`El periodo contable para la fecha ${formattedDate} está cerrado o no existe.`);
      }
```

**SOLUCIÓN RECOMENDADA:** Sustituir borrado por anulación: `deletedAt` en `expenses`, asiento de reverso con fecha del día, movimiento de kardex de reverso (cantidad negativa), y bloqueo si la existencia resultante quedaría negativa. Validar período abierto antes de cualquier borrado o reverso.

**RIESGO DE IMPLEMENTARLA:** Medio. Cambia la semántica de "eliminar" que los usuarios ya conocen, y hay que revisar todas las consultas para que filtren `deletedAt IS NULL`.

---

### INV-11 — 🟠 ALTO — La nota de crédito devuelve existencia aunque nunca se haya despachado
**MÓDULO:** Facturación / Inventario

**DESCRIPCIÓN:** Al emitir una nota de crédito e-34 el sistema reingresa al almacén las cantidades de la nota, **sin comprobar si la factura original llegó a despacharse mediante conduce**. Como la factura **no** descuenta stock (la deducción está diferida al conduce), una devolución de mercancía nunca entregada crea existencia de la nada.

**CAUSA RAÍZ:** Asimetría entre el momento de la salida (conduce) y el de la entrada por devolución (emisión de la NC).

**ESCENARIO:** Se factura 100 unidades a crédito. El cliente cancela antes del despacho; nunca se emite conduce. Se emite nota de crédito por las 100 unidades → `addStock(+100)`. El almacén sube 100 unidades que jamás salieron.

**IMPACTO CONTABLE:** Existencia física inventada. Con INV-01 corregido, sería además un crédito a Inventario sin débito previo.

**IMPACTO EN BD:** `inventory_movements` tipo `return` con `+quantity` sin ningún movimiento `sale` previo que lo compense para esa factura.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/services/invoice/invoiceDbBooker.ts:370-386`:
```ts
      // Deduct or add inventory (Deducción diferida a Conduce de Entrega. Solo Nota de Crédito e-34 agrega stock aquí)
      if (data.ecfType === '34') {
        for (const line of totals.itemLines) {
          await deductStock(
            data.companyId,
            data.modo,
            line.productId,
            data.warehouseId,
            -line.quantity,
            data.userId,
            'return',
            invoice.id,
            `Devolución Nota de Crédito ${ncf}`,
            tx
          );
        }
      }
```
`src/services/invoice/invoiceDbBooker.ts:65-75` documenta que la factura no descuenta:
```ts
      // NOTA (auditoria F1-04): aqui NO se valida existencia de inventario.
      //
      // Facturar no descuenta stock: la deduccion esta diferida al conduce de
      // entrega ...
```

**SOLUCIÓN RECOMENDADA:** Al emitir la NC, reingresar como máximo lo efectivamente despachado según los conduces aprobados de la factura modificada (`modifiedInvoiceId`), producto a producto. Si no hubo despacho, no mover stock.

**RIESGO DE IMPLEMENTARLA:** Bajo-medio. La consulta de despachado ya existe en `getProvisionalStock` (`inventoryService.ts:130-159`) y es reutilizable.

---

### INV-12 — 🟠 ALTO — No existe conciliación inventario físico vs. contable
**MÓDULO:** Control interno / Reportes

**DESCRIPCIÓN:** No hay ningún reporte ni proceso que compare el saldo de la cuenta contable de inventario con la valoración del stock. Los reportes disponibles son `606`, `607`, `balance-sheet`, `balances`, `income-statement`, `payables`, `receivables`, `sales-book`. Ninguno cruza `inventory_levels` con `journal_entry_lines`.

**CAUSA RAÍZ:** Nunca se diseñó el control. Y hoy sería estructuralmente imposible: la cuenta de inventario que asienta (`1.1.06`) no es la del plan (`1.1.03.01`), y no hay costo con el cual valorar (INV-02, INV-04).

**ESCENARIO:** Los desvíos de INV-01, INV-03, INV-07 y INV-09 se acumulan durante años sin que ningún control los revele.

**IMPACTO CONTABLE:** Debilidad material de control interno. Ninguna de las anomalías anteriores es detectable desde la aplicación.

**IMPACTO EN BD:** N/A (ausencia).

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:** `ls src/app/api/v1/reports/` →
```
606  607  [reportType]  balance-sheet  balances  income-statement  payables  receivables  sales-book
```
`src/repositories/biRepository.ts:118-130` — lo más cercano es una valoración de BI que no se compara con nada contable:
```ts
    const [inventoryAgg] = await db.select({
      totalCost: sql<number>`SUM(CAST(${inventoryLevels.quantity} AS numeric) * CAST(${products.cost} AS numeric))`,
      totalValue: sql<number>`SUM(CAST(${inventoryLevels.quantity} AS numeric) * CAST(${products.price} AS numeric))`
    }).from(inventoryLevels)
```

**SOLUCIÓN RECOMENDADA:** Reporte de conciliación: por almacén y producto, existencia × costo promedio vs. saldo de la cuenta mapeada `inventory`, con el detalle de las partidas conciliatorias. Añadir también una verificación `inventory_levels.quantity = SUM(inventory_movements.quantity)`.

**RIESGO DE IMPLEMENTARLA:** Bajo el reporte en sí; su utilidad depende de resolver antes INV-01, INV-02 y INV-04.

---

### INV-13 — 🟠 ALTO — Costo cero: se factura sin control y el costo se registra en cero
**MÓDULO:** Costos / Facturación

**DESCRIPCIÓN:** `products.cost` tiene `default '0.00'`. Con `cost = 0`:
- La **única validación de margen** al facturar está condicionada a `cost > 0`, de modo que un producto con costo cero se puede vender a cualquier precio, incluso cero, sin bloqueo.
- La venta **no se bloquea**.
- **No se genera asiento de costo** (INV-01), así que no hay ni un asiento en cero: simplemente no existe.
- El BI calcula COGS = cantidad × 0 → **margen bruto igual al 100 % de la venta**.

**CAUSA RAÍZ:** El costo es un dato opcional del catálogo, no una consecuencia de las compras.

**ESCENARIO:** Producto importado sin costo cargado. Se venden 1,000 unidades a RD$ 500. El tablero ejecutivo informa una utilidad estimada de RD$ 500,000 con costo cero. Gerencia decide sobre esa cifra.

**IMPACTO CONTABLE:** Utilidad y márgenes inflados al 100 %. Valoración de inventario en cero.

**IMPACTO EN BD:** `products.cost = '0.00'` sin señal de que sea un dato faltante y no un costo real.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/db/schema/products.ts:28`:
```ts
  cost: decimal('cost', { precision: 15, scale: 2 }).default('0.00').notNull(),
```
`src/services/invoice/invoiceDbBooker.ts:79-85` — la validación se salta con costo cero:
```ts
        const [prod] = await db.select({ cost: sql<string>`cost` }).from(sql`products`).where(eq(sql`id`, line.productId)).limit(1);
        if (prod) {
          const cost = parseFloat(prod.cost || '0.00');
          if (cost > 0 && line.unitPrice < cost) {
            throw new Error(`El precio unitario (RD$ ${line.unitPrice.toFixed(2)}) para "${line.name}" no puede ser inferior a su costo (RD$ ${cost.toFixed(2)}).`);
          }
        }
```
`src/repositories/biRepository.ts:171-173`:
```ts
    const revenue = Number(salesAgg?.monthSales) || 0;
    const cogs = Number(cogsAgg?.totalCogs) || 0;
    const estimatedProfit = revenue - cogs;
```

**SOLUCIÓN RECOMENDADA:** Con INV-02 resuelto, el costo deja de ser opcional: sale de la compra. Mientras tanto, marcar los productos con costo 0 y `tracksInventory = true` como excepción visible, y advertir (no bloquear) al facturarlos.

**RIESGO DE IMPLEMENTARLA:** Bajo si es advertencia; bloquear la venta paralizaría la operación de empresas con catálogos incompletos.

---

### INV-14 — 🟠 ALTO — Compras duplicadas: no hay unicidad de NCF ni idempotencia
**MÓDULO:** Compras

**DESCRIPCIÓN:** `expenses` **no tiene índice único** sobre (empresa, suplidor, NCF). No hay clave de idempotencia en `POST /api/v1/expenses`. Un doble envío del formulario crea dos compras completas: dos entradas de stock, dos CxP, dos asientos y dos renglones en el 606.

**CAUSA RAÍZ:** Ausencia de restricción de unicidad y de control de reintento.

**ESCENARIO:** Red lenta; el usuario pulsa "Guardar" dos veces. Se duplica una compra de RD$ 800,000: inventario +2×, CxP +2×, gasto/costo +2×, y el 606 remitido a la DGII declara dos veces el mismo NCF del proveedor.

**IMPACTO CONTABLE:** Duplicación de activo, pasivo y costo. Riesgo fiscal directo (606 con NCF repetido).

**IMPACTO EN BD:** Dos filas en `expenses` con el mismo `ncf` y `supplier_id`; cuatro en `inventory_movements`; dos en `accounts_payable`.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/db/schema/accounting.ts:243-249` — índices de `expenses`, ninguno único:
```ts
}, (table) => ({
  companyIdx: index('expense_company_idx').on(table.companyId),
  supplierIdx: index('expense_supplier_idx').on(table.supplierId),
  issueDateIdx: index('expense_issue_date_idx').on(table.issueDate),
  companyIssueDateIdx: index('expense_comp_issue_date_idx').on(table.companyId, table.issueDate),
  companyModoIdx: index('expense_company_modo_idx').on(table.companyId, table.modo),
}));
```
Verificado en migraciones: `grep -rn "unique" drizzle/*.sql | grep -i expense` → sin resultados. La única restricción sobre `ncf` es aflojarla: `drizzle/0009_known_proemial_gods.sql:15`:
```sql
ALTER TABLE "expenses" ALTER COLUMN "ncf" DROP NOT NULL;
```
(Contrastar con `purchase_orders`, que sí tiene `uniqueIndex('purchase_orders_company_num_modo_idx')` — `src/db/schema/supplier_orders.ts:37`.)

**SOLUCIÓN RECOMENDADA:** Índice único parcial `(company_id, modo, supplier_id, ncf) WHERE ncf IS NOT NULL AND deleted_at IS NULL`, con mensaje de error claro. Deshabilitar el botón durante el envío.

**RIESGO DE IMPLEMENTARLA:** Medio: si ya existen duplicados históricos, el índice único falla al crearse. Crear `NOT VALID` no aplica a índices únicos; hay que sanear primero.

---

### INV-15 — 🟡 MEDIO — No hay soporte de moneda extranjera ni diferencia cambiaria
**MÓDULO:** Compras / Contabilidad

**DESCRIPCIÓN:** Verificado exhaustivamente: **`expenses` no tiene campo de moneda ni de tasa de cambio**. En todo el esquema sólo hay dos campos `currency` (`bank_accounts` y `financial_movements`, ambos con default `'DOP'`) y **ningún campo de tasa de cambio en ninguna tabla**. No existe registro de diferencia cambiaria.

**CAUSA RAÍZ:** El módulo se diseñó monomoneda.

**ESCENARIO:** Compra de USD 10,000 a tasa 60. Se registra RD$ 600,000. Se paga tres meses después a tasa 63: RD$ 630,000. La diferencia de RD$ 30,000 no tiene dónde registrarse y descuadra la CxP contra el pago.

**IMPACTO CONTABLE:** Imposible operar con proveedores en divisa. Las diferencias cambiarias se convierten en descuadres inexplicados en CxP.

**IMPACTO EN BD:** N/A (ausencia de columnas).

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:** Búsqueda en todo `src/db/schema`:
```
src/db/schema/accounting.ts:312:  currency: varchar('currency', { length: 10 }).default('DOP').notNull(),
src/db/schema/bank.ts:10:  currency: varchar('currency', { length: 10 }).default('DOP').notNull(), // DOP | USD | EUR
```
Búsqueda de `exchange|tasaCambio|tipoCambio|dolar` en `src/db/schema` y `src/services` → único resultado no relacionado (`googleContactsService.ts:43`, "Token exchange").

**SOLUCIÓN RECOMENDADA:** Añadir `currency` y `exchange_rate` a `expenses` (y a facturas y pagos), almacenar siempre el importe funcional en DOP, y generar el asiento de diferencia cambiaria al liquidar la CxP.

**RIESGO DE IMPLEMENTARLA:** Alto: es un cambio transversal (compras, CxP, pagos, banco, reportes).

---

### INV-16 — 🟡 MEDIO — Las retenciones de compras no se pueden capturar desde la pantalla
**MÓDULO:** Compras / Impuestos

**DESCRIPCIÓN:** El backend soporta `itbisRetained`, `isrRetained`, `itbisProportionality` y `tip`, y los contabiliza (los dos primeros). Pero **el formulario de compras no los envía**: no aparecen en el `payload`. Sólo se muestran en el histórico y en el reporte 606, donde siempre valen cero.

**CAUSA RAÍZ:** La pantalla no expone los campos.

**ESCENARIO:** Empresa designada agente de retención compra servicios a una persona física. Debe retener el 10 % de ISR y el 100 % del ITBIS. No puede registrarlo. El 606 remitido a la DGII declara retenciones en cero.

**IMPACTO CONTABLE:** Pasivos por retenciones nunca reconocidos. Incumplimiento tributario.

**IMPACTO EN BD:** `expenses.itbis_retained` e `isr_retained` siempre `'0.00'` para las compras creadas desde la aplicación.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/app/dashboard/purchases/page.tsx:809-840` — el payload completo, sin retenciones:
```ts
      const payload = {
        supplierId: isMinorExpense ? null : supplierId,
        isMinorExpense,
        expenseType,
        ncf: ncf ? ncf.toUpperCase().trim() : null,
        issueDate,
        paymentMethod,
        warehouseId: isGeneralAmount ? null : (warehouseId || null),
        description,
        amount: isGeneralAmount ? generalSubtotal : totalSubtotal,
        itbis: isGeneralAmount ? generalItbis : totalItbis,
        isc: globalIsc,
        otherTaxes: globalOtherTaxes,
        lines: ...,
        debitAccountId: isGeneralAmount ? debitAccountId : null,
        guaranteeCheck: ...
      };
```
Los campos existen en el tipo de sólo lectura del histórico (`page.tsx:60-64`):
```ts
  itbisRetained: string;
  isrRetained: string;
  ...
  tip: string;
```

**SOLUCIÓN RECOMENDADA:** Añadir los cuatro campos al formulario (con cálculo automático de las tasas DGII según tipo de suplidor) e incluirlos en el payload.

**RIESGO DE IMPLEMENTARLA:** Bajo: el backend ya los procesa. Sólo hay que corregir antes INV-05 para propina y proporcionalidad.

---

### INV-17 — 🟡 MEDIO — Almacenes inactivos o eliminados aceptan movimientos y aparecen en el selector
**MÓDULO:** Inventario / Multiempresa

**DESCRIPCIÓN:** `warehouses.status` y `warehouses.deletedAt` existen, pero **ninguna ruta de inventario los comprueba**. La lista de almacenes (`GET /api/v1/warehouses`) devuelve todos, incluidos los inactivos y los borrados lógicamente. Un almacén cerrado puede recibir compras, transferencias y despachos.

**CAUSA RAÍZ:** Ninguna validación de estado en el flujo de inventario; sólo `/inventory/adjustments` filtra `deletedAt`.

**ESCENARIO:** Se cierra la sucursal Santiago (`status = 'inactive'`). El almacén sigue apareciendo en el desplegable de compras — y como está el primero de la lista, queda **preseleccionado**. Se registran compras contra un almacén que ya no opera.

**IMPACTO CONTABLE:** Existencia registrada en almacenes que no existen operativamente; conciliación física imposible.

**IMPACTO EN BD:** `inventory_levels` e `inventory_movements` con `warehouse_id` de almacenes inactivos o con `deleted_at` no nulo.

**RIESGO MULTIEMPRESA:** Bajo (la empresa está acotada por `companyId`); es un problema de integridad interna.

**EVIDENCIA:**
`src/app/api/v1/warehouses/route.ts:16-18` — sin filtro alguno:
```ts
    // Todo: Filtrar por los almacenes a los que tiene acceso si no es admin
    // Por ahora obtenemos todos los de la compañía
    const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
```
`src/app/api/v1/expenses/route.ts:107-121` — la validación de la compra sólo mira la empresa:
```ts
      const [almacen] = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(and(
          eq(warehouses.id, warehouseId),
          eq(warehouses.companyId, session.companyId)
        ))
        .limit(1);
```
(No hay `eq(warehouses.status, 'active')` ni `isNull(warehouses.deletedAt)`.) Búsqueda global `grep -rn "warehouses.status" src` → **cero resultados**.

**SOLUCIÓN RECOMENDADA:** Filtrar `status = 'active' AND deleted_at IS NULL` en el listado y validarlo en compras, transferencias, recepciones y aprobación de conduces.

**RIESGO DE IMPLEMENTARLA:** Bajo, con una salvedad: si hay almacenes ya inactivos con existencia, bloquearlos impide corregirla. Permitir sólo salidas y ajustes en almacenes inactivos.

---

### INV-18 — 🟡 MEDIO — Transferencia entre almacenes sin validación de pertenencia ni de bloqueo
**MÓDULO:** Inventario / Multiempresa

**DESCRIPCIÓN:** `transferStock` **no comprueba que el almacén origen ni el destino pertenezcan a la empresa** ni que estén activos. La ruta sólo valida el permiso del usuario sobre el almacén origen, y **exime completamente a los roles `administracion` y `sistemas`**. Además la transferencia hace lectura-y-escritura sin bloqueo (mismo defecto que INV-09).

Aspecto **correcto** verificado: la transferencia **no genera asiento contable**, que es lo apropiado — no altera el valor total del inventario. (Cuando se implemente el costeo por almacén, sí requerirá reclasificación entre subcuentas.)

**CAUSA RAÍZ:** La validación de pertenencia se dejó a la capa de datos.

**ESCENARIO:** Un usuario de sistemas envía `destinationWarehouseId` de otra empresa. La aplicación no lo detecta.

**Mitigación real verificada:** la migración `0032` añadió claves foráneas compuestas `(warehouse_id, company_id)` sobre `inventory_levels`, `inventory_movements` e `inventory_transfers`, de modo que **la base de datos rechaza la escritura**. Por eso el riesgo se califica MEDIO y no CRÍTICO: el efecto es un error 500 sin mensaje útil, no una fuga de datos.

**IMPACTO CONTABLE:** Nulo si la FK está desplegada; la transferencia falla.

**IMPACTO EN BD:** Transacción abortada. Si la FK compuesta no estuviera desplegada, se crearían niveles con `company_id` propio y `warehouse_id` ajeno.

**RIESGO MULTIEMPRESA:** Contenido por la base de datos, no por la aplicación. Nota: las FK se añadieron `NOT VALID`, así que las filas históricas inconsistentes no se han verificado.

**EVIDENCIA:**
`src/services/inventoryService.ts:293-315` — la firma no valida almacenes:
```ts
export async function transferStock(
  companyId: string,
  modo: 'PRODUCCION' | 'PRUEBA',
  sourceWarehouseId: string,
  destinationWarehouseId: string,
  items: { productId: string, quantity: number }[],
  userId: string,
  reason?: string
) {
  return await db.transaction(async (tx) => {
    const transferId = uuidv4();

    // Create transfer record
    await tx.insert(inventoryTransfers).values({
      id: transferId,
      companyId,
      sourceWarehouseId,
      destinationWarehouseId,
      ...
```
`src/app/api/v1/inventory/transfer/route.ts:26-32` — sólo permisos, y con exención:
```ts
    const normalizedRole = auth.role.toLowerCase();
    if (normalizedRole !== 'administracion' && normalizedRole !== 'sistemas') {
      if (!auth.allowedWarehouses.includes(sourceWarehouseId)) {
        return NextResponse.json({ error: 'Forbidden: No access to source warehouse' }, { status: 403 });
      }
    }
```
Mitigación: `drizzle/0032_aislamiento_estructural.sql:261-266`:
```sql
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_source_warehouse_id_company_fk"
    FOREIGN KEY ("source_warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destination_warehouse_id_company_fk"
    FOREIGN KEY ("destination_warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
```

**SOLUCIÓN RECOMENDADA:** Validar en la ruta que ambos almacenes existen, son de la empresa, están activos y no borrados. Añadir `.for('update')` en la lectura de niveles. Ejecutar `VALIDATE CONSTRAINT` sobre las FK compuestas tras sanear.

**RIESGO DE IMPLEMENTARLA:** Bajo.

---

### INV-19 — 🟡 MEDIO — `PUT /expenses/[id]` revierte y recrea niveles sin filtrar por empresa
**MÓDULO:** Inventario / Multiempresa

**DESCRIPCIÓN:** En la edición de una compra, las dos consultas sobre `inventory_levels` **omiten `companyId`**, a diferencia del `POST` y del `DELETE`, que sí lo llevan con un comentario explicando por qué es obligatorio.

**CAUSA RAÍZ:** Corrección aplicada en POST y DELETE pero no propagada al PUT.

**ESCENARIO:** Contenido en la práctica porque el índice único es `(product_id, warehouse_id, modo)` y la pertenencia se valida antes de la transacción (`route.ts:475-510`), pero es una desviación del control declarado por el propio código y una regresión latente.

**IMPACTO CONTABLE:** Ninguno hoy.

**IMPACTO EN BD:** Escritura anclada a `levelResult[0].id` sobre una fila localizada sin acotar por empresa.

**RIESGO MULTIEMPRESA:** Latente.

**EVIDENCIA:**
`src/app/api/v1/expenses/[id]/route.ts:605-612`:
```ts
            const levelResult = await tx
              .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, oldWarehouseId),
                eq(inventoryLevels.modo, session.modo)
              ));
```
Y otra vez en `:697-704`. Contrastar con `src/app/api/v1/expenses/route.ts:206-213`, que sí lo lleva y lo documenta:
```ts
            // El filtro por empresa es obligatorio: productId y warehouseId
            // llegan del cuerpo de la peticion. Sin el, esta lectura devolvia la
            // existencia del almacen de OTRA empresa...
            const levelResult = await tx.select({ balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.companyId, session.companyId),
```

**SOLUCIÓN RECOMENDADA:** Añadir `eq(inventoryLevels.companyId, session.companyId)` en ambas consultas.

**RIESGO DE IMPLEMENTARLA:** Nulo.

---

### INV-20 — 🟡 MEDIO — Dos implementaciones divergentes de "crear compra"
**MÓDULO:** Compras

**DESCRIPCIÓN:** Existen dos caminos para crear una compra con lógicas contables distintas:
- `POST /api/v1/expenses` (el que usa la pantalla): CxP por el total con impuestos y retenciones.
- `expenseService.createExpense`, usado por `POST /api/v1/reports/606`: **CxP por el subtotal sin ITBIS**, y además no inserta `expense_lines` (aunque acepta `lines` para mover inventario).

**CAUSA RAÍZ:** Código duplicado, evolucionado en uno solo de los dos sitios.

**ESCENARIO:** Compra por 100,000 + 18,000 de ITBIS registrada por la ruta 606. El asiento acredita CxP por 118,000; la tabla `accounts_payable` registra 100,000. El auxiliar de proveedores y el mayor difieren en 18,000, y no hay líneas de detalle aunque el stock haya subido.

**IMPACTO CONTABLE:** Auxiliar de CxP descuadrado contra el mayor. Movimientos de inventario sin línea de gasto que los respalde (y por tanto imposibles de revertir con el `DELETE`, que se guía por `expense_lines`).

**IMPACTO EN BD:** `accounts_payable.amount` inconsistente con `journal_entry_lines`; `expense_lines` vacío para esas compras.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:**
`src/services/expenseService.ts:93-105` — CxP por el subtotal:
```ts
    await tx
      .insert(accountsPayable)
      .values({
        ...
        amount: expenseData.amount.toString(),
        balance: isCredit ? expenseData.amount.toString() : '0.00',
```
`src/app/api/v1/expenses/route.ts:259-267` — CxP por el total:
```ts
        const apBalanceVal = (parseFloat(amount) + parseFloat(itbis || 0) + parseFloat(otherTaxes || 0) - parseFloat(itbisRetained || 0) - parseFloat(isrRetained || 0));
        await tx.insert(accountsPayable).values({
          ...
          amount: apBalanceVal.toString(), // Store the total original debt amount (with taxes)
```
`src/services/expenseService.ts:211-227` — mueve inventario sin insertar `expense_lines`:
```ts
    // Update inventory if goods purchase
    if (expenseData.warehouseId && expenseData.lines && expenseData.userId) {
      for (const line of expenseData.lines) {
        await addStock(...)
```
Uso: `src/app/api/v1/reports/606/route.ts:64`:
```ts
    const expense = await createExpense(body);
```

**SOLUCIÓN RECOMENDADA:** Extraer un único servicio de creación de compra y que ambas rutas lo llamen. Eliminar la lógica en línea de las rutas.

**RIESGO DE IMPLEMENTARLA:** Medio: la unificación cambia el comportamiento de la ruta 606, que puede estar en uso por integraciones.

---

### INV-21 — 🟢 BAJO — `accounting_mappings` es una configuración decorativa
**MÓDULO:** Contabilidad / Configuración

**DESCRIPCIÓN:** Existe una tabla `accounting_mappings` con claves (`inventory`, `cost_of_goods_sold`, `itbis_purchases`, `supplier_payable`…), una pantalla de configuración y una API. **Ningún motor de asientos la lee.** El usuario configura sus cuentas y el sistema sigue posteando contra códigos cableados.

**CAUSA RAÍZ:** El puente de configuración se sembró pero nunca se conectó.

**ESCENARIO:** El contador configura "Inventario → 1.1.03.01" en Ajustes. Todas las compras siguen debitando `1.1.06`. Falsa sensación de control.

**IMPACTO CONTABLE:** Indirecto; es la causa habilitante de INV-04.

**IMPACTO EN BD:** `accounting_mappings` con filas que ningún `SELECT` de posteo consulta.

**RIESGO MULTIEMPRESA:** Uniforme.

**EVIDENCIA:** Búsqueda de `accountingMappings` en `src`: sólo aparece en `src/app/api/v1/accounting/mappings/route.ts` (CRUD) y en `src/repositories/accountingRepository.ts` (siembra y lectura para la pantalla, líneas 404-466). **Ningún fichero de `src/services/` ni de posteo la importa.**
`src/repositories/accountingRepository.ts:588-598`:
```ts
      const defaultMappings = [
        { key: 'sales_revenue', code: '4.1.01' },
        { key: 'accounts_receivable', code: '1.1.02.01' },
        ...
        { key: 'cost_of_goods_sold', code: '5.1.01' },
        { key: 'inventory', code: '1.1.03.01' },
        { key: 'supplier_payable', code: '2.1.01.01' }
      ];
```

**SOLUCIÓN RECOMENDADA:** Ver INV-04: un resolvedor único basado en esta tabla.

**RIESGO DE IMPLEMENTARLA:** Se acumula con el de INV-04.

---

## RESPUESTAS DIRECTAS A LOS 11 PUNTOS

| # | Pregunta | Respuesta verificada |
|---|---|---|
| 1 | ¿Kardex o sólo saldo? | **Ambos**: `inventory_levels` (saldo por producto × almacén × modo, único) y `inventory_movements` (kardex de cantidades, con `balanceAfter`, sin costo). Sí, **el stock se guarda por almacén**. También `inventory_transfers` / `inventory_transfer_lines`, `warehouses`, `user_warehouses`. |
| 2 | Asiento de compra | DÉB. subtotal (Inventario `1.1.06` o Costo `5.1.01`) + DÉB. ITBIS `1.1.08` + DÉB. otros impuestos `5.1.02` / CRÉD. neto a CxP `2.1.01` o Efectivo `1.1.01` + CRÉD. ISR ret. `2.1.04` + CRÉD. ITBIS ret. `2.1.05`. **Sí, mercancía puede ir directo a Costo de Ventas** (INV-03, INV-06). La decisión es `warehouseId && lines.length>0`, **no** por tipo de producto ni por `expenseType`. |
| 3 | Costo de ventas al facturar | **No existe.** Sin promedio ponderado, sin FIFO, sin último costo. `product.cost` fijo y editable. **No hay recálculo de costo al comprar en ningún punto.** |
| 4 | Descarga de stock | La factura **no** descuenta; lo hace el **conduce de entrega aprobado**, en `invoice.warehouseId`. Stock negativo bloqueado en `checkStock` (`inventoryService.ts:202-210`) y por `CHECK chk_inventory_no_negativo` (`drizzle/0031`, `NOT VALID`). Validación **en backend**, no sólo frontend. Los servicios (`tracksInventory = false`) se saltan comprobación y descarga (`inventoryService.ts:176,228`). |
| 5 | Costo cero | No se bloquea la venta, no se genera asiento de costo (no existe ninguno), y la validación de margen se salta con `cost > 0`. El BI infla la utilidad al 100 %. Ver INV-13. |
| 6 | ITBIS y retenciones | ITBIS pagado, otros impuestos, ITBIS retenido e ISR retenido **sí** se contabilizan, y los retenidos **sí** como pasivo sin reducir el gasto (correcto). **`isc`, `tip` e `itbisProportionality` se capturan y nunca se contabilizan** ni entran en la CxP. Ver INV-05. |
| 7 | Moneda extranjera | **No existe soporte.** Ni campo de moneda ni de tasa de cambio en `expenses`; ninguna tabla del esquema tiene tasa de cambio; no hay diferencia cambiaria. Ver INV-15. |
| 8 | Ajustes / devoluciones / transferencias | Los tres existen. **Ajustes: sin asiento** (INV-07). **Devoluciones (NC e-34): mueven stock, sin asiento de costo**, y sin verificar despacho previo (INV-11). **Transferencias: sin asiento — correcto**, no alteran el valor total; la reversión de conduce anulado también funciona correctamente por `modo`. |
| 9 | Integridad multiempresa | Compras (`POST`/`PUT`) **sí** validan que producto y almacén sean de la empresa. Ajustes también. **Transferencias no** (mitigado por FK compuesta, INV-18). `PUT /expenses` omite `companyId` en dos consultas de niveles (INV-19). **El almacén inactivo o borrado sí puede recibir movimientos** (INV-17). |
| 10 | Duplicación / atomicidad | El descuento **sí** ocurre dentro de la misma transacción que el conduce, y la subida dentro de la misma transacción que la compra. **No se usa `FOR UPDATE`** en `addStock` ni en `/expenses`: es lectura-y-escritura, con condición de carrera real (INV-09). Sólo `/inventory/adjustments` bloquea. **Sí hay riesgo de duplicar por reintento**: no hay idempotencia ni NCF único (INV-14), y hay doble vía de entrada pedido/compra (INV-08). |
| 11 | Descuadre físico vs. contable | **No existe ningún reporte ni proceso de conciliación.** Hallazgo de control interno (INV-12). |

---

## NO VERIFICADO

- **No se ejecutó ninguna consulta contra la base de datos real.** Todo el análisis es estático sobre el código fuente; no se cuantificó el volumen de datos ya afectados (existencias negativas preexistentes, cuentas huérfanas creadas, compras duplicadas, niveles divergentes del kardex).
- **No se verificó qué migraciones están efectivamente aplicadas en producción.** Las restricciones `chk_inventory_no_negativo` (0031) y las FK compuestas (0032) se añadieron `NOT VALID`; **no se comprobó si alguien ejecutó los `VALIDATE CONSTRAINT`** ni si las filas históricas las cumplen. Las mitigaciones citadas en INV-18 e INV-04 dependen de que esas migraciones estén desplegadas.
- **No se revisaron los ficheros comprimidos** de la raíz (`bancos_y_inventario.tgz`, `grupo_g_contabilidad.tgz`, `ledger_migraciones.tgz`, `TODO_pendiente.tgz`) ni los scripts de `scratch/`, que podrían contener trabajo en curso sobre estos mismos puntos.
- **No se ejecutaron los tests** (`src/tests/inventoryService.vitest.ts` existe y no fue leído ni ejecutado).
- **No se auditó el módulo de cotizaciones** (`quoteService.ts`), que también lee `products.cost`, ni el POS/caja más allá de su interacción con la factura.
- **No se auditó el cierre de período ni el asiento de cierre** (fase distinta), que podría —o no— contener un ajuste de inventario periódico que compense parcialmente INV-01. No se encontró indicio de que exista, pero no se revisó `grupo_i_cierre.tgz`.
- **No se verificó el comportamiento en ejecución**: los escenarios descritos son deducciones del código, no reproducciones.
