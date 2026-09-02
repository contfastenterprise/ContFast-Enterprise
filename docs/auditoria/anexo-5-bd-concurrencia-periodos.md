# AUDITORÍA DB / CONCURRENCIA / PERÍODOS / TRAZABILIDAD — ContFast v.2

**Alcance verificado:** 89 tablas en `src/db/schema/*.ts` (91 `CREATE TABLE` en `drizzle/`), 39 migraciones SQL (`0000`→`0038`), 177 rutas `route.ts`, capa `src/services/` y `src/repositories/`, `src/middleware/permissions.ts`, `src/db/index.ts`.

---

## TABLA-INVENTARIO (extracto contable — las 89 tablas se listan al final por grupos)

| Tabla | companyId | deletedAt | createdBy | FKs clave | Fuente |
|---|---|---|---|---|---|
| chart_of_accounts | ✅ | ✅ | ❌ | company, parent(self) | accounting.ts:12 |
| journal_entries | ✅ | ✅ | ❌ | company | accounting.ts:31 |
| journal_entry_lines | ✅ | ❌ | ❌ | company, entry, account | accounting.ts:49 |
| accounts_receivable | ✅ | ✅ | ❌ | company, customer, invoice | accounting.ts:68 |
| customer_receipts | ✅ | ✅ | ❌ | company, customer | accounting.ts:88 |
| **customer_receipt_applied** | **❌** | ❌ | ❌ | receipt, ar | accounting.ts:108 |
| accounts_payable | ✅ | ✅ | ❌ | company, supplier, PO, expense | accounting.ts:119 |
| supplier_payments | ✅ | ✅ | ❌ | company, supplier | accounting.ts:139 |
| **supplier_payment_applied** | **❌** | ❌ | ❌ | payment, ap | accounting.ts:159 |
| checks | ✅ | ✅ | ❌ | company, bank_account, ap | accounting.ts:170 |
| ap_payments | ✅ | ❌ | ❌ | company, ap, check, 2×account | accounting.ts:197 |
| expenses | ✅ | ✅ | ❌ | company, warehouse, supplier | accounting.ts:218 |
| **expense_lines** | **❌** | ❌ | ❌ | expense(cascade), product | accounting.ts:251 |
| accounting_periods | ✅ | ❌ | ⚠️ `closedBy` **sin FK** | company | accounting.ts:267 |
| accounting_mappings | ✅ | ❌ | ❌ | company, account | accounting.ts:285 |
| financial_movements | ✅ | ❌ | ✅ `userId` | company, customer, supplier, user; `documentId` **sin FK** | accounting.ts:296 |
| invoices | ✅ | ✅ | ✅ `userId` | 7 FKs | invoices.ts:116 |
| **invoice_lines** | **❌** | ❌ | ❌ | invoice, product, warehouse | invoices.ts:168 |
| **invoice_taxes** | **❌** | ❌ | ❌ | invoice | invoices.ts:184 |
| **invoice_retentions** | **❌** | ❌ | ✅ | invoice, retention | invoices.ts:289 |
| **quote_lines / quote_taxes** | **❌** | ❌ | ❌ | quote | invoices.ts:89,104 |
| **delivery_note_lines** | **❌** | ❌ | ❌ | delivery_note, product | invoices.ts:244 |
| bank_accounts | ✅ | ✅ | ❌ | company | bank.ts:5 |
| bank_transactions | ✅ | ✅ | ❌ | company, bank_account | bank.ts:47 |
| inventory_levels | ✅ | ❌ | ❌ | company, product, warehouse | inventory.ts:33 |
| inventory_movements | ✅ | ❌ | ✅ `userId` | company, product, wh, user; `referenceId` **sin FK** | inventory.ts:49 |
| **inventory_transfer_lines** | **❌** | ❌ | ❌ | transfer, product | inventory.ts:85 |
| **purchase_order_items / _logs** | **❌** | ❌ | ❌/✅ | purchase_order | supplier_orders.ts:42,57 |
| audit_logs | ✅ | ❌ | ✅ `userId` | company, user; `entityId` **sin FK** | system.ts:7 |

**Sin `company_id` en la BD (verificado sobre `drizzle/*.sql`, 18 tablas):** `customer_receipt_applied`, `supplier_payment_applied`, `expense_lines`, `invoice_lines`, `invoice_taxes`, `invoice_retentions`, `quote_lines`, `quote_taxes`, `delivery_note_lines`, `inventory_transfer_lines`, `purchase_order_items`, `purchase_order_logs`, `supplier_order_lines` + catálogos globales legítimos (`companies`, `permissions`, `plans`, `isr_brackets`, `route_mappings`).

**Sin `createdBy`/`userId` (tablas contables):** `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `accounts_receivable`, `accounts_payable`, `customer_receipts`, `supplier_payments`, `customer_receipt_applied`, `supplier_payment_applied`, `checks`, `ap_payments`, `expenses`, `expense_lines`, `accounting_mappings`, `bank_accounts`, `bank_transactions`, `bank_reconciliations`, `inventory_levels`.

---

# HALLAZGOS

## DB-01 🔴 CRÍTICO — Las tablas de detalle contable no tienen `company_id` y quedan fuera de toda la protección multiempresa

**MÓDULO:** Esquema global / RLS

**DESCRIPCIÓN:** 13 tablas de detalle contable carecen de `company_id`. Esto no es solo un tema de conveniencia: la política RLS del sistema se genera *iterando sobre las tablas que tienen la columna*, de modo que estas tablas quedaron **sin RLS y sin política alguna**.

**CAUSA RAÍZ:** La migración `0024_enable_rls_policies.sql` recorre `information_schema.columns WHERE column_name = 'company_id'`. Lo que no tiene la columna, no entra en el bucle.

**EVIDENCIA:**
```sql
-- drizzle/0024_enable_rls_policies.sql:5-12
    FOR r IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND column_name = 'company_id'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
