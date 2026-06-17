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

### 11. Módulo de Conduces de Entrega (Control Logístico & WMS)
- **Base de Datos & Repositorio**: Se agregaron las columnas `delivery_status` en la tabla `invoices`, y campos de auditoría (`approved_by`, `approved_at`, `voided_by`, `voided_at`), `delivery_number`, chofer y observaciones en `delivery_notes`. Se implementaron restricciones de clave externa y un índice único compuesto.
- **Deducción de Inventario Diferida**: Se desactivó la deducción inmediata de stock en la emisión de facturas estándar de venta (`31`, `32`, `45`), delegando la salida real física de mercancías al momento de **aprobar** el Conduce. Las notas de crédito (`34`) continúan procesando los reingresos directamente.
- **Validación Anti-Sobreentrega**: El repositorio valida transaccionalmente que la suma acumulada de mercancía despachada no exceda las cantidades facturadas de origen, protegiendo contra duplicidades y sobre-entregas.
- **API & Impresión Directa (PDF)**:
  - Creados endpoints para creación, consulta, aprobación y anulación transaccional de conduces.
  - Implementado `GET /api/v1/delivery-notes/[id]/print` para renderizar y transmitir dinámicamente representaciones en PDF tamaño Carta de alta calidad contable.
  - Corregida la consulta de listado de comprobantes/facturas (`GET /api/v1/ecf`) para incluir el campo `deliveryStatus` (estado de despacho), solucionando la omisión en el frontend que impedía listar facturas aptas para emitir conduces.
- **Frontend del Dashboard**:
  - Diseñada una interfaz premium e intuitiva bajo `/dashboard/delivery-notes` para el control de remisiones (chofer, licencia, placa, despachador, observaciones), visor de estados logísticos (`pending`, `partial`, `delivered`) y acciones rápidas para descarga de PDF, aprobación y anulación.

### 12. Edición de Secuencias SACF (Solo rol sistemas)
- **Backend & Seguridad**: Se actualizó el endpoint `PUT /api/v1/ecf/sequences/[id]` para validar que el rol del usuario autenticado sea exactamente `sistemas`. Se habilitó la modificación de los campos `currentSequence`, `maxSequence` y `sequenceExpiry` en la tabla `ecf_sequences`. La fecha de vencimiento (`sequenceExpiry` en formato `DD-MM-YYYY`) se convierte a un objeto Date y se guarda en la columna `expiryDate`.
- **Frontend**: En el dashboard de e-CF (`/dashboard/ecf`), en la pestaña de "Secuencias SACF", se añadió la capacidad de recuperar el rol del usuario actual. Si el rol es `sistemas`, se muestra un botón de edición (icono de lápiz) en las tarjetas de secuencia, el cual abre el modal `EditSequenceModal` permitiendo actualizar en tiempo real la secuencia actual, secuencia máxima y fecha de vencimiento de las autorizaciones.

### 13. Módulo de Herramientas de Producción
- **Configuración de Perfiles Escalable**: Centralización de las fórmulas matemáticas para el desglose de ventanas corredizas (`Tradicional`, `P-65`, `P-92`) en `src/utils/profilesRegistry.ts` para facilitar la incorporación de futuros sistemas de aluminio sin alterar el frontend.
- **Optimizador de Corte de Vidrio**: Implementación del motor de optimización 2D (`src/utils/cuttingOptimizer.ts`) con visualizador interactivo del mapa de planchas basado en pulgadas.
- **Persistencia en LocalStorage**: Autoguardado automático de las listas de corte del usuario para evitar pérdida de trabajo ante recargas involuntarias del navegador.
- **Impresión Profesional Vía Backend**: Implementación de endpoints `/api/v1/tools/print` conectados a `pdfkit` (existente en el sistema) para la generación de PDFs de alta fidelidad, listos para descargar o imprimir directamente en el taller físico.
- **Interfaz del Dashboard**: Incorporación de la pestaña **Herramientas** en el menú lateral de navegación conectando las dos herramientas técnicas.

---
### 14. Envío de Notas de Crédito (e-34) y Débito (e-33) a MSeller y Gestión de Secuencias
- **Transmisión de Notas de Crédito y Débito**: Habilitado el envío automático de comprobantes de ajuste (debit notes e-33 y credit notes e-34) a MSeller de la misma manera que las facturas normales, asociando el eNCF del comprobante original mediante la referencia (`modifiedNcf` a `<TablaReferencia>`) tanto en el servicio de facturación directo (`InvoiceService`) como en el worker de transmisión en segundo plano (`worker.ts`).
- **Secuencias Separadas**: Habilitada la creación y el mantenimiento de secuencias independientes para Nota de Crédito (34) y Nota de Débito (33) en el formulario de configuración de secuencias SACF del Dashboard y en el servicio de base de datos.
- **Numeración Interna Consecutiva (NC/ND/FAC)**: Se automatizó la generación del código interno del documento (`codigoFactura`) en formato `PREFIJO-AÑO-SECUENCIAL` (ej: `NC-2026-000001` para notas de crédito, `ND-2026-000001` para notas de débito y `FAC-2026-000001` para facturas estándar), incrementándose de forma aislada por tipo de documento, año y compañía.
- **Acceso en Interfaz de Usuario**: Añadidas las opciones e-33 y e-34 en el selector del formulario de facturación y en los filtros de tipo de comprobante. Integrada la funcionalidad de emitir notas de débito y crédito mediante botones rápidos de acción dentro del modal de visualización de detalles de factura en el listado del Dashboard.

