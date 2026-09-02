# AUDITORÍA DEL MÓDULO CONTABLE MULTIEMPRESA — ContFast v.2

**Fecha:** 29 de agosto de 2026 · **Segunda verificación y correcciones:** 30 de agosto de 2026
**Alcance:** módulo contable completo — arquitectura multiempresa, aislamiento de datos, plan de cuentas, motor de asientos, compras, inventario y costos, ventas, cuentas por cobrar, cuentas por pagar, base de datos, concurrencia, períodos contables y trazabilidad.
**Base analizada:** 177 rutas API, 89 tablas, 20 repositorios, capa de servicios y 47 migraciones SQL.
**Modalidad:** la auditoría original (29/08) fue de solo lectura: no se modificó ni una línea de código, ni un dato, ni una migración.

> **Regla cumplida.** Las secciones 1 a 7 son el informe tal como se entregó, sin correcciones aplicadas. A partir del 30/08 se implementaron algunas de las correcciones propuestas, **cada una autorizada por separado** y con prueba de guarda que impide la regresión: están en la sección **7 ter**, que también recoge lo verificado contra datos reales de producción. Lo no listado ahí sigue siendo una propuesta pendiente de aprobación.

---

## 1. RESUMEN EJECUTIVO

### 1.1 Estado general

El sistema tiene una arquitectura multiempresa **correctamente concebida**: el `companyId` sale siempre del JWT firmado o de la sesión en base de datos, nunca de un parámetro del cliente; los repositorios están parametrizados por empresa; 106 de las 177 rutas API no presentan ningún hallazgo; y hay evidencia en el propio código —comentarios que citan auditorías anteriores— de que varias fugas ya fueron corregidas una por una.

El problema no es la concepción, es que **las tres capas de defensa que el diseño previó están desactivadas**, y que **el motor contable no está terminado**:

1. **El middleware perimetral no se ejecuta.** `src/proxy.ts` implementa 490 líneas de control de acceso por rol y ruta, pero Next.js sólo carga middleware desde `middleware.ts`, archivo que no existe. El manifiesto del último build lo confirma: `"middleware": {}`. Todo ese control es código muerto (ISO-01).
2. **El RLS de Postgres está en modo *fail-open*.** Las migraciones 0024 y 0026 crean políticas de aislamiento por empresa, pero la política permite todo cuando la variable de sesión no está definida, y la única función que la define (`withTenantContext`) **no tiene un solo llamador** (ISO-07 / DB-02).
3. **La configuración contable no se usa.** La tabla `accounting_mappings` existe, se siembra, tiene pantalla y API — y **ningún asiento la consulta jamás**. Cada módulo resuelve sus cuentas por código literal cableado, con seis copias de una función `getOrCreateAccount` que **crea la cuenta al vuelo si no existe** (JRN-01, JRN-03, INV-04, ARP-02).

Sobre esa base, tres hechos concretos definen la gravedad:

- **Cualquier persona en Internet puede crear una sesión válida dentro de la empresa que elija.** `POST /api/storefront/auth/register` es público, acepta el nombre de cualquier empresa activa del sistema y emite cookies de sesión para ella (ISO-02). Combinado con las 54 rutas que sólo comprueban "estás autenticado" (ISO-03), eso da lectura de balances, cartera de clientes y proveedores, libro de banco y **nómina completa** de cualquier empresa del SaaS.
- **No existe costo de ventas.** La venta registra ingreso e ITBIS; nunca se registra `DÉBITO Costo de Ventas / CRÉDITO Inventario`. La utilidad bruta reportada es igual a la venta completa, y el inventario nunca sale del balance (JRN-07, INV-01, ARP-14).
- **El NCF se envía a la DGII antes de reservarse.** `predictNextNcf` lee la secuencia sin bloqueo, el e-CF se firma y se envía, y sólo después `allocateNextNcf` la reserva con `FOR UPDATE`. Dos emisiones simultáneas envían **el mismo NCF a la DGII** y sólo una queda registrada en el sistema (DB-04).

### 1.2 Nivel de riesgo general

# 🔴 CRÍTICO

No es una calificación por acumulación de defectos menores. Tres condiciones la justifican por separado, y cada una bastaría:

| Condición | Consecuencia |
|---|---|
| Registro público en empresa ajena (ISO-02 + ISO-03) | Fuga total de datos financieros y de nómina entre clientes del SaaS |
| Estados financieros sin costo de ventas (INV-01) | Ningún estado financiero emitido hasta hoy es correcto |
| NCF duplicado ante la DGII (DB-04) | Infracción fiscal directa, con venta emitida y no registrada |

### 1.3 Hallazgos por severidad

| Severidad | Cantidad | Significado |
|---|---|---|
| 🔴 CRÍTICO | **28** | Pérdida de datos, contaminación entre empresas, error financiero o descuadre contable |
| 🟠 ALTO | **35** | Información contable incorrecta o inconsistencias importantes |
| 🟡 MEDIO | **30** | Errores en situaciones específicas |
| 🟢 BAJO | **7** | Mejora recomendada |
| **TOTAL** | **100** | |

Los 100 hallazgos no son 100 defectos distintos: **48 de ellos se agrupan en 15 causas raíz transversales** (sección 3), detectadas de forma independiente desde distintas fases de la auditoría. Corregir esas 15 causas resuelve casi la mitad del informe.

> **Actualización tras las dos verificaciones contra datos reales.** El recuento de
> arriba es el del informe original. Después subieron **JRN-16** (7 bis) y **JRN-11**
> (7 ter) de 🟠 ALTO a 🔴 CRÍTICO, y aparecieron tres hallazgos nuevos: **ARP-25** y
> **JRN-23** (🔴 CRÍTICO) y **JRN-24** (🟠 ALTO). El total queda en **103 hallazgos:
> 32 críticos, 34 altos, 30 medios y 7 bajos.** Los tres nuevos y el detalle de lo ya
> corregido están en la sección **7 ter**.

### 1.4 Distribución por fase

| Fase | Anexo | Prefijo | 🔴 | 🟠 | 🟡 | 🟢 | Total |
|---|---|---|---|---|---|---|---|
| 1-2 · Arquitectura y aislamiento multiempresa | 1 | `ISO` | 3 | 3 | 4 | 2 | 12 |
| 3-4 · Plan de cuentas y motor de asientos | 2 | `JRN` | 8 | 5 | 7 | 2 | 22 |
| 5-6 · Compras, inventario y costo de ventas | 3 | `INV` | 5 | 9 | 6 | 1 | 21 |
| 7-8-9 · Ventas, CxC y CxP | 4 | `ARP` | 6 | 10 | 7 | 1 | 24 |
| 10-13 · BD, concurrencia, períodos, trazabilidad | 5 | `DB` | 6 | 8 | 6 | 1 | 21 |

Cada hallazgo, con su descripción completa, causa raíz, escenario, impacto contable, impacto en base de datos, riesgo multiempresa, **evidencia textual con archivo y línea**, solución recomendada y riesgo de implementarla, está en el anexo correspondiente.

---

## 2. HALLAZGOS CRÍTICOS — LOS DIEZ QUE DEBEN ATENDERSE PRIMERO

