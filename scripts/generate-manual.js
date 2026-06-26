const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Manual de Usuario y Operaciones - ContFast Enterprise</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      line-height: 1.6;
      font-size: 13px;
      background-color: #ffffff;
    }
    
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 60px;
      box-sizing: border-box;
      background: linear-gradient(135deg, #001e40 0%, #003366 100%);
      color: #ffffff;
      page-break-after: always;
    }
    
    .cover-header {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 2px;
      color: #005e6a;
      text-transform: uppercase;
    }
    
    .cover-middle {
      margin-top: 100px;
    }
    
    .cover-middle h1 {
      font-size: 38px;
      font-weight: 800;
      line-height: 1.15;
      margin: 0 0 15px 0;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    
    .cover-middle h2 {
      font-size: 18px;
      font-weight: 400;
      margin: 0 0 30px 0;
      color: #005e6a;
      letter-spacing: 0.5px;
    }
    
    .cover-divider {
      width: 80px;
      height: 5px;
      background-color: #d4af37;
      border-radius: 2px;
    }
    
    .cover-footer {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.8;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 20px;
    }
    
    .cover-footer-grid {
      display: grid;
      grid-cols: 2;
      display: flex;
      justify-content: space-between;
    }
    
    .page {
      padding: 20px 0;
      box-sizing: border-box;
      page-break-after: always;
    }
    
    .page:last-child {
      page-break-after: avoid;
    }
    
    .section-title {
      font-size: 20px;
      font-weight: 800;
      color: #003366;
      border-bottom: 2px solid #005e6a;
      padding-bottom: 8px;
      margin-top: 0;
      margin-bottom: 24px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .subsection-title {
      font-size: 14px;
      font-weight: 700;
      color: #005e6a;
      margin-top: 24px;
      margin-bottom: 12px;
      border-left: 3px solid #d4af37;
      padding-left: 10px;
    }
    
    p {
      margin-top: 0;
      margin-bottom: 14px;
      text-align: justify;
      color: #334155;
    }
    
    .intro-lead {
      font-size: 15px;
      font-weight: 500;
      color: #003366;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    
    ul, ol {
      margin-top: 0;
      margin-bottom: 16px;
      padding-left: 20px;
      color: #334155;
    }
    
    li {
      margin-bottom: 6px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 11px;
    }
    
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      text-align: left;
    }
    
    th {
      background-color: #f1f5f9;
      color: #003366;
      font-weight: 700;
    }
    
    tr:nth-child(even) {
      background-color: #f8fafc;
    }
    
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }
    
    .badge-blue { background-color: #e0f2fe; color: #0369a1; }
    .badge-amber { background-color: #fef3c7; color: #b45309; }
    .badge-green { background-color: #dcfce7; color: #15803d; }
    .badge-red { background-color: #fee2e2; color: #b91c1c; }
    
    .alert-box {
      background-color: #fef3c7;
      border: 1px solid #fde68a;
      border-left: 4px solid #d97706;
      padding: 12px 16px;
      border-radius: 8px;
      margin: 16px 0;
      font-size: 12px;
      color: #78350f;
    }
    
    .alert-box.info {
      background-color: #f0f9ff;
      border-color: #bae6fd;
      border-left-color: #0284c7;
      color: #0369a1;
    }
    
    .alert-box.success {
      background-color: #f0fdf4;
      border-color: #bbf7d0;
      border-left-color: #16a34a;
      color: #14532d;
    }
    
    .step-list {
      list-style-type: none;
      padding-left: 0;
    }
    
    .step-item {
      position: relative;
      padding-left: 28px;
      margin-bottom: 14px;
    }
    
    .step-number {
      position: absolute;
      left: 0;
      top: 2px;
      width: 18px;
      height: 18px;
      background-color: #005e6a;
      color: #ffffff;
      border-radius: 50%;
      text-align: center;
      font-size: 11px;
      line-height: 18px;
      font-weight: 700;
    }
    
    .feature-card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
    
    .feature-card h4 {
      margin-top: 0;
      margin-bottom: 8px;
      color: #003366;
      font-size: 13px;
      font-weight: 700;
    }
    
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 16px 0;
    }
    
    .toc-list {
      list-style: none;
      padding-left: 0;
    }
    
    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 10px;
    }
    
    .toc-name {
      font-weight: 600;
      color: #003366;
    }
    
    .toc-dots {
      flex-grow: 1;
      border-bottom: 1px dotted #cbd5e1;
      margin: 0 10px;
    }
    
    .toc-page {
      font-weight: 600;
      color: #005e6a;
    }
  </style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover-page">
    <div class="cover-header">
      ContFast Enterprise
    </div>
    <div class="cover-middle">
      <h1>Manual de Usuario<br>y Guía de Operaciones</h1>
      <h2>Sistema ERP & Facturación Electrónica (e-CF)</h2>
      <div class="cover-divider"></div>
    </div>
    <div class="cover-footer">
      <div class="cover-footer-grid">
        <div>
          <strong>Documentación Oficial</strong><br>
          República Dominicana — Versión 2.0 (2026)
        </div>
        <div style="text-align: right;">
          <strong>Desarrollado para:</strong><br>
          Latin Doors SRL & Empresas Afiliadas
        </div>
      </div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS -->
  <div class="page">
    <h2 class="section-title">Tabla de Contenidos</h2>
    <p class="intro-lead">Esta guía detalla el funcionamiento de ContFast Enterprise para la operación de los módulos fiscales, administrativos y de producción.</p>
    
    <ul class="toc-list" style="margin-top: 40px;">
      <li class="toc-item">
        <span class="toc-name">1. Introducción y Arquitectura Multi-Empresa</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 3</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">2. Módulo de Facturación Electrónica (e-CF)</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 4</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">3. Notas de Crédito (e-34) y Notas de Débito (e-33)</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 6</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">4. Compras, Gastos y Reporte Fiscal 606</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 7</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">5. Gestión de Cheques en Garantía (CXP)</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 8</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">6. Cuentas por Cobrar e Historial de Clientes</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 10</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">7. Control de Cajas y Arqueo de Efectivo</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 11</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">8. Procesamiento de Nómina y Recursos Humanos (TSS e ISR)</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 12</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">9. Herramientas Técnicas de Taller y Producción</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 14</span>
      </li>
      <li class="toc-item">
        <span class="toc-name">10. Configuración del Sistema, Roles y Contingencias</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pág. 15</span>
      </li>
    </ul>
  </div>

  <!-- SECTION 1 -->
  <div class="page">
    <h2 class="section-title">1. Introducción y Arquitectura Multi-Empresa</h2>
    <p class="intro-lead">ContFast Enterprise es una solución de planificación de recursos empresariales (ERP) diseñada bajo los estándares técnicos y tributarios de la República Dominicana.</p>
    
    <p>El sistema se destaca por su integración nativa con la facturación electrónica (e-CF) bajo la Ley 51-23, permitiendo una comunicación en tiempo real con la Dirección General de Impuestos Internos (DGII) sin interrumpir las operaciones cotidianas de venta.</p>

    <h3 class="subsection-title">Aislamiento Multi-Empresa (Multi-Tenant Isolation)</h3>
    <p>El sistema opera bajo un esquema multi-tenant riguroso. Cada empresa cargada en el sistema cuenta con su propio identificador único (Company ID) y sus datos permanecen aislados de forma lógica a nivel de consultas de base de datos:</p>
    <ul>
      <li><strong>Seguridad de Datos:</strong> Ningún usuario de una compañía puede visualizar transacciones, clientes, suplidores o balances de otra compañía.</li>
      <li><strong>Persistencia de Sesión:</strong> Cuando un usuario con permisos administrativos cambia de empresa activa a través del selector en la esquina superior del dashboard, el sistema guarda esa preferencia de forma persistente. La sesión activa y los tokens de seguridad de refresco mantendrán el identificador seleccionado incluso tras recargar la página.</li>
    </ul>

    <h3 class="subsection-title">Contabilidad de Doble Entrada Automatizada</h3>
    <p>Toda acción operativa en el sistema genera automáticamente su contrapartida contable en el Diario General (ledger) respetando el catálogo de cuentas de la empresa. Al facturar, cobrar, registrar gastos o pagar nóminas, el sistema genera de forma invisible los asientos de Débito y Crédito correspondientes, garantizando que el Balance General y el Estado de Resultados estén actualizados en tiempo real.</p>
  </div>

  <!-- SECTION 2 -->
  <div class="page">
    <h2 class="section-title">2. Módulo de Facturación Electrónica (e-CF)</h2>
    <p class="intro-lead font-medium">Este módulo gestiona la emisión, validación y control de Comprobantes Fiscales Electrónicos de acuerdo con los requisitos exigidos por la DGII.</p>
    
    <p>El sistema soporta los siguientes tipos de e-CF más comunes en el comercio dominicano:</p>
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Tipo de Comprobante Fiscal Electrónico (e-CF)</th>
          <th>Propósito Comercial</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>e-31</strong></td>
          <td>Factura de Crédito Fiscal Electrónica</td>
          <td>Ventas a empresas o profesionales independientes que requieren sustentar gastos e ITBIS para su declaración de impuestos (607/606).</td>
        </tr>
        <tr>
          <td><strong>e-32</strong></td>
          <td>Factura de Consumo Electrónica</td>
          <td>Ventas a consumidores finales. No requiere NCF de crédito fiscal y no traslada ITBIS deducible.</td>
        </tr>
        <tr>
          <td><strong>e-41</strong></td>
          <td>Comprobante de Compras Electrónico</td>
          <td>Registra adquisiciones realizadas a personas físicas no registradas ante la DGII.</td>
        </tr>
        <tr>
          <td><strong>e-45</strong></td>
          <td>Comprobante Gubernamental Electrónico</td>
          <td>Ventas de bienes o servicios facturados a instituciones del Estado dominicano.</td>
        </tr>
      </tbody>
    </table>

    <h3 class="subsection-title">Flujo paso a paso para la emisión de una Factura</h3>
    <ol class="step-list">
      <li class="step-item">
        <span class="step-number">1</span>
        <strong>Acceso e Información del Cliente:</strong> Navegue a <em>Facturación</em> > <em>Nueva Factura</em>. Seleccione el cliente. El RNC y la razón social se cargarán automáticamente.
      </li>
      <li class="step-item">
        <span class="step-number">2</span>
        <strong>Carga de Líneas:</strong> Presione "Añadir Línea". Seleccione el producto o servicio del catálogo. El costo unitario se cargará por defecto.
      </li>
      <li class="step-item">
        <span class="step-number">3</span>
        <strong>Descuento Unitario:</strong> Puede aplicar un importe de descuento por unidad directamente en la fila. El total de la línea recalculará automáticamente restando el descuento y aplicando el ITBIS (18%) sobre el importe neto resultante.
      </li>
      <li class="step-item">
        <span class="step-number">4</span>
        <strong>Notas de la Factura:</strong> Ingrese cualquier observación o detalle adicional en el campo de texto "Notas de la Factura". Este campo admite múltiples líneas y se imprimirá de forma elegante en la sección inferior del PDF Carta.
      </li>
      <li class="step-item">
        <span class="step-number">5</span>
        <strong>Condición de Pago:</strong> Elija el método (Efectivo, Transferencia o A Crédito). Si es a crédito, se definirá el plazo de cuentas por cobrar.
      </li>
      <li class="step-item">
        <span class="step-number">6</span>
        <strong>Procesar y Emitir:</strong> Presione "Emitir Factura". El sistema firmará digitalmente el archivo XML mediante llaves criptográficas y lo enviará al servicio mSeller conectado a la DGII.
      </li>
    </ol>
  </div>

  <!-- SECTION 2 PART 2 -->
  <div class="page">
    <h2 class="section-title">2. Módulo de Facturación Electrónica (Continuación)</h2>
    
    <h3 class="subsection-title">Imprenta Digital y visualización (PDF Stream)</h3>
    <p>Una vez que el comprobante es aprobado por la DGII, el sistema devuelve la respuesta y genera la representación impresa. El flujo de impresión ha sido optimizado con un motor Puppeteer de alto rendimiento que genera un archivo PDF idéntico al formato oficial pre-impreso de la empresa:</p>
    <ul>
      <li><strong>Formato A4/Carta:</strong> Cuenta con un diseño sofisticado que incluye barra de condición de pago enmarcada en color turquesa corporativo, detalle de artículos con descuento base y un bloque de resumen con relleno de puntos dinámico en monospace.</li>
      <li><strong>Firma Criptográfica:</strong> En la parte inferior se detalla el código QR oficial de la DGII, fecha y hora de la firma, trackId de autorización y el código de seguridad de firma.</li>
      <li><strong>Descarga Directa:</strong> Al presionar "Imprimir", el sistema transmite el PDF como un stream de datos binario directo en una pestaña nueva, evitando descargas de archivos JSON corruptos o ventanas de carga lentas.</li>
    </ul>

    <div class="alert-box info">
      <strong>Información Técnica:</strong> La secuencia NCF se maneja de forma segura. El sistema reserva y consume el número secuencial de comprobante de manera estricta dentro de la transacción final de guardado de base de datos. Esto evita saltos involuntarios en la numeración aprobada por la DGII ante interrupciones de red o fallos momentáneos de comunicación.
    </div>

    <h3 class="subsection-title">Visualización de Historial y Notificaciones</h3>
    <p>Desde la pantalla de historial de facturas, usted puede consultar el estado de cada e-CF emitido. Los comprobantes exitosos se muestran con etiquetas verdes indicando "Aceptado por DGII". En caso de requerir el envío manual de la factura por correo electrónico al cliente, el sistema incorpora un botón de reenvío rápido que adjunta el XML firmado y la representación en PDF.</p>
  </div>

  <!-- SECTION 3 -->
  <div class="page">
    <h2 class="section-title">3. Notas de Crédito (e-34) y Notas de Débito (e-33)</h2>
    <p class="intro-lead">Los comprobantes de ajuste permiten corregir errores, aplicar descuentos globales posteriores o anular facturas que ya han sido transmitidas y validadas por la DGII.</p>

    <h3 class="subsection-title">Notas de Crédito Electrónicas (e-34)</h3>
    <p>Se emiten para anular facturas, procesar devoluciones de mercancías o rebajar saldos de cuentas por cobrar. El proceso es directo en el sistema:</p>
    <ul>
      <li><strong>Acceso Rápido:</strong> En la lista de facturas, ubique la factura aceptada y presione el botón "Emitir Nota de Crédito".</li>
      <li><strong>Precarga y Referencia:</strong> El sistema cargará un formulario de facturación idéntico pero bajo la denominación e-34, con los artículos originales precargados y, de manera crucial, enlazará el NCF original en el campo <code>modifiedNcf</code>. Esto poblará la sección <code>&lt;TablaReferencia&gt;</code> exigida por la DGII para enlazar el ajuste.</li>
      <li><strong>Reingreso de Inventario Automatizado:</strong> A diferencia de las facturas comunes que disminuyen el stock, el procesamiento de una Nota de Crédito (e-34) ejecuta una transacción inversa en el inventario. Las cantidades se suman automáticamente al almacén destino sin requerir ingresos de mercancía manuales.</li>
    </ul>

    <h3 class="subsection-title">Notas de Débito Electrónicas (e-33)</h3>
    <p>Se emiten para facturar cargos adicionales de intereses, fletes o errores de cálculo que aumenten el valor original de una factura emitida. Al igual que la Nota de Crédito, se debe enlazar obligatoriamente el NCF modificado y justificar el motivo del incremento.</p>

    <h3 class="subsection-title">Asientos Contables del Ajuste</h3>
    <p>El sistema genera asientos de reversión automática. Por ejemplo, en una Nota de Crédito:</p>
    <table>
      <thead>
        <tr>
          <th>Cuenta Contable</th>
          <th>Débito</th>
          <th>Crédito</th>
          <th>Descripción del Movimiento</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Devoluciones y Descuentos en Ventas</td>
          <td>RD$ 10,000.00</td>
          <td>-</td>
          <td>Reconocimiento del gasto/pérdida de la devolución.</td>
        </tr>
        <tr>
          <td>ITBIS por Pagar (Devengado)</td>
          <td>RD$ 1,800.00</td>
          <td>-</td>
          <td>Reversión del impuesto facturado original ante la DGII.</td>
        </tr>
        <tr>
          <td>Cuentas por Cobrar (Clientes)</td>
          <td>-</td>
          <td>RD$ 11,800.00</td>
          <td>Disminución de la deuda pendiente del cliente.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- SECTION 4 -->
  <div class="page">
    <h2 class="section-title">4. Compras, Gastos y Reporte Fiscal 606</h2>
    <p class="intro-lead">El registro oportuno de las compras de la empresa es vital para la deducción legítima del ITBIS y los gastos operativos en la declaración del Impuesto sobre la Renta (ISR).</p>

    <h3 class="subsection-title">Registro de Facturas de Proveedores</h3>
    <p>Navegue a <em>Compras y Gastos</em> > <em>Nueva Compra</em> para registrar facturas físicas o electrónicas recibidas. El formulario exige la selección del Suplidor (con validación de RNC), la fecha de la factura, el NCF del proveedor y el desglose de montos base y de ITBIS.</p>

    <h3 class="subsection-title">Clasificación del Gasto (Formato 606)</h3>
    <p>Para automatizar la declaración del formato de envío <strong>606</strong> a la DGII, es indispensable clasificar cada compra dentro de los tipos de gastos regulados:</p>
    
    <div class="grid-2">
      <div class="feature-card">
        <h4>01 - Gastos de Personal</h4>
        <p style="font-size: 11px; margin-bottom: 0;">Servicios de capacitación, viáticos, uniformes o cualquier gasto incurrido directamente a favor de los empleados de la compañía.</p>
      </div>
      <div class="feature-card">
        <h4>02 - Trabajos, Suministros y Servicios</h4>
        <p style="font-size: 11px; margin-bottom: 0;">Honorarios profesionales, servicios de energía, agua, internet, papelería de oficina y mantenimiento general.</p>
      </div>
      <div class="feature-card">
        <h4>09 - Compras de Mercancía (Inventario)</h4>
        <p style="font-size: 11px; margin-bottom: 0;">Adquisición de perfiles de aluminio, planchas de vidrio o accesorios destinados a la venta o producción del taller.</p>
      </div>
      <div class="feature-card">
        <h4>11 - Gastos Financieros</h4>
        <p style="font-size: 11px; margin-bottom: 0;">Intereses bancarios, comisiones por emisión de cheques, cuotas de préstamos y cargos por transferencias.</p>
      </div>
    </div>

    <h3 class="subsection-title">Módulo de Gastos Menores (Caja Chica)</h3>
    <p>Si la compra corresponde a un gasto informal o rápido que se paga mediante el efectivo físico disponible en la caja, active la casilla <strong>Es un Gasto Menor (Caja Chica)</strong>. Esto exime la selección obligatoria de un suplidor formal y permite registrar el concepto y el monto para que el sistema descuente el efectivo del arqueo activo de caja de forma directa.</p>

    <h3 class="subsection-title">Registro de Compras por Monto General (Sin Detalle de Ítems)</h3>
    <p>Para simplificar el registro de adquisiciones donde no se requiere dar entrada a productos unitarios en el inventario (como materias primas para consumo interno, gastos de servicios o compras generales de la empresa), el formulario incluye una modalidad ágil:</p>
    <ul>
      <li><strong>Switch de Monto General:</strong> Active la opción <strong>Compra por Monto General</strong>. Al hacerlo, el sistema ocultará la cuadrícula de productos y deshabilitará la selección de <em>Almacén Destino</em>, ya que la compra no afectará las existencias físicas de stock.</li>
      <li><strong>Cálculo Automático por Total:</strong> Al digitar el importe total en el campo <em>Total de la Compra</em>, el sistema de-agrega de forma reactiva e inmediata el <em>Monto sin ITBIS (Subtotal = Total / 1.18)</em> y el <em>ITBIS (18%)</em> utilizando redondeo decimal preciso. Ambos campos de desglose permanecen editables para permitir ajustes manuales detallados si la factura contiene montos exentos u otros impuestos.</li>
      <li><strong>Selector de Cuenta Contable:</strong> Permite elegir de manera explícita en qué cuenta del catálogo contable de costos o gastos se registrará la transacción de débito en el libro mayor. Por defecto, está configurada en <strong>Costo de Ventas (5.1.01)</strong>, pero puede cambiarse a cualquier otra cuenta (ej. Gastos de Personal, Otros Impuestos, etc.).</li>
      <li><strong>Fila Virtual en Detalles:</strong> En el listado histórico de compras, al abrir los detalles de una compra por monto general, el sistema muestra una fila virtual con el concepto general y desglose para preservar la consistencia visual y la fácil lectura de los datos.</li>
    </ul>
  </div>

  <!-- SECTION 5 -->
  <div class="page">
    <h2 class="section-title">5. Gestión de Cheques en Garantía (CXP)</h2>
    <p class="intro-lead">El flujo de compras a crédito con entrega de cheques diferidos o "en garantía" cuenta con soporte técnico y contable específico para la República Dominicana.</p>

    <p>Bajo la normativa tributaria dominicana, cuando se realiza una compra a crédito con cheque en garantía, el devengo del gasto y del ITBIS ocurre inmediatamente en la fecha de la factura original (comprobante NCF del proveedor), por lo que debe reportarse en el formato 606 bajo el método de pago <strong>04 (A Crédito)</strong>. Sin embargo, el dinero físico no se retira de la cuenta bancaria hasta que el cheque sea cobrado o confirmado.</p>

    <h3 class="subsection-title">Campos del Formulario de Compra (CXP a Crédito)</h3>
    <p>Al seleccionar el método de pago <strong>04 - A Crédito (CXP)</strong> en el panel de configuración de compra, se habilitará la opción para marcar <strong>Dejar Cheque en Garantía</strong>. Al activarla, se despliegan los siguientes campos obligatorios y advertencias visuales:</p>
    
    <ul>
      <li><strong>Banco / Cuenta de Origen:</strong> Selector de la cuenta bancaria de donde se emitirá el cheque.</li>
      <li><strong>Número de Cheque:</strong> Campo obligatorio marcado visualmente con un asterisco rojo <code>* (Obligatorio)</code>. Se valida en frontend que no esté vacío para evitar errores de conciliación futuros.</li>
      <li><strong>Monto Cheque:</strong> Inicialmente se autocompleta con el total bruto de la compra.
        <div class="alert-box" style="margin: 8px 0; padding: 8px 12px;">
          <strong>Advertencia de Monto Modificado:</strong> Si usted llega a modificar este campo (por ejemplo, para reflejar retenciones del 30% o 100% de ITBIS o retenciones de ISR aplicadas al suplidor), el sistema desplegará de forma inmediata un banner ámbar con el ícono de advertencia indicando que el monto difiere del total facturado. Esto le asegura visualizar si el valor del cheque es correcto antes de guardar.
        </div>
      </li>
      <li><strong>Fecha de Cobro:</strong> Campo obligatorio marcado con <code>* (Obligatorio)</code>. Define la fecha acordada para que el proveedor presente el cheque al cobro.</li>
      <li><strong>Beneficiario:</strong> Campo de solo lectura (gris bloqueado) que muestra automáticamente el nombre del suplidor seleccionado para garantizar que el cheque se emita exactamente a favor del beneficiario legal.</li>
    </ul>

    <h3 class="subsection-title">Estado de Registro Inicial</h3>
    <p>Al guardar la compra, el sistema inserta el gasto, reconoce la deuda en Cuentas por Pagar (CXP) y registra el cheque en la base de datos en estado <strong>pending (pendiente)</strong>, mientras que el registro de pago se marca como <strong>pending_guarantee</strong>. El saldo bancario y el libro mayor del banco no se ven afectados en este punto, manteniendo la tesorería real intacta.</p>
  </div>

  <!-- SECTION 5 PART 2 -->
  <div class="page">
    <h2 class="section-title">5. Gestión de Cheques en Garantía (Continuación)</h2>
    
    <h3 class="subsection-title">Visualización y Operaciones en la pestaña "Cheques"</h3>
    <p>Para administrar los cheques diferidos, navegue a <em>Compras y Gastos</em> y seleccione la pestaña <strong>Cheques en Garantía</strong>. Esta pantalla le presentará dos secciones principales:</p>
    
    <ol class="step-list">
      <li class="step-item">
        <span class="step-number">P</span>
        <strong>Cheques Pendientes:</strong> Muestra un listado de todos los cheques emitidos que aún no han sido cobrados o confirmados. Cada fila detalla el RNC/Nombre del Suplidor, número de cheque, banco emisor, monto y la fecha límite de cobro.
      </li>
      <li class="step-item">
        <span class="step-number">A</span>
        <strong>Aplicar Cheque Individualmente:</strong> Cuando el suplidor confirma que ha cobrado el cheque, o si se valida en el estado de cuenta bancario, haga clic en el botón <strong>"Aplicar"</strong> ubicado al final de la fila del cheque.
      </li>
    </ol>

    <h3 class="subsection-title">Impacto Contable y Financiero de la Aplicación</h3>
    <p>Al hacer clic en "Aplicar" y confirmar la ventana emergente, el sistema ejecuta transaccionalmente las siguientes operaciones en una sola acción:</p>
    <ul>
      <li><strong>Estado del Cheque:</strong> El registro del cheque pasa a estado <code>cleared</code> (compensado) y el pago de CXP se actualiza a <code>applied</code>.</li>
      <li><strong>Balance Bancario:</strong> El monto del cheque se resta directamente del balance actual de la cuenta bancaria física en la tabla de <code>bank_accounts</code>.</li>
      <li><strong>Historial Bancario:</strong> Se crea una transacción contable de retiro en <code>bank_transactions</code>. Esta transacción se registra como "auto-conciliada" ya que proviene de un cheque verificado y aplicado.</li>
      <li><strong>Asiento del Diario:</strong> Se postea el asiento contable de cobro en el Diario General de la empresa:</li>
    </ul>

    <table>
      <thead>
        <tr>
          <th>Código de Cuenta</th>
          <th>Nombre de Cuenta Contable</th>
          <th>Débito</th>
          <th>Crédito</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>2101-01</td>
          <td>Cuentas por Pagar (CXP) - Proveedores Nacionales</td>
          <td>RD$ 25,000.00</td>
          <td>-</td>
        </tr>
        <tr>
          <td>1101-02</td>
          <td>Efectivo en Bancos (Cuenta Emisora Seleccionada)</td>
          <td>-</td>
          <td>RD$ 25,000.00</td>
        </tr>
      </tbody>
    </table>

    <h3 class="subsection-title">Alertas Activas en el Dashboard</h3>
    <p>El Dashboard principal cuenta con un sistema de alertas proactivo. Si un cheque en garantía alcanza o supera su fecha límite de cobro (dueDate) y permanece en estado pendiente, se mostrará un banner superior de color dorado en el Dashboard alertando al administrador e invitándolo a ir a la pestaña de cheques en garantía para aplicarlo o verificar su estatus con el banco.</p>
  </div>

  <!-- SECTION 6 -->
  <div class="page">
    <h2 class="section-title">6. Cuentas por Cobrar e Historial de Clientes</h2>
    <p class="intro-lead">La administración del flujo de cobros contra facturas a crédito es fundamental para mantener la liquidez operativa de la empresa.</p>

    <h3 class="subsection-title">Registro de Recibos de Ingresos</h3>
    <p>Cuando un cliente efectúa un pago (completo o parcial) contra una factura emitida a crédito, el sistema permite registrar la transacción en el módulo de Cuentas por Cobrar (CXC):</p>
    <ul>
      <li><strong>Formulario de Cobro:</strong> Seleccione la factura pendiente, el método de pago utilizado (efectivo, transferencia o cheque) y el monto cobrado.</li>
      <li><strong>Generación del Recibo de Ingreso A4:</strong> Al guardar el cobro, el sistema genera de forma automática un Recibo de Ingreso en tamaño Carta (A4) que se puede imprimir o descargar. Cuenta con un diseño formal, espaciado de seguridad debajo del título para separar los metadatos y la alineación correcta del logotipo corporativo en la parte izquierda.</li>
    </ul>

    <h3 class="subsection-title">Pestaña "Estado de Cuenta y Abonos por Cliente"</h3>
    <p>Esta pestaña permite realizar una auditoría progresiva de los balances de cada cliente de forma interactiva:</p>
    <ol class="step-list">
      <li class="step-item">
        <span class="step-number">1</span>
        <strong>Selección de Cliente:</strong> Elija el cliente de la lista desplegable. El sistema cargará el saldo consolidado adeudado en la parte superior.
      </li>
      <li class="step-item">
        <span class="step-number">2</span>
        <strong>Historial Cronológico:</strong> Presenta una tabla con todas las facturas y abonos aplicados en orden de fecha.
      </li>
      <li class="step-item">
        <span class="step-number">3</span>
        <strong>Cálculo de Balance Progresivo:</strong> Cada fila de cobro muestra el monto del abono y calcula de forma automática el balance restante de la factura (Saldo Anterior - Abono Actual), facilitando la conciliación entre el departamento de contabilidad y el cliente.
      </li>
      <li class="step-item">
        <span class="step-number">4</span>
        <strong>Filtros y Búsqueda:</strong> Incorpore términos de búsqueda rápidos para encontrar números de facturas, NCFs o códigos de recibos de ingresos específicos en segundos.
      </li>
      <li class="step-item">
        <span class="step-number">5</span>
        <strong>Exportación en PDF Premium:</strong> Presione "Imprimir Estado de Cuenta". Puppeteer renderizará una plantilla oficial Carta con cabeceras formales de la empresa, los saldos vencidos y las transacciones detalladas, lista para ser enviada por correo al cliente.
      </li>
    </ol>
  </div>

  <!-- SECTION 7 -->
  <div class="page">
    <h2 class="section-title">7. Control de Cajas y Arqueo de Efectivo</h2>
    <p class="intro-lead">El control de caja chica y el arqueo diario resguardan los recursos líquidos del establecimiento frente a pérdidas o discrepancias.</p>

    <h3 class="subsection-title">Ciclo Diario de Operaciones de Caja</h3>
    <p>Para asegurar un control estricto de las transacciones de efectivo en los mostradores o administración, los usuarios deben cumplir con las siguientes directrices:</p>
    
    <div class="feature-card">
      <h4>Apertura de Caja (Balance Inicial)</h4>
      <p style="font-size: 11px;">Al iniciar la jornada de trabajo, el cajero asignado debe verificar el efectivo físico en caja y registrar la apertura introduciendo el monto en el sistema. Esto establece el "Fondo Fijo" o balance inicial de operaciones.</p>
    </div>

    <div class="feature-card">
      <h4>Registro de Ingresos y Egresos Diarios</h4>
      <p style="font-size: 11px;">Cada venta en efectivo procesada suma automáticamente al saldo de caja activa. Para cualquier salida de efectivo destinada a gastos rápidos (ej: mensajería, compras rápidas de insumos), el cajero debe registrar un "Egreso de Caja" documentando el concepto y el monto para que el sistema lo deduzca del balance esperado.</p>
    </div>

    <div class="feature-card">
      <h4>Arqueo y Cierre de Caja</h4>
      <p style="font-size: 11px;">Al final de la jornada laboral o cambio de turno, se procede a contar físicamente todo el efectivo acumulado en la caja física. El cajero introduce esta cifra en el formulario de cierre. El sistema confronta el dinero real frente a las transacciones del sistema (Balance Inicial + Ventas Efectivo - Egresos) e indicará si la caja cerró cuadrada, con sobrante o con faltante.</p>
    </div>

    <h3 class="subsection-title">Controles Administrativos (Cashier Rules)</h3>
    <p>El sistema cuenta con alertas de auditoría. Si un cajero intenta registrar un egreso de caja que supere el saldo actual disponible de la caja, el sistema bloqueará la transacción, obligando a realizar una reposición de fondo o verificar los ingresos antes de autorizar el desembolso.</p>
  </div>

  <!-- SECTION 8 -->
  <div class="page">
    <h2 class="section-title">8. Procesamiento de Nómina y Recursos Humanos</h2>
    <p class="intro-lead">El módulo de recursos humanos automatiza el cálculo del salario neto de los colaboradores, aplicando las retenciones obligatorias de TSS e ISR vigentes en República Dominicana.</p>

    <h3 class="subsection-title">Retenciones de Seguridad Social (TSS)</h3>
    <p>El motor de nómina calcula de forma automática los aportes del empleado para la Tesorería de la Seguridad Social (TSS) y los aportes obligatorios del empleador, aplicando las tasas y topes legales establecidos:</p>
    
    <table>
      <thead>
        <tr>
          <th>Concepto Legal</th>
          <th>Tasa Empleado</th>
          <th>Tasa Empleador</th>
          <th>Tope Salarial (Salarios Mínimos)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Seguro Familiar de Salud (SFS)</strong></td>
          <td>3.04%</td>
          <td>7.09%</td>
          <td>Hasta 10 Salarios Mínimos Cotizables</td>
        </tr>
        <tr>
          <td><strong>Seguro de Vejez, Discapacidad y Sobrevivencia (AFP)</strong></td>
          <td>2.87%</td>
          <td>7.10%</td>
          <td>Hasta 20 Salarios Mínimos Cotizables</td>
        </tr>
        <tr>
          <td><strong>Seguro de Riesgos Laborales (SRL)</strong></td>
          <td>-</td>
          <td>Variable (ej. 1.2%)</td>
          <td>Hasta 4 Salarios Mínimos Cotizables</td>
        </tr>
      </tbody>
    </table>

    <h3 class="subsection-title">Impuesto sobre la Renta de Personas Físicas (ISR DGII)</h3>
    <p>El sistema mensualiza la escala impositiva de la DGII para aplicar la retención en la fuente del ISR sobre el salario gravable (Salario Bruto - Retenciones TSS):</p>
    <ul>
      <li><strong>Tramo 1 (Exento):</strong> Salarios gravables anuales hasta RD$ 416,220.00 (Exento de retención).</li>
      <li><strong>Tramo 2 (15%):</strong> Excedente de RD$ 416,220.01 hasta RD$ 624,329.00 (15% sobre el excedente).</li>
      <li><strong>Tramo 3 (20%):</strong> Excedente de RD$ 624,329.01 hasta RD$ 867,123.00 (RD$ 31,216.00 + 20% sobre el excedente).</li>
      <li><strong>Tramo 4 (25%):</strong> Excedente de RD$ 867,123.01 en adelante (RD$ 79,776.00 + 25% sobre el excedente).</li>
    </ul>

    <h3 class="subsection-title">Cálculo de Horas Extras y Recargos Laborales</h3>
    <p>El sistema soporta la carga masiva y cálculo de horas extras conforme al Código de Trabajo:</p>
    <ol class="step-list">
      <li class="step-item">
        <span class="step-number">H1</span>
        <strong>Horas Extras Diurnas (Recargo 35%):</strong> Horas laboradas en exceso de la jornada semanal normal hasta 68 horas semanales.
      </li>
      <li class="step-item">
        <span class="step-number">H2</span>
        <strong>Horas Nocturnas (Recargo 15% adicional):</strong> Horas laboradas en jornada nocturna normal de forma regular.
      </li>
      <li class="step-item">
        <span class="step-number">H3</span>
        <strong>Horas Extras Nocturnas (Recargo 85%):</strong> Horas laboradas en exceso de la jornada en horario de 9:00 PM a 6:00 AM.
      </li>
      <li class="step-item">
        <span class="step-number">H4</span>
        <strong>Horas en Días Feriados y Descansos (Recargo 100%):</strong> Trabajo realizado en días de descanso semanal o feriados oficiales.
      </li>
    </ol>
  </div>

  <!-- SECTION 8 PART 2 -->
  <div class="page">
    <h2 class="section-title">8. Procesamiento de Nómina (Continuación)</h2>
    
    <h3 class="subsection-title">Prestaciones Laborales, Regalía y Liquidación</h3>
    <p>Al momento de cesar la relación laboral con un colaborador, el módulo de liquidación permite proyectar y calcular las indemnizaciones correspondientes de forma automatizada:</p>
    
    <ul>
      <li><strong>Preaviso:</strong> Compensación económica debida si el empleador rescinde el contrato sin previo aviso formal, calculada en base a la antigüedad (desde 7 días hasta 28 días de salario promedio diario).</li>
      <li><strong>Cesantía:</strong> Indemnización obligatoria por terminación del contrato por el empleador (despido injustificado o desahucio), calculada progresivamente según los años laborados (desde 6 días hasta 23 días de salario por cada año de servicios).</li>
      <li><strong>Vacaciones No Disfrutadas:</strong> Compensación de los días de vacaciones acumulados que el empleado no llegó a tomar antes de su salida.</li>
      <li><strong>Salario de Navidad Proporcional (Regalía Pascual):</strong> Cálculo acumulado del doble sueldo, equivalente a la doceava parte (1/12) de los salarios ordinarios devengados por el trabajador durante el año calendario en curso.</li>
    </ul>

    <div class="alert-box success">
      <strong>Beneficio de Automatización:</strong> Cada cálculo aprobado genera de forma automática un asiento en el diario general (Débito a Gastos de Nómina/Horas Extras/TSS/ISR, Crédito a Cuentas por Pagar o Efectivo en Bancos), y emite un recibo detallado en PDF listo para firmar por el empleado en físico.
    </div>

    <h3 class="subsection-title">Configuración de Parámetros de Recursos Humanos</h3>
    <p>Para ajustar las retenciones o escalas ante cambios decretados por el Gobierno, navegue a <em>Recursos Humanos</em> > <em>Configuración</em>. Aquí podrá editar los topes de salarios mínimos de cotización de la TSS y los valores límites anuales de las escalas del ISR para garantizar que el cálculo se mantenga actualizado con la ley.</p>
  </div>

  <!-- SECTION 9 -->
  <div class="page">
    <h2 class="section-title">9. Herramientas Técnicas de Taller y Producción</h2>
    <p class="intro-lead">El sistema incorpora herramientas de optimización física para minimizar mermas y acelerar el desglose de materiales en los talleres de vidrios y aluminios.</p>

    <h3 class="subsection-title">Desglose de Ventanas de Aluminio</h3>
    <p>Permite calcular de forma automática el desglose de cortes y materiales requeridos para la fabricación de ventanas corredizas:</p>
    <ul>
      <li><strong>Sistemas Soportados:</strong> Tradicional, P-65 y P-92. Las fórmulas matemáticas del desglose se encuentran centralizadas en el backend para facilitar actualizaciones futuras.</li>
      <li><strong>Funcionamiento:</strong> Ingrese el ancho y alto total de la ventana y el número de hojas/vías. El sistema computará las medidas de corte exactas para los perfiles de aluminio (Cabezal, Riel, Llavín, Zócalo, Jamba, Traslape) y las dimensiones del cristal en pulgadas.</li>
      <li><strong>Impresión Directa:</strong> El botón "Imprimir Desglose" genera una hoja técnica en formato horizontal Carta (PDF landscape) lista para ser entregada a los cortadores en el taller de fabricación.</li>
    </ul>

    <h3 class="subsection-title">Optimizador de Corte de Vidrios (2D)</h3>
    <p>Resuelve el problema de cómo acomodar múltiples piezas rectangulares de cristal dentro de planchas de vidrio estándar para reducir el desperdicio al mínimo posible:</p>
    <ol class="step-list">
      <li class="step-item">
        <span class="step-number">1</span>
        <strong>Planchas de Vidrio:</strong> Defina las dimensiones de las planchas de inventario disponibles (ej. 72" x 120" o 96" x 130").
      </li>
      <li class="step-item">
        <span class="step-number">2</span>
        <strong>Piezas Requeridas:</strong> Introduzca el listado de las piezas de cristal con sus anchos, altos y cantidades requeridas para el pedido.
      </li>
      <li class="step-item">
        <span class="step-number">3</span>
        <strong>Visualizador y Mapa de Corte:</strong> El motor computará la distribución y dibujará un croquis interactivo mostrando visualmente cómo deben realizarse los cortes sobre la plancha, indicando el porcentaje de eficiencia y el área sobrante.
      </li>
      <li class="step-item">
        <span class="step-number">4</span>
        <strong>Autoguardado:</strong> El listado de piezas se almacena automáticamente en el almacenamiento local de su navegador, evitando la pérdida de datos ante recargas fortuitas.
      </li>
    </ol>
  </div>

  <!-- SECTION 10 -->
  <div class="page">
    <h2 class="section-title">10. Configuración del Sistema, Roles y Contingencia</h2>
    <p class="intro-lead">Este apartado cubre los controles de administración de seguridad, roles de usuario, secuencias SACF y los sistemas auto-curativos ante fallas de red.</p>

    <h3 class="subsection-title">Seguridad y Control de Roles de Usuario</h3>
    <p>El sistema cuenta con un control de acceso basado en roles que limita las operaciones según el cargo del colaborador:</p>
    <ul>
      <li><strong>Sistemas:</strong> Rol técnico con acceso total e irrestricto, incluyendo la configuración de credenciales mSeller, RNC de la empresa y la edición de secuencias SACF de contingencia.</li>
      <li><strong>Administración (Administrador):</strong> Permiso para gestionar compras, nóminas, facturación, cuentas por cobrar y arqueos de caja. Tienen prohibido modificar los parámetros técnicos de mSeller y RNC/Nombre fiscal una vez guardados por primera vez.</li>
      <li><strong>Cajero/Vendedor:</strong> Rol operativo limitado de forma exclusiva a la emisión de facturas y operaciones diarias de su caja chica asignada. No pueden anular facturas, emitir notas de crédito ni ver reportes financieros globales.</li>
    </ul>

    <h3 class="subsection-title">Edición de Secuencias SACF (Exclusivo Sistemas)</h3>
    <p>Navegue a <em>Configuración de e-CF</em> > pestaña <em>Secuencias SACF</em>. Si su usuario cuenta con el rol de 'sistemas', visualizará el botón de edición para actualizar el número de la secuencia actual, secuencia máxima y fecha de vencimiento otorgada por la DGII, asegurando que no se detenga la emisión de comprobantes autorizados.</p>

    <h3 class="subsection-title">Visualización de Plan y Límites de Suscripción (Admin/Sistemas)</h3>
    <p>Los usuarios con rol de <strong>Administración</strong> o <strong>Sistemas</strong> pueden visualizar de forma detallada el plan de suscripción contratado y los límites activos de su empresa. Para acceder, diríjase a <em>Ajustes del Sistema</em> en la sección <em>Plan y Suscripción</em>, o bien a <em>Permisos &amp; Administración</em> en la pestaña <em>Mi Suscripción</em>. El panel le mostrará:</p>
    <ul>
      <li><strong>Plan Contratado:</strong> Nombre del plan actual (ej: Plan Profesional, Plan Ilimitado) y su estado de validez (Activo).</li>
      <li><strong>Límites Operacionales:</strong> Capacidad mensual máxima de comprobantes e-CF autorizados, cantidad límite de usuarios activos y almacenes permitidos.</li>
      <li><strong>Vencimiento y Renovación:</strong> La fecha exacta en que finaliza o se renueva el ciclo actual de facturación de la empresa.</li>
    </ul>

    <h3 class="subsection-title">Mecanismo Auto-Curativo de Contingencias (Redis Offline)</h3>
    <p>La facturación electrónica no debe detenerse ante fallos de infraestructura. Por esta razón, el sistema incorpora un motor resiliente en segundo plano:</p>
    <div class="alert-box success">
      <strong>Arquitectura Resiliente:</strong> Si el servidor de base de datos Redis del establecimiento local se desconecta (fallo de conexión o falta de memoria), el sistema conmuta automáticamente y realiza el encolado de envíos a la DGII y despacho de correos electrónicos en el Event Loop in-process de Node. Al restablecerse la conexión con Redis, las tareas pendientes se sincronizan sin intervención del usuario.
    </div>
  </div>

</body>
</html>
`;

(async () => {
  let browser;
  try {
    console.log('Iniciando Puppeteer...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    console.log('Cargando el contenido HTML de la documentación...');
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdfPath = path.join(__dirname, '..', 'manual_usuario_contfast.pdf');
    
    console.log('Generando archivo PDF...');
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7px; color: #94a3b8; width: 100%; padding: 0 45px; display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; box-sizing: border-box;">
          <span>ContFast Enterprise — Manual de Usuario v2.0</span>
          <span>República Dominicana</span>
        </div>
      `,
      footerTemplate: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7px; color: #94a3b8; width: 100%; padding: 0 45px; display: flex; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 4px; box-sizing: border-box;">
          <span>Confidencial y de Uso Interno — Latin Doors SRL</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>
      `,
      margin: {
        top: '60px',
        bottom: '60px',
        left: '50px',
        right: '50px'
      }
    });
    
    console.log('PDF generado exitosamente en:', pdfPath);
  } catch (error) {
    console.error('Error generando el PDF:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
