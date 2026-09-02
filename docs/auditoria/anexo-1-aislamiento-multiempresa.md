# ANEXO 1 — AUDITORÍA DE AISLAMIENTO DE DATOS ENTRE EMPRESAS (Fases 1 y 2)

**Proyecto:** `contfast_v.2` (Next.js App Router + Drizzle + Postgres/Supabase)
**Alcance revisado:** 177 `route.ts` bajo `src/app/api/`, `src/middleware/`, `src/proxy.ts`, `src/db/` (89 tablas), `src/repositories/` (20), `src/services/`, `drizzle/` (47 migraciones).
**Modalidad:** sólo lectura de código. Ninguna prueba dinámica, ninguna consulta a la base de datos.

---

## ¿De dónde sale `companyId`?

`companyId` **nunca se toma del body ni del query string**. Sale de dos sitios (`src/middleware/auth.ts`):

1. **Vía cabeceras** (líneas 58–115): `x-company-id`, `x-user-id`, `x-user-role`, `x-role-id`, `x-user-permissions`. Está protegida por firma `x-internal-proxy-signature` comparada contra `INTERNAL_API_KEY`. Si la variable no existe, la vía se desactiva. Esta parte está bien construida y **no es suplantable** sin conocer el secreto.
2. **Vía cookie + JWT** (líneas 117–142 y 149–273): `accessToken` firmado HS256; `companyId` viaja dentro del payload firmado y, en el refresh, se relee de `sessions.companyId` en BD (líneas 212, 266).

**Conclusión: no hay suplantación directa de `companyId` por parámetro del cliente.** El problema de aislamiento es otro, y es peor (ISO-01 + ISO-02).

---

## ISO-01 🔴 CRÍTICO — No existe `middleware.ts`: toda la capa de RBAC perimetral es código muerto

**MÓDULO AFECTADO:** Global (las 177 rutas API + `/dashboard`)

**DESCRIPCIÓN:** `src/proxy.ts` (490 líneas) implementa autenticación de borde, verificación RBAC por ruta (`checkRbacPermission`), saneado de cabeceras de identidad entrantes e inyección firmada del contexto de sesión. Exporta `proxy()` y un `config.matcher`. **Pero Next.js sólo carga middleware desde `middleware.ts` en la raíz del proyecto o en `src/`, y ese archivo no existe.** Nada importa `proxy`. El fichero nunca se ejecuta.

**CAUSA RAÍZ:** El módulo se llama `proxy.ts` en vez de `middleware.ts`, y la función se llama `proxy` en vez de `middleware`. Probablemente un renombrado que rompió la convención de Next.js sin error visible (falla en silencio).

**EVIDENCIA:**

```
# El manifiesto del último build está VACÍO:
$ cat .next/server/middleware-manifest.json
{ "version": 3, "middleware": {}, "sortedMiddleware": [], "functions": {} }

$ wc -c .next/server/middleware.js
223 .next/server/middleware.js        # stub, no contiene checkRbacPermission

$ git ls-files | grep -i middleware
src/middleware/auth.ts
src/middleware/permissions.ts
src/middleware/rateLimiter.ts
# (no hay middleware.ts en raíz ni en src/)
```

`src/proxy.ts:385-395` — el matcher que nunca se registra:
```ts
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/v1/:path*',
    '/api/documents/:path*',
    ...
  ],
};
```

`src/proxy.ts:66-100` — el mapeo RBAC que nunca se evalúa:
```ts
const STATIC_ROUTE_MAPPINGS = [
  { pattern: /^\/api\/v1\/accounting/, module: 'contabilidad', action: null },
  { pattern: /^\/api\/v1\/bank/, module: 'banco', action: null },
  { pattern: /^\/api\/v1\/admin/, module: 'administracion', action: null },
  ...
];
```

**ESCENARIO:** Cualquier petición a `/api/v1/*`. No se ejecuta `checkRbacPermission`, no se sanean cabeceras entrantes en rutas excluidas, no se inyecta contexto. La única defensa que queda es lo que cada `route.ts` haga por su cuenta — y 54 de ellas no hacen ninguna (ISO-03).

**IMPACTO CONTABLE:** Los controles que impedían que un rol `cajero` tocara contabilidad o banco no se aplican en ninguna ruta que no repita la comprobación internamente.

**IMPACTO EN LA BASE DE DATOS:** Ninguno directo; habilita los demás hallazgos.

**RIESGO MULTIEMPRESA:** Es el multiplicador de ISO-02 y ISO-03. Con el middleware activo, `/api/v1/hr/*` exigiría `nomina:read` y `/api/v1/bank/*` exigiría `banco:read`, lo que bloquearía al usuario auto-registrado de ISO-02 en la mayoría de rutas.

