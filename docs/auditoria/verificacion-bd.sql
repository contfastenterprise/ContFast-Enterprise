-- =====================================================================
-- VERIFICACIÓN DE INTEGRIDAD — AUDITORÍA CONTABLE contfast_v.2
-- =====================================================================
-- SOLO LECTURA. Ninguna consulta modifica datos.
-- Ejecutar en el SQL Editor de Supabase (o psql con el rol de la app).
--
-- Por qué existe este archivo: el entorno de auditoría no tuvo salida de
-- red hacia la base de datos (puertos 5432/6543 y HTTPS bloqueados por la
-- política de egreso), de modo que la Fase 14 no pudo ejecutarse. Estas
-- consultas cuantifican el daño ya existente y son requisito previo a
-- varias correcciones (índices únicos, CHECKs y VALIDATE CONSTRAINT
-- fallarán si hay datos históricos que los violan).
--
-- Recomendación: ejecutar bloque por bloque y guardar los resultados.
-- =====================================================================


-- =====================================================================
-- BLOQUE 0 — ENTORNO
-- =====================================================================

-- 0.1 ¿Con qué rol se conecta la aplicación? Si es superusuario o tiene
--     BYPASSRLS, ninguna política RLS se aplicará jamás (ver ISO-07).
SELECT current_user,
       (SELECT rolsuper      FROM pg_roles WHERE rolname = current_user) AS es_superusuario,
       (SELECT rolbypassrls  FROM pg_roles WHERE rolname = current_user) AS omite_rls,
       version();

-- 0.2 ¿Están realmente aplicadas las políticas RLS de las migraciones 0024/0026?
SELECT count(*) AS n_politicas, count(DISTINCT tablename) AS n_tablas
FROM pg_policies WHERE schemaname = 'public';

SELECT c.relname AS tabla, c.relrowsecurity AS rls_activo, c.relforcerowsecurity AS rls_forzado
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
ORDER BY 1;

-- 0.3 Restricciones creadas NOT VALID (nunca verificadas contra los datos
--     históricos). Relevante para las FK compuestas de la migración 0032
--     y para chk_inventory_no_negativo (0031).
SELECT conrelid::regclass::text AS tabla, conname, contype, convalidated
FROM pg_constraint WHERE NOT convalidated ORDER BY 1, 2;

-- 0.4 CHECK constraints de negocio existentes (se espera encontrar muy pocos).
SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY 1;

-- 0.5 Volumen por empresa y entorno (contexto para todo lo demás).
SELECT c.id, c.name, c.status,
       (SELECT count(*) FROM journal_entries je WHERE je.company_id = c.id) AS asientos,
       (SELECT count(*) FROM invoices i        WHERE i.company_id = c.id)   AS facturas,
       (SELECT count(*) FROM expenses e        WHERE e.company_id = c.id)   AS compras
FROM companies c ORDER BY 2;


-- =====================================================================
-- BLOQUE 1 — PARTIDA DOBLE E INTEGRIDAD DEL DIARIO   (JRN-05, JRN-14, JRN-15)
-- =====================================================================

-- 1.1 ASIENTOS DESCUADRADOS. Debe devolver CERO filas.
SELECT je.company_id, je.id, je.date, je.reference, je.description,
       SUM(l.debit) AS total_debito, SUM(l.credit) AS total_credito,
       SUM(l.debit) - SUM(l.credit) AS diferencia
FROM journal_entries je
JOIN journal_entry_lines l ON l.journal_entry_id = je.id
WHERE je.deleted_at IS NULL
GROUP BY je.company_id, je.id, je.date, je.reference, je.description
HAVING SUM(l.debit) <> SUM(l.credit)
ORDER BY abs(SUM(l.debit) - SUM(l.credit)) DESC;

-- 1.2 Asientos con menos de 2 líneas, o sin ninguna línea.
SELECT je.id, je.company_id, je.date, je.reference, count(l.id) AS n_lineas
FROM journal_entries je
LEFT JOIN journal_entry_lines l ON l.journal_entry_id = je.id
WHERE je.deleted_at IS NULL
GROUP BY je.id, je.company_id, je.date, je.reference
HAVING count(l.id) < 2;