Ordenados por urgencia real, no por número.

### 1. ISO-02 🔴 — Registro público que crea sesión en cualquier empresa
`POST /api/storefront/auth/register` es público y sin autenticación. Recibe `empresaSlug`, lo resuelve contra **todas las empresas activas** del sistema y emite cookies de sesión válidas para esa empresa. El slug es el nombre comercial en minúsculas sin caracteres especiales: adivinable.
*Evidencia:* `src/app/api/storefront/auth/register/route.ts:33-80`, `src/services/storefront/companyService.ts:20-55`.
**Es el único hallazgo explotable desde fuera sin credenciales. Debe cerrarse hoy.**

### 2. DB-04 🔴 — El NCF se envía a la DGII antes de reservarlo
`predictNextNcf` (sin bloqueo) → envío del e-CF firmado a la DGII → `allocateNextNcf` (con `FOR UPDATE`). Dos emisiones concurrentes envían el mismo NCF; la segunda transacción aborta y esa venta no queda en el sistema, pero su comprobante sí está en la DGII.
*Evidencia:* `src/services/invoiceService.ts:41-57`, `src/services/invoice/invoiceDbBooker.ts:131-146, 224-229`.

### 3. INV-01 / JRN-07 / ARP-14 🔴 — No existe asiento de costo de ventas
La venta asienta CxC/Caja, Ventas, ITBIS y retenciones. El descargo de inventario ocurre en el conduce de entrega, que **no genera ningún asiento**. Los mapeos `cost_of_goods_sold` e `inventory` existen y no tienen consumidor.
*Efecto:* utilidad bruta = venta completa; inventario nunca sale del balance; ISR sobre utilidad ficticia.
*Evidencia:* `src/services/invoice/invoiceDbBooker.ts:425-431`, `src/repositories/deliveryRepository.ts:300-315`.

### 4. JRN-01 / INV-04 / ARP-02 🔴 — Dos planes de cuentas divergentes y colisión de códigos
El catálogo que la aplicación siembra usa 4 niveles; los códigos cableados en los módulos de asiento son de 3. `getOrCreateAccount` busca por código, **ignora el nombre** y crea la cuenta si no existe. Resultado documentado: `1.1.02` es "Cuentas por Cobrar Clientes" para ventas y "Efectivo en Bancos" para compras — **la misma cuenta recibe los débitos de clientes y los créditos de banco de los cheques en garantía**. Las retenciones de ISR se debitan en `1.1.03 Inventarios`. La cuenta de inventario del plan (`1.1.03.01`) **nunca recibe un asiento**.
*Evidencia:* `src/repositories/accountingRepository.ts:498-524` vs `src/app/api/v1/expenses/route.ts:304-305,347-377` y `src/services/invoice/invoiceDbBooker.ts:389-419`.

### 5. DB-05 / JRN-05 / ARP-09 🔴 — El cierre de período no cierra nada
La validación de período abierto existe en un solo punto: `createJournalEntry`. Los recibos de cobro (`arRepository.ts:189-199`) y los movimientos bancarios (`bankRepository.ts:230-260`) **construyen el asiento a mano**, saltándose la validación de período *y* la de partida doble. El borrado de una compra elimina asientos sin comprobar período. Los estados financieros de un período cerrado son mutables indefinidamente.

### 6. ARP-04 / ARP-05 / DB-08 🔴 — Un cobro puede aplicarse a la factura de otro cliente, sin tope
`customer_receipt_applied` no tiene `companyId` ni `customerId`. Se valida la empresa pero **no el cliente**, y la fila de aplicación se inserta **antes** de validar. Tampoco se valida `amountApplied ≤ ar.balance`: un sobrepago deja `balance = -30,000` con `status = 'paid'`, invisible en el listado de pendientes.
*Evidencia:* `src/repositories/arRepository.ts:117-151`.

### 7. ARP-06 🔴 — Doble pago a proveedor por lectura fuera de la transacción
`ApService.registerPayment` abre `db.transaction`, pero `ApRepository.findById` consulta sobre la **conexión global**. La validación de tope y el cálculo del nuevo saldo usan esa lectura externa. Dos pagos simultáneos de RD$100,000 sobre una deuda de RD$100,000 pasan ambos: dos cheques, dos asientos, un solo saldo en cero.
*Evidencia:* `src/services/apService.ts:45-55, 140-141`.

### 8. JRN-04 🔴 — Asientos omitidos en silencio
Dos rutas condicionan la creación del asiento a un `if` sin `else`: `if (netAmount > 0)` en compras y `if (bankChartAccount)` en banco. Cuando falla, la operación **devuelve éxito sin registrar nada en contabilidad**, y el saldo bancario ya se movió. Además, la cuenta de banco se elige por `.includes('banco')` sobre el nombre: siempre gana la primera que aparezca, sea cual sea la cuenta real del movimiento.
*Evidencia:* `src/app/api/v1/expenses/route.ts:331-333`, `src/repositories/bankRepository.ts:222-262`.

### 9. JRN-08 / INV-10 / DB-10 🔴 — Los asientos se borran físicamente
Editar o eliminar una compra ejecuta `DELETE` sobre `journal_entry_lines` y `journal_entries`. No hay contrasiento, no se escribe `deletedAt` (la columna existe y **nunca se usa**), no se valida período. Un 606 ya presentado puede quedar sin respaldo contable. Además la reversión de inventario usa `Math.max(0, ...)`, que **recorta en silencio** si la mercancía ya se vendió.
*Evidencia:* `src/app/api/v1/expenses/[id]/route.ts:356-372, 631-644, 265-272`.

### 10. DB-06 / JRN-06 / INV-14 🔴 — No existe ninguna clave de idempotencia
No hay índice único sobre `(company_id, modo, reference)` en asientos, ni sobre `(company_id, supplier_id, ncf)` en compras, ni comprobación de "ya existe". Un doble clic o un reintento por timeout duplica compra, inventario, CxP, asiento y renglón del 606. La factura se salva por accidente, gracias al `FOR UPDATE` de la secuencia NCF.

---

## 3. CAUSAS RAÍZ TRANSVERSALES

48 de los 100 hallazgos provienen de 15 defectos estructurales. Esta es la tabla que debe guiar el plan de corrección: arreglar la causa, no el síntoma.