**SOLUCIÓN RECOMENDADA:** Crear `src/middleware.ts` con `export { proxy as middleware } from './proxy'; export { config } from './proxy';` — o renombrar `src/proxy.ts` → `src/middleware.ts` y `proxy()` → `middleware()`. Después, verificar en `.next/server/middleware-manifest.json` que `sortedMiddleware` deja de estar vacío, y añadir un test de humo que compruebe que un GET sin cookie a `/api/v1/invoices` devuelve 401 emitido por el borde.

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** **Alto en regresiones funcionales.** Al activarlo se activan de golpe: (a) `checkRbacPermission`, que devolverá 403 a roles que hoy pasan; (b) la vía de cabeceras firmadas en `verifyAuth`, que pasará a ser el camino principal; (c) el borrado de cabeceras en rutas excluidas. Además `checkRbacPermission` usa `userRole.includes('sistema')` / `.includes('admin')` (`src/proxy.ts:112-113`), inconsistente con la comparación exacta ya corregida en `permissions.ts:44` — al activarlo se reintroduce ese defecto (ver ISO-12). Requiere despliegue en staging con pruebas por rol.

---

## ISO-02 🔴 CRÍTICO — Registro público que crea usuario y sesión en CUALQUIER empresa elegida por el atacante

**MÓDULO AFECTADO:** `storefront` / autenticación

**DESCRIPCIÓN:** `POST /api/storefront/auth/register` es **público, sin autenticación y sin `verifyAuth`**. Recibe `empresaSlug` en el cuerpo, resuelve la empresa entre **todas las empresas activas del sistema**, crea un usuario `status: 'active'` con `companyId` = esa empresa y **emite inmediatamente cookies de sesión válidas** (`createSession`) para ella.

**CAUSA RAÍZ:** El endpoint de alta de clientes del storefront no está restringido a empresas que hayan habilitado el storefront, ni existe separación entre "usuario cliente del storefront" y "usuario del ERP": ambos viven en la tabla `users` y comparten el mecanismo de sesión que consume `verifyAuth`.

**EVIDENCIA:**

`src/app/api/storefront/auth/register/route.ts:33-37,55-65,72-80`
```ts
const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
if (!company) { ...404... }
const companyId = company.id;
...
const [newUser] = await db.insert(users).values({
    companyId, roleId: clienteRole.id, name: fullName,
    email: email.toLowerCase(), passwordHash, status: 'active',
}).returning();
...
await createSession(newUser.id, newUser.companyId, clienteRole.name, clienteRole.id, ipAddress, userAgent, resHeaders);
```

`src/services/storefront/companyService.ts:20-26,45-55` — el slug es el nombre en minúsculas sin caracteres no alfanuméricos, y **no hay filtro de "storefront habilitado"**:
```ts
export function generateCompanySlug(name: string): string {
  return name.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
...
    .from(companies)
    .leftJoin(companySettings, eq(companies.id, companySettings.companyId))
    .where(and(eq(companies.status, 'active'), isNull(companies.deletedAt)));
const match = activeCompanies.find(c => generateCompanySlug(c.name) === slug);
```

**ESCENARIO:** Un atacante conoce (o enumera) el nombre comercial de una empresa cliente — "Ferretería Los Andes" → `ferreterialosandes`. Hace `POST /api/storefront/auth/register` con ese slug. Recibe `accessToken` + `refreshToken` con el `companyId` de la víctima. A partir de ahí llama a cualquiera de las 54 rutas de ISO-03. Sin ISO-01 corregido, no hay ningún control perimetral que lo detenga.

**IMPACTO CONTABLE:** Exfiltración completa del estado financiero de la empresa víctima: `/api/v1/financial/dashboard`, `/api/v1/reports/balances/customers`, `/api/v1/reports/balances/suppliers`, `/api/v1/reports/receivables`, `/api/v1/invoices/report`, `/api/v1/expenses/report`, `/api/v1/bi/stats`. Cartera de clientes con límites de crédito y saldos; cartera de proveedores con deudas.

**IMPACTO EN LA BASE DE DATOS:** Escritura: filas nuevas en `users` y `sessions` con el `company_id` de la víctima — el atacante queda como usuario legítimo del tenant. También escritura vía `/api/v1/storage/upload` y `/api/v1/hr/*`.

**RIESGO MULTIEMPRESA:** Máximo. Rompe la frontera entre tenants sin necesidad de ninguna credencial previa. Adicionalmente expone **nómina completa** (`/api/v1/hr/employees`, `/payroll`, `/settlements`), que es dato personal.