-- 1.3 Líneas inválidas: débito y crédito simultáneos, ambos en cero, o negativos.
SELECT company_id, journal_entry_id, id, debit, credit,
       CASE WHEN debit > 0 AND credit > 0 THEN 'ambos positivos'
            WHEN debit = 0 AND credit = 0 THEN 'ambos en cero'
            ELSE 'negativo' END AS problema
FROM journal_entry_lines
WHERE (debit > 0 AND credit > 0) OR (debit = 0 AND credit = 0) OR debit < 0 OR credit < 0;

-- 1.4 Líneas cuya empresa no coincide con la del asiento, o con la de la cuenta.
SELECT l.id, l.company_id AS empresa_linea, je.company_id AS empresa_asiento,
       coa.company_id AS empresa_cuenta
FROM journal_entry_lines l
JOIN journal_entries je   ON je.id  = l.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = l.account_id
WHERE l.company_id <> je.company_id OR l.company_id <> coa.company_id;

-- 1.5 Mezcla de entorno dentro del mismo asiento.
SELECT je.id, je.modo AS modo_asiento, l.modo AS modo_linea, count(*)
FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
WHERE je.modo <> l.modo GROUP BY 1,2,3;

-- 1.6 IDEMPOTENCIA: asientos duplicados para el mismo documento origen (JRN-06).
--     Requisito previo al índice único (company_id, modo, reference).
SELECT company_id, modo, reference, count(*) AS n_asientos,
       array_agg(id) AS ids, array_agg(date) AS fechas
FROM journal_entries
WHERE reference IS NOT NULL AND deleted_at IS NULL
GROUP BY 1,2,3 HAVING count(*) > 1
ORDER BY 4 DESC;

-- 1.7 Asientos fuera de todo período contable, o dentro de un período CERRADO.
SELECT je.company_id, je.modo, je.date, count(*) AS asientos,
       coalesce(max(p.status), 'SIN PERIODO') AS estado_periodo
FROM journal_entries je
LEFT JOIN accounting_periods p
       ON p.company_id = je.company_id AND p.modo = je.modo
      AND je.date BETWEEN p.start_date AND p.end_date
WHERE je.deleted_at IS NULL
GROUP BY 1,2,3
HAVING max(p.status) IS DISTINCT FROM 'open'
ORDER BY 3 DESC;


-- =====================================================================
-- BLOQUE 2 — PLAN DE CUENTAS   (JRN-01, JRN-02, JRN-12, JRN-13, INV-04)
-- =====================================================================

-- 2.1 Cuentas creadas al vuelo por getOrCreateAccount: nivel 1 con código
--     de varios segmentos, sin padre. Son las cuentas huérfanas.
SELECT company_id, code, name, type, nature, level, is_transactional, created_at
FROM chart_of_accounts
WHERE parent_id IS NULL AND level = 1 AND code LIKE '%.%'
ORDER BY company_id, code;

-- 2.2 Incoherencia type ↔ nature (excepto contra-cuentas legítimas como
--     Depreciación Acumulada).
SELECT company_id, code, name, type, nature
FROM chart_of_accounts
WHERE (type IN ('asset','expense','cost') AND nature <> 'debit')
   OR (type IN ('liability','equity','revenue') AND nature <> 'credit')
ORDER BY 1,2;

-- 2.3 Movimientos contra cuentas de AGRUPACIÓN, inactivas o borradas.
SELECT coa.company_id, coa.code, coa.name, coa.is_transactional, coa.status,
       coa.deleted_at, count(*) AS n_lineas, SUM(l.debit) AS debitos, SUM(l.credit) AS creditos
FROM journal_entry_lines l
JOIN chart_of_accounts coa ON coa.id = l.account_id
WHERE coa.is_transactional = false OR coa.status <> 'active' OR coa.deleted_at IS NOT NULL
GROUP BY 1,2,3,4,5,6 ORDER BY 7 DESC;