| # | Causa raíz | Hallazgos que produce |
|---|---|---|
| RC-01 | Cuentas resueltas por código cableado, con 6 copias de `getOrCreateAccount` que crean la cuenta al vuelo; `accounting_mappings` nunca se lee | JRN-01, JRN-02, JRN-03, INV-04, INV-21, ARP-02, ARP-18 |
| RC-02 | El movimiento de inventario y el mayor nunca se conectaron | JRN-07, INV-01, INV-07, ARP-14 |
| RC-03 | La validación de período vive en `createJournalEntry` y hay tres caminos que la esquivan | JRN-05, JRN-11, ARP-09, DB-05 |
| RC-04 | Ninguna operación tiene clave de idempotencia ni restricción de unicidad de negocio | JRN-06, INV-14, DB-06, DB-13 |
| RC-05 | Saldos actualizados con leer-modificar-escribir, sin `FOR UPDATE` ni `UPDATE` atómico | INV-09, ARP-06, ARP-07, ARP-13, DB-07 |
| RC-06 | Las correcciones se implementan borrando en vez de contrasentando | JRN-08, INV-10, DB-10 |
| RC-07 | `modo` (PRUEBA/PRODUCCIÓN) se gobierna con una cookie del cliente y se filtra de forma inconsistente | ISO-08, ISO-09, ISO-10, JRN-09, ARP-20, ARP-21 |
| RC-08 | Las tablas de detalle contable no llevan `company_id` | DB-01, ARP-04 |
| RC-09 | Identificadores del cuerpo de la petición usados sin validar pertenencia a la empresa | ISO-04, ISO-05, ISO-06, ARP-16, DB-19 |
| RC-10 | Sin invariantes en la base: prácticamente ningún `CHECK` contable | JRN-15, DB-03 |
| RC-11 | Campos fiscales capturados que el asiento ignora (ISC, propina, proporcionalidad del ITBIS) | JRN-19, INV-05 |
| RC-12 | Fechas de asiento tomadas en UTC en un país UTC−4 | JRN-18, ARP-19 |
| RC-13 | Código duplicado y divergido: dos rutas de "crear compra", dos mecanismos de pago a proveedor | INV-20, ARP-11, ARP-22 |
| RC-14 | Sin `created_by` en las tablas contables | JRN-16, DB-17 |
| RC-15 | Defensas declaradas pero desactivadas: middleware inexistente, RLS *fail-open*, FK `NOT VALID` | ISO-01, ISO-07, DB-02, JRN-20 |

---

## 4. MATRIZ DE RIESGO POR MÓDULO

Escala: 🔴 crítico · 🟠 alto · 🟡 medio · 🟢 bajo/controlado.

| Módulo | Contable | Técnico | Base de datos | Multiempresa | Seguridad | Hallazgos clave |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Autenticación / storefront** | 🟢 | 🟠 | 🟡 | 🔴 | 🔴 | ISO-02, ISO-01, ISO-03 |
| **Plan de cuentas** | 🔴 | 🟠 | 🟠 | 🟠 | 🟢 | JRN-01, JRN-02, JRN-12 |
| **Motor de asientos** | 🔴 | 🔴 | 🟠 | 🟡 | 🟡 | JRN-04, JRN-05, JRN-06 |
| **Facturación / e-CF** | 🔴 | 🔴 | 🟠 | 🟠 | 🟡 | DB-04, ARP-01, ARP-03, ISO-04 |
| **Inventario y costos** | 🔴 | 🟠 | 🟠 | 🟡 | 🟢 | INV-01, INV-02, INV-03, INV-08, INV-09 |
| **Compras / gastos** | 🔴 | 🟠 | 🟠 | 🟡 | 🟡 | INV-03, INV-05, INV-14, JRN-08 |
| **Cuentas por cobrar** | 🔴 | 🔴 | 🟠 | 🟠 | 🟡 | ARP-04, ARP-05, ARP-07, ARP-09 |
| **Cuentas por pagar** | 🔴 | 🔴 | 🟠 | 🟡 | 🟡 | ARP-06, ARP-11, ARP-12, ARP-13 |
| **Bancos y caja** | 🟠 | 🟠 | 🟡 | 🟡 | 🟠 | JRN-04, ARP-08, ISO-03 |
| **Períodos contables** | 🔴 | 🟠 | 🟡 | 🟢 | 🟠 | DB-05, JRN-11, DB-12 |
| **Reportes financieros** | 🟠 | 🟡 | 🟢 | 🟡 | 🟠 | JRN-10, JRN-17, DB-09, ISO-03 |
| **Trazabilidad / auditoría** | 🔴 | 🟡 | 🟠 | 🟡 | 🟠 | JRN-16, DB-16, DB-17 |
| **Nómina (HR)** | 🟡 | 🟡 | 🟡 | 🔴 | 🔴 | ISO-03 (datos personales sin control de permiso) |

**Lectura de la matriz:** el riesgo contable es crítico en siete módulos, y en los tres pilares del ciclo (facturación, inventario, CxC/CxP) lo es simultáneamente en lo contable y en lo técnico. El riesgo multiempresa es crítico sólo en dos puntos —autenticación y nómina— pero esos dos son suficientes para comprometer todo el SaaS.

---

## 5. ESCENARIOS CRÍTICOS (Fase 14)

Evaluados por análisis estático del código. **No se ejecutaron** contra un sistema en funcionamiento (ver sección 7).

| # | Escenario | Operativo | Inventario | Contable | Fiscal | BD | Duplicación |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Compra de mercancía a crédito | ✅ | ⚠️ doble entrada si hubo pedido (INV-08) | ⚠️ cuenta `1.1.06` huérfana (INV-04) | ✅ | ⚠️ | 🔴 sin NCF único (INV-14) |
| 2 | Compra con ITBIS | ✅ | ⚠️ | ⚠️ ITBIS a `1.1.08`, cuenta inexistente en el plan | ✅ | ⚠️ | 🔴 |
| 3 | Compra con retenciones | 🔴 **el formulario no las envía** (INV-16) | ✅ | ⚠️ el backend sí las asienta como pasivo (correcto) | 🔴 606 con retenciones en cero | ✅ | 🔴 |
| 4 | Compra en moneda extranjera | 🔴 **no soportado**: no hay campo de moneda ni tasa (INV-15) | — | 🔴 sin diferencia cambiaria | 🔴 | — | — |
| 5 | Venta al contado | ✅ | ⚠️ no descuenta hasta el conduce | 🔴 **sin costo de ventas** | ⚠️ DB-04 | ✅ | ⚠️ NCF protegido por `FOR UPDATE` |
| 6 | Venta a crédito | ✅ | ⚠️ | 🔴 sin costo de ventas | ⚠️ | ⚠️ ISO-04 cliente sin validar | ⚠️ |
| 7 | Cobro parcial de factura | ✅ | — | 🟠 asiento a mano, sin período (ARP-09) | ✅ | 🔴 sin tope ni validación de cliente (ARP-04/05) | 🔴 race condition (ARP-07) |
| 8 | Pago parcial a proveedor | ✅ | — | ⚠️ banco no se mueve si no es cheque en garantía (ARP-08) | ✅ | 🔴 lectura fuera de transacción | 🔴 doble pago (ARP-06) |
| 9 | Devolución de mercancía (NC e-34) | ⚠️ | 🔴 **reingresa stock sin verificar despacho** (INV-11) | 🔴 sin tope contra el documento afectado (ARP-15) | ⚠️ | ⚠️ | 🔴 NC ilimitadas |
| 10 | Anulación de factura | 🔴 **no existe** (ARP-01) | — | 🔴 sin contrasiento | 🔴 607 con ventas inexistentes | — | — |
| 11 | Producto con costo cero | ✅ se vende sin bloqueo | ✅ | 🔴 sin asiento de costo; margen 100 % en el BI | ⚠️ ISR sobre utilidad inflada | ✅ | — |
| 12 | Inventario negativo | ✅ bloqueado en `checkStock` y por `CHECK` | ⚠️ el `CHECK` es `NOT VALID` | ✅ | ✅ | ⚠️ | ⚠️ evitable por race condition (INV-09) |
| 13 | Usuario accediendo a otra empresa | 🔴 **posible por registro público** (ISO-02) | 🟢 FK compuestas lo contienen | 🟠 | 🔴 | 🔴 54 rutas sin control de permiso | — |
| 14 | Dos usuarios operando a la vez | ⚠️ | 🔴 existencia inventada (INV-09) | 🔴 asientos y pagos duplicados | 🔴 NCF duplicado ante DGII (DB-04) | 🔴 | 🔴 sin idempotencia |

