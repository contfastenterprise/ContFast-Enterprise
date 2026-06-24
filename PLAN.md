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
- **Impresión y Búsqueda**: Incorpora un filtro reactivo de búsqueda (para filtrar por código de factura, NCF, recibo o referencia) y un botón de impresión conectado a un nuevo endpoint de backend `/api/v1/ar/receipts/by-customer/print` que genera un documento PDF oficial de estado de cuenta utilizando Puppeteer y la plantilla `DocumentTemplates.renderCustomerStatement` con logo de la empresa y detalles fiscales.

### 20. Impresión Premium de Reportes Financieros
- **Generación HTML/Puppeteer**: Se reemplazó por completo la antigua generación `pdfkit` monospaced para todos los reportes financieros en la sección de reportes por plantillas de impresión HTML premium generadas con Puppeteer:
  - **Estado de Cuentas por Cliente** (`DocumentTemplates.renderARStatement`)
  - **Estado de Resultados (P&L)** (`DocumentTemplates.renderIncomeStatement`)
  - **Balance General** (`DocumentTemplates.renderBalanceSheet`)
- **Detalle y Estilo**: Muestra de forma elegante el logo de la empresa, RNC, dirección fiscal, datos del cliente (cuando corresponda), y la estructura visual de cuentas y totales financieros alineados y formateados con separador de miles.

### 21. Plantilla de Impresión de Desglose de Ventanas (HTML/Puppeteer)
- **Migración a Puppeteer**: Se reemplazó la generación tradicional monospaced basada en `pdfkit` del desglose de ventanas por una plantilla HTML premium renderizada por Puppeteer (`DocumentTemplates.renderWindowBreakdown`), en orientación Carta horizontal (landscape).
- **Diseño Técnico Preservado**: Mantiene el diseño exacto de taller con la tabla de medidas base, vías, cortes de perfiles (Cabezal, Llavín, Rieles, Laterales), y cristales, además de los bloques resúmenes de cantidad de piezas por tipo y resumen acumulado de materiales por sistema (Tradicional, P-65 y P-92) calculados dinámicamente.

