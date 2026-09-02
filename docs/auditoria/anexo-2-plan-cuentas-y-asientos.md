# AUDITORÍA FASES 3 y 4 — PLAN DE CUENTAS Y MOTOR DE ASIENTOS
**ERP contfast_v.2** · Rama analizada en `$HOME/mnt/contfast_v.2` · Sólo lectura

---

## CÓMO FUNCIONA REALMENTE EL MOTOR CONTABLE (10 líneas, arquitectura observada)

1. **No hay un motor único.** Existe una función central `AccountingRepository.createJournalEntry` (`src/repositories/accountingRepository.ts:272`) reexportada como `AccountRepository` (`src/repositories/accountRepository.ts:6`), y **dos módulos que insertan líneas por su cuenta saltándosela**: `arRepository.ts:199` (recibos de cobro) y `bankRepository.ts:260` (movimientos de banco).
2. La función central valida, en este orden: cuadre con tolerancia `> 0.01`, `totalDebits !== 0`, `lines.length >= 2`, y período abierto (`accountingRepository.ts:284-306`). Luego inserta cabecera y líneas.
3. Si recibe un `tx` lo usa; si no, abre su propio `db.transaction` (`accountingRepository.ts:339-345`). Los 6 llamadores reales le pasan el `tx` del documento origen → **la atomicidad documento↔asiento sí existe en factura, compra, pago CxP y banco**.
4. **Las cuentas NO se resuelven por `accounting_mappings`.** Cada módulo tiene su propia copia de una función `getOrCreateAccount(tx, companyId, code, name, type)` que busca la cuenta **por código literal hardcodeado** y, si no existe, **la crea al vuelo**. Hay **5 copias** de esa función (`bank/accounts/[id]/transactions/route.ts:20`, `expenses/route.ts:11`, `expenses/[id]/route.ts:11`, `expenseService.ts:11`, `invoiceDbBooker.ts:575`, más una privada en `arRepository.ts:369`).
5. Los códigos hardcodeados en los módulos corresponden al catálogo de `scripts/seed-chart-of-accounts.js`, **pero el catálogo que la aplicación siembra en runtime es otro distinto** (`accountingRepository.seedDefaultChartOfAccounts:492`). Los códigos colisionan con cuentas de significado diferente.
6. `accounting_mappings` sólo se lee y escribe desde la pantalla de configuración (`/api/v1/accounting/mappings`, `dashboard/settings/page.tsx`). **Ningún asiento la consulta jamás.** Es configuración decorativa.
7. `journal_entries` no tiene número correlativo, no tiene `createdBy`, no tiene índice único sobre `(companyId, reference)`, y su `status` se escribe siempre `'posted'` (nunca `'draft'`).
8. **No existe reversión ni contrasiento.** Editar o borrar un gasto ejecuta `DELETE` físico de las líneas y de la cabecera del asiento (`expenses/[id]/route.ts:362-372` y `:637-644`).
9. El control de períodos es real pero se autoanula: si la empresa no tiene ningún período, `isPeriodOpen` **crea uno abierto sobre la marcha y devuelve `true`** (`accountingRepository.ts:236-257`).
10. Los reportes están divididos en dos familias con filtros distintos: `/api/v1/reports/balance-sheet` e `income-statement` filtran `status='posted'` + `deletedAt` + `modo`; la balanza y el mayor de `accountingRepository` (`getTrialBalance`, `getLedger`) **no filtran `status`**. El balance general nunca incluye el resultado del ejercicio.

---

# HALLAZGOS

---

## JRN-01 🔴 CRÍTICO — El catálogo que siembra la app y los códigos que usan los asientos son catálogos DISTINTOS: los asientos caen en cuentas equivocadas

**MÓDULO:** Plan de cuentas / todos los módulos de posting

**DESCRIPCIÓN:** Existen dos planes de cuentas incompatibles. El que se siembra al crear la empresa (`accountingRepository.seedDefaultChartOfAccounts`) usa una numeración de 4 niveles; el que asumen todos los módulos de posting (hardcodeado en cinco copias de `getOrCreateAccount`) es el de `scripts/seed-chart-of-accounts.js`, de 3 niveles. Como `getOrCreateAccount` busca **por código y devuelve lo que encuentre**, los asientos caen en cuentas cuyo nombre y significado no tienen nada que ver.

**CAUSA RAÍZ:** Resolución de cuentas por código literal en vez de por `accounting_mappings`, con dos seeds divergentes en el repositorio.

**EVIDENCIA:**

Catálogo sembrado en runtime (`src/repositories/accountingRepository.ts:502-508`):
```
{ code: '1.1.02', name: 'Cuentas por Cobrar',        isTransactional: false },
{ code: '1.1.03', name: 'Inventarios',               isTransactional: false },
{ code: '1.1.04', name: 'Impuestos Anticipados',     isTransactional: false },
```

Códigos que usa el facturador (`src/services/invoice/invoiceDbBooker.ts:389-392, 413-419`):
```ts
const accCxC   = await this.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
const accCaja  = await this.getOrCreateAccount(tx, data.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');
const accVentas= await this.getOrCreateAccount(tx, data.companyId, '4.1.01', 'Ingresos por Ventas', 'revenue');
const accItbis = await this.getOrCreateAccount(tx, data.companyId, '2.1.03', 'ITBIS por Pagar', 'liability');
...
const accIsr      = await this.getOrCreateAccount(tx, data.companyId, '1.1.03', 'Anticipo de Impuestos - Retención ISR', 'asset');
const accItbisRet = await this.getOrCreateAccount(tx, data.companyId, '1.1.04', 'Anticipo de Impuestos - Retención ITBIS', 'asset');
```

Y el peor caso, en compras (`src/app/api/v1/expenses/route.ts:304-305`, idéntico en `expenses/[id]/route.ts:903-904`):
```ts
const accAp   = await getOrCreateAccount(tx, session.companyId, '2.1.01', 'Cuentas por Pagar', 'liability');
const accBank = await getOrCreateAccount(tx, session.companyId, '1.1.02', 'Efectivo en Bancos', 'asset');
```
Ese `accBank` se guarda como `creditAccountId` del pago (`expenses/route.ts:316`) y luego se usa tal cual en el asiento del cheque en garantía (`src/services/apService.ts:445-453`).

**ESCENARIO:** Empresa creada por la app (seed de runtime). (a) Se factura con retención de ISR → el crédito fiscal por retención se debita en **1.1.03 «Inventarios»**. (b) Se registra una compra a crédito con cheque en garantía → al vencer, el asiento **acredita 1.1.02 «Cuentas por Cobrar»** en lugar de Banco. (c) `2.1.03` no existe en el seed de runtime → se crea al vuelo (ver JRN-02).

**IMPACTO CONTABLE:** Inventario inflado por retenciones de ISR; Cuentas por Cobrar con saldo acreedor artificial por pagos a proveedores; ITBIS por Pagar en una cuenta creada al vuelo. Balance general y 606/607 irreconciliables con los auxiliares.

**IMPACTO EN BD:** `journal_entry_lines.account_id` apunta a cuentas correctas por FK pero incorrectas por semántica. No hay forma de distinguir a posteriori qué línea fue mal ruteada sin reprocesar cada documento.

**RIESGO MULTIEMPRESA:** Cada empresa acumula un catálogo distinto según qué módulos haya usado primero; comparar dos empresas es imposible y una consolidación es inviable.

**SOLUCIÓN RECOMENDADA:** Eliminar las 6 copias de `getOrCreateAccount`. Sustituirlas por un único resolvedor `resolveAccount(tx, companyId, mappingKey)` que lea `accounting_mappings` y **lance error** si falta el mapeo. Borrar `scripts/seed-chart-of-accounts.js` o alinearlo con el seed de runtime.

**RIESGO DE IMPLEMENTARLA:** ALTO. Los asientos históricos ya escritos quedan apuntando a las cuentas viejas; hace falta un script de remapeo y reclasificación, y validar que cada empresa tenga los 9 mappings sembrados antes del despliegue.

---

## JRN-02 🔴 CRÍTICO — `getOrCreateAccount` crea cuentas con `nature`, `level` e `isTransactional` por defecto, invirtiendo signos en los reportes

**MÓDULO:** Plan de cuentas / banco / compras / facturación

**DESCRIPCIÓN:** Las cinco copias de `getOrCreateAccount` insertan en `chart_of_accounts` **sólo** `companyId, code, name, type, status`. Se aplican los defaults del schema: `nature='debit'`, `level=1`, `isTransactional=true`, `parentId=null`. Una cuenta de pasivo o de ingreso creada así queda con naturaleza deudora.

**CAUSA RAÍZ:** Inserción parcial que ignora columnas contablemente significativas.

**EVIDENCIA:**

`src/services/expenseService.ts:19-28` (idéntico en las otras cuatro copias):
```ts
const [newAcc] = await tx
  .insert(chartOfAccounts)
  .values({
    companyId,
    code,
    name,
    type,
    status: 'active',
  })
  .returning();
```

Defaults aplicados (`src/db/schema/accounting.ts:18-20`):
```ts
nature: varchar('nature', { length: 20 }).default('debit').notNull(),
level: integer('level').default(1).notNull(),
isTransactional: boolean('is_transactional').default(true).notNull(),
```

Consumidor que depende de `nature` (`src/repositories/accountingRepository.ts:766-771`):
```ts
const begBal = acc.nature === 'debit' ? (prevDeb - prevCred) : (prevCred - prevDeb);
...
const endBal = acc.nature === 'debit' ? (begBal + deb - cred) : (begBal + cred - deb);
```