**SOLUCIÓN RECOMENDADA (3 capas, todas necesarias):**
1. Añadir columna `storefront_enabled` (o `storefront_slug`) en `companies`/`company_settings` y que `resolveCompanyBySlug` filtre por ella; por defecto `false`.
2. Separar el ámbito de la sesión: emitir para el rol `cliente` un token con un claim `scope: 'storefront'` y que `verifyAuth` (o un guard en `/api/v1/*`) rechace tokens de ese scope fuera de `/api/storefront/*`. Alternativamente, tabla `storefront_customers` distinta de `users`.
3. Exigir verificación de correo antes de activar (`status: 'pending'` hasta confirmar) y aplicar `checkRateLimit` a este endpoint (hoy no lo llama).

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** Medio. El punto 1 desactiva el storefront de todas las empresas hasta que se marquen — hay que migrar activando la bandera sólo en las que realmente lo usan. El punto 2 invalida las sesiones de clientes del storefront ya emitidas. El punto 3 puede romper el alta si no hay servidor de correo configurado.

---

## ISO-03 🔴 CRÍTICO — 54 rutas API sólo comprueban "estás autenticado", nunca "puedes ver esto"

**MÓDULO AFECTADO:** banco, nómina, reportes, financiero, BI, caja, gastos, cotizaciones, almacenamiento, ajustes de empresa

**DESCRIPCIÓN:** 54 de las 177 rutas llaman a `verifyAuth` y no llaman a `enforcePermission`, `enforceAdminOrSistemas`, `isAdminOrSistemas`, `hasPermission` ni comparan `session.role`. Filtran correctamente por `companyId`, así que **no hay fuga entre empresas por sí solas** — pero cualquier sesión válida de esa empresa las abre, incluido el rol `cliente` que ISO-02 permite crear desde fuera, y cualquier rol interno de baja confianza (`cajero`, `compras`).

**CAUSA RAÍZ:** La autorización se delegó al middleware perimetral (`STATIC_ROUTE_MAPPINGS` en `src/proxy.ts`), que no se ejecuta (ISO-01). No hay un guard por defecto: una ruta que no comprueba nada, no comprueba nada.

**EVIDENCIA:** Listado obtenido con:
```
for f in $(find src/app/api -name route.ts); do
  grep -q verifyAuth "$f" && ! grep -qE "enforcePermission|enforceAdminOrSistemas|isAdminOrSistemas|\.role\s*(!==|===)|hasPermission" "$f" && echo "$f"
done
```
Las 54 rutas:
```
api/documents/email/[type]/[id]        api/documents/pdf/[type]/[id]
api/documents/share/[type]/[id]        api/storefront/quotes
v1/admin/permissions                   v1/admin/sessions
v1/ap/payments/report                  v1/auth/audit
v1/auth/logout                         v1/auth/me
v1/auth/profile                        v1/auth/refresh
v1/auth/route-mappings                 v1/bank/accounts
v1/bank/transactions                   v1/bi/stats
v1/cash/sessions/[id]/print            v1/cash/sessions/[id]/ticket
v1/categories                          v1/company/settings
v1/customers/[id]/history              v1/dgii/rnc/[rnc]
v1/expenses/[id]/print                 v1/expenses/report
v1/financial/dashboard                 v1/financial/statements/customers/[id]
v1/financial/statements/customers/[id]/print
v1/financial/statements/suppliers/[id]
v1/financial/statements/suppliers/[id]/print
v1/hr/departments                      v1/hr/employees
v1/hr/entries                          v1/hr/payroll
v1/hr/payroll/[id]/receipts            v1/hr/positions
v1/hr/settlements                      v1/hr/settlements/[id]/print
v1/hr/vacations                        v1/invoices/[id]/print
v1/invoices/report                     v1/jobs/[jobId]
v1/ocr                                 v1/quotes/[id]/pdf
v1/quotes/[id]/print                   v1/reports/balances/customers
v1/reports/balances/customers/print    v1/reports/balances/suppliers
v1/reports/balances/suppliers/print    v1/reports/payables/print
v1/reports/receivables                 v1/reports/receivables/print
v1/storage/delete                      v1/storage/upload
v1/tools/print
```

Ejemplo textual, `src/app/api/v1/bank/accounts/route.ts:27-32`:
```ts
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const accounts = await BankRepository.getBankAccounts(session.companyId, session.modo);
```
No hay `enforcePermission(..., 'banco', 'read')`. Contrasta con `src/app/api/v1/customers/[id]/route.ts:39`, que sí la tiene. Mismo patrón sobre datos de nómina en `src/app/api/v1/hr/payroll/route.ts:16-19`.

**ESCENARIO:** (a) Encadenado con ISO-02, un desconocido lee todo lo anterior de una empresa ajena. (b) Sin ISO-02, un `cajero` de la propia empresa lee la nómina completa, los saldos bancarios y el estado de cuenta de todos los clientes — escalada horizontal de privilegios dentro del tenant.

**IMPACTO CONTABLE:** Lectura no autorizada de balances, cuentas por cobrar/pagar, libro de banco y nómina. `/api/v1/company/settings` y `/api/v1/storage/delete` permiten además modificar configuración y borrar archivos.