Leyenda: ✅ correcto · ⚠️ funciona con reservas · 🔴 defecto confirmado en código.

---

## 6. PLAN DE CORRECCIÓN

**Principio rector:** ninguna corrección masiva. Cada punto es un cambio independiente, con su propia prueba y su propio despliegue. Los bloques están ordenados por dependencia, no sólo por severidad: aplicar un bloque antes que aquel del que depende **rompe el sistema**.

### FASE 0 — Contención inmediata (horas, riesgo bajo)

Cambios pequeños, aislados y reversibles que cierran las exposiciones más graves sin tocar la contabilidad.

| Orden | Acción | Hallazgo | Riesgo |
|---|---|---|---|
| 0.1 | Restringir `POST /api/storefront/auth/register` a empresas con storefront habilitado; si ninguna lo usa hoy, deshabilitar el endpoint | ISO-02 | Bajo |
| 0.2 | Añadir `enforcePermission` a las rutas de nómina, financiero, banco y reportes (subconjunto de sólo lectura sensible de las 54) | ISO-03 | Bajo-medio |
| 0.3 | Añadir `modo: session.modo` en `POST /api/v1/accounting/journals` (una línea) | JRN-09 | Muy bajo |
| 0.4 | Añadir el filtro de `modo` a los tres listados de recibos y al bloque de productos del estado de cuenta | ISO-09, ISO-10, ARP-20 | Bajo |
| 0.5 | Validar `customerId`, `warehouseId` y `productId` contra la empresa en facturas, cotizaciones y recibos, replicando el patrón ya existente en `expenses/route.ts:107-139` | ISO-04, ISO-05, ISO-06 | Medio (verificar antes con `verificacion-bd.sql`, bloque 3) |
| 0.6 | `eq(inventoryLevels.companyId, ...)` en las dos consultas del `PUT /expenses/[id]` | INV-19 | Nulo |

**Ejecutar antes que nada:** `verificacion-bd.sql` (adjunto). Los bloques 3, 4, 5 y 6 dicen cuántos datos ya están dañados; varias de estas correcciones empezarán a rechazar operaciones sobre documentos históricos si no se sanean primero.

### FASE 1 — Integridad transaccional (días, riesgo bajo-medio)

Cierra la duplicación y las condiciones de carrera. No cambia ningún criterio contable, así que no altera saldos existentes.

| Orden | Acción | Hallazgo |
|---|---|---|
| 1.1 | **Invertir el orden del NCF**: reservar con `allocateNextNcf` en transacción confirmada *antes* de llamar a la DGII; registrar la factura en estado `pending_dgii` | DB-04 |
| 1.2 | Pasar `tx` a `ApRepository.findById` y sustituir el cálculo del saldo por `UPDATE ... SET balance = balance - $x WHERE balance >= $x RETURNING` | ARP-06 |
| 1.3 | Mismo patrón atómico en `accounts_receivable`, `inventory_levels` y la aplicación de cheques en garantía | ARP-07, ARP-13, INV-09 |
| 1.4 | Validar en el cobro: `arId` del mismo cliente, `amountApplied ≤ ar.balance`, y **validar antes de insertar** la fila de aplicación | ARP-04, ARP-05 |
| 1.5 | Índice único de compras por `(company_id, modo, supplier_id, ncf)`, previo saneamiento | INV-14 |
| 1.5b | ~~Índice único de asientos por `(company_id, modo, reference)`~~ — **RETIRADO**. Un contrasiento apunta legítimamente al mismo documento que el asiento que revierte, de modo que el índice bloquearía la propia operación de corrección. La idempotencia tiene que resolverse en la operación (clave documento+operación), no en `reference`. Se replantea en la Fase 2 | JRN-06 |
| 1.6 | `CHECK` en `journal_entry_lines` (`debit>=0`, `credit>=0`, exclusividad) y en los saldos (`0 <= balance <= amount`), creados `NOT VALID` y validados tras sanear | JRN-15, DB-03 |
| 1.7 | Redondear cada línea a 2 decimales antes de validar el cuadre; comparar en centavos enteros, sin tolerancia | JRN-14 |

### FASE 2 — Cierre del motor contable (semanas, riesgo alto — requiere corte)

Es la corrección estructural. **El orden interno es obligatorio.**

| Orden | Acción | Hallazgo | Nota |
|---|---|---|---|
| 2.1 | Garantizar que **toda** empresa tenga catálogo y los mapeos completos sembrados | JRN-03 | Precondición de todo lo demás |
| 2.2 | Ampliar `accounting_mappings` con las claves que faltan (retenciones, ISC, banco por conciliar, propina) | JRN-03, JRN-19 | |
| 2.3 | Escribir **un único** `resolveAccount(tx, companyId, mappingKey)` que lea los mapeos y **lance error** si falta; eliminar las 6 copias de `getOrCreateAccount` | RC-01 | Ninguna cuenta vuelve a crearse al vuelo |
| 2.4 | Convertir en error los asientos hoy omitidos en silencio (`if (netAmount > 0)`, `if (bankChartAccount)`); enlazar cada cuenta bancaria a su cuenta del catálogo | JRN-04 | |
| 2.5 | Reescribir el asiento de cobro (`arRepository`) y el de banco (`bankRepository`) como llamadas a `createJournalEntry` | JRN-05, ARP-09 | Restituye la validación de período y de cuadre |
| 2.6 | Validar dentro de `createJournalEntry` que cada cuenta sea de la empresa, `isTransactional`, activa y no borrada | JRN-12 | **Sólo después de 2.3**, o bloquea toda la operación |
| 2.7 | Script de saneamiento: reclasificar los asientos que fueron a cuentas huérfanas o colisionadas, mediante asiento de reclasificación con corte de período — **nunca con `UPDATE` directo** | JRN-01, INV-04, ARP-02 | Requiere validación del contador, empresa por empresa |
| 2.8 | Sembrar períodos contables al crear la empresa y convertir el auto-bootstrap de `isPeriodOpen` en error | JRN-11 | |
| 2.9 | Sustituir el borrado de asientos por contrasiento (`status='reversed'` + asiento inverso), validando período | JRN-08, INV-10, DB-10 | |
| 2.10 | Añadir `created_by` a `journal_entries` y propagarlo desde los 13 llamadores | JRN-16, DB-17 | Nullable para lo histórico |

### FASE 3 — Costos e inventario (semanas, riesgo muy alto — cambio de modelo)