Consumidor que depende de `level` (`src/repositories/accountingRepository.ts:806-809`):
```ts
const calculateHierarchyTotal = (type: string) => {
  return trialBalance.filter(row => row.type === type && row.level === 1)
    .reduce((sum, row) => sum + row.endingBalance, 0);
};
```

Cuentas creadas así en producción: `2.1.03` ITBIS por Pagar, `2.1.04` ISR Retenido, `2.1.05` ITBIS Retenido, `1.1.06`, `1.1.08`, `5.1.02`, y en banco `4.1.99 'Otros Ingresos (Por Conciliar)'` / `6.1.99` (`bank/accounts/[id]/transactions/route.ts:215-217`).

**ESCENARIO:** Se emite la primera factura con ITBIS. Se crea `2.1.03` con `nature='debit'`, `level=1`. En la balanza de comprobación (`/api/v1/accounting/reports/trial-balance`) el ITBIS por Pagar sale con **saldo negativo**. En `getFinancials`, al ser `level=1`, esa cuenta **se suma al total de Pasivos junto con la raíz «2 Pasivos»**, mientras que las cuentas legítimas de nivel 3-4 no se suman en absoluto.

**IMPACTO CONTABLE:** Balanza de comprobación con signos invertidos; `/api/v1/accounting/reports/financials` devuelve totales que no corresponden a ninguna suma real (sólo agrega el ruido de nivel 1). El ITBIS declarado a DGII no coincide con el mayor.

**IMPACTO EN BD:** Filas en `chart_of_accounts` estructuralmente inconsistentes (`type='liability'` con `nature='debit'`, `level=1` con código de 3 segmentos, `parentId=NULL` rompiendo el árbol).

**RIESGO MULTIEMPRESA:** El catálogo diverge por empresa según el orden de uso de los módulos.

**SOLUCIÓN RECOMENDADA:** Prohibir la creación de cuentas fuera de `AccountingRepository.createAccount` (que sí deriva `level` y `nature`, líneas 140-149). Añadir un script de saneamiento que recalcule `nature`, `level` y `parentId` desde el código para todas las cuentas existentes.

**RIESGO DE IMPLEMENTARLA:** MEDIO-ALTO. Corregir `nature` invierte el signo mostrado de saldos históricos: hay que hacerlo con un corte y comunicarlo.

---

## JRN-03 🔴 CRÍTICO — `accounting_mappings` no la lee ningún asiento: la configuración contable del usuario no tiene efecto

**MÓDULO:** Configuración contable

**DESCRIPCIÓN:** La tabla existe, tiene índice único por `(companyId, mappingKey)`, se siembra, se expone por API y se edita desde `/dashboard/settings`. **Ningún camino de generación de asientos la consulta.** Cambiar la cuenta de "Ingresos por Ventas" en la configuración no cambia nada.

**CAUSA RAÍZ:** El puente de mapeos se construyó pero nunca se cableó al posting.

**EVIDENCIA:** Barrido completo de referencias a `accountingMappings` / `getMappings` / `mappingKey` en `src/`:
```
src/app/api/v1/accounting/mappings/route.ts:32     ← lectura para la UI
src/app/dashboard/settings/page.tsx:234, 293       ← UI
src/db/schema/accounting.ts:285-293                ← definición
src/repositories/accountingRepository.ts:399-487   ← get/update
src/repositories/accountingRepository.ts:588-609   ← seed
```
Ningún archivo de `src/services/` ni de posting aparece. En su lugar (`src/services/invoice/invoiceDbBooker.ts:391`):
```ts
const accVentas = await this.getOrCreateAccount(tx, data.companyId, '4.1.01', 'Ingresos por Ventas', 'revenue');
```

**mappingKeys que el código declara** (`accountingRepository.ts:414-424` y `:588-598`, listas duplicadas idénticas):
`sales_revenue` (4.1.01), `accounts_receivable` (1.1.02.01), `cash` (1.1.01.01), `bank` (1.1.01.02), `itbis_sales` (2.1.02.01), `itbis_purchases` (1.1.04.01), `cost_of_goods_sold` (5.1.01), `inventory` (1.1.03.01), `supplier_payable` (2.1.01.01).
**Ninguna de las nueve se usa jamás.** Además `cost_of_goods_sold` e `inventory` no tienen consumidor de ningún tipo (ver JRN-07).

**ESCENARIO:** El contador configura "Ventas → 4.1.02 Ventas de Servicios". Guarda. Factura. El asiento sigue yendo a 4.1.01. No hay ningún mensaje ni indicio del problema.

**IMPACTO CONTABLE:** El plan de cuentas es inconfigurable de facto. Cualquier empresa con catálogo propio queda mal contabilizada.

**IMPACTO EN BD:** `accounting_mappings` acumula filas huérfanas que nadie lee.

**RIESGO MULTIEMPRESA:** Una empresa con catálogo personalizado no puede usar el sistema; los asientos irán a códigos genéricos o los creará al vuelo (JRN-02).

**SOLUCIÓN RECOMENDADA:** Implementar el resolvedor descrito en JRN-01 sobre `accounting_mappings` y extender el juego de claves a: `isr_retained_payable`, `itbis_retained_payable`, `isr_advance`, `itbis_advance`, `other_retentions`, `other_taxes`, `bank_unreconciled_income`, `bank_unreconciled_expense`.

**RIESGO DE IMPLEMENTARLA:** MEDIO. Requiere garantizar el seed completo de mappings para toda empresa existente antes de activar el `throw` por mapeo faltante.

---

## JRN-04 🔴 CRÍTICO — Asientos omitidos en silencio: `if (netAmount > 0)` y `if (bankChartAccount)`

**MÓDULO:** Compras / Banco

**DESCRIPCIÓN:** Dos caminos condicionan la creación del asiento a un `if` que, cuando falla, **retorna éxito sin registrar nada en contabilidad**.

**CAUSA RAÍZ:** Ausencia de rama `else` con error; la falta de asiento se trata como caso normal.

**EVIDENCIA (a) — compras** (`src/app/api/v1/expenses/route.ts:331-333`; idéntico en `expenses/[id]/route.ts` y `expenseService.ts:153-155`):
```ts
const netAmount = subtotalVal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;

if (netAmount > 0) {
  ...
  await AccountRepository.createJournalEntry(tx, { ... });
}
return { id: newExpenseId };     // ← se devuelve 200 aunque no haya asiento
```

**EVIDENCIA (b) — banco** (`src/repositories/bankRepository.ts:222-262`):
```ts
// 4. Create Journal Entry if contra account is provided
if (data.contraAccountId) {
  const assetAccounts = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, data.companyId), eq(chartOfAccounts.type, 'asset')));
  let bankChartAccount = assetAccounts.find(a => a.name.toLowerCase().includes('banco'))?.id;

  if (bankChartAccount) {
    ...
    await tx.insert(journalEntryLines).values([bankAccountLine, contraAccountLine]);
  }
}
return transaction;   // ← el saldo bancario YA se movió en la línea 217
```
Nótese además que la cuenta de banco se elige por **coincidencia de texto en el nombre** (`.includes('banco')`) y toma la primera que aparezca: en el seed de runtime hay `1.1.01.02 Banco Popular` y `1.1.01.03 Banco de Reservas`; siempre gana la del `find`, sea cual sea la cuenta bancaria real del movimiento.

**ESCENARIO (a):** Compra de RD$0 por ajuste, o compra íntegramente retenida (`amount=1000, isrRetained=1000`) → gasto y CxP creados, **cero asiento**. **(b):** Movimiento bancario registrado por `POST /api/v1/bank/transactions` sin `contraAccountId` → el saldo de `bank_account_balances` baja pero el mayor de Banco no se mueve.

**IMPACTO CONTABLE:** Descuadre permanente entre auxiliares (CxP, saldo bancario) y el mayor, sin traza de por qué. La conciliación bancaria nunca cuadrará.

**IMPACTO EN BD:** Documento origen persistido, sin fila alguna en `journal_entries` con ese `reference`.

**RIESGO MULTIEMPRESA:** El `find` por nombre puede seleccionar una cuenta de banco distinta a la del movimiento dentro de la misma empresa (no cruza empresas: el `where` filtra `companyId`).

**SOLUCIÓN RECOMENDADA:** Convertir ambos `if` en validaciones duras: si no se puede determinar la contrapartida, `throw` y abortar la transacción completa. La cuenta contable del banco debe salir de `bank_accounts` (columna de enlace al catálogo), no de un `includes('banco')`.

**RIESGO DE IMPLEMENTARLA:** MEDIO. Movimientos que hoy pasan empezarán a fallar; hay que sembrar el enlace cuenta bancaria ↔ cuenta contable antes.

---

## JRN-05 🔴 CRÍTICO — Dos módulos insertan `journal_entry_lines` saltándose la validación central (sin cuadre, sin período, sin control alguno)

**MÓDULO:** Cobros a clientes (AR) / Banco

**DESCRIPCIÓN:** `createJournalEntry` es la única función que valida. Dos rutas productivas insertan cabecera y líneas directamente, sin pasar por ella.

**CAUSA RAÍZ:** Duplicación de la lógica de posting en repositorios.

**EVIDENCIA (a) — Recibos de cobro** (`src/repositories/arRepository.ts:185-218`):
```ts
const accCaja = await ArRepository.getOrCreateAccount(tx, data.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');
const accCxC  = await ArRepository.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');

const entryId = uuidv4();
await tx.insert(journalEntries).values({
  id: entryId, companyId: data.companyId, modo: data.modo,
  date: data.date, reference: receiptId.slice(0, 8),
  description: `Recibo de Cobro - Cliente ID: ${data.customerId.slice(0,8)}`,
  status: 'posted'
});

await tx.insert(journalEntryLines).values([
  { id: uuidv4(), companyId: data.companyId, modo: data.modo, journalEntryId: entryId,
    accountId: accCaja.id, debit: data.amount.toString(), credit: '0.00' },
  { id: uuidv4(), companyId: data.companyId, modo: data.modo, journalEntryId: entryId,
    accountId: accCxC.id,  debit: '0.00', credit: data.amount.toString() }
]);
```

