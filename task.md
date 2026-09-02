# Tareas del Módulo Financiero de Estados de Cuenta

## 1. Base de Datos y Capa de Datos
- [x] Definir tabla `financialMovements` en `src/db/schema/accounting.ts`.
- [x] Ejecutar migración local / push de Drizzle para actualizar la base de datos PostgreSQL.
- [x] Crear repositorio `src/repositories/financialRepository.ts` con consultas avanzadas de estados de cuenta, balances y antigüedad de saldos.

## 2. Capa de Servicios e Integración
- [x] Crear servicio `src/services/financialMovementService.ts` con la lógica de negocio para registrar movimientos, calcular balance acumulado progresivo y autoseed incremental.
- [x] Integrar registro de movimientos en `src/services/invoice/invoiceDbBooker.ts` (facturación, notas de crédito/débito).
- [x] Integrar registro de movimientos en `src/services/expenseService.ts` (compras).
- [x] Integrar registro de movimientos en `src/repositories/arRepository.ts` (cobros).
- [x] Integrar registro de movimientos en `src/services/apService.ts` (pagos).

## 3. Seguridad y Permisos
- [x] Añadir mapeos de rutas para `/dashboard/financial%` en `src/constants/defaultMappings.ts`.
- [x] Modificar `buildSidebar` en `src/utils/rbacHelpers.ts` para restringir visibilidad a roles `sistemas`, `administracion` y `contabilidad`.

## 4. API Endpoints
- [x] Crear `GET /api/v1/financial/statements/customers/[id]` para datos de clientes.
- [x] Crear `GET /api/v1/financial/statements/suppliers/[id]` para datos de suplidores.
- [x] Crear `GET /api/v1/financial/dashboard` para métricas globales de CxC/CxP.
- [x] Crear endpoints de impresión en PDF con Puppeteer y plantillas HTML premium.

## 5. Vistas del Frontend (UI Premium)
- [ ] Crear vista del Dashboard Financiero en `/dashboard/financial/page.tsx`.
- [ ] Crear vista de Estados de Cuenta de Clientes en `/dashboard/financial/customers/page.tsx`.
- [ ] Crear vista de Estados de Cuenta de Suplidores en `/dashboard/financial/suppliers/page.tsx`.

## 6. Verificación y Pruebas
- [x] Validar compilación de TypeScript (`npx tsc --noEmit`).
- [ ] Validar construcción de producción de Next.js (`npm run build` o `npx next build`).
- [ ] Crear y ejecutar script de seeding inicial/histórico de movimientos y verificar coherencia de saldos.

## 7. Pantalla de Carga (PageLoader) Post-Login con Logo
- [x] Crear componente reusable `src/components/ui/PageLoader.tsx` ('use client') con Framer Motion, next/image priority y colores `#003366` y `#C59B27`.
- [x] Actualizar `POST /api/v1/auth/login` para devolver `companyLogo` y `companyName` si están configurados en BD.
- [x] Integrar navegación inmediata sin demoras artificiales en `src/app/auth/login/page.tsx` usando `sessionStorage`.
- [x] Mantener `PageLoader` activo continuamente en `src/app/dashboard/layout.tsx` hasta finalizar la inicialización y carga completa de la página principal.
- [x] Garantizar que si la empresa NO tiene logo configurado en BD, el comportamiento continúe estándar sin activar la transición.

---

# Auditoría de aislamiento — estado al 29/08/2026

## 8. Seguridad: acceso público (CERRADO)
- [x] **Los roles `anon` y `authenticated` tenían DELETE/INSERT/UPDATE/SELECT/TRUNCATE sobre 92 tablas de `public`**, y 80 sin RLS. `anon` es el rol de la clave pública de Supabase. `scratch/cerrar_acceso_anon.sql` lo dejó en 0.
- [x] Se retiró también el `ALTER DEFAULT PRIVILEGES` que hacía que **cada tabla nueva heredase los permisos** (así entraron `invoice_sequences` y `bank_account_balances`). Comprobado: una tabla creada por `postgres` nace con 0 permisos.
- [ ] **Pendiente y urgente**: mirar Settings → API → Data API. Si estaba activa con `public` expuesto, revisar registros de PostgREST (retención: 1 día en plan gratuito) y rotar las claves.
- [ ] Quedan 3 entradas en `pg_default_acl` a nombre de `supabase_admin`. No afectan a las migraciones propias. `scratch/cerrar_acceso_anon_admin.sql` lo intenta.

## 9. Ledger de migraciones (A MEDIAS)
- [x] Journal reparado: 31 → 37 entradas. Se registraron 0025, 0032, 0033, 0034, 0035, 0036.
- [x] `0032` movida al FINAL del journal: no está aplicada, y así `drizzle-kit migrate` la aplicará cuando se decida en vez de quedar enterrada.
- [x] `0020_setup_storage_bucket` se deja FUERA a propósito: escribe en `storage.buckets`, que sólo existe en Supabase, y haría fallar toda migración en local y CI.
- [ ] **Aplicar `0035_envio_dgii_por_intento`** (dos `CREATE INDEX IF NOT EXISTS`). Sin esto quedaría enterrada.
- [ ] **Ejecutar `scratch/reparar_ledger_migraciones.sql`** y comprobar con `scratch/diagnostico_migraciones.sql`: debe quedar 1 pendiente (la 0032).
- Motivo: el ledger se quedó en la 0007 y `drizzle-kit migrate` intentaría reaplicar 29. Drizzle sólo compara el `created_at` más reciente — un hueco en medio no se recupera nunca.

## 10. Aislamiento estructural (SIGUIENTE)
- [ ] `0024_enable_rls_policies`: está escrita, es correcta y es permisiva cuando falta el contexto (no rompe nada). Nunca se aplicó. `withTenantContext` existe en `src/db/index.ts` y **no lo llama nadie**.
- [ ] `0032_aislamiento_estructural`: 57 claves foráneas compuestas. Correr antes `scratch/auditoria_aislamiento.sql`.

## 11. Barrido de entorno (CERRADO)
- [x] Grupos E a I: caja, banco, contabilidad, conduces y cierre. 28 bancos de prueba en `scratch/`, verdes en cualquier orden.
- [x] `modo` obligatorio en 17 tipos de entrada y en las 5 funciones de `inventoryService` (va en 2ª posición: no puede ser opcional ahí).
- [x] Migraciones nuevas: 0033 (`tracks_inventory`), 0034 (`invoice_sequences`), 0035 (envíos DGII), 0036 (`bank_account_balances`).

## 12. Pendientes menores
- [ ] Once unidades contadas sin producto en el catálogo (roble 85×210, 80×210, 102×200, 106×200, "Blanca especial").
- [ ] F1-05 (`'Aceptado'` por defecto de la DGII), F1-06 ("Latin Doors SRL" fijo en 17 ficheros), F1-07 (formatos 606/607).
- [ ] Deuda: 10 de 12 bancos leen el fuente sin quitar comentarios. Riesgo de verde falso; medido, hoy no hay ninguno.
- [ ] Rama `?token=` retirada del PDF de facturas: nadie firmaba esos tokens y se saltaba `enforcePermission`.
