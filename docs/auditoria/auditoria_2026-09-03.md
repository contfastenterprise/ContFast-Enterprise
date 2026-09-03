# Auditoría Completa del Sistema — ContFast Enterprise
**Fecha:** 3 de septiembre de 2026
**Alcance:** 486 archivos TypeScript/TSX, 178 rutas API, 19 repositorios, 14 tablas de schema (Drizzle/Postgres)
**Metodología:** Análisis estático de solo lectura (código fuente), ningún archivo fue modificado. 7 auditores especializados revisaron en paralelo: seguridad, multiempresa, base de datos, backend/lógica de negocio, contabilidad/inventario, UI/UX/rendimiento, calidad de código/trazabilidad.

---

## RESUMEN DEL ESTADO DEL SISTEMA

| Área | Calificación | Justificación breve |
|---|---|---|
| Seguridad | **6/10** | Bases sólidas (bcrypt, rotación de JWT con detección de reuse, cookies HttpOnly/Secure, rate limiting fail-closed, cifrado AES-256-GCM de credenciales, cabeceras de identidad firmadas), pero dos huecos reales de autorización (P0-02, P0-04) sin corregir. |
| Multiempresa | **5/10** | El aislamiento de datos operativos del día a día (facturación, caja, banco, nómina, CxC/CxP) es sólido y con historial extenso de auditorías previas ya corregidas. Pero la capa de administración de plataforma tiene una fuga estructural sin resolver: el rol "sistemas" da control total cross-empresa. |
| Base de datos | **8/10** | El área más madura del sistema. FKs, índices compuestos y transacciones bien diseñadas, con comentarios que documentan incidentes reales ya corregidos. Solo defectos menores (función de limpieza rota, deriva de migraciones, una FK faltante). |
| Backend / lógica de negocio | **6/10** | Arquitectura del flujo de facturación bien pensada (reserva de NCF, distinción rechazo/desconocido), pero esa disciplina se rompe en el worker de reintentos, con riesgo real de duplicar un envío fiscal. |
| Contabilidad | **4/10** | El flujo de mayor volumen del sistema (asiento de venta) postea contra cuentas de agrupación y una cuenta con signo invertido — un problema sistemático, no un caso aislado. Sumado a eliminaciones físicas sin control de período. |
| Inventario | **6/10** | Buen diseño de kardex inmutable con protección de negativos en dos capas, pero con una condición de carrera real en la aprobación de conduces y sin método de costeo uniforme. |
| UI | **6/10** | Consistente en la mayoría de los flujos, pero con patrones duplicados (dos motores de tabla, tres sidebars) y `window.confirm()` nativo en operaciones fiscalmente sensibles. |
| UX | **6/10** | Buenos estados de carga/vacío en las páginas principales, pero formularios sin validación por campo y formularios extremadamente largos en las pantallas de mayor uso (factura, compra). |
| Rendimiento | **6/10** | Buen aislamiento de librerías pesadas del cliente y paginación server-side en los módulos principales, pero cero memoización en las páginas más grandes y al menos un endpoint (transacciones bancarias) sin paginar en servidor. |
| Mantenibilidad | **5/10** | Tipado débil (`any`) sistemático justo en la capa contable/financiera, archivos de hasta 5,225 líneas, y manejo de errores que traga silenciosamente fallos — incluidos los que protegen la propia auditoría. |

**Lectura general:** este es un sistema con una base técnica considerablemente más madura que la de un ERP típico en esta etapa — hay evidencia constante de auditorías previas reales, bien documentadas en el propio código, que corrigieron bugs de producción concretos (carreras de NCF, fugas multiempresa, ITBIS mal calculado, asientos descuadrados). Los problemas que quedan no son de falta de cuidado general, sino de que esa disciplina no se propagó a **todos** los lugares que repiten el mismo patrón: la corrección de "sistemas ⊂ substring" se aplicó en un archivo y no en cinco; el resolvedor de cuentas contables correcto existe pero solo lo usan dos rutas de las seis que deberían.

---

## LISTA MAESTRA DE PRIORIDADES

