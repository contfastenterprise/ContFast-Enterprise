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