**IMPACTO EN LA BASE DE DATOS:** Las rutas POST/PUT/DELETE del grupo (`hr/employees`, `hr/entries`, `hr/vacations`, `bank/accounts`, `bank/transactions`, `categories`, `company/settings`, `storage/*`) permiten escritura y borrado sin permiso comprobado.

**RIESGO MULTIEMPRESA:** Alto en combinación con ISO-02; medio-alto por sí solo.

**SOLUCIÓN RECOMENDADA:** Introducir un envoltorio obligatorio, p. ej. `withApiAuth(modulo, accion, handler)` en `src/middleware/`, que ejecute `verifyAuth` + `enforcePermission` y devuelva `auth`; migrar las 54 rutas a él. Añadir una regla de ESLint o un test que falle si un `route.ts` bajo `src/app/api/v1/` exporta un handler que no pasa por el envoltorio. Corregir ISO-01 en paralelo para tener defensa en profundidad, no sustitución.

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** Medio-alto. Asignar el par (módulo, acción) equivocado a una ruta la cierra para roles que hoy la usan legítimamente — p. ej. `/api/v1/dgii/rnc/[rnc]` la usan facturación, compras y clientes. Requiere mapear ruta→permiso con el negocio y desplegar por lotes, empezando por las de sólo lectura sensible (`hr/*`, `financial/*`, `bank/*`).

---

## ISO-04 🟠 ALTO — Facturación: `customerId`, `warehouseId` y `productId` del cuerpo no se validan contra la empresa; el mensaje de error filtra datos de otra empresa

**MÓDULO AFECTADO:** `invoices` (emisión de e-CF)

**DESCRIPCIÓN:** `POST /api/v1/invoices` valida los identificadores sólo como UUID. En `InvoiceDbBooker` las consultas de validación de costo de producto y de límite de crédito del cliente **no filtran por `company_id`**, y después el `customerId`/`warehouseId` se persisten tal cual en `invoices`, `accounts_receivable` y `financial_movements`.

**CAUSA RAÍZ:** Las validaciones se escribieron con SQL crudo (`from(sql\`customers\`)`, `eq(sql\`id\`, ...)`) que esquiva tanto el helper `withTenantMode` como cualquier revisión basada en el nombre de la columna Drizzle.

**EVIDENCIA:**

`src/app/api/v1/invoices/route.ts:13-14,30,36` — el esquema no valida pertenencia:
```ts
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
      productId: z.string().uuid(),
```

`src/services/invoice/invoiceDbBooker.ts:79-85` — costo de producto sin `company_id`:
```ts
        const [prod] = await db.select({ cost: sql<string>`cost` }).from(sql`products`).where(eq(sql`id`, line.productId)).limit(1);
        if (prod) {
          const cost = parseFloat(prod.cost || '0.00');
          if (cost > 0 && line.unitPrice < cost) {
            throw new Error(`El precio unitario (RD$ ${line.unitPrice.toFixed(2)}) para "${line.name}" no puede ser inferior a su costo (RD$ ${cost.toFixed(2)}).`);
```

`src/services/invoice/invoiceDbBooker.ts:91-98` y de nuevo dentro de la transacción en `244-251` — límite de crédito sin `company_id`:
```ts
      const [customer] = await db
        .select({ creditLimit: sql<string>`credit_limit`, name: sql<string>`name` })
        .from(sql`customers`)
        .where(eq(sql`id`, data.customerId))
        .limit(1);
```

Contraste: `src/app/api/v1/expenses/route.ts:107-139` **sí** valida almacén y productos contra `session.companyId` y devuelve *"Uno o más productos no pertenecen a la empresa."*. La misma validación falta en facturación.

**ESCENARIO:** Un usuario de la Empresa A emite una factura pasando `customerId` de un cliente de la Empresa B. Si ese cliente tiene `credit_limit > 0` y la venta es a crédito, la respuesta de error devuelve textualmente **el nombre del cliente ajeno y su límite de crédito**. Un oráculo idéntico existe con `productId`, filtrando **nombre y costo** de productos de otra empresa. Si no se dispara el error, la factura se guarda apuntando al cliente/almacén ajeno.

**IMPACTO CONTABLE:** Facturas y cuentas por cobrar de la Empresa A colgando de un cliente de la Empresa B. El estado de cuenta del cliente (que filtra por `companyId` propio) no lo muestra: la partida queda huérfana y la conciliación de cartera nunca cuadra.

**IMPACTO EN LA BASE DE DATOS:** Claves foráneas cruzadas entre tenants en `invoices.customer_id`, `invoices.warehouse_id`, `accounts_receivable.customer_id`, `financial_movements.customer_id`, `invoice_lines.product_id`. Las FK son simples (`customers.id`), no compuestas con `company_id`, por lo que Postgres no lo impide.

**RIESGO MULTIEMPRESA:** Alto: hay un primitivo de **lectura** confirmado (nombre + límite de crédito de clientes ajenos, nombre + costo de productos ajenos) y uno de **escritura** (referencias cruzadas persistidas).