| # | Prioridad | Área | Problema | Impacto | Riesgo |
|---|---|---|---|---|---|
| 1 | 🔴 P0 | Multiempresa | El rol "sistemas" (estándar en cada empresa) permite listar, suplantar y modificar cualquier otra empresa | Cualquier empresa cliente puede leer/controlar los datos de todas las demás | Crítico |
| 2 | 🔴 P0 | Seguridad | Autorización por `role.includes('admin'/'sistema')` en vez de comparación exacta, en 6+ sitios | Un rol como "Admin de Almacén" obtiene privilegios no otorgados; permite borrar compras sin permiso real | Crítico |
| 3 | 🔴 P0 | Multiempresa | `GET /api/v1/admin/subscriptions` expone nombre, RNC, plan y facturación de TODAS las empresas a un rol de negocio común | Fuga masiva de datos comerciales/fiscales entre empresas | Crítico |
| 4 | 🔴 P0 | Seguridad | API key real (Groq) en `packages/ai-core/.env`, sin `.gitignore` en todo el repositorio | Exposición de credencial viva si el repo se sincroniza tal cual | Crítico |
| 5 | 🔴 P0 | Contabilidad | El asiento automático de venta/compra postea contra cuentas de agrupación y crea una cuenta de ITBIS con signo invertido | Balance de comprobación, balance general y estado de resultados distorsionados en el flujo de mayor volumen | Crítico |
| 6 | 🔴 P0 | Backend | El worker de reintento a la DGII confunde timeout/error de red con "rechazado" | Riesgo de reenviar (duplicar) un comprobante fiscal ya aceptado | Crítico |
| 7 | 🔴 P0 | Contabilidad/Inventario/Auditoría | Editar/eliminar una compra borra físicamente asientos contables, kardex y CxP, sin período cerrado ni rastro de auditoría | Pérdida irreversible de trazabilidad contable y fiscal | Crítico |
| 8 | 🟠 P1 | Backend | El worker BullMQ no reenvía `submissionId`, anulando la protección de actualizar el intento correcto | Un reintento puede sobrescribir el estado de otro intento de envío DGII | Alto |
| 9 | 🟠 P1 | Inventario | Condición de carrera en `DeliveryRepository.approve` (sin bloqueo de fila) | Doble clic/reintento puede duplicar la deducción de inventario | Alto |
| 10 | 🟠 P1 | Backend/Inventario | `transferStock` no usa bloqueo de fila (reintroduce la clase de bug ya corregida como INV-09) | Transferencias concurrentes pueden perder una actualización de stock | Alto |
| 11 | 🟠 P1 | Contabilidad | Sin protección de idempotencia (unique constraint / idempotency key) en asientos y movimientos financieros | Reintento de red o doble clic duplica un asiento balanceado, sin que ninguna validación lo detecte | Alto |
| 12 | 🟠 P1 | Contabilidad | No se registra el Costo de Venta (COGS) en el asiento de facturación | El estado de resultados formal sobreestima la utilidad neta de forma sistemática | Alto |
| 13 | 🟠 P1 | Auditoría | Pagos a proveedores y cobros a clientes sin autor identificable (`ap_payments`/`customer_receipts` sin `createdBy`) | Imposible determinar quién registró un pago/cobro cuestionado | Alto |
| 14 | 🟠 P1 | Auditoría | Cambio de modo PRUEBA/PRODUCCIÓN y credenciales DGII no se registra en `audit_logs` | Sin forma de reconstruir cuándo/quién cambió la configuración fiscal más sensible | Alto |
| 15 | 🟠 P1 | Seguridad | `GET /api/v1/company/settings` sin verificación de permiso, expone credenciales cifradas de mSeller a cualquier usuario | Cualquier usuario autenticado (incluido un cajero) puede leer el email/blob cifrado de mSeller | Alto |
| 16 | 🟠 P1 | Multiempresa | `AdminRepository.updateUser`/`toggleUserStatus`: el `UPDATE` final no repite el filtro `companyId` | Falta defensa en profundidad (no explotable hoy de forma demostrada) | Medio-Alto |
| 17 | 🟠 P1 | Multiempresa | `getCustomerStats` no filtra por `modo` en 2 consultas | Mezcla datos de PRUEBA con PRODUCCIÓN en reportes ejecutivos (ranking de clientes) | Alto |
| 18 | 🟠 P1 | Base de datos | `clear-sandbox` no borra tablas hijas antes que las tablas padre | La función "limpiar entorno de pruebas" falla siempre que existan datos reales | Alto |
| 19 | 🟠 P1 | Base de datos | Deriva entre migraciones SQL (57 archivos) y metadata de drizzle-kit (solo hasta la 30), con números duplicados | Generación automática de futuras migraciones puede producir un diff incorrecto | Alto |
| 20 | 🟠 P1 | Base de datos | FK ausente en `bank_accounts.chart_account_id` → `chart_of_accounts.id` | Permite guardar una cuenta contable inexistente o de otra empresa en una cuenta bancaria | Medio-Alto |
| 21 | 🟠 P1 | Seguridad | `error.message` crudo devuelto en rutas públicas (`setup/confirm`, `setup/recover`) | Filtra detalles internos de BD a un visitante no autenticado | Medio-Alto |
| 22 | 🟠 P1 | Seguridad | `/api/v1/setup/recover` queda bloqueada por el requisito de sesión que su propósito (recuperación de emergencia) exige evitar | El mecanismo de "me quedé sin acceso" no funciona como está documentado | Medio |
| 23 | 🟠 P1 | Backend | El total de factura borrador (`draft`) reimplementa el cálculo en vez de reutilizar `InvoiceCalculator` | Recurrencia del problema histórico "Totales/MontoExento" — el borrador puede no coincidir con la emisión real | Alto |
| 24 | 🟠 P1 | Calidad de código | `tx: any` sistemático en los repositorios contables/financieros (172 ocurrencias totales de `any` en servicios/repos/middleware) | Elimina la principal red de seguridad de tipos justo en la capa que arma asientos y pagos | Alto |
| 25 | 🟡 P2 | Seguridad | `POST /api/storefront/auth/register` sin rate limiting | Permite creación masiva de cuentas o enumeración de correos | Medio |
| 26 | 🟡 P2 | Seguridad | Validación de entrada inconsistente (zod vs. checks manuales) en `categories`/`warehouses` | Riesgo bajo (Drizzle parametriza), pero datos inconsistentes pueden llegar a BD | Bajo-Medio |
| 27 | 🟡 P2 | Base de datos | `employees.employeeCode`/`cedula` sin restricción única (solo índice) | Puede duplicarse un código o cédula de empleado dentro de la misma empresa | Medio |
| 28 | 🟡 P2 | Base de datos | N+1 de lectura en aprobación de conduce (`deliveryRepository.ts`) | Bajo impacto práctico, escala mal con documentos grandes | Bajo |
| 29 | 🟡 P2 | Backend | Método legacy `MSellerClient.issueInvoice` devuelve éxito simulado (mock) y sigue vivo en el código | Si se reconecta por error, generaría facturas "aceptadas" falsas | Medio (latente) |
| 30 | 🟡 P2 | Backend | Fallos post-transacción (PDF, email, conduce automático) solo se registran en log | Desfase silencioso entre factura emitida e inventario real | Medio |
| 31 | 🟡 P2 | Contabilidad | `createAccountsPayable` nunca retorna el registro creado (código muerto hoy, trampa a futuro) | Bajo hoy, riesgo si se reutiliza esperando el id | Bajo |
| 32 | 🟡 P2 | Auditoría | Reapertura de período contable sobrescribe (`null`) quién/cuándo lo había cerrado antes | Se pierde el historial de aperturas/cierres intermedios | Medio |
| 33 | 🟡 P2 | UI | `window.confirm()` nativo en 10 acciones críticas (cerrar período, aplicar cheque, anular conduce) en vez del diálogo propio del sistema | Inconsistencia visual en operaciones fiscalmente sensibles | Medio |
| 34 | 🟡 P2 | UX | Formularios del dashboard sin validación por campo (react-hook-form+zod solo se usa en login/registro) | Usuario recibe un toast genérico sin saber qué campo falló | Medio |
| 35 | 🟡 P2 | UX | Formularios de factura/compra/producto extremadamente largos (2,190–2,863 líneas), sin pasos | Alta carga cognitiva en el flujo más frecuente del sistema | Medio |
| 36 | 🟡 P2 | UI | Tablas de CxC y CxP implementan el mismo patrón de forma distinta (una con `@tanstack/react-table`, otra manual) | Mayor costo de mantenimiento, riesgo de divergencia de comportamiento | Bajo-Medio |
| 37 | 🟡 P2 | UX | Error de carga de datos no se distingue de "sin resultados" (solo toast efímero) | Usuario puede creer que no tiene registros cuando hubo un fallo | Medio |
| 38 | 🟡 P2 | Rendimiento | Cero `memo`/`useMemo`/`useCallback` en las páginas más grandes (facturas, compras, productos) | Cualquier cambio de estado re-renderiza árboles de 2,000+ líneas | Medio |
| 39 | 🟡 P2 | Rendimiento | `GET /api/v1/bank/transactions` sin límite/paginación en servidor (filtra por fecha en memoria) | Cuenta con años de movimientos puede traer/renderizar miles de filas de golpe | Medio |
| 40 | 🟡 P2 | Rendimiento | Asientos contables truncados a 100 fijo, sin aviso ni paginación en la UI | Asientos "desaparecen" silenciosamente si hay más de 100 en el rango | Medio |
| 41 | 🟡 P2 | Calidad de código | Archivos de 1,000–5,225 líneas mezclando responsabilidades (`documentTemplates.ts`, páginas del dashboard) | Dificulta mantenimiento y revisión de código | Medio |
| 42 | 🟡 P2 | Calidad de código | Dos motores de generación de PDF en paralelo (pdfkit para nómina, Puppeteer para el resto) | Duplica esfuerzo de mantenimiento, riesgo de inconsistencia visual | Bajo-Medio |
| 43 | 🟡 P2 | Calidad de código | 122 bloques `catch` que solo registran en consola sin ninguna acción, incluidos los que protegen la propia auditoría | Fallos de auditoría/negocio invisibles en producción serverless | Medio |
| 44 | 🟢 P3 | Seguridad | `x-forwarded-for` usado sin validación adicional para rate limiting/auditoría de IP | Bajo si Vercel siempre la reescribe (typical); a confirmar | Bajo |
| 45 | 🟢 P3 | UX | Paginación reinventada manualmente en 11 páginas en vez del componente compartido | Inconsistencia menor | Bajo |
| 46 | 🟢 P3 | Calidad de código | Dos implementaciones de sidebar no usadas (1,127 líneas muertas) | Solo mantenibilidad/confusión, sin impacto en producción | Bajo |
| 47 | 🟢 P3 | Rendimiento | `next/image` no se usa en ningún lado (avatares/logo sin optimizar) | Impacto bajo, mayormente plantillas de impresión | Bajo |
| 48 | 🟢 P3 | Calidad de código | Estado `'voided'` de pagos declarado en el tipo pero nunca implementado | Puede confundir sobre cuál es el mecanismo real de anulación | Bajo |
| 49 | 🟢 P3 | Calidad de código | `pdf-lib` sin ningún uso real; `@radix-ui/react-slot` vs. paquete unificado `radix-ui` duplicado | Limpieza de dependencias | Bajo |

