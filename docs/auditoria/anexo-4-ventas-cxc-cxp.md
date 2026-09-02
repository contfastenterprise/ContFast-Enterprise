# AUDITORÍA FASES 7-8-9 — VENTAS, CxC y CxP (ContFast v2)

## RESUMEN DEL FLUJO REAL (10 líneas)

1. **Venta**: `POST /api/v1/invoices` → `InvoiceService.issueInvoice` → calcula totales (`invoiceCalculator.ts`), firma/envía a DGII vía MSeller, y **después** abre la transacción de BD (`invoiceDbBooker.executeDbTransaction`).
2. Dentro de esa transacción: inserta `invoices` + `invoice_lines` + `invoice_taxes` + `invoice_retentions`, movimiento en `financial_movements`, asiento contable, movimiento de caja y —solo si `paymentType === 'credit'`— la fila en `accounts_receivable`.
3. **Asiento de venta** (`invoiceDbBooker.ts:389-457`): DÉBITO `1.1.02` CxC *o* `1.1.01` Caja/Bancos por `totalNet`; CRÉDITO `4.1.01` Ventas por `subtotal - descuento`; CRÉDITO `2.1.03` "ITBIS por Pagar" por `totalTaxes`; DÉBITO `1.1.03/04/05` por retenciones del cliente. Cuadra ( D = C = `total` ).
4. **Contado vs crédito**: lo decide únicamente `data.paymentType`. `cash`/`bank_transfer` → NO se crea fila en `accounts_receivable`, va directo a `1.1.01` y a la sesión de caja. `credit` → sí se crea AR y se debita CxC. No hay "crear AR y saldarla".
5. **NO existe anulación de facturas emitidas.** El único `DELETE` (`invoices/[id]/route.ts:85-126`) solo hace *soft delete* de borradores (`status === 'draft'`). No hay contrasiento, ni `status = 'void'`, ni reversión de ITBIS/CxC/inventario.
6. **Notas de crédito/débito** no usan la tabla `credit_debit_notes` (está muerta): se emiten como facturas con `ecfType = '34'/'33'` por el mismo endpoint.
7. **CxC → cobro**: `POST /api/v1/ar/receipts` → `ArRepository.registerReceipt` (`arRepository.ts:82-222`): inserta `customer_receipts`, filas en `customer_receipt_applied`, actualiza `accounts_receivable.balance` leyendo-y-escribiendo, mete `cash_in` si es efectivo, y **inserta el asiento a mano** (DÉBITO `1.1.01` / CRÉDITO `1.1.02`) sin pasar por `createJournalEntry`.
8. **Compra → CxP**: `POST /api/v1/expenses` inserta `expenses` + `accounts_payable` (solo si `paymentMethod === '04'`) + asiento (DÉBITO Inventario/Costo + ITBIS Pagado; CRÉDITO `2.1.01` CxP o `1.1.01` Caja).
9. **Pago CxP**: `POST /api/v1/ap/payments` → `ApService.registerPayment`: crea `checks` (si aplica) + `ap_payments` + descuenta `accounts_payable.balance` + `financial_movements` + asiento con las cuentas que **manda el cliente**. `supplier_payments`/`supplier_payment_applied` **nunca se escriben**.
10. **Cheques**: en garantía → `checks.status='pending'` + `ap_payments.status='pending_guarantee'` sin asiento ni descargo; al cobrarse (`/ap/payments/apply-guarantees`) → `cleared` + asiento + `bank_transactions` + ajuste de saldo bancario. No existe anulación de cheques.

---

## HALLAZGOS

---

### ARP-01 🔴 CRÍTICO — No existe anulación de facturas emitidas

**MÓDULO**: Ventas / e-CF

**DESCRIPCIÓN**: No hay ningún endpoint capaz de anular una factura ya emitida. El único método destructivo es `DELETE /api/v1/invoices/[id]`, que exige `status === 'draft'` y hace *soft delete*. El estado `'void'` está declarado en el tipo pero jamás se escribe.

**CAUSA RAÍZ**: La funcionalidad nunca se implementó; el diseño asume que toda corrección se hace vía Nota de Crédito e-34, pero no hay control que lo garantice ni forma de corregir una factura emitida por error (NCF equivocado, cliente equivocado, monto equivocado).

**ESCENARIO**: Se emite una factura de RD$500,000 al cliente equivocado. No hay forma de anularla. Queda en el mayor, en `accounts_receivable`, en el 607 y en el estado de cuenta del cliente indefinidamente.

**IMPACTO CONTABLE**: Ingresos, ITBIS por Pagar y CxC sobrevalorados de forma permanente; el 607 reporta ventas inexistentes a la DGII.

**IMPACTO EN BD**: `invoices`, `accounts_receivable`, `journal_entries`, `financial_movements` y `cash_movements` quedan con registros irrecuperables.

**RIESGO MULTIEMPRESA**: Bajo (afecta a cada empresa por igual).

**EVIDENCIA**: `src/app/api/v1/invoices/[id]/route.ts:111-121`
```ts
if (invoice.status !== 'draft') {
  return NextResponse.json(
    { success: false, error: { code: 'BAD_REQUEST', message: 'Solo se pueden eliminar facturas en estado borrador.' } },
    { status: 400, headers: resHeaders }
  );
}
await db.update(invoices).set({ deletedAt: new Date() })
  .where(withTenantMode(invoices, auth, eq(invoices.id, id)));
```
Confirmación de que `'void'` nunca se asigna: `src/repositories/invoiceRepository.ts:13` lo declara en el tipo, pero `grep -rn "status: 'void'"` no devuelve ninguna escritura en todo `src/`.

**SOLUCIÓN RECOMENDADA**: Endpoint `POST /invoices/[id]/void` transaccional que: (a) valide `status IN ('signed','submitted','accepted')` y `status !== 'void'` (idempotencia); (b) valide que no haya cobros aplicados (`customer_receipt_applied` sobre su AR) ni envío DGII aceptado —en cuyo caso debe forzar la ruta e-34—; (c) genere contrasiento por `createJournalEntry` con las mismas cuentas invertidas; (d) ponga `accounts_receivable.balance = 0, status='void'`, `deletedAt`; (e) registre `financial_movements` con `movementType='void'` (el tipo ya existe y no se usa); (f) reverse el `cash_movements` y el stock del conduce si lo hubiera.

**RIESGO DE IMPLEMENTARLA**: Medio-alto. Hay que decidir la política fiscal DR (una factura ya aceptada por DGII no se "borra", se corrige con e-34) y evitar que el nuevo endpoint se use para borrar facturas ya reportadas.

---

### ARP-02 🔴 CRÍTICO — Colisión del código contable `1.1.02`: es CxC en Ventas y "Efectivo en Bancos" en Compras

**MÓDULO**: Ventas / CxP / Contabilidad

**DESCRIPCIÓN**: Cada módulo tiene su propio `getOrCreateAccount(tx, companyId, code, name, type)` que **busca por `code` e ignora el `name`**. El módulo de ventas registra `1.1.02` = "Cuentas por Cobrar Clientes"; el módulo de gastos registra `1.1.02` = "Efectivo en Bancos". El primero que se ejecute en la empresa crea la cuenta y el otro la reutiliza silenciosamente.

**CAUSA RAÍZ**: Plan de cuentas hardcodeado y duplicado en cuatro archivos, sin catálogo semilla único ni uso de `accounting_mappings`.

**ESCENARIO**: Empresa nueva. Se emite la primera factura a crédito → se crea `1.1.02 = "Cuentas por Cobrar Clientes"`. Después se registra una compra a crédito con cheque en garantía → el `ap_payments.creditAccountId` apunta a esa misma fila. Cuando el cheque se cobra, el asiento queda **DÉBITO 2.1.01 Cuentas por Pagar / CRÉDITO 1.1.02 Cuentas por Cobrar Clientes**: el pago a un proveedor rebaja la cuenta de clientes.

**IMPACTO CONTABLE**: CxC del mayor rebajada por pagos a proveedores; banco nunca acreditado. Balance General y antigüedad de saldos falsos. El descuadre auxiliar-vs-mayor de CxC es exactamente igual a la suma de cheques en garantía cobrados.

**IMPACTO EN BD**: `journal_entry_lines` con `account_id` semánticamente incorrecto; `ap_payments.credit_account_id` persistido apuntando a la cuenta equivocada (el error se congela y se repite en cada cobro de cheque).

**RIESGO MULTIEMPRESA**: Alto en el sentido de que el resultado depende del orden de operaciones de cada empresa: dos empresas del mismo despacho pueden tener el `1.1.02` con significados opuestos, y ningún reporte consolidado es comparable.

**EVIDENCIA**: `src/app/api/v1/expenses/route.ts:304-305`
```ts
const accAp = await getOrCreateAccount(tx, session.companyId, '2.1.01', 'Cuentas por Pagar', 'liability');
const accBank = await getOrCreateAccount(tx, session.companyId, '1.1.02', 'Efectivo en Bancos', 'asset');
```
`src/services/invoice/invoiceDbBooker.ts:389`
```ts
const accCxC = await this.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
```
`src/repositories/arRepository.ts:186` (tercera definición del mismo código):
```ts
const accCxC = await ArRepository.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
```
La búsqueda solo usa el código (`src/services/invoice/invoiceDbBooker.ts:582-585`):
```ts
const [acc] = await tx.select().from(chartOfAccounts)
  .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));
if (acc) return acc;
```
Mismo patrón en `src/app/api/v1/expenses/[id]/route.ts:903-904`.

**SOLUCIÓN RECOMENDADA**: Eliminar los cuatro `getOrCreateAccount` y sustituirlos por una única resolución vía `accounting_mappings` (`sales_revenue`, `accounts_receivable`, `cash`, `bank`, `itbis_sales`, `accounts_payable`…) con catálogo semilla obligatorio al crear la empresa. Añadir migración de saneamiento que detecte y separe las cuentas ya colisionadas.

