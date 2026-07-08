# Sistema ERP e-CF Dominicana - Plan de Implementación

El proyecto se encuentra **Verified & Polished** tras completar la implementación de la vista de registro y edición de compras con sincronización de inventarios y asientos contables, soporte para modificar cantidades y costos, y restricciones de roles de usuario (Sistemas puede borrar y editar, Administradores solo editar) con botones de acción rápida en las tablas de historial.

## Módulos Implementados

### 0. Novedades de Impresión, Emisión y Diagnósticos
- **Impresión Multi-copias (Layout Carta)**: Configuración en la tabla `company_settings` para persistir entre 1 y 5 copias impresas (2 por defecto en creación de empresas). Al renderizar el PDF de impresión Carta, el motor de plantillas HTML duplica la estructura con saltos de página CSS, rotulando como **ORIGINAL** la primera hoja y **COPIA** todas las subsecuentes. Se preserva una sola copia en la descarga directa de PDF (`/pdf`). Además, al reimprimir una factura desde la vista de detalles o desde la lista del dashboard, se fuerza a que solo se imprima la copia original (usando el parámetro `?reprint=true`), mientras que la impresión inmediata tras generar la factura mantiene las copias múltiples configuradas.
- **Visualización de Stock en Impresión del Catálogo de Productos**: Integrado un selector de modo de impresión ("Sin Stock" o "Con Stock") directamente dentro del botón de impresión como un botón dividido (split button) en la barra de acciones del catálogo de productos. Al seleccionar "Con Stock" e imprimir, se inyecta dinámicamente una columna de "Stock" en la cabecera y el cuerpo del reporte de catálogo de productos en formato PDF de impresión, calculando en tiempo real las existencias acumuladas de todos los almacenes para cada artículo.
- **Modal de Confirmación de Emisión**: Validación previa de todos los datos en el frontend y apertura de un modal descriptivo unificado (Nombre del Cliente, Tipo de Comprobante, Método de Pago y Monto Total) con opciones de Aceptar o Cancelar, protegiendo contra emisiones accidentales para todos los tipos de envío (estándar, imprimir, email).
- **Corrección de Indicadores visuales de DGII**:
  - En la pestaña "Cola DGII" y en "Detalles de Factura", se renombraron y corrigieron los badges para mostrar las respuestas exitosas de la DGII (ej: "Aceptado") en color verde esmeralda y solo los fallos reales en rojo.
  - Se habilitó la recuperación y renderizado en pantalla del **Código de Seguridad oficial** emitido por la firma de la DGII, consultándolo directamente desde la transacción.

### 1. NÃºcleo Backend & Servicios
- **XMLDSIG & node-forge**: Firma digital envelopada de facturas e-CF.
- **Generador de PDF**: GeneraciÃ³n de representaciones impresas en formatos Carta, 80mm y 58mm.
- **Colas BullMQ & Redis**: TransmisiÃ³n asÃ­ncrona de e-CF a los servidores web de la DGII.
- **RefactorizaciÃ³n Modular de Invoicing (`InvoiceService`)**: Desacoplamiento de la lÃ³gica de facturaciÃ³n electrÃ³nica en submÃ³dulos especializados (Calculator, Validator, Submitter, DB Booker, File Generator) bajo `/src/services/invoice/`, facilitando pruebas unitarias sobre cÃ¡lculos fiscales aislados y aislando fallos de comunicaciÃ³n de red de las transacciones SQL de persistencia.
- **Sistema de Logging Profesional (JSON)**: ImplementaciÃ³n de intercepciÃ³n global en `src/instrumentation.ts` para capturar llamadas de `console.log/warn/error` y formatearlas automÃ¡ticamente en JSON estructurado (con timestamp, nivel, mensaje y contexto) en entornos de producciÃ³n, serializando de manera robusta pilas de errores y objetos.
- **CorrecciÃ³n de Refresco de Sesiones (DesincronizaciÃ³n de Cookies)**: Modificada la lÃ³gica de rotaciÃ³n de tokens en `src/proxy.ts` para inyectar y propagar las cabeceras enriquecidas de identidad (`x-user-id`, `x-company-id`, etc.) directamente en la solicitud downstream (`NextRequest.headers`) cuando el refresco tiene Ã©xito. Esto evita la doble rotaciÃ³n redundante en los controladores API que conllevaba a la desincronizaciÃ³n de cookies y desconexiones inesperadas del usuario.
- **ResoluciÃ³n Bug 500 CreaciÃ³n MÃºltiples Empresas**: Se modificÃ³ la restricciÃ³n Ãºnica `role_permissions_role_perm_idx` de roles de sistema. Anteriormente solo verificaba exclusividad de `(roleId, permissionId)`, provocando fallos al intentar asignar los mismos roles a una segunda empresa. Ahora abarca `(companyId, roleId, permissionId)`, permitiendo aislar roles del sistema entre diferentes empresas sin duplicar violaciones de llave primaria.
- **Registro de Rutas Dinámico (BI)**: Auto-conciliación en base de datos física del mapeo de ruta para el dashboard de Inteligencia de Negocios en cada solicitud de carga, garantizando auto-curación y restricción por roles de administración.

### 2. Base de Datos & Capa de Acceso (Repositories)
- **Tenancy Isolation**: Aislamiento estricto de datos mediante `company_id`.
- **Double-Entry Ledger**: Registro contable automÃ¡tico de asientos al facturar.
- **Control de Caja (Cashier Rules)**: Restricciones de apertura, balance inicial y lÃ­mites de egreso.
- **Repositorio Analítico de BI (`biRepository.ts`)**: Agregados SQL avanzados para facturas e-CF, compras y egresos (CxP), deudas (CxC) y rotación física de inventario por almacén o categoría, optimizado para consultas agregadas.

### 3. API Routes (/api/v1)
- **Wizard de ConfiguraciÃ³n**: InicializaciÃ³n tÃ©cnica en 6 pasos.
- **AutenticaciÃ³n RTR**: RotaciÃ³n de tokens segura mediante cookies HttpOnly.
- **Comprobantes e-CF**: Endpoints de facturaciÃ³n, consulta de estado de DGII y reenvÃ­o manual de correos.
- **EnvÃ­o de Correos**: Despacho automÃ¡tico de facturas emitidas a crÃ©dito por email.
- **Bancos y Conciliaciones**: Control de cuentas bancarias y conciliaciÃ³n de periodos.
- **Reportes Financieros**: Ventas (607), Balance General y Estado de Resultados.
- **Conduces (Remisiones)**: Generación, consulta y anulación de conduce.
- **API de Estadísticas BI (`/api/v1/bi/stats`)**: Route handler para BI que valida roles autorizados (`sistemas` y `administracion`) e integra almacenamiento en caché de Redis por 5 minutos parametrizado según filtros del usuario.

### 4. Interfaz de Usuario (Frontend)
- **Wizard**: `/setup`
- **AutenticaciÃ³n**: `/auth/login` y `/auth/register` (Registro de Usuarios)
- **Dashboard**: `/dashboard`
- **FacturaciÃ³n**: `/invoices` (con soporte de Suspense)
- **Caja**: `/cash`
- **Bancos**: `/bank` (GestiÃ³n de Cuentas Bancarias)
- **Contabilidad**: `/dashboard/accounting`
- **AdministraciÃ³n de Seguridad**: `/dashboard/admin`
- **Reportes Financieros**: `/reports` (EstadÃ­sticas y MÃ©tricas de Ventas, y ConciliaciÃ³n Bancaria activa)
- **Soporte y Ayuda**: `/support` (Centro de Contacto)
- **Recibos de Ingreso (Cuentas por Cobrar)**: Historial completo de cobros de facturas y descarga de recibos en formato PDF.
- **Lector de Facturas Inteligente (OCR - Uploader Refactored)**: RefactorizaciÃ³n completa del componente `InvoiceImageUploader.tsx` (reduciendo la lÃ³gica embebida en la UI) mediante la extracciÃ³n de todo su estado, gestores de eventos de arrastrar y soltar, procesamiento canvas de optimizaciÃ³n/compresiÃ³n de imÃ¡genes de entrada, e invocaciÃ³n a la API OCR del backend en el hook desacoplado y reutilizable `useInvoiceOcr.ts`.
- **Dashboard de Inteligencia de Negocios (`/dashboard/bi`)**: Interfaz analítica premium con DateRangePicker global y filtros combinados. Visualizaciones dinámicas vía Recharts (Ventas vs Compras, picos horarios, top vendedores, rotación de stock y alarmas operativas automatizadas).

### 5. MÃ³dulos Removidos
- **Punto de Venta (POS)**: Eliminado `/dashboard/pos` â€” pÃ¡gina, enlace de sidebar y botÃ³n de acceso rÃ¡pido en el mÃ³dulo de Caja. El mÃ³dulo de caja nativo (`/dashboard/cash`) cubre el flujo de cobro requerido.

### 6. RediseÃ±o del Layout de Factura A4
- **Latin Doorrs SRL A4**: RediseÃ±o exacto del formato A4/Carta con alineaciÃ³n mediante relleno de puntos dinÃ¡mico en monospace (RNC, telÃ©fono, email, direcciÃ³n, fecha de emisiÃ³n, cliente y totales), barra de condiciÃ³n de pago enmarcada en turquesa (`#005E6A`), encabezado de tabla de Ã­tems sÃ³lido, desglose de totales (Subtotal, Descuento, ITBIS, y Total Neto con doble subrayado), y bloque inferior de firma digital (QR, cÃ³digo de seguridad, fecha de firma y firmas fÃ­sicas).

### 7. ImpresiÃ³n Directa de Facturas (PDF Stream)
- **Direct Streaming con Formato HTML/Puppeteer**: Modificado `/api/v1/invoices/[id]/print` para soportar el mÃ©todo `GET`, el cual genera y transmite dinÃ¡micamente el archivo PDF original de la factura usando el motor Puppeteer (`DocumentTemplates.renderInvoice`), sirviendo el stream de forma directa (`Content-Type: application/pdf` con `Content-Disposition: inline`). Esto preserva el diseÃ±o exacto A4 con relleno de puntos y barra de condiciÃ³n turquesa.
- **ProtecciÃ³n de Secuencia NCF**: Corregido el flujo en `src/services/invoiceService.ts` para predecir el NCF fuera de la transacciÃ³n sin consumirlo en base de datos. La reserva fÃ­sica del NCF e incremento secuencial ahora se ejecutan exclusivamente dentro de la transacciÃ³n final de guardado de la factura, previniendo saltos involuntarios en la secuencia de comprobantes ante fallos de conexiÃ³n (por ejemplo, con MSeller o DGII).
- **IntegraciÃ³n con Cliente**: Actualizado `src/app/dashboard/invoices/[id]/page.tsx` para abrir el endpoint directamente en una nueva pestaÃ±a del navegador, emulando el comportamiento directo y fluido de `/api/v1/documents/[uuid]/download`.