**EVIDENCIA (b) — Movimientos bancarios** (`src/repositories/bankRepository.ts:230-260`), citado en JRN-04.

**Controles que ambos se saltan:** validación de cuadre débito/crédito, mínimo de 2 líneas, importe distinto de cero, y **verificación de período abierto** (`accountingRepository.ts:301-306`).

Detalle adicional en (b): los importes se derivan de `isIncoming`/`isOutgoing` (`bankRepository.ts:191-192`). Si `data.type` cayera fuera de ambos conjuntos, **las dos líneas quedan con debit=0 y credit=0** y se insertan igual — no hay validación que lo impida.

**ESCENARIO:** Se cierra el período de junio. Se registra un recibo de cobro con fecha 15/junio → **entra igualmente**, porque `registerReceipt` nunca consulta `accounting_periods`.

**IMPACTO CONTABLE:** Se pueden inyectar asientos en períodos cerrados por dos vías. La declaración ya presentada a DGII deja de corresponder al mayor.

**IMPACTO EN BD:** `journal_entries` con `reference` truncado a 8 caracteres (`receiptId.slice(0, 8)`), lo que además imposibilita rastrear el recibo origen de forma fiable.

**RIESGO MULTIEMPRESA:** Bajo en aislamiento (el `companyId` se propaga), alto en integridad.

**SOLUCIÓN RECOMENDADA:** Reescribir ambos bloques como llamadas a `AccountRepository.createJournalEntry(tx, {...})`, pasando `reference: receiptId` completo.

**RIESGO DE IMPLEMENTARLA:** BAJO. Cambio mecánico; el único efecto visible es que empezarán a fallar los cobros sobre períodos cerrados, que es el comportamiento correcto.

---

## JRN-06 🔴 CRÍTICO — No hay idempotencia: reintentos y doble clic generan asientos duplicados

**MÓDULO:** Transversal

**DESCRIPCIÓN:** `journal_entries.reference` guarda el id del documento origen, pero **no hay índice único sobre `(company_id, reference)`** ni ninguna comprobación previa de "ya existe asiento para este documento". Tampoco hay número de asiento correlativo.

**CAUSA RAÍZ:** Ausencia de clave de idempotencia en el diseño de la tabla y en el flujo.

**EVIDENCIA:** Definición completa de la tabla y sus índices (`src/db/schema/accounting.ts:31-47`):
```ts
export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  reference: varchar('reference', { length: 255 }),
  date: date('date').notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('posted').notNull(),
  ...
}, (table) => ({
  companyIdx: index('journal_entries_company_idx').on(table.companyId),
  dateIdx: index('journal_entries_date_idx').on(table.date),
  companyStatusDateIdx: index('journal_entries_comp_status_date_idx').on(table.companyId, table.status, table.date),
  companyModoIdx: index('journal_entries_company_modo_idx').on(table.companyId, table.modo),
}));
```
Los cuatro son índices **no únicos**. No existe columna de número de asiento. El único `UNIQUE` que toca la tabla es `journal_entries_id_company_uq (id, company_id)` (`drizzle/0032_aislamiento_estructural.sql:61`), añadido sólo para soportar la FK compuesta.

En `createJournalEntry` (`accountingRepository.ts:272-346`) no hay ningún `SELECT` previo sobre `reference` ni `onConflictDoNothing`.

**ESCENARIO:** El usuario pulsa dos veces "Registrar pago" en `/api/v1/ap/payments`, o un timeout de red provoca un reintento del cliente. Se crean **dos `ap_payments` y dos asientos idénticos**. El único caso protegido por accidente es la factura, porque `allocateNextNcf` (`invoiceDbBooker.ts:226`) reserva NCF de forma atómica y falla el segundo intento.

**IMPACTO CONTABLE:** Duplicación de gastos, pagos y movimientos bancarios en el mayor. Balanza inflada; 606/607 con registros repetidos ante DGII.

**IMPACTO EN BD:** Dos filas en `journal_entries` con el mismo `reference` y ninguna forma automática de decidir cuál borrar.

**RIESGO MULTIEMPRESA:** Ninguno adicional.

**SOLUCIÓN RECOMENDADA:** (1) Añadir columna `entry_number` con secuencia por `(company_id, modo, año)`, generada atómicamente como ya se hace en `siguienteCodigoFactura` (`invoiceDbBooker.ts:234`). (2) Añadir `CREATE UNIQUE INDEX ... ON journal_entries (company_id, modo, reference) WHERE reference IS NOT NULL AND deleted_at IS NULL`. (3) Antes de crear, comprobar existencia y devolver el asiento existente.

**RIESGO DE IMPLEMENTARLA:** MEDIO. El índice único fallará si ya hay duplicados históricos; hay que limpiarlos primero. Además `arRepository.ts:194` guarda `reference` truncado a 8 caracteres, lo que puede colisionar entre recibos distintos — corregir antes de aplicar el índice.

---

## JRN-07 🔴 CRÍTICO — No existe asiento de costo de ventas: el inventario nunca sale del balance

**MÓDULO:** Inventario / Facturación

**DESCRIPCIÓN:** La venta genera asiento de ingreso, ITBIS y cobro, pero **no genera contrapartida de costo** (Debe Costo de Ventas / Haber Inventario). Los mappings `cost_of_goods_sold` e `inventory` existen y no tienen consumidor.

**CAUSA RAÍZ:** El descargo de stock (`deductStock`) y el posting contable viven en flujos separados que nunca se conectaron.

**EVIDENCIA:** El asiento de la factura sólo tiene ventas, ITBIS, cobro y retenciones (`src/services/invoice/invoiceDbBooker.ts:425-431`):
```ts
journalLines = [
  { accountId: paymentAccount.id, debit: totals.totalNet, credit: 0 },
  { accountId: accVentas.id, debit: 0, credit: totals.subtotal - totals.totalDiscount },
];
if (totals.totalTaxes > 0) {
  journalLines.push({ accountId: accItbis.id, debit: 0, credit: totals.totalTaxes });
}
```
El descargo de stock se difiere al conduce (`invoiceDbBooker.ts:370`, comentario: *"Deducción diferida a Conduce de Entrega"*) y ni `src/repositories/deliveryRepository.ts` ni `src/services/inventoryService.ts` contienen referencia alguna a `journal`/`createJournalEntry` (barrido vacío).

Mappings sin consumidor (`accountingRepository.ts:421-422`):
```ts
{ key: 'cost_of_goods_sold', code: '5.1.01' },
{ key: 'inventory', code: '1.1.03.01' }
```

**ESCENARIO:** Se compra mercancía por RD$100k (se debita Inventario, `expenses/route.ts:347`). Se vende toda por RD$150k. El mayor muestra Inventario RD$100k, Ingresos RD$150k, Costo de Ventas RD$0 → utilidad reportada RD$150k en vez de RD$50k.

**IMPACTO CONTABLE:** Estado de resultados con utilidad bruta igual a la venta completa. Activo inflado indefinidamente por inventario ya vendido. Base imponible de ISR sobrevalorada.

**IMPACTO EN BD:** `inventory_levels` baja pero ninguna línea de `journal_entry_lines` acompaña el movimiento; el auxiliar de inventario y el mayor divergen desde la primera venta.

**RIESGO MULTIEMPRESA:** Ninguno adicional.

**SOLUCIÓN RECOMENDADA:** Emitir el asiento de costo en el mismo `tx` en que se ejecuta `deductStock`, valorando con el costo del método definido (`products.cost` / promedio ponderado), y usar los mappings `cost_of_goods_sold` / `inventory`.

**RIESGO DE IMPLEMENTARLA:** ALTO. Requiere definir y congelar el método de valuación; los datos históricos no se pueden reconstruir sin una toma de inventario.

---

## JRN-08 🔴 CRÍTICO — Los asientos se BORRAN físicamente al editar o eliminar un gasto: no hay contrasiento ni traza

**MÓDULO:** Compras/Gastos

**DESCRIPCIÓN:** No existe mecanismo de reversión en todo el código (barrido de `revers`/`contrasiento`/`anular` sobre `journal_entries`: sin resultados). La anulación se implementa como `DELETE` físico de las líneas y la cabecera. Ni `status`, ni `deletedAt`, ni asiento inverso.

**CAUSA RAÍZ:** Modelo de corrección por borrado en lugar de por contrapartida.

**EVIDENCIA (borrado)** (`src/app/api/v1/expenses/[id]/route.ts:356-372`):
```ts
// 5. Delete accounting journal entries linked to this expense
const jes = await tx
  .select({ id: journalEntries.id })
  .from(journalEntries)
  .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)));

for (const je of jes) {
  await tx
    .delete(journalEntryLines)
    .where(and(eq(journalEntryLines.journalEntryId, je.id), eq(journalEntryLines.companyId, session.companyId), eq(journalEntryLines.modo, session.modo)));
  await tx
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, je.id), eq(journalEntries.companyId, session.companyId)));
}
```
**Repetido literalmente en la edición** (`expenses/[id]/route.ts:631-644`, comentario `// 5. Delete old journal entries`).