**RIESGO DE IMPLEMENTARLA**: Alto. Los datos históricos ya están asentados contra la cuenta colisionada; la corrección exige un asiento de reclasificación por empresa y revisión manual del contador.

---

### ARP-03 🔴 CRÍTICO — Nota de crédito sin `modifiedInvoiceId` crea una CxC **positiva** (aumenta la deuda del cliente)

**MÓDULO**: Ventas / CxC

**DESCRIPCIÓN**: En la rama de CxC del asiento de venta, la reducción del saldo por Nota de Crédito solo ocurre si `ecfType === '34' && data.modifiedInvoiceId`. El esquema Zod exige `modifiedNcf` para e-33/e-34, pero `modifiedInvoiceId` es **opcional**. Una NC a crédito sin ese UUID cae al `else` y ejecuta `createAccountsReceivable` con `amount = totalNet` positivo.

**CAUSA RAÍZ**: La condición discrimina por presencia de un campo opcional en lugar de por el tipo de documento; falta un `else if (ecfType === '34') throw`.

**ESCENARIO**: El usuario emite una NC e-34 por RD$100,000 desde una pantalla que solo envía `modifiedNcf` (texto). Resultado: el mayor CRÉDITA CxC por 100,000 y el auxiliar **crea una nueva cuenta por cobrar de +100,000** al mismo cliente.

**IMPACTO CONTABLE**: Divergencia de RD$200,000 entre el auxiliar de CxC y la cuenta `1.1.02` del mayor por cada NC afectada. El cliente aparece debiendo el importe que se le acaba de acreditar.

**IMPACTO EN BD**: Fila espuria en `accounts_receivable` con `invoiceId` apuntando a la propia NC, `status='pending'`, que además aparece en `getPendingAR` como cobrable.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: `src/services/invoice/invoiceDbBooker.ts:479-519`
```ts
if (data.paymentType === 'credit' && data.customerId) {
  if (data.ecfType === '34' && data.modifiedInvoiceId) {
    // ... rebaja el saldo del AR existente
  } else {
    // Standard invoice or Debit Note (increases receivable)
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 1);
    await AccountRepository.createAccountsReceivable(tx, {
      companyId: data.companyId, customerId: data.customerId,
      invoiceId: invoice.id, amount: totals.totalNet, dueDate, modo: data.modo,
    });
  }
}
```
Opcionalidad de `modifiedInvoiceId`: `src/app/api/v1/invoices/route.ts:25` (`modifiedInvoiceId: z.string().uuid().optional()`) frente a la única validación existente, `route.ts:59-66`, que solo exige `modifiedNcf`.

**SOLUCIÓN RECOMENDADA**: Hacer `modifiedInvoiceId` obligatorio para `ecfType IN ('33','34')` en el `refine` de Zod, y en el booker convertir el `else` en `if (data.ecfType === '34') throw new Error('Nota de crédito sin documento afectado')`.

**RIESGO DE IMPLEMENTARLA**: Bajo. Solo hay que asegurar que el frontend envíe el UUID (ya lo tiene: la pantalla selecciona la factura a modificar).

---

### ARP-04 🔴 CRÍTICO — Un cobro puede aplicarse a la factura de **otro cliente**; la fila de aplicación se inserta **antes** de validar

**MÓDULO**: CxC

**DESCRIPCIÓN**: `customer_receipt_applied` no tiene `companyId` ni `customerId`. El código valida que el `arId` pertenezca a la misma **empresa** y **modo** (esto fue corregido, hay comentario al respecto), pero **no valida que el AR pertenezca al mismo cliente del recibo**. Peor: el `INSERT` en `customer_receipt_applied` ocurre en la línea 120, *antes* de la consulta de validación de la línea 130. Si el AR no supera el filtro de empresa, la fila de aplicación **ya quedó insertada** y sin efecto sobre ningún saldo.

**CAUSA RAÍZ**: Orden de operaciones invertido (escribir → validar) y ausencia del predicado `accountsReceivable.customerId = data.customerId`.

**ESCENARIO A (cross-cliente)**: Se registra un recibo de RD$50,000 del Cliente A y en `invoicesApplied` se manda el `arId` de una factura del Cliente B (mismo tenant). Pasa la validación. El saldo de B baja 50,000, el mayor CREDITA CxC global, y A sigue debiendo. En el estado de cuenta de A aparece un `receipt` que le rebaja el saldo (`financial_movements`), mientras el auxiliar `accounts_receivable` se lo rebajó a B: **doble descargo de 50,000**.

**ESCENARIO B (fila huérfana + fuga multiempresa)**: Se manda el `arId` de otra empresa. La fila de `customer_receipt_applied` se inserta igualmente; ningún saldo cambia. Después, `getReceiptDetails` hace `innerJoin(accountsReceivable, ...)` **sin filtro de empresa** (`arRepository.ts:295-298`) y el recibo impreso muestra el NCF, la fecha y el total de la factura de la otra empresa.

**IMPACTO CONTABLE**: Doble reducción del saldo del cliente (auxiliar vs estado de cuenta), CxC del mayor descuadrada respecto al auxiliar por el importe aplicado cruzado.

**IMPACTO EN BD**: `customer_receipt_applied` con `ar_id` incoherente con el `customer_id` del recibo padre, sin ninguna restricción de integridad que lo impida (no hay FK compuesta ni CHECK).

**RIESGO MULTIEMPRESA**: **Alto**. El descargo cross-empresa está bloqueado, pero la fila espuria persiste y el `SELECT` de impresión sí filtra por empresa solo el recibo, no el AR → fuga de datos fiscales entre tenants.

**EVIDENCIA**: `src/repositories/arRepository.ts:117-151`
```ts
for (const applied of data.invoicesApplied) {
  if (applied.amountApplied <= 0) continue;

  await tx.insert(customerReceiptApplied).values({
    id: uuidv4(),
    receiptId,
    arId: applied.arId,
    amountApplied: applied.amountApplied.toString(),
  });

  // Update AR balance
  // arId viene del cuerpo de la peticion: sin filtrar por empresa se
  // podia saldar la cuenta por cobrar de otra empresa.
  const [ar] = await tx
    .select()
    .from(accountsReceivable)
    .where(and(
      eq(accountsReceivable.id, applied.arId),
      eq(accountsReceivable.companyId, data.companyId),
      eq(accountsReceivable.modo, data.modo)
    ));
  if (ar) { ... }
}
```
Fuga en la impresión, `src/repositories/arRepository.ts:295-298`:
```ts
.from(customerReceiptApplied)
.innerJoin(accountsReceivable, eq(customerReceiptApplied.arId, accountsReceivable.id))
.innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
.where(eq(customerReceiptApplied.receiptId, receiptId));
```
Ausencia de `customerId` en el esquema: `src/db/schema/accounting.ts:108-117`.

**SOLUCIÓN RECOMENDADA**: (1) Mover la validación antes del `INSERT` y lanzar error si no encuentra el AR (`throw`, no `if (ar)` silencioso). (2) Añadir `eq(accountsReceivable.customerId, data.customerId)` al `where`. (3) Añadir `companyId` y `customerId` denormalizados a `customer_receipt_applied` con FK compuesta hacia `accounts_receivable(id, company_id, customer_id)`, y filtrar por empresa en todos los `JOIN` de lectura. Aplicar lo mismo a `supplier_payment_applied` antes de que se le dé uso (ver ARP-11).

**RIESGO DE IMPLEMENTARLA**: Medio. Requiere migración con backfill; hay que decidir qué hacer con las filas huérfanas ya existentes antes de poder crear la FK.

---

### ARP-05 🔴 CRÍTICO — El cobro no valida `amountApplied` contra el saldo del AR: saldos negativos y documentos `paid` con saldo negativo

**MÓDULO**: CxC

**DESCRIPCIÓN**: La ruta valida que `Σ amountApplied ≈ receipt.amount` (mitigación parcial), pero **nada valida que `amountApplied ≤ ar.balance`**. El nuevo saldo se calcula por resta directa y puede quedar negativo. El estado se decide con `newBalance <= 0.01 ? 'paid' : 'pending'`, de modo que un saldo de −30,000 queda como `'paid'`.

**CAUSA RAÍZ**: Ausencia de invariante `0 ≤ balance ≤ amount` tanto en código como en la BD (no hay `CHECK` en `accounts_receivable`).

**ESCENARIO**: Factura con saldo de RD$20,000. Se registra un recibo de RD$50,000 aplicado íntegro a ella (pasa la validación de la ruta, que solo compara con el total del recibo). `balance = -30,000`, `status='paid'`. `getPendingAR` filtra `balance > 0` → la factura desaparece del listado y el sobrepago se vuelve invisible. No existe concepto de anticipo (`movementType='advance'` está declarado y nunca se usa).

**IMPACTO CONTABLE**: `SUM(accounts_receivable.balance)` de la empresa queda por debajo del saldo real de `1.1.02` en 30,000. La antigüedad de saldos y el reporte de balances de clientes (`/reports/balances/customers`) reportan de menos.

**IMPACTO EN BD**: `accounts_receivable.balance` negativo persistido con `status='paid'`; combinación imposible según la semántica declarada del campo.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: `src/repositories/arRepository.ts:138-150`
```ts
if (ar) {
  const newBalance = parseFloat(ar.balance as any) - applied.amountApplied;
  await tx.update(accountsReceivable)
    .set({ 
      balance: newBalance.toString(),
      status: newBalance <= 0.01 ? 'paid' : 'pending'
    })
    .where(and(
      eq(accountsReceivable.id, applied.arId),
      eq(accountsReceivable.companyId, data.companyId),
      eq(accountsReceivable.modo, data.modo)
    ));
}
```
Única validación existente, en la ruta (`src/app/api/v1/ar/receipts/route.ts:84-91`):
```ts
const totalApplied = parsed.data.invoicesApplied.reduce((sum, inv) => sum + inv.amountApplied, 0);
if (Math.abs(totalApplied - parsed.data.amount) > 0.01) { ... }
```
Contraste con CxP, que **sí** valida el tope (`src/services/apService.ts:52-55`).