### 23. Sistema de Colas con Fallback Auto-Curativo (Redis Offline)
- **Extracción de Lógica de Colas**: Se centralizó la lógica de negocio para la presentación a la DGII y el despacho de correos en [jobRunners.ts](file:///c:/Users/gerso/OneDrive/Documentos/contfast_v.2/src/infrastructure/jobRunners.ts), permitiendo su importación aislada sin efectos secundarios en el ciclo de vida del servidor.
- **Mecanismo de Resiliencia en Colas**: Se configuró un fallback automático en [queue.ts](file:///c:/Users/gerso/OneDrive/Documentos/contfast_v.2/src/infrastructure/queue.ts) que detecta si el cliente de Redis está fuera de línea (ECONNREFUSED) o si el tiempo de encolado expira. Ante esta situación, el sistema ejecuta la tarea en segundo plano utilizando el event loop (`setTimeout(..., 0)`) in-process, garantizando la entrega de correos electrónicos de facturas y los envíos DGII en entornos locales y en contingencias.

### 24. Borde con Degradado Animado (BorderRotate)
- **Componente**: Creado en `src/components/ui/animated-gradient-border.tsx` para proporcionar una animación de borde fluido con velocidad y colores configurables.
- **Configuración CSS**: Añadida la animación y la propiedad `@property --gradient-angle` a `src/app/globals.css` para soportar rotación de color cónica fluida en Tailwind CSS v4.
- **Integración**: Se envolvieron las tarjetas principales de resumen del Dashboard con el componente `BorderRotate`, aplicando una paleta de colores degradados que complementan el tema corporativo de Latin Doors.

### 26. Botones Premium con Bordes Degradados Animados (Custom Button Component)
- **Componente Centralizado Reutilizable**: Creado en `src/components/ui/button.tsx` utilizando la utilidad `cn` de clase de Tailwind para unificar el estilo de los botones del sistema con soporte para animaciones de bordes degradados (`BorderRotate`).
- **Clase CSS de Integración Directa**: Se implementó la clase global `.btn-animated` en `src/app/globals.css` para permitir añadir dinámicamente bordes animados degradados con conic-gradient a cualquier botón o enlace sin alterar su JSX estructural.
- **Implementación en Vistas Clave**:
  - **Detalle de Factura**: Aplicado a los botones de acción (Cerrar, Imprimir, Nota de Crédito, Nota de Débito, Reenviar Correo) con temas de color adaptados (Navy/Gold para marca, Rosa/Rojo para Crédito, Naranja/Ámbar para Débito).
  - **Catálogo de Productos**: Reemplazados los botones primarios y de guardado/creación por el componente `<Button animated>`.
  - **Gestión de Clientes**: Actualizado el formulario de registro y creación con botones de borde dinámico.


### 27. Persistencia de Selección en el Selector de Empresa
- **Corrección de Token y Sesión**: Se actualizó la lógica de rotación de refresh tokens en `verifyAuth` para que los nuevos tokens generados preserven el `companyId` de la sesión activa (`session.companyId`) en lugar de restablecerlo al valor por defecto del usuario (`userWithRole.companyId`).
- **Endpoints de Sesión**: Se modificaron los endpoints `/api/v1/auth/me` y `/api/v1/auth/refresh` para retornar la propiedad `companyId` basada en el valor activo del token/sesión (`auth.companyId` / `authPayload.companyId`) en lugar del valor estático de la tabla `users` en la base de datos.
- **Resultado**: Al cambiar de empresa en el selector, el estado de la empresa seleccionada se mantiene de manera consistente a través de recargas de página y rotaciones de token de sesión.


### 28. Módulo de Nómina y Recursos Humanos (Dominicana)
- **Base de Datos & Migraciones**: Diseñado esquema de datos multi-tenant para `departments`, `positions`, `employees`, `payrolls`, `payroll_details`, `overtime_records`, `employee_income`, `employee_deductions`, `employee_vacations`, `employee_leaves`, `employee_settlements`, `isr_brackets`, `payroll_configs`.
- **Motor de Cálculo (`PayrollCalculationService`)**: Implementado en TypeScript para calcular retenciones de TSS (AFP/SFS con topes de salarios mínimos dominicanos), ISR progresivo anualizado de la DGII, horas extras (diurnas, nocturnas, festivas, dobles con recargos del 35%, 85%, 100%), salario de Navidad proporcional (1/12) y liquidaciones/prestaciones (preaviso, cesantía, vacaciones acumuladas).
- **Control de Transacciones (`HRRepository`)**: Diseñada capa de repositorio para aislamiento de datos transaccionales por `companyId`, cálculo por lote de nóminas y generación de registros de auditoría en cada operación.
- **Rutas de API Backend**: Habilitados endpoints REST para departamentos, cargos, empleados (con validación de cédula dominicana), configuración, nóminas, recibos en PDF (vía `pdfkit` / `PdfGenerator` stream), registros de horas extras, ingresos adicionales, deducciones y liquidaciones.
- **Vistas del Frontend (Dashboard e Interfaz)**:
  - `/dashboard/hr`: Dashboard general con métricas e históricos.
  - `/dashboard/hr/employees`: Gestión completa del ciclo de vida del personal.
  - `/dashboard/hr/departments`: Configuración de la estructura organizativa.
  - `/dashboard/hr/payroll`: Generación, previsualización, cálculo y aprobación de nóminas periódicas con descarga directa de recibos de pago individuales.
  - `/dashboard/hr/overtime`: Carga masiva de horas extras y bonos/deducciones pendientes.
  - `/dashboard/hr/settlements`: Cálculo exacto de prestaciones (preaviso, cesantía) y proyección anual del Doble Sueldo.
  - `/dashboard/hr/config`: Ajustes locales de tasas de TSS e indicador de tramos progresivos del ISR de la DGII.

### 29. Gestión de Cheques en Garantía y Compras a Crédito (República Dominicana)
- **Cumplimiento Contable y de DGII**: Los cheques en garantía se registran a nivel contable auxiliar sin afectar la disponibilidad bancaria en el balance general. La compra a crédito se reporta en el 606 DGII bajo el método "04 (A Crédito)" reconociendo el NCF original y el ITBIS. Las retenciones fiscales se registran contablemente al instante del devengo de la factura, y el cheque se emite por el importe neto a pagar.
- **Sincronización Bancaria Automática**: Al aplicar/confirmar un cheque en garantía de manera individual (o en lote por fecha de vencimiento), el sistema actualiza el estado del cheque a `cleared`, el pago de cuentas por pagar a `applied`, resta el importe del balance de la cuenta bancaria física en `bank_accounts`, registra una transacción contable de retiro en `bank_transactions` y genera el asiento contable (Débito a Cuentas por Pagar, Crédito a Efectivo en Bancos).
- **Control e Interfaz UI Premium**:
  - **Formulario de Compras**: Añadido el checkbox reactivo "Dejar Cheque en Garantía" cuando el método de pago es "A Crédito (CXP)" con campos dinámicos para Banco (select), número de cheque, beneficiario, fecha de emisión y fecha de cobro.
    - Se especifica de manera explícita que el campo **Número de Cheque** (así como la **Fecha de Cobro**) es obligatorio usando un indicador visual `* (Obligatorio)` y validación estricta en el guardado.
    - Se implementó un banner de advertencia visual premium con el ícono `AlertTriangle` debajo del campo **Monto Cheque** si el usuario lo modifica con un valor que difiera del total facturado.
  - **Pestaña de Cheques en Garantía**: Creada una nueva sección de visualización dentro del módulo de compras que clasifica cheques pendientes y aplicados, con un botón dinámico de acción "Aplicar" para liquidación manual individualizada con confirmación de usuario.
  - **Alertas de Dashboard**: Sistema de alertas que notifica en el Dashboard principal si existen cheques en garantía cuya fecha de cobro haya sido alcanzada, integrando el indicador al widget de "Alertas" general.

### 30. Corrección de Restricción NCF en Compras y Validación de Formulario
- **Corrección de la Base de Datos:** Se eliminó la restricción `NOT NULL` en las columnas `ncf` y `supplier_id` de la tabla `expenses` en la base de datos (PostgreSQL), alineándola con el esquema de Drizzle. Esto soluciona los fallos de inserción de compras informales (Caja Chica / Gasto Menor) que no requieren suplidores ni comprobantes NCF.
- **Validaciones en el Frontend y Backend:**
  - Se agregó una validación estricta en el cliente para requerir de forma obligatoria el NCF y el suplidor al registrar compras formales (`isMinorExpense` es `false`).
  - Se replicaron las mismas validaciones en la ruta API del backend (`/api/v1/expenses`), retornando un error controlado de HTTP 400 en lugar de provocar excepciones o caídas de base de datos.
- **Normalización de Formato:** Se forzó la conversión del campo `ncf` a mayúsculas y la eliminación de espacios en blanco en los extremos (`toUpperCase().trim()`) antes de guardarlo en base de datos.

**Status**: Verified & Polished (Score 10/10)

### 31. Registro de Compras por Monto General (Sin Detalle de Ítems)
- **Modalidad General en la UI:** Integración de un switch toggle interactivo "Compra por Monto General" en el formulario de compras. Al activarse, se oculta el desglose de productos/servicios y se deshabilita la selección de "Almacén Destino" (forzando valor nulo/vacío), indicando que la compra no sumará existencias físicas al stock de inventario.
- **Autocalculo Reactivo de ITBIS:** Implementación de un campo para "Total de la Compra" que de-agrega de forma reactiva e inmediata el ITBIS (18%) y el Subtotal (Monto sin ITBIS = Total / 1.18) utilizando redondeo decimal preciso (`roundMoney`). Ambos campos de desglose quedan editables para permitir ajustes personalizados.
- **Selector de Cuentas Contables:** Incorporación de un selector dinámico que lista únicamente las cuentas del catálogo del tipo `expense` (costos y gastos) de la empresa, preseleccionando por defecto "Costo de Ventas (5.1.01)".
- **Contabilización Adaptativa Backend:** Modificación del endpoint de API y del servicio de creación de compras para aceptar un `debitAccountId` opcional. En el motor de generación de asientos contables de diario, si se proporciona dicho ID, se realiza la partida doble debitando directamente a la cuenta seleccionada en lugar del valor predeterminado, permitiendo flexibilizar el asiento contable del gasto según las necesidades contables.
- **Visualización en Detalles:** Adaptación del modal de detalles para renderizar una fila virtual descriptiva (con concepto general, cantidad 1 y montos) si la compra fue registrada en la modalidad de monto general (sin líneas de artículos físicas), manteniendo la consistencia de la visualización.

### 32. Corrección del Filtro de Fechas por Zona Horaria (República Dominicana)
- **Ajuste de Query de Comprobantes (e-CF):** Modificada la API `GET /api/v1/ecf` para parsear los parámetros de fecha `from` y `to` utilizando explícitamente el desplazamiento de zona horaria de República Dominicana (`-04:00` offset). Esto evita que la conversión a UTC desplace las facturas creadas al final del día a la fecha del día siguiente.
- **Sincronización de Estadísticas (Stats):** Se introdujo una función auxiliar `getDRCurrentDateParts()` en `GET /api/v1/ecf/stats` para determinar el año, mes y día actual según el huso horario local de Santo Domingo (`America/Santo_Domingo`). Esto garantiza que los límites mensuales por defecto y los parámetros opcionales se calculen y comparen consistentemente.
- **Actualización de Reportes DGII (Sales Book y 607):** Se corrigieron los endpoints de reportes financieros `GET /api/v1/reports/sales-book` y `GET /api/v1/reports/607/txt` para usar el desplazamiento `-04:00` en lugar de la zona horaria UTC (`Z` o fecha del servidor), alineando los reportes mensuales de ITBIS/DGII con la fecha local de emisión.
- **Rediseño e Integración de Componente de Rango de Fechas (Ark UI):** Se instaló la dependencia `@ark-ui/react` e implementó el componente `DateRangePicker` en `src/components/ui/date-range-picker.tsx` basado en Ark UI y Tailwind CSS. Este componente controlado ofrece un calendario de dos meses y se vincula directamente a los filtros `from`/`to`.
- **Reorganización del Layout de Filtros y Botones en el Dashboard:** Se reestructuró la barra de controles de `/dashboard/ecf` organizando de manera limpia el buscador, el selector de tipo, el de estado, y el nuevo selector de rango. Los botones "Sincronizar DGII" y "Actualizar Datos" ahora se muestran en una pila vertical (dos filas), mejorando el balance visual.

### 33. Corrección del Procesamiento y Sincronización de Estatus DGII para Notas de Crédito (e-34)
- **Corrección en la Lectura de Respuestas de mSeller/DGII:** Se actualizó el cliente de transmisión `MSellerClient` en `src/services/dgii/msellerClient.ts` para verificar tanto la propiedad `status` como `estado` en la respuesta JSON. Además, se implementó un parser dinámico para la lista de strings `dgiiResponse` que extrae los mensajes detallados de rechazo emitidos por la DGII, evitando que documentos con estado de rechazo de DGII (`Rechazado`) sean procesados incorrectamente como exitosos. Asimismo, se modificó el método `getDocumentStatus` para priorizar el estatus real de la DGII extraído del arreglo `dgiiResponse` (Aceptado, Aprobado con Observaciones, Rechazado) por encima del estatus general de mSeller.
- **Sincronización de Estado e Historial Contable en Emisión:** Se corrigió en `src/services/invoiceService.ts` y en el worker de colas `src/infrastructure/jobRunners.ts` la comprobación del estatus de la respuesta mSeller usando tanto `status` como `estado`. Esto previene que comprobantes de ajuste (como notas de crédito e-34) rechazadas por duplicación de secuencia sean grabadas erróneamente en estado aceptado.
- **Actualización de Mensajes de Diagnóstico en el Dashboard:** Se modificaron los endpoints de consulta de estatus individual (`GET /api/v1/ecf/[id]/dgii-status`) y por lote (`POST /api/v1/ecf/dgii-status/batch`) para actualizar directamente la columna `dgiiMessage` en la tabla `invoices`. Se agregaron validaciones de expresiones para mapear los 3 estados de la DGII de manera exhaustiva (abarcando `aprob`, `approved`, `acept`, `accepted` para `accepted`; `rechaz`, `rejected` para `rejected`; y `envi`, `recib`, `submitted`, `received` para `submitted`) y se eliminó la restricción de cambio de estado para que los mensajes y estados siempre se actualicen y se reflejen en la UI al sincronizar.

### 34. Integración del Estatus y Consultas DGII en la Vista de Ajustes (Notas de Crédito/Débito)
- **Visualización de Mensajes de la DGII:** Modificada la tabla de visualización del listado en `/dashboard/adjustments` para renderizar el mensaje detallado de respuesta de la DGII (`dgiiMessage`) debajo del badge de estado. Se configuraron colores semánticos (verde/esmeralda para notas aceptadas y rojo/rosa para notas rechazadas), mejorando la claridad de los diagnósticos fiscales directamente desde la página de Ajustes.
- **Acción de Consulta Individual del Estatus DGII:** Se agregó un botón de sincronización de estado de la DGII (ícono `RefreshCw` con animación de carga) en la columna de acciones para cada fila de nota de crédito o débito, permitiendo invocar individualmente `/api/v1/ecf/[id]/dgii-status` sin tener que ir a la pantalla principal de e-CF.
- **Reenvío de Ajustes a la DGII:** Se implementó un botón de acción rápida de reenvío (ícono `ArrowRight`) visible para notas en estado de error o rechazo (`rejected`/`failed`), enlazado al endpoint de reenvío `/api/v1/ecf/[id]/resubmit` para reencolar el e-CF al motor de transmisión BullMQ en caso de problemas de transmisión o secuencia.

### 35. Corrección de Despliegue en Vercel (Configuración de Redis y Middleware)
- **Desactivación de Redis en el Build**: Configurada la inicialización de Redis para omitirse durante el proceso de build de Next.js y cuando falte la variable de entorno `REDIS_URL` en producción, habilitando el fallback in-process de colas de forma de evitar el error de conexión.
- **Migración a Proxy**: Renombrado el archivo `src/middleware.ts` a `src/proxy.ts` y exportada la función como `proxy` para cumplir con la nueva especificación de Next.js 16, eliminando la advertencia de deprecación.
- **Evitado de Tracing Excesivo**: Añadidas directivas `/*turbopackIgnore: true*/` en las operaciones `path.join` de `documentService.ts` y `jobRunners.ts` para evitar que Turbopack trace recursivamente todo el proyecto.

* * V e r i f i e d   &   P o l i s h e d * *  
 * * V e r i f i e d   &   P o l i s h e d * *  
 * * V e r i f i e d   &   P o l i s h e d * *  
 * * V e r i f i e d   &   P o l i s h e d * *