Obsérvese el desajuste de filtros: el `SELECT` de cabeceras **no filtra `modo`**, el `DELETE` de líneas **sí**, y el `DELETE` de cabecera **no**. Si el asiento pertenece al otro entorno, sus líneas no se borran y el `DELETE` de la cabecera choca con la FK `journal_entry_lines_journal_entry_id_company_fk`.

También hay borrado masivo en `src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts:152-153` (acotado correctamente a `modo='PRUEBA'`, línea 66).

**ESCENARIO:** Se corrige el importe de una compra de marzo, con marzo ya cerrado y el 606 presentado. El asiento original desaparece de la base y se emite uno nuevo. La declaración presentada ya no tiene respaldo contable.

**IMPACTO CONTABLE:** Violación del principio de inalterabilidad del registro contable. Un mayor "cuadrado" que no refleja lo declarado. Ninguna auditoría posterior puede reconstruir el estado a una fecha.

**IMPACTO EN BD:** Pérdida irreversible de filas. `deletedAt` de `journal_entries` existe en el schema (`accounting.ts:41`) y **nunca se escribe en ninguna parte del código**.

**RIESGO MULTIEMPRESA:** Riesgo de fallo por FK cruzada entre entornos (`modo`) descrito arriba.

**SOLUCIÓN RECOMENDADA:** Sustituir por contrasiento: marcar el original (`status='reversed'`, `deletedAt`) y crear un asiento inverso con `reference` al original, con fecha dentro de un período abierto. Revocar el permiso `DELETE` sobre estas tablas a nivel de rol de base de datos.

**RIESGO DE IMPLEMENTARLA:** MEDIO. Los reportes ya filtran `deletedAt`, así que el cambio es compatible; pero hay que revisar la edición de gastos, que hoy asume que puede rehacer el asiento desde cero.

---

## JRN-09 🟠 ALTO — `POST /api/v1/accounting/journals` no envía `modo`: los asientos manuales de PRUEBA caen en PRODUCCIÓN

**MÓDULO:** Contabilidad / asientos manuales

**DESCRIPCIÓN:** El endpoint construye el payload sin la propiedad `modo`. Como `journal_entries.modo` y `journal_entry_lines.modo` tienen `DEFAULT 'PRODUCCION'`, la omisión **no produce error**: el asiento se sella como real.

**CAUSA RAÍZ:** Propiedad obligatoria del DTO omitida en el llamador, sin tipado que lo detecte (`createJournalEntry(txOrData: any, dataInput?: ...)`, firma con `any`).

**EVIDENCIA** (`src/app/api/v1/accounting/journals/route.ts:84-88`):
```ts
const newJournal = await AccountingRepository.createJournalEntry({
  ...parsed.data,
  companyId: session.companyId,
  reference: parsed.data.reference || undefined
});
```
`parsed.data` proviene de `createJournalSchema` (líneas 8-17), que sólo contiene `date`, `reference`, `description`, `lines`. **No hay `modo` en ningún punto.**

Consumo del valor ausente (`accountingRepository.ts:314` y `:328`):
```ts
modo: data.modo,          // undefined → Drizzle omite → DEFAULT 'PRODUCCION'
```
Y la comprobación de período usa el parámetro por defecto (`accountingRepository.ts:227`):
```ts
static async isPeriodOpen(companyId: string, dateStr: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION', tx: any = db)
```
→ se valida contra los períodos de PRODUCCIÓN.

**Contraste:** todos los demás llamadores sí pasan `modo` (`expenseService.ts:203`, `apService.ts:170`, `invoiceDbBooker.ts:452`, `bank/accounts/[id]/transactions/route.ts:231`, `entries/route.ts:206`).

**ESCENARIO:** Un usuario en modo PRUEBA registra asientos de práctica desde la pantalla de contabilidad. Aparecen en el balance general oficial de PRODUCCIÓN.

**IMPACTO CONTABLE:** Contaminación de los estados financieros oficiales con datos de entrenamiento, sin ninguna señal.

**IMPACTO EN BD:** Filas con `modo='PRODUCCION'` indistinguibles de las reales salvo por inspección manual de la descripción.

**RIESGO MULTIEMPRESA:** El aislamiento por `companyId` se mantiene; el que se rompe es el aislamiento por entorno, que el resto del sistema trata como equivalente en criticidad (ver los comentarios de la propia base de código en `accountingRepository.ts:179-181`).

**SOLUCIÓN RECOMENDADA:** Añadir `modo: session.modo`. Y cambiar la firma de `createJournalEntry` de `any` a un tipo estricto para que TypeScript detecte la omisión.

**RIESGO DE IMPLEMENTARLA:** MUY BAJO. Una línea. Los asientos ya contaminados deben identificarse y reclasificarse aparte.

---

## JRN-10 🟠 ALTO — El balance general nunca cuadra: no incluye el resultado del ejercicio ni existe asiento de cierre

**MÓDULO:** Reportes financieros

**DESCRIPCIÓN:** `/api/v1/reports/balance-sheet` calcula Patrimonio sumando únicamente cuentas de `type='equity'`. Como no hay ningún proceso que traslade el resultado del ejercicio a patrimonio (el cierre de período sólo cambia un `status`, ver JRN-11), **Activo ≠ Pasivo + Patrimonio siempre que haya actividad de resultados**.

**CAUSA RAÍZ:** Falta la línea de "Resultado del ejercicio" en el reporte y el asiento de cierre en el motor.

**EVIDENCIA** (`src/app/api/v1/reports/balance-sheet/route.ts:97-116`):
```ts
let totalAssets = 0;
let totalLiabilities = 0;
let totalEquity = 0;

balanceSheetAccounts.forEach((acc) => {
  if (acc.type === 'asset') totalAssets += acc.balance;
  else if (acc.type === 'liability') totalLiabilities += acc.balance;
  else if (acc.type === 'equity') totalEquity += acc.balance;
});
...
balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.05,
```
`balanceSheetAccounts` se filtró previamente a `asset|liability|equity` (línea 72), excluyendo ingresos y gastos. Ningún punto del código produce un asiento de cierre: barrido de `createJournalEntry` (13 resultados) — ninguno en el flujo de períodos.

**ESCENARIO:** Primer mes de operación con utilidad de RD$50k. El reporte devuelve `balanced: false` de forma permanente y con una diferencia exactamente igual a la utilidad acumulada.

**IMPACTO CONTABLE:** El estado financiero principal es inutilizable como documento formal.

**IMPACTO EN BD:** Ninguno (es un cálculo de lectura).

**RIESGO MULTIEMPRESA:** Ninguno.

**SOLUCIÓN RECOMENDADA:** Añadir al reporte una fila calculada "Resultado del ejercicio" = Σ(revenue) − Σ(expense+cost) del ejercicio en curso, e incluirla en `totalEquity`. A medio plazo, implementar el asiento de cierre anual contra `3.2.01 Utilidades Acumuladas`.

**RIESGO DE IMPLEMENTARLA:** BAJO para la fila calculada; MEDIO para el cierre anual.

---

## JRN-11 🟠 ALTO — El control de período se autoanula: si no hay períodos, se crea uno abierto sobre la marcha

**MÓDULO:** Períodos contables

**DESCRIPCIÓN:** `isPeriodOpen` sí bloquea fechas en períodos cerrados, pero si la empresa **no tiene ningún período definido**, en lugar de rechazar crea un período abierto para el mes de la fecha del asiento y devuelve `true`.

**CAUSA RAÍZ:** Bootstrap permisivo dentro de la función de validación.

**EVIDENCIA** (`src/repositories/accountingRepository.ts:235-257`):
```ts
const count = Number(periodsCount[0]?.count || 0);
if (count === 0) {
  // Auto-bootstrap an open period for the current year/month
  const d = new Date(formattedDate);
  ...
  await tx.insert(accountingPeriods).values({
    id: uuidv4(), companyId, modo, name: periodName,
    startDate, endDate, status: 'open'
  });
  return true;
}
```
El bloqueo real (líneas 259-269) sólo se aplica a partir del segundo período. El cierre de período (`src/app/api/v1/accounting/periods/[id]/route.ts:60-68`) sólo hace `UPDATE ... SET status='closed'` — **no genera asiento de cierre ni verifica que no queden asientos descuadrados**.

**ESCENARIO:** Empresa nueva. Se registra una factura con fecha de hace dos años (error de captura o migración). El sistema crea un período abierto para ese mes de hace dos años y acepta el asiento.

**IMPACTO CONTABLE:** El control de períodos no impide postear en ejercicios cerrados fiscalmente hasta que alguien crea manualmente el primer período. Se acumulan períodos abiertos "fantasma" nunca cerrados.

**IMPACTO EN BD:** Filas espurias en `accounting_periods` con nombres tipo `03/2024`.

**RIESGO MULTIEMPRESA:** Ninguno (la creación está acotada a `companyId` y `modo`).

**SOLUCIÓN RECOMENDADA:** Sembrar los períodos del ejercicio al crear la empresa (junto al catálogo) y convertir el bootstrap en `throw`. Añadir al cierre de período la verificación de que la suma de débitos y créditos del período es igual.

**RIESGO DE IMPLEMENTARLA:** MEDIO. Empresas existentes sin períodos empezarían a fallar; migrar sembrando períodos antes del despliegue.

---

## JRN-12 🟠 ALTO — Se permiten movimientos en cuentas de agrupación, inactivas o borradas; `isTransactional` nunca se valida

**MÓDULO:** Plan de cuentas / todos los módulos de posting

**DESCRIPCIÓN:** `isTransactional` se define, se siembra y se muestra en la UI, pero **ninguna ruta de posting lo verifica**. Tampoco se verifica `status='active'` ni `deletedAt IS NULL` al usar una cuenta en un asiento. Y en la práctica los módulos postean sistemáticamente contra cuentas de agrupación.