No puede empezar antes de la Fase 2: sin resolvedor de cuentas, el asiento de costo iría a una cuenta huérfana.

| Orden | Acción | Hallazgo |
|---|---|---|
| 3.1 | Añadir `unit_cost`/`total_cost` a `inventory_movements` y `average_cost` a `inventory_levels`; recalcular promedio ponderado en cada entrada, con bloqueo de fila | INV-02 |
| 3.2 | Migración de costeo inicial del inventario existente (ajuste de apertura documentado) | INV-02 |
| 3.3 | Emitir el asiento `DÉBITO Costo de Ventas / CRÉDITO Inventario` en la misma transacción que `deductStock`, y su inverso en la anulación de conduce y en la NC | INV-01, JRN-07 |
| 3.4 | Decidir Inventario vs. Gasto **por línea** (`productId` + `tracksInventory`), no por la presencia de almacén | INV-03 |
| 3.5 | Unificar la entrada de existencia: recepción de pedido o factura de compra, no ambas | INV-08 |
| 3.6 | Asiento de merma/sobrante en los ajustes de inventario | INV-07 |
| 3.7 | Reporte de conciliación inventario físico vs. contable | INV-12 |

### FASE 4 — Ciclo completo de documentos (semanas, riesgo medio)

| Orden | Acción | Hallazgo |
|---|---|---|
| 4.1 | Endpoint de anulación de factura con contrasiento, idempotente y con las validaciones fiscales dominicanas | ARP-01 |
| 4.2 | Anulación de cheques y reverso de pagos (los estados `voided` existen y son inalcanzables) | ARP-12 |
| 4.3 | `modifiedInvoiceId` obligatorio para e-33/e-34, y tope de la NC contra el documento afectado | ARP-03, ARP-15 |
| 4.4 | Movimiento bancario y ajuste de saldo en cobros y pagos que no sean en efectivo | ARP-08 |
| 4.5 | Unificar las dos rutas de creación de compra y retirar el mecanismo muerto `supplier_payments` | INV-20, ARP-11, ARP-22 |
| 4.6 | Contabilizar ISC, propina y proporcionalidad del ITBIS; exponer las retenciones en el formulario de compras | INV-05, INV-16, JRN-19 |
| 4.7 | Sincronizar `invoices.paymentStatus` con el auxiliar | ARP-10 |

### FASE 5 — Defensa en profundidad y gobierno (continuo, riesgo variable)

| Orden | Acción | Hallazgo | Riesgo |
|---|---|---|---|
| 5.1 | Crear `src/middleware.ts` para activar el RBAC perimetral, **junto con** la corrección de `includes()` a igualdad exacta | ISO-01, ISO-12 | **Alto** — pruebas por rol en staging |
| 5.2 | Envoltorio `withApiAuth(modulo, accion, handler)` para las 54 rutas restantes + regla de lint que lo exija | ISO-03 | Medio-alto |
| 5.3 | Mover `modo` al JWT firmado y exigir permiso para operar en PRODUCCIÓN | ISO-08 | Medio |
| 5.4 | Instrumentar `withTenantContext` en toda la capa de datos; verificar `BYPASSRLS` del rol; **por último** retirar la escapatoria `IS NULL` de las políticas RLS | ISO-07, DB-02 | **Muy alto si se altera el orden** — retirarla antes de instrumentar deja el sistema sin acceso a ningún dato |
| 5.5 | Sanear y ejecutar `VALIDATE CONSTRAINT` sobre las FK compuestas de la migración 0032 y el `CHECK` de inventario de la 0031 | JRN-20, INV-18 | Medio |
| 5.6 | Añadir la fila "Resultado del ejercicio" al balance general y unificar los filtros de los seis reportes | JRN-10, JRN-17, DB-09 | Bajo |
| 5.7 | Cobertura del registro de auditoría sobre las operaciones contables críticas | DB-16 | Bajo |

---

## 7. LO QUE NO SE VERIFICÓ

Se declara explícitamente para que nadie asuma una cobertura que no existe.

1. **La Fase 14 no pudo ejecutarse contra la base de datos.** Se autorizó el acceso de solo lectura y se preparó el cliente, pero el entorno de auditoría **no tiene salida de red** hacia la instancia: los puertos 5432 y 6543 del pooler de Supabase están bloqueados, y también el HTTPS de salida (política de egreso de la organización). **En su lugar se entrega `verificacion-bd.sql`**, con 45 consultas de solo lectura listas para ejecutar en el SQL Editor de Supabase. **Hasta que se ejecute, no se sabe cuánto daño existe ya en los datos**, y varias correcciones de la Fase 1 fallarán si hay filas históricas que violen los nuevos índices y `CHECK`.
2. **No se ejecutó ninguna prueba dinámica.** No se levantó la aplicación ni se emitió una petición HTTP. Todos los escenarios de explotación son deducciones a partir del código, consistentes con lo leído pero no reproducidos.
3. **No se verificó qué migraciones están aplicadas en producción.** Todo lo afirmado sobre restricciones proviene de los archivos de `drizzle/`. Las FK compuestas de la 0032 y el `CHECK` de la 0031 se crearon `NOT VALID`, y sus `VALIDATE CONSTRAINT` están **comentados** en la propia migración.
4. **`src/actions/` (Server Actions) no se auditó.** Es otra superficie invocable desde el navegador, con su propia lectura de `cf_environment`. Debería ser el objeto de una fase siguiente.
5. **Módulos fuera de alcance:** nómina (más allá de su exposición por permisos), caja/POS más allá de su interacción con la factura, `dgii/*`, `jobs/*`, OCR e integraciones de IA (no se analizó qué datos salen hacia proveedores externos), `rateLimiter` y `storageService`.
6. **No se ejecutaron los tests existentes** (`src/tests/aislamientoModo.vitest.ts`, `inventoryService.vitest.ts`), así que no se sabe qué invariantes cubren ni si alguno falla hoy.
7. **No se revisaron los archivos comprimidos de la raíz** (`bancos_y_inventario.tgz`, `envios_dgii.tgz`, `modo_obligatorio.tgz`, `pdf_token.tgz`, `grupo_e_caja.tgz`) ni los scripts de `scratch/`, que podrían contener trabajo en curso sobre estos mismos puntos.
8. **Nota sobre el build:** `next.config.ts:4` tiene `typescript: { ignoreBuildErrors: true }`. El compilador no detendrá un despliegue ante errores de tipos, lo que ha permitido que defectos como JRN-09 (parámetro obligatorio omitido) lleguen a producción sin señal alguna. Conviene tratarlo como hallazgo de proceso.

---

## 7 bis. VERIFICACIÓN EN BASE DE DATOS — RESULTADOS

Ejecutado el 29/08/2026 con `verificacion-bd.sql`. **Cinco de los seis controles que
bloqueaban la Fase 1 salieron limpios**: cero asientos descuadrados, cero líneas
inválidas, cero compras duplicadas por NCF, cero saldos imposibles en CxC y en CxP.

Un único hallazgo, y dos correcciones al propio informe que se derivan de él.

### El caso: asiento duplicado de 545.724,30 en un julio cerrado