**SOLUCIÓN RECOMENDADA**: Rechazar con error si `applied.amountApplied > parseFloat(ar.balance) + 0.01`. Añadir `CHECK (balance >= 0 AND balance <= amount)` en `accounts_receivable`. Para el excedente legítimo, implementar el anticipo: recibo con `Σ aplicado < amount` y un `financial_movements` de tipo `'advance'` contra una cuenta de pasivo "Anticipos de Clientes".

**RIESGO DE IMPLEMENTARLA**: Bajo para la validación; medio para el `CHECK` (fallará si ya hay filas negativas en producción — requiere saneamiento previo).

---

### ARP-06 🔴 CRÍTICO — El pago a proveedor lee el saldo **fuera** de la transacción: doble pago bajo concurrencia

**MÓDULO**: CxP

**DESCRIPCIÓN**: `ApService.registerPayment` abre `db.transaction`, pero la primera operación llama a `ApRepository.findById`, que ejecuta `db.select(...)` sobre la **conexión global**, no sobre `tx`. La validación de tope (`input.amount > balanceNum`) se hace sobre esa lectura externa, y el nuevo saldo se calcula con ella (`newBalance = balanceNum - input.amount`) en lugar de con un `UPDATE` atómico.

**CAUSA RAÍZ**: `findById` no acepta un parámetro `tx`; el servicio no lo advierte. Además no hay `SELECT ... FOR UPDATE`.

**ESCENARIO**: CxP de RD$100,000. Dos usuarios (o un doble clic) lanzan un pago de 100,000 cada uno con 200 ms de diferencia. Ambos leen `balance = 100,000` fuera de la transacción, ambos pasan la validación, ambos escriben `balance = 0`, y se emiten **dos cheques de 100,000** con dos asientos.

**IMPACTO CONTABLE**: CxP del mayor rebajada 200,000 contra una deuda de 100,000 → saldo deudor en una cuenta de pasivo. Salida de banco duplicada.

**IMPACTO EN BD**: Dos filas en `ap_payments` con `status='applied'`, dos en `checks`, un solo `accounts_payable.balance = 0`. `ApRepository.findAll:66` reconstruye `amount = balance + Σ pagos` → la CxP pasa a mostrar un importe original de 200,000, ocultando el error.

**RIESGO MULTIEMPRESA**: Ninguno adicional (el filtro de empresa y modo sí está presente en `findById`).

**EVIDENCIA**: `src/services/apService.ts:45-55`
```ts
return await db.transaction(async (tx) => {
  // 1. Verify AP exists
  const ap = await ApRepository.findById(input.apId, input.companyId, input.modo);
  if (!ap) { throw new Error('Cuenta por pagar no encontrada.'); }

  const balanceNum = parseFloat(ap.balance);
  if (input.amount > balanceNum) {
    throw new Error(`El monto del pago ($${input.amount.toFixed(2)}) no puede exceder el balance pendiente ($${balanceNum.toFixed(2)}).`);
  }
```
`ApRepository.findById` usa la conexión global (`src/repositories/apRepository.ts:89-103`):
```ts
static async findById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
  const result = await db.select({ ... })
```
Escritura no atómica (`src/services/apService.ts:140-141`):
```ts
const newBalance = balanceNum - input.amount;
await ApRepository.updateApBalance(tx, input.apId, input.companyId, newBalance);
```

**SOLUCIÓN RECOMENDADA**: Añadir parámetro `tx` a `findById` y usar `SELECT ... FOR UPDATE` sobre `accounts_payable`. Reemplazar `updateApBalance(newBalance)` por un `UPDATE ... SET balance = balance - $amount WHERE id = $id AND company_id = $c AND modo = $m AND balance >= $amount RETURNING balance`, y lanzar error si no devuelve fila. Añadir `CHECK (balance >= 0)`.

**RIESGO DE IMPLEMENTARLA**: Bajo-medio. El `FOR UPDATE` puede introducir contención si se paga en lote, pero el volumen es pequeño.

---

### ARP-07 🟠 ALTO — Race condition lectura-escritura en `accounts_receivable.balance` (cobro duplicado)

**MÓDULO**: CxC

**DESCRIPCIÓN**: El mismo patrón de ARP-06 en el lado de cobros. Está dentro de `db.transaction`, pero en `READ COMMITTED` sin `FOR UPDATE` dos transacciones concurrentes leen el mismo `balance` y la última escritura gana (*lost update*).

**CAUSA RAÍZ**: `SELECT` seguido de `UPDATE ... SET balance = <valor calculado en JS>` en vez de `UPDATE ... SET balance = balance - x`.

**ESCENARIO**: Dos cajeros cobran la misma factura de RD$10,000 simultáneamente (5,000 c/u). Ambos leen 10,000, ambos escriben 5,000. Se registran dos recibos por 10,000 en total, dos asientos de 5,000 cada uno CREDITANDO CxC, pero el auxiliar solo bajó 5,000.

**IMPACTO CONTABLE**: CxC del mayor 5,000 por debajo del auxiliar; caja/banco recibió dinero que el auxiliar no refleja.

**IMPACTO EN BD**: `customer_receipt_applied` con Σ aplicado = 10,000 contra un `accounts_receivable` cuyo `amount - balance` = 5,000.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: `src/repositories/arRepository.ts:139-149` (código citado en ARP-05). Nótese la ausencia total de `for update` en el archivo: `grep -n "for update" src/repositories/arRepository.ts` → sin resultados.

**SOLUCIÓN RECOMENDADA**: `UPDATE accounts_receivable SET balance = balance - $applied, status = CASE WHEN balance - $applied <= 0.01 THEN 'paid' ELSE 'pending' END WHERE id=$1 AND company_id=$2 AND modo=$3 AND customer_id=$4 AND balance >= $applied RETURNING balance` y validar `rowCount === 1`. Resuelve simultáneamente ARP-04, ARP-05 y ARP-07.

**RIESGO DE IMPLEMENTARLA**: Bajo.

---

### ARP-08 🟠 ALTO — Cobros y pagos por banco/cheque/tarjeta no generan movimiento bancario ni ajustan el saldo de la cuenta

**MÓDULO**: CxC / CxP / Bancos

**DESCRIPCIÓN**: `ArRepository.registerReceipt` solo actúa sobre el módulo de caja cuando `paymentMethod === 'cash'`. Para `'bank'`, `'check'` y `'card'` no inserta nada en `bank_transactions` ni llama a `BankRepository.ajustarSaldo`. En CxP, `ApService.registerPayment` **nunca** toca el banco: solo la aplicación diferida de cheques en garantía lo hace. Un pago por `'transfer'` o por cheque regular (`cleared` de inmediato) genera asiento y descarga la CxP, pero el saldo bancario no se mueve.

**CAUSA RAÍZ**: La integración banco↔CxC/CxP solo se implementó en el camino de cheques en garantía.

**ESCENARIO**: Se cobra una factura de RD$300,000 por transferencia y se paga a un proveedor RD$200,000 por transferencia. El mayor cuadra (asientos correctos), pero `bank_accounts.balance` y `bank_transactions` no registran ni la entrada ni la salida. La conciliación bancaria (`/bank/reconciliations`) nunca cuadra.

**IMPACTO CONTABLE**: Saldo bancario del módulo de bancos desconectado del mayor y del banco real. Además, el asiento del cobro siempre carga `1.1.01` "Efectivo en Caja y Bancos" sin distinguir caja de banco ni cuenta bancaria concreta.

**IMPACTO EN BD**: `bank_transactions` incompleta; `bank_accounts.balance` (y su fila por modo) permanentemente desfasada.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: `src/repositories/arRepository.ts:153-182` — todo el bloque bancario está condicionado a efectivo:
```ts
// 3. Rule: If payment is 'cash', it goes to Petty Cash (Caja Chica)
if (data.paymentMethod === 'cash') {
  ...
  await CashRepository.addMovement(tx, { ... type: 'cash_in', ... });
}
```
Y el asiento posterior no discrimina el medio (`arRepository.ts:185-218`): siempre `accCaja` = `1.1.01`.
En CxP, `src/services/apService.ts:126-186` no contiene ninguna referencia a `bankTransactions`/`ajustarSaldo`; el `grep` de escritores confirma que solo hay cuatro:
```
src/app/api/v1/bank/accounts/[id]/transactions/route.ts:196
src/repositories/bankRepository.ts:200
src/services/apService.ts:265   (aplicación masiva de cheques en garantía)
src/services/apService.ts:416   (aplicación individual de cheque en garantía)
```

**SOLUCIÓN RECOMENDADA**: Añadir `bankAccountId` obligatorio a `customer_receipts` y a `ap_payments` cuando el método no sea efectivo, y llamar a `BankRepository.registerTransaction` (que ya ajusta saldo por modo) dentro de la misma transacción. Resolver la cuenta contable del asiento desde `bank_accounts.chartAccountId` en vez del `1.1.01` genérico.

**RIESGO DE IMPLEMENTARLA**: Medio. Cambia el contrato de la API (nuevo campo requerido) y obliga a mapear cada cuenta bancaria a una cuenta del catálogo.

---

### ARP-09 🟠 ALTO — El asiento del recibo de cobro se inserta a mano, saltándose la validación de período cerrado y de partida doble

**MÓDULO**: CxC / Contabilidad