**CAUSA RAÍZ:** Validación implementada sólo en capa de presentación.

**EVIDENCIA — barrido completo de `isTransactional` en `src/`:**
```
src/app/api/v1/accounting/accounts/route.ts:14     ← zod de creación
src/app/dashboard/accounting/page.tsx:20, 931      ← UI (filtro visual)
src/app/dashboard/settings/page.tsx:987            ← UI (opciones del select)
src/db/schema/accounting.ts:20                     ← definición
src/repositories/accountingRepository.ts:21,159,496-552,780  ← seed y proyección al reporte
```
**No aparece en ningún archivo de `src/services/` ni en `createJournalEntry`.**

La validación más completa que existe está en asientos manuales (`src/app/api/v1/accounting/entries/route.ts:184-193`) y **tampoco comprueba `isTransactional` ni `status`**:
```ts
const matchedAccounts = await db
  .select({ id: chartOfAccounts.id })
  .from(chartOfAccounts)
  .where(
    and(
      inArray(chartOfAccounts.id, accountIds),
      eq(chartOfAccounts.companyId, auth.companyId),
      isNull(chartOfAccounts.deletedAt)
    )
  );
```

Cuentas de agrupación efectivamente usadas como contrapartida (`isTransactional: false` según `accountingRepository.ts:498, 502, 505, 507, 518`): `1.1.01` (`arRepository.ts:185`, `expenseService.ts:166`, `expenses/route.ts:353`), `1.1.02` (`arRepository.ts:186`, `invoiceDbBooker.ts:389`, `expenses/route.ts:305`), `1.1.03` (`invoiceDbBooker.ts:413`), `1.1.04` (`invoiceDbBooker.ts:416`), `2.1.01` (`expenses/route.ts:304, 352`).

Además, todas las variantes de `getOrCreateAccount` buscan **sin filtrar `deletedAt`** (p. ej. `arRepository.ts:370-373`), de modo que una cuenta borrada lógicamente se sigue reutilizando para postear.

**ESCENARIO:** El contador desactiva `1.1.02 Cuentas por Cobrar` (agrupación) y crea `1.1.02.01` como transaccional. El facturador sigue posteando en la agrupación.

**IMPACTO CONTABLE:** Saldos duplicados entre padre e hijo; el árbol del catálogo pierde sentido; la balanza por niveles no se puede totalizar.

**IMPACTO EN BD:** `journal_entry_lines.account_id` apuntando a cuentas con `is_transactional=false` o `deleted_at IS NOT NULL`.

**RIESGO MULTIEMPRESA:** El aislamiento por empresa sí está garantizado a nivel de base (ver JRN-13).

**SOLUCIÓN RECOMENDADA:** Validar dentro de `createJournalEntry`, en una sola consulta por asiento: que cada `accountId` pertenezca a `companyId`, tenga `isTransactional=true`, `status='active'` y `deletedAt IS NULL`. Rechazar el asiento completo si falla.

**RIESGO DE IMPLEMENTARLA:** ALTO en operación: hasta que JRN-01 esté resuelto, activar esta validación bloquearía facturas y compras, porque los módulos apuntan hoy a cuentas de agrupación. Debe desplegarse **después** del resolvedor por mappings.

---

## JRN-13 🟡 MEDIO — La coherencia `type`↔`nature` no se valida, y los reportes usan criterios distintos para el signo

**MÓDULO:** Plan de cuentas / reportes

**DESCRIPCIÓN:** No hay validación de que activo/gasto sean `debit` y pasivo/patrimonio/ingreso sean `credit`. La inferencia existe pero es opcional y sólo cubre un camino. Peor: la balanza usa `nature` para el signo y los estados financieros usan `type`, de modo que una cuenta incoherente **aparece con signo opuesto en cada reporte**.

**CAUSA RAÍZ:** Dos columnas redundantes sin invariante que las ligue, consumidas por criterios distintos.

**EVIDENCIA — inferencia sólo en `createAccount`** (`src/repositories/accountingRepository.ts:143-149`):
```ts
let nature: 'debit' | 'credit' = data.nature || 'debit';
if (!data.nature) {
  if (['2', '3', '4'].includes(firstDigit)) {
    nature = 'credit';
  }
}
```
El zod del endpoint (`accounting/accounts/route.ts:13`) acepta `nature` explícita: `nature: z.enum(['debit','credit']).optional()` — se puede crear un pasivo con naturaleza deudora sin ningún rechazo. Nótese además que la inferencia asigna `debit` a los códigos que empiezan por `5` y `6` (gastos) correctamente, pero también a cualquier código arbitrario.

**Criterio por `nature`** (`accountingRepository.ts:766, 771` — balanza y mayor):
```ts
const begBal = acc.nature === 'debit' ? (prevDeb - prevCred) : (prevCred - prevDeb);
```
**Criterio por `type`** (`reports/balance-sheet/route.ts:77-82`):
```ts
if (acc.type === 'asset') {
  balance = sum.debit - sum.credit;
} else {
  balance = sum.credit - sum.debit;   // liabilities & equity
}
```

**ESCENARIO:** La cuenta `2.1.03 ITBIS por Pagar`, creada al vuelo con `nature='debit'` y `type='liability'` (ver JRN-02), muestra −18.000 en la balanza y +18.000 en el balance general el mismo día.

**IMPACTO CONTABLE:** Dos reportes oficiales contradictorios sobre la misma cuenta.

**IMPACTO EN BD:** Filas con combinación `type`/`nature` inválida.

**RIESGO MULTIEMPRESA:** Ninguno.

**SOLUCIÓN RECOMENDADA:** Derivar siempre `nature` de `type` (con excepción explícita para contra-cuentas como Depreciación Acumulada, que el seed ya marca `type='asset', nature='credit'` en `accountingRepository.ts:514`) y añadir un `CHECK` en base. Unificar todos los reportes en un único criterio.

**RIESGO DE IMPLEMENTARLA:** BAJO-MEDIO. Cambiar el criterio de un reporte invierte signos históricos mostrados.

---

## JRN-14 🟡 MEDIO — La validación de cuadre tolera 1 centavo y trabaja sobre floats JS, mientras Postgres redondea cada línea por separado

**MÓDULO:** Motor de asientos

**DESCRIPCIÓN:** El cuadre se comprueba en JavaScript sobre los valores sin redondear, con tolerancia `> 0.01`. Las líneas se persisten con `.toString()` en columnas `numeric(15,2)`, y **Postgres redondea cada línea de forma independiente**. Ambos efectos permiten que la fila quede descuadrada en base de datos aunque la validación haya pasado.

**CAUSA RAÍZ:** Validación en un dominio (float sin redondeo) distinto al de la persistencia (decimal redondeado por línea).

**EVIDENCIA** (`src/repositories/accountingRepository.ts:284-297`):
```ts
const totalDebits = data.lines.reduce((sum, line) => sum + Number(line.debit), 0);
const totalCredits = data.lines.reduce((sum, line) => sum + Number(line.credit), 0);

if (Math.abs(totalDebits - totalCredits) > 0.01) {
  throw new Error(`Asiento contable descuadrado: Débitos ($${totalDebits.toFixed(2)}) no equivalen a Créditos ($${totalCredits.toFixed(2)}).`);
}

if (totalDebits === 0) {
  throw new Error('El asiento debe tener valores de débito o crédito.');
}
```
Persistencia (`accountingRepository.ts:324-334`):
```ts
await transactionContext.insert(journalEntryLines).values(
  data.lines.map((line) => ({
    ...
    debit: line.debit.toString(),
    credit: line.credit.toString(),
  }))
);
```
Columnas: `debit: decimal('debit', { precision: 15, scale: 2 })` (`accounting.ts:55-56`).

Origen de valores sin redondear (`src/app/api/v1/expenses/route.ts:324-331`):
```ts
const subtotalVal = parseFloat(amount);
const itbisAmount = parseFloat(itbis || 0);
const otherTaxesAmount = parseFloat(otherTaxes || 0);
...
const netAmount = subtotalVal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;
```
No hay `roundMoney` en este camino (sí lo hay en el cálculo de factura: `src/services/invoice/invoiceCalculator.ts` usa `roundMoney` en cada paso; **pero el asiento vuelve a restar sin redondear** en `invoiceDbBooker.ts:427`: `credit: totals.subtotal - totals.totalDiscount`).

**ESCENARIO A (tolerancia):** un asiento con débitos 1.000,00 y créditos 999,99 **pasa la validación** y queda registrado descuadrado 0,01 de forma permanente. **ESCENARIO B (redondeo por línea):** compra con `amount=100`, `itbis=0.005`, `otherTaxes=0.005`. JS: débitos 100,01 / créditos 100,01 → pasa. Postgres: débitos 100,00 + 0,01 + 0,01 = **100,02**; créditos **100,01**. Descuadre de 0,01 en base.

**IMPACTO CONTABLE:** Balanza de comprobación que no cierra en centavos, sin causa localizable.

**IMPACTO EN BD:** `journal_entries` cuyas líneas suman distinto en Debe y Haber. No hay ninguna restricción que lo impida (ver JRN-15).

**RIESGO MULTIEMPRESA:** Ninguno.

**SOLUCIÓN RECOMENDADA:** Redondear cada línea a 2 decimales **antes** de validar y persistir (usar el `roundMoney` ya existente en `src/utils/calculos`), y endurecer la comparación a igualdad exacta sobre enteros de centavos. Si tras redondear hay diferencia, ajustar la línea de mayor importe en lugar de tolerarla.

**RIESGO DE IMPLEMENTARLA:** BAJO.

---