Empresa `38a1a51e…`, compra NCF `E310000012204` (gasto `3cfc85cb…`). Dos asientos
vivos para el mismo documento:

| | 20/07 14:31 | 20/07 15:06 |
|---|---|---|
| 5.1.01 Costo de Ventas | D 545.719,20 | D 545.719,20 |
| 5.1.02 Otros Impuestos | D 5,10 | D 5,10 |
| 1.1.08 ITBIS Pagado | — | D 98.229,46 |
| 2.1.01 Cuentas por Pagar | H 545.724,30 | H 545.724,30 |
| 2.1.05 ITBIS Retenido | — | H 98.229,46 |

El segundo es el correcto (la compra lleva retención del 100 % del ITBIS). El mayor
quedó inflado en **545.724,30** en Costo de Ventas y en Cuentas por Pagar, dentro de
un período cerrado el 01/08/2026. La cuenta por pagar **no** está duplicada, de modo
que auxiliar y mayor divergen exactamente en esa cifra desde el 20/07.

El 606 no está afectado: se genera desde `expenses`, y ahí hay un solo registro.

**Causa no determinada.** El gasto nunca se editó (`updated_at` = `created_at`), no
está borrado, y es el único con ese NCF. Todos los caminos de inserción generan el id
en el servidor con `uuidv4()`, el POST no acepta un id del cuerpo y no hay colas
implicadas. Con el código actual la secuencia observada — un asiento que referencia un
id generado 35 minutos después — **no puede ocurrir**. La única hipótesis compatible,
no verificable desde el código de hoy, es que el despliegue estuviera a medias: el
commit `ef72ec9`, que toca justo esta lógica, es de ese mismo día.

Por la vía de la edición no se repetirá: el bloque que borra los asientos anteriores
está en el código desde el 06/07 y no es condicional.

**Corrección acordada:** contrasiento en agosto (período abierto) por la pantalla de
asientos manuales, con los tres ids en la descripción. Julio queda como se declaró.

### Las dos correcciones al informe

1. **JRN-16 sube de 🟠 ALTO a 🔴 CRÍTICO.** Este caso se habría cerrado en un minuto
   con `created_by` en `journal_entries`. Toda la trazabilidad disponible para 545 mil
   pesos fueron un `logout` y un `login` en `audit_logs`. No es papeleo: es la
   diferencia entre explicar un descuadre y quedarse mirándolo.

2. **Se retira el índice único sobre `reference`** (punto 1.5 del plan). Un contrasiento
   referencia el mismo documento que el asiento que corrige, así que ese índice habría
   impedido justamente la operación con la que se arregla esto. La idempotencia se
   replantea en la Fase 2 sobre una clave de operación propia.

### Otros hallazgos confirmados por este mismo documento

- **INV-03 / INV-06** — una compra de 545 mil con NCF fiscal fue directa a
  `5.1.01 Costo de Ventas` (sin almacén), no a inventario.
- **INV-04 / JRN-02** — `1.1.08` y `2.1.05` son cuentas creadas al vuelo: no existen en
  el catálogo que el sistema siembra (`1.1.04.01` y `2.1.02.02`).
- **JRN-12** — `2.1.01 Cuentas por Pagar`, cuenta de agrupación, recibe movimientos.
- **JRN-11** — los períodos `07/2026` de ambas empresas los creó el auto-bootstrap, no
  una persona. Y la empresa `1d731da2…` quedó **sin poder contabilizar desde el 01/08**
  por no tener período de agosto; se abrieron agosto a diciembre con
  `abrir-periodos-2026.sql`.

---

## 7 ter. SEGUNDA VERIFICACIÓN CONTRA DATOS REALES — 30/08/2026

La primera verificación (7 bis) midió el daño con las consultas del guion. Esta
segunda salió de tirar del hilo de los saldos bancarios, y acabó explicando el
mecanismo que está detrás de casi todos los hallazgos del anexo 2.

A diferencia de la auditoría original, aquí **sí se aplicaron correcciones**, cada
una autorizada por separado. Van listadas al final de la sección.

---

### 7ter.1 El plan de cuentas: 12 de los 14 códigos que usa el motor están mal

Se cruzaron las 38 llamadas a `getOrCreateAccount` contra las 52 cuentas que el
sistema siembra en `seedDefaultChartOfAccounts`. El motor pide **14 códigos
distintos**. Dos son correctos. Los otros doce, no.

| Pide | Cree que pide | Realmente cae en | Debería ser |
|---|---|---|---|
| `1.1.01` | Efectivo en Caja y Bancos | **agrupación** | el banco que toque, o `1.1.01.01` Caja General |
| `1.1.02` | CxC Clientes | **agrupación** | `1.1.02.01` Cuentas por Cobrar Clientes |
| `1.1.03` | Anticipo ISR retenido | **Inventarios** (agrupación) | `1.1.04.02` Anticipos de ISR |
| `1.1.04` | Anticipo ITBIS retenido | **agrupación** | *no existe cuenta* |
| `1.1.05` | Otras retenciones | *no existe* → la crea | *no existe cuenta* |
| `1.1.06` | Inventario de Mercancía | *no existe* → la crea | `1.1.03.01` Inventario de Mercancía |
| `1.1.08` | ITBIS Pagado en Compras | *no existe* → la crea | `1.1.04.01` ITBIS Pagado en Compras |
| `2.1.01` | Cuentas por Pagar | **agrupación** | `2.1.01.01` CxP Proveedores |
| `2.1.03` | ITBIS por Pagar | *no existe* → la crea | `2.1.02.01` ITBIS Cobrado en Ventas |
| `2.1.04` | ISR Retenido por Pagar | *no existe* → la crea | `2.1.02.03` Retenciones de ISR por Pagar |
| `2.1.05` | ITBIS Retenido por Pagar | *no existe* → la crea | `2.1.02.02` ITBIS Retenido por Pagar |
| `5.1.02` | Otros Impuestos y Tasas | *no existe* → la crea | *no existe cuenta* |
| `4.1.01` | Ingresos por Ventas | Ventas de Mercancías | correcta (sólo cambia el nombre) |
| `5.1.01` | Costo de Ventas | Costo de Ventas Mercancías | correcta (sólo cambia el nombre) |

**Siete códigos no existen en el catálogo**, y `getOrCreateAccount` los crea al vuelo
con `nature`, `level` y `parent_id` por defecto. **Cinco son cuentas de agrupación**,
que reciben movimientos y duplican el saldo entre padre e hijo.

Dos consecuencias que conviene leer despacio:

- **Las retenciones de ISR se debitan contra `1.1.03`, que en este catálogo es
  Inventarios.** No es una cuenta parecida: es otra cosa.
- Las cuentas `2.1.03`, `2.1.04` y `2.1.05` que aparecen en el catálogo de la empresa
  `38a1a51e…` **no las creó nadie a mano: las creó este código**, duplicando a
  `2.1.02.01`, `.02` y `.03`, que existían desde el primer día.

Y tres conceptos que el motor necesita **no tienen cuenta en ninguna parte**: el ITBIS
retenido por terceros a nuestro favor, otras retenciones a favor, y los otros impuestos
y tasas. Ahí no basta con remapear: hay que ampliar el plan de cuentas, y eso lo decide
quien lleva la contabilidad.