**DESCRIPCIÓN**: Todos los módulos usan `AccountingRepository.createJournalEntry`, que valida (a) débitos = créditos, (b) mínimo dos líneas, (c) **período contable abierto**. `ArRepository.registerReceipt` es la excepción: hace `tx.insert(journalEntries)` y `tx.insert(journalEntryLines)` directamente.

**CAUSA RAÍZ**: Implementación duplicada del asiento en el repositorio de CxC.

**ESCENARIO**: El contador cierra el período de julio. En agosto se registra un cobro con `date = '2026-07-15'`. La factura de venta con esa fecha sería rechazada (`El periodo contable ... está cerrado`), pero el cobro **se asienta sin objeción** en un período cerrado, alterando estados financieros ya emitidos.

**IMPACTO CONTABLE**: Movimientos posteriores al cierre en períodos cerrados; el Balance General y el Estado de Resultados ya firmados dejan de reproducirse.

**IMPACTO EN BD**: `journal_entries` con `date` dentro de un `accounting_periods` en `status='closed'`.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: `src/repositories/arRepository.ts:188-218`
```ts
const entryId = uuidv4();
await tx.insert(journalEntries).values({
  id: entryId,
  companyId: data.companyId,
  modo: data.modo,
  date: data.date,
  reference: receiptId.slice(0, 8),
  description: `Recibo de Cobro - Cliente ID: ${data.customerId.slice(0,8)}`,
  status: 'posted'
});

await tx.insert(journalEntryLines).values([ ... ]);
```
Frente a la validación que se está evitando, `src/repositories/accountingRepository.ts:287-306`:
```ts
if (Math.abs(totalDebits - totalCredits) > 0.01) {
  throw new Error(`Asiento contable descuadrado: ...`);
}
...
const isOpen = await this.isPeriodOpen(data.companyId, formattedDate, data.modo, transactionContext);
if (!isOpen) {
  throw new Error(`El periodo contable para la fecha ${formattedDate} está cerrado o no existe.`);
}
```
Nota adicional: `reference` se guarda truncado a 8 caracteres (`receiptId.slice(0, 8)`), mientras el resto del sistema guarda el UUID completo → el asiento del cobro no es trazable con un `JOIN`.

**SOLUCIÓN RECOMENDADA**: Sustituir el bloque por `AccountRepository.createJournalEntry(tx, { companyId, modo, reference: receiptId, date: data.date, description, lines: [...] })`.

**RIESGO DE IMPLEMENTARLA**: Bajo, pero empezará a rechazar cobros con fecha en períodos cerrados (comportamiento correcto que puede sorprender a los usuarios).

---

### ARP-10 🟠 ALTO — `invoices.paymentStatus` nunca se actualiza tras el cobro

**MÓDULO**: Ventas / CxC

**DESCRIPCIÓN**: `paymentStatus` se fija en la emisión (`'unpaid'` si es a crédito, `'paid'` en caso contrario) y **ninguna ruta lo modifica después**. Al cobrar, solo cambian `accounts_receivable.status` y `.balance`.

**CAUSA RAÍZ**: Dos fuentes de verdad para el mismo hecho (`invoices.paymentStatus` vs `accounts_receivable.status`) sin sincronización.

**ESCENARIO**: Factura a crédito de RD$1,000,000 cobrada íntegramente. `accounts_receivable.status='paid'`, `balance=0`, pero `invoices.paymentStatus='unpaid'` para siempre. El estado `'partial'` no se escribe nunca en todo el sistema.

**IMPACTO CONTABLE**: Ninguno directo en el mayor, pero todos los KPI e informes basados en `paymentStatus` mienten: el dashboard de cobranza y el resumen del agente reportan como pendiente lo ya cobrado.

**IMPACTO EN BD**: `invoices.paymentStatus` en estado inconsistente con su `accounts_receivable`.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: Únicas escrituras del campo en todo `src/`:
```
src/app/api/v1/invoices/draft/route.ts:133  paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
src/services/invoice/invoiceDbBooker.ts:184 paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
src/services/invoice/invoiceDbBooker.ts:291 paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
```
Consumidores afectados, `src/repositories/dashboardRepository.ts:241-242`:
```ts
if (row.paymentStatus === 'paid') paid += amount;
else if (row.paymentStatus === 'partial') partial += amount;
```
y `src/repositories/agentRepository.ts:13`:
```ts
totalPending: sql<number>`sum(case when ${invoices.paymentStatus} != 'paid' then ${invoices.total} else 0 end)`,
```
Además `src/infrastructure/jobRunners.ts:172` usa `paymentStatus` para decidir el tipo de pago que se declara a la DGII.

**SOLUCIÓN RECOMENDADA**: Actualizar `invoices.paymentStatus` en la misma transacción del cobro (`paid` si `balance <= 0.01`, `partial` si `0 < balance < amount`, `unpaid` si `balance == amount`), o —mejor— eliminar el campo y derivarlo siempre de `accounts_receivable`.

**RIESGO DE IMPLEMENTARLA**: Bajo-medio. Requiere backfill de los datos históricos.

---

### ARP-11 🟠 ALTO — Dos mecanismos paralelos de pago a proveedor: `supplier_payments`/`supplier_payment_applied` **nunca se escriben**

**MÓDULO**: CxP

**DESCRIPCIÓN**: El esquema define dos caminos: (a) `supplier_payments` + `supplier_payment_applied` (espejo simétrico del lado de CxC) y (b) `ap_payments` (con `debitAccountId`/`creditAccountId`/`checkId`). **Solo (b) tiene código de escritura.** Las tablas de (a) únicamente aparecen en lecturas, en un `DELETE` de sandbox y en una validación defensiva.

**CAUSA RAÍZ**: Migración a mitad de camino entre dos diseños; se dejaron las tablas y sus lectores.

**ESCENARIO**: El panel de CxP muestra el KPI "Pagado este mes" calculado desde `supplier_payments`, que está vacía. Se pagan RD$5,000,000 a proveedores en el mes y el KPI muestra **RD$0.00**. Simultáneamente, la comprobación defensiva de borrado de compras consulta `supplier_payment_applied` (siempre 0 filas), por lo que esa barrera es inoperante — la que sí protege es la de `ap_payments`.

**IMPACTO CONTABLE**: Ninguno directo en el mayor (los pagos reales sí se asientan por `ap_payments`), pero los indicadores de tesorería son falsos y el riesgo de doble camino existe latente: si alguien implementa el camino (a), ambos descontarían `accounts_payable.balance` sin conocerse.

**IMPACTO EN BD**: `supplier_payments` y `supplier_payment_applied` permanentemente vacías; `supplier_payment_applied` tampoco tiene `companyId`, con la misma exposición estructural que ARP-04 si llegara a usarse.

**RIESGO MULTIEMPRESA**: Latente. `supplier_payment_applied.apId` no está acotado por empresa en el esquema; cualquier implementación futura repetirá el fallo de CxC.

**EVIDENCIA**: Inventario completo de referencias (`grep -rn "supplierPayments\|supplierPaymentApplied"`), sin un solo `insert`:
```
src/actions/payables.ts:88-97          (SELECT para el KPI)
src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts:87,101  (DELETE)
src/app/api/v1/expenses/[id]/route.ts:323-324  (SELECT count defensivo)
```
KPI muerto, `src/actions/payables.ts:86-99` y `133-139`:
```ts
const paymentsList = await db
  .select({ amount: supplierPayments.amount, date: supplierPayments.date, ... })
  .from(supplierPayments)
  .where(and(eq(supplierPayments.companyId, companyId), ...));
...
paymentsList.forEach(payment => {
  const pDate = new Date(payment.date);
  if (pDate.getTime() >= currentMonthStart.getTime()) {
    pagadoEsteMes += Number(payment.amount);
  }
});
```
Camino real, `src/services/apService.ts:126-141` (`ApRepository.createPayment` → `ap_payments` + `updateApBalance`).

**SOLUCIÓN RECOMENDADA**: Decidir un único mecanismo. Recomendado: mantener `ap_payments` (es el que tiene cheques y cuentas contables) y (a) reescribir el KPI de `actions/payables.ts` sobre `ap_payments WHERE status='applied'`; (b) eliminar por migración `supplier_payments` y `supplier_payment_applied`, o marcarlas `DEPRECATED` con un trigger que impida insertar. Nunca dejar ambos caminos activos.

**RIESGO DE IMPLEMENTARLA**: Bajo si solo se corrige el KPI; medio si se eliminan tablas (revisar el `clear-sandbox`).

---

### ARP-12 🟠 ALTO — No existe anulación de cheques ni reverso de pagos: los estados `voided` son inalcanzables

**MÓDULO**: CxP / Bancos

**DESCRIPCIÓN**: `checks.status` admite `pending | cleared | voided` y `ap_payments.status` admite `pending_guarantee | applied | voided`, pero **ningún punto del código escribe `'voided'`** en esas tablas. No hay endpoint de anulación de cheque ni de reverso de pago. Tampoco existe anulación de recibos de cobro (`customer_receipts.deletedAt` solo se escribe en el borrado de sandbox).

**CAUSA RAÍZ**: Funcionalidad no implementada; los mensajes de error del sistema, sin embargo, la dan por existente.

**ESCENARIO**: Se emite un cheque por RD$400,000 con el beneficiario equivocado. El cheque se anula físicamente en el banco. En el sistema: la CxP sigue descargada, el asiento sigue vigente, el cheque sigue `cleared` y no hay forma de restituir el saldo del proveedor salvo edición directa en BD. Peor aún, `expenses/[id]` bloquea el borrado de la compra pidiendo "revierta o anule esos pagos antes de eliminarla" — una acción que no existe, dejando al usuario en un callejón sin salida.

**IMPACTO CONTABLE**: Imposibilidad de corregir salidas de banco erróneas; CxP subvaluada de forma permanente.