**SOLUCIÓN RECOMENDADA:** En `InvoiceDbBooker.preFlightValidations` y en `executeDbTransaction`, sustituir el SQL crudo por Drizzle tipado con `and(eq(products.id, ...), eq(products.companyId, data.companyId))` y `and(eq(customers.id, ...), eq(customers.companyId, data.companyId), isNull(customers.deletedAt))`. Añadir al inicio del POST una validación en bloque idéntica a la de `expenses/route.ts:107-139`, devolviendo 404 genérico sin revelar nada del registro. A medio plazo, convertir las FK en compuestas `(company_id, id)`.

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** Medio. Si ya existen facturas históricas con referencias cruzadas o con clientes borrados, la validación estricta bloqueará notas de crédito y reemisiones sobre esas facturas. Ejecutar antes el inventario en BD (ver `verificacion-bd.sql`, consulta X-01) y sanear.

---

## ISO-05 🟠 ALTO — Cotizaciones: mismo defecto, en creación y en actualización

**MÓDULO AFECTADO:** `quotes`

**DESCRIPCIÓN:** `QuoteService.createQuote` y `updateQuote` validan el costo del producto sin filtrar por empresa, y persisten `customerId`, `warehouseId` y `productId` recibidos del cuerpo sin comprobar pertenencia.

**EVIDENCIA:**

`src/services/quoteService.ts:78-88` (creación) y `:274-284` (el mismo bloque repetido en `updateQuote`):
```ts
      for (const line of data.lines) {
        if (line.productId) {
          const [prod] = await tx.select({ cost: sql<string>`cost`, name: sql<string>`name` }).from(products).where(eq(products.id, line.productId)).limit(1);
```
`src/services/quoteService.ts:131-137,150-160` — persistencia sin validar.
`src/services/quoteService.ts:220` — al leer, el cliente ajeno se resuelve sin filtro y se devuelve en el detalle:
```ts
      const [cust] = await db.select().from(customers).where(eq(customers.id, quote.customerId));
```

**ESCENARIO:** Usuario de la Empresa A crea una cotización con `customerId` de la Empresa B; al abrir el detalle (`GET /api/v1/quotes/[id]`), `getQuoteById` devuelve **el registro completo del cliente ajeno** (dirección, RNC, teléfono, límite de crédito). Aquí la fuga es más grave que en ISO-04 porque no depende de un mensaje de error: es lectura directa del objeto.

**IMPACTO CONTABLE:** Cotizaciones que al convertirse en factura (`/api/v1/quotes/[id]/convert`) propagan la referencia cruzada al documento fiscal.

**IMPACTO EN LA BASE DE DATOS:** FK cruzadas en `quotes.customer_id`, `quotes.warehouse_id`, `quote_lines.product_id`.

**RIESGO MULTIEMPRESA:** Alto — primitivo de lectura de la ficha completa de clientes ajenos.

**SOLUCIÓN RECOMENDADA:** Añadir `eq(products.companyId, data.companyId)` en las dos consultas de costo; validar `customerId`/`warehouseId` contra la empresa antes del `insert`/`update`; y en `getQuoteById` filtrar el cliente con `and(eq(customers.id, quote.customerId), eq(customers.companyId, companyId))`.

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** Bajo-medio. Cotizaciones históricas con referencias cruzadas dejarían de mostrar el cliente (mostrarán "Cliente General"), que es el comportamiento correcto pero visible para el usuario.

---

## ISO-06 🟡 MEDIO — Recibos de cobro: `customerId` del cuerpo no se valida contra la empresa

**MÓDULO AFECTADO:** `ar` (cuentas por cobrar)

**DESCRIPCIÓN:** `POST /api/v1/ar/receipts` inserta el recibo y el movimiento financiero con el `customerId` recibido sin comprobar que pertenezca a la empresa. Nótese que **`arId` sí está correctamente validado** — la corrección se aplicó a las aplicaciones de pago pero no a la cabecera del recibo.

**EVIDENCIA:**

`src/repositories/arRepository.ts:87-97` — cabecera sin validar:
```ts
      const [receipt] = await tx.insert(customerReceipts).values({
        id: receiptId, companyId: data.companyId, modo: data.modo,
        customerId: data.customerId,
```
`src/repositories/arRepository.ts:128-137` — la corrección que sí existe, para `arId`:
```ts
        // arId viene del cuerpo de la peticion: sin filtrar por empresa se
        // podia saldar la cuenta por cobrar de otra empresa.
        const [ar] = await tx.select().from(accountsReceivable)
          .where(and(
            eq(accountsReceivable.id, applied.arId),
            eq(accountsReceivable.companyId, data.companyId),
            eq(accountsReceivable.modo, data.modo)
          ));
```