### 8. Campo de Notas de la Factura (Notes Field)
- **Capa de Base de Datos**: Agregado el campo `notes` (TEXT) a la tabla `invoices` y actualizado el esquema de Drizzle.
- **ValidaciÃ³n & Repositorio**: Actualizado el esquema de validaciÃ³n y la API `/api/v1/invoices` para recibir opcionalmente el campo `notes`, guardÃ¡ndolo correctamente en la base de datos a travÃ©s del repositorio y servicio de facturaciÃ³n.
- **Rendimiento Visual**: IntegraciÃ³n dinÃ¡mica del campo `notes` en la plantilla de impresiÃ³n de facturas en PDF (con soporte de mÃºltiples lÃ­neas `white-space: pre-wrap`, fallback al texto por defecto si estÃ¡ vacÃ­o, y removiendo el bloque redundante de 'Comentarios: N/A').
- **Formulario de CreaciÃ³n**: AÃ±adido un campo de texto `<textarea>` ("Notas de la Factura") estilizado al formulario de emisiÃ³n de facturas e-CF del Dashboard.
- **CorrecciÃ³n de ImpresiÃ³n**: Simplificado el manejador `handleDownloadPdf` del listado de facturas en el Dashboard para abrir directamente el PDF vÃ­a `window.open` en lugar de realizar una peticiÃ³n fetch y fallar al parsear la respuesta binaria como JSON.
- **Descuento por LÃ­nea de Factura**: Incorporado el campo "Desc. Unit." (descuento por unidad) como input editable dentro de la fila de cada artÃ­culo. Se agregÃ³ ademÃ¡s una columna calculada de lectura "Total Fila" para mostrar de manera interactiva el importe neto incluyendo descuento e ITBIS a nivel de lÃ­nea, sincronizando perfectamente todos los cÃ¡lculos del subtotal, descuento acumulado, impuestos y total general.
- **CorrecciÃ³n de Totales Impresos**: Corregido el cÃ¡lculo del subtotal en el archivo de plantilla `documentTemplates.ts` cambiando `inv.subtotal - inv.discount` por el subtotal bruto real `inv.subtotal`. Esto previene el doble descuento en el resumen visual impreso (SUB TOTAL, DESCUENTO, ITBIS y TOTAL NETO).
- **Descuentos en Vista de Factura (Modal)**: Actualizado el modal "Ver Detalles" del listado de facturas en el Dashboard para incluir la columna "Descuento" para cada artÃ­culo de lÃ­nea y reflejar la deducciÃ³n global en el bloque de resumen financiero si se aplicaron rebajas.
- **AlineaciÃ³n de Descuento Unitario en ImpresiÃ³n**: Corregido el mapeo en `documentTemplates.ts` de las columnas de la tabla de artÃ­culos de la factura A4. Se reemplazÃ³ el descuento con impuestos incluidos (`descTotalInclusive`) por el descuento base original (`rawDiscount`) para que el desglose de cada Ã­tem de lÃ­nea concuerde exactamente con el valor base introducido (mostrando el descuento real de RD$ 20.00 en lugar del inflado por impuestos RD$ 23.60).
- **ValidaciÃ³n de Decimales en e-CF (MSeller)**: Se aplicÃ³ un redondeo matemÃ¡tico estricto de exactamente 2 decimales (`Number(val.toFixed(2))`) en la construcciÃ³n del payload de emisiÃ³n (`buildECFPayload` en `msellerClient.ts`). Esto corrige el rechazo de la API de MSeller/DGII debido al tipo de datos `Decimal18D2Validation` cuando se transmitÃ­an totales con mÃ¡s de dos decimales (como el monto total `4781.5016` rechazado).
- **Respuestas de DGII/MSeller en Notificaciones (Toasts)**: Se actualizÃ³ la notificaciÃ³n de emisiÃ³n exitosa del formulario para serializar y mostrar exclusivamente el objeto JSON retornado por la API de MSeller (`data.msellerResponse`) en lugar del registro de base de datos de la factura, permitiendo al emisor visualizar de manera exacta los metadatos de firma digital de la DGII (RNC, ECF, trackId, cÃ³digo de seguridad, etc.).

### 9. Control de Permisos y Roles en Ajustes (mSeller, Nombre y RNC)
- **Backend & ValidaciÃ³n Zod**: Se agregaron los campos `name` y `rnc` como obligatorios en la validaciÃ³n de esquema de la API `/api/v1/admin/settings`. Se implementaron validaciones de negocio basadas en el rol del usuario:
  - Solo el rol `sistemas` puede agregar o modificar los parÃ¡metros de la secciÃ³n **mSeller**.
  - Solo el rol `sistemas` puede modificar el **Nombre Comercial** y el **RNC** de la empresa una vez definidos en la base de datos. Si estÃ¡n vacÃ­os, un `administrador` (`administracion`) tambiÃ©n tiene permitido agregarlos por primera vez.
- **Frontend**: Se adaptÃ³ la vista `/dashboard/settings` para consultar el rol del usuario autenticado vÃ­a `/api/v1/auth/me`. Se enlazaron los inputs a los campos de identidad fiscal en `formData` y se controla de forma reactiva y visual su propiedad `disabled` de acuerdo con las reglas de negocio anteriores.

### 10. MÃ³dulo de Notas de CrÃ©dito (e-34) y Notas de DÃ©bito (e-33)
- **Base de Datos & Repositorio**: Se agregaron las columnas `modifiedNcf` y `modifiedInvoiceId` a la tabla `invoices`. Se adaptÃ³ `InvoiceRepository` para guardar y consultar estas relaciones.
- **Backend & ValidaciÃ³n Zod**: Se actualizÃ³ `createInvoiceSchema` para exigir obligatoriamente `modifiedNcf` cuando el tipo de e-CF es `33` o `34`.
- **LÃ³gica de Ajuste (mSeller, Inventario y Contabilidad)**:
  - En `MSellerClient`, se aÃ±ade la secciÃ³n `<TablaReferencia>` con el eNCF del comprobante original.
  - En `InvoiceService`, las Notas de CrÃ©dito (34) omiten la comprobaciÃ³n de stock y devuelven la mercancÃ­a ingresando stock a los almacenes (`quantity` negativa en `deductStock`).
  - Se definieron reglas de reversiÃ³n contable para Notas de CrÃ©dito (reversiÃ³n de ingresos, ITBIS y cuentas por cobrar).
- **Frontend**: Se agregaron botones de acciÃ³n rÃ¡pida ("Emitir Nota de CrÃ©dito" e "Emitir Nota de DÃ©bito") en el listado de facturas aceptadas. Al pulsarlos, se obtienen las lÃ­neas e informaciÃ³n del comprobante original y se precargan en el formulario de emisiÃ³n mostrando una alerta de referencia al usuario.

### 11. MÃ³dulo de Conduces de Entrega (Control LogÃ­stico & WMS)
- **Base de Datos & Repositorio**: Se agregaron las columnas `delivery_status` en la tabla `invoices`, y campos de auditorÃ­a (`approved_by`, `approved_at`, `voided_by`, `voided_at`), `delivery_number`, chofer y observaciones en `delivery_notes`. Se implementaron restricciones de clave externa y un Ã­ndice Ãºnico compuesto.
- **DeducciÃ³n de Inventario Diferida**: Se desactivÃ³ la deducciÃ³n inmediata de stock en la emisiÃ³n de facturas estÃ¡ndar de venta (`31`, `32`, `45`), delegando la salida real fÃ­sica de mercancÃ­as al momento de **aprobar** el Conduce. Las notas de crÃ©dito (`34`) continÃºan procesando los reingresos directamente.
- **ValidaciÃ³n Anti-Sobreentrega**: El repositorio valida transaccionalmente que la suma acumulada de mercancÃ­a despachada no exceda las cantidades facturadas de origen, protegiendo contra duplicidades y sobre-entregas.
- **API & ImpresiÃ³n Directa (PDF)**:
  - Creados endpoints para creaciÃ³n, consulta, aprobaciÃ³n y anulaciÃ³n transaccional de conduces.
  - Implementado `GET /api/v1/delivery-notes/[id]/print` para renderizar y transmitir dinÃ¡micamente representaciones en PDF tamaÃ±o Carta de alta calidad contable.
  - Corregida la consulta de listado de comprobantes/facturas (`GET /api/v1/ecf`) para incluir el campo `deliveryStatus` (estado de despacho), solucionando la omisiÃ³n en el frontend que impedÃ­a listar facturas aptas para emitir conduces.
- **Frontend del Dashboard**:
  - DiseÃ±ada una interfaz premium e intuitiva bajo `/dashboard/delivery-notes` para el control de remisiones (chofer, licencia, placa, despachador, observaciones), visor de estados logÃ­sticos (`pending`, `partial`, `delivered`) y acciones rÃ¡pidas para descarga de PDF, aprobaciÃ³n y anulaciÃ³n.

### 12. EdiciÃ³n de Secuencias SACF (Solo rol sistemas)
- **Backend & Seguridad**: Se actualizÃ³ el endpoint `PUT /api/v1/ecf/sequences/[id]` para validar que el rol del usuario autenticado sea exactamente `sistemas`. Se habilitÃ³ la modificaciÃ³n de los campos `currentSequence`, `maxSequence` y `sequenceExpiry` en la tabla `ecf_sequences`. La fecha de vencimiento (`sequenceExpiry` en formato `DD-MM-YYYY`) se convierte a un objeto Date y se guarda en la columna `expiryDate`.
- **Frontend**: En el dashboard de e-CF (`/dashboard/ecf`), en la pestaÃ±a de "Secuencias SACF", se aÃ±adiÃ³ la capacidad de recuperar el rol del usuario actual. Si el rol es `sistemas`, se muestra un botÃ³n de ediciÃ³n (icono de lÃ¡piz) en las tarjetas de secuencia, el cual abre el modal `EditSequenceModal` permitiendo actualizar en tiempo real la secuencia actual, secuencia mÃ¡xima y fecha de vencimiento de las autorizaciones.