-- 2.4 El mismo código con nombres distintos entre empresas (colisión 1.1.02).
SELECT code, count(DISTINCT name) AS n_nombres, array_agg(DISTINCT name) AS nombres
FROM chart_of_accounts GROUP BY code HAVING count(DISTINCT name) > 1 ORDER BY 2 DESC;

-- 2.5 ¿Reciben movimientos las cuentas que el mapeo señala? Compara los
--     códigos mapeados con los códigos realmente movidos.
SELECT m.company_id, m.mapping_key, coa.code AS cuenta_mapeada,
       (SELECT count(*) FROM journal_entry_lines l WHERE l.account_id = m.account_id) AS lineas_recibidas
FROM accounting_mappings m JOIN chart_of_accounts coa ON coa.id = m.account_id
ORDER BY 1,2;

-- 2.6 Empresas sin catálogo de cuentas o sin mapeos sembrados.
SELECT c.id, c.name,
       (SELECT count(*) FROM chart_of_accounts a WHERE a.company_id = c.id) AS cuentas,
       (SELECT count(*) FROM accounting_mappings m WHERE m.company_id = c.id) AS mapeos,
       (SELECT count(*) FROM accounting_periods p WHERE p.company_id = c.id) AS periodos
FROM companies c ORDER BY 2;


-- =====================================================================
-- BLOQUE 3 — AISLAMIENTO MULTIEMPRESA   (ISO-04, ISO-05, ISO-06, ARP-04)
-- =====================================================================
-- Cada consulta debe devolver CERO filas. Cualquier fila es una referencia
-- cruzada entre empresas ya persistida.

-- 3.1 Facturas apuntando a clientes de otra empresa.
SELECT i.id, i.company_id AS empresa_factura, cu.company_id AS empresa_cliente, i.ncf
FROM invoices i JOIN customers cu ON cu.id = i.customer_id
WHERE i.company_id <> cu.company_id;

-- 3.2 Facturas apuntando a almacenes de otra empresa.
SELECT i.id, i.company_id, w.company_id AS empresa_almacen
FROM invoices i JOIN warehouses w ON w.id = i.warehouse_id
WHERE i.company_id <> w.company_id;

-- 3.3 Líneas de factura con productos de otra empresa.
SELECT il.id, i.company_id AS empresa_factura, p.company_id AS empresa_producto
FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
JOIN products p ON p.id = il.product_id
WHERE i.company_id <> p.company_id;

-- 3.4 Cotizaciones cruzadas (cliente y almacén).
SELECT q.id, q.company_id, cu.company_id AS empresa_cliente
FROM quotes q JOIN customers cu ON cu.id = q.customer_id WHERE q.company_id <> cu.company_id;

-- 3.5 Recibos de cobro con clientes de otra empresa.
SELECT r.id, r.company_id, cu.company_id AS empresa_cliente, r.date, r.amount
FROM customer_receipts r JOIN customers cu ON cu.id = r.customer_id
WHERE r.company_id <> cu.company_id;

-- 3.6 Aplicaciones de cobro cruzadas: empresa y, sobre todo, CLIENTE distinto
--     (ARP-04: un cobro aplicado a la factura de otro cliente).
SELECT cra.id, r.company_id AS empresa_recibo, ar.company_id AS empresa_ar,
       r.customer_id AS cliente_recibo, ar.customer_id AS cliente_factura,
       cra.amount_applied
FROM customer_receipt_applied cra
JOIN customer_receipts r      ON r.id  = cra.receipt_id
JOIN accounts_receivable ar   ON ar.id = cra.ar_id
WHERE r.company_id <> ar.company_id OR r.customer_id <> ar.customer_id;

-- 3.7 Aplicaciones de cobro HUÉRFANAS: la fila se insertó pero el AR no
--     superó la validación, de modo que ningún saldo cambió.
SELECT cra.id, cra.receipt_id, cra.ar_id, cra.amount_applied
FROM customer_receipt_applied cra
LEFT JOIN accounts_receivable ar ON ar.id = cra.ar_id
WHERE ar.id IS NULL;

-- 3.8 Lo mismo en el lado de proveedores.
SELECT spa.id, sp.company_id AS empresa_pago, ap.company_id AS empresa_ap,
       sp.supplier_id, ap.supplier_id AS proveedor_ap