**IMPACTO EN BD**: Registros de `checks` y `ap_payments` inmutables una vez `applied`/`cleared`.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: El único `status: 'voided'` de todo el proyecto está en conduces, no en cheques (`grep -rn "status: 'voided'" src`):
```
src/repositories/deliveryRepository.ts:416:          status: 'voided',
```
Estados declarados pero inalcanzables: `src/db/schema/accounting.ts:182` (`checks.status`) y `src/db/schema/accounting.ts:208` (`apPayments.status`).
Mensaje que promete lo inexistente, `src/app/api/v1/expenses/[id]/route.ts:314-316`:
```ts
const err: any = new Error(
  'No se puede eliminar esta compra: ya tiene pagos aplicados contablemente (afectaron banco y mayor). Revierta o anule esos pagos antes de eliminarla.'
);
```
Y en CxC, `src/app/api/v1/ar/receipts/[id]/route.ts` solo exporta `GET`.

**SOLUCIÓN RECOMENDADA**: Endpoints `POST /ap/payments/[id]/void` y `POST /ar/receipts/[id]/void` que, en una transacción: validen el estado actual (idempotencia), generen contrasiento por `createJournalEntry`, restituyan `accounts_payable.balance` / `accounts_receivable.balance` con `UPDATE` atómico, reversen `bank_transactions`/`cash_movements`, marquen `status='voided'` y registren `financial_movements` con `movementType='void'`.

**RIESGO DE IMPLEMENTARLA**: Medio-alto. Es la pieza que más interacciones cruza (banco, caja, mayor, auxiliar y estado de cuenta).

---

### ARP-13 🟠 ALTO — Aplicación de cheque en garantía sin bloqueo: doble descargo posible y `Math.max(0)` oculta el descuadre

**MÓDULO**: CxP / Cheques

**DESCRIPCIÓN**: Existen dos rutas hacia el mismo hecho: `applyDueGuaranteeChecks` (masiva) y `applySingleGuaranteeCheck` (individual), ambas por el mismo endpoint `POST /ap/payments/apply-guarantees`. Ninguna bloquea filas (`FOR UPDATE`), y la masiva **ni siquiera vuelve a comprobar el estado** dentro de la transacción: confía en el `SELECT` de `findPendingGuaranteeChecks`, ejecutado con `db` global. Además, el nuevo saldo se calcula con `Math.max(0, apBalance - amountNum)`.

**CAUSA RAÍZ**: Ausencia de bloqueo optimista/pesimista y uso de `Math.max(0)` como "protección" en lugar de validación con error.

**ESCENARIO A (doble aplicación)**: Un usuario pulsa "Aplicar vencidos" mientras otro aplica el mismo cheque individualmente. Ambas transacciones leen `status='pending'`, ambas ponen `cleared`, ambas descuentan la CxP y **ambas generan asiento y `bank_transactions`**: el banco baja el doble.

**ESCENARIO B (descuadre silencioso)**: CxP con saldo de RD$30,000 y un cheque en garantía de RD$50,000 (posible: `checkAmount = parseFloat(guaranteeCheck.amount) || apBalanceVal`, `expenses/route.ts:287`). Al aplicarlo, el auxiliar baja a 0 pero el asiento DEBITA CxP por 50,000 → el mayor queda con 20,000 deudores en una cuenta de pasivo, sin ningún error visible.

**IMPACTO CONTABLE**: Cuenta `2.1.01` Cuentas por Pagar con saldo deudor; salida de banco duplicada en el escenario A.

**IMPACTO EN BD**: `accounts_payable.balance = 0` mientras `Σ ap_payments.amount (applied) > amount` original.

**RIESGO MULTIEMPRESA**: Ninguno adicional (empresa y modo sí se filtran).

**EVIDENCIA**: `src/services/apService.ts:214-232`
```ts
const amountNum = parseFloat(payment.amount);
const apBalance = parseFloat(ap.balance);

// Calculate new balance
const newBalance = Math.max(0, apBalance - amountNum);

// 1. Update check status to cleared
await tx.update(checks)
  .set({ status: 'cleared', clearedDate: todayStr, updatedAt: new Date() })
  .where(eq(checks.id, check.id));
```
Lectura fuera de la transacción, `src/services/apService.ts:204` → `ApRepository.findPendingGuaranteeChecks` (`src/repositories/apRepository.ts:355`) usa `db.select`, no `tx`.
Mismo `Math.max(0)` en la vía individual, `src/services/apService.ts:371`. Y el mismo patrón se repite en la Nota de Crédito, `src/services/invoice/invoiceDbBooker.ts:497`:
```ts
const newBalance = Math.max(0, parseFloat(existingAr.balance || '0') - totals.totalNet);
```

**SOLUCIÓN RECOMENDADA**: `UPDATE checks SET status='cleared' ... WHERE id=$1 AND status='pending' RETURNING id` y abortar si no devuelve fila (garantiza aplicación única sin bloqueos). Sustituir `Math.max(0, ...)` por validación explícita con error, o por un `UPDATE ... WHERE balance >= $amount`.

**RIESGO DE IMPLEMENTARLA**: Bajo. Puede empezar a rechazar aplicaciones que hoy "funcionan" silenciosamente mal.

---

### ARP-14 🟠 ALTO — La venta no genera asiento de costo de ventas ni descarga contablemente el inventario

**MÓDULO**: Ventas / Inventario / Contabilidad

**DESCRIPCIÓN**: El asiento de venta solo mueve CxC/Caja, Ventas, ITBIS y retenciones. No hay línea DÉBITO "Costo de Ventas" / CRÉDITO "Inventario". La deducción física de stock está diferida al conduce de entrega, y `deliveryRepository.ts` **no genera ningún asiento** (`grep -n "createJournalEntry\|journalEntr" src/repositories/deliveryRepository.ts src/services/inventoryService.ts` → sin resultados).

**CAUSA RAÍZ**: Falta el enganche contable entre el movimiento de inventario y el mayor.

**ESCENARIO**: Se compran mercancías por RD$1,000,000 (DÉBITO `1.1.06` Inventario) y se venden por RD$1,500,000. El mayor muestra Inventario 1,000,000 (nunca baja) e Ingresos 1,500,000 sin costo asociado. La utilidad bruta reportada es 1,500,000 en lugar de 500,000.

**IMPACTO CONTABLE**: Estado de Resultados sin costo de ventas → utilidad y ISR proyectado groseramente sobrevalorados. Balance con inventario que solo crece.

**IMPACTO EN BD**: `inventory_movements` e `inventory_levels` bajan; `journal_entry_lines` de `1.1.06`/`5.1.01` no reflejan la salida.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: El asiento completo de venta está en `src/services/invoice/invoiceDbBooker.ts:425-431` y no incluye costo ni inventario:
```ts
journalLines = [
  { accountId: paymentAccount.id, debit: totals.totalNet, credit: 0 },
  { accountId: accVentas.id, debit: 0, credit: totals.subtotal - totals.totalDiscount },
];
if (totals.totalTaxes > 0) {
  journalLines.push({ accountId: accItbis.id, debit: 0, credit: totals.totalTaxes });
}
```
Las únicas referencias a costo/inventario en el catálogo están en el lado de compras: `src/services/expenseService.ts:161-162`
```ts
? await getOrCreateAccount(tx, expenseData.companyId, '1.1.06', 'Inventario de Mercancía', 'asset')
: await getOrCreateAccount(tx, expenseData.companyId, '5.1.01', 'Costo de Ventas', 'cost');
```
Nótese además que una compra **sin líneas de inventario** se lleva directamente a `5.1.01` Costo de Ventas, lo que mezcla dos criterios de valoración en el mismo plan.

**SOLUCIÓN RECOMENDADA**: Al aprobar el conduce (o al emitir la factura, según la política que se elija y de forma consistente), generar el asiento DÉBITO `5.1.01` / CRÉDITO `1.1.06` por el costo promedio del producto (`products.cost`, ya disponible: se consulta en `invoiceDbBooker.ts:79`), y su contrasiento en las devoluciones e-34.

**RIESGO DE IMPLEMENTARLA**: Alto. Exige definir el método de costeo, resolver el desfase factura↔conduce y evitar duplicar el costo ya cargado en `5.1.01` por las compras sin líneas.

---

### ARP-15 🟠 ALTO — La Nota de Crédito no valida tope contra el saldo ni el total del documento afectado, y puede emitirse ilimitadamente

**MÓDULO**: Ventas / CxC

**DESCRIPCIÓN**: No existe ninguna comprobación de que el importe de la NC sea ≤ al total (o al saldo) de la factura modificada, ni de que no se hayan emitido ya otras NC sobre el mismo documento. El total original se lee únicamente para incluirlo en el XML de la DGII, no para validar.

**CAUSA RAÍZ**: Validación fiscal delegada por completo a MSeller/DGII; no hay control interno.

**ESCENARIO**: Factura de RD$100,000 ya cobrada. Se emiten tres NC de RD$100,000 cada una. El auxiliar aplica `Math.max(0, ...)` y se queda en 0, pero el mayor DEBITA Ventas 3×84,745 y CREDITA CxC 3×100,000 → CxC del mayor queda con RD$300,000 acreedores contra un auxiliar en 0. Los ingresos del período quedan negativos.

**IMPACTO CONTABLE**: Ingresos e ITBIS por Pagar revertidos varias veces sobre la misma operación; posible saldo acreedor en `1.1.02`.

**IMPACTO EN BD**: N filas en `invoices` con el mismo `modifiedInvoiceId`, sin restricción alguna.

**RIESGO MULTIEMPRESA**: Contenido — el `SELECT` del AR a rebajar sí filtra por empresa y modo (hay comentario explícito al respecto), pero **no filtra por cliente**, igual que ARP-04.