**ESCENARIO:** Se registra un cobro en la Empresa A a nombre de un cliente de la Empresa B. Como el `arId` sí está validado, no se salda deuda ajena; queda un recibo con un cliente irresoluble.

**IMPACTO CONTABLE:** Recibo huérfano en la cartera de A. El arqueo de caja cuadra en importe pero no es trazable a un cliente.

**IMPACTO EN LA BASE DE DATOS:** FK cruzada en `customer_receipts.customer_id` y `financial_movements.customer_id`.

**RIESGO MULTIEMPRESA:** Medio — no hay lectura de datos ajenos por esta vía, sólo corrupción referencial.

**SOLUCIÓN RECOMENDADA:** Al inicio de `registerReceipt`, dentro de la transacción: `SELECT id FROM customers WHERE id = data.customerId AND company_id = data.companyId AND deleted_at IS NULL`; si no existe, error 404.

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** Bajo.

---

## ISO-07 🟠 ALTO — Existe RLS en Postgres pero está en modo *fail-open* y ningún código lo activa

**MÓDULO AFECTADO:** Base de datos (defensa en profundidad)

**DESCRIPCIÓN:** Las migraciones `0024` y `0026` habilitan `ROW LEVEL SECURITY` + `FORCE` y crean `tenant_isolation_policy` en todas las tablas con `company_id`. Pero la política **permite explícitamente todo cuando la variable de sesión no está definida**, y la única función que la define (`withTenantContext`) **no tiene ni un solo llamador en todo el repositorio**. La defensa a nivel BD es, en la práctica, inexistente: **la única barrera real es el código de aplicación.**

**EVIDENCIA:**

`drizzle/0024_enable_rls_policies.sql:19-30` — la cláusula de escape:
```sql
            CREATE POLICY tenant_isolation_policy ON %I
            FOR ALL
            USING (
                (NULLIF(current_setting(''app.current_company_id'', true), '''') IS NULL) OR
                (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid)
            )
```
`drizzle/0026_glorious_serpent_society.sql:108-125` — idéntico, extendido a `modo`, con la misma escapatoria.