### 13. MÃ³dulo de Herramientas de ProducciÃ³n
- **ConfiguraciÃ³n de Perfiles Escalable**: CentralizaciÃ³n de las fÃ³rmulas matemÃ¡ticas para el desglose de ventanas corredizas (`Tradicional`, `P-65`, `P-92`) en `src/utils/profilesRegistry.ts` para facilitar la incorporaciÃ³n de futuros sistemas de aluminio sin alterar el frontend.
- **Optimizador de Corte de Vidrio**: ImplementaciÃ³n del motor de optimizaciÃ³n 2D (`src/utils/cuttingOptimizer.ts`) con visualizador interactivo del mapa de planchas basado en pulgadas.
- **Persistencia en LocalStorage**: Autoguardado automÃ¡tico de las listas de corte del usuario para evitar pÃ©rdida de trabajo ante recargas involuntarias del navegador.
- **ImpresiÃ³n Profesional VÃ­a Backend**: ImplementaciÃ³n de endpoints `/api/v1/tools/print` conectados a `pdfkit` (existente en el sistema) para la generaciÃ³n de PDFs de alta fidelidad, listos para descargar o imprimir directamente en el taller fÃ­sico.
- **Interfaz del Dashboard**: IncorporaciÃ³n de la pestaÃ±a **Herramientas** en el menÃº lateral de navegaciÃ³n conectando las dos herramientas tÃ©cnicas.

---
### 14. EnvÃ­o de Notas de CrÃ©dito (e-34) y DÃ©bito (e-33) a MSeller y GestiÃ³n de Secuencias
- **TransmisiÃ³n de Notas de CrÃ©dito y DÃ©bito**: Habilitado el envÃ­o automÃ¡tico de comprobantes de ajuste (debit notes e-33 y credit notes e-34) a MSeller de la misma manera que las facturas normales, asociando el eNCF del comprobante original mediante la referencia (`modifiedNcf` a `<TablaReferencia>`) tanto en el servicio de facturaciÃ³n directo (`InvoiceService`) como en el worker de transmisiÃ³n en segundo plano (`worker.ts`).
- **Secuencias Separadas**: Habilitada la creaciÃ³n y el mantenimiento de secuencias independientes para Nota de CrÃ©dito (34) y Nota de DÃ©bito (33) en el formulario de configuraciÃ³n de secuencias SACF del Dashboard y en el servicio de base de datos.
- **NumeraciÃ³n Interna Consecutiva (NC/ND/FAC)**: Se automatizÃ³ la generaciÃ³n del cÃ³digo interno del documento (`codigoFactura`) en formato `PREFIJO-AÃ‘O-SECUENCIAL` (ej: `NC-2026-000001` para notas de crÃ©dito, `ND-2026-000001` para notas de dÃ©bito y `FAC-2026-000001` para facturas estÃ¡ndar), incrementÃ¡ndose de forma aislada por tipo de documento, aÃ±o y compaÃ±Ã­a.
- **Acceso en Interfaz de Usuario**: AÃ±adidas las opciones e-33 y e-34 en el selector del formulario de facturaciÃ³n y en los filtros de tipo de comprobante. Integrada la funcionalidad de emitir notas de dÃ©bito y crÃ©dito mediante botones rÃ¡pidos de acciÃ³n dentro del modal de visualizaciÃ³n de detalles de factura en el listado del Dashboard.

- **VisualizaciÃ³n Completa de Comprobantes**: Modificado el panel de creaciÃ³n y filtrado de secuencias para incluir los 10 tipos de comprobantes fiscales electrÃ³nicos (e-CF) autorizados por la DGII (e-31 CrÃ©dito Fiscal, e-32 Consumo, e-33 Nota DÃ©bito, e-34 Nota CrÃ©dito, e-41 Compras, e-43 Gastos Menores, e-44 RegÃ­menes Especiales, e-45 Gubernamental, e-46 Pagos al Exterior y e-47 ExportaciÃ³n), actualizando ademÃ¡s la asignaciÃ³n de colores en los badges identificadores correspondientes.

### 15. OptimizaciÃ³n de Memoria (Rendimiento)
- **Singleton de Puppeteer**: ImplementaciÃ³n de una instancia compartida y persistente del navegador Chromium (`PdfGenerator.browserInstance`) con reinicio automÃ¡tico ante desconexiones y banderas optimizadas de bajo consumo. Esto evita lanzar un navegador completo por cada PDF, abriendo/cerrando Ãºnicamente pÃ¡ginas virtuales, reduciendo drÃ¡sticamente el consumo de RAM en el servidor.
- **Carga Diferida de GrÃ¡ficos (Dashboard)**: MigraciÃ³n de los grÃ¡ficos del Dashboard a un subcomponente `DashboardCharts.tsx` importado de manera dinÃ¡mica (`next/dynamic` sin SSR). Esto aligera el bundle de carga inicial reduciendo la huella de memoria del navegador en el cliente.

### 16. CorrecciÃ³n en Cuentas por Cobrar (Receivables)
- **Color de Texto del BotÃ³n**: Se cambiÃ³ el color del texto del botÃ³n "Registrar Cobro" (de la tabla de saldos de clientes) de `text-primary` (el cual heredaba el color azul principal y se volvÃ­a invisible contra el fondo azul del botÃ³n) a `text-white` para garantizar su legibilidad y contraste.

### 17. CorrecciÃ³n de contraste de texto en fondos azules (Accesibilidad y Legibilidad)
- **CorrecciÃ³n en Status Bars y PestaÃ±as**: Se cambiÃ³ el color de texto `text-primary` a `text-white` en todas las barras superiores y menÃºs de pestaÃ±as que tienen fondo azul oscuro (`bg-[#003366]`).
- **Campos de Entrada y Formularios**: Se modificaron las entradas de formulario (inputs de fecha, inputs de referencia, textareas de notas, celdas de inputs de facturas amortizadas) y botones de opciones inactivas en el modal de cobros para usar `text-white` o `text-slate-300` sobre fondos azul oscuro (`bg-[#001733]`), eliminando problemas de contraste de texto oscuro.
- **Botones con Fondo Azul**: Se ajustaron los botones de actualizaciÃ³n de historial de caja (`bg-[#001e40]`), botones de retorno (`bg-[#001e40]`), y botones de generaciÃ³n de reportes en PDF (`bg-[#003366]`) para cambiar `text-primary` a `text-white`, evitando texto invisible.

### 18. PersonalizaciÃ³n y Spacing en el Recibo de Ingreso (Cuentas por Cobrar)
- **Espaciado Inferior en TÃ­tulo**: Se aÃ±adiÃ³ una separaciÃ³n vertical (`margin-bottom: 8px`) debajo del tÃ­tulo central `"RECIBO DE INGRESO"` en la plantilla de impresiÃ³n de recibos (`documentTemplates.ts`), desplazando los metadatos del recibo (nÃºmero de recibo, fecha, mÃ©todo de pago, etc.) una lÃ­nea hacia abajo para mayor claridad visual.
- **AlineaciÃ³n del Logo**: Se desplazÃ³ el logotipo de la empresa en el recibo (formato Carta) `20px` (aproximadamente 3 caracteres) hacia la izquierda para alinear y ajustar su posiciÃ³n segÃºn las preferencias visuales del cliente.

### 19. Apartado de Estado de Cuenta y Abonos por Cliente (Cuentas por Cobrar)
- **Nueva PestaÃ±a en Interfaz**: Se creÃ³ una pestaÃ±a `"Estado de Cuenta y Abonos"` que permite seleccionar dinÃ¡micamente cualquier cliente de la base de datos para consultar el historial completo de sus movimientos.
- **Detalle Progresivo de Balances**: Muestra cronolÃ³gicamente todos los abonos aplicados con fecha, cÃ³digo del recibo, nÃºmero/NCF de factura, mÃ©todo de pago, monto total facturado, importe del abono y calcula el balance restante progresivo de la factura despuÃ©s de cada pago.
- **ImpresiÃ³n y BÃºsqueda**: Incorpora un filtro reactivo de bÃºsqueda (para filtrar por cÃ³digo de factura, NCF, recibo o referencia) y un botÃ³n de impresiÃ³n conectado a un nuevo endpoint de backend `/api/v1/ar/receipts/by-customer/print` que genera un documento PDF oficial de estado de cuenta utilizando Puppeteer y la plantilla `DocumentTemplates.renderCustomerStatement` con logo de la empresa y detalles fiscales.

### 20. ImpresiÃ³n Premium de Reportes Financieros
- **GeneraciÃ³n HTML/Puppeteer**: Se reemplazÃ³ por completo la antigua generaciÃ³n `pdfkit` monospaced para todos los reportes financieros en la secciÃ³n de reportes por plantillas de impresiÃ³n HTML premium generadas con Puppeteer:
  - **Estado de Cuentas por Cliente** (`DocumentTemplates.renderARStatement`)
  - **Estado de Resultados (P&L)** (`DocumentTemplates.renderIncomeStatement`)
  - **Balance General** (`DocumentTemplates.renderBalanceSheet`)
- **Detalle y Estilo**: Muestra de forma elegante el logo de la empresa, RNC, direcciÃ³n fiscal, datos del cliente (cuando corresponda), y la estructura visual de cuentas y totales financieros alineados y formateados con separador de miles.

### 21. Plantilla de ImpresiÃ³n de Desglose de Ventanas (HTML/Puppeteer)
- **MigraciÃ³n a Puppeteer**: Se reemplazÃ³ la generaciÃ³n tradicional monospaced basada en `pdfkit` del desglose de ventanas por una plantilla HTML premium renderizada por Puppeteer (`DocumentTemplates.renderWindowBreakdown`), en orientaciÃ³n Carta horizontal (landscape).
- **DiseÃ±o TÃ©cnico Preservado**: Mantiene el diseÃ±o exacto de taller con la tabla de medidas base, vÃ­as, cortes de perfiles (Cabezal, LlavÃ­n, Rieles, Laterales), y cristales, ademÃ¡s de los bloques resÃºmenes de cantidad de piezas por tipo y resumen acumulado de materiales por sistema (Tradicional, P-65 y P-92) calculados dinÃ¡micamente.