**EVIDENCIA**: Único uso del total original, `src/services/invoice/invoiceSubmissionService.ts:84-104` — se pasa al payload, nunca se compara:
```ts
if (originalInvoice) {
  originalInvoiceTotal = Number(originalInvoice.total);
  originalInvoiceDate = originalInvoice.createdAt;
}
```
Rebaja del AR sin filtro de cliente ni tope real, `src/services/invoice/invoiceDbBooker.ts:482-506`:
```ts
const [existingAr] = await tx.select().from(accountsReceivable)
  .where(and(
    eq(accountsReceivable.invoiceId, data.modifiedInvoiceId),
    eq(accountsReceivable.companyId, data.companyId),
    eq(accountsReceivable.modo, data.modo)
  )).limit(1);
if (existingAr) {
  const newBalance = Math.max(0, parseFloat(existingAr.balance || '0') - totals.totalNet);
  ...
}
```
Nótese también que si `existingAr` no se encuentra (p. ej. la original fue al contado), el `if` no hace nada y el asiento **sí** credita CxC por el total.

**SOLUCIÓN RECOMENDADA**: Antes de emitir una e-34: cargar la factura afectada, calcular `saldoAcreditable = total - Σ NC previas`, rechazar si `totals.total > saldoAcreditable + 0.01`, y validar `originalInvoice.customerId === data.customerId`. Sustituir `Math.max(0, ...)` por un `UPDATE` con guarda.

**RIESGO DE IMPLEMENTARLA**: Bajo-medio. Requiere considerar el caso legítimo de NC sobre facturas al contado (devolución de efectivo).

---

### ARP-16 🟠 ALTO — Las cuentas contables del pago a CxP las elige el cliente sin validar empresa ni naturaleza

**MÓDULO**: CxP / Contabilidad

**DESCRIPCIÓN**: `POST /ap/payments` recibe `debitAccountId` y `creditAccountId` como UUID arbitrarios del cuerpo de la petición. Ni la ruta, ni `ApService`, ni `createJournalEntry` verifican que esas cuentas pertenezcan a la empresa del solicitante, que existan en su catálogo, que sean transaccionales (`isTransactional`) o que tengan la naturaleza adecuada.

**CAUSA RAÍZ**: `chart_of_accounts.id` es un UUID global; el asiento se inserta con el `companyId` de la sesión pero con el `accountId` que llegue.

**ESCENARIO**: Un usuario con permiso `proveedores:write` envía como `creditAccountId` el UUID de una cuenta de **otra empresa** (obtenible si alguna vez tuvo acceso, o por enumeración). Se crea un `journal_entry_line` con `company_id` = empresa A y `account_id` perteneciente a la empresa B. El mayor de A no cuadra con su catálogo; el de B tampoco muestra la línea (se filtra por `company_id`), quedando un movimiento invisible.

**IMPACTO CONTABLE**: Asientos contra cuentas fuera del catálogo propio → balanza de comprobación irreconciliable; posible imputación de un pago a Ingresos o a Patrimonio si se envía una cuenta arbitraria.

**IMPACTO EN BD**: `journal_entry_lines(company_id, account_id)` inconsistente; `ap_payments.debit_account_id/credit_account_id` con referencias cruzadas.

**RIESGO MULTIEMPRESA**: **Alto**. Es la única vía identificada en estas tres fases por la que un `accountId` cruza la frontera del tenant.

**EVIDENCIA**: `src/app/api/v1/ap/payments/route.ts:12-13`
```ts
debitAccountId: z.string().uuid('Debe seleccionar una cuenta de débito válida.'),
creditAccountId: z.string().uuid('Debe seleccionar una cuenta de crédito válida.'),
```
Se propagan sin validar, `src/services/apService.ts:168-186`:
```ts
await AccountRepository.createJournalEntry(tx, {
  companyId: input.companyId,
  ...
  lines: [
    { accountId: input.debitAccountId, debit: input.amount, credit: 0 },
    { accountId: input.creditAccountId, debit: 0, credit: input.amount }
  ]
});
```
Y `createJournalEntry` solo valida cuadre, número de líneas y período (`src/repositories/accountingRepository.ts:283-306`), nunca la pertenencia de la cuenta.

**SOLUCIÓN RECOMENDADA**: Dentro de `createJournalEntry`, verificar con una sola consulta que todos los `accountId` de las líneas existen con `company_id = data.companyId`, `status='active'` e `is_transactional = true`; abortar en caso contrario. Adicionalmente, en CxP forzar que `debitAccountId` sea la cuenta mapeada de CxP en lugar de aceptarla del cliente.

**RIESGO DE IMPLEMENTARLA**: Bajo. Es una validación aditiva; puede romper flujos que hoy dependan de cuentas mal configuradas (deseable que fallen).

---

### ARP-17 🟡 MEDIO — Todos los impuestos se acumulan en "ITBIS por Pagar": no hay ISC, CDT ni propina legal

**MÓDULO**: Ventas / Impuestos

**DESCRIPCIÓN**: El esquema `invoice_taxes.taxType` documenta `ITBIS | ISC | CDT`, pero `InvoiceCalculator` genera **siempre** `taxType: 'ITBIS'` y una única tasa por línea. El asiento acredita todo `totals.totalTaxes` contra `2.1.03` "ITBIS por Pagar". La propina legal (10%) no existe: `invoices` no tiene columna `tip` —aunque `expenses` sí la tiene (`accounting.ts:237`)—.

**CAUSA RAÍZ**: El calculador solo modela un impuesto sobre el valor agregado por tasa.

**ESCENARIO**: Restaurante o negocio con ISC (bebidas alcohólicas, telecomunicaciones). El ISC recaudado se acredita en la cuenta de ITBIS por Pagar. La declaración IT-1 se prepara sobre un saldo contaminado y la propina legal se factura como ingreso propio o simplemente no se puede facturar.

**IMPACTO CONTABLE**: `2.1.03` mezcla dos obligaciones tributarias distintas con vencimientos y formularios distintos; la propina legal (que es un pasivo con el personal, no un ingreso) no se separa.

**IMPACTO EN BD**: `invoice_taxes` con `taxType` uniforme; imposible desagregar a posteriori.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: `src/services/invoice/invoiceCalculator.ts:44-60`
```ts
Object.entries(taxableByRate).forEach(([rateStr, val]) => {
  const taxAmount = roundMoney(val.taxableAmount * val.rate);
  totalTaxes = roundMoney(totalTaxes + taxAmount);
  const taxKey = `ITBIS_${(val.rate * 100).toFixed(0)}%`;
  ...
});
const taxesList = Object.entries(taxSummaryMap).map(([name, val]) => ({
  taxType: 'ITBIS',
  rate: val.rate,
  amount: val.amount,
}));
```
Destino único en el asiento, `src/services/invoice/invoiceDbBooker.ts:392` y `429-431`:
```ts
const accItbis = await this.getOrCreateAccount(tx, data.companyId, '2.1.03', 'ITBIS por Pagar', 'liability');
...
if (totals.totalTaxes > 0) {
  journalLines.push({ accountId: accItbis.id, debit: 0, credit: totals.totalTaxes });
}
```
El esquema que se está desaprovechando: `src/db/schema/invoices.ts:187` (`taxType: varchar('tax_type', { length: 50 }).notNull(), // ITBIS | ISC | CDT`).

**SOLUCIÓN RECOMENDADA**: Añadir `taxType` a la línea de entrada, agrupar `taxSummaryMap` por `(taxType, rate)` y resolver la cuenta de destino por tipo (`itbis_sales`, `isc_sales`, `cdt_sales`) desde `accounting_mappings`. Para la propina legal, añadir columna `tip` a `invoices` y acreditarla contra un pasivo "Propina Legal por Pagar", excluyéndola de la base imponible del ITBIS.

**RIESGO DE IMPLEMENTARLA**: Medio. Toca el payload del e-CF (la DGII exige el desglose por tipo de impuesto) y la generación del 607.

---

### ARP-18 🟡 MEDIO — `accounting_mappings` existe y se ignora: el plan de cuentas real se autogenera hardcodeado

**MÓDULO**: Contabilidad (transversal)

**DESCRIPCIÓN**: La tabla `accounting_mappings` está diseñada para que cada empresa configure sus cuentas y define valores por defecto con una codificación **distinta** de la que usa el código de asiento. Ningún flujo de venta, cobro, compra o pago la consulta.

**CAUSA RAÍZ**: El puente de configuración se construyó pero no se enchufó.

**ESCENARIO**: El contador configura `itbis_sales → 2.1.02.01` en la pantalla de mapeos. Todas las facturas siguen acreditando `2.1.03`, creada automáticamente. La configuración es decorativa y el usuario no tiene forma de saberlo.

**IMPACTO CONTABLE**: Imposibilidad de adaptar el plan de cuentas al catálogo del cliente; cuentas creadas sobre la marcha sin `level`, sin `parentId` y sin `isTransactional` explícito, lo que rompe la jerarquía usada por Balance General e Estado de Resultados.

**IMPACTO EN BD**: `chart_of_accounts` poblada con filas huérfanas (`parent_id = NULL`, `level = 1` por defecto) mezcladas con el catálogo real.

**RIESGO MULTIEMPRESA**: Ninguno adicional, pero cada empresa termina con un catálogo distinto según el orden de sus operaciones (ver ARP-02).

