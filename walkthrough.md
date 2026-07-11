# Walkthrough - Implementación de Aislamiento Sandbox vs Producción (Checkpoint 3)

Hemos completado exitosamente la implementación del aislamiento total entre el **Modo Producción** y el **Modo Prueba (Sandbox)**, asegurando que ninguna operación financiera o transaccional afecte la contabilidad real de producción, y garantizando la validez fiscal y de integración con la DGII.

## Cambios realizados

### 1. Base de Datos y Esquemas Drizzle
- **Aislamiento Físico Transaccional**: Se añadió la columna `modo` (enum `environment_mode`) a todas las tablas transaccionales en:
  - Facturación (`invoices`, `quotes`, `ecfSequences`, `quoteSequences`, `deliveryNotes`, etc.)
  - Contabilidad (`journalEntries`, `journalEntryLines`, `accountsReceivable`, `accountsPayable`, etc.)
  - Caja (`cashMovements`, `cashSessions`, etc.)
  - Bancos (`bankTransactions`, etc.)
  - Inventario (`inventoryLevels`, `inventoryMovements`, `inventoryTransfers`, etc.)
  - Recursos Humanos (`payrolls`, `payrollDetails`, `overtimeRecords`, etc.)
- **Índices Compuestos**: Se crearon índices compuestos únicos que incluyen `modo` para evitar colisiones lógicas en secuencias y códigos transaccionales.

### 2. Seguridad Activa (Row Level Security - RLS)
- **Migración Directa (`0026_glorious_serpent_society.sql`)**: Diseñada y ejecutada una migración para poblar la columna `modo` en los registros preexistentes e inyectar políticas de RLS dinámicas en todas las tablas transaccionales del tenant que validan:
  - `company_id = app.current_company_id`
  - `modo = current_setting('app.current_environment')`
- **Integración con Drizzle y Sesiones**: El helper `withTenantContext` y las transacciones setean automáticamente el ambiente en PostgreSQL al inicio de cada operación, asegurando el doble aislamiento.

### 3. Evitación de Envíos DGII y mSeller TesteCF
- **Candado de Certificación**: En `InvoiceSubmissionService`, se inyectó una validación que fuerza el entorno a `TesteCF` (de simulación) si el registro tiene `modo = 'PRUEBA'`, previniendo que cualquier transacción de prueba adquiera validez fiscal real.
- **Búsqueda por Ambiente**: Las secuencias e-CF y la resolución de facturas modificadas para notas de crédito/débito buscan y aíslan secuencias aplicando filtros según el modo activo.

### 4. Sincronización Dinámica de Entorno (Settings-Driven)
- **Vinculación Estricta a Ajustes**: El ambiente de trabajo se deriva y sincroniza automáticamente desde el selector **Ambiente de Facturación (e-CF)** en la pestaña **Configuración Empresa** de `/dashboard/settings`.
- **Detección Reactiva**: Al guardar los ajustes, el frontend despacha el evento `'company-settings-updated'`. `DashboardLayout` detecta el cambio de ambiente, actualiza la cookie `cf_environment` y refresca el panel de forma automatizada y transparente.
- **Cabecera Limpia en Producción**: 
  - Si el ambiente de la empresa es **Producción**, la cabecera se muestra 100% limpia sin ninguna barra o badge de color, optimizando el espacio de pantalla (`pt-14`).
  - Si el ambiente de la empresa es **Pruebas**, se inyecta la franja de peligro superior animada roja/naranja y un badge indicador de "SANDBOX" en el navbar con acceso informativo que explica la vinculación del ambiente.

### 5. Aislamiento de Métricas y Dashboards
- **Aislamiento en Dashboard Principal**: Refactorización de `DashboardRepository` y su API route para aceptar `session.modo` y filtrar todas las consultas a `invoices` y `checks` utilizando el helper `withTenantMode`, asegurando que el inicio sólo muestre las ventas y estadísticas del ambiente activo.
- **Aislamiento en Dashboard Financiero**: Modificación de `FinancialRepository.getFinancialDashboard` y su API route para segmentar las consultas SQL crudas y Drizzle (`accounts_receivable`, `accounts_payable`, `invoices`, `expenses`) mediante `modo`, previniendo que se muestren saldos o facturas de producción en el sandbox.
- **Aislamiento en Reconstrucción Chronológica (Seeder)**: Actualización de `FinancialMovementService.autoSeedMovements` para que ejecute la verificación de existencia, la lectura de orígenes y la inyección de balances progresivos en aislamiento de `modo`.

### 6. Corrección en Propagación del Proxy (Bypass de Filtro)
- **Corrección en Access Token Block (`src/proxy.ts`)**: Se solucionó un error crítico por el cual la cookie `cf_environment` no se propagaba como la cabecera `x-environment` en los requests HTTP que se ejecutaban bajo un Access Token JWT ordinario válido. Esto causaba que el backend interpretara por defecto que la petición ocurría en `PRODUCCION`. Se inyectó la cabecera `x-environment` en el clonador del request de la Sección A para garantizar el filtrado RLS en todas las llamadas API del cliente.

### 7. Limpieza y Borrado de Datos de Prueba (Sandbox)
- **Endpoint de Purga (`clear-sandbox/route.ts`)**: Implementación del endpoint POST `/api/v1/admin/companies/[id]/clear-sandbox` restringido mediante tokens al rol de `sistemas`. Este endpoint ejecuta un borrado transaccional Postgres ordenado en cascada para limpiar todas las tablas transaccionales de prueba (`modo = 'PRUEBA'`) de la empresa seleccionada, reseteando balances y cachés de Redis.
- **Botón y Diálogo Interactivos (`page.tsx`)**: Integración del botón de limpieza en la vista de control `/dashboard/admin/companies`. Cuenta con un `prompt` de confirmación que obliga al administrador de sistemas a escribir exactamente el nombre de la empresa antes de disparar el proceso, evitando borrados accidentales de información.
- **Aislamiento y Filtrado en Compras/Gastos**: Se inyectó el filtrado de entorno (`modo = session.modo`) en los endpoints GET/POST/PUT/DELETE de compras (tanto listados principales como operaciones sobre elementos individuales `/api/v1/expenses/[id]`). Esto impide que se mezclen compras de Producción y Pruebas en el historial, y previene la alteración mutua de inventario, asientos contables o cuentas por pagar.

---

## Verificación

- **Compilación de TypeScript**: Se corrió `npx tsc --noEmit` de forma exitosa y el proyecto compila con cero errores.
- **Suite de Pruebas Unitarias**: Se ejecutó `npm test` y todas las pruebas de cálculo de nómina y prestaciones pasaron exitosamente (16/16).