```
```typescript
// src/db/schema/accounting.ts:108-113
export const customerReceiptApplied = pgTable('customer_receipt_applied', {
  id: uuid('id').defaultRandom().primaryKey(),
  receiptId: uuid('receipt_id').notNull().references(() => customerReceipts.id),
  arId: uuid('ar_id').notNull().references(() => accountsReceivable.id),
  amountApplied: decimal('amount_applied', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
```

**ESCENARIO:** Un informe de aplicaciones de cobro que consulte `customer_receipt_applied` sin unir hacia `customer_receipts` mezcla aplicaciones de todas las empresas del sistema. Lo mismo con `invoice_lines` para un reporte de productos más vendidos.

**IMPACTO CONTABLE:** Detalle de facturas, aplicaciones de cobro/pago y líneas de gasto sin frontera de empresa. Un descuadre entre cabecera y detalle no es detectable a nivel de BD.

**IMPACTO EN BD:** Imposible escribir un `CHECK` o una restricción de integridad por empresa sobre el detalle. Imposible aplicar RLS sin migrar antes la columna.

**RIESGO MULTIEMPRESA:** 🔴 Máximo. La única barrera es que cada consulta recuerde unir hacia la cabecera y filtrar allí.

**SOLUCIÓN RECOMENDADA:** Añadir `company_id` (denormalizado) a las 13 tablas, rellenarlo desde la cabecera, declararlo `NOT NULL`, y añadir la FK compuesta `(cabecera_id, company_id) → cabecera(id, company_id)` — el patrón que la migración `0032_aislamiento_estructural.sql` ya aplica a otras tablas. Después re-ejecutar el bucle de RLS.

**RIESGO DE IMPLEMENTARLA:** 🟠 Medio-alto. Requiere backfill sobre tablas grandes y `NOT NULL` con `NOT VALID` + `VALIDATE` posterior. Toda consulta de detalle debe revisarse. Hacer en ventana de mantenimiento.

---

## DB-02 🔴 CRÍTICO — La política RLS permite todo cuando no hay contexto, y el contexto no se establece nunca

**MÓDULO:** `src/db/index.ts` / RLS

**DESCRIPCIÓN:** La política `tenant_isolation_policy` está escrita con una cláusula que **permite el acceso cuando `app.current_company_id` no está definido**. La única función que define ese contexto, `withTenantContext`, **no tiene ni un solo llamador en todo el código**.

**CAUSA RAÍZ:** Diseño fail-open + helper huérfano.

**EVIDENCIA:**
```sql
-- drizzle/0024_enable_rls_policies.sql:22-25
            USING (
                (NULLIF(current_setting(''app.current_company_id'', true), '''') IS NULL) OR
                (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid)
            )
```
El propio repositorio lo documenta en `drizzle/0037_negar_acceso_publico.sql:22-30`:
```
--      USING (current_setting('app.current_company_id') IS NULL  OR  company_id = ...)
--
--  PERMITE cuando no hay contexto. Comprobado contra PostgreSQL:
--
--      anon sin contexto ................ 1 fila visible   <-- ve todo
--      anon con contexto de otra empresa. 0 filas
```
Y el helper está sin uso:
```
$ grep -rn "withTenantContext" src/ --include=*.ts | grep -v "db/index.ts"
=== FIN ===        # cero resultados
```
```typescript
// src/db/index.ts:37-48  — definido y exportado, nunca invocado
export async function withTenantContext<T>(
  companyId: string, modo: 'PRODUCCION' | 'PRUEBA', fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_company_id', ${companyId}, true)`);
```

**ESCENARIO:** Cualquier consulta de la aplicación a la que se le olvide el `eq(tabla.companyId, session.companyId)` devuelve filas de todas las empresas. RLS no la detiene porque la conexión de la app nunca fija el contexto. La migración `0037` cierra el agujero para `anon`/`authenticated` (Data API de Supabase), pero **no para la propia conexión de la aplicación**.

**IMPACTO CONTABLE:** La segunda línea de defensa contra fuga de datos entre empresas es inexistente. Todos los hallazgos de filtrado que existan en la capa de aplicación pasan directo a la respuesta HTTP.

**IMPACTO EN BD:** RLS está habilitado y `FORCE`, con coste de planificación, pero sin efecto útil.

**RIESGO MULTIEMPRESA:** 🔴 Máximo.

**SOLUCIÓN RECOMENDADA:** Dos pasos. (a) Envolver el manejador de cada ruta autenticada en `withTenantContext(session.companyId, session.modo, ...)`. (b) Solo después de (a), reescribir la política eliminando la rama `IS NULL` (fail-closed). El orden importa: invertirlo deja la aplicación sin poder leer nada.

**RIESGO DE IMPLEMENTARLA:** 🔴 Alto. Fail-closed sin (a) completo es una caída total. Requiere cobertura de pruebas por ruta antes de invertir la política.

---

## DB-03 🔴 CRÍTICO — La base de datos no tiene prácticamente ningún CHECK contable

**MÓDULO:** Esquema global

**DESCRIPCIÓN:** En las 39 migraciones existe **exactamente un** `CHECK`, y está declarado `NOT VALID`. No hay ninguno sobre importes, débitos, créditos, saldos ni cantidades.

**EVIDENCIA:** Búsqueda exhaustiva sobre `drizzle/*.sql` (excluidas las cláusulas `WITH CHECK` de políticas RLS y los nombres de FK que contienen «check»):
```
$ grep -rniE "CONSTRAINT +\"?[a-z_]+\"? +CHECK" drizzle/*.sql
0031_inventario_no_negativo.sql:31:    ADD CONSTRAINT "chk_inventory_no_negativo" CHECK ("quantity" >= 0) NOT VALID;
```
Único resultado. Y la propia migración advierte que no valida lo existente:
```sql
-- drizzle/0031_inventario_no_negativo.sql:8-11
-- Se anade NOT VALID a proposito: la restriccion se aplica a partir de ahora a
-- toda insercion y actualizacion, pero NO se validan las filas existentes. Si
-- ya hay niveles negativos por el bug anterior, el despliegue no falla.
```

**CHECKs obligatorios ausentes:**

| Restricción | Tabla | Columna(s) |
|---|---|---|
| `debit >= 0` | `journal_entry_lines` | `debit` (accounting.ts:55) |
| `credit >= 0` | `journal_entry_lines` | `credit` (accounting.ts:56) |
| `NOT (debit > 0 AND credit > 0)` | `journal_entry_lines` | ambos |
| `debit > 0 OR credit > 0` | `journal_entry_lines` | ambos |
| `balance >= 0 AND balance <= amount` | `accounts_receivable` | accounting.ts:74-75 |
| `balance >= 0 AND balance <= amount` | `accounts_payable` | accounting.ts:126-127 |
| `amount > 0` | `customer_receipts`, `supplier_payments`, `checks`, `ap_payments` | |
| `amount_applied > 0` | `customer_receipt_applied`, `supplier_payment_applied` | |
| `quantity > 0`, `unit_cost >= 0` | `expense_lines` | accounting.ts:256-257 |
| `end_date >= start_date` | `accounting_periods` | accounting.ts:272-273 |
| `status IN (...)` | todas las columnas `status` varchar | |

**ESCENARIO:** Un `UPDATE` directo, un script de corrección o el bug de DB-13 dejan `accounts_receivable.balance` negativo o mayor que `amount`. Nada lo impide. El cuadre solo se descubre al conciliar manualmente.

**IMPACTO CONTABLE:** Estados financieros pueden construirse sobre filas imposibles. Una línea de asiento con débito y crédito simultáneos rompe la partida doble sin que ninguna capa lo note (la validación de cuadre solo vive en JS, en `createJournalEntry`).

**IMPACTO EN BD:** Datos corruptos indetectables sin auditoría manual.

**RIESGO MULTIEMPRESA:** 🟡 Bajo (afecta a todas por igual, no cruza empresas).

**SOLUCIÓN RECOMENDADA:** Añadir los CHECK como `NOT VALID`, ejecutar consultas de saneamiento por cada uno, y luego `VALIDATE CONSTRAINT`. Es el patrón que la `0031` ya documenta.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo con `NOT VALID`. El riesgo real es descubrir volumen de datos ya inconsistentes que exija ajustes contables.

---

## DB-04 🔴 CRÍTICO — El NCF se predice sin bloqueo y se envía a la DGII antes de reservarlo

**MÓDULO:** Facturación / e-CF (República Dominicana)

**DESCRIPCIÓN:** El flujo de emisión **calcula** el siguiente NCF con una lectura sin bloqueo, **lo envía a la DGII**, y solo después abre la transacción que lo reserva. Existen dos funciones: `predictNextNcf` (sin `FOR UPDATE`) y `allocateNextNcf` (con `FOR UPDATE`), y el envío fiscal ocurre entre una y otra.

**CAUSA RAÍZ:** La reserva atómica está correctamente implementada, pero se ejecuta *después* del efecto externo irreversible.

**EVIDENCIA — la secuencia completa:**
```typescript
// src/services/invoiceService.ts:41-57
    // ── 4. Predict next NCF without incrementing database sequence yet ────────
    const { ncf } = await InvoiceDbBooker.predictNextNcf(data.companyId, data.ecfType, data.modo);
    ...
    // ── 4. Submit to DGII / MSeller ───────────────────────────────────────────
    let submission: DgiiSubmissionResult;
    try {
      submission = await InvoiceSubmissionService.submitToDgii(
        data, ncf, company, settings, totals, activeCashSessionId
      );
```
```typescript
// src/services/invoice/invoiceDbBooker.ts:131-146 — predictNextNcf: SIN bloqueo
  static async predictNextNcf(companyId: string, ecfType: string, modo: ... ) {
    const seqRecord = await CompanyRepository.getSequence(companyId, ecfType, modo);
    ...
    const nextVal = seqRecord.currentSequence + 1;
```
```typescript
// src/repositories/companyRepository.ts:64-77 — getSequence: SELECT plano, sin .for('update')
    const [sequence] = await db.select().from(ecfSequences).where(...).limit(1);
```
El bloqueo sí existe, pero solo en la reserva, ya pasada la llamada a la DGII:
```typescript
// src/services/invoice/invoiceDbBooker.ts:224-229
    return await db.transaction(async (tx) => {
      const allocatedNcf = await CompanyRepository.allocateNextNcf(tx, data.companyId, data.ecfType, data.modo);
      if (allocatedNcf !== ncf) {
        throw new Error(`Conflicto de concurrencia NCF: se esperaba ${ncf} pero se reservó ${allocatedNcf}. Por favor intente de nuevo.`);
      }
```
```typescript
// src/repositories/companyRepository.ts:113-115
      .orderBy(desc(ecfSequences.createdAt))
      .limit(1)
      .for('update'); // Row locking for thread safety!
```

**ESCENARIO:** Dos cajeros facturan a la vez (o un usuario hace doble clic). Ambas peticiones ejecutan `predictNextNcf` y obtienen **el mismo** `E310000000123`. Ambas construyen el e-CF con ese NCF y lo **envían firmado a la DGII**. Después, `allocateNextNcf` serializa: la primera reserva 123 y guarda; la segunda reserva 124, detecta `124 !== 123` y **lanza excepción, abortando la transacción**.

Resultado: la DGII recibió **dos comprobantes con el NCF 123**, y en el ERP solo existe uno. La segunda venta no queda registrada en ninguna parte, pero su e-CF sí está en la DGII.

**IMPACTO CONTABLE:** NCF duplicado ante la DGII — infracción fiscal directa. Venta emitida y entregada al cliente que no existe en el sistema: ingreso no registrado, ITBIS no declarado, inventario no descontado. El 606/607 saldrá inconsistente contra lo que la DGII ya tiene.

**IMPACTO EN BD:** Salto silencioso de secuencia (se consume el 124 sin factura asociada) o, en el caso de rechazo, la ruta `saveRejectedInvoice` (invoiceDbBooker.ts:161-165) repite exactamente el mismo patrón.

**RIESGO MULTIEMPRESA:** 🟡 Contenido por empresa (la secuencia está acotada por `company_id`, `ecf_type` y `modo`).

**SOLUCIÓN RECOMENDADA:** Invertir el orden. Reservar el NCF con `allocateNextNcf` en una transacción corta y **confirmada** *antes* de llamar a la DGII, registrando la factura en estado `pending_dgii`. Enviar después, y actualizar el estado según la respuesta. Un NCF reservado y no usado es un hueco justificable ante la DGII; un NCF duplicado no lo es. Nótese que el número interno (`codigo_factura`) ya sigue el patrón correcto — ver `src/services/invoice/codigoFactura.ts:64-71`, `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.

**RIESGO DE IMPLEMENTARLA:** 🟠 Medio. Cambia la máquina de estados de la factura y exige un proceso de reconciliación para las que queden en `pending_dgii`. Es el hallazgo de mayor prioridad de todo el informe.

---

## DB-05 🔴 CRÍTICO — El cierre de período solo bloquea los asientos manuales; el resto de la contabilidad sigue escribiendo

**MÓDULO:** Contabilidad / Períodos

**DESCRIPCIÓN:** Existe validación de período abierto, pero está aplicada **en un solo punto**: `AccountRepository.createJournalEntry`. Ninguna otra operación contable la consulta. No existe ninguna otra comprobación de período en todo el backend.

**QUÉ BUSQUÉ EXACTAMENTE (todo con cero resultados salvo lo indicado):**
```
$ grep -rniE "periodo cerrado|period.*closed|closedPeriod|isPeriodClosed|assertPeriod|validatePeriod|periodo_cerrado|PERIOD_CLOSED" src/
=== FIN ===        # cero resultados

$ grep -rn "isPeriodOpen" src/ tests/ scripts/
src/app/api/v1/accounting/periods/route.ts:37:      // (comentario)
src/repositories/accountingRepository.ts:227:  static async isPeriodOpen(...)      # definición
src/repositories/accountingRepository.ts:303:      const isOpen = await this.isPeriodOpen(...)   # ÚNICO llamador
```

**EVIDENCIA — el único punto protegido:**
```typescript
// src/repositories/accountingRepository.ts:301-305
    const executeInsertion = async (transactionContext: any) => {
      // 2. Validate open period
      const isOpen = await this.isPeriodOpen(data.companyId, formattedDate, data.modo, transactionContext);
      if (!isOpen) {
        throw new Error(`El periodo contable para la fecha ${formattedDate} está cerrado o no existe.`);
```

**Operaciones que escriben en la contabilidad SIN pasar por ahí:**

| Operación | Evidencia | Escribe en |
|---|---|---|
| Registro de cobro a cliente | `src/repositories/arRepository.ts:189` y `:199` — `tx.insert(journalEntries)` / `tx.insert(journalEntryLines)` **directos** | `journal_entries`, `journal_entry_lines`, `accounts_receivable`, `cash_movements`, `financial_movements` |
| Emisión de factura | `src/services/invoice/invoiceDbBooker.ts:224` | `invoices`, `accounts_receivable`, `inventory_levels` |
| Borrado de compra/gasto | `src/app/api/v1/expenses/[id]/route.ts:357-372` — **borra asientos** | `journal_entries`, `journal_entry_lines`, `accounts_payable` |
| Transacciones bancarias | `src/app/api/v1/bank/accounts/[id]/transactions/route.ts` | `bank_transactions`, `bank_account_balances` |
| Ajustes de inventario | `src/app/api/v1/inventory/adjustments/route.ts:106-122` | `inventory_levels`, `inventory_movements` |
| Cierre de caja | `src/services/cashService.ts:119` | `cash_sessions`, `cash_session_summary` |

El caso de `arRepository` es el más grave porque **construye el asiento a mano**, saltándose no solo la validación de período sino también la de cuadre de partida doble:
```typescript
// src/repositories/arRepository.ts:188-199
      const entryId = uuidv4();
      await tx.insert(journalEntries).values({
        id: entryId, companyId: data.companyId, modo: data.modo,
        date: data.date, reference: receiptId.slice(0, 8),
        description: `Recibo de Cobro - Cliente ID: ${data.customerId.slice(0,8)}`,
        status: 'posted'
      });

      await tx.insert(journalEntryLines).values([
```

**ESCENARIO:** Contabilidad cierra junio, emite estados financieros y los entrega. En julio, un cajero registra un cobro con fecha 28 de junio. El asiento entra en `journal_entries` con fecha de junio sin obstáculo, porque `registerReceipt` no consulta el período. El balance general de junio ya entregado deja de cuadrar contra la BD.

**IMPACTO CONTABLE:** El cierre contable no cierra nada. Los estados financieros de un período cerrado son mutables indefinidamente. No hay garantía de inmutabilidad histórica, que es el propósito mismo de la tabla `accounting_periods`.

**IMPACTO EN BD:** `accounting_periods.status = 'closed'` es un dato decorativo para todo salvo los asientos manuales.

**RIESGO MULTIEMPRESA:** 🟢 Bajo (los períodos ya están acotados por `company_id` y `modo`).

**SOLUCIÓN RECOMENDADA:** Dos capas. (a) Extraer un `assertPeriodOpen(companyId, modo, fecha, tx)` e invocarlo al inicio de cada servicio que escriba con fecha contable. (b) Red de seguridad en BD: un trigger `BEFORE INSERT OR UPDATE OR DELETE` sobre `journal_entries`, `journal_entry_lines`, `accounts_receivable`, `accounts_payable`, `bank_transactions` e `inventory_movements` que consulte `accounting_periods` y rechace. Además, unificar `registerReceipt` para que use `AccountRepository.createJournalEntry` en vez de insertar a mano.

**RIESGO DE IMPLEMENTARLA:** 🟠 Medio. Un trigger de este tipo puede romper procesos de corrección legítimos y los scripts de saneamiento. Necesita una vía de excepción explícita y auditada.

---

## DB-06 🔴 CRÍTICO — No existe ninguna clave de idempotencia en todo el sistema

**MÓDULO:** Transversal (todas las rutas de escritura)

**DESCRIPCIÓN:** Búsqueda exhaustiva sin un solo resultado. Ni claves de idempotencia, ni tokens de solicitud, ni deduplicación.

**EVIDENCIA:**
```
$ grep -rniE "idempoten|requestId|request_id|X-Request|dedupe|nonce" src/app/api src/services src/middleware src/db --include=*.ts
=== FIN ===        # cero resultados
```
La única defensa es el limitador de tasa, que es por IP y no por operación:
```typescript
// src/app/api/v1/ar/receipts/route.ts:58-59
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
```

**ESCENARIO:** Un cajero pulsa «Registrar cobro» dos veces (o la red reintenta un POST cuya respuesta se perdió). Se crean **dos** `customer_receipts` por el mismo importe, se aplican **dos veces** contra la misma factura, se descuenta **dos veces** el saldo de `accounts_receivable`, se generan **dos** asientos y **dos** movimientos de caja.

**IMPACTO CONTABLE:** Cobros e ingresos duplicados. Combinado con DB-03 (sin `CHECK balance >= 0`) y DB-08 (sin validación de sobreaplicación), el saldo de la cuenta por cobrar queda **negativo** y el cliente aparece con saldo a favor inexistente. El asiento duplicado infla caja contra cuentas por cobrar.

**IMPACTO EN BD:** Filas duplicadas indistinguibles de operaciones legítimas — no hay forma automática de decidir cuál borrar.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Cabecera `Idempotency-Key` obligatoria en los POST contables, con tabla `idempotency_keys (company_id, key, endpoint, response_hash, created_at)` y `UNIQUE (company_id, key)`. La primera petición inserta y ejecuta; una repetición choca contra el índice y devuelve la respuesta almacenada. Como mitigación inmediata y barata: `UNIQUE (company_id, customer_id, date, amount, reference)` sobre `customer_receipts` y su equivalente en `supplier_payments`.

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio-bajo. El índice único de mitigación puede rechazar dos cobros idénticos legítimos el mismo día; conviene incluir `reference` para desambiguar.

---

## DB-07 🟠 ALTO — Los saldos se actualizan con leer-modificar-escribir

**MÓDULO:** Cuentas por cobrar / por pagar / Inventario

**DESCRIPCIÓN:** Tres de los cuatro saldos críticos se leen a memoria, se calculan en JavaScript y se reescriben con el valor absoluto. Sin `FOR UPDATE` y sin operación atómica.

**EVIDENCIA — `accounts_receivable`:**
```typescript
// src/repositories/arRepository.ts:130-149
        const [ar] = await tx
          .select()
          .from(accountsReceivable)
          .where(and(
            eq(accountsReceivable.id, applied.arId),
            eq(accountsReceivable.companyId, data.companyId),
            eq(accountsReceivable.modo, data.modo)
          ));
        if (ar) {
          const newBalance = parseFloat(ar.balance as any) - applied.amountApplied;
          await tx.update(accountsReceivable)
            .set({ 
              balance: newBalance.toString(),
              status: newBalance <= 0.01 ? 'paid' : 'pending'
            })
```
**`accounts_payable`:**
```typescript
// src/services/apService.ts:214-232
        const amountNum = parseFloat(payment.amount);
        const apBalance = parseFloat(ap.balance);
        const newBalance = Math.max(0, apBalance - amountNum);
        ...
        await ApRepository.updateApBalance(tx, ap.id, companyId, newBalance);
```
**`inventory_levels`:**
```typescript
// src/services/inventoryService.ts:234-260
  let [level] = await tx.select().from(inventoryLevels).where(...);
  ...
  const newQuantity = Number(level.quantity) + quantity;
  await tx.update(inventoryLevels)
    .set({ quantity: newQuantity.toString(), updatedAt: new Date() })
    .where(eq(inventoryLevels.id, level.id));
```

**Excepción positiva — `bank_account_balances` sí es atómico:**
```typescript
// src/repositories/bankRepository.ts:108-114
    const filas = (await tx.execute(sql`
      UPDATE bank_account_balances
         SET balance = balance + ${delta.toString()}::numeric, updated_at = now()
       WHERE bank_account_id = ${bankAccountId}::uuid
```
Este es el patrón correcto y ya existe en la casa; solo falta replicarlo.

**ESCENARIO:** Dos cobros concurrentes contra la misma factura (saldo 1000, uno aplica 400 y otro 600). En el nivel de aislamiento por defecto de PostgreSQL (`READ COMMITTED`) ambas transacciones leen 1000. La primera escribe 600, la segunda escribe 400. Saldo final: 400, cuando debería ser 0. Se perdió una aplicación de 600 pesos, pero **ambas filas de `customer_receipt_applied` existen**.

**IMPACTO CONTABLE:** El saldo del auxiliar de clientes deja de cuadrar contra la suma de sus aplicaciones y contra el mayor. En inventario, la existencia queda por encima de la real y se vende mercancía que no hay.

**IMPACTO EN BD:** Actualización perdida clásica. Invisible en los logs.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Sustituir por `UPDATE ... SET balance = balance - $delta ... RETURNING balance` y validar el resultado. En su defecto, añadir `.for('update')` al `SELECT` previo — el patrón ya está en uso en `companyRepository.ts:115`.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo. Cambio local y bien acotado. `FOR UPDATE` puede introducir esperas bajo carga alta sobre la misma factura, pero eso es precisamente lo deseado.

---

## DB-08 🟠 ALTO — El registro de cobro no valida sobreaplicación ni que la CxC pertenezca al cliente

**MÓDULO:** Cobros (AR)

**DESCRIPCIÓN:** `registerReceipt` acepta `arId` y `amountApplied` del cuerpo de la petición. Valida que la suma aplicada coincida con el total del recibo, pero **no** valida que cada `amountApplied` quepa en el saldo de esa CxC, **ni** que la CxC pertenezca al cliente del recibo, **ni** que no esté borrada.

**EVIDENCIA — lo único que se valida en la ruta:**
```typescript
// src/app/api/v1/ar/receipts/route.ts:84-91
    // Verify sum of applied amounts equals total amount
    const totalApplied = parsed.data.invoicesApplied.reduce((sum, inv) => sum + inv.amountApplied, 0);
    if (Math.abs(totalApplied - parsed.data.amount) > 0.01) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'La suma del monto aplicado a las facturas no coincide con el total del recibo.' } },
```
**Y en el repositorio, el filtro por `customerId` está ausente y no hay tope de saldo:**
```typescript
// src/repositories/arRepository.ts:130-143
        const [ar] = await tx
          .select()
          .from(accountsReceivable)
          .where(and(
            eq(accountsReceivable.id, applied.arId),
            eq(accountsReceivable.companyId, data.companyId),
            eq(accountsReceivable.modo, data.modo)
          ));
        if (ar) {
          const newBalance = parseFloat(ar.balance as any) - applied.amountApplied;
```
Obsérvese: hay `companyId` y `modo` (correcto), pero **no** `eq(accountsReceivable.customerId, data.customerId)` ni `isNull(accountsReceivable.deletedAt)`. Y `newBalance` no tiene suelo — compárese con el `Math.max(0, ...)` que sí usa el lado de proveedores en `apService.ts:218`.

**ESCENARIO:** Un usuario registra un cobro de 5.000 al cliente A, pero envía en `invoicesApplied` el `arId` de una factura del **cliente B** (obtenible desde cualquier listado de la misma empresa). El sistema salda la factura de B con el dinero de A. Alternativamente, aplica 5.000 a una factura cuyo saldo es 1.000: el saldo queda en **-4.000**.

**IMPACTO CONTABLE:** Estado de cuenta de clientes falseado. Un cliente aparece pagado sin haber pagado, y otro con saldo negativo. La antigüedad de saldos y las provisiones de incobrables se calculan sobre datos incorrectos.

**IMPACTO EN BD:** `balance` negativo, que sin el `CHECK` de DB-03 nadie detiene, y `status = 'paid'` sobre una factura pendiente.

**RIESGO MULTIEMPRESA:** 🟢 Bajo — `companyId` y `modo` sí se filtran. El cruce es **entre clientes de la misma empresa**.

**SOLUCIÓN RECOMENDADA:** Añadir al `where`: `eq(accountsReceivable.customerId, data.customerId)` e `isNull(accountsReceivable.deletedAt)`. Lanzar excepción (no `if (ar)` silencioso) cuando no se encuentre la fila. Rechazar `applied.amountApplied > parseFloat(ar.balance) + 0.01`. Complementar con los CHECK de DB-03.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo. Puede rechazar operaciones que hoy pasan; conviene revisar antes si existen CxC con saldo negativo, señal de que ya ocurrió.

---

## DB-09 🟠 ALTO — Los estados financieros oficiales no filtran asientos borrados

**MÓDULO:** Reportes / Contabilidad

**DESCRIPCIÓN:** `journal_entries` tiene `deleted_at` (accounting.ts:41), pero el estado de resultados y el balance general no lo filtran. Tampoco filtran `chart_of_accounts.deleted_at`.

**EVIDENCIA — estado de resultados:**
```typescript
// src/repositories/reportRepository.ts:40-53
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.modo, modo),
      eq(journalEntryLines.modo, modo),
      eq(journalEntries.status, 'posted'),
      gte(journalEntries.date, startDate),
      lte(journalEntries.date, endDate)
    ))
    .groupBy(journalEntryLines.accountId);
```
**Balance general — mismo defecto:**
```typescript
// src/repositories/reportRepository.ts:123-132
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.modo, modo),
      eq(journalEntryLines.modo, modo),
      eq(journalEntries.status, 'posted'),
      lte(journalEntries.date, asOfDate)
    ))
```
**Y el catálogo de cuentas tampoco:**
```typescript
// src/repositories/reportRepository.ts:27-32
    const accounts = await db.select()
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId),
        sql`${chartOfAccounts.type} IN ('revenue', 'expense', 'cost')`
      ));
```

**Barrido completo de filtrado de borrado lógico** (ventana de ±6/14 líneas alrededor de cada `.from(tabla)`):

| Tabla | `.from()` | Sin filtro `deletedAt` |
|---|---|---|
| `invoices` | 50 | **28** |
| `customers` | 22 | **16** |
| `expenses` | 19 | **13** |
| `accountsPayable` | 25 | **13** |
| `products` | 26 | **13** |
| `chartOfAccounts` | 19 | **12** |
| `suppliers` | 13 | **11** |
| `accountsReceivable` | 20 | **9** |
| `checks` | 10 | **8** |
| `journalEntries` | 6 | **6** |
| `quotes` | 6 | **6** |
| `apPayments` | 6 | **6** |

(Contraejemplo correcto: `src/app/api/v1/reports/receivables/route.ts:17-22` sí incluye `isNull(accountsReceivable.deletedAt)`.)

**ESCENARIO:** Se anula un asiento marcando `deleted_at`. El asiento sigue sumando en el balance general y en el estado de resultados. La utilidad del ejercicio reportada incluye movimientos anulados.

**IMPACTO CONTABLE:** Estados financieros oficiales sobrevalorados o infravalorados según el signo de lo anulado. No hay forma de anular un asiento sin ensuciar los reportes.

**IMPACTO EN BD:** El borrado lógico no cumple su función; coexisten dos verdades según qué consulta se ejecute.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Añadir `isNull(journalEntries.deletedAt)` e `isNull(chartOfAccounts.deletedAt)` a ambas consultas, y barrer las 141 ocurrencias restantes priorizando reportes. A medio plazo, sustituir las lecturas directas por vistas `v_journal_entries_activos` que ya incorporen el filtro, para que no dependa de que cada consulta lo recuerde.

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio. Las cifras de los reportes **cambiarán** tras el arreglo. Hay que comunicarlo y conservar el comparativo antes/después.

---

## DB-10 🟠 ALTO — El borrado de una compra elimina físicamente sus asientos contables

**MÓDULO:** Gastos / Compras

**DESCRIPCIÓN:** `DELETE /api/v1/expenses/[id]` ejecuta `DELETE` físico sobre `journal_entry_lines`, `journal_entries`, `accounts_payable`, `checks`, `ap_payments`, `expense_lines` y `expenses` — pese a que `expenses` y `journal_entries` tienen columna `deleted_at`. No escribe nada en `audit_logs`.

**EVIDENCIA:**
```typescript
// src/app/api/v1/expenses/[id]/route.ts:356-383
      // 5. Delete accounting journal entries linked to this expense
      const jes = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)));

      for (const je of jes) {
        // Delete lines first to satisfy foreign key constraints
        await tx
          .delete(journalEntryLines)
          .where(and(eq(journalEntryLines.journalEntryId, je.id), ...));
        
        // Delete header
        await tx
          .delete(journalEntries)
          .where(and(eq(journalEntries.id, je.id), eq(journalEntries.companyId, session.companyId)));
      }

      // 6. Delete expense lines explicitly (safety cascade)
      await tx
        .delete(expenseLines)
        .where(eq(expenseLines.expenseId, id));

      // 7. Delete the expense header
      const del = await tx
        .delete(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.companyId, session.companyId)))
```
Compárese con el borrado de facturas, que sí es lógico y está bien hecho:
```typescript
// src/app/api/v1/invoices/[id]/route.ts (handler DELETE)
    if (invoice.status !== 'draft') {
      return NextResponse.json(
        { ... message: 'Solo se pueden eliminar facturas en estado borrador.' } }, { status: 400, ... });
    }
    await db.update(invoices).set({ deletedAt: new Date() })
```
**Salvaguardas que sí tiene** (justo es reconocerlo): bloquea el borrado si hay `ap_payments` en estado `applied` (línea 313) o aplicaciones en `supplier_payment_applied` (línea 326), devolviendo 409.

**Fragilidad adicional:** el vínculo asiento↔gasto se resuelve por `journalEntries.reference = id`, y `reference` es un `varchar(255)` de texto libre sin índice único (accounting.ts:35). Un asiento manual cuya referencia coincida con ese UUID se borraría también.

**ESCENARIO:** Se elimina una compra a crédito sin pagos aplicados. Sus asientos desaparecen de `journal_entries`. El balance general de meses anteriores cambia retroactivamente y no queda ni rastro de qué se borró, ni quién, ni cuándo.

**IMPACTO CONTABLE:** Pérdida irreversible de historial contable. El mayor deja de ser un registro cronológico íntegro. Ante una fiscalización de la DGII no hay forma de justificar la diferencia.

**IMPACTO EN BD:** Datos irrecuperables sin restaurar copia de seguridad.

**RIESGO MULTIEMPRESA:** 🟢 Bajo — `companyId` se filtra correctamente en todos los `DELETE`.

**SOLUCIÓN RECOMENDADA:** Sustituir por anulación: marcar `deleted_at` y generar un **asiento de reversión** con fecha del día de la anulación (nunca del original), preservando ambos. Registrar en `audit_logs` con `oldValues`. Reemplazar el vínculo por texto con una columna `source_type`/`source_id` indexada.

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio. Los asientos de reversión cambian el aspecto de los reportes y requieren ajustar las consultas de DB-09 para que no cuenten dos veces.

---

## DB-11 🟠 ALTO — Rutas DELETE sin verificación de permisos

**MÓDULO:** Autorización / Transversal

**DESCRIPCIÓN:** De las 20 rutas con manejador `DELETE`, **nueve no invocan `enforcePermission` ni una sola vez**. Cualquier usuario autenticado con sesión válida las alcanza.

**EVIDENCIA — conteo de `enforcePermission` por fichero con handler DELETE:**
```
src/app/api/v1/admin/companies/[id]/route.ts     :: 0 enforce
src/app/api/v1/admin/sessions/route.ts           :: 0 enforce
src/app/api/v1/categories/[id]/route.ts          :: 0 enforce
src/app/api/v1/expenses/types/[id]/route.ts      :: 0 enforce
src/app/api/v1/expenses/[id]/route.ts            :: 0 enforce
src/app/api/v1/hr/departments/route.ts           :: 0 enforce
src/app/api/v1/hr/employees/route.ts             :: 0 enforce
src/app/api/v1/hr/entries/route.ts               :: 0 enforce
src/app/api/v1/hr/payroll/route.ts               :: 0 enforce
src/app/api/v1/hr/positions/route.ts             :: 0 enforce
src/app/api/v1/hr/settlements/route.ts           :: 0 enforce
src/app/api/v1/warehouses/[id]/route.ts          :: 0 enforce
```
`expenses/[id]` sustituye el control por una comprobación ad-hoc que usa `includes()` — exactamente el patrón que el propio proyecto documenta como corregido en otro sitio:
```typescript
// src/app/api/v1/expenses/[id]/route.ts (handler DELETE)
    if (!session.role.toLowerCase().includes('sistema')) {
      return NextResponse.json({ success: false, error: { message: 'No tiene permisos ... Solo usuarios de Sistemas pueden eliminar compras.' } }, { status: 403 });
    }
```
frente a la corrección ya aplicada en el middleware:
```typescript
// src/middleware/permissions.ts:145-151
export function isAdminOrSistemas(roleName: string): boolean {
  // Auditoria F0-05: comparacion exacta contra la lista cerrada de roles fijos.
  // Antes usaba includes(), de modo que cualquier rol cuyo nombre contuviera
  // "admin" o "sistema" pasaba este control.
  const normalizedRole = roleName.toLowerCase().trim();
  return normalizedRole === 'sistemas' || normalizedRole === 'administracion';
}
```

**ESCENARIO:** Se crea un rol llamado «Sistema de Facturación» para el personal de mostrador. `'sistema de facturación'.includes('sistema')` es `true`, de modo que ese usuario puede borrar compras con sus asientos contables (DB-10). En paralelo, un cajero puede llamar directamente a `DELETE /api/v1/hr/payroll` o `DELETE /api/v1/warehouses/[id]`.

**IMPACTO CONTABLE:** Borrado de nóminas, liquidaciones, almacenes y tipos de gasto por usuarios sin atribución. Combinado con DB-10, destrucción de asientos.

**IMPACTO EN BD:** Borrados no autorizados, en varios casos físicos.

**RIESGO MULTIEMPRESA:** 🟠 Alto en `admin/companies/[id]` — es la ruta de borrado de **empresas** y no comprueba permisos.

**SOLUCIÓN RECOMENDADA:** Añadir `enforcePermission(..., módulo, 'delete')` a las nueve rutas. Sustituir el `includes('sistema')` de `expenses/[id]` por `enforceAdminOrSistemas(session.role)`, que ya existe en `permissions.ts:153`. Considerar un envoltorio obligatorio para que una ruta nueva no pueda omitirlo.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo. Puede bloquear a usuarios que hoy operan de facto sin permiso; revisar `audit_permissions` antes para medir el uso real.

---

## DB-12 🟠 ALTO — El período contable se puede reabrir sin rol administrativo y sin dejar rastro

**MÓDULO:** Contabilidad / Períodos

**DESCRIPCIÓN:** El mismo endpoint cierra y reabre períodos. Exige `contabilidad:write`, permiso que el rol **no administrativo** `contabilidad` tiene por defecto. La operación no escribe en `audit_logs`, y al reabrir se **borran** `closedAt` y `closedBy`.

**EVIDENCIA:**
```typescript
// src/app/api/v1/accounting/periods/[id]/route.ts:29
    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'contabilidad', 'write');
```
```typescript
// src/app/api/v1/accounting/periods/[id]/route.ts:60-68
    const [updated] = await db.update(accountingPeriods)
      .set({
        status,
        closedAt: status === 'closed' ? new Date() : null,
        closedBy: status === 'closed' ? session.userId : null,
        updatedAt: new Date()
      })
      .where(eq(accountingPeriods.id, id))
      .returning();

    return NextResponse.json({ success: true, data: updated }, { headers: resHeaders });
```
No hay ningún `insert(auditLogs)` en el fichero (78 líneas en total, verificado íntegro). Y el rol tiene el permiso de serie:
```typescript
// src/constants/rolePermissions.ts:7-9
  contabilidad: {
    'contabilidad:read': true,
    'contabilidad:write': true,
```

**ESCENARIO:** Un contable reabre marzo, modifica un asiento, y vuelve a cerrarlo. `closedBy` y `closedAt` se sobrescriben con los suyos y la fecha nueva. No queda ninguna evidencia de que el período estuvo cerrado antes, de quién lo reabrió, ni de qué se tocó mientras estaba abierto.

**IMPACTO CONTABLE:** El cierre contable pierde su valor probatorio. Es el mecanismo natural para alterar resultados de un ejercicio ya reportado.

**IMPACTO EN BD:** Se destruye el histórico de cierre en cada reapertura, porque el campo es único y no un log.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Separar cerrar de reabrir. El cierre con `contabilidad:write`; la reapertura con `enforceAdminOrSistemas` más un motivo obligatorio. Registrar ambas en `audit_logs` con `oldValues`/`newValues` (la tabla es inmutable por trigger, ver DB-16, así que el rastro es fiable). Añadir `reopened_count` o una tabla `accounting_period_events` en vez de sobrescribir.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo.

---

## DB-13 🟠 ALTO — Faltan índices únicos que evitarían duplicados contables

**MÓDULO:** Esquema global

**DESCRIPCIÓN:** El esquema tiene una cobertura de unicidad **buena** en documentos fiscales, pero le faltan cuatro que importan.

**LO QUE SÍ EXISTE (verificado en `drizzle/*.sql`):**

| Índice | Definición |
|---|---|
| NCF por empresa y entorno | `CREATE UNIQUE INDEX "invoices_company_ncf_modo_idx" ON "invoices" USING btree ("company_id","ncf","modo")` |
| Código de factura | `CREATE UNIQUE INDEX "invoices_company_codigo_factura_modo_idx"` (0034) |
| Código de cuenta | `CREATE UNIQUE INDEX "chart_accounts_company_code_idx" ON "chart_of_accounts" USING btree ("company_id","code")` |
| RNC de cliente | `CREATE UNIQUE INDEX "customers_company_rnc_idx" ON "customers" USING btree ("company_id","rnc_cedula")` |
| RNC de proveedor | `CREATE UNIQUE INDEX "suppliers_company_rnc_idx" ON "suppliers" USING btree ("company_id","rnc")` |
| Número de cheque | `CREATE UNIQUE INDEX "checks_company_num_modo_idx" ON "checks" USING btree ("company_id","check_number","modo")` |
| Secuencias e-CF / cotización / factura / OC | `ecf_seq_company_type_modo_idx`, `quote_seq_company_year_modo_idx`, `invoice_seq_company_prefix_year_modo_idx`, `supplier_order_seq_company_year_modo_idx` |
| Conduces, OC, cotizaciones | `delivery_notes_num_modo_idx`, `purchase_orders_company_num_modo_idx`, `quotes_company_seq_modo_idx` |

**LO QUE FALTA:**

1. **SKU de producto** — solo índice **no** único:
```typescript
// src/db/schema/products.ts:52
  skuIdx: index('products_sku_idx').on(table.companyId, table.sku),
```
```sql
-- drizzle/0000_violet_pestilence.sql:634
CREATE INDEX "products_sku_idx" ON "products" USING btree ("company_id","sku");
```
Igual con `barcode` (products.ts:54). Dos productos con el mismo SKU rompen el kardex y la valuación de inventario.

2. **Referencia de asiento por empresa** — `journal_entries.reference` es texto libre sin restricción (accounting.ts:35). Es lo que usa `expenses/[id]` para localizar asientos a borrar (DB-10).

3. **Período contable** — `accounting_periods` no tiene **ningún** índice único (accounting.ts:279-283: solo `companyIdx`, `statusIdx`, `companyModoIdx`). La unicidad del nombre se comprueba en la aplicación con un patrón consultar-luego-insertar:
```typescript
// src/app/api/v1/accounting/periods/route.ts:85-101
    const existing = await db.select().from(accountingPeriods)
      .where(and(
        eq(accountingPeriods.companyId, session.companyId),
        eq(accountingPeriods.modo, session.modo),
        eq(accountingPeriods.name, parsed.data.name)
      )).limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ ... code: 'CONFLICT' ... }, { status: 409 });
    }

    const [period] = await db.insert(accountingPeriods).values({
```
Dos peticiones simultáneas crean dos «06/2026». Tampoco hay validación de solapamiento de fechas, así que `isPeriodOpen` (accountingRepository.ts:245-253, con `.limit(1)`) puede resolver contra un período distinto cada vez.

4. **`amountApplied` duplicado** — `customer_receipt_applied` / `supplier_payment_applied` no tienen unicidad sobre `(receipt_id, ar_id)`, permitiendo aplicar dos veces el mismo recibo a la misma factura.

**IMPACTO CONTABLE:** Duplicados de catálogo que descuadran inventario; períodos ambiguos que hacen impredecible la validación de cierre.

**RIESGO MULTIEMPRESA:** 🟢 Bajo — los índices existentes sí incluyen `company_id` de forma consistente.

**SOLUCIÓN RECOMENDADA:** Añadir `UNIQUE (company_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL`, `UNIQUE (company_id, modo, name)` sobre `accounting_periods`, una restricción de exclusión `EXCLUDE USING gist` para el solapamiento de rangos de fecha, y `UNIQUE (receipt_id, ar_id)` en las tablas de aplicación.

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio. Habrá duplicados preexistentes que impidan crear los índices; sanear primero.

---

## DB-14 🟠 ALTO — Ningún índice único contempla `deleted_at`

**MÓDULO:** Esquema global

**DESCRIPCIÓN:** **Cero** índices únicos parciales en las 39 migraciones. Un registro borrado lógicamente sigue ocupando su clave única para siempre.

**EVIDENCIA:**
```
$ grep -rn -A2 "CREATE UNIQUE INDEX" drizzle/*.sql | grep -i "where"
   (sin resultados)
```
Los cinco `WHERE deleted_at` que existen pertenecen a definiciones de **vistas**, no a índices:
```
drizzle/0001_real_timeslip.sql:4:  WHERE status = 'active' AND deleted_at IS NULL
drizzle/0036_saldo_banco_por_entorno.sql:67:WHERE a."deleted_at" IS NULL
```

**ESCENARIO:** Se da de baja al cliente con RNC `130123456` (`deleted_at` no nulo). Meses después el cliente vuelve. Al intentar crearlo, `customers_company_rnc_idx` lo rechaza con violación de índice único, refiriéndose a una fila que el usuario no ve en ninguna pantalla. La salida práctica del usuario será registrarlo con el RNC mal escrito, y entonces el 607 sale con un RNC inválido.

**IMPACTO CONTABLE:** RNC incorrectos en los reportes 606/607 ante la DGII, o imposibilidad de reactivar clientes, proveedores y productos.

**IMPACTO EN BD:** Índices únicos que no reflejan la semántica real (unicidad solo entre registros vivos).

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Recrear cada índice único sobre tablas con borrado lógico como parcial: `CREATE UNIQUE INDEX CONCURRENTLY ... WHERE deleted_at IS NULL`. Afecta a `customers_company_rnc_idx`, `suppliers_company_rnc_idx`, `chart_accounts_company_code_idx`, `checks_company_num_modo_idx`, `bank_accounts_company_acc_idx`, `warehouses_company_code_idx`, `cash_registers_company_code_idx`, `price_list_items_list_prod_idx`, `prod_barcodes_barcode_idx`.

**Excepción deliberada:** los índices sobre `invoices.ncf` y `codigo_factura` **NO** deben hacerse parciales — un NCF consumido no se reutiliza jamás, aunque la factura se anule.

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio. Usar `CONCURRENTLY` para no bloquear. Requiere revisar que ninguna lógica dependa del rechazo actual.

---

## DB-15 🟡 MEDIO — Claves foráneas ausentes en referencias por convención

**MÓDULO:** Esquema global

**DESCRIPCIÓN:** Cinco columnas referencian a otras tablas por convención de nombre, sin FK real.

**EVIDENCIA:**
```typescript
// src/db/schema/accounting.ts:276  — accounting_periods.closedBy
  closedBy: uuid('closed_by'),
```
Confirmado en la migración: `drizzle/0018_flashy_thor_girl.sql:18: "closed_by" uuid,` y ningún `ADD CONSTRAINT` sobre esa columna en toda la carpeta.
```typescript
// src/db/schema/accounting.ts:306  — financial_movements.documentId (polimórfica)
  documentId: uuid('document_id').notNull(),
```
```typescript
// src/db/schema/inventory.ts:59
  referenceId: uuid('reference_id'), // invoice_id, expense_id, transfer_id, etc.
```
```typescript
// src/db/schema/system.ts:14   — audit_logs.entityId
  entityId: uuid('entity_id'),
// src/db/schema/documents.ts:11 — document_shares.documentId
  documentId: uuid('document_id').notNull(),
```

**Matiz:** en `financial_movements`, `inventory_movements.referenceId`, `audit_logs.entityId` y `document_shares.documentId` la ausencia es **inherente al diseño polimórfico** — apuntan a tablas distintas según `movementType`/`entityType`. No es un defecto corregible con una FK simple. `accounting_periods.closedBy` **sí** es un descuido puro: apunta siempre a `users.id`.

**ESCENARIO:** Se borra un usuario. `accounting_periods.closedBy` queda apuntando a un UUID inexistente y el sistema pierde para siempre quién cerró ese período.

**IMPACTO CONTABLE:** Se pierde la atribución de responsabilidad del cierre contable.

**IMPACTO EN BD:** Referencias colgantes silenciosas.

**RIESGO MULTIEMPRESA:** 🟡 Medio en `financial_movements.documentId`: sin FK ni comprobación, un `documentId` de otra empresa puede insertarse en el estado de cuenta de esta.

**SOLUCIÓN RECOMENDADA:** Añadir `closed_by → users(id) ON DELETE RESTRICT` (corrección directa). Para las polimórficas, añadir la columna discriminadora al índice y un trigger de validación, o aceptar el diseño documentándolo. Nótese que `financial_movements` **sí** tiene ya la FK compuesta por empresa hacia cliente y proveedor (`0032_aislamiento_estructural.sql:225,229`), lo cual es correcto.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo para `closed_by`.

---

## DB-16 🟡 MEDIO — El registro de auditoría no cubre las operaciones contables críticas

**MÓDULO:** Trazabilidad

**DESCRIPCIÓN:** La tabla `audit_logs` **existe, está bien diseñada y es inmutable** — un punto fuerte real del sistema. El problema es su cobertura: 17 puntos de escritura, casi todos en autenticación y administración.

**EVIDENCIA — el diseño es correcto:**
```typescript
// src/db/schema/system.ts:7-19
export const auditLogs = pgTable('audit_logs', {
  ...
  action: varchar('action', { length: 255 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id'),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
```
**Y es inmutable por trigger:**
```sql
-- drizzle/0025_immutable_audit_logs.sql
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Los registros de auditoria son inmutables y no pueden ser modificados o eliminados.';
END;
$$ LANGUAGE plpgsql;
...
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_modification();
```
**Los 17 puntos de escritura** (`grep -rn "insert(auditLogs)"`): `accounting/entries`, `admin/roles/[id]/permissions`, `admin/users/[id]/permissions`, `auth/login` ×2, `auth/logout`, `auth/profile`, `auth/register`, `auth/switch-company`, `bank/accounts/[id]/transactions`, `bank/reconciliations`, `ecf/[id]/resubmit`, `invoices/[id]/submit`, `setup/confirm`, `hrRepository` ×2, `invoiceDbBooker`.

Ejemplo bien hecho, con `newValues` poblado:
```typescript
// src/app/api/v1/accounting/entries/route.ts:214-223
      await tx.insert(auditLogs).values({
        modo: auth.modo, companyId: auth.companyId, userId: auth.userId,
        action: 'manual_journal_entry_created',
        entityType: 'journal_entries',
        entityId: insertedEntry.id,
        newValues: { description, reference, totalLines: lines.length },
        ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
      });
```

**OPERACIONES CRÍTICAS SIN AUDITORÍA:**

| Operación | Ruta / servicio |
|---|---|
| Registrar cobro a cliente | `src/repositories/arRepository.ts:82` |
| Registrar pago a proveedor | `src/services/apService.ts` |
| Crear compra/gasto | `src/app/api/v1/expenses/route.ts` |
| **Borrar compra + sus asientos** | `src/app/api/v1/expenses/[id]/route.ts:199` |
| **Cerrar / reabrir período** | `src/app/api/v1/accounting/periods/[id]/route.ts` |
| Modificar catálogo de cuentas | `src/app/api/v1/accounting/accounts/route.ts` |
| Ajuste de inventario | `src/app/api/v1/inventory/adjustments/route.ts` |
| Cierre de caja | `src/services/cashService.ts:119` |
| Borrar borrador de factura | `src/app/api/v1/invoices/[id]/route.ts` |

Además, la mayoría de los 17 existentes solo rellenan `newValues`; `oldValues` queda casi siempre vacío, de modo que no se puede reconstruir el estado anterior.

**ESCENARIO:** Aparece una compra de 500.000 pesos borrada con sus asientos. No hay forma de saber quién ni cuándo: la fila ya no existe (DB-10) y no se registró nada.

**IMPACTO CONTABLE:** Imposible responder «¿quién hizo esto?» sobre la mayoría de las operaciones que mueven dinero.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Escribir en `audit_logs` en las nueve operaciones listadas, **dentro de la misma transacción** (como ya hace `accounting/entries/route.ts:214`), rellenando siempre `oldValues`. Como red de seguridad, triggers `AFTER INSERT OR UPDATE OR DELETE` sobre `journal_entries`, `accounts_receivable`, `accounts_payable` y `accounting_periods` que vuelquen a `audit_logs` con `row_to_json(OLD)`/`row_to_json(NEW)`.

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio. Los triggers de auditoría añaden escritura a cada operación; vigilar el crecimiento y establecer política de retención.

---

## DB-17 🟡 MEDIO — Las tablas contables no registran quién creó el asiento

**MÓDULO:** Trazabilidad

**DESCRIPCIÓN:** 18 tablas contables no tienen `createdBy` ni `userId`. La responsabilidad solo se puede reconstruir por correlación temporal con `audit_logs`, que además no cubre esas operaciones (DB-16).

**EVIDENCIA — el mayor contable no sabe quién lo escribió:**
```typescript
// src/db/schema/accounting.ts:31-41  — journal_entries: sin createdBy
export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  reference: varchar('reference', { length: 255 }),
  date: date('date').notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('posted').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
```

**Tablas contables sin autor:** `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `accounts_receivable`, `accounts_payable`, `customer_receipts`, `supplier_payments`, `customer_receipt_applied`, `supplier_payment_applied`, `checks`, `ap_payments`, `expenses`, `expense_lines`, `accounting_mappings`, `bank_accounts`, `bank_transactions`, `bank_reconciliations`, `inventory_levels`.

**Contraejemplo — sí lo hacen bien:** `invoices.userId` (invoices.ts:116), `financial_movements.userId` (accounting.ts:313), `inventory_movements.userId` (inventory.ts:49), `cash_sessions.userId`, `payrolls.createdBy`, `purchase_orders.createdBy`.

**ESCENARIO:** Aparece un asiento manual que reclasifica 200.000 pesos entre cuentas de gasto. `journal_entries` no dice quién. Para este caso concreto `audit_logs` sí lo tiene (`accounting/entries` es de los 17 cubiertos), pero para un cobro o un cheque no hay nada.

**IMPACTO CONTABLE:** Sin segregación de funciones verificable. Cualquier revisión de control interno sobre estas tablas es imposible.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Añadir `created_by uuid REFERENCES users(id)` a las 18 tablas (nullable para lo histórico, obligatorio para lo nuevo) y poblarlo en cada servicio. Prioridad: `journal_entries`, `customer_receipts`, `supplier_payments`, `checks`, `expenses`.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo. Aditivo. Lo histórico quedará en `NULL` de forma irrecuperable.

---

## DB-18 🟡 MEDIO — No existe asiento de cierre ni recálculo de saldos

**MÓDULO:** Contabilidad / Períodos

**DESCRIPCIÓN:** Cerrar un período es un simple `UPDATE status`. No genera asiento de cierre de resultados, no traslada la utilidad del ejercicio a patrimonio, no recalcula ni congela saldos.

**EVIDENCIA:**
```
$ grep -rniE "cierre de resultado|closing entry|asiento de cierre|retained earnings|utilidad del ejercicio|resultado del ejercicio|closePeriod|cerrarPeriodo" src/
=== FIN ===        # cero resultados
```
El cierre completo es este `UPDATE` (`accounting/periods/[id]/route.ts:60-68`, citado en DB-12). El estado de resultados se recalcula **al vuelo** en cada consulta (`reportRepository.ts:35-53`), de modo que su cifra cambia si alguien escribe con fecha en el pasado (DB-05).

**Comportamiento adicional a vigilar** — al no existir ningún período, se crea uno abierto automáticamente:
```typescript
// src/repositories/accountingRepository.ts:239-243
    if (count === 0) {
      // Auto-bootstrap an open period for the current year/month
      const d = new Date(formattedDate);
      ...
      await tx.insert(accountingPeriods).values({ ..., status: 'open' });
      return true;
```
Práctico para arrancar, pero significa que una empresa sin períodos configurados nunca ve bloqueada una escritura.

**ESCENARIO:** Se cierra el ejercicio 2025. Las cuentas de ingreso y gasto conservan su saldo acumulado en `journal_entry_lines` para siempre. El balance de 2026 se calcula sumando todo hasta la fecha (`reportRepository.ts:130: lte(journalEntries.date, asOfDate)`) sin corte de ejercicio, y el patrimonio nunca recibe el resultado del período anterior.

**IMPACTO CONTABLE:** No hay cierre de ejercicio en el sentido contable. El balance general no cuadra la ecuación patrimonial a través de ejercicios.

**IMPACTO EN BD:** No hay una foto congelada de saldos por período; todo se recalcula desde el origen del tiempo, con coste creciente.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Implementar el cierre como proceso: (a) validar que el período cuadra, (b) generar el asiento de cierre de resultados contra la cuenta de patrimonio, (c) materializar saldos en una tabla `period_account_balances`, (d) marcar `status = 'closed'` en la misma transacción. Los reportes deben partir del saldo materializado del último período cerrado, no del origen.

**RIESGO DE IMPLEMENTARLA:** 🔴 Alto. Es un cambio de arquitectura contable. Debe hacerse con un ejercicio de prueba y validación paralela antes de aplicarlo a datos reales.

---

## DB-19 🟡 MEDIO — Lectura entre empresas en la validación de límite de crédito

**MÓDULO:** Facturación

**DESCRIPCIÓN:** Dentro de la transacción de emisión, la comprobación de límite de crédito consulta `customers` con SQL en crudo filtrando **solo por `id`**, sin `company_id`.

**EVIDENCIA:**
```typescript
// src/services/invoice/invoiceDbBooker.ts:244-251
        const [customer] = await tx
          .select({
            creditLimit: sql<string>`credit_limit`,
            name: sql<string>`name`
          })
          .from(sql`customers`)
          .where(eq(sql`id`, data.customerId))
          .limit(1);
```
Las líneas inmediatamente siguientes **sí** filtran correctamente, lo que evidencia el descuido:
```typescript
// src/services/invoice/invoiceDbBooker.ts:260-268
              .from(accountsReceivable)
              .where(
                and(
                  eq(accountsReceivable.customerId, data.customerId),
                  eq(accountsReceivable.companyId, data.companyId),
                  eq(accountsReceivable.modo, data.modo),
                  isNull(accountsReceivable.deletedAt)
                )
              );
```
Nótese además que el uso de `sql\`customers\`` en crudo elude las comprobaciones de tipo de Drizzle. La versión de la misma validación en `preFlightValidations` (línea 103) usa el constructor tipado.

**ESCENARIO:** Se envía un `customerId` de otra empresa. El límite de crédito se lee de ese cliente ajeno; el saldo se calcula (correctamente) sobre la empresa propia, que devuelve 0. La factura se emite validada contra un límite que no le corresponde. Con RLS inerte (DB-02), nada lo detiene en la BD.

**IMPACTO CONTABLE:** Control de crédito eludible. Fuga de `credit_limit` y `name` de clientes de otras empresas.

**RIESGO MULTIEMPRESA:** 🟠 Alto — es una lectura efectiva entre inquilinos.

**SOLUCIÓN RECOMENDADA:** Sustituir por el constructor tipado con `eq(customers.id, data.customerId)`, `eq(customers.companyId, data.companyId)` e `isNull(customers.deletedAt)`. Rechazar la emisión si no se encuentra la fila, en vez del `if (customer)` silencioso.

**RIESGO DE IMPLEMENTARLA:** 🟢 Bajo.

---

## DB-20 🟡 MEDIO — Solo 13 de 177 rutas usan transacción explícita

**MÓDULO:** Transversal

**DESCRIPCIÓN:** El uso de transacciones es correcto donde existe, pero está concentrado en la capa de servicios y ausente en varias rutas que escriben directo.

**EVIDENCIA — rutas con transacción (13):**
```
accounting/entries, admin/companies/[id]/clear-sandbox, admin/companies,
admin/roles/[id]/permissions, admin/settings, admin/users/[id]/permissions,
bank/accounts/[id]/transactions, bank/reconciliations, expenses/[id] (×2),
expenses, inventory/adjustments, invoices/draft, setup/confirm
```
**Servicios y repositorios con transacción (17 ficheros):** `accountingRepository` (3), `arRepository` (1), `bankRepository` (2), `cashRepository` (2), `deliveryRepository` (3), `hrRepository` (6), `invoiceRepository` (1), `apService` (3), `cashService` (1), `expenseService` (1), `financialMovementService` (1), `inventoryService` (1), `invoiceDbBooker` (2), `quoteService` (3), `supplierOrderService` (7), `adminRepository` (2), `storefront/quoteService` (1).

Las rutas multi-escritura delegan correctamente: `invoices/route.ts` → `InvoiceService.issueInvoice`, `ap/payments/route.ts` → `ApService.registerPayment`, `inventory/transfer/route.ts` → `transferStock` (`inventoryService.ts:302: db.transaction`), `cash/sessions/[id]/close` → `CashService.closeSession`.

**Excepción real encontrada:**
```
src/app/api/v1/retentions/route.ts :: transaccion: 0  inserts: 1
```

**Fragilidad estructural** — el patrón `tx: any = db` como parámetro por defecto:
```typescript
// src/services/inventoryService.ts:223
  tx: any = db
```
```typescript
// src/repositories/accountingRepository.ts:227
  static async isPeriodOpen(companyId: string, dateStr: string, modo: ... , tx: any = db): Promise<boolean> {
```
Si un llamador olvida pasar `tx`, la operación se ejecuta **fuera** de la transacción del llamador, sin error ni aviso. El tipo `any` impide que TypeScript lo detecte.

**ESCENARIO:** Un fallo a mitad de una operación que descontó inventario mediante un `deductStock` sin `tx` deja el stock descontado y la factura sin crear.

**IMPACTO CONTABLE:** Escrituras parciales que descuadran auxiliares contra el mayor.

**RIESGO MULTIEMPRESA:** 🟢 Bajo.

**SOLUCIÓN RECOMENDADA:** Hacer `tx` obligatorio y tipado (`DbTransaction`, ya exportado en `db/index.ts:31`) en toda función que escriba. Añadir transacción a `retentions/route.ts`. El cambio de firma hace que el compilador señale cada llamador que hoy lo omite.

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio. Refactor amplio, pero guiado por el compilador.

---

## DB-21 🟢 BAJO — Deriva entre el esquema Drizzle y la BD: `roles.company_id`

**MÓDULO:** Autorización

**DESCRIPCIÓN:** La tabla `roles` **tiene** `company_id` en la base de datos, pero la definición Drizzle **no lo declara**. El middleware de permisos razona sobre la premisa contraria.

**EVIDENCIA — la BD sí la tiene:**
```sql
-- drizzle/0000_violet_pestilence.sql:435-444
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" varchar(100) NOT NULL,
	...
```
**El esquema no:**
```typescript
// src/db/schema/auth.ts:4-12
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isFixed: boolean('is_fixed').default(false).notNull(),
  ...
});
```
**Y el middleware afirma que no existe:**
```typescript
// src/middleware/permissions.ts:92-93
  // `roles` es un catalogo GLOBAL: no tiene company_id. Lo que cada empresa
  // decide sobre su rol "cajero" vive aqui, ...
```

**Consecuencias:** (a) `roles` entró en el bucle de RLS de la `0024` por tener la columna, con una política que compara contra un `company_id` que la aplicación deja siempre en `NULL`; hoy es inocuo solo porque el contexto nunca se fija (DB-02), pero se activaría al corregir DB-02. (b) `drizzle-kit generate` podría proponer eliminar la columna. (c) El razonamiento documentado del middleware parte de una premisa falsa.

**IMPACTO CONTABLE:** Ninguno directo.

**RIESGO MULTIEMPRESA:** 🟡 Medio a futuro: al arreglar DB-02, `roles` dejaría de ser visible y **toda autorización fallaría**.

**SOLUCIÓN RECOMENDADA:** Decidir la semántica. Si `roles` es global, `ALTER TABLE roles DROP COLUMN company_id` y excluirla del bucle de RLS. Si es por empresa, declararla en Drizzle y poblarla. **Hay que resolverlo antes de tocar DB-02.**

**RIESGO DE IMPLEMENTARLA:** 🟡 Medio. Eliminar la columna es irreversible; verificar antes que no haya datos en ella.

---

# RESUMEN POR PRIORIDAD

| ID | Nivel | Título | Módulo |
|---|---|---|---|
| DB-04 | 🔴 | NCF predicho sin bloqueo y enviado a la DGII antes de reservarlo | Facturación e-CF |
| DB-05 | 🔴 | El cierre de período solo bloquea asientos manuales | Períodos |
| DB-02 | 🔴 | RLS fail-open + `withTenantContext` sin uso | RLS |
| DB-01 | 🔴 | 13 tablas de detalle sin `company_id` → sin RLS | Esquema |
| DB-06 | 🔴 | Sin idempotencia en todo el sistema | Transversal |
| DB-03 | 🔴 | Un solo CHECK en toda la BD, y `NOT VALID` | Esquema |
| DB-07 | 🟠 | Saldos AR/AP/inventario con leer-modificar-escribir | AR/AP/Inv |
| DB-08 | 🟠 | Cobro sin validar sobreaplicación ni pertenencia al cliente | Cobros |
| DB-09 | 🟠 | Estados financieros no filtran asientos borrados | Reportes |
| DB-10 | 🟠 | Borrado físico de asientos al eliminar una compra | Gastos |
| DB-11 | 🟠 | 9 rutas DELETE sin `enforcePermission` | Autorización |
| DB-12 | 🟠 | Reapertura de período sin rol admin y sin auditoría | Períodos |
| DB-13 | 🟠 | Faltan únicos: SKU, período, aplicaciones | Esquema |
| DB-14 | 🟠 | Ningún único parcial sobre `deleted_at` | Esquema |
| DB-15 | 🟡 | FKs ausentes (`closed_by` y polimórficas) | Esquema |
| DB-16 | 🟡 | Auditoría no cubre operaciones contables | Trazabilidad |
| DB-17 | 🟡 | 18 tablas contables sin `createdBy` | Trazabilidad |
| DB-18 | 🟡 | Sin asiento de cierre ni recálculo de saldos | Períodos |
| DB-19 | 🟡 | Lectura entre empresas en límite de crédito | Facturación |
| DB-20 | 🟡 | 13/177 rutas con transacción; `tx: any = db` | Transversal |
| DB-21 | 🟢 | Deriva esquema/BD en `roles.company_id` | Autorización |

**Orden de ejecución recomendado.** DB-04 primero (es el único con consecuencia fiscal externa e irreversible), luego DB-19 y DB-08 (correcciones locales de bajo riesgo y alto valor), después DB-03 y DB-07 (red de seguridad en BD). DB-21 **debe** resolverse antes que DB-02, y DB-02 antes que DB-01. DB-18 al final, con planificación propia.

---

# ASPECTOS CORRECTOS VERIFICADOS

Conviene registrarlos para que una corrección futura no los deshaga:

- **`audit_logs` es inmutable por trigger** (`0025_immutable_audit_logs.sql`) — no se puede alterar ni borrar.
- **Saldo bancario atómico** — `bankRepository.ts:108-114` usa `SET balance = balance + delta`. Es el patrón a replicar en DB-07.
- **`codigo_factura` con reserva atómica** — `codigoFactura.ts:64-71`, `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, con documentación excelente del bug previo.
- **`allocateNextNcf` usa `.for('update')`** — `companyRepository.ts:115`. Correcto; el problema de DB-04 es *cuándo* se invoca.
- **Validación de partida doble** — `accountingRepository.ts:284-294`: cuadre, importe no nulo y mínimo dos líneas.
- **Bloqueo consultivo en el sembrado de movimientos** — `financialMovementService.ts:146`, `pg_advisory_xact_lock`.
- **Saldos corrientes recalculados en SQL con `NUMERIC`** — `financialMovementService.ts:113-136`, función de ventana con `ROUND(..., 2)`. Sin errores de coma flotante.
- **`roundMoney` aplicado consistentemente** en `invoiceCalculator.ts` (líneas 18-91). No se detectaron sumas de importes por concatenación de cadenas.
- **Aislamiento por `modo` (PRODUCCION/PRUEBA)** ampliamente aplicado, con comentarios que documentan cada bug corregido.
- **Migración `0032_aislamiento_estructural.sql`** — FKs compuestas `(id, company_id)` en ~20 tablas. Es el modelo a extender en DB-01.
- **`0037_negar_acceso_publico.sql`** — cierra el acceso de `anon`/`authenticated` en tres capas y **documenta explícitamente el fallo fail-open de la 0024**.
- **Comparación exacta de roles** en `permissions.ts:44,49,149` tras la auditoría F0-05.
- **`invoices/[id]` DELETE es borrado lógico** y solo permite borradores.

---

# NO VERIFICADO

1. **Estado real de la BD en ejecución.** Todo se basa en `src/db/schema/` y `drizzle/*.sql`. No me conecté a la base. No pude confirmar si las migraciones están todas aplicadas, si hay objetos creados a mano fuera de las migraciones, ni el estado de `drizzle/meta/_journal.json` (existe un `_journal.json.ANTERIOR` en la raíz, fechado 2026-08-29, que sugiere manipulación reciente del historial y merece revisión aparte).

2. **Si el `CHECK chk_inventory_no_negativo` fue validado.** Se creó `NOT VALID`. No sé si alguien ejecutó `VALIDATE CONSTRAINT`, ni cuántos `inventory_levels` negativos existen.

3. **Nivel de aislamiento de transacción efectivo.** `src/db/index.ts` no lo fija, luego se asume el `READ COMMITTED` por defecto de PostgreSQL. No verifiqué la configuración del servidor ni si el pooler de Supabase la altera. Los escenarios de DB-07 se describen bajo `READ COMMITTED`.

4. **Rol de BD que usa la aplicación.** `DATABASE_URL` está en `.env`, que no leí. Si fuera un rol con `BYPASSRLS` (como `postgres`), RLS sería inerte incluso corrigiendo DB-02 — lo que agravaría DB-02 pero no cambia su solución.

5. **Explotabilidad real de la carrera de NCF (DB-04).** El razonamiento es estructural sobre el código. No ejecuté una prueba de concurrencia. La ventana depende de la latencia de la llamada a MSeller/DGII, que en la práctica la hace **más** ancha, no menos.

6. **Comportamiento de MSeller ante NCF duplicado.** Desconozco si el proveedor rechaza un segundo e-CF con el mismo NCF. Si lo rechazara, el impacto de DB-04 bajaría de duplicado fiscal a venta perdida — sigue siendo grave, pero distinto.

7. **Módulos no auditados en profundidad.** Nómina (`hr.ts`, 14 tablas, 6 transacciones en `hrRepository`), conduces, cotizaciones, storefront y el módulo de agente IA (`src/ai/tools/`, donde el barrido de DB-09 detectó lecturas sin filtro de borrado lógico que no verifiqué una a una).

8. **El barrido de borrado lógico (DB-09) usa una ventana de texto** de ±6/14 líneas alrededor de cada `.from(tabla)`. Verifiqué manualmente los casos de mayor impacto (`reportRepository`, `arRepository`, `receivables`), pero **las cifras de la tabla pueden contener falsos positivos** cuando el filtro está fuera de la ventana. Los recuentos son un indicador de magnitud, no un inventario exacto.

9. **Cobertura de pruebas.** Existen `tests/` y `vitest.config.ts`. No los ejecuté ni evalué si alguna prueba cubre los escenarios de concurrencia descritos.

10. **Front-end.** No revisé si la interfaz mitiga alguno de estos problemas (p. ej. deshabilitando el botón tras el primer clic para DB-06). Aunque lo hiciera, no sería una defensa válida: la API es alcanzable directamente.