**EVIDENCIA**: Defaults declarados, `src/repositories/accountingRepository.ts` (bloque `defaultMappings`):
```ts
{ key: 'sales_revenue', code: '4.1.01' },
{ key: 'accounts_receivable', code: '1.1.02.01' },
{ key: 'cash', code: '1.1.01.01' },
{ key: 'bank', code: '1.1.01.02' },
{ key: 'itbis_sales', code: '2.1.02.01' },
{ key: 'itbis_purchases', code: '1.1.04.01' },
```
Códigos realmente usados, `src/services/invoice/invoiceDbBooker.ts:389-392`: `1.1.02`, `1.1.01`, `4.1.01`, `2.1.03`. Solo `sales_revenue` coincide. `grep -rn "accountingMappings" src --include=*.ts` no muestra ninguna lectura desde los flujos transaccionales.
Creación sin jerarquía, `src/services/invoice/invoiceDbBooker.ts:589-598`:
```ts
const [newAcc] = await tx.insert(chartOfAccounts).values({
  companyId, code, name, type, status: 'active',
}).returning();
```

**SOLUCIÓN RECOMENDADA**: Función única `resolveAccount(tx, companyId, mappingKey)` que lea `accounting_mappings` y falle explícitamente si falta el mapeo; sembrar el catálogo y los mapeos al crear la empresa (`/setup/confirm`) y eliminar los `getOrCreateAccount`.

**RIESGO DE IMPLEMENTARLA**: Medio-alto (mismo alcance que ARP-02; conviene abordarlos juntos).

---

### ARP-19 🟡 MEDIO — La fecha del asiento de venta es la fecha UTC del servidor, no la del documento

**MÓDULO**: Ventas / Contabilidad

**DESCRIPCIÓN**: El asiento de facturación se fecha con `new Date().toISOString().split('T')[0]`, es decir la fecha **UTC** del momento de la ejecución. República Dominicana es UTC−4.

**CAUSA RAÍZ**: Uso de `toISOString()` en lugar del formateador local que el propio repositorio ya tiene (`formatLocalDate`).

**ESCENARIO**: Venta el 31 de julio a las 20:30 hora dominicana = 1 de agosto 00:30 UTC. La factura queda con `createdAt` del 31 de julio (para el 607) y su asiento con fecha del 1 de agosto. Las ventas del cierre mensual se desplazan al mes siguiente. Si agosto estuviera cerrado y julio abierto, la emisión fallaría con "El periodo contable está cerrado".

**IMPACTO CONTABLE**: Ingresos e ITBIS desplazados de período; el Libro de Ventas (que filtra por `invoices.createdAt`) y el mayor discrepan en las ventas nocturnas de fin de mes.

**IMPACTO EN BD**: `journal_entries.date ≠ DATE(invoices.created_at)` de forma sistemática entre las 20:00 y las 24:00 locales.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: `src/services/invoice/invoiceDbBooker.ts:450-457`
```ts
await AccountRepository.createJournalEntry(tx, {
  companyId: data.companyId,
  modo: data.modo,
  reference: invoice.id,
  date: new Date().toISOString().split('T')[0],
  description: `Facturación Automática e-CF NCF: ${ncf}`,
  lines: journalLines,
});
```
El repositorio ya dispone del helper correcto (`formatLocalDate`, usado en `accountingRepository.ts:299` y `apRepository.ts:9-30`). El mismo patrón UTC aparece en `apService.ts:201` y `apService.ts:322` (`today.toISOString().split('T')[0]`).

**SOLUCIÓN RECOMENDADA**: Usar `formatLocalDate(new Date())` o, mejor, derivar la fecha del asiento de la fecha del documento (`invoice.createdAt`) para garantizar que documento y asiento vivan siempre en el mismo período.

**RIESGO DE IMPLEMENTARLA**: Bajo.

---

### ARP-20 🟡 MEDIO — Listados de recibos sin filtro de `modo`: se mezclan PRUEBA y PRODUCCIÓN

**MÓDULO**: CxC

**DESCRIPCIÓN**: `getReceiptsList` y `getCustomerReceiptsBreakdown` filtran por `companyId` y `deletedAt`, pero no por `modo`. El campo tiene `DEFAULT 'PRODUCCION'`, de modo que la omisión no es visible hasta que se usa el entorno de pruebas.

**CAUSA RAÍZ**: El aislamiento de entorno se aplicó a `getPendingAR` y a `getReceiptDetails` (hay comentarios explícitos de la corrección) pero se olvidó en los listados.

**ESCENARIO**: Un usuario formándose en el entorno PRUEBA registra 40 recibos ficticios. El historial de cobros de la pantalla de producción los muestra mezclados con los reales, y el desglose por cliente suma ambos.

**IMPACTO CONTABLE**: Ninguno en el mayor (los asientos sí están segregados por `modo`), pero el historial operativo de cobros es inutilizable y puede inducir a un cobro duplicado real.

**IMPACTO EN BD**: Ninguno (solo lectura).

**RIESGO MULTIEMPRESA**: Bajo (la empresa sí se filtra); el fallo es de aislamiento de **entorno**, no de tenant.

**EVIDENCIA**: `src/repositories/arRepository.ts:225-229`
```ts
static async getReceiptsList(companyId: string, filters?: { startDate?: string; endDate?: string; search?: string }) {
  const conditions = [
    eq(customerReceipts.companyId, companyId),
    sql`${customerReceipts.deletedAt} IS NULL`
  ];
```
y `src/repositories/arRepository.ts:353-357`:
```ts
.where(and(
  eq(customerReceipts.companyId, companyId),
  eq(customerReceipts.customerId, customerId),
  sql`${customerReceipts.deletedAt} IS NULL`
))
```
Contraste con la corrección ya aplicada en `getPendingAR` (`arRepository.ts:45-50`) y en `getReceiptDetails` (`arRepository.ts:276-281`), ambas con `eq(..., modo)`.

**SOLUCIÓN RECOMENDADA**: Añadir `modo: 'PRODUCCION' | 'PRUEBA'` como parámetro **obligatorio** a ambos métodos (igual que en `getPendingAR`, cuyo comentario justifica exactamente esto) y propagarlo desde `session.modo` en las rutas `/ar/receipts` y `/ar/receipts/by-customer`.

**RIESGO DE IMPLEMENTARLA**: Muy bajo.

---

### ARP-21 🟡 MEDIO — `autoSeedMovements` se invoca sin `modo` en los estados de cuenta

**MÓDULO**: Financiero / `financial_movements`

**DESCRIPCIÓN**: Los estados de cuenta de cliente y de proveedor llaman a `autoSeedMovements(session.companyId)` omitiendo el segundo parámetro, que tiene valor por defecto `'PRODUCCION'`. La ruta del dashboard sí lo pasa correctamente.

**CAUSA RAÍZ**: Parámetro con valor por defecto en lugar de obligatorio.

**ESCENARIO**: Empresa que opera en PRUEBA. Se abre el estado de cuenta de un cliente: el *self-healing* comprueba si existen movimientos de PRODUCCIÓN (sí existen) y no hace nada; la vista se consulta con `modo='PRUEBA'` y sale vacía sin explicación. En una empresa nueva que solo ha operado en PRUEBA, la siembra reconstruiría los movimientos etiquetándolos como PRODUCCIÓN.

**IMPACTO CONTABLE**: Estados de cuenta vacíos o etiquetados en el entorno equivocado.

**IMPACTO EN BD**: Posible inserción masiva en `financial_movements` con `modo='PRODUCCION'` a partir de documentos de PRUEBA.

**RIESGO MULTIEMPRESA**: Bajo; el `companyId` sí se respeta.

**EVIDENCIA**: `src/app/api/v1/financial/statements/customers/[id]/route.ts:48` y `src/app/api/v1/financial/statements/suppliers/[id]/route.ts:48`
```ts
await FinancialMovementService.autoSeedMovements(session.companyId);
```
frente a `src/app/api/v1/financial/dashboard/route.ts:40`:
```ts
await FinancialMovementService.autoSeedMovements(session.companyId, session.modo);
```
Defecto silencioso: `src/services/financialMovementService.ts:143`
```ts
static async autoSeedMovements(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
```

**SOLUCIÓN RECOMENDADA**: Quitar el valor por defecto de `modo` en `autoSeedMovements` y en `rebuildBalances` (misma exposición, línea 95) y pasar `session.modo` en las dos rutas.

**RIESGO DE IMPLEMENTARLA**: Muy bajo.

---

### ARP-22 🟡 MEDIO — Dos rutas divergentes de creación de compra generan CxP con importes distintos

**MÓDULO**: CxP / Compras

**DESCRIPCIÓN**: Coexisten dos implementaciones de "crear compra": `POST /api/v1/expenses` (la que usa la aplicación) y `expenseService.createExpense`, invocada por `POST /api/v1/reports/606`. La primera crea `accounts_payable` por el **neto con impuestos**; la segunda por el **subtotal sin ITBIS**, mientras su propio asiento acredita CxP por el neto.

**CAUSA RAÍZ**: Código duplicado y divergido; la ruta del 606 quedó apuntando a la versión antigua.

**ESCENARIO**: Compra a crédito de RD$100,000 + RD$18,000 de ITBIS registrada por `/reports/606`. Se crea una CxP de RD$100,000 y un asiento que CREDITA `2.1.01` por RD$118,000. Auxiliar y mayor nacen descuadrados en RD$18,000 en el mismo instante.

**IMPACTO CONTABLE**: `Σ accounts_payable.balance ≠ saldo de 2.1.01` por el ITBIS de cada compra registrada por esa vía.

**IMPACTO EN BD**: `accounts_payable.amount` con dos semánticas distintas conviviendo en la misma tabla, lo que invalida cualquier verificación de cuadre.

**RIESGO MULTIEMPRESA**: Ninguno adicional.

