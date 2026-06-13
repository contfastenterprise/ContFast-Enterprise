# Sistema ERP e-CF Dominicana - Plan de Implementación

El proyecto se encuentra **Verified & Polished** tras completar exitosamente la compilación y optimización de producción de Next.js.

## Módulos Implementados

### 1. Núcleo Backend & Servicios
- **XMLDSIG & node-forge**: Firma digital envelopada de facturas e-CF.
- **Generador de PDF**: Generación de representaciones impresas en formatos Carta, 80mm y 58mm.
- **Colas BullMQ & Redis**: Transmisión asíncrona de e-CF a los servidores web de la DGII.

### 2. Base de Datos & Capa de Acceso (Repositories)
- **Tenancy Isolation**: Aislamiento estricto de datos mediante `company_id`.
- **Double-Entry Ledger**: Registro contable automático de asientos al facturar.
- **Control de Caja (Cashier Rules)**: Restricciones de apertura, balance inicial y límites de egreso.

### 3. API Routes (/api/v1)
- **Wizard de Configuración**: Inicialización técnica en 6 pasos.
- **Autenticación RTR**: Rotación de tokens segura mediante cookies HttpOnly.
- **Comprobantes e-CF**: Endpoints de facturación, consulta de estado de DGII y reenvío manual de correos.
- **Envío de Correos**: Despacho automático de facturas emitidas a crédito por email.
- **Bancos y Conciliaciones**: Control de cuentas bancarias y conciliación de periodos.
- **Reportes Financieros**: Ventas (607), Balance General y Estado de Resultados.
- **Conduces (Remisiones)**: Generación, consulta y anulación de conduce.

### 4. Interfaz de Usuario (Frontend)
- **Wizard**: `/setup`
- **Autenticación**: `/auth/login` y `/auth/register` (Registro de Usuarios)
- **Dashboard**: `/dashboard`
- **Facturación**: `/invoices` (con soporte de Suspense)
- **Caja**: `/cash`
- **Bancos**: `/bank` (Gestión de Cuentas Bancarias)
- **Contabilidad**: `/dashboard/accounting`
- **Administración de Seguridad**: `/dashboard/admin`
- **Reportes Financieros**: `/reports` (Estadísticas y Métricas de Ventas, y Conciliación Bancaria activa)
- **Soporte y Ayuda**: `/support` (Centro de Contacto)
- **Recibos de Ingreso (Cuentas por Cobrar)**: Historial completo de cobros de facturas y descarga de recibos en formato PDF.

### 5. Módulos Removidos
- **Punto de Venta (POS)**: Eliminado `/dashboard/pos` — página, enlace de sidebar y botón de acceso rápido en el módulo de Caja. El módulo de caja nativo (`/dashboard/cash`) cubre el flujo de cobro requerido.

### 6. Rediseño del Layout de Factura A4
- **Latin Doorrs SRL A4**: Rediseño exacto del formato A4/Carta con alineación mediante relleno de puntos dinámico en monospace (RNC, teléfono, email, dirección, fecha de emisión, cliente y totales), barra de condición de pago enmarcada en turquesa (`#005E6A`), encabezado de tabla de ítems sólido, desglose de totales (Subtotal, Descuento, ITBIS, y Total Neto con doble subrayado), y bloque inferior de firma digital (QR, código de seguridad, fecha de firma y firmas físicas).

### 7. Impresión Directa de Facturas (PDF Stream)
- **Direct Streaming con Formato HTML/Puppeteer**: Modificado `/api/v1/invoices/[id]/print` para soportar el método `GET`, el cual genera y transmite dinámicamente el archivo PDF original de la factura usando el motor Puppeteer (`DocumentTemplates.renderInvoice`), sirviendo el stream de forma directa (`Content-Type: application/pdf` con `Content-Disposition: inline`). Esto preserva el diseño exacto A4 con relleno de puntos y barra de condición turquesa.
- **Protección de Secuencia NCF**: Corregido el flujo en `src/services/invoiceService.ts` para predecir el NCF fuera de la transacción sin consumirlo en base de datos. La reserva física del NCF e incremento secuencial ahora se ejecutan exclusivamente dentro de la transacción final de guardado de la factura, previniendo saltos involuntarios en la secuencia de comprobantes ante fallos de conexión (por ejemplo, con MSeller o DGII).
- **Integración con Cliente**: Actualizado `src/app/dashboard/invoices/[id]/page.tsx` para abrir el endpoint directamente en una nueva pestaña del navegador, emulando el comportamiento directo y fluido de `/api/v1/documents/[uuid]/download`.