---

## DETALLE DE CADA PROBLEMA

### 🔴 P0

#### P0-01 — El rol "sistemas" permite el control total de cualquier otra empresa
**Área afectada:** Multiempresa
**Estado actual encontrado:** `sistemas` es uno de los 6 roles estándar sembrados automáticamente en **cada** empresa nueva (`src/utils/defaultRoles.ts`), descrito como "Ingeniero de sistemas - Acceso Total técnico" — no es un rol reservado a ContFast como operador de plataforma.
**Evidencia:**
- `src/app/api/v1/admin/companies/route.ts:20-25` — `GET` lista **todas** las empresas (nombre, RNC, email, plan, estado) con el único control `session.role !== 'sistemas'`.
- `src/app/api/v1/auth/switch-company/route.ts:19-70` — acepta cualquier `newCompanyId` sin validar afiliación del usuario; emite una sesión JWT completa contra esa empresa con rol `sistemas`.
- `src/app/api/v1/admin/companies/[id]/route.ts:16-101` — `PUT`/`DELETE` de cualquier empresa por id de URL, sin comparar con `session.companyId`.
- `src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts:41-60` — purga en bloque los datos de sandbox de cualquier empresa.
**Problema:** Ninguno de estos 4 endpoints comprueba que la empresa objetivo sea la propia del usuario — solo comprueban el nombre del rol.
**Posible consecuencia:** El "ingeniero de sistemas" de una empresa cliente cualquiera (rol estándar, no excepcional) —malicioso, comprometido, o por error— puede leer, modificar o purgar datos de facturación, banca, nómina y contabilidad de **cualquier otra empresa** de la plataforma.
**Impacto:** Datos, Multiempresa, Seguridad.
**Riesgo:** Crítico.
**Recomendación técnica:** Separar el rol de plataforma ("staff ContFast") del rol de tenant, con una marca independiente de `companyId` (p.ej. tabla `platform_operators`). Mitigación urgente inmediata: en los 4 endpoints citados, exigir `id`/`newCompanyId === session.companyId` salvo que el usuario tenga esa marca de staff.
**Complejidad estimada:** Alta (rediseño de rol) / Media (mitigación inmediata).
**Dependencias:** Ninguna técnica; requiere decisión de producto sobre cómo se administra la plataforma hoy.
**Qué debe resolverse antes:** Nada — es la corrección de mayor prioridad de todo el informe.
**Qué podría romperse si se corrige incorrectamente:** Si la mitigación inmediata bloquea por error el uso legítimo de `sistemas` dentro de su propia empresa, se rompería la administración normal de esa empresa — probar explícitamente que un `sistemas` de la Empresa A sigue operando con normalidad en la Empresa A tras el fix.

---