FROM supplier_payment_applied spa
JOIN supplier_payments sp   ON sp.id = spa.payment_id
JOIN accounts_payable ap    ON ap.id = spa.ap_id
WHERE sp.company_id <> ap.company_id OR sp.supplier_id <> ap.supplier_id;

-- 3.9 CxP / CxC apuntando a documentos de otra empresa.
SELECT ar.id, ar.company_id, i.company_id AS empresa_factura
FROM accounts_receivable ar JOIN invoices i ON i.id = ar.invoice_id
WHERE ar.company_id <> i.company_id;

SELECT ap.id, ap.company_id, e.company_id AS empresa_gasto
FROM accounts_payable ap JOIN expenses e ON e.id = ap.expense_id
WHERE ap.company_id <> e.company_id;

-- 3.10 Pagos de CxP con cuentas contables de otra empresa (ARP-16).
SELECT p.id, p.company_id, d.company_id AS empresa_cuenta_debito,
       c.company_id AS empresa_cuenta_credito
FROM ap_payments p
JOIN chart_of_accounts d ON d.id = p.debit_account_id
JOIN chart_of_accounts c ON c.id = p.credit_account_id
WHERE p.company_id <> d.company_id OR p.company_id <> c.company_id;

-- 3.11 Inventario cruzado (mitigado por FK compuestas NOT VALID de 0032:
--      esta consulta revela lo anterior a esa migración).
SELECT il.id, il.company_id, p.company_id AS empresa_producto, w.company_id AS empresa_almacen
FROM inventory_levels il
JOIN products p   ON p.id = il.product_id
JOIN warehouses w ON w.id = il.warehouse_id
WHERE il.company_id <> p.company_id OR il.company_id <> w.company_id;


-- =====================================================================
-- BLOQUE 4 — CUENTAS POR COBRAR Y POR PAGAR   (ARP-05, ARP-06, ARP-10, ARP-15)
-- =====================================================================

-- 4.1 Saldos imposibles en CxC: negativos, mayores que el importe original,
--     o estado incoherente con el saldo.
SELECT company_id, id, customer_id, invoice_id, amount, balance, status,
       CASE WHEN balance < 0                    THEN 'saldo negativo (sobrepago)'
            WHEN balance > amount               THEN 'saldo mayor que el importe'
            WHEN status = 'paid'  AND balance > 0.01 THEN 'marcada pagada con saldo'
            WHEN status <> 'paid' AND balance <= 0   THEN 'saldo cero sin marcar pagada'
       END AS problema
FROM accounts_receivable
WHERE balance < 0 OR balance > amount
   OR (status = 'paid' AND balance > 0.01) OR (status <> 'paid' AND balance <= 0);

-- 4.2 Lo mismo en CxP.
SELECT company_id, id, supplier_id, amount, balance, status
FROM accounts_payable
WHERE balance < 0 OR balance > amount
   OR (status = 'paid' AND balance > 0.01) OR (status <> 'paid' AND balance <= 0);

-- 4.3 Sobreaplicación: suma de cobros aplicados mayor que el importe del documento.
SELECT ar.company_id, ar.id, ar.amount, ar.balance,
       SUM(cra.amount_applied) AS total_aplicado,
       ar.amount - SUM(cra.amount_applied) AS deberia_ser_el_saldo
FROM accounts_receivable ar
JOIN customer_receipt_applied cra ON cra.ar_id = ar.id
GROUP BY 1,2,3,4
HAVING SUM(cra.amount_applied) > ar.amount + 0.01
    OR abs((ar.amount - SUM(cra.amount_applied)) - ar.balance) > 0.01;

-- 4.4 Recibos cuyo importe no coincide con lo aplicado (excedente sin anticipo).
SELECT r.company_id, r.id, r.date, r.amount,
       coalesce(SUM(cra.amount_applied), 0) AS aplicado,
       r.amount - coalesce(SUM(cra.amount_applied), 0) AS sin_aplicar
FROM customer_receipts r
LEFT JOIN customer_receipt_applied cra ON cra.receipt_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY 1,2,3,4
HAVING abs(r.amount - coalesce(SUM(cra.amount_applied), 0)) > 0.01;