**EVIDENCIA**: Ruta correcta, `src/app/api/v1/expenses/route.ts:259-266`
```ts
const apBalanceVal = (parseFloat(amount) + parseFloat(itbis || 0) + parseFloat(otherTaxes || 0) - parseFloat(itbisRetained || 0) - parseFloat(isrRetained || 0));
await tx.insert(accountsPayable).values({
  ...
  amount: apBalanceVal.toString(), // Store the total original debt amount (with taxes)
  balance: apBalanceVal.toString(),
```
Ruta divergente, `src/services/expenseService.ts:100-101`:
```ts
amount: expenseData.amount.toString(),
balance: isCredit ? expenseData.amount.toString() : '0.00',
```
mientras su asiento (mismo archivo, líneas 152-186) acredita `netAmount = subtotal + itbis + otherTaxes - isrRet - itbisRet`.
Punto de entrada activo: `src/app/api/v1/reports/606/route.ts:64` (`const expense = await createExpense(body);`).

**SOLUCIÓN RECOMENDADA**: Eliminar `expenseService.createExpense` y hacer que `/reports/606` reutilice la lógica de `/expenses` (extraída a un servicio compartido). Añadir un test de cuadre auxiliar↔mayor de CxP.

**RIESGO DE IMPLEMENTARLA**: Bajo-medio.

---

### ARP-23 🟡 MEDIO — `financial_movements` no cubre todos los flujos y su `time` es la hora del servidor, no la del documento

**MÓDULO**: Financiero / estado de cuenta

**DESCRIPCIÓN**: `financial_movements` **sí** es un libro auxiliar paralelo (estado de cuenta de cliente/proveedor). El saldo corrido se recalcula íntegramente en cada inserción con una función de ventana ordenada por `date, time, created_at`, de modo que **una inserción retroactiva se reordena correctamente** (esto está bien resuelto). Los problemas son de cobertura y de ordenación intradía:

- **Cubierto**: emisión de factura (`invoiceDbBooker.ts:329`), cobro inmediato al contado (`:352`), recibo de cobro (`arRepository.ts:100`), compra (`expenseService.ts:109,127`), pago a CxP (`apService.ts:144`), aplicación de cheque en garantía (`apService.ts:235,388`).
- **No cubierto**: nada más. No hay movimientos para anulaciones (el tipo `'void'` está declarado y jamás se escribe), ni para retenciones separadas (`'retention'`), ni para anticipos (`'advance'`), ni para compras registradas por la ruta del 606 con `supplierId` nulo, ni para facturas sin `customerId` (consumidor final e-32, condicionado en `invoiceDbBooker.ts:322`).
- **`time`** se toma del reloj del servidor en el instante del `INSERT`, no del documento: un movimiento retroactivo al 15 de julio recibe la hora de hoy y se ordena dentro del 15 de julio por un criterio arbitrario. `status='voided'` nunca se escribe, así que ningún movimiento sale jamás del saldo corrido.

**CAUSA RAÍZ**: Cobertura implementada módulo a módulo sin un punto de entrada único; falta el enganche de anulaciones (que además no existen — ARP-01, ARP-12).

**ESCENARIO**: Se anula un conduce o se corrige una operación: el estado de cuenta del cliente que se le entrega impreso sigue mostrando el documento. Con ARP-01 y ARP-12 pendientes, `financial_movements` es *append-only* de facto.

**IMPACTO CONTABLE**: El estado de cuenta que se entrega al cliente/proveedor diverge del mayor en toda operación anulada o corregida.

**IMPACTO EN BD**: Coste creciente: `rebuildBalances` reescribe **todas** las filas del cliente en cada nuevo movimiento (O(n) `UPDATE` por inserción). Un cliente con 10,000 movimientos hace que cada nueva factura actualice 10,000 filas dentro de la transacción de emisión.

**RIESGO MULTIEMPRESA**: Ninguno adicional; el recálculo filtra `company_id`, `entity_type`, `modo` y entidad correctamente.

**EVIDENCIA**: Recálculo correcto ante fechas retroactivas, `src/services/financialMovementService.ts:113-136`
```sql
WITH ordered AS (
  SELECT id,
    SUM(CAST(debit AS NUMERIC) - CAST(credit AS NUMERIC))
      OVER (ORDER BY date ASC, time ASC, created_at ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
  FROM financial_movements
  WHERE company_id = $1 AND entity_type = $2 AND modo = $3 AND ... AND status = 'active'
)
UPDATE financial_movements AS fm SET balance = ROUND(ordered.running_balance, 2), ...
```
Hora del servidor, no del documento, `src/services/financialMovementService.ts:43-49`:
```ts
const now = new Date();
const timeStr = [
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
  String(now.getSeconds()).padStart(2, '0'),
].join(':');
```
`movementType: 'void'` declarado en `src/services/financialMovementService.ts:18` y en `src/db/schema/accounting.ts:305`, sin ninguna escritura.

**SOLUCIÓN RECOMENDADA**: (1) Encapsular toda escritura de `financial_movements` en los mismos servicios que generan el asiento, de forma que sea imposible asentar sin registrar el movimiento. (2) Registrar `movementType='void'` (o `status='voided'`) en los endpoints de anulación cuando se implementen. (3) Sustituir el recálculo total por un recálculo incremental limitado a `date >= fecha_del_nuevo_movimiento`, o materializar el saldo solo en la lectura.

**RIESGO DE IMPLEMENTARLA**: Medio.

---

### ARP-24 🟢 BAJO — Los descuentos reducen el ingreso directamente; no hay cuenta de "Descuentos sobre ventas"

**MÓDULO**: Ventas / Contabilidad

**DESCRIPCIÓN**: El descuento se resta de la base antes de acreditar Ingresos: se acredita `4.1.01` por `subtotal - totalDiscount`. El descuento se conserva como dato (`invoices.discount`, `invoice_lines.discount`) pero no tiene reflejo contable propio. Es un tratamiento **aceptable** (ingreso neto) y consistente entre venta y Nota de Crédito, pero impide medir la política de descuentos desde el mayor.

**CAUSA RAÍZ**: Decisión de diseño no documentada.

**ESCENARIO**: La gerencia quiere conocer el importe de descuentos concedidos en el trimestre. El Estado de Resultados no lo muestra; hay que consultar `invoices.discount` fuera de la contabilidad.

**IMPACTO CONTABLE**: Ninguno en el resultado (la utilidad es correcta); solo pérdida de detalle analítico.

**IMPACTO EN BD**: Ninguno.

**RIESGO MULTIEMPRESA**: Ninguno.

**EVIDENCIA**: `src/services/invoice/invoiceDbBooker.ts:425-428`
```ts
journalLines = [
  { accountId: paymentAccount.id, debit: totals.totalNet, credit: 0 },
  { accountId: accVentas.id, debit: 0, credit: totals.subtotal - totals.totalDiscount },
];
```
Base de cálculo, `src/services/invoice/invoiceCalculator.ts:20-23` y `:55`:
```ts
const lineTaxableAmount = roundMoney(lineSubtotal - lineDiscount);
...
const total = roundMoney(subtotal - totalDiscount + totalTaxes);
```
(El ITBIS se calcula sobre la base neta de descuento, lo cual es correcto según la normativa dominicana.)

**SOLUCIÓN RECOMENDADA**: Si se desea trazabilidad, acreditar `4.1.01` por `subtotal` y debitar una cuenta contra-ingreso `4.1.99 "Descuentos sobre ventas"` por `totalDiscount`. Es opcional; el tratamiento actual no produce error.

**RIESGO DE IMPLEMENTARLA**: Bajo, pero cambia la presentación del Estado de Resultados y debe consensuarse con el contador.

---

## NO VERIFICADO

Lo siguiente **no** pude comprobarlo y no debe darse por correcto ni por incorrecto a partir de este informe:

1. **Datos reales en la base de datos.** No ejecuté ninguna consulta contra Postgres. La magnitud efectiva de los descuadres (ARP-02, ARP-05, ARP-13, ARP-22) es desconocida; podría ser cero si esos caminos nunca se han usado en producción.
2. **Estado del catálogo de cuentas en las empresas existentes.** No verifiqué si el código `1.1.02` ya está duplicado semánticamente en alguna empresa real (ARP-02), ni si `accounting_mappings` está poblada.
3. **Existencia de RLS a nivel de Postgres.** Vi el helper `withTenantMode` en las rutas, pero no revisé las políticas `ROW LEVEL SECURITY` en `drizzle/`; si existieran, algunos riesgos multiempresa (ARP-04, ARP-16) podrían estar mitigados en la capa de BD.
4. **Restricciones `CHECK` y constraints en las migraciones.** No leí el directorio `drizzle/`; las afirmaciones sobre ausencia de `CHECK (balance >= 0)` y de FK compuestas se basan solo en el esquema Drizzle de `src/db/schema/`.
5. **Nivel de aislamiento transaccional configurado.** El análisis de race conditions (ARP-06, ARP-07, ARP-13) asume `READ COMMITTED` (el defecto de Postgres). No verifiqué la configuración de la conexión en `src/db/index.ts` ni si se usa `SERIALIZABLE`.
6. **La capa de UI.** No revisé los componentes del frontend. Es posible que la interfaz impida enviar combinaciones peligrosas (NC sin `modifiedInvoiceId`, cobro cruzado de cliente, cuentas contables arbitrarias), pero **todos los endpoints auditados son invocables directamente** con la sesión del usuario, por lo que las validaciones de UI no constituyen control.
7. **Reportes 606/607 y su cuadre con el mayor.** Solo los inspeccioné de pasada para verificar el filtro `ne(invoices.status, 'void')`; no audité su lógica de totales.
8. **Módulo de caja completo (Fase 5/6).** Revisé únicamente los puntos de contacto con ventas y cobros. El cierre de sesión de caja, el arqueo y el tratamiento del sobrante/faltante quedan fuera de este informe.
9. **Cobertura de tests.** Existe `src/tests/aislamientoModo.vitest.ts`, que no ejecuté ni analicé; podría cubrir parte de los riesgos de entorno señalados en ARP-20 y ARP-21.
10. **Comportamiento de `conciliaciones bancarias`** (`/bank/reconciliations`) frente a la ausencia de `bank_transactions` descrita en ARP-08.