#### P0-02 — Bypass de autorización por coincidencia de substring en nombres de rol
**Área afectada:** Seguridad / Autorización
**Estado actual encontrado:** `src/middleware/permissions.ts` ya corrigió este patrón (documentado como "Auditoria F0-05": comparación exacta en `hasPermission()`/`isAdminOrSistemas()`), pero el patrón vulnerable original sigue vivo en otros archivos.
**Evidencia:**
- `src/proxy.ts:116-117` — `userRole.includes('sistema')`/`.includes('admin')` da acceso total inmediato a todas las rutas mapeadas (contabilidad, banco, nómina, reportes, admin).
- `src/services/auth/rbacService.ts:31,36` — mismo patrón al generar los permisos que se firman en el JWT.
- `src/app/api/v1/expenses/[id]/route.ts:216` — único guardia del `DELETE` de compras: `session.role.toLowerCase().includes('sistema')`. El `PUT` del mismo archivo (línea 417) sí usa la comparación exacta correcta, confirmando que es un descuido, no un diseño.
- También en `src/repositories/adminRepository.ts:166`, `src/services/invoice/invoiceDbBooker.ts:37`, `src/utils/rbacHelpers.ts:107-108`.
**Problema:** Un rol nombrado de buena fe como "Soporte de Sistemas" o "Administrador de Almacén" obtiene, sin que nadie se lo otorgue explícitamente, acceso total vía `proxy.ts` y permiso para borrar compras y su rastro contable completo vía `expenses/[id]`.
**Impacto:** Seguridad, Datos, Contabilidad.
**Riesgo:** Crítico.
**Recomendación técnica:** Reemplazar los 6+ sitios listados por `isAdminOrSistemas()` de `middleware/permissions.ts`, ya corregida y reutilizable. Priorizar `proxy.ts` (raíz de la superficie de ataque) y `expenses/[id]/route.ts` (único guardia, sin capa adicional).
**Complejidad estimada:** Baja — es sustituir una comparación por una función ya existente en 6 sitios.
**Dependencias:** Ninguna.
**Qué debe resolverse antes:** Nada.
**Qué podría romperse si se corrige incorrectamente:** Si algún rol legítimo dependía sin saberlo de la coincidencia parcial (p. ej. un rol llamado exactamente distinto a "sistemas" pero que alguien esperaba que calzara), perdería acceso — revisar los roles reales configurados en producción antes de desplegar.

---

#### P0-03 — `GET /api/v1/admin/subscriptions` expone la facturación de todas las empresas
**Área afectada:** Multiempresa
**Estado actual encontrado:** El endpoint exige el rol de negocio ordinario `administracion` (el mismo que recibe cualquiera que se auto-registra), no `sistemas`.
**Evidencia:** `src/app/api/v1/admin/subscriptions/route.ts:34-57` — `SELECT` con `innerJoin(companies)` y `innerJoin(plans)`, `orderBy(subscriptions.createdAt)`, sin ningún `where` por `companyId`.
**Problema:** Devuelve nombre comercial, RNC y plan/estado de suscripción de todas las empresas de la plataforma a cualquier administrador de cualquier empresa cliente.
**Impacto:** Datos, Multiempresa.
**Riesgo:** Crítico.
**Recomendación técnica:** Añadir `where(eq(subscriptions.companyId, session.companyId))` salvo marca de staff de plataforma (ver P0-01).
**Complejidad estimada:** Baja.
**Dependencias:** Se resuelve junto con P0-01 (misma noción de "staff de plataforma" si se implementa ahí).
**Qué debe resolverse antes:** Nada, puede corregirse de forma independiente incluso antes de resolver P0-01 de fondo.
**Qué podría romperse si se corrige incorrectamente:** Ninguna función legítima depende de ver suscripciones ajenas — bajo riesgo de romper algo.

---

#### P0-04 — Secreto real (API key) en el repositorio, sin `.gitignore`
**Área afectada:** Seguridad / Manejo de secretos
**Estado actual encontrado:** `packages/ai-core/.env` contiene un valor con apariencia de clave viva de Groq (su archivo hermano `.env.example` sí usa placeholder). No existe ningún `.gitignore` en todo el repositorio.
**Evidencia:** `packages/ai-core/.env:1` (ubicación reportada, valor no reproducido).
**Problema:** Sin `.gitignore`, no hay barrera que impida que este archivo (y cualquier otro `.env` real) termine versionado y expuesto en el remoto.
**Impacto:** Seguridad.
**Riesgo:** Crítico.
**Recomendación técnica:** Rotar la clave inmediatamente; eliminar el archivo del árbol de trabajo y, si ya fue comiteado, del historial de git; crear un `.gitignore` raíz que excluya `.env`/`.env.local`/`*.env` (excepto `.env.example`); auditar si hay otros `.env` reales en subpaquetes.
**Complejidad estimada:** Baja (rotación + gitignore) / Media (limpieza de historial git si ya se comiteó).
**Dependencias:** Ninguna.
**Qué debe resolverse antes:** Nada — es de las acciones más rápidas de aplicar de todo el informe.
**Qué podría romperse si se corrige incorrectamente:** Si algún proceso de build/CI dependía de leer ese `.env` real (en vez de variables de entorno inyectadas por la plataforma), habría que migrar esa configuración — verificar antes de eliminarlo.

---