-- 4.5 Pagos de CxP que exceden la deuda (doble pago por concurrencia, ARP-06).
SELECT ap.company_id, ap.id, ap.amount, ap.balance,
       SUM(p.amount) AS total_pagado
FROM accounts_payable ap
JOIN ap_payments p ON p.ap_id = ap.id AND p.status <> 'voided'
GROUP BY 1,2,3,4
HAVING SUM(p.amount) > ap.amount + 0.01;

-- 4.6 CUADRE AUXILIAR vs MAYOR. Compara la suma de saldos de CxC con el
--     saldo de las cuentas contables de clientes, por empresa.
--     (Ajustar los códigos si el catálogo de la empresa difiere.)
WITH aux AS (
  SELECT company_id, modo, SUM(balance) AS auxiliar
  FROM accounts_receivable WHERE deleted_at IS NULL GROUP BY 1,2
), mayor AS (
  SELECT l.company_id, l.modo, SUM(l.debit - l.credit) AS mayor
  FROM journal_entry_lines l
  JOIN chart_of_accounts coa ON coa.id = l.account_id
  JOIN journal_entries je    ON je.id = l.journal_entry_id AND je.deleted_at IS NULL
  WHERE coa.code LIKE '1.1.02%' GROUP BY 1,2
)
SELECT a.company_id, a.modo, a.auxiliar, m.mayor, a.auxiliar - m.mayor AS diferencia
FROM aux a FULL JOIN mayor m ON m.company_id = a.company_id AND m.modo = a.modo;

-- 4.7 `invoices.paymentStatus` desincronizado del auxiliar (ARP-10).
SELECT i.company_id, i.payment_status, ar.status, count(*)
FROM invoices i JOIN accounts_receivable ar ON ar.invoice_id = i.id
WHERE (ar.status = 'paid' AND i.payment_status <> 'paid')
   OR (ar.status <> 'paid' AND i.payment_status = 'paid')
GROUP BY 1,2,3;

-- 4.8 Notas de crédito que exceden el documento afectado (ARP-15).
SELECT nc.company_id, nc.modified_invoice_id, count(*) AS n_notas,
       SUM(nc.total) AS total_notas,
       (SELECT total FROM invoices o WHERE o.id = nc.modified_invoice_id) AS total_original
FROM invoices nc
WHERE nc.ecf_type = '34' AND nc.modified_invoice_id IS NOT NULL AND nc.deleted_at IS NULL
GROUP BY 1,2
HAVING SUM(nc.total) > (SELECT total FROM invoices o WHERE o.id = nc.modified_invoice_id) + 0.01;

-- 4.9 Notas de crédito SIN documento afectado — crean CxC positiva (ARP-03).
--     `invoices` no tiene columna `date`: la fecha del documento es `created_at`.
SELECT company_id, id, ncf, created_at::date AS fecha, total, payment_type
FROM invoices WHERE ecf_type = '34' AND modified_invoice_id IS NULL AND deleted_at IS NULL;


-- =====================================================================
-- BLOQUE 5 — INVENTARIO   (INV-01, INV-02, INV-08, INV-09, INV-13)
-- =====================================================================

-- 5.1 Existencias negativas (el CHECK de 0031 se creó NOT VALID).
SELECT il.company_id, il.modo, p.name AS producto, w.name AS almacen, il.quantity
FROM inventory_levels il
JOIN products p ON p.id = il.product_id JOIN warehouses w ON w.id = il.warehouse_id
WHERE il.quantity < 0 ORDER BY il.quantity;

-- 5.2 KARDEX vs SALDO: el nivel debe ser la suma de los movimientos.
--     Toda diferencia es una condición de carrera consumada (INV-09) o una
--     escritura fuera del kardex.
WITH k AS (
  SELECT company_id, modo, product_id, warehouse_id, SUM(quantity) AS suma_movimientos
  FROM inventory_movements GROUP BY 1,2,3,4
)
SELECT il.company_id, il.modo, p.name AS producto, w.name AS almacen,
       il.quantity AS saldo_actual, k.suma_movimientos,
       il.quantity - coalesce(k.suma_movimientos, 0) AS diferencia