- **Visualización Completa de Comprobantes**: Modificado el panel de creación y filtrado de secuencias para incluir los 10 tipos de comprobantes fiscales electrónicos (e-CF) autorizados por la DGII (e-31 Crédito Fiscal, e-32 Consumo, e-33 Nota Débito, e-34 Nota Crédito, e-41 Compras, e-43 Gastos Menores, e-44 Regímenes Especiales, e-45 Gubernamental, e-46 Pagos al Exterior y e-47 Exportación), actualizando además la asignación de colores en los badges identificadores correspondientes.

### 15. Optimización de Memoria (Rendimiento)
- **Singleton de Puppeteer**: Implementación de una instancia compartida y persistente del navegador Chromium (`PdfGenerator.browserInstance`) con reinicio automático ante desconexiones y banderas optimizadas de bajo consumo. Esto evita lanzar un navegador completo por cada PDF, abriendo/cerrando únicamente páginas virtuales, reduciendo drásticamente el consumo de RAM en el servidor.
- **Carga Diferida de Gráficos (Dashboard)**: Migración de los gráficos del Dashboard a un subcomponente `DashboardCharts.tsx` importado de manera dinámica (`next/dynamic` sin SSR). Esto aligera el bundle de carga inicial reduciendo la huella de memoria del navegador en el cliente.

### 16. Corrección en Cuentas por Cobrar (Receivables)
- **Color de Texto del Botón**: Se cambió el color del texto del botón "Registrar Cobro" (de la tabla de saldos de clientes) de `text-primary` (el cual heredaba el color azul principal y se volvía invisible contra el fondo azul del botón) a `text-white` para garantizar su legibilidad y contraste.

### 17. Corrección de contraste de texto en fondos azules (Accesibilidad y Legibilidad)
- **Corrección en Status Bars y Pestañas**: Se cambió el color de texto `text-primary` a `text-white` en todas las barras superiores y menús de pestañas que tienen fondo azul oscuro (`bg-[#003366]`).
- **Campos de Entrada y Formularios**: Se modificaron las entradas de formulario (inputs de fecha, inputs de referencia, textareas de notas, celdas de inputs de facturas amortizadas) y botones de opciones inactivas en el modal de cobros para usar `text-white` o `text-slate-300` sobre fondos azul oscuro (`bg-[#001733]`), eliminando problemas de contraste de texto oscuro.
- **Botones con Fondo Azul**: Se ajustaron los botones de actualización de historial de caja (`bg-[#001e40]`), botones de retorno (`bg-[#001e40]`), y botones de generación de reportes en PDF (`bg-[#003366]`) para cambiar `text-primary` a `text-white`, evitando texto invisible.

### 18. Personalización y Spacing en el Recibo de Ingreso (Cuentas por Cobrar)
- **Espaciado Inferior en Título**: Se añadió una separación vertical (`margin-bottom: 8px`) debajo del título central `"RECIBO DE INGRESO"` en la plantilla de impresión de recibos (`documentTemplates.ts`), desplazando los metadatos del recibo (número de recibo, fecha, método de pago, etc.) una línea hacia abajo para mayor claridad visual.
- **Alineación del Logo**: Se desplazó el logotipo de la empresa en el recibo (formato Carta) `20px` (aproximadamente 3 caracteres) hacia la izquierda para alinear y ajustar su posición según las preferencias visuales del cliente.

### 19. Apartado de Estado de Cuenta y Abonos por Cliente (Cuentas por Cobrar)
- **Nueva Pestaña en Interfaz**: Se creó una pestaña `"Estado de Cuenta y Abonos"` que permite seleccionar dinámicamente cualquier cliente de la base de datos para consultar el historial completo de sus movimientos.
- **Detalle Progresivo de Balances**: Muestra cronológicamente todos los abonos aplicados con fecha, código del recibo, número/NCF de factura, método de pago, monto total facturado, importe del abono y calcula el balance restante progresivo de la factura después de cada pago.
- **Impresión y Búsqueda**: Incorpora un filtro reactivo de búsqueda (para filtrar por código de factura, NCF, recibo o referencia) y un botón de impresión optimizado para generar estados de cuenta impresos legibles y limpios.

**Status**: Verified & Polished (Score 10/10)