#### P0-05 — El asiento automático de venta/compra postea contra cuentas de agrupación y una cuenta con signo invertido
**Área afectada:** Contabilidad
**Estado actual encontrado:** Existe `resolverCuentas.ts`, diseñado explícitamente para evitar esto (cita los incidentes JRN-01/JRN-02), pero solo lo usan 2 de 6 rutas que deberían.
**Evidencia:**
- `src/services/invoice/invoiceDbBooker.ts:526-529,769-795` — busca cuentas por código fijo `1.1.02`/`1.1.01` (ambas son cuentas de **agrupación**, `isTransactional:false`), y usa `2.1.03` para "ITBIS por Pagar", código que no existe en el catálogo (el real es `2.1.02.01`). Al no encontrarla, la **crea** sin `nature`/`level`, heredando `nature:'debit'` (siendo pasivo, debería ser `'credit'`) y `level:1`.
- `src/app/api/v1/expenses/route.ts:12-32,362-368`, `expenses/[id]/route.ts:12-32,1040-1048`, `src/services/expenseService.ts:11-31` — misma copia del patrón, incluyendo `2.1.01` (agrupación de CxP) como cuenta de crédito en compras.
**Problema:** `createJournalEntry` no valida `isTransactional` más allá de la FK, así que estos inserts pasan sin objeción.
**Posible consecuencia:** Cada venta y compra —el flujo de mayor volumen del sistema— distorsiona el balance de comprobación, duplica saldo padre/hijo, y la cuenta de ITBIS con naturaleza invertida corrompe el balance general y el estado de resultados.
**Impacto:** Contabilidad, Datos.
**Riesgo:** Crítico.
**Recomendación técnica:** Migrar `InvoiceDbBooker`, `expenses/route.ts`, `expenses/[id]/route.ts` y `expenseService.ts` a `resolverCuentaPorMapeo`/`accountingMappings` (ya existen las claves `sales_revenue`, `accounts_receivable`, `cash`, `itbis_sales`, `cost_of_goods_sold`, `supplier_payable`); eliminar las 4 copias locales de `getOrCreateAccount`. Añadir, como red de seguridad, validación de `isTransactional`/existencia dentro del propio `createJournalEntry`.
**Complejidad estimada:** Media-Alta — toca el flujo transaccional más crítico del sistema, requiere pruebas exhaustivas antes de desplegar.
**Dependencias:** Debe probarse junto con P0-07 y P1-11/P1-12 (todos tocan el mismo módulo de asientos).
**Qué debe resolverse antes:** Auditar y corregir el catálogo de cuentas ya sembrado en empresas existentes (las cuentas mal creadas ya insertadas deben identificarse y corregirse contablemente, no solo prevenir nuevas).
**Qué podría romperse si se corrige incorrectamente:** Reportes financieros históricos que ya asumen la estructura de cuentas actual (aunque incorrecta) podrían mostrar una discontinuidad — coordinar con contabilidad/el usuario antes de migrar catálogos existentes.

---

#### P0-06 — El worker de reintento a la DGII confunde error de red con rechazo definitivo
**Área afectada:** Backend / Colas
**Estado actual encontrado:** `invoiceSubmissionService.submitToDgii` (camino síncrono) distingue correctamente, vía `leerDesenlace`, entre rechazo real y desenlace desconocido (timeout, corte de red). `src/infrastructure/jobRunners.ts` (`processDgiiSubmissionJob`, usado por reenvío y el camino diferido) **no usa `leerDesenlace`**.
**Evidencia:** `src/infrastructure/jobRunners.ts:285-309` — el `else` de `result.success === false` marca la factura como `'rejected'` sin distinguir timeout/error de red de un rechazo real de la DGII.
**Problema:** `POST /api/v1/ecf/[id]/resubmit` permite reenviar cualquier factura en estado `rejected` — un usuario que ve "rechazada" por un simple timeout pulsa "reenviar" y el sistema presenta el mismo NCF por segunda vez a la DGII.
**Posible consecuencia:** Comprobante fiscal duplicado ante la DGII — exactamente el escenario que el resto del código se esfuerza en evitar.
**Impacto:** Contabilidad, Datos, cumplimiento fiscal.
**Riesgo:** Crítico.
**Recomendación técnica:** En `processDgiiSubmissionJob`, sustituir el `else` por la misma lógica de `leerDesenlace`: solo marcar `rejected` cuando el desenlace sea `'rechazo'`; en caso `'desconocido'`, dejar la factura en `submitted` (para que `sincronizarPendientes` la resuelva), sin relanzar el job.
**Complejidad estimada:** Baja-Media — reutilizar una función ya existente y probada en otro camino del mismo flujo.
**Dependencias:** Ninguna.
**Qué debe resolverse antes:** Nada.
**Qué podría romperse si se corrige incorrectamente:** Si `leerDesenlace` no cubre algún caso de error específico del worker (distinto al camino síncrono), podría dejar facturas indefinidamente en `submitted` sin resolución — probar con los mismos casos de error que ya cubren los tests de `desenlaceEnvio.ts`.

---

#### P0-07 — Eliminar/editar una compra borra físicamente asientos, kardex y CxP sin período cerrado ni auditoría
**Área afectada:** Contabilidad / Inventario / Auditoría y trazabilidad
**Estado actual encontrado:** `DELETE`/`PUT /api/v1/expenses/[id]` borran físicamente, dentro de una transacción: `journalEntryLines`/`journalEntries`, `apPayments`/`checks`/`accountsPayable`, `inventoryMovements`, y las líneas/cabecera del gasto — sin llamar nunca a `isPeriodOpen` y sin escribir en `audit_logs`.
**Evidencia:** `src/app/api/v1/expenses/[id]/route.ts` — `DELETE` líneas 279-281 (borra `inventoryMovements`) y 357-373 (borra el asiento) sin chequeo de período ni de auditoría; el `PUT` (líneas 633-651) repite el patrón antes de re-crear el asiento.
**Problema:** Contradice el propio diseño del schema: `journal_entries` tiene columna `deletedAt` (soft-delete) pensada exactamente para este caso, con un comentario que narra un incidente real de julio 2026 (asiento duplicado de RD$545,724.30 sin autor rastreable) — pero esta ruta la ignora y hace `tx.delete(...)` físico.
**Posible consecuencia:** Un usuario con rol "Sistemas" puede eliminar por completo una compra —asiento contable y kardex incluidos— de un mes **ya cerrado y reportado a la DGII**, sin bloqueo ni rastro de qué se borró ni quién lo hizo.
**Impacto:** Contabilidad, Inventario, Auditoría, cumplimiento fiscal.
**Riesgo:** Crítico.
**Recomendación técnica:** (1) Bloquear `DELETE`/`PUT` cuando la fecha del asiento cae en un período cerrado, igual que ya hace la creación. (2) Sustituir "borrar y re-crear" por un asiento de reversión explícito que preserve el original. (3) Escribir en `audit_logs` con el estado previo completo antes de cualquier eliminación, siguiendo el patrón ya usado correctamente en `HRRepository.deleteSettlement`.
**Complejidad estimada:** Media.
**Dependencias:** Comparte módulo con P0-05; conviene resolverlos en el mismo ciclo de trabajo sobre `expenses`.
**Qué debe resolverse antes:** Nada técnico; sí conviene decidir con el usuario si las compras ya eliminadas de esta forma necesitan alguna reconstrucción contable.
**Qué podría romperse si se corrige incorrectamente:** Si el bloqueo de período se implementa de forma demasiado amplia, podría impedir correcciones legítimas dentro del período abierto actual — probar que solo bloquea fechas en períodos ya cerrados.

---

### 🟠 P1