FROM inventory_levels il
LEFT JOIN k ON k.company_id = il.company_id AND k.modo = il.modo
           AND k.product_id = il.product_id AND k.warehouse_id = il.warehouse_id
JOIN products p ON p.id = il.product_id JOIN warehouses w ON w.id = il.warehouse_id
WHERE abs(il.quantity - coalesce(k.suma_movimientos, 0)) > 0.0001
ORDER BY abs(il.quantity - coalesce(k.suma_movimientos, 0)) DESC;

-- 5.3 Productos con existencia y costo cero (valoración imposible, INV-13).
SELECT p.company_id, p.name, p.sku, p.cost, SUM(il.quantity) AS existencia
FROM products p JOIN inventory_levels il ON il.product_id = p.id
WHERE p.cost = 0 GROUP BY 1,2,3,4 HAVING SUM(il.quantity) > 0
ORDER BY 5 DESC;

-- 5.4 DOBLE ENTRADA por pedido y por compra (INV-08): mismo producto,
--     mismo almacén, dos movimientos 'purchase' el mismo día.
SELECT company_id, modo, product_id, warehouse_id, created_at::date AS dia,
       count(*) AS n_entradas, SUM(quantity) AS cantidad_total,
       array_agg(reference_id) AS documentos
FROM inventory_movements
WHERE type = 'purchase'
GROUP BY 1,2,3,4,5 HAVING count(*) > 1
ORDER BY 6 DESC;

-- 5.5 Movimientos en almacenes inactivos o borrados (INV-17).
SELECT w.company_id, w.name, w.status, w.deleted_at, count(m.id) AS movimientos,
       max(m.created_at) AS ultimo_movimiento
FROM warehouses w JOIN inventory_movements m ON m.warehouse_id = w.id
WHERE w.status <> 'active' OR w.deleted_at IS NOT NULL
GROUP BY 1,2,3,4;

-- 5.6 CONCILIACIÓN INVENTARIO FÍSICO vs CONTABLE (INV-12). Valoración al
--     costo actual del producto (aproximación: no hay costo histórico).
WITH fisico AS (
  SELECT il.company_id, il.modo, SUM(il.quantity * p.cost) AS valor_almacen
  FROM inventory_levels il JOIN products p ON p.id = il.product_id GROUP BY 1,2
), contable AS (
  SELECT l.company_id, l.modo, SUM(l.debit - l.credit) AS saldo_cuenta_inventario
  FROM journal_entry_lines l
  JOIN chart_of_accounts coa ON coa.id = l.account_id
  JOIN journal_entries je ON je.id = l.journal_entry_id AND je.deleted_at IS NULL
  WHERE coa.name ILIKE '%inventario%' GROUP BY 1,2
)
SELECT f.company_id, f.modo, f.valor_almacen, c.saldo_cuenta_inventario,
       c.saldo_cuenta_inventario - f.valor_almacen AS diferencia
FROM fisico f FULL JOIN contable c ON c.company_id = f.company_id AND c.modo = f.modo;

-- 5.7 ¿Existe algún asiento de costo de ventas? (INV-01: se espera CERO)
SELECT coa.company_id, coa.code, coa.name, count(*) AS lineas, SUM(l.debit) AS debitos
FROM journal_entry_lines l JOIN chart_of_accounts coa ON coa.id = l.account_id
WHERE coa.name ILIKE '%costo%' GROUP BY 1,2,3 ORDER BY 4 DESC;


-- =====================================================================
-- BLOQUE 6 — DUPLICADOS Y NCF   (DB-04, DB-06, DB-13, INV-14)
-- =====================================================================