Esto confirma con cifras JRN-01, JRN-02, JRN-12, INV-04 y ARP-02. La causa raíz es una
sola: **el código se escribió contra un plan de cuentas que no es el que el sistema
siembra**, y `getOrCreateAccount` busca por código literal, ignora el nombre que se le
pasa y crea la cuenta si no la encuentra. Nunca falla. Por eso no se vio en meses.

> **Estado:** no migrado, por decisión del cliente. La deuda queda **congelada** por
> `src/tests/resolucionCuentas.vitest.ts`: 6 ficheros y 38 llamadas, y la lista sólo
> puede encoger. El flujo de cheques en garantía —el único donde el daño llegó a ser
> cuantificable— sí usa ya el resolvedor.

---

### 7ter.2 El hilo de los bancos, de punta a punta

Empresa `38a1a51e…`. El libro de banco tiene **seis movimientos en toda su vida**,
todos de agosto de 2026. De ellos salió lo siguiente.

**ARP-25 🔴 CRÍTICO (nuevo) — un cheque en garantía se daba por cobrado al vencer.**
`ApService.applyDueGuaranteeChecks` buscaba los cheques con `dueDate <= hoy` y, sin
ninguna otra condición, los marcaba `cleared`, restaba el importe del saldo bancario,
insertaba un movimiento de banco y asentaba. La fecha de vencimiento de un cheque en
garantía es la que se pactó con el proveedor para presentarlo; no es la fecha en que el
banco lo paga, y en un cheque en garantía puede que no lo pague nunca. El sistema
convertía una fecha pactada en un hecho bancario.

Agravante: el movimiento se insertaba con `status: 'reconciled'` **cableado**. Nacía
conciliado sin que nadie lo hubiera cotejado con un estado de cuenta, de modo que la
conciliación bancaria no podía detectar jamás un movimiento que el banco no tuviera.