#### P1-08 — El worker BullMQ no reenvía `submissionId`
**Área:** Backend / Colas · **Evidencia:** `src/infrastructure/worker.ts:18-25` destructura solo `{companyId, invoiceId}` de `job.data`, ignorando `submissionId` (que sí se encola correctamente en `invoiceDbBooker.ts`, `submit/route.ts`, `resubmit/route.ts`). Compárese con `queue.ts:65` (`triggerFallback`), que sí lo pasa.
**Impacto:** Si hay dos intentos de envío en vuelo para la misma factura (p.ej. un `resubmit` disparado mientras el job anterior sigue en backoff), el worker puede actualizar el intento equivocado en `dgii_submissions`.
**Recomendación:** Pasar `submissionId: job.data.submissionId` en el processor de `worker.ts`.
**Complejidad:** Baja. **Dependencias:** Ninguna.

#### P1-09 — Condición de carrera en la aprobación de conduces
**Área:** Inventario · **Evidencia:** `src/repositories/deliveryRepository.ts:217-326` — `getById` fuera de la transacción y sin `FOR UPDATE`; el `UPDATE` final que marca `approved` es incondicional (sin `AND status='draft'`).
**Impacto:** Doble clic o reintento puede aprobar dos veces el mismo conduce, deduciendo inventario por duplicado.
**Recomendación:** Bloquear la fila con `FOR UPDATE` dentro de la transacción, o condicionar el `UPDATE` final por estado (como ya hace `ApRepository.marcarChequeCobrado`).
**Complejidad:** Baja-Media.

#### P1-10 — `transferStock` sin bloqueo de fila (reintroduce la clase de bug INV-09)
**Área:** Backend / Inventario · **Evidencia:** `src/services/inventoryService.ts:356-422` — lectura-cálculo-escritura sin `.for('update')`, a diferencia de `addStock`/`deductStock` (ya corregidos con este patrón).
**Impacto:** Transferencias concurrentes del mismo producto/almacén pueden perder una actualización de stock.
**Recomendación:** Añadir `.for('update')` a ambas lecturas (origen y destino), o reutilizar `addStock`/`deductStock` en vez de reimplementar el patrón.
**Complejidad:** Baja.

#### P1-11 — Sin idempotencia en asientos/movimientos financieros
**Área:** Contabilidad · **Evidencia:** `src/db/schema/accounting.ts:31-61,310-339` — sin `uniqueIndex` en `journalEntries.reference` ni `financialMovements.documentId`; sin idempotency-key en las rutas POST críticas.
**Impacto:** Un reintento de red o doble clic genera un asiento/movimiento nuevo y balanceado (ninguna validación de cuadre lo detecta), consumiendo un NCF adicional y duplicando saldos de cliente/proveedor.
**Recomendación:** `uniqueIndex(companyId, modo, movementType, documentId)` como mínimo en `financial_movements`; idempotency-key en rutas POST críticas.
**Complejidad:** Media.

#### P1-12 — No se registra el Costo de Venta (COGS) en el asiento de facturación
**Área:** Contabilidad · **Evidencia:** `InvoiceDbBooker` solo asienta ingreso, ITBIS y CxC/Caja; nunca debita costo/acredita inventario al vender. El COGS del dashboard de BI es puramente analítico, fuera del libro mayor.
**Impacto:** El estado de resultados formal omite sistemáticamente el costo de venta y sobreestima la utilidad neta reportable.
**Recomendación:** Generar automáticamente la partida de costo de venta en el mismo asiento de facturación.
**Complejidad:** Media (depende también de definir un método de costeo uniforme, ver P2-relacionado en el informe de inventario).

#### P1-13 — Pagos y cobros sin autor identificable
**Área:** Auditoría · **Evidencia:** `ap_payments` y `customer_receipts` (`src/db/schema/accounting.ts:102-119,211-229`) no tienen columna `createdBy`; tampoco hay escritura a `audit_logs` en `apRepository.ts`/`arRepository.ts`.
**Impacto:** Ante un pago/cobro cuestionado, no hay forma de determinar qué usuario lo registró.
**Recomendación:** Agregar `createdBy`/`voidedBy` a ambas tablas y `audit_logs` para creación/anulación de pagos.
**Complejidad:** Media (cambio de schema + migración).

#### P1-14 — Cambios de modo DGII y credenciales sin auditar
**Área:** Auditoría · **Evidencia:** `src/app/api/v1/admin/settings/route.ts` (319 líneas) cambia `dgiiEnv` y credenciales de mSeller/DGII con controles de autorización correctos (ISO-15/16) pero **ningún** `insert` en `audit_logs`.
**Impacto:** Sin forma de reconstruir cuándo la empresa pasó a producción ni quién cambió las credenciales de envío a la DGII — relevante ante cualquier discrepancia fiscal.
**Recomendación:** `insert` en `audit_logs` dentro de la transacción del `PATCH`, con `oldValues`/`newValues` (sin loguear claves en texto plano).
**Complejidad:** Baja-Media.

#### P1-15 — `GET /api/v1/company/settings` sin verificación de permiso
**Área:** Seguridad · **Evidencia:** `src/app/api/v1/company/settings/route.ts:17-37` solo llama `verifyAuth` (sesión válida), sin `enforcePermission`. Expone `msellerApiKeyEncrypted`, `msellerEmail`, `msellerPasswordEncrypted`.
**Impacto:** Cualquier usuario autenticado (rol mínimo) puede leer el correo y el blob cifrado de mSeller. El cifrado AES-256-GCM limita el daño mientras la clave maestra no se filtre, pero es exposición innecesaria.
**Recomendación:** Añadir `enforcePermission(..., 'administracion', 'read')` y excluir columnas `mseller*` del `select()` general.
**Complejidad:** Baja.

#### P1-16 — `AdminRepository.updateUser`/`toggleUserStatus`: `UPDATE` final sin repetir `companyId`
**Área:** Multiempresa · **Evidencia:** `src/repositories/adminRepository.ts:113-201` — el `SELECT` previo sí valida `companyId`, pero el `UPDATE` que sigue usa solo `eq(users.id, userId)`.
**Impacto:** Defensa en profundidad ausente; no se demostró una vía de explotación directa hoy (el `SELECT` previo ya filtra).
**Recomendación:** Repetir `eq(users.companyId, companyId)` en el `.where()` del `UPDATE`.
**Complejidad:** Baja.