-- 6.1 NCF DUPLICADO EN VENTAS. Riesgo fiscal directo. Debe ser CERO.
--
--     Nota: el esquema declara un índice ÚNICO sobre (company_id, ncf, modo)
--     — `invoices_company_ncf_modo_idx` —, de modo que la base ya impide el
--     duplicado DENTRO del sistema. Esta consulta sirve para dos cosas: primero,
--     confirmar que ese índice existe de verdad en la instancia; segundo, dejar
--     constancia de que el duplicado de DB-04 se producía ANTE LA DGII, no aquí:
--     el segundo comprobante se enviaba y su transacción abortaba, así que el
--     e-CF llegaba a la DGII y la factura nunca se guardaba. Los huecos de la
--     consulta 6.2 son la huella de esos casos.
SELECT company_id, modo, ncf, count(*) AS n_facturas, array_agg(id) AS ids,
       array_agg(created_at::date) AS fechas, SUM(total) AS total
FROM invoices WHERE ncf IS NOT NULL AND deleted_at IS NULL
GROUP BY 1,2,3 HAVING count(*) > 1 ORDER BY 4 DESC;

-- 6.2 Huecos en la secuencia de NCF por tipo (un hueco = un e-CF enviado a
--     la DGII cuya transacción se abortó, o una anulación silenciosa).
SELECT company_id, modo, ecf_type, count(*) AS emitidos,
       min(ncf) AS primero, max(ncf) AS ultimo
FROM invoices WHERE ncf IS NOT NULL AND deleted_at IS NULL
GROUP BY 1,2,3 ORDER BY 1,3;

-- 6.3 COMPRAS DUPLICADAS: mismo proveedor y mismo NCF (INV-14).
--     Requisito previo al índice único propuesto.
SELECT company_id, modo, supplier_id, ncf, count(*) AS n_compras,
       array_agg(id) AS ids, SUM(amount) AS total
FROM expenses WHERE ncf IS NOT NULL AND deleted_at IS NULL
GROUP BY 1,2,3,4 HAVING count(*) > 1 ORDER BY 5 DESC;

-- 6.4 Recibos de cobro sospechosos de duplicado (mismo cliente, fecha, importe).
SELECT company_id, customer_id, date, amount, count(*) AS n_recibos, array_agg(id) AS ids
FROM customer_receipts WHERE deleted_at IS NULL
GROUP BY 1,2,3,4 HAVING count(*) > 1 ORDER BY 5 DESC;

-- 6.5 Pagos a proveedor sospechosos de duplicado.
SELECT company_id, ap_id, payment_date, amount, count(*) AS n_pagos, array_agg(id) AS ids
FROM ap_payments WHERE status <> 'voided'
GROUP BY 1,2,3,4 HAVING count(*) > 1 ORDER BY 5 DESC;

-- 6.6 Cheques con número repetido dentro de la misma cuenta bancaria.
SELECT company_id, bank_account_id, check_number, modo, count(*)
FROM checks WHERE deleted_at IS NULL GROUP BY 1,2,3,4 HAVING count(*) > 1;


-- =====================================================================
-- BLOQUE 7 — HUÉRFANOS Y REFERENCIAS ROTAS   (DB-01, DB-15)
-- =====================================================================

-- 7.1 Líneas de asiento sin cabecera (no hay FK que lo impida en todas las rutas).
SELECT l.id, l.journal_entry_id FROM journal_entry_lines l
LEFT JOIN journal_entries je ON je.id = l.journal_entry_id WHERE je.id IS NULL;

-- 7.2 `financial_movements.document_id` es polimórfico y NO tiene FK:
--     ¿a cuántos documentos inexistentes apunta?
SELECT fm.movement_type, count(*) AS movimientos_sin_documento
FROM financial_movements fm
WHERE NOT EXISTS (SELECT 1 FROM invoices          i WHERE i.id  = fm.document_id)
  AND NOT EXISTS (SELECT 1 FROM customer_receipts r WHERE r.id  = fm.document_id)
  AND NOT EXISTS (SELECT 1 FROM expenses          e WHERE e.id  = fm.document_id)
  AND NOT EXISTS (SELECT 1 FROM ap_payments       p WHERE p.id  = fm.document_id)
GROUP BY 1;

-- 7.3 Cobertura de `financial_movements`: ¿todos los documentos tienen su
--     movimiento en el estado de cuenta? (ARP-23)
SELECT 'facturas sin movimiento' AS control, count(*) FROM invoices i
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM financial_movements fm WHERE fm.document_id = i.id)
UNION ALL
SELECT 'recibos sin movimiento', count(*) FROM customer_receipts r
WHERE r.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM financial_movements fm WHERE fm.document_id = r.id);