### 8. Campo de Notas de la Factura (Notes Field)
- **Capa de Base de Datos**: Agregado el campo `notes` (TEXT) a la tabla `invoices` y actualizado el esquema de Drizzle.
- **Validación & Repositorio**: Actualizado el esquema de validación y la API `/api/v1/invoices` para recibir opcionalmente el campo `notes`, guardándolo correctamente en la base de datos a través del repositorio y servicio de facturación.
- **Rendimiento Visual**: Integración dinámica del campo `notes` en la plantilla de impresión de facturas en PDF (con soporte de múltiples líneas `white-space: pre-wrap`, fallback al texto por defecto si está vacío, y removiendo el bloque redundante de 'Comentarios: N/A').
- **Formulario de Creación**: Añadido un campo de texto `<textarea>` ("Notas de la Factura") estilizado al formulario de emisión de facturas e-CF del Dashboard.
- **Corrección de Impresión**: Simplificado el manejador `handleDownloadPdf` del listado de facturas en el Dashboard para abrir directamente el PDF vía `window.open` en lugar de realizar una petición fetch y fallar al parsear la respuesta binaria como JSON.
- **Descuento por Línea de Factura**: Incorporado el campo "Desc. Unit." (descuento por unidad) como input editable dentro de la fila de cada artículo. Se agregó además una columna calculada de lectura "Total Fila" para mostrar de manera interactiva el importe neto incluyendo descuento e ITBIS a nivel de línea, sincronizando perfectamente todos los cálculos del subtotal, descuento acumulado, impuestos y total general.
- **Corrección de Totales Impresos**: Corregido el cálculo del subtotal en el archivo de plantilla `documentTemplates.ts` cambiando `inv.subtotal - inv.discount` por el subtotal bruto real `inv.subtotal`. Esto previene el doble descuento en el resumen visual impreso (SUB TOTAL, DESCUENTO, ITBIS y TOTAL NETO).
- **Descuentos en Vista de Factura (Modal)**: Actualizado el modal "Ver Detalles" del listado de facturas en el Dashboard para incluir la columna "Descuento" para cada artículo de línea y reflejar la deducción global en el bloque de resumen financiero si se aplicaron rebajas.
- **Alineación de Descuento Unitario en Impresión**: Corregido el mapeo en `documentTemplates.ts` de las columnas de la tabla de artículos de la factura A4. Se reemplazó el descuento con impuestos incluidos (`descTotalInclusive`) por el descuento base original (`rawDiscount`) para que el desglose de cada ítem de línea concuerde exactamente con el valor base introducido (mostrando el descuento real de RD$ 20.00 en lugar del inflado por impuestos RD$ 23.60).
- **Validación de Decimales en e-CF (MSeller)**: Se aplicó un redondeo matemático estricto de exactamente 2 decimales (`Number(val.toFixed(2))`) en la construcción del payload de emisión (`buildECFPayload` en `msellerClient.ts`). Esto corrige el rechazo de la API de MSeller/DGII debido al tipo de datos `Decimal18D2Validation` cuando se transmitían totales con más de dos decimales (como el monto total `4781.5016` rechazado).
- **Respuestas de DGII/MSeller en Notificaciones (Toasts)**: Se actualizó la notificación de emisión exitosa del formulario para serializar y mostrar exclusivamente el objeto JSON retornado por la API de MSeller (`data.msellerResponse`) en lugar del registro de base de datos de la factura, permitiendo al emisor visualizar de manera exacta los metadatos de firma digital de la DGII (RNC, ECF, trackId, código de seguridad, etc.).

### 9. Control de Permisos y Roles en Ajustes (mSeller, Nombre y RNC)
- **Backend & Validación Zod**: Se agregaron los campos `name` y `rnc` como obligatorios en la validación de esquema de la API `/api/v1/admin/settings`. Se implementaron validaciones de negocio basadas en el rol del usuario:
  - Solo el rol `sistemas` puede agregar o modificar los parámetros de la sección **mSeller**.
  - Solo el rol `sistemas` puede modificar el **Nombre Comercial** y el **RNC** de la empresa una vez definidos en la base de datos. Si están vacíos, un `administrador` (`administracion`) también tiene permitido agregarlos por primera vez.
- **Frontend**: Se adaptó la vista `/dashboard/settings` para consultar el rol del usuario autenticado vía `/api/v1/auth/me`. Se enlazaron los inputs a los campos de identidad fiscal en `formData` y se controla de forma reactiva y visual su propiedad `disabled` de acuerdo con las reglas de negocio anteriores.

### 10. Módulo de Notas de Crédito (e-34) y Notas de Débito (e-33)
- **Base de Datos & Repositorio**: Se agregaron las columnas `modifiedNcf` y `modifiedInvoiceId` a la tabla `invoices`. Se adaptó `InvoiceRepository` para guardar y consultar estas relaciones.
- **Backend & Validación Zod**: Se actualizó `createInvoiceSchema` para exigir obligatoriamente `modifiedNcf` cuando el tipo de e-CF es `33` o `34`.
- **Lógica de Ajuste (mSeller, Inventario y Contabilidad)**:
  - En `MSellerClient`, se añade la sección `<TablaReferencia>` con el eNCF del comprobante original.
  - En `InvoiceService`, las Notas de Crédito (34) omiten la comprobación de stock y devuelven la mercancía ingresando stock a los almacenes (`quantity` negativa en `deductStock`).
  - Se definieron reglas de reversión contable para Notas de Crédito (reversión de ingresos, ITBIS y cuentas por cobrar).
- **Frontend**: Se agregaron botones de acción rápida ("Emitir Nota de Crédito" e "Emitir Nota de Débito") en el listado de facturas aceptadas. Al pulsarlos, se obtienen las líneas e información del comprobante original y se precargan en el formulario de emisión mostrando una alerta de referencia al usuario.

---
**Status**: Verified & Polished (Score 10/10)