#### P1-17 — `getCustomerStats` no filtra por `modo`
**Área:** Multiempresa (aislamiento PRUEBA/PRODUCCIÓN) · **Evidencia:** `src/repositories/biRepository.ts:490-509,541-556` — a diferencia del resto del archivo, faltan `eq(invoices.modo, modo)`.
**Impacto:** El ranking de "mejores clientes" y "clientes inactivos" del panel ejecutivo puede mezclar facturas de PRUEBA con las reales, inflando cifras de negocio.
**Recomendación:** Añadir el filtro de `modo` a ambas consultas.
**Complejidad:** Baja.

#### P1-18 — `clear-sandbox` no borra tablas hijas antes que las padre
**Área:** Base de datos · **Evidencia:** `src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts:110,113` borra `invoices`/`deliveryNotes` sin borrar antes `invoiceLines`, `invoiceTaxes`, `invoiceRetentions`, `creditDebitNotes`, `dgiiSubmissions`, etc. Las FK son `ON DELETE no action`.
**Impacto:** La función "limpiar sandbox" falla siempre que existan facturas de PRUEBA con líneas (prácticamente todas) — inoperante en la práctica. (Nota positiva: gracias a que las FK no son cascade, esto es un bug funcional, no de integridad.)
**Recomendación:** Borrar primero las tablas hijas en el orden correcto, o declarar `onDelete:'cascade'` explícito si se acepta el borrado en cascada solo en modo PRUEBA.
**Complejidad:** Baja-Media.

#### P1-19 — Deriva entre migraciones SQL y metadata de drizzle-kit
**Área:** Base de datos · **Evidencia:** `drizzle/meta/` solo tiene snapshots hasta `0030`, `_journal.json` hasta la entrada 48 (`0045`), pero existen 57 archivos `.sql` hasta `0047`, con números duplicados (`0011`,`0013`,`0015`,`0020`,`0021`,`0024`,`0025`,`0026`).
**Impacto:** `drizzle-kit generate`/`push` futuros pueden calcular un diff incorrecto contra el estado real; el orden de aplicación de los duplicados depende del orden alfabético de archivo, frágil.
**Recomendación:** Regenerar snapshots contra la BD real como fuente de verdad; renumerar/consolidar los duplicados antes de volver a usar generación automática.
**Complejidad:** Media — requiere cuidado para no romper el historial de despliegues ya aplicado en producción.

#### P1-20 — FK ausente en `bank_accounts.chart_account_id`
**Área:** Base de datos · **Evidencia:** `src/db/schema/bank.ts:26` — columna sin `.references()`, solo índice.
**Impacto:** Nada impide guardar una cuenta contable inexistente o de otra empresa en una cuenta bancaria — el propio comentario del archivo explica que esta columna reemplazó una búsqueda heurística que ya causó asientos mal contabilizados.
**Recomendación:** Añadir `.references(() => chartOfAccounts.id, {onDelete:'restrict'})` y la migración correspondiente.
**Complejidad:** Baja-Media (requiere migración y verificar datos existentes que ya podrían violar la FK).

#### P1-21 — `error.message` crudo en rutas públicas
**Área:** Seguridad · **Evidencia:** `src/app/api/v1/setup/confirm/route.ts:281`, `setup/recover/route.ts:170` — ambas sin sesión, propagan el mensaje de excepción crudo.
**Impacto:** Puede filtrar detalles internos de BD a un visitante anónimo.
**Recomendación:** Mensaje genérico + `console.error` interno, como ya hace `setup/status/route.ts`.
**Complejidad:** Baja.

#### P1-22 — `/api/v1/setup/recover` mal protegida respecto a su propósito
**Área:** Seguridad · **Evidencia:** `proxy.ts` excluye de sesión a `setup/status`, `setup/confirm`, `setup/init`, `cron/` — pero no a `setup/recover`, que según su propio comentario está pensada para funcionar precisamente cuando **no hay sesión válida posible**.
**Impacto:** El mecanismo de emergencia queda inalcanzable en el escenario para el que fue diseñado (no es una falla de seguridad hacia afuera, más bien una funcional).
**Recomendación:** Decidir intencionalmente si debe ser alcanzable sin sesión y, de ser así, añadirla a la exclusión — su propia protección (RECOVERY_SECRET_KEY) ya es robusta.
**Complejidad:** Baja.

#### P1-23 — Draft de factura duplica el cálculo de totales
**Área:** Backend · **Evidencia:** `src/app/api/v1/invoices/draft/route.ts:67-108` reimplementa manualmente el cálculo sin `roundMoney` ni manejo de `taxCategory`/retenciones, en vez de llamar `InvoiceCalculator.calculateTotalsAndRetentions`.
**Impacto:** El total del borrador puede diferir en centavos del total real al emitir — recurrencia del problema histórico "Totales/MontoExento" ya identificado por el usuario.
**Recomendación:** Hacer que el draft reutilice `InvoiceCalculator`, como el flujo de emisión real.
**Complejidad:** Baja-Media.

#### P1-24 — `tx: any` sistemático en repositorios financieros/contables
**Área:** Calidad de código · **Evidencia:** 172 ocurrencias de `: any` en `src/services`(106)/`src/repositories`(61)/`src/middleware`(5), concentradas en `accountingRepository.ts`, `apRepository.ts`, `arRepository.ts`, `invoiceDbBooker.ts`, `permissions.ts`.
**Impacto:** Elimina la principal red de seguridad de tipos justo en la capa que arma asientos contables y pagos — el propio schema documenta un incidente real (asiento duplicado no rastreable) que este tipado débil no habría prevenido pero tampoco ayuda a evitar en el futuro.
**Recomendación:** Tipar `tx` con el tipo real de transacción de Drizzle; sustituir `data: any` por los tipos `New*` ya generados desde el schema.
**Complejidad:** Media (mecánico pero extenso).

---

### 🟡 P2 y 🟢 P3 (resumen ejecutable)

*(Detalle completo de evidencia y recomendación para cada uno de estos ítems en la tabla maestra arriba; se listan aquí solo los datos operativos para planificación.)*