-- 7.4 Compras con inventario movido pero sin líneas de detalle (ruta 606, INV-20).
SELECT e.company_id, e.id, e.ncf, e.amount,
       (SELECT count(*) FROM expense_lines el WHERE el.expense_id = e.id) AS lineas,
       (SELECT count(*) FROM inventory_movements m WHERE m.reference_id = e.id) AS movimientos
FROM expenses e
WHERE e.deleted_at IS NULL
  AND (SELECT count(*) FROM expense_lines el WHERE el.expense_id = e.id) = 0
  AND (SELECT count(*) FROM inventory_movements m WHERE m.reference_id = e.id) > 0;

-- 7.5 Documentos contables sin asiento asociado (JRN-04: asientos omitidos
--     en silencio por `if (netAmount > 0)` y `if (bankChartAccount)`).
SELECT 'compras sin asiento' AS control, count(*) FROM expenses e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM journal_entries je
                  WHERE je.reference = e.id::text AND je.company_id = e.company_id)
UNION ALL
SELECT 'facturas sin asiento', count(*) FROM invoices i
WHERE i.deleted_at IS NULL AND i.status <> 'draft'
  AND NOT EXISTS (SELECT 1 FROM journal_entries je
                  WHERE je.reference = i.id::text AND je.company_id = i.company_id)
UNION ALL
SELECT 'movimientos bancarios sin asiento', count(*) FROM bank_transactions bt
WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = bt.id::text);


-- =====================================================================
-- BLOQUE 8 — ENTORNO PRUEBA / PRODUCCIÓN   (JRN-09, ISO-08, ISO-09)
-- =====================================================================

-- 8.1 Reparto por entorno de las tablas contables. Un volumen inesperado en
--     PRODUCCION puede ser contaminación desde PRUEBA (JRN-09: los asientos
--     manuales caen siempre en PRODUCCION).
SELECT 'journal_entries' AS tabla, modo, count(*) FROM journal_entries GROUP BY 1,2
UNION ALL SELECT 'invoices', modo, count(*) FROM invoices GROUP BY 1,2
UNION ALL SELECT 'expenses', modo, count(*) FROM expenses GROUP BY 1,2
UNION ALL SELECT 'customer_receipts', modo, count(*) FROM customer_receipts GROUP BY 1,2
UNION ALL SELECT 'ap_payments', modo, count(*) FROM ap_payments GROUP BY 1,2
UNION ALL SELECT 'inventory_levels', modo, count(*) FROM inventory_levels GROUP BY 1,2
ORDER BY 1,2;

-- 8.2 Asientos manuales (sin `reference`) en PRODUCCION: candidatos a haber
--     sido registrados en PRUEBA y caídos en PRODUCCION por el DEFAULT.
SELECT company_id, date, description, id
FROM journal_entries
WHERE reference IS NULL AND modo = 'PRODUCCION' AND deleted_at IS NULL
ORDER BY date DESC LIMIT 100;


-- =====================================================================
-- BLOQUE 9 — TRAZABILIDAD   (JRN-16, DB-16, DB-17)
-- =====================================================================

-- 9.1 ¿Qué cubre realmente el registro de auditoría?
SELECT entity_type, action, count(*), min(created_at) AS desde, max(created_at) AS hasta
FROM audit_logs GROUP BY 1,2 ORDER BY 3 DESC;

-- 9.2 Períodos contables: estado, quién cerró y si el cierre dejó rastro.
SELECT company_id, modo, name, start_date, end_date, status, closed_at, closed_by
FROM accounting_periods ORDER BY company_id, start_date DESC;

-- 9.3 Períodos solapados o duplicados para la misma empresa y entorno.
SELECT a.company_id, a.modo, a.name AS periodo_a, b.name AS periodo_b
FROM accounting_periods a JOIN accounting_periods b
  ON a.company_id = b.company_id AND a.modo = b.modo AND a.id < b.id
 AND a.start_date <= b.end_date AND b.start_date <= a.end_date;