Cuatro cheques (#108, #110, #112 y #114) por **1.000.782,79** se aplicaron así. En este
caso concreto sí se habían cobrado —confirmado por el cliente contra el banco—, pero por
casualidad, no por control.

**El asiento de esos cuatro cheques fue contra la cuenta equivocada.** Debitó la cuenta
por pagar (bien) y acreditó `1.1.02 Cuentas por Cobrar` (mal), porque el bloque del
cheque en garantía pedía `getOrCreateAccount(..., '1.1.02', 'Efectivo en Bancos', ...)`.
Resultado: se redujo el saldo de lo que deben los clientes sin que ningún cliente pagara
nada, y el mayor de CxC dejó de cuadrar con el auxiliar en exactamente esa cifra.

**JRN-23 🔴 CRÍTICO (nuevo) — el saldo inicial de una cuenta bancaria nunca se
contabiliza.** `createBankAccount` guarda `initialBalance` en el catálogo y no genera
ningún asiento. Lo que se teclea en ese campo entra al módulo de bancos y no existe para
la contabilidad. En esta empresa son **1.142.000,00** (30.000,00 en Banreservas y
1.112.000,00 en Scotiabank, tecleados el 08/07/2026) que el mayor nunca vio.

**JRN-24 🟠 ALTO (nuevo) — ese saldo inicial se destruye.** `ajustarSaldo` sobrescribe
`bank_accounts.balance` con el saldo corriente en cada movimiento, así que la cifra que
se tecleó al abrir la cuenta deja de ser legible en ninguna parte. Sólo se puede deducir
por diferencia. Un dato de entrada no debería ser pisado por un dato calculado.

**La reconstrucción cuadra al céntimo**, y es lo que permitió recuperar los saldos
iniciales perdidos:

```
Banreservas     30.000,00 − 52.703,49 + 352.460,96 =   329.757,47
Scotiabank   1.112.000,00 − 948.079,30 + 1.015.727,93 = 1.179.648,63
```

Los dos coinciden con el saldo real de los bancos.

**Los dos "ajustes" del 29/08 están mal asentados.** El de Banreservas (352.460,96) va
**invertido**: debita la cuenta de agrupación y acredita el banco, cuando un depósito
debe debitar el banco. El de Scotiabank (1.015.727,93) lleva el debe y el haber contra
`1.1.01`: cuadra y no significa nada.

Efecto neto de todo lo anterior sobre el mayor:

| | |
|---|---:|
| El banco dice | **1.509.406,10** |
| El mayor dice | **0,00** |

**El contador de saldos está desincronizado por secuencia de despliegue.**
`bank_account_balances` quedó congelada el 28/08 a las 21:57:57.131801 —las cuatro filas
con la misma marca al microsegundo, que es la firma de `resincronizar_saldo_banco.sql`— y
el código viejo siguió escribiendo en `bank_accounts.balance`. Al desplegar el código
nuevo, los saldos saltarán hacia atrás a −22.703,49 y 163.920,70 si no se vuelve a
ejecutar ese guion **como último paso**, con el código viejo ya parado.

---

### 7ter.3 El balance de apertura nunca se cargó

Es la misma enfermedad, vista desde otro ángulo. Las cinco cuentas de activo fijo
(`1.2`, `1.2.01`, `1.2.01.01`, `.02` y `.03`) están **en cero**, y no existe módulo de
activo fijo ni cálculo de depreciación en ninguna parte del sistema.

En agosto se vendió un vehículo de la empresa por **352.460,96** —el depósito de
Banreservas del 29/08— y el vehículo no figuraba en los libros. Sin la factura de compra
que respalde su costo, la totalidad del precio de venta es ingreso.

Sumado a los 1.142.000,00 de bancos, el patrón es claro: **al arrancar el sistema no se
cargó ningún balance de apertura.** Corregirlo pieza a pieza no sirve; hay que levantarlo
completo —bancos, activo fijo, inventario, CxC y CxP— en un solo asiento contra
resultados acumulados, con los documentos de respaldo en el expediente.

> **Nota fiscal:** reconocer activo contra patrimonio sin respaldo documental es el
> perfil de un incremento patrimonial no justificado, y la carga de la prueba es del
> contribuyente. El estado de cuenta a la fecha de corte y los estados financieros del
> ejercicio anterior son la defensa. Esto lo debe validar quien firme el IR-2.

---

### 7ter.4 Hallazgos nuevos y reclasificados

| ID | Nivel | Descripción |
|---|---|---|
| **ARP-25** | 🔴 CRÍTICO | Un cheque en garantía se da por cobrado al vencer, mueve el banco y asienta sin que nadie confirme el pago. El movimiento nace `reconciled` |
| **JRN-23** | 🔴 CRÍTICO | El saldo inicial de una cuenta bancaria entra al módulo y nunca al mayor |
| **JRN-24** | 🟠 ALTO | El espejo de compatibilidad sobrescribe el saldo inicial tecleado y lo hace irrecuperable |
| **JRN-11** | 🔴 CRÍTICO *(sube de ALTO)* | El auto-bootstrap sólo saltaba con cero períodos, de modo que una empresa con los períodos de un mes y ninguno del siguiente quedaba bloqueada sin aviso. Confirmado en dos empresas |

---

### 7ter.5 Correcciones aplicadas

Cada una autorizada por separado. Todas con prueba de guarda que impide la regresión.

| Corrección | Ficheros | Migración / guion | Prueba |
|---|---|---|---|
| Cada cuenta bancaria declara su cuenta contable; el resolvedor sustituye la adivinanza por nombre | `bank.ts`, `bankRepository.ts`, `resolverCuentas.ts` (nuevo) | `0039`, `enlazar-cuentas-bancarias.sql` | `resolucionCuentas.vitest.ts` |
| Invariantes contables en la base: importes, debe-o-haber, saldos de CxC y CxP, compras duplicadas por NCF | — | `0040` | — |
| Validación por línea y rechazo del asiento con todas las líneas contra la misma cuenta | `accountingRepository.ts` | — | — |
| El cobro de cheques en garantía exige lista explícita y fecha real del estado de cuenta | `apService.ts`, `apRepository.ts`, ruta y pantalla de CxP | — | `cobroDeCheques.vitest.ts` |
| Ningún movimiento bancario nace conciliado | `apService.ts`, `bankRepository.ts` | — | `cobroDeCheques.vitest.ts`, `trazabilidadContable.vitest.ts` |
| `created_by` en los asientos, propagado a los once puntos que asientan | `accounting.ts` y 9 ficheros | `0041` | `trazabilidadContable.vitest.ts` |
| Los períodos se siembran al crear la empresa; `isPeriodOpen` deja de crearlos | `accountingRepository.ts`, 3 rutas de alta | `sembrar-periodos-existentes.sql` | `trazabilidadContable.vitest.ts` |
| Fecha local en el cálculo de vacaciones (en UTC−4 todo ISO se corría un día) | `payrollCalculationService.ts` | — | `vacaciones.vitest.ts` |

**Orden de despliegue.** Dos de los cuatro pasos rompen cosas si se saltan:

1. `sembrar-periodos-existentes.sql` — **antes** de subir el código, o las empresas sin
   período del mes en curso quedan bloqueadas.
2. `0040` y `0041`.
3. Desplegar.
4. `resincronizar_saldo_banco.sql` — **el último**, con el código viejo ya parado.

---

### 7ter.6 Lo que queda del lado de la contabilidad

No es trabajo de código. Requiere criterio contable y documentos.

- **Reclasificar los 1.000.782,79** de los cheques en garantía, de `1.1.02` a los dos
  bancos que corresponden.
- **Reversar el ajuste invertido** de Banreservas (352.460,96) y registrar los dos
  depósitos del 29/08 contra su origen real: el de Banreservas es la venta del vehículo;
  el de Scotiabank (1.015.727,93) sigue sin identificar.
- **Registrar la venta del vehículo** con su comprobante, para que entre en el 607 del
  mes en que ocurrió.
- **Levantar el balance de apertura completo** a la fecha de arranque del sistema.
- **Cotejar todos los cheques contra los físicos** y registrar los anulados, que hoy no
  existen en el sistema. El control del talonario exige que todo número esté justificado:
  usado, anulado o en blanco.
- **Decidir si se migra el resolvedor de cuentas** (7ter.1). Mientras no se haga, cada
  operación nueva sigue cayendo en las cuentas equivocadas y la reclasificación futura
  crece.

---

## 8. ANEXOS

| Anexo | Contenido | Hallazgos |
|---|---|---|
| [`anexo-1-aislamiento-multiempresa.md`](./anexo-1-aislamiento-multiempresa.md) | Fases 1-2 · Arquitectura multiempresa y aislamiento de datos | ISO-01 … ISO-12 |
| [`anexo-2-plan-cuentas-y-asientos.md`](./anexo-2-plan-cuentas-y-asientos.md) | Fases 3-4 · Plan de cuentas y motor de asientos | JRN-01 … JRN-22 |
| [`anexo-3-compras-inventario-costos.md`](./anexo-3-compras-inventario-costos.md) | Fases 5-6 · Compras, inventario y costo de ventas | INV-01 … INV-21 |
| [`anexo-4-ventas-cxc-cxp.md`](./anexo-4-ventas-cxc-cxp.md) | Fases 7-8-9 · Ventas, cuentas por cobrar y por pagar | ARP-01 … ARP-24 |
| [`anexo-5-bd-concurrencia-periodos.md`](./anexo-5-bd-concurrencia-periodos.md) | Fases 10-13 · Base de datos, concurrencia, períodos y trazabilidad | DB-01 … DB-21 |
| [`verificacion-bd.sql`](./verificacion-bd.sql) | Fase 14 · 45 consultas de solo lectura para cuantificar el daño existente | — |
| [`abrir-periodos-2026.sql`](./abrir-periodos-2026.sql) | Abre los períodos ago–dic 2026 de la empresa que quedó bloqueada. **Escribe** | JRN-11 |

**Guiones de la segunda verificación (30/08).** Los marcados **Escribe** modifican datos:

| Guion | Contenido | Hallazgos |
|---|---|---|
| [`residuo-una-sola-consulta.sql`](./residuo-una-sola-consulta.sql) | Solo lectura. Descompone el descuadre entre el contador de saldos y el libro de banco en sus tres causas posibles. Una sola sentencia, porque el editor de Supabase sólo muestra el resultado de la última | JRN-23, JRN-24 |
| [`cierre-contable-pendientes.sql`](./cierre-contable-pendientes.sql) | Solo lectura. Cifras exactas para los asientos de reclasificación, cotejo de cheques contra los físicos y prueba de mayor contra auxiliar de CxC | ARP-25, JRN-01 |
| [`apertura-bancos.sql`](./apertura-bancos.sql) | Solo lectura. Comprobaciones previas al asiento de apertura de bancos | JRN-23 |
| [`enlazar-cuentas-bancarias.sql`](./enlazar-cuentas-bancarias.sql) | **Escribe.** Enlaza cada cuenta bancaria con su cuenta contable (requiere la migración 0039) | JRN-04, JRN-12 |
| [`corregir-pagos-pendientes.sql`](./corregir-pagos-pendientes.sql) | **Escribe.** Corrige las cuentas de los pagos de cheques en garantía todavía sin aplicar | ARP-02 |
| [`corregir-cheque-116.sql`](./corregir-cheque-116.sql) | **Escribe.** Corrige el cheque emitido contra el banco equivocado por la preselección del formulario | ARP-25 |
| [`sembrar-periodos-existentes.sql`](./sembrar-periodos-existentes.sql) | **Escribe.** Siembra los períodos que faltan a las empresas ya existentes. Ejecutar **antes** de desplegar | JRN-11 |

Cada anexo abre con un resumen de **cómo funciona realmente** el módulo (arquitectura observada, no supuesta) y cierra con su propia sección de "no verificado".

---

*Secciones 1 a 7: auditoría de solo lectura, sin correcciones aplicadas. Sección 7 ter: verificación contra datos reales de producción y correcciones implementadas, cada una autorizada por separado. Todo cambio no listado en 7ter.5 sigue siendo una propuesta que debe analizarse y aprobarse individualmente antes de implementarse.*