`src/db/index.ts:36-47` — el único sitio que define la variable:
```ts
export async function withTenantContext<T>(companyId, modo, fn) {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_company_id', ${companyId}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_environment', ${modo}, true)`);
    return await fn(tx);
  });
}
```
Búsqueda de llamadores:
```
$ grep -rn "withTenantContext" src/ --include=*.ts
src/db/index.ts:36:export async function withTenantContext<T>(
# — un único resultado: la propia definición.
```

**ESCENARIO:** Cualquier consulta de la aplicación. Como `app.current_company_id` nunca se define, la primera rama del `USING` es siempre verdadera y la política deja pasar todas las filas de todas las empresas. Todo hallazgo de aplicación (ISO-04, ISO-05, ISO-06 y cualquier `where` que se olvide en el futuro) llega sin obstáculo a la BD.

**IMPACTO CONTABLE:** Indirecto — no hay red de seguridad si un `where` se pierde en un refactor.

**IMPACTO EN LA BASE DE DATOS:** El aislamiento anunciado por las migraciones no se cumple. Genera falsa confianza.

**RIESGO MULTIEMPRESA:** Alto como factor agravante — es la ausencia de la última línea de defensa.

**SOLUCIÓN RECOMENDADA (por fases, en este orden):**
1. Instrumentar: que todas las rutas obtengan su transacción vía `withTenantContext(auth.companyId, auth.modo, tx => ...)`, empezando por un módulo piloto.
2. Verificar el rol de conexión: si el rol del pooler es superusuario o tiene `BYPASSRLS`, la política nunca se aplicará aunque se corrija (`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;`).
3. Sólo cuando el 100 % del tráfico pase por ahí, emitir una migración que elimine la rama `IS NULL`, dejando un rol administrativo `BYPASSRLS` para migraciones y batch.

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** **Muy alto si se altera el orden.** Retirar la escapatoria con el código actual haría que **toda consulta devuelva cero filas y todo `INSERT` falle**: caída total del sistema.

---

## ISO-08 🟡 MEDIO — El entorno `modo` (PRODUCCION/PRUEBA) lo decide una cookie que escribe el navegador

**MÓDULO AFECTADO:** Global (42 de 89 tablas llevan `modo`)

**DESCRIPCIÓN:** `modo` no viaja dentro del JWT firmado. Se deriva de la cookie `cf_environment`, escrita por JavaScript del cliente sin `HttpOnly`. Cualquier usuario puede cambiar su entorno editando la cookie desde la consola del navegador; el servidor no comprueba si tiene derecho a operar en PRODUCCIÓN.

**EVIDENCIA:**

`src/middleware/auth.ts:124-134` — el servidor confía en la cookie:
```ts
      const environmentCookie = req.cookies.get('cf_environment')?.value;
      const reqModo = environmentCookie === 'PRUEBA' ? 'PRUEBA' : 'PRODUCCION';
```
`src/app/dashboard/ClientLayout.tsx:109-113` — la cookie la escribe el cliente, sin `HttpOnly`:
```tsx
        document.cookie = `cf_environment=${targetEnv}; path=/; max-age=31536000; SameSite=Strict`;
```

**ESCENARIO:** Un usuario al que la organización sólo quiere en el entorno de prácticas cambia `cf_environment` a `PRODUCCION` y emite comprobantes fiscales reales, consumiendo secuencia NCF autorizada por la DGII. Nada en el servidor lo impide.

**IMPACTO CONTABLE:** Alto si se explota: emisión de e-CF reales por personal no autorizado, consumo irreversible de secuencia NCF, asientos en el libro diario de producción.

**RIESGO MULTIEMPRESA:** Bajo entre empresas; alto dentro de la empresa. `modo` es el segundo eje de aislamiento del sistema y se gobierna con un control del lado del cliente.

**SOLUCIÓN RECOMENDADA:** Mover `modo` al payload del JWT (firmado en `createSession` y en la rotación), y que el cambio de entorno pase por un endpoint autenticado que compruebe permiso y reemita las cookies. Modelo ya existente y correcto: `POST /api/v1/auth/switch-company` (`src/app/api/v1/auth/switch-company/route.ts:20-25`).

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** Medio. Todas las sesiones activas quedarían con tokens sin el claim `modo`; definir el comportamiento por defecto (tratar el claim ausente como `PRODUCCION` y forzar reautenticación).

---

## ISO-09 🟡 MEDIO — Tres rutas de cobros mezclan PRODUCCIÓN y PRUEBA

**MÓDULO AFECTADO:** `ar` (cobros)

**DESCRIPCIÓN:** `customer_receipts` tiene columna `modo` y el POST la graba correctamente, pero las dos funciones de lectura del repositorio **no la filtran**: devuelven recibos de ambos entornos mezclados.

**EVIDENCIA:**

`src/repositories/arRepository.ts:225-229` (listado) y `:332,353-357` (desglose por cliente) — condiciones sin `modo`. Contraste, `src/repositories/apRepository.ts:337-352`, que sí lo hace con comentario explícito.

Rutas afectadas: `ar/receipts/route.ts:44`, `ar/receipts/by-customer/route.ts:32`, `ar/receipts/by-customer/print/route.ts:67`.

**ESCENARIO:** Un usuario en PRODUCCIÓN abre el listado de cobros y ve mezclados los recibos reales y los de prácticas. El desglose por cliente **se imprime y se entrega al cliente**, incluyendo cobros de prácticas.

**IMPACTO CONTABLE:** Alto y directo. Un estado de cuenta entregado a un cliente le reconoce pagos que nunca hizo.

**SOLUCIÓN RECOMENDADA:** Añadir el parámetro `modo` a ambas firmas y `eq(customerReceipts.modo, modo)` a las condiciones; pasar `session.modo` desde las tres rutas.

**RIESGO DE IMPLEMENTAR LA SOLUCIÓN:** Bajo. Auditar antes `SELECT modo, count(*) FROM customer_receipts GROUP BY 1`.

---

## ISO-10 🟡 MEDIO — El estado de cuenta del cliente mezcla entornos en "Productos más comprados"

**MÓDULO AFECTADO:** `financial`

**DESCRIPCIÓN:** `getCustomerStatement` filtra `modo` correctamente en el movimiento financiero (línea 43, con comentario explicando por qué), pero el bloque de productos más comprados del mismo método **omite el filtro**.

**EVIDENCIA:** `src/repositories/financialRepository.ts:237-253` — condiciones sin `eq(invoices.modo, modo)`.

**IMPACTO CONTABLE:** Medio. No altera el saldo reclamado, pero el documento entregado al cliente contiene cifras de consumo falsas.

**SOLUCIÓN RECOMENDADA:** Añadir `eq(invoices.modo, modo)` (el parámetro ya está disponible). **RIESGO:** Muy bajo.

---

## ISO-11 🟢 BAJO — `apRepository.getPayments` hace el filtro de entorno condicional

`src/repositories/apRepository.ts:232-236`: el filtro de `modo` sólo se aplica si el llamador lo envía. Hoy los dos llamadores lo envían (`ap/route.ts:45`, `ap/payments/report/route.ts:24`), así que no es explotable — pero deja abierta la mezcla para cualquier llamador futuro.

**SOLUCIÓN:** hacer `modo` obligatorio en el tipo. Nota: `next.config.ts:4` tiene `typescript: { ignoreBuildErrors: true }`, así que el compilador **no** detendrá el build ante un llamador incompleto; revisar a mano.

---

## ISO-12 🟢 BAJO (latente) — En `src/proxy.ts` el rol se compara con `includes()`, no con igualdad

`src/proxy.ts:112-113`:
```ts
  const isSistemas = userRole.includes('sistema');
  const isAdmin = userRole.includes('admin');
```
`src/middleware/permissions.ts:42-50` ya fue corregido a comparación exacta, con comentario explicando el porqué. Como `proxy.ts` no se ejecuta, hoy no tiene efecto — pero **al corregir ISO-01 el defecto entra en producción**: un rol llamado "admin de ventas" obtendría acceso total en la comprobación perimetral.

**SOLUCIÓN:** normalizar y comparar con igualdad, **en el mismo cambio que ISO-01**.

---

## LO QUE ESTÁ BIEN (verificado)

Delimita el alcance de los hallazgos:

- **Los repositorios están correctamente parametrizados.** `CustomerRepository`, `SupplierRepository`, `ProductRepository`, `BankRepository`, `DeliveryRepository`, `SupplierOrderService`, `HRRepository`, `CashService` reciben `companyId` (y casi siempre `modo`) y lo aplican. Verificado sobre las 344 cláusulas `.where()` de `src/app/api` y las 262 de `src/repositories`.
- **No hay IDOR clásico.** Las rutas `[id]` que parecían vulnerables resultaron ser patrones *comprobar-y-actuar* correctamente acotados: `retentions/[id]` (30–40, 88–119), `expenses/types/[id]` (79–90), `accounting/periods/[id]` (41–51).
- **`accountsReceivable` (`arId`), cuentas bancarias, almacenes y productos en gastos** sí validan pertenencia. `expenses/route.ts:107-141` es el patrón de referencia a replicar.
- **Rutas de administración** (`admin/companies`, `clear-sandbox`, `plans/[id]`, `subscriptions/[id]`, `auth/switch-company`) exigen `role === 'sistemas'` explícitamente.
- **`api/v1/test-create-company` es un directorio vacío** — no es una ruta expuesta.
- **Rutas sin `verifyAuth`, evaluadas una a una:** `auth/login`, `auth/register`, `setup/status` (públicas por diseño); `setup/company|fiscal|printing|delivery` son validadores Zod sin acceso a BD; `setup/recover` está protegida por `RECOVERY_SECRET_KEY` + comprobación anti-puerta-trasera; `documents/[uuid]/download` valida firma HMAC + caducidad. **La única problemática es `storefront/auth/register`** (ISO-02).
- **Detección de reutilización de refresh token** implementada correctamente (`auth.ts:166-181`).

---

## CONTEO

| | |
|---|---|
| Rutas API (`route.ts`) revisadas | **177** |
| Cláusulas `.where()` analizadas | 344 (rutas) + 262 (repositorios) = **606** |
| Tablas del esquema analizadas | 89 (71 con `company_id`, 42 con `modo`) |
| **Rutas sin hallazgos** | **106** |
| Rutas sin comprobación de autorización (ISO-03) | 54 |
| Rutas sin `verifyAuth` (10 justificadas; 1 = ISO-02) | 11 |
| Rutas con referencias cruzadas o `modo` inconsistente | 6 |
| **Total de rutas con al menos un hallazgo** | **71** |

---

## NO VERIFICADO

1. **Ninguna prueba dinámica.** No se levantó la aplicación ni se emitió una petición HTTP. Los escenarios de explotación de ISO-02, ISO-04 e ISO-05 son deducciones del código.
2. **No se consultó la base de datos** (sin conectividad desde el entorno de auditoría). No se sabe si `0024`/`0026` están aplicadas, si `tenant_isolation_policy` existe hoy, ni si el rol del pooler tiene `BYPASSRLS`.
3. **No se cuantificó el daño existente**: cuántas filas con referencias cruzadas hay ya en `invoices`, `quotes`, `customer_receipts` o `financial_movements`.
4. **`src/actions/` (Server Actions) queda fuera de esta fase.** Es otra superficie invocable desde el navegador y **no se auditó**.
5. **`src/services/` se revisó de forma dirigida, no exhaustiva.** No se auditaron `payrollCalculationService`, `dgii/*`, `jobs/*`, `geminiService`, `googleContactsService`, `kmsService`, `storageService`, `print/*`.
6. **`/ai/chat`, `/agent/proposals/generate` y `/ocr`** se comprobaron sólo en autenticación y ámbito de empresa; no se analizó inyección de prompt ni qué datos salen a proveedores externos.
7. **No se verificó `INTERNAL_API_KEY` en el entorno desplegado** (sólo su presencia en el `.env` local; no se leyó su valor).
8. **`rateLimiter.ts` no se auditó** más allá de qué rutas lo invocan.
9. **No se verificaron los índices únicos reales en BD.** Los comentarios de `permissions.ts:68-72` justifican la ausencia de filtro por empresa apoyándose en índices únicos que no se pudieron confirmar contra el esquema físico.