## JRN-15 🟡 MEDIO — Sin CHECK constraints: se aceptan líneas con débito y crédito simultáneos, ambos en cero, o negativos

**MÓDULO:** Base de datos / motor de asientos

**DESCRIPCIÓN:** Ni la base ni el código impiden una línea con `debit>0 AND credit>0`, con ambos en cero, o con importes negativos.

**CAUSA RAÍZ:** Ausencia de invariantes a nivel de tabla y de validación por línea (sólo hay validación de totales).

**EVIDENCIA (BD) — DDL original** (`drizzle/0000_violet_pestilence.sql:336-345`):
```sql
CREATE TABLE "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"credit" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	...
);
```
Barrido de `CHECK` en todo `drizzle/*.sql`: los únicos resultados son políticas RLS (`WITH CHECK`) en `0020`, `0024`, `0026`, `0037`, y **un solo CHECK de negocio**, sobre inventario (`drizzle/0031_inventario_no_negativo.sql:31`):
```sql
ADD CONSTRAINT "chk_inventory_no_negativo" CHECK ("quantity" >= 0) NOT VALID;
```
No existe ninguno sobre `journal_entry_lines`.

**EVIDENCIA (código):** la validación de `createJournalEntry` (citada en JRN-14) opera sólo sobre **totales**. No hay bucle por línea. Los zod de las dos rutas manuales exigen `nonnegative()` / `min(0)` (`entries/route.ts:19-20`, `journals/route.ts:14-15`), pero **los 11 llamadores internos no pasan por zod**. Y la única guarda de importe nulo, `if (totalDebits === 0)`, se sortea con líneas negativas que se compensan.

**ESCENARIO:** Un módulo interno construye una línea `{ accountId, debit: 500, credit: 500 }` más otra idéntica. Totales: 1000 = 1000 → pasa. Se persiste un asiento sin significado contable. Con negativos: `{debit:-100, credit:0}` y `{debit:0, credit:-100}` → totales −100 = −100, `totalDebits !== 0` → pasa.

**IMPACTO CONTABLE:** Líneas ininterpretables en el mayor; sumas de columnas Debe/Haber infladas o negativas.

**IMPACTO EN BD:** Datos que ninguna consulta posterior puede clasificar correctamente.

**RIESGO MULTIEMPRESA:** Ninguno.

**SOLUCIÓN RECOMENDADA:**
```sql
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT chk_jel_signo CHECK (debit >= 0 AND credit >= 0),
  ADD CONSTRAINT chk_jel_exclusivo CHECK ((debit = 0) <> (credit = 0));
```
(añadir `NOT VALID` primero, validar tras sanear datos históricos) y una validación por línea en `createJournalEntry`.

**RIESGO DE IMPLEMENTARLA:** MEDIO. Si hay filas históricas que violan el CHECK, la validación fallará; usar `NOT VALID` y sanear después.

---

## JRN-16 🟠 ALTO — `journal_entries` no registra quién creó el asiento

**MÓDULO:** Trazabilidad

**DESCRIPCIÓN:** La tabla no tiene `createdBy`, `userId` ni ninguna columna de autoría. No es reconstruible desde otra tabla de forma general.

**CAUSA RAÍZ:** Omisión en el diseño del schema.

**EVIDENCIA** (`src/db/schema/accounting.ts:31-41`) — columnas completas: `id, companyId, modo, reference, date, description, status, createdAt, updatedAt, deletedAt`. **No hay campo de usuario.** Barrido de `created_by|createdBy` sobre `drizzle/*.sql` y el schema, filtrado por `journal`: **cero resultados**.

Contraste con tablas hermanas que sí lo tienen: `financial_movements.userId` (`accounting.ts:313`) y `accounting_periods.closedBy` (`accounting.ts:276`).

Sustituto parcial: sólo dos rutas escriben `audit_logs` con `entityType='journal_entries'` — asientos manuales (`accounting/entries/route.ts:214-223`) y movimientos bancarios (`bank/accounts/[id]/transactions/route.ts:239-248`). Los asientos de factura (`invoiceDbBooker.ts:450`), compra (`expenseService.ts:201`, `expenses/route.ts:381`), pago CxP (`apService.ts:168, 286, 437`), recibo de cobro (`arRepository.ts:189`) y banco vía repositorio (`bankRepository.ts:230`) **no dejan traza de autoría en ningún sitio**.

**ESCENARIO:** Aparece un asiento manual anómalo por RD$400k en un período cerrado. No se puede determinar quién lo hizo si la ruta usada no fue una de las dos que escriben `audit_logs`.

**IMPACTO CONTABLE:** Incumple el requisito básico de auditabilidad de un libro diario. Impide segregación de funciones efectiva.

**IMPACTO EN BD:** Imposible reconstruir la autoría retroactivamente para los asientos ya existentes.

**RIESGO MULTIEMPRESA:** En despliegues donde el rol `sistemas` cambia de empresa (`POST /api/v1/auth/switch-company`, documentado en `drizzle/0032_aislamiento_estructural.sql:15-18`), no queda registro de qué usuario operó sobre qué empresa.

**SOLUCIÓN RECOMENDADA:** Añadir `created_by uuid REFERENCES users(id)` a `journal_entries`, hacerlo obligatorio en `CreateJournalEntryInput` y propagarlo desde `session.userId` en los 13 llamadores.

**RIESGO DE IMPLEMENTARLA:** BAJO-MEDIO. Columna nullable para lo histórico, obligatoria a partir del despliegue; hay que tocar todos los llamadores (algunos, como `applyDueGuaranteeChecks`, son procesos automáticos y necesitarán un usuario de sistema).

---

## JRN-17 🟡 MEDIO — La balanza de comprobación y el mayor no filtran por `status`

**MÓDULO:** Reportes

**DESCRIPCIÓN:** Existen dos familias de reportes con criterios distintos. `getTrialBalance` y `getLedger` filtran `companyId`, `modo`, rango de fechas y `deletedAt`, **pero no `status`**. `/api/v1/reports/balance-sheet` e `income-statement` sí lo hacen. Como los estados financieros derivan de la balanza (`getFinancials`), el conjunto es internamente inconsistente.

**CAUSA RAÍZ:** Dos implementaciones paralelas de la misma agregación.

**EVIDENCIA — balanza SIN `status`** (`src/repositories/accountingRepository.ts:731-736`, idéntico en `:748-753` y en el mayor `:648-658`, `:675-682`):
```ts
.where(and(
  eq(journalEntryLines.companyId, companyId),
  eq(journalEntries.modo, modo),
  sql`${journalEntries.date} < ${formattedStart}`,
  isNull(journalEntries.deletedAt)
))
```

**Balance general CON `status`** (`src/app/api/v1/reports/balance-sheet/route.ts:42-51`):
```ts
and(
  eq(journalEntryLines.companyId, auth.companyId),
  eq(journalEntryLines.modo, auth.modo),
  eq(journalEntries.modo, auth.modo),
  lte(journalEntries.date, dateStr),
  eq(journalEntries.status, 'posted'),
  isNull(journalEntries.deletedAt)
)
```

**Cuadro comparativo de filtros por reporte:**

| Reporte | companyId | modo | status | deletedAt | rango fechas |
|---|---|---|---|---|---|
| `reports/balance-sheet` | ✅ | ✅ (línea y cabecera) | ✅ `posted` | ✅ | ✅ `<= date` |
| `reports/income-statement` | ✅ | ✅ (línea y cabecera) | ✅ `posted` | ✅ | ✅ `between` |
| `reportRepository` (P&L PDF) | ✅ | ✅ | ✅ `posted` | ❌ | ✅ |
| `getTrialBalance` | ✅ | ✅ (cabecera) | ❌ | ✅ | ✅ |
| `getLedger` | ✅ | ✅ (cabecera) | ❌ | ✅ | ✅ |
| `getFinancials` | hereda de `getTrialBalance` | | ❌ | ✅ | ✅ |
| `getJournalEntries` | ✅ | ✅ | ❌ | ✅ | ✅ |

Nótese también que `reportRepository.ts:42-52` filtra `status='posted'` pero **omite `isNull(deletedAt)`**.

**ESCENARIO:** Atenuado hoy porque `status` se escribe siempre `'posted'` (`accountingRepository.ts:319`, `arRepository.ts:196`, `bankRepository.ts:237`) y `deletedAt` nunca se escribe. Pero en cuanto se implemente la reversión por marcado (JRN-08) o los borradores, la balanza incluirá asientos que el balance general excluye.

**IMPACTO CONTABLE:** Latente hoy, garantizado en cuanto se corrija JRN-08.

**IMPACTO EN BD:** Ninguno (lectura).

**RIESGO MULTIEMPRESA:** Ninguno — todos filtran `companyId` y `modo` correctamente.

**SOLUCIÓN RECOMENDADA:** Extraer una única función de agregación de saldos con la firma `(companyId, modo, desde, hasta)` y el juego completo de filtros, y hacer que los seis reportes la usen.

**RIESGO DE IMPLEMENTARLA:** BAJO.

---

## JRN-18 🟡 MEDIO — El asiento de la factura se fecha con la fecha de hoy en UTC, no con la de la factura

**MÓDULO:** Facturación

**DESCRIPCIÓN:** El asiento de venta se fecha con `new Date()` en UTC, ignorando la fecha del documento. República Dominicana es UTC−4.

**CAUSA RAÍZ:** Fecha hardcodeada en el llamador en lugar de tomarla del documento.