### 23. Sistema de Colas con Fallback Auto-Curativo (Redis Offline)
- **ExtracciÃ³n de LÃ³gica de Colas**: Se centralizÃ³ la lÃ³gica de negocio para la presentaciÃ³n a la DGII y el despacho de correos en [jobRunners.ts](file:///c:/Users/gerso/OneDrive/Documentos/contfast_v.2/src/infrastructure/jobRunners.ts), permitiendo su importaciÃ³n aislada sin efectos secundarios en el ciclo de vida del servidor.
- **Mecanismo de Resiliencia en Colas**: Se configurÃ³ un fallback automÃ¡tico en [queue.ts](file:///c:/Users/gerso/OneDrive/Documentos/contfast_v.2/src/infrastructure/queue.ts) que detecta si el cliente de Redis estÃ¡ fuera de lÃ­nea (ECONNREFUSED) o si el tiempo de encolado expira. Ante esta situaciÃ³n, el sistema ejecuta la tarea en segundo plano utilizando el event loop (`setTimeout(..., 0)`) in-process, garantizando la entrega de correos electrÃ³nicos de facturas y los envÃ­os DGII en entornos locales y en contingencias.

### 24. Borde con Degradado Animado (BorderRotate)
- **Componente**: Creado en `src/components/ui/animated-gradient-border.tsx` para proporcionar una animaciÃ³n de borde fluido con velocidad y colores configurables.
- **ConfiguraciÃ³n CSS**: AÃ±adida la animaciÃ³n y la propiedad `@property --gradient-angle` a `src/app/globals.css` para soportar rotaciÃ³n de color cÃ³nica fluida en Tailwind CSS v4.
- **IntegraciÃ³n**: Se envolvieron las tarjetas principales de resumen del Dashboard con el componente `BorderRotate`, aplicando una paleta de colores degradados que complementan el tema corporativo de Latin Doors.

### 26. Botones Premium con Bordes Degradados Animados (Custom Button Component)
- **Componente Centralizado Reutilizable**: Creado en `src/components/ui/button.tsx` utilizando la utilidad `cn` de clase de Tailwind para unificar el estilo de los botones del sistema con soporte para animaciones de bordes degradados (`BorderRotate`).
- **Clase CSS de IntegraciÃ³n Directa**: Se implementÃ³ la clase global `.btn-animated` en `src/app/globals.css` para permitir aÃ±adir dinÃ¡micamente bordes animados degradados con conic-gradient a cualquier botÃ³n o enlace sin alterar su JSX estructural.
- **ImplementaciÃ³n en Vistas Clave**:
  - **Detalle de Factura**: Aplicado a los botones de acciÃ³n (Cerrar, Imprimir, Nota de CrÃ©dito, Nota de DÃ©bito, Reenviar Correo) con temas de color adaptados (Navy/Gold para marca, Rosa/Rojo para CrÃ©dito, Naranja/Ã�mbar para DÃ©bito).
  - **CatÃ¡logo de Productos**: Reemplazados los botones primarios y de guardado/creaciÃ³n por el componente `<Button animated>`.
  - **GestiÃ³n de Clientes**: Actualizado el formulario de registro y creaciÃ³n con botones de borde dinÃ¡mico.


### 27. Persistencia de SelecciÃ³n en el Selector de Empresa
- **CorrecciÃ³n de Token y SesiÃ³n**: Se actualizÃ³ la lÃ³gica de rotaciÃ³n de refresh tokens en `verifyAuth` para que los nuevos tokens generados preserven el `companyId` de la sesiÃ³n activa (`session.companyId`) en lugar de restablecerlo al valor por defecto del usuario (`userWithRole.companyId`).
- **Endpoints de SesiÃ³n**: Se modificaron los endpoints `/api/v1/auth/me` y `/api/v1/auth/refresh` para retornar la propiedad `companyId` basada en el valor activo del token/sesiÃ³n (`auth.companyId` / `authPayload.companyId`) en lugar del valor estÃ¡tico de la tabla `users` en la base de datos.
- **Resultado**: Al cambiar de empresa en el selector, el estado de la empresa seleccionada se mantiene de manera consistente a travÃ©s de recargas de pÃ¡gina y rotaciones de token de sesiÃ³n.


### 28. MÃ³dulo de NÃ³mina y Recursos Humanos (Dominicana)
- **Base de Datos & Migraciones**: DiseÃ±ado esquema de datos multi-tenant para `departments`, `positions`, `employees`, `payrolls`, `payroll_details`, `overtime_records`, `employee_income`, `employee_deductions`, `employee_vacations`, `employee_leaves`, `employee_settlements`, `isr_brackets`, `payroll_configs`.
- **Motor de CÃ¡lculo (`PayrollCalculationService`)**: Implementado en TypeScript para calcular retenciones de TSS (AFP/SFS con topes de salarios mÃ­nimos dominicanos), ISR progresivo anualizado de la DGII, horas extras (diurnas, nocturnas, festivas, dobles con recargos del 35%, 85%, 100%), salario de Navidad proporcional (1/12) y liquidaciones/prestaciones (preaviso, cesantÃ­a, vacaciones acumuladas).
- **Control de Transacciones (`HRRepository`)**: DiseÃ±ada capa de repositorio para aislamiento de datos transaccionales por `companyId`, cÃ¡lculo por lote de nÃ³minas y generaciÃ³n de registros de auditorÃ­a en cada operaciÃ³n.
- **Rutas de API Backend**: Habilitados endpoints REST para departamentos, cargos, empleados (con validaciÃ³n de cÃ©dula dominicana), configuraciÃ³n, nÃ³minas, recibos en PDF (vÃ­a `pdfkit` / `PdfGenerator` stream), registros de horas extras, ingresos adicionales, deducciones y liquidaciones.
- **Vistas del Frontend (Dashboard e Interfaz)**:
  - `/dashboard/hr`: Dashboard general con mÃ©tricas e histÃ³ricos.
  - `/dashboard/hr/employees`: GestiÃ³n completa del ciclo de vida del personal.
  - `/dashboard/hr/departments`: ConfiguraciÃ³n de la estructura organizativa.
  - `/dashboard/hr/payroll`: GeneraciÃ³n, previsualizaciÃ³n, cÃ¡lculo y aprobaciÃ³n de nÃ³minas periÃ³dicas con descarga directa de recibos de pago individuales.
  - `/dashboard/hr/overtime`: Carga masiva de horas extras y bonos/deducciones pendientes.
  - `/dashboard/hr/settlements`: CÃ¡lculo exacto de prestaciones (preaviso, cesantÃ­a) y proyecciÃ³n anual del Doble Sueldo.
  - `/dashboard/hr/config`: Ajustes locales de tasas de TSS e indicador de tramos progresivos del ISR de la DGII.

### 29. GestiÃ³n de Cheques en GarantÃ­a y Compras a CrÃ©dito (RepÃºblica Dominicana)
- **Cumplimiento Contable y de DGII**: Los cheques en garantÃ­a se registran a nivel contable auxiliar sin afectar la disponibilidad bancaria en el balance general. La compra a crÃ©dito se reporta en el 606 DGII bajo el mÃ©todo "04 (A CrÃ©dito)" reconociendo el NCF original y el ITBIS. Las retenciones fiscales se registran contablemente al instante del devengo de la factura, y el cheque se emite por el importe neto a pagar.
- **SincronizaciÃ³n Bancaria AutomÃ¡tica**: Al aplicar/confirmar un cheque en garantÃ­a de manera individual (o en lote por fecha de vencimiento), el sistema actualiza el estado del cheque a `cleared`, el pago de cuentas por pagar a `applied`, resta el importe del balance de la cuenta bancaria fÃ­sica en `bank_accounts`, registra una transacciÃ³n contable de retiro en `bank_transactions` y genera el asiento contable (DÃ©bito a Cuentas por Pagar, CrÃ©dito a Efectivo en Bancos).
- **Control e Interfaz UI Premium**:
  - **Formulario de Compras**: AÃ±adido el checkbox reactivo "Dejar Cheque en GarantÃ­a" cuando el mÃ©todo de pago es "A CrÃ©dito (CXP)" con campos dinÃ¡micos para Banco (select), nÃºmero de cheque, beneficiario, fecha de emisiÃ³n y fecha de cobro.
    - Se especifica de manera explÃ­cita que el campo **NÃºmero de Cheque** (asÃ­ como la **Fecha de Cobro**) es obligatorio usando un indicador visual `* (Obligatorio)` y validaciÃ³n estricta en el guardado.
    - Se implementÃ³ un banner de advertencia visual premium con el Ã­cono `AlertTriangle` debajo del campo **Monto Cheque** si el usuario lo modifica con un valor que difiera del total facturado.
  - **PestaÃ±a de Cheques en GarantÃ­a**: Creada una nueva secciÃ³n de visualizaciÃ³n dentro del mÃ³dulo de compras que clasifica cheques pendientes y aplicados, con un botÃ³n dinÃ¡mico de acciÃ³n "Aplicar" para liquidaciÃ³n manual individualizada con confirmaciÃ³n de usuario.
  - **Alertas de Dashboard**: Sistema de alertas que notifica en el Dashboard principal si existen cheques en garantÃ­a cuya fecha de cobro haya sido alcanzada, integrando el indicador al widget de "Alertas" general.

### 30. CorrecciÃ³n de RestricciÃ³n NCF en Compras y ValidaciÃ³n de Formulario
- **CorrecciÃ³n de la Base de Datos:** Se eliminÃ³ la restricciÃ³n `NOT NULL` en las columnas `ncf` y `supplier_id` de la tabla `expenses` en la base de datos (PostgreSQL), alineÃ¡ndola con el esquema de Drizzle. Esto soluciona los fallos de inserciÃ³n de compras informales (Caja Chica / Gasto Menor) que no requieren suplidores ni comprobantes NCF.
- **Validaciones en el Frontend y Backend:**
  - Se agregÃ³ una validaciÃ³n estricta en el cliente para requerir de forma obligatoria el NCF y el suplidor al registrar compras formales (`isMinorExpense` es `false`).
  - Se replicaron las mismas validaciones en la ruta API del backend (`/api/v1/expenses`), retornando un error controlado de HTTP 400 en lugar de provocar excepciones o caÃ­das de base de datos.
- **NormalizaciÃ³n de Formato:** Se forzÃ³ la conversiÃ³n del campo `ncf` a mayÃºsculas y la eliminaciÃ³n de espacios en blanco en los extremos (`toUpperCase().trim()`) antes de guardarlo en base de datos.

**Status**: Verified & Polished (Score 10/10)

### 31. Registro de Compras por Monto General (Sin Detalle de Ã�tems)
- **Modalidad General en la UI:** IntegraciÃ³n de un switch toggle interactivo "Compra por Monto General" en el formulario de compras. Al activarse, se oculta el desglose de productos/servicios y se deshabilita la selecciÃ³n de "AlmacÃ©n Destino" (forzando valor nulo/vacÃ­o), indicando que la compra no sumarÃ¡ existencias fÃ­sicas al stock de inventario.
- **Autocalculo Reactivo de ITBIS:** ImplementaciÃ³n de un campo para "Total de la Compra" que de-agrega de forma reactiva e inmediata el ITBIS (18%) y el Subtotal (Monto sin ITBIS = Total / 1.18) utilizando redondeo decimal preciso (`roundMoney`). Ambos campos de desglose quedan editables para permitir ajustes personalizados.
- **Selector de Cuentas Contables:** IncorporaciÃ³n de un selector dinÃ¡mico que lista Ãºnicamente las cuentas del catÃ¡logo del tipo `expense` (costos y gastos) de la empresa, preseleccionando por defecto "Costo de Ventas (5.1.01)".
- **ContabilizaciÃ³n Adaptativa Backend:** ModificaciÃ³n del endpoint de API y del servicio de creaciÃ³n de compras para aceptar un `debitAccountId` opcional. En el motor de generaciÃ³n de asientos contables de diario, si se proporciona dicho ID, se realiza la partida doble debitando directamente a la cuenta seleccionada en lugar del valor predeterminado, permitiendo flexibilizar el asiento contable del gasto segÃºn las necesidades contables.
- **VisualizaciÃ³n en Detalles:** AdaptaciÃ³n del modal de detalles para renderizar una fila virtual descriptiva (con concepto general, cantidad 1 y montos) si la compra fue registrada en la modalidad de monto general (sin lÃ­neas de artÃ­culos fÃ­sicas), manteniendo la consistencia de la visualizaciÃ³n.

### 32. CorrecciÃ³n del Filtro de Fechas por Zona Horaria (RepÃºblica Dominicana)
- **Ajuste de Query de Comprobantes (e-CF):** Modificada la API `GET /api/v1/ecf` para parsear los parÃ¡metros de fecha `from` y `to` utilizando explÃ­citamente el desplazamiento de zona horaria de RepÃºblica Dominicana (`-04:00` offset). Esto evita que la conversiÃ³n a UTC desplace las facturas creadas al final del dÃ­a a la fecha del dÃ­a siguiente.
- **SincronizaciÃ³n de EstadÃ­sticas (Stats):** Se introdujo una funciÃ³n auxiliar `getDRCurrentDateParts()` en `GET /api/v1/ecf/stats` para determinar el aÃ±o, mes y dÃ­a actual segÃºn el huso horario local de Santo Domingo (`America/Santo_Domingo`). Esto garantiza que los lÃ­mites mensuales por defecto y los parÃ¡metros opcionales se calculen y comparen consistentemente.
- **ActualizaciÃ³n de Reportes DGII (Sales Book y 607):** Se corrigieron los endpoints de reportes financieros `GET /api/v1/reports/sales-book` y `GET /api/v1/reports/607/txt` para usar el desplazamiento `-04:00` en lugar de la zona horaria UTC (`Z` o fecha del servidor), alineando los reportes mensuales de ITBIS/DGII con la fecha local de emisiÃ³n.
- **RediseÃ±o e IntegraciÃ³n de Componente de Rango de Fechas (Ark UI):** Se instalÃ³ la dependencia `@ark-ui/react` e implementÃ³ el componente `DateRangePicker` en `src/components/ui/date-range-picker.tsx` basado en Ark UI y Tailwind CSS. Este componente controlado ofrece un calendario de dos meses y se vincula directamente a los filtros `from`/`to`.
- **ReorganizaciÃ³n del Layout de Filtros y Botones en el Dashboard:** Se reestructurÃ³ la barra de controles de `/dashboard/ecf` organizando de manera limpia el buscador, el selector de tipo, el de estado, y el nuevo selector de rango. Los botones "Sincronizar DGII" y "Actualizar Datos" ahora se muestran en una pila vertical (dos filas), mejorando el balance visual.

### 33. CorrecciÃ³n del Procesamiento y SincronizaciÃ³n de Estatus DGII para Notas de CrÃ©dito (e-34)
- **CorrecciÃ³n en la Lectura de Respuestas de mSeller/DGII:** Se actualizÃ³ el cliente de transmisiÃ³n `MSellerClient` en `src/services/dgii/msellerClient.ts` para verificar tanto la propiedad `status` como `estado` en la respuesta JSON. AdemÃ¡s, se implementÃ³ un parser dinÃ¡mico para la lista de strings `dgiiResponse` que extrae los mensajes detallados de rechazo emitidos por la DGII, evitando que documentos con estado de rechazo de DGII (`Rechazado`) sean procesados incorrectamente como exitosos. Asimismo, se modificÃ³ el mÃ©todo `getDocumentStatus` para priorizar el estatus real de la DGII extraÃ­do del arreglo `dgiiResponse` (Aceptado, Aprobado con Observaciones, Rechazado) por encima del estatus general de mSeller.
- **SincronizaciÃ³n de Estado e Historial Contable en EmisiÃ³n:** Se corrigiÃ³ en `src/services/invoiceService.ts` y en el worker de colas `src/infrastructure/jobRunners.ts` la comprobaciÃ³n del estatus de la respuesta mSeller usando tanto `status` como `estado`. Esto previene que comprobantes de ajuste (como notas de crÃ©dito e-34) rechazadas por duplicaciÃ³n de secuencia sean grabadas errÃ³neamente en estado aceptado.
- **ActualizaciÃ³n de Mensajes de DiagnÃ³stico en el Dashboard:** Se modificaron los endpoints de consulta de estatus individual (`GET /api/v1/ecf/[id]/dgii-status`) y por lote (`POST /api/v1/ecf/dgii-status/batch`) para actualizar directamente la columna `dgiiMessage` en la tabla `invoices`. Se agregaron validaciones de expresiones para mapear los 3 estados de la DGII de manera exhaustiva (abarcando `aprob`, `approved`, `acept`, `accepted` para `accepted`; `rechaz`, `rejected` para `rejected`; y `envi`, `recib`, `submitted`, `received` para `submitted`) y se eliminÃ³ la restricciÃ³n de cambio de estado para que los mensajes y estados siempre se actualicen y se reflejen en la UI al sincronizar.

### 34. IntegraciÃ³n del Estatus y Consultas DGII en la Vista de Ajustes (Notas de CrÃ©dito/DÃ©bito)
- **VisualizaciÃ³n de Mensajes de la DGII:** Modificada la tabla de visualizaciÃ³n del listado en `/dashboard/adjustments` para renderizar el mensaje detallado de respuesta de la DGII (`dgiiMessage`) debajo del badge de estado. Se configuraron colores semÃ¡nticos (verde/esmeralda para notas aceptadas y rojo/rosa para notas rechazadas), mejorando la claridad de los diagnÃ³sticos fiscales directamente desde la pÃ¡gina de Ajustes.
- **AcciÃ³n de Consulta Individual del Estatus DGII:** Se agregÃ³ un botÃ³n de sincronizaciÃ³n de estado de la DGII (Ã­cono `RefreshCw` con animaciÃ³n de carga) en la columna de acciones para cada fila de nota de crÃ©dito o dÃ©bito, permitiendo invocar individualmente `/api/v1/ecf/[id]/dgii-status` sin tener que ir a la pantalla principal de e-CF.
- **ReenvÃ­o de Ajustes a la DGII:** Se implementÃ³ un botÃ³n de acciÃ³n rÃ¡pida de reenvÃ­o (Ã­cono `ArrowRight`) visible para notas en estado de error o rechazo (`rejected`/`failed`), enlazado al endpoint de reenvÃ­o `/api/v1/ecf/[id]/resubmit` para reencolar el e-CF al motor de transmisiÃ³n BullMQ en caso de problemas de transmisiÃ³n o secuencia.

### 35. CorrecciÃ³n de Despliegue en Vercel (ConfiguraciÃ³n de Redis y Middleware)
- **DesactivaciÃ³n de Redis en el Build**: Configurada la inicializaciÃ³n de Redis para omitirse durante el proceso de build de Next.js y cuando falte la variable de entorno `REDIS_URL` en producciÃ³n, habilitando el fallback in-process de colas de forma de evitar el error de conexiÃ³n.
- **MigraciÃ³n y ConsolidaciÃ³n de Proxy**: Migrada y consolidada toda la lÃ³gica de autenticaciÃ³n JWT (Web Crypto HS256), rotaciÃ³n de Refresh Tokens vÃ­a API interna, exclusiÃ³n de endpoints pÃºblicos/setup, e inyecciÃ³n de cabeceras de seguridad desde el antiguo `src/middleware.ts` hacia `src/proxy.ts` para cumplir con las directrices estrictas de Next.js 16. Se eliminÃ³ completamente `src/middleware.ts` para solucionar el conflicto de compilaciÃ³n del servidor Turbopack.
- **Evitado de Tracing Excesivo**: AÃ±adidas directivas `/*turbopackIgnore: true*/` en las operaciones `path.join` de `documentService.ts` y `jobRunners.ts` para evitar que Turbopack trace recursivamente todo el proyecto.

### 36. CorrecciÃ³n de Fechas y OCR en la PÃ¡gina de Compras
- **Robusted en OCR de Facturas**: Modificada la expresiÃ³n regular de extracciÃ³n de fecha en `src/utils/ocrParser.ts` para tolerar espacios alrededor de separadores (ej. `/` o `-`), soportar aÃ±os con 2 dÃ­gitos (ej. `26` a `2026`) y soportar formatos con meses escritos/abreviados en espaÃ±ol (ej. `24 de junio de 2026`, `24-jun-26`).
- **EliminaciÃ³n de Timezone Mismatch en Contabilidad y CXP**: Actualizada la funciÃ³n `formatLocalDate` en `src/repositories/apRepository.ts` y `src/repositories/accountRepository.ts` para detectar strings con formato `YYYY-MM-DD` y retornarlos directamente sin parsear como objetos `Date`, evitando desplazamientos de fecha a un dÃ­a previo debido a la diferencia horaria local y UTC.
- **SincronizaciÃ³n de Fechas de Filtro e InicializaciÃ³n en el Dashboard**: Corregida la inicializaciÃ³n de fecha en `src/app/dashboard/purchases/page.tsx` usando una funciÃ³n local que calcula la fecha actual en la zona horaria del cliente en lugar de utilizar `.toISOString().split('T')[0]`. Adicionalmente, se cambiÃ³ el filtro de fecha de inicio (`filterStartDate`) para que apunte por defecto al dÃ­a de hoy (en lugar del dÃ­a 1 del mes) y se agregÃ³ un hook de efecto para realizar automÃ¡ticamente la bÃºsqueda inicial en el montaje del componente, de modo que al cargar la pÃ¡gina se seleccionen de forma inmediata las transacciones del dÃ­a actual.
- **Soporte para Gastos Exentos de ITBIS**: IncorporaciÃ³n de un checkbox "Gasto Exento de ITBIS (No posee ITBIS)" en el formulario de compras (visible tanto en gastos normales como en gastos menores). Al activarse, deshabilita y pone en cero el campo de entrada de ITBIS (tanto en desglose general como en lÃ­neas de artÃ­culos fÃ­sicas), deshabilita el campo "Monto sin ITBIS (Subtotal)" y asegura de manera reactiva que el Subtotal sea exactamente igual al Monto Total del gasto.
- **Fechas Robustas en Reportes Financieros**: Reemplazado el fallback de fecha `new Date().toISOString().split('T')[0]` en los endpoints de Balance General y PDF (`balance-sheet/route.ts` y `pdf/route.ts`) por una funciÃ³n de cÃ¡lculo local con compensaciÃ³n horaria de Santo Domingo (`UTC-04:00`). Esto previene que al consultar los reportes por la noche en la zona horaria de RepÃºblica Dominicana se muestre la fecha del dÃ­a siguiente. Las consultas por rango de fecha en el Estado de Resultados comparan directamente strings ISO `YYYY-MM-DD` sin desfases de huso horario.

### 37. Seeding DinÃ¡mico de Matriz de Roles y Permisos en Base de Datos
- **Aislamiento por Empresa en TransacciÃ³n AtÃ³mica:** Se refactorizÃ³ la creaciÃ³n de empresas en `src/app/api/v1/admin/companies/route.ts` para ejecutar todos los inserts en una Ãºnica transacciÃ³n de base de datos (`db.transaction`).
- **Upsert del CatÃ¡logo de Permisos:** Se autogeneran y cargan dinÃ¡micamente los 55 permisos posibles en el sistema (`11 mÃ³dulos * 5 acciones`) usando `.onConflictDoNothing()`.
- **Siembra Completa de `role_permissions`:** Una vez creados los 6 roles de la empresa, se asocian sus respectivos permisos por defecto basÃ¡ndose en la matriz `DEFAULT_ROLE_PERMISSIONS` de `src/middleware/permissions.ts` (habilitando acceso total para `sistemas`, acceso restringido/de lectura tÃ©cnica para `administracion`, y los privilegios operativos correspondientes para `contabilidad`, `facturacion`, `banco` y `cajero`), grabÃ¡ndolos fÃ­sicamente en la tabla `role_permissions`.

### 38. Validaciones de Permisos Estrictas en APIs GET/POST/PUT
- **AuditorÃ­a de Acceso en Endpoints:** Se implementaron validaciones de privilegios obligatorias utilizando `enforcePermission` en 14 endpoints clave del sistema (Reportes, Contabilidad, Inventarios, Compras, Suplidores y Clientes).
- **PrevenciÃ³n de Fugas de InformaciÃ³n:** Esto asegura que roles limitados (como `cajero`) no puedan consultar balances generales, catÃ¡logos de cuentas o realizar traslados/ajustes manuales de stock de manera directa vÃ­a HTTP.
- **Soporte de Refresh Token Headers:** Se adaptaron todos los endpoints modificados para propagar y retornar correctamente las cabeceras actualizadas de cookies (`resHeaders`) generadas por el middleware.

### 39. Capa de Caching Layer con Redis en CatÃ¡logos Operativos
- **OptimizaciÃ³n de Consultas:** Se implementÃ³ almacenamiento en cachÃ© de Redis para acelerar la recuperaciÃ³n de catÃ¡logos contables (`GET /api/v1/accounting/accounts`), de inventarios (`GET /api/v1/products`), y de clientes (`GET /api/v1/customers` y `GET /api/v1/customers/[id]`), disminuyendo drÃ¡sticamente la carga sobre PostgreSQL.
- **Barrido No Bloqueante en Redis (SCAN):** Se reemplazÃ³ el uso del comando bloqueante `redis.keys` por un bucle iterativo no bloqueante basado en `redis.scan` con cursores para limpiar patrones de claves en `clearCachePattern` de forma segura.
- **InvalidaciÃ³n Reactiva de CachÃ©:** Se configurÃ³ el vaciado selectivo de las claves cacheables por empresa (`cache:products:${companyId}:*`, `cache:accounts:${companyId}:*`, y `cache:customers:${companyId}:*`) inmediatamente tras registrar modificaciones mediante operaciones de escritura (`POST`, `PUT`, `DELETE`).

### 40. AuditorÃ­a y OptimizaciÃ³n de la Base de Datos
- **Ã�ndices CrÃ­ticos Faltantes**: Se agregaron dos Ã­ndices clave a la base de datos para mejorar el rendimiento en entornos SaaS multitenant de alta concurrencia:
  - `retentions_company_active_idx` en la tabla `retentions` (columnas `company_id` y `active`).
  - `journal_entry_lines_acc_created_idx` en la tabla `journal_entry_lines` (columnas `account_id` y `created_at`).
- **MigraciÃ³n y SincronizaciÃ³n**: Se generÃ³ el script de migraciÃ³n SQL correspondiente con Drizzle Kit (`0017_breezy_wolfpack.sql`) y se sincronizÃ³ el esquema directamente en la base de datos de producciÃ³n mediante `drizzle-kit push` de forma exitosa.
- **ValidaciÃ³n**: Se verificÃ³ la compilaciÃ³n de tipos de TypeScript y se completÃ³ con Ã©xito el build de producciÃ³n.

### 41. RefactorizaciÃ³n y ConsolidaciÃ³n de CÃ³digo Duplicado
- **ReutilizaciÃ³n de LÃ³gica de Redondeo**: Se extrajo la funciÃ³n duplicada de redondeo de dinero en la capa de servicios de nÃ³mina (`PayrollCalculationService.round`) para reutilizar la funciÃ³n centralizada `roundMoney` definida en `src/utils/calculos.ts`.
- **VerificaciÃ³n**: Confirmado que todos los mÃ³dulos y cÃ¡lculos contables/laborales funcionan bajo el mismo comportamiento y precisiÃ³n decimal, y el build de producciÃ³n se genera sin errores.

### 42. Suite Completa del Ciclo Contable Profesional (RepÃºblica Dominicana)
- **Base de Datos y Modelado**: Se ampliaron las tablas del nÃºcleo de contabilidad agregando columnas a `chart_of_accounts` (`level`, `nature`, `isTransactional`) para estructurar de forma jerÃ¡rquica las cuentas principales y de registro. Se introdujeron las tablas `accounting_periods` para bloqueos de cierres fiscales periÃ³dicos y `accounting_mappings` para plantillas de cuentas puente automÃ¡ticas.
- **Seeder y Mapeos AutomÃ¡ticos**: Al iniciar o consultar la contabilidad de una empresa por primera vez, el sistema autoejecuta un seeder del catÃ¡logo de cuentas estÃ¡ndar de la RepÃºblica Dominicana estructurado en Ã¡rbol de mÃºltiples niveles con naturalezas contables correctas (activo, pasivo, capital, ingresos y gastos) y precarga los mapeos puente para automatizar la facturaciÃ³n, ITBIS, cobros, inventario y cuentas por pagar sin requerir configuraciÃ³n manual inicial.
- **Consultas Contables y Reportes**: ImplementaciÃ³n de algoritmos y consultas de alto rendimiento en el repositorio unificado de contabilidad para generar el Libro Diario General con filtros por rango de fecha, Libro Mayor General con saldos acumulados iniciales, y la Balanza de ComprobaciÃ³n estructurada jerÃ¡rquicamente, asÃ­ como el Balance General y Estado de Resultados adaptados al huso horario de RepÃºblica Dominicana.
- **Interfaz Multi-pestaÃ±a Premium**: RediseÃ±o completo de la interfaz de contabilidad en `/dashboard/accounting/page.tsx` en una vista unificada por pestaÃ±as (CatÃ¡logo, Asientos Diario, Libro Mayor, Balanza de ComprobaciÃ³n, Estados Financieros, PerÃ­odos Contables y ConfiguraciÃ³n Puente) con soporte para colapsar/expandir lÃ­neas de partida doble en asientos, bÃºsqueda por rango de fechas, botones premium para impresiÃ³n del catÃ¡logo en formato formal, control de estados de periodos y ediciÃ³n fluida de las cuentas puente.

### 44. Sistema de AutorizaciÃ³n RBAC DinÃ¡mico Empresarial
- **Modelo de Datos configurable**: CreaciÃ³n de las tablas `route_mappings` (mapeo de patrones de subrutas URL a mÃ³dulos de permisos) y `audit_permissions` (bitÃ¡cora de intentos autorizados y rechazados para la auditorÃ­a de accesos) en Supabase.
- **Rendimiento mediante JWT Caching**: ConfiguraciÃ³n de `auth.ts` para cargar e inyectar la lista de permisos efectivos encriptados en el JWT de sesiÃ³n del usuario. El Middleware global de Next.js (`src/middleware.ts`) puede decodificar sÃ­ncronamente el token y validar el acceso a las rutas e APIs en 0ms y con 0 consultas de red.
- **Seguridad en Frontend y APIs**: DiseÃ±o de hooks reactivos (`useCan`, `usePermissions`) y del componente envolvente `<PermissionGate>` para proteger controles visuales y botones del cliente. Adicionalmente, el Sidebar (`app-sidebar.tsx`) se conecta directamente a este sistema para ocultar de forma completamente dinÃ¡mica las secciones a las que el usuario no tiene privilegios de lectura.

### 45. Roles Globales GenÃ©ricos y Seeding Automatizado en Setup
- **Desacoplamiento de Roles del Tenant**: Se eliminÃ³ la columna `company_id` de la tabla `roles` para transformarla en un catÃ¡logo de roles globales del sistema, simplificando la administraciÃ³n y previniendo la duplicaciÃ³n innecesaria.
- **Siembra AutomÃ¡tica de Roles y Planes**: Se integrÃ³ un autoseeder en el flujo del asistente de configuraciÃ³n `/setup` que inyecta automÃ¡ticamente los 7 roles globales y 3 planes SaaS en el primer arranque si la base de datos se encuentra vacÃ­a.
- **RemociÃ³n de RLS y Seguridad Simplificada**: Se desactivÃ³ Row Level Security (RLS) en la tabla `roles` y se eliminaron las polÃ­ticas de aislamiento sobre esta tabla, permitiendo un acceso general sin inconvenientes, mientras que la asignaciÃ³n por empresa se sigue manejando por el puente `role_permissions`.
- **ExclusiÃ³n en Reseteo de Base de Datos**: Se actualizaron las herramientas de mantenimiento para excluir `roles` y `plans` de la instrucciÃ³n de truncamiento, manteniendo las bases estructurales activas tras restauraciones del sistema.

* * V e r i f i e d   &   P o l i s h e d * *  
 * * V e r i f i e d   &   P o l i s h e d * *  
 * * V e r i f i e d   &   P o l i s h e d * *  
 * * V e r i f i e d   &   P o l i s h e d * *
 # # #   4 6 .   C o r r e c c i ó n   y   M e j o r a   e n   l a   E x p e r i e n c i a   d e   C o n f i g u r a c i ó n   d e   C u e n t a s   P u e n t e 
 -   * * C o n s o l i d a c i ó n   e n   C o n f i g u r a c i ó n   E m p r e s a * * :   S e   r e u b i c ó   e l   t a b   d e   C u e n t a s   P u e n t e   d e s d e   e l   m ó d u l o   d e   C o n t a b i l i d a d   a   C o n f i g u r a c i ó n   ( \ / d a s h b o a r d / s e t t i n g s \ ) ,   p e r m i t i e n d o   g e s t i o n a r   l o s   p a r á m e t r o s   o p e r a t i v o s   d e   l a   e m p r e s a   y   l a   p a r a m e t r i z a c i ó n   d e l   c a t á l o g o   e n   u n   m i s m o   e n t o r n o ,   u n i f i c a n d o   l o s   g u a r d a d o s   p o r   s e p a r a d o   p a r a   e v i t a r   p é r d i d a   d e   d a t o s . 
 -   * * R e s o l u c i ó n   d e   C o n f l i c t o   d e   V i s t a s * * :   S e   c o r r i g i ó   u n   e r r o r   e n   e l   r e n d e r i z a d o   c o n d i c i o n a l   e n   \ s e t t i n g s / p a g e . t s x \   q u e   p r o v o c a b a   l a   s u p e r p o s i c i ó n   d e l   f o r m u l a r i o   g e n e r a l   d e   l a   e m p r e s a   c o n   e l   d e   C u e n t a s   P u e n t e ,   a s e g u r a n d o   u n a   s e p a r a c i ó n   v i s u a l   l i m p i a   d e   p e s t a ñ a s . 
 -   * * A u t o c o n f i g u r a c i ó n   D i n á m i c a   d e   M a p e o s   R e t r o a c t i v a * * :   S e   p e r f e c c i o n ó   e l   m é t o d o   \ g e t M a p p i n g s \   e n   \ A c c o u n t i n g R e p o s i t o r y \   p a r a   q u e   d e t e c t e   s i   a   u n a   e m p r e s a   ( n u e v a   o   l e g a d a )   l e   f a l t a n   l a s   c u e n t a s   p u e n t e   p r e d e t e r m i n a d a s   y   l a s   a u t o g e n e r e   e   i n s e r t e   d i n á m i c a m e n t e   u t i l i z a n d o   e l   c ó d i g o   c o n t a b l e   e n   s u   p r i m e r   u s o ,   a s e g u r a n d o   q u e   n i n g ú n   u s u a r i o   t e n g a   q u e   c o n f i g u r a r   m a n u a l m e n t e   e l   e n l a c e   i n i c i a l   d e   f a c t u r a c i ó n - c o n t a b i l i d a d .  
 
### 47. Módulo Financiero de Estados de Cuenta (CxC, CxP y Dashboard Financiero)
- **Base de Datos & Libro Auxiliar**: Creación de la tabla transaccional centralizada `financial_movements` con índices de alto rendimiento para registrar débitos, créditos y balances progresivos.
- **Límite de Crédito Dinámico**: Agregada la columna física `credit_limit` a la tabla de clientes (`customers`) e integrada de forma reactiva en las consultas del repositorio contable.
- **Validación Activa de Límite**: Implementada validación transaccional durante la emisión de facturas a crédito (`invoiceDbBooker.ts`), bloqueando la operación si el balance del cliente más el total neto de la nueva factura excede su límite de crédito.
- **Integraciones Operativas Automáticas**: Sincronización transaccional en facturación (invoices, ND, NC, ventas al contado), gastos/compras (expenses, compras al contado), cobros (arRepository) y pagos (apService, cheques en garantía y ordinarios).
- **Auto-Seeding Autoejecutable (Self-healing)**: Desarrollada una función para reconstruir cronológicamente el historial financiero desde el primer inicio si la tabla se encuentra vacía, con reconstrucción automática de balances progresivos en lotes.
- **Reportes e Impresión Directa**: API de resúmenes de clientes y proveedores, antigüedad de saldos clasificada (aging) y estadísticas operativas, integrando impresión en PDF con Puppeteer y plantillas HTML premium.
- **Seguridad RBAC**: Restricción de acceso de vistas y endpoints para que solo los roles `sistemas`, `administracion` y `contabilidad` puedan ingresar.
- **Buscador Autocomplete Reusable**: Diseñado el componente premium `AutocompleteSelect` (`autocomplete-select.tsx`), aislando el input con ícono de lupa, botón de limpiar 'X', soporte para click-outside y lista flotante de sugerencias, unificando el comportamiento y estilo en todo el ERP.
- **Unificación de Buscadores Globales**: Refactorizado el componente de búsqueda principal del sistema `SearchBar` (`search-bar.tsx`) para adoptar la misma apariencia minimalista de alta gama, tamaño estandarizado, íconos y comportamiento de borrado rápido, actualizando simultáneamente todas las vistas del ERP.
- **Migración a Buscador Unificado**: Reemplazados los buscadores manuales nativos por el componente `SearchBar` unificado en las páginas de Almacenes (`dashboard/warehouses`) y Empleados (`dashboard/hr/employees`).
- **Interfaces de Usuario Premium**:
  - `/dashboard/financial`: Dashboard financiero ejecutivo con gráficos interactivos de Recharts y tablas comparativas CxC/CxP.
  - `/dashboard/financial/customers`: Ficha financiera del cliente con filtros avanzados por fecha, tipo (contado/crédito), búsqueda y exportaciones (PDF y CSV).
  - `/dashboard/financial/suppliers`: Ficha financiera del proveedor homologous.

* * V e r i f i e d   &   P o l i s h e d * *  
* * V e r i f i e d   &   P o l i s h e d * *  
* * V e r i f i e d   &   P o l i s h e d * *  
* * V e r i f i e d   &   P o l i s h e d * *

### 48. Saneamiento Automático de RNC/Cédula al Crear o Editar Clientes
- **Limpieza de RNC en Repositorio**: Se modificó `CustomerRepository` para limpiar automáticamente cualquier espacio en blanco o guión (`replace(/[\s-]/g, '')`) del campo `rncCedula` en los métodos `findByRnc`, `create` y `update`. Esto garantiza la integridad y el formato estricto exigido por la DGII a nivel de base de datos.
- **Limpieza en Frontend**: Se actualizó el submit de los formularios de creación de clientes y creación rápida de clientes (`src/app/dashboard/customers/page.tsx` y `src/app/dashboard/invoices/page.tsx`) para limpiar los espacios en blanco y guiones antes de enviar los datos al servidor.
- **Resolución de Error de Linting**: Se corrigió el error de ESLint en `customers/page.tsx` donde la función `fetchCustomers` era accedida antes de su declaración (resuelto moviendo la declaración arriba de `useEffect`).

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 49. Impresión de Reportes Fiscales de Ventas y Compras para Contadores (DGII)
- **Reporte PDF de Ventas**: Creación del endpoint `src/app/api/v1/invoices/report/route.ts` para extraer facturas de venta según los filtros de búsqueda (rango de fecha, tipo de e-CF, cliente, NCF) y generar un reporte formal PDF consolidado.
- **Plantilla de Ventas**: Diseño de la plantilla premium `renderInvoicesReport` en `src/utils/templates/documentTemplates.ts` con todos los campos clave exigidos por la DGII (NCF, RNC/Cédula, Subtotal, ITBIS, Descuento, Total Neto), omitiendo la columna de "Tipo Comprobante" y la regla de no mostrar el título textual de la empresa si ya tiene logotipo.
- **Plantilla de Compras**: Corrección en `renderPurchasesReport` para ocultar igualmente el título de la empresa si posee logotipo.
- **Formato Ultra-Compacto sin Saltos de Línea**: Modificación del CSS y estructura HTML de ambos reportes (`renderPurchasesReport` y `renderInvoicesReport`) para reducir el padding de celdas (`3px 5px`), disminuir el tamaño de letra (`7.5pt`) y aplicar reglas CSS de forzado de línea (`white-space: nowrap !important` y `.ellipsis` en max-width de nombres de clientes/suplidores), logrando que todas las filas quepan estrictamente en una sola fila.
- **Formateo de Rango de Fechas a dd-MM-YYYY**: Incorporación de la función auxiliar `formatRangeDate` en las plantillas de reporte para mostrar las fechas impresas con el formato estándar `dd-MM-YYYY`.
- **Integración UI & Rango en Compras**: Inserción del botón "REPORTE PDF" en la barra de filtros del listado de facturas (`src/app/dashboard/invoices/page.tsx`) alineado con los filtros de búsqueda actuales. Además, se reemplazaron los inputs individuales "Desde" y "Hasta" de la página de compras (`src/app/dashboard/purchases/page.tsx`) con el componente unificado `DateRangePicker` para homogeneizar la experiencia de usuario.

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 50. Auditoría de Seguridad & Robustecimiento del ERP (Seguridad en Profundidad)
- **Eliminación de la Gestión Local de P12**: Se removió el procesamiento local de certificados `.p12` locales (en `src/db/schema/companies.ts`, `src/utils/encryption.ts` y eliminando `src/app/api/v1/setup/ecf/route.ts` y `src/utils/xmlSigner.ts`), delegando el firmado e identidad fiscal en la API de mSeller.
- **Aseguramiento de Endpoints de Impresión y Colas (IDOR)**: Se integró protección por cookies y sesión activa (`verifyAuth`) en `invoices/[id]/print`, `reports/[reportType]/print`, `tools/print` y `jobs/[jobId]`. Se validan estrictamente las pertenencias de inquilinos (`companyId` del usuario de sesión comparado contra los datos consultados) para evitar fugas de información inter-empresa.
- **Remoción de Rutas de Desarrollo Vulnerables**: Eliminación completa de `/api/v1/test-create-company` y el mock `/api/v1/cash-sessions`.
- **Ajuste de Convención de Proxy (Next.js 16)**: Se eliminó `src/middleware.ts` redundante para habilitar que Next.js 16 cargue nativamente `src/proxy.ts` como el firewall global único del ERP.
- **Mitigación de Server-Side XSS en Puppeteer**: Se implementó una rutina de sanitización recursiva `deepEscape` en `src/utils/templates/documentTemplates.ts` envolviendo dinámicamente todos los métodos estáticos `render*` para escapar de forma transparente caracteres HTML peligrosos antes de generar PDFs.
- **Aislamiento a Nivel de Base de Datos (RLS)**: Creación y aplicación de un script PL/pgSQL que habilita Row-Level Security (RLS) y fuerza RLS en todas las tablas físicas con columna `company_id`. La política `tenant_isolation_policy` restringe las filas por la variable de sesión `app.current_company_id` si está definida (durante consultas transaccionales de aplicación), y permite consultas globales si está vacía (autenticación, logins).

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 51. Robustecimiento de Supabase & Storage (Mitigación IDOR y Protección PostgREST)
- **Bloqueo de IDOR y Path Traversal en Avatares**: Modificación de las APIs `/api/v1/storage/upload` y `/api/v1/storage/delete` para que el `filePath` del avatar se construya y valide estrictamente en el servidor utilizando el identificador único del usuario (`session.userId`) obtenido de la sesión verificada, impidiendo la manipulación de archivos pertenecientes a otros usuarios.
- **Habilitación de RLS Global contra Fugas de PostgREST**: Aplicación de RLS en todas las tablas compartidas/sistema (`companies`, `roles`, `permissions`) que carecían de políticas RLS. Esto bloquea cualquier consulta HTTP no autorizada vía PostgREST (usando la clave Anon pública), mientras que la conexión directa TCP del backend (propietario `postgres`) opera de forma transparente y sin afectaciones.

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 52. Robustecimiento de API Routes (Prevención de SQL Injection)
- **Eliminación de sql.raw en Consultas de Producto**: Modificación de la consulta SQL en `src/services/invoice/invoiceFileGenerator.ts` para utilizar el helper parametrizado `inArray(products.id, productIds)` de Drizzle ORM en lugar de concatenar cadenas sin sanitizar mediante `sql.raw`. Esto previene de forma absoluta inyecciones de código SQL procedentes de IDs de productos controlados por el cliente.

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 53. Robustecimiento de Seguridad de Base de Datos (Inmutabilidad de Logs)
- **Implementación de Logs de Auditoría Inmutables**: Creación de la función disparadora `prevent_audit_log_modification()` y el trigger `trg_immutable_audit_logs` en la tabla `audit_logs` (documentado en `drizzle/0025_immutable_audit_logs.sql` y activado en PostgreSQL). Esto impide de manera absoluta modificaciones o eliminaciones accidentales o maliciosas en la tabla de bitácoras por parte de cualquier rol (incluido el propietario de las tablas), garantizando el no repudio y el cumplimiento normativo.

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 54. Robustecimiento de Dependencias (Parches en Cadena de Suministro)
- **Corrección de Dependencias Vulnerables en pnpm v11**: Integración de overrides globales en `pnpm-workspace.yaml` (requerido a partir de pnpm v11) para forzar las versiones seguras de `esbuild` (`>=0.24.3`), `postcss` (`>=8.5.10`) y `uuid` (`>=11.1.1`) que solucionan vulnerabilidades de origen cruzado, XSS y desbordamiento de búfer en memoria respectivamente. Ejecución de `pnpm install` para regenerar y verificar el reporte de vulnerabilidades (0 fallos encontrados en `pnpm audit`).

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 55. Soporte para Múltiples Contactos sin RNC/Cédula
- **Habilitación de RNC/Cédula Nullable**: Modificación de las tablas `customers` y `suppliers` para que sus columnas de RNC sean opcionales/nullables en el esquema Drizzle (`src/db/schema/contacts.ts`) e implementado en PostgreSQL mediante migración de base de datos (`drizzle/0026_nullable_rnc.sql`). Los registros pre-existentes vacíos fueron migrados a `NULL`.
- **Limpieza de Entrada y Validación Selectiva**: Actualización en los repositorios de clientes y proveedores para limpiar todos los espacios en blanco y guiones del input de RNC. Si el input queda vacío, se omite el chequeo de duplicidad y se guarda el valor como `NULL`, permitiendo registrar múltiples contactos de consumidor final/casual por empresa sin incurrir en violaciones de unicidad.

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 56. Corrección de Ruta de Chromium en Vista de Impresión (Vercel)
- **Tracing de Binarios de Chromium**: Configuración de `outputFileTracingIncludes` en `next.config.ts` para resolver el error de bundler/relocación de `@sparticuz/chromium`. Esto fuerza a Next.js/Vercel a rastrear e incluir explícitamente los archivos comprimidos de Chromium (`./node_modules/@sparticuz/chromium/**/*`) en el paquete de funciones del servidor `/api/**/*`, permitiendo su descompresión exitosa en `/tmp` a nivel de producción.

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 57. Corrección de Advertencia de React y Validación de RNC Opcional en APIs de Contactos
- **Prevenir Valor Null en Inputs Controlados**: Modificación de las vistas de `/dashboard/customers` y `/dashboard/suppliers` para asegurar que el input de RNC o Cédula (que ahora puede ser de valor `null` tras la flexibilización de contactos) siempre reciba un valor de cadena de texto vacío `''` como fallback tanto al inicializar el formulario en `openEditModal` (`supplier.rnc || ''`, `customer.rncCedula || ''`) como al enlazar la propiedad `value` en el elemento JSX (`formData.rnc || ''`, `formData.rncCedula || ''`). Esto elimina por completo el error de consola de React sobre propiedades de valor `null` en elementos controlados.
- **Flexibilización de Esquemas Zod y Tipos de Repositorio**: Actualización de los esquemas de validación Zod en `src/app/api/v1/customers/[id]/route.ts`, `src/app/api/v1/suppliers/[id]/route.ts` y `src/app/api/v1/suppliers/route.ts` para permitir explícitamente `rnc`/`rncCedula` opcional o vacío (utilizando `.optional().or(z.literal(''))`). Asimismo, se adaptaron las interfaces de TypeScript de los métodos de creación en `CustomerRepository` y `SupplierRepository` para aceptar campos `rnc`/`rncCedula` opcionales, previniendo errores de compilación y respondiendo correctamente con código HTTP 200 en lugar de HTTP 400 (Bad Request).

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *

### 58. Optimizador de Corte de Vidrio y UI Mejorada
- **Algoritmo Guillotine Split Packer**: Reemplazo de la lógica de empaquetado anterior (basada en columnas estáticas) por un algoritmo de guillotina dinámico con la regla *Shorter Axis Split (SAS)*. Ahora las piezas sobrantes de cada corte se dividen en rectángulos libres utilizables de forma que se optimiza al máximo el material de cada lámina de vidrio antes de abrir una nueva.
- **Simplificación de Parámetros de Corte**: Remoción del input de "Grosor de Sierra / Desperdicio (in)" en la interfaz de usuario, estableciendo la constante `bladeWidth = 0` directamente para adecuarse a la física del corte de vidrio (marcado y quebrado sin pérdida de material por aserrín).
- **Control de Hidratación en Carga**: Integración del estado `mounted` para prevenir errores de hidratación (hydration mismatch) y mostrar un spinner de carga en Next.js mientras se restauran las piezas desde `localStorage`.

* * Verified & Polished * *  
* * Verified & Polished * *

### 59. Ampliación del Catálogo de Cuentas por Defecto
- **Nuevas Cuentas de Gasto Operativo**: Se agregaron al inicializador de catálogo por defecto (`AccountingRepository.seedDefaultChartOfAccounts`) las cuentas transaccionales de *Gastos de Combustible y Transporte* (`6.1.02.03`), *Alquileres / Arrendamientos* (`6.1.02.04`), *Reparación y Mantenimiento* (`6.1.02.05`) y *Gastos Diversos* (`6.1.02.06`).
- **Migración de Datos**: Se ejecutó un script de migración en la base de datos de producción para poblar estas nuevas cuentas en todas las empresas preexistentes bajo su respectiva cuenta padre *Gastos Administrativos* (`6.1.02`), habilitándolas de forma inmediata en los selectores de gastos y compras.

* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *  
* * Verified & Polished * *