| # | Problema | Complejidad | Notas |
|---|---|---|---|
| 25 | Rate limiting en registro de storefront | Baja | Reusar preset `'auth'` |
| 26 | Validación zod inconsistente | Baja-Media | Estandarizar sobre el patrón ya mayoritario |
| 27 | Unicidad de código/cédula de empleado | Baja | Requiere migración; limpiar duplicados existentes primero |
| 28 | N+1 en aprobación de conduce | Baja | Agrupar con `inArray` |
| 29 | `MSellerClient.issueInvoice` mock legacy | Baja | Eliminar o hacer que lance excepción |
| 30 | Fallos post-transacción solo logueados | Media | Encolar reintento o marcar bandera visible en UI |
| 31 | `createAccountsPayable` sin `return` | Trivial | Código muerto hoy |
| 32 | Reapertura de período borra rastro de cierre | Baja-Media | Registrar en `audit_logs` antes de sobrescribir |
| 33 | `window.confirm()` nativo en 10 acciones críticas | Baja | Migrar a `useConfirm()` existente |
| 34 | Formularios sin validación por campo | Media | Adoptar RHF+zod (ya en dependencias) en formularios fiscales primero |
| 35 | Formularios extremadamente largos | Media-Alta | Dividir en pasos/secciones |
| 36 | Tablas CxC/CxP con patrones distintos | Media | Unificar sobre `@tanstack/react-table` |
| 37 | Error de carga no distinguido de "sin resultados" | Baja | Estado de error persistente, no solo toast |
| 38 | Cero memoización en páginas grandes | Media | `memo`/`useMemo`/`useCallback` en filas y cálculos derivados |
| 39 | `bank/transactions` sin paginación server-side | Media | Filtrar por fecha en la query, no en memoria |
| 40 | Asientos truncados a 100 sin aviso | Baja | Exponer total y paginación real |
| 41 | Archivos de hasta 5,225 líneas | Alta | Refactorización progresiva, no urgente |
| 42 | Doble motor de PDF | Media | Migrar nómina a Puppeteer, retirar pdfkit |
| 43 | 122 catch silenciosos | Media | Priorizar los que protegen auditoría/negocio, no todos |
| 44 | `x-forwarded-for` sin validar | Trivial | Confirmar comportamiento de Vercel |
| 45 | Paginación reinventada en 11 páginas | Baja-Media | Consolidar sobre componente compartido |
| 46 | Sidebars muertos (1,127 líneas) | Trivial | Eliminar |
| 47 | `next/image` no usado | Baja | Migrar Avatar y logo de settings |
| 48 | Estado `'voided'` no implementado | Baja | Implementar o quitar del tipo |
| 49 | `pdf-lib` sin uso / import duplicado de Radix | Trivial | Limpieza de dependencias |

---

## PLAN DE EJECUCIÓN RECOMENDADO

### 🔴 FASE A — Corregir inmediatamente (P0)
1. **P0-04** (secreto expuesto + falta de `.gitignore`) — la más rápida de aplicar, hacerla primero y sin esperar a nada más.
2. **P0-01 + P0-02 + P0-03** (misma familia: separación de rol de plataforma / comparación exacta de rol) — corregirlas juntas, ya que P0-02 es la causa raíz que también habilita parte de P0-01.
3. **P0-06** (worker DGII: desconocido ≠ rechazado) — aislado, bajo riesgo de romper otra cosa, alto impacto fiscal.
4. **P0-05 + P0-07** (módulo de asientos de venta/compra: cuentas correctas + eliminación controlada) — requieren más pruebas por tocar el flujo transaccional central; planificar con ventana de pruebas dedicada y coordinar con el usuario la corrección de catálogos/asientos ya existentes.

### 🟠 FASE B — Estabilizar el sistema (P1)
Agrupar por módulo para minimizar retrabajo:
- **Colas/DGII:** P1-08 (submissionId), relacionado directamente con la Fase A punto 3.
- **Inventario/concurrencia:** P1-09, P1-10 — mismo patrón de corrección (`FOR UPDATE`), hacerlos juntos.
- **Contabilidad:** P1-11 (idempotencia), P1-12 (COGS) — depende de haber estabilizado P0-05 primero.
- **Auditoría:** P1-13, P1-14 — extender `audit_logs` a pagos/cobros y configuración DGII.
- **Seguridad puntual:** P1-15, P1-21, P1-22 — de bajo esfuerzo, agrupables en un solo ciclo.
- **Multiempresa (defensa en profundidad):** P1-16, P1-17.
- **Base de datos:** P1-18, P1-19, P1-20 — P1-19 (migraciones) conviene resolverlo antes de que el equipo vuelva a generar migraciones automáticas con drizzle-kit.
- **Backend:** P1-23 — bajo esfuerzo, alto valor (evita confusión de totales).
- **Calidad:** P1-24 — el más extenso; puede ejecutarse de forma incremental sin bloquear el resto.

### 🟡 FASE C — Optimizar (P2)
Priorizar dentro de esta fase por relación con dinero/fiscal primero: P2-30 (conduce automático silencioso), P2-32 (rastro de cierre de período), P2-33 (confirmaciones en operaciones sensibles); luego rendimiento (P2-38, P2-39, P2-40); luego UX de formularios (P2-34, P2-35); el resto según disponibilidad de equipo.

### 🟢 FASE D — Evolucionar (P3 y nuevas funcionalidades)
P3-44 a P3-49 (limpieza de código muerto, dependencias no usadas, `next/image`) — agrupables en un solo "sprint de limpieza" de bajo riesgo. Ninguna automatización, IA o funcionalidad nueva debe planificarse con prioridad mayor a las fases anteriores.

---

## Nota metodológica final
Esta auditoría es estática (lectura de código), realizada por 7 subagentes especializados que citaron archivo y línea para cada hallazgo. No se ejecutaron pruebas dinámicas contra un servidor corriendo, no se revisaron políticas RLS de Supabase a nivel de base de datos (solo el filtrado a nivel de aplicación), y no se evaluó apariencia visual real (colores, contraste) por no poder capturar pantallas — estos puntos quedan como **NO EVALUADO — FALTA INFORMACIÓN** y no se cuentan en las calificaciones anteriores como fortaleza ni debilidad.

No se modificó, creó ni eliminó ningún archivo del proyecto durante esta auditoría.