**EVIDENCIA** (`src/services/invoice/invoiceDbBooker.ts:450-457`):
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
Contraste — el resto del sistema sí es consciente del huso (`src/app/api/v1/reports/balance-sheet/route.ts:26-29`):
```ts
const getDRLocalDateString = () => {
  const d = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
};
```
Y el helper del propio repositorio (`accountingRepository.ts:53-73`) tiene lógica explícita para preservar la fecha local, que este llamador no aprovecha porque le entrega ya una cadena UTC.

**ESCENARIO:** Factura emitida el 31 de julio a las 21:00 hora dominicana = 1 de agosto 01:00 UTC. El asiento se fecha **1 de agosto**. La venta queda en julio (por `invoices`) y el asiento en agosto. Si julio se cierra, el asiento ya está fuera. El 607 de julio no cuadra con el mayor de julio.

**IMPACTO CONTABLE:** Corte de período incorrecto en toda facturación nocturna (20:00–24:00 hora local) de fin de mes. Además invalida el control de período: se valida agosto, no julio.

**IMPACTO EN BD:** `journal_entries.date` distinto de la fecha del documento en `invoices`.

**RIESGO MULTIEMPRESA:** Ninguno.

**SOLUCIÓN RECOMENDADA:** Usar la fecha de emisión de la factura (o el helper de fecha local dominicana) en lugar de `new Date()` UTC. Revisar también `apService.ts:290` y `:441`, que usan `date: today` (objeto `Date` en hora de servidor) para el cobro de cheques en garantía.

**RIESGO DE IMPLEMENTARLA:** BAJO.

---

## JRN-19 🟡 MEDIO — ISC y propina se registran en el gasto pero nunca llegan al asiento

**MÓDULO:** Compras/Gastos

**DESCRIPCIÓN:** La tabla `expenses` almacena `isc` e `itbisProportionality` y `tip`, pero la fórmula del asiento no los incluye. El documento y el mayor divergen por construcción.

**CAUSA RAÍZ:** Fórmula de `netAmount` incompleta respecto al modelo de datos.

**EVIDENCIA — columnas existentes** (`src/db/schema/accounting.ts:231-237`):
```ts
itbis: decimal('itbis', { precision: 15, scale: 2 }).default('0.00').notNull(),
itbisRetained: decimal('itbis_retained', ...).notNull(),
itbisProportionality: decimal('itbis_proportionality', ...).notNull(),
isrRetained: decimal('isr_retained', ...).notNull(),
isc: decimal('isc', { precision: 15, scale: 2 }).default('0.00').notNull(),
otherTaxes: decimal('other_taxes', ...).notNull(),
tip: decimal('tip', { precision: 15, scale: 2 }).default('0.00').notNull(),
```

**Fórmula del asiento** (`src/services/expenseService.ts:146-153`; idéntica en `expenses/route.ts:324-331` y `expenses/[id]/route.ts`):
```ts
const subtotal = expenseData.amount;
const itbisAmount = expenseData.itbis ?? 0;
const otherTaxesAmount = expenseData.otherTaxes ?? 0;
const isrRet = expenseData.isrRetained ?? 0;
const itbisRet = expenseData.itbisRetained ?? 0;

// Total net: subtotal + itbis + otherTaxes - isrRet - itbisRet
const netAmount = subtotal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;
```
`isc`, `tip` e `itbisProportionality` **no aparecen**.

**ESCENARIO:** Factura de restaurante: monto 1.000, ITBIS 180, propina legal 100. El gasto se guarda con `tip=100`; el asiento acredita sólo 1.180. La cuenta por pagar / salida de caja real es 1.280.

**IMPACTO CONTABLE:** Gasto subvaluado en el estado de resultados; CxP o Caja descuadrada respecto al pago real. La proporcionalidad del ITBIS (art. 349 CT-DR) no se refleja en el crédito fiscal registrado.

**IMPACTO EN BD:** `expenses` y `journal_entry_lines` con importes irreconciliables para el mismo documento.

**RIESGO MULTIEMPRESA:** Ninguno.

**SOLUCIÓN RECOMENDADA:** Incluir `isc` y `tip` como líneas de gasto propias y aplicar `itbisProportionality` como reclasificación del ITBIS pagado a gasto no deducible.

**RIESGO DE IMPLEMENTARLA:** BAJO-MEDIO. Requiere definir las cuentas destino (nuevas mappingKeys).

---

## JRN-20 🟡 MEDIO — `POST /api/v1/accounting/journals` y `POST /api/v1/ap/payments` no validan la propiedad de las cuentas; el aislamiento depende sólo de una FK `NOT VALID`

**MÓDULO:** Contabilidad / CxP — multiempresa

**DESCRIPCIÓN:** Varias rutas aceptan `accountId` del cuerpo de la petición validando únicamente el formato UUID. La protección real es una FK compuesta añadida en la migración 0032, que además está `NOT VALID` y cuya validación quedó **comentada**.

**CAUSA RAÍZ:** Confianza en identificadores enviados por el cliente; defensa desplazada íntegramente a la base.

**EVIDENCIA — ruta sin validación alguna** (`src/app/api/v1/accounting/journals/route.ts:12-16`):
```ts
lines: z.array(z.object({
  accountId: z.string().uuid('ID de cuenta inválido'),
  debit: z.number().min(0),
  credit: z.number().min(0),
})).min(2, 'Debe haber al menos 2 líneas de movimiento'),
```
No hay ninguna consulta a `chartOfAccounts` en todo el archivo.

**Igual en pagos CxP** (`src/app/api/v1/ap/payments/route.ts:12-13`) — sin consulta a `chartOfAccounts` en el archivo:
```ts
debitAccountId: z.string().uuid('Debe seleccionar una cuenta de débito válida.'),
creditAccountId: z.string().uuid('Debe seleccionar una cuenta de crédito válida.'),
```
Esos ids llegan intactos al asiento (`src/services/apService.ts:174-185`).

**Contraste — la ruta hermana sí valida** (`src/app/api/v1/accounting/entries/route.ts:184-200`, citado en JRN-12).

**Defensa efectiva en base** (`drizzle/0032_aislamiento_estructural.sql:164-167`):
```sql
DO $$ BEGIN
  ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_company_fk"
    FOREIGN KEY ("account_id", company_id) REFERENCES "chart_of_accounts"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
y su validación, **comentada** (`drizzle/0032_aislamiento_estructural.sql:348-349`):
```sql
-- ALTER TABLE "journal_entry_lines" VALIDATE CONSTRAINT "journal_entry_lines_journal_entry_id_company_fk";
-- ALTER TABLE "journal_entry_lines" VALIDATE CONSTRAINT "journal_entry_lines_account_id_company_fk";
```

Además, `POST /api/v1/bank/transactions` (`src/app/api/v1/bank/transactions/route.ts:62-92`) **no llama a `enforcePermission`** en absoluto, a diferencia del resto de rutas contables, y pasa `contraAccountId` sin validar a `BankRepository.registerTransaction`.

**ESCENARIO:** Un usuario de la empresa A envía un `accountId` de la empresa B. La FK compuesta rechaza el `INSERT` → error 500 con mensaje de Postgres crudo, no un 400 comprensible. **El dato no se corrompe** (por eso el nivel es MEDIO y no CRÍTICO), pero la ruta filtra información sobre la estructura de la base y depende de una restricción cuya validación está desactivada.

**IMPACTO CONTABLE:** Ninguno directo mientras las FK estén activas.

**IMPACTO EN BD:** Al ser `NOT VALID`, las filas anteriores a la migración 0032 **no fueron verificadas**: pueden existir líneas históricas que apunten a cuentas de otra empresa y nadie lo sabe.

**RIESGO MULTIEMPRESA:** Contenido a nivel de escritura nueva; **no verificado** a nivel de datos históricos.

**SOLUCIÓN RECOMENDADA:** (1) Replicar en `journals/route.ts` y `ap/payments/route.ts` la validación de `entries/route.ts:184-200`, ampliada con `isTransactional` y `status`. (2) Añadir `enforcePermission(..., 'banco', 'write')` a `bank/transactions/route.ts`. (3) Ejecutar `scratch/auditoria_aislamiento.sql` (referenciado en `drizzle/0032:23`) y, si está limpio, descomentar los `VALIDATE CONSTRAINT`.

**RIESGO DE IMPLEMENTARLA:** BAJO para (1) y (2). Para (3), `VALIDATE` toma un `SHARE UPDATE EXCLUSIVE` y fallará si hay datos históricos inconsistentes — ejecutar primero la auditoría.

---

## JRN-21 🟢 BAJO — Condición de carrera en la siembra del catálogo y en `getOrCreateAccount`

**MÓDULO:** Plan de cuentas

**DESCRIPCIÓN:** Todas las variantes de `getOrCreateAccount` hacen `SELECT` y luego `INSERT` sin `ON CONFLICT`. Como existe `UNIQUE (company_id, code)`, dos operaciones concurrentes que necesiten crear la misma cuenta provocan que una falle y **arrastre toda su transacción de negocio**. Además, `getChartOfAccounts` — una función de lectura, invocada desde un `GET` — **escribe** el catálogo completo si está vacío.

**EVIDENCIA — lectura que escribe** (`src/repositories/accountingRepository.ts:88-99`):
```ts
if (list.length === 0) {
  // Seed default Dominican Chart of Accounts
  console.log(`Seeding standard Dominican Chart of Accounts for company: ${companyId}`);
  await this.seedDefaultChartOfAccounts(companyId);
  ...
}
```
Invocada desde `GET /api/v1/accounting/accounts` (`accounting/accounts/route.ts:44`) y desde `getTrialBalance` (`accountingRepository.ts:721`) y `getMappings` (`:401`).

**SELECT-then-INSERT sin `ON CONFLICT`** (`src/services/expenseService.ts:12-28`, y las otras cuatro copias). Contraste: el seed de tipos de gasto sí lo hace bien (`accountingRepository.ts:860`): `.onConflictDoNothing()`.

Índice que provoca el fallo (`drizzle/0000_violet_pestilence.sql:592`):
```sql
CREATE UNIQUE INDEX "chart_accounts_company_code_idx" ON "chart_of_accounts" USING btree ("company_id","code");
```

**ESCENARIO:** Dos cajeros facturan simultáneamente en una empresa recién creada donde falta `2.1.03`. Ambas transacciones intentan crearla; una recibe `duplicate key value violates unique constraint` y **la factura entera se revierte**, incluido el NCF si ya se reservó.

**IMPACTO CONTABLE:** Facturas perdidas con posible salto de NCF.

**IMPACTO EN BD:** Ninguno (la transacción revierte).

**SOLUCIÓN RECOMENDADA:** Añadir `.onConflictDoNothing()` + relectura, o `INSERT ... ON CONFLICT (company_id, code) DO UPDATE SET code = EXCLUDED.code RETURNING *`. Mover la siembra del catálogo exclusivamente a la creación de la empresa (`admin/companies/route.ts:134`, `auth/register/route.ts:92`, `setup/confirm/route.ts:188`, que ya la hacen) y eliminarla de `getChartOfAccounts`.

**RIESGO DE IMPLEMENTARLA:** BAJO, si se garantiza antes que toda empresa existente tiene catálogo.

---

## JRN-22 🟢 BAJO — Los asientos no tienen número correlativo; el `reference` de los recibos se trunca a 8 caracteres

**MÓDULO:** Motor de asientos

**DESCRIPCIÓN:** No existe columna de numeración de asiento (ver DDL completo en JRN-06). El diario se ordena por `date, createdAt` (`accountingRepository.ts:195`), sin folio estable. Y el recibo de cobro guarda un `reference` truncado.

**EVIDENCIA** (`src/repositories/arRepository.ts:194`):
```ts
reference: receiptId.slice(0, 8),
```
frente a la columna disponible (`accounting.ts:35`): `reference: varchar('reference', { length: 255 })`.

Todos los demás módulos guardan el id completo: `invoiceDbBooker.ts:453` (`reference: invoice.id`), `expenses/route.ts:384` (`reference: newExpenseId`), `apService.ts:171` (`reference: payment.id`), `bank/accounts/[id]/transactions/route.ts:232` (`reference: newTx.id`).

**IMPACTO CONTABLE:** El libro diario no puede imprimirse foliado como exige la normativa. Los recibos no se pueden vincular de forma inequívoca a su asiento (8 caracteres hex de un UUID v4 tienen colisión práctica a partir de unos miles de recibos por empresa).

**SOLUCIÓN RECOMENDADA:** Guardar `receiptId` completo y añadir `entry_number` con secuencia por empresa/modo/año, como parte de la solución de JRN-06.

**RIESGO DE IMPLEMENTARLA:** BAJO.

---

# RESUMEN POR SEVERIDAD

| ID | Nivel | Título |
|---|---|---|
| JRN-01 | 🔴 | Dos planes de cuentas divergentes: asientos en cuentas equivocadas |
| JRN-02 | 🔴 | Cuentas creadas al vuelo con `nature`/`level` por defecto |
| JRN-03 | 🔴 | `accounting_mappings` nunca se lee en el posting |
| JRN-04 | 🔴 | Asientos omitidos en silencio (`netAmount > 0`, `bankChartAccount`) |
| JRN-05 | 🔴 | AR y Banco insertan líneas saltándose toda validación |
| JRN-06 | 🔴 | Sin idempotencia: duplicados por doble clic o reintento |
| JRN-07 | 🔴 | Sin asiento de costo de ventas |
| JRN-08 | 🔴 | Borrado físico de asientos al editar/eliminar gastos |
| JRN-09 | 🟠 | `journals/route.ts` omite `modo`: PRUEBA cae en PRODUCCIÓN |
| JRN-10 | 🟠 | Balance general sin resultado del ejercicio: nunca cuadra |
| JRN-11 | 🟠 | Control de período se autoanula con bootstrap permisivo |
| JRN-12 | 🟠 | `isTransactional`/`status`/`deletedAt` nunca validados al postear |
| JRN-16 | 🟠 | Sin `createdBy` en `journal_entries` |
| JRN-13 | 🟡 | `type`↔`nature` sin invariante; reportes con criterios opuestos |
| JRN-14 | 🟡 | Tolerancia de 1 centavo + redondeo por línea en Postgres |
| JRN-15 | 🟡 | Sin CHECK constraints en `journal_entry_lines` |
| JRN-17 | 🟡 | Balanza y mayor no filtran `status` |
| JRN-18 | 🟡 | Asiento de factura fechado con hoy en UTC |
| JRN-19 | 🟡 | ISC, propina y proporcionalidad del ITBIS no llegan al asiento |
| JRN-20 | 🟡 | Rutas sin validar propiedad de cuentas; FK `NOT VALID` sin validar |
| JRN-21 | 🟢 | Carrera en siembra del catálogo y `getOrCreateAccount` |
| JRN-22 | 🟢 | Sin número correlativo de asiento; `reference` truncado en recibos |

**Orden de corrección sugerido:** JRN-09 (una línea) → JRN-04 y JRN-05 (cierran fugas de datos) → JRN-01 + JRN-03 + JRN-02 (el resolvedor por mappings, que es la corrección estructural de la que dependen las demás) → JRN-12 (activar validación de cuentas, sólo después del resolvedor) → JRN-06 y JRN-16 (schema) → JRN-08 (reversión) → JRN-07 (costo de ventas) → el resto.

---

# NO VERIFICADO

Lo siguiente no pude confirmarlo con el alcance de esta auditoría (sólo lectura de código, sin acceso a la base de datos ni ejecución):

1. **Estado real de la base de datos.** No consulté `information_schema` ni ejecuté SQL. No sé qué migraciones están efectivamente aplicadas en el entorno productivo, si las FK compuestas de `0032` existen realmente en la instancia, ni si están `VALID` o `NOT VALID`. Todo lo que afirmo sobre restricciones proviene de los archivos de `drizzle/`.
2. **Existencia de asientos históricos descuadrados o mal ruteados.** No pude contar cuántas filas de `journal_entry_lines` apuntan a cuentas con `is_transactional=false`, ni cuántos `journal_entries` tienen `SUM(debit) <> SUM(credit)`, ni si existen `reference` duplicados. La consulta correspondiente existiría en `scratch/auditoria_aislamiento.sql`, referenciado en `drizzle/0032:23`, que no leí.
3. **Efecto real de las políticas RLS.** Las migraciones `0024_enable_rls_policies.sql`, `0026`, `0037_negar_acceso_publico.sql` y `0038_vistas_publicas_por_empresa.sql` establecen políticas de seguridad a nivel de fila que no analicé. Es posible que aporten una capa de aislamiento por empresa adicional a la que describo, dependiendo del rol con que se conecte la aplicación (que tampoco verifiqué en `.env` / `src/db`).
4. **Cuál de los dos seeds se aplicó a cada empresa existente.** Afirmo que la app usa `accountingRepository.seedDefaultChartOfAccounts` porque es el que invocan las tres rutas de creación de empresa, pero `scripts/seed-chart-of-accounts.js` puede haberse ejecutado manualmente sobre empresas concretas, lo que cambiaría el diagnóstico de JRN-01 para esas empresas en particular (en ese caso los códigos coincidirían y el problema sería el inverso: incoherencia entre empresas).
5. **Contabilización de nómina y de caja.** Confirmé por barrido que `hrRepository.ts`, `payrollCalculationService.ts` y `cashRepository.ts` **no invocan `createJournalEntry`**, pero no revisé esos módulos en profundidad para descartar que contabilicen por otra vía (por ejemplo mediante `financial_movements`, que es una tabla distinta y no forma parte del mayor). Lo dejo señalado como línea de investigación, no como hallazgo.
6. **Notas de crédito e-34 y anulación de facturas.** Verifiqué el asiento de la nota de crédito (`invoiceDbBooker.ts:398-423`) y aritméticamente cuadra. No encontré ningún flujo de "anulación de factura" que toque `journal_entries` (barrido de `voided`/`anulad` sobre `src/app/api/v1/invoices`: sin resultados), pero no revisé exhaustivamente el módulo de facturación para confirmar que no exista por otra ruta.
7. **Retenciones e-CF: cuadre del asiento.** El asiento de venta con retenciones cuadra bajo el supuesto de que `totalNet = subtotal − descuento + impuestos − retenciones`, que es lo que sugiere `invoiceCalculator.ts:55` y `:91`. No ejecuté el cálculo con datos reales para confirmarlo en todos los casos (múltiples tasas de ITBIS, retención sobre base distinta).
8. **Comportamiento del componente de UI de contabilidad.** No audité `src/app/dashboard/accounting/page.tsx` (línea 931 filtra por `isTransactional` para mostrar la balanza). Es posible que la pantalla aplique correcciones o agregaciones de presentación que enmascaren o agraven algunos de los hallazgos de reportes (JRN-10, JRN-13, JRN-17).
9. **Concurrencia real.** Los escenarios de carrera (JRN-06, JRN-21) son deducidos del código; no los reproduje. El nivel de aislamiento de transacción configurado en Drizzle/Postgres (que no verifiqué) podría alterar el resultado.
10. **`src/tests/aislamientoModo.vitest.ts`** es el único test que menciona asientos. No lo leí ni lo ejecuté, así que no sé qué invariantes cubre ni si alguno de estos hallazgos ya está cubierto por una prueba que actualmente falle o esté omitida.
