/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Manual de Usuario de ContFast Enterprise — generador del PDF.
 *
 *   node scripts/generate-manual.js   →   manual_usuario_contfast.pdf (en la raiz)
 *
 * LOTE 283 (octubre 2026): el manual se reescribio entero contra el CODIGO de cada
 * pantalla. Los rotulos de botones y pestañas estan copiados del codigo tal cual; si una
 * pantalla cambia un rotulo, este fichero se queda atras y hay que tocarlo a mano.
 *
 * IMAGENES — por que este manual no lleva ninguna:
 *   Las once que habia en `public/*_mockup.jpg` (julio 2026) NO son capturas de ContFast.
 *   Son maquetas genericas con otras marcas y la interfaz en ingles, y contradicen el texto:
 *     - accounting_ledger_mockup.jpg       "General Ledger", importes en $, en ingles
 *     - barcodes_print_mockup.jpg          marca "NAVISTAR ERP", en ingles
 *     - cheques_garantia_mockup.jpg        marca "FinanzaPro ERP"
 *     - invoices_list_mockup.jpg           "Issued e-CF", boton "Nuevo e-CF", en ingles
 *     - new_invoice_form_mockup.jpg        marca "e-CF Innova ERP"; el formulario real va por pasos
 *     - payroll_list_mockup.jpg            marca "GlobalSolutions ERP", en ingles
 *     - product_form_mockup.jpg            marca "Onyx ERP"; el alta real es una pestaña, no una ventana
 *     - products_list_mockup.jpg           "Inventory Products", productos de electronica en $
 *     - receivables_statement_mockup.jpg   importes en $; no es la pantalla real
 *     - suppliers_list_mockup.jpg          "Suppliers", en ingles
 *     - transfer_mockup.jpg                marca "Acme Corp ERP", en ingles
 *   Ademas el guion anterior leia `dashboard_main_mockup.jpg`, que no existe en `public/`, y
 *   reventaba antes de generar nada. Los ficheros se dejan en `public/` (no se borran); si
 *   algun dia hay capturas reales, se vuelven a poner con `imagen('<fichero>', '<pie>')`.
 *
 * INDICE: los numeros de pagina se CALCULAN. Cada seccion empieza en pagina nueva, asi que
 * se dibuja cada una por separado con los mismos margenes, se cuentan sus paginas, y con eso
 * se escribe el indice antes de dibujar el documento entero. Si una seccion crece, el indice
 * se corrige solo.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const FECHA = 'Octubre 2026';
const VERSION = '3.0';

// Por si algun dia vuelven las imagenes: una que no exista no tumba el manual.
function imagen(fichero, pie) {
  const ruta = path.join(RAIZ, 'public', fichero);
  if (!fs.existsSync(ruta)) return '';
  const b64 = fs.readFileSync(ruta).toString('base64');
  return `<figure class="manual-fig"><img src="data:image/jpeg;base64,${b64}" alt="${pie}"><figcaption>${pie}</figcaption></figure>`;
}

// ─── Piezas de texto ──────────────────────────────────────────────────────────
const pasos = (lista) =>
  `<ol class="step-list">${lista
    .map((t, i) => `<li class="step-item"><span class="step-number">${i + 1}</span>${t}</li>`)
    .join('')}</ol>`;
const nota = (t, tipo = 'info') => `<div class="alert-box ${tipo}">${t}</div>`;
const b = (t) => `<span class="ui">${t}</span>`; // un rotulo de la pantalla
const tabla = (cab, filas) =>
  `<table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas
    .map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
const ruta = (...partes) => `<span class="ruta">${partes.join(' › ')}</span>`;

// ─── Estilos ──────────────────────────────────────────────────────────────────
const CSS = `
  :root { --azul: #003366; --azul-osc: #001e40; --oro: #C5A059; --oro-texto: #8A6A2C; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Inter', -apple-system, Roboto, Arial, sans-serif;
    color: #1e293b; margin: 0; padding: 0; line-height: 1.55; font-size: 12.5px; background: #fff;
  }
  .cover-page {
    height: 100vh; display: flex; flex-direction: column; justify-content: space-between;
    padding: 60px; background: linear-gradient(135deg, var(--azul-osc) 0%, var(--azul) 100%);
    color: #fff; page-break-after: always;
  }
  .cover-header { font-size: 14px; font-weight: 700; letter-spacing: 3px; color: var(--oro); text-transform: uppercase; }
  .cover-middle { margin-top: 80px; }
  .cover-middle h1 { font-size: 40px; font-weight: 800; line-height: 1.15; margin: 0 0 16px; letter-spacing: -0.5px; }
  .cover-middle h2 { font-size: 17px; font-weight: 400; margin: 0 0 30px; color: #cbd5e1; }
  .cover-divider { width: 80px; height: 5px; background: var(--oro); border-radius: 2px; }
  .cover-meta { margin-top: 28px; font-size: 13px; color: #e2e8f0; }
  .cover-meta strong { color: var(--oro); }
  .cover-footer { font-size: 12px; color: #cbd5e1; line-height: 1.8; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 20px; display: flex; justify-content: space-between; }

  .page { padding: 0; page-break-after: always; }
  .page:last-child { page-break-after: avoid; }
  .section-title {
    font-size: 19px; font-weight: 800; color: var(--azul); border-bottom: 2px solid var(--azul);
    padding-bottom: 8px; margin: 0 0 18px; text-transform: uppercase; letter-spacing: 0.4px;
  }
  .section-title .num { color: var(--oro-texto); margin-right: 6px; }
  .subsection-title {
    font-size: 13.5px; font-weight: 700; color: var(--azul); margin: 20px 0 10px;
    border-left: 3px solid var(--oro); padding-left: 10px; page-break-after: avoid;
  }
  h4.mini { font-size: 12.5px; color: var(--azul-osc); margin: 14px 0 6px; page-break-after: avoid; }
  p { margin: 0 0 11px; text-align: left; color: #334155; }
  .intro-lead { font-size: 14px; font-weight: 500; color: var(--azul); margin-bottom: 16px; text-align: left; }
  ul, ol { margin: 0 0 12px; padding-left: 20px; color: #334155; }
  li { margin-bottom: 5px; }
  .ui { font-weight: 700; color: var(--azul-osc); background: #eef2f7; border: 1px solid #d7dee8; border-radius: 4px; padding: 0 4px; white-space: nowrap; }
  .ruta { font-weight: 600; color: var(--azul); }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 11px; page-break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #eef2f7; color: var(--azul); font-weight: 700; }
  tr:nth-child(even) td { background: #f8fafc; }
  .alert-box { border: 1px solid #fde68a; border-left: 4px solid #d97706; background: #fffbeb; color: #78350f;
    padding: 10px 14px; border-radius: 8px; margin: 12px 0; font-size: 11.5px; page-break-inside: avoid; }
  .alert-box.info { background: #f0f6fc; border-color: #c9dcef; border-left-color: var(--azul); color: #0f2e4f; }
  .alert-box.success { background: #f0fdf4; border-color: #bbf7d0; border-left-color: #16a34a; color: #14532d; }
  .alert-box.warn { background: #fffbeb; }
  .step-list { list-style: none; padding-left: 0; }
  .step-item { position: relative; padding-left: 28px; margin-bottom: 9px; page-break-inside: avoid; }
  .step-number { position: absolute; left: 0; top: 1px; width: 18px; height: 18px; background: var(--azul);
    color: #fff; border-radius: 50%; text-align: center; font-size: 10.5px; line-height: 18px; font-weight: 700; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .feature-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; page-break-inside: avoid; }
  .feature-card h4 { margin: 0 0 6px; color: var(--azul); font-size: 12.5px; }
  .feature-card p { font-size: 11.5px; margin: 0; text-align: left; }
  .toc-list { list-style: none; padding-left: 0; margin-top: 24px; }
  .toc-item { display: flex; align-items: baseline; margin-bottom: 9px; }
  .toc-item a { text-decoration: none; color: inherit; display: flex; width: 100%; align-items: baseline; }
  .toc-name { font-weight: 600; color: var(--azul); }
  .toc-dots { flex-grow: 1; border-bottom: 1px dotted #94a3b8; margin: 0 8px; }
  .toc-page { font-weight: 700; color: var(--azul); min-width: 48px; text-align: right; }
  .manual-fig { margin: 12px auto; text-align: center; }
  .manual-fig img { max-width: 90%; border: 1px solid #cbd5e1; border-radius: 8px; }
  .manual-fig figcaption { font-size: 10px; color: #64748b; }
`;

// ─── Secciones ────────────────────────────────────────────────────────────────
// Cada una: { id, titulo, html }. El numero lo pone el generador por su orden.
const SECCIONES = [];
const seccion = (id, titulo, html) => SECCIONES.push({ id, titulo, html });

seccion('primeros-pasos', 'Primeros pasos: acceso, panel y menú', `
  <p class="intro-lead">ContFast Enterprise es el ERP contable y de facturación electrónica de la empresa. Todo lo que se opera —vender, cobrar, comprar, pagar— genera su asiento en el libro mayor automáticamente.</p>
  <p>El sistema maneja varias empresas, cada una con sus datos totalmente separados: nadie ve clientes, facturas ni saldos de otra empresa.</p>

  <h3 class="subsection-title">Entrar al sistema</h3>
  ${pasos([
    `Escriba su ${b('Correo Electrónico')} y su ${b('Contraseña')} (el ojo la muestra u oculta) y pulse ${b('Acceder al Sistema')}. Si algo falla, el motivo aparece dentro del formulario.`,
    `Tras <strong>15 minutos sin actividad</strong> la sesión se cierra sola: «Su sesión ha expirado por inactividad.»`,
  ])}
  <h4 class="mini">¿Olvidó su contraseña?</h4>
  <p>En la pantalla de acceso pulse ${b('¿Olvidó su contraseña?')}, escriba el correo de su cuenta y pulse ${b('Enviarme el enlace')}. La respuesta es siempre la misma, exista o no la cuenta.</p>
  <ul>
    <li><strong>Administración y Sistemas</strong> reciben un correo «Restablecer su contraseña» con un enlace. El enlace vale <strong>60 minutos</strong> y sirve una sola vez; pedir otro anula el anterior. Abra el enlace, escriba la ${b('Contraseña nueva')} dos veces (mínimo 6 caracteres) y pulse ${b('Guardar contraseña')}. Todas las sesiones que tenía abiertas se cierran.</li>
    <li><strong>El resto de usuarios</strong> no reciben correo: la contraseña se la cambia un administrador desde ${ruta('Sistema', 'Administracion')} › ${b('Usuarios')}. Al cambiarla, se cierran las sesiones de ese usuario.</li>
  </ul>

  <h3 class="subsection-title">La barra de arriba</h3>
  <div class="grid-2">
    <div class="feature-card"><h4>La empresa</h4><p>El nombre (y el logo) de la empresa en la que trabaja. Solo el rol <strong>Sistemas</strong> puede pulsarlo para cambiar de empresa (lista «Seleccionar Empresa»); para los demás es solo el nombre.</p></div>
    <div class="feature-card"><h4>El punto de entorno</h4><p>Un punto junto a la campana. <strong>Verde = Producción</strong>: lo que emita tiene validez fiscal. <strong>Ámbar = Pruebas</strong>: las operaciones son fiscalmente nulas. Pase el ratón por encima para leerlo. En modo prueba además aparece arriba la franja «MODO PRUEBA (SANDBOX) - OPERACIONES FISCALMENTE NULAS».</p></div>
    <div class="feature-card"><h4>La campana de avisos</h4><p>El número rojo son los avisos <em>sin leer</em>. Al abrirla, la cabecera dice «N sin leer · M vigentes» y la lista separa «Sin leer» de «Leídos — siguen pendientes». Leer no resuelve: el aviso sigue hasta que se atiende, y entonces se cierra solo. Pulsar un aviso lleva a donde se resuelve. ${b('Marcar todo leído')} apaga el número.</p></div>
    <div class="feature-card"><h4>Su avatar</h4><p>Muestra su nombre y su rol, y la opción ${b('Cerrar Sesión')}. Se cierra con Escape o pulsando fuera.</p></div>
  </div>

  <h3 class="subsection-title">El menú lateral</h3>
  <p>Las pantallas están agrupadas: <strong>Principal, Contactos, Inventario, Ingresos, Egresos, Finanzas, Recursos Humanos, Herramientas y Sistema</strong>. Cada persona ve solo lo que su rol permite. La fila de la pantalla actual se resalta y el menú la centra.</p>
  <ul>
    <li><strong>Grupos:</strong> se abren y cierran con un clic, y el sistema recuerda en ese navegador cuáles dejó abiertos.</li>
    <li><strong>Favoritos:</strong> la estrella de cada fila ancla la pantalla en la sección «Favoritos», arriba del todo, en el orden en que las ancló. Se guardan en ese navegador.</li>
    <li><strong>Buscador:</strong> ${b('Buscar')} o el atajo <strong>Ctrl+K</strong> (⌘K en Mac). Escriba parte del nombre o del grupo (no hace falta poner tildes), muévase con las flechas y abra con Enter. Con la caja vacía propone primero sus favoritos.</li>
    <li><strong>Plegar:</strong> ${b('Colapsar menú')} deja solo los iconos (el nombre sale al pasar el ratón); ${b('Expandir menú')} lo devuelve. En el móvil el menú se abre con ${b('Abrir menú')}.</li>
  </ul>

  <h3 class="subsection-title">Roles</h3>
  ${tabla(['Rol', 'Qué hace'], [
    ['<strong>Sistemas</strong>', 'Acceso técnico total: cambia de empresa, edita secuencias SACF, nombre y RNC de la empresa, credenciales de mSeller, sesiones activas y planes.'],
    ['<strong>Administración</strong>', 'Opera toda la empresa: ventas, compras, pagos, caja (ve el saldo esperado), contabilidad, configuración, usuarios. Aplica descuentos y escribe la tasa del dólar.'],
    ['<strong>Facturación</strong>', 'Trabaja en Facturación: no entra al panel de inicio ni a la Central e-CF.'],
    ['<strong>Otros roles</strong>', 'Lo que su rol permita módulo por módulo. Quien no es administración cuenta la caja «a ciegas» y no aplica descuentos.'],
  ])}
`);

seccion('inicio', 'El inicio y los avisos', `
  <p class="intro-lead">El <strong>Dashboard Principal</strong> es el resumen del día y el sitio donde el sistema avisa de lo que requiere atención.</p>
  <p>Arriba a la derecha tiene pestañas: ${b('Resumen')}, ${b('Inteligencia de Negocio')} y ${b('Agente Empresarial')} (las dos últimas según permisos). El Resumen muestra «Facturas Hoy», «Pendientes DGII», «Ventas del Mes» y «Alertas», los mejores clientes del mes, la actividad y los últimos comprobantes emitidos.</p>

  <h3 class="subsection-title">Qué avisa el sistema</h3>
  ${tabla(['Aviso', 'Cuándo sale', 'Se cierra cuando…'], [
    ['Factura rechazada', 'La DGII rechazó un comprobante.', 'Se reenvía aceptado o se da de baja.'],
    ['Cheque en garantía', 'Desde 3 días antes de su fecha de cobro; luego «se cobra HOY» y «vencido».', 'Se registra su cobro.'],
    ['Caja sin cerrar', 'Una caja abierta en un día anterior.', 'Se cierra la caja.'],
    ['Diferencia de arqueo', 'Un cierre de caja con faltante o sobrante.', 'Un supervisor la da por revisada.'],
    ['Conduce sin despachar', 'El conduce de una factura emitida sigue en borrador; dice qué mercancía falta.', 'Se aprueba el conduce.'],
    ['606 / 607 pendiente', 'El mes cerrado no está marcado como presentado (plazo: día 15).', 'Se marca como presentado.'],
    ['Períodos contables', 'Quedan menos de 45 días con período abierto.', 'Se abren los siguientes meses.'],
    ['Padrón de RNC', 'El padrón tiene 30 días o más.', 'Se vuelve a cargar el padrón.'],
  ])}
  <p>Cada aviso trae un botón que lleva a resolverlo (por ejemplo ${b('Ir a Caja')} o ${b('Abrir períodos')}).</p>

  <h3 class="subsection-title">Avisos por correo, con informe en PDF</h3>
  <p>Los avisos <strong>graves y de advertencia</strong> se envían también por correo, en <strong>un solo mensaje con todos</strong> los pendientes. El asunto lleva el nombre de la empresa y cuántos son graves. Adjunta un <strong>informe en PDF</strong> con el formato de los documentos de la empresa (logo y datos fiscales), todos los avisos con su gravedad y un gráfico de <strong>compras y ventas de los últimos 14 días</strong>, con el día del informe destacado. Si el PDF no se pudiera generar, el correo sale igual con el texto. Cada aviso se envía una sola vez; se revisan al abrir el panel de inicio.</p>
  <p>El destino se configura en ${ruta('Sistema', 'Configuración')} › ${b('Configuración Empresa')} › «Avisos del sistema»: escriba el ${b('Correo de destino')} o marque ${b('Usar el correo de la empresa')}. <strong>Vacío significa que la empresa no recibe avisos por correo.</strong></p>
  ${nota('Los avisos ya no se envían por WhatsApp: ese canal se retiró.')}
`);

seccion('contactos', 'Clientes y suplidores', `
  <p class="intro-lead">Las pantallas de clientes y de suplidores (grupo ${b('Contactos')} del menú) funcionan igual: lista con buscador e ${b('Imprimir')}, y la pestaña ${b('Registrar')} para el alta.</p>

  <h3 class="subsection-title">Buscar DGII: el RNC sale del padrón</h3>
  <p>Escriba el RNC o la cédula (9 u 11 dígitos) y pulse ${b('Buscar DGII')}: la razón social se completa sola y aparece «Validado DGII». El dato sale del <strong>padrón de contribuyentes que publica la DGII</strong>, cargado en el sistema (el servicio en línea de la DGII ya no existe). Por eso:</p>
  <ul>
    <li>Si un contribuyente está suspendido o dado de baja, se encuentra igual y se advierte: «Atención: la DGII lo tiene como …».</li>
    <li>Si no aparece: «No está en el padrón de la DGII (cargado el …). Si es un registro reciente, escriba el nombre a mano.»</li>
    <li>El padrón se recarga periódicamente; el panel avisa cuando pasa de 30 días.</li>
  </ul>

  <h3 class="subsection-title">Clientes</h3>
  <p><strong>Gestión de Clientes</strong>: RNC (opcional para consumidor final), nombre, contacto, límite de crédito y tipo de precio que se le aplica por defecto. Botón ${b('Registrar Cliente')} (al editar, ${b('Guardar Cambios')}). En la lista, ${b('Ver Historial')} abre la ficha del cliente con lo facturado, el balance y lo pagado, y las pestañas ${b('Facturas e-CF')} e ${b('Historial de Pagos')}.</p>

  <h3 class="subsection-title">Suplidores</h3>
  <p><strong>Gestión de Suplidores</strong>: RNC o cédula (opcional) con ${b('Buscar DGII')}, nombre o razón social, correo, teléfono y dirección. Botón ${b('Registrar Suplidor')}.</p>
`);

seccion('inventario', 'Inventario: productos, precios y existencias', `
  <p class="intro-lead">El grupo ${b('Inventario')} del menú reúne el catálogo, los precios, los códigos de barra, los almacenes y todo lo que mueve existencia.</p>

  <h3 class="subsection-title">Cómo se registra en todo el sistema: pestañas «Registrar»</h3>
  <p>Las pantallas que dan de alta registros (productos, almacenes, categorías, conduces, clientes, suplidores, retenciones, cuentas bancarias, empleados, novedades de nómina, empresas y pedidos a suplidor) trabajan igual: arriba a la derecha hay dos pestañas, la lista (por ejemplo ${b('Catálogo')}) y ${b('Registrar')}. El formulario ocupa la página entera; al editar un registro la segunda pestaña pasa a decir ${b('Editando')}. Los botones de la lista (imprimir, buscar, etc.) están en la barra de la propia lista, nunca junto a las pestañas.</p>

  <h3 class="subsection-title">Productos — ${ruta('Inventario', 'Productos')}</h3>
  <p>La pantalla se llama <strong>Catálogo de Productos</strong>. En la lista se busca por código, nombre o código de barras y se filtra por categoría. Por fila: ${b('Ver Inventario')} (existencia por almacén, con sus mínimos y máximos), ${b('Editar')} e ${b('Imprimir Etiquetas')}. En la barra de la lista: ${b('Precios en dólares')}, ${b('Gestión de Códigos')} e ${b('Imprimir')}, que ofrece ${b('Imprimir Normal')}, ${b('Imprimir con Stock')} e ${b('Imprimir Etiquetas')}.</p>
  <h4 class="mini">Registrar un producto</h4>
  <p>Pulse ${b('Registrar')}. El formulario va por pasos — 1 <em>Qué es</em>, 2 <em>Precios y existencia</em>, 3 <em>Códigos de barra</em> — con ${b('Atrás')} y ${b('Siguiente')}. Si prefiere ver todo junto, ${b('Ver todo de una vez')} lo pone en dos columnas (y ${b('Ver por pasos')} lo devuelve). Se puede guardar desde cualquier paso con ${b('Registrar Producto')} (al editar, ${b('Guardar Cambios')}); si falta algo, el formulario salta al primer paso con error y dice «Revisa los campos marcados».</p>
  ${pasos([
    `<strong>Qué es:</strong> nombre, categoría, unidad de medida (Unidad, Pie, Metro o Servicio), estado y código SKU opcional. Aquí van también la <strong>imagen</strong> y la <strong>descripción</strong> que se ven en la tienda en línea (ver más abajo).`,
    `<strong>Precios y existencia:</strong> escriba el ${b('Costo de Compra *')}. Con ${b('Autocalcular')} marcado, el sistema propone los cuatro precios de venta (sin ITBIS). Con ${b('Ajustar Manual')} los escribe usted y el cálculo automático se desactiva para no pisar sus precios. El interruptor ${b('Lleva control de existencia')} se apaga para servicios o mercancía por encargo: entonces no se comprueba ni se descuenta existencia. ${b('Activar Oferta (Tienda en Línea)')} fija un precio promocional para la tienda.`,
    `<strong>Códigos de barra:</strong> escriba el código principal o pulse ${b('Generar Automático')} (Code 128, EAN-13, EAN-8, UPC-A o código QR, con vista previa). Puede añadir códigos secundarios (de fábrica, de otra presentación) con ${b('Añadir')}.`,
  ])}
  <h4 class="mini">Los cuatro precios: margen sobre el precio de venta</h4>
  <p>El porcentaje de ganancia se calcula sobre el <strong>precio de venta</strong>, no sobre el costo: <em>precio = costo ÷ (1 − margen)</em>. Con un costo de RD$ 100:</p>
  ${tabla(['Precio', 'Margen', 'Precio con costo 100'], [
    ['P. Base', '25 %', 'RD$ 133.33'],
    ['P. Consumidor', '20 %', 'RD$ 125.00'],
    ['P. Mayorista', '15 %', 'RD$ 117.65'],
    ['P. Proveedor', '10 %', 'RD$ 111.11'],
  ])}
  ${nota('Cambiar la fórmula no recalculó los precios ya guardados: cada producto conserva los suyos hasta que se edite su costo con el autocálculo puesto o se le aplique una tasa del dólar.')}
  <h4 class="mini">Imagen y descripción para la tienda</h4>
  <ul>
    <li>${b('Imagen (tienda)')} → ${b('Subir imagen')}; con imagen puesta, ${b('Cambiar')} y ${b('Quitar')}. Se admiten JPG, PNG o WebP de hasta 25 MB: el navegador la reduce sola antes de subirla (mejor cuadrada). La imagen queda guardada al pulsar Guardar el producto.</li>
    <li>${b('Descripción (se ve en la tienda)')}: hasta 2.000 caracteres — material, medidas, acabado.</li>
  </ul>

  <h3 class="subsection-title">Precios en dólares</h3>
  <p>Para los productos que se compran en dólares. Se abre con ${b('Precios en dólares')} en la barra del catálogo y se sale con ${b('Volver al catálogo')}.</p>
  ${pasos([
    `<strong>La tasa del día.</strong> Arriba se ve la ${b('Tasa vigente')} (y cuántos días lleva sin tocarse). Escriba la tasa de hoy y pulse ${b('Guardar y aplicar precios')}: se guarda la tasa y se actualizan en el acto el costo y los precios de todos los productos que siguen al dólar. Solo administración y sistemas escriben la tasa; los demás ven «La tasa la escribe administración.»`,
    `<strong>Atar productos.</strong> En «Añadir productos que se compran en dólares» busque por nombre o código y marque uno o varios (también ${b('Marcar los N')}); lo marcado se conserva entre búsquedas. Escriba el ${b('Costo en US$')} y pulse ${b('Añadir')} (con varios, ${b('Añadir N productos')}): todos reciben el mismo costo. Atar no cambia ningún precio todavía.`,
    `<strong>La tabla</strong> (15 productos por página) muestra el costo y el precio en US$ — editables con el lápiz —, el costo y los cuatro precios en pesos, y la variación. El <em>precio en US$</em> es opcional: si lo tiene, el precio base pasa a ser <em>precio US$ × tasa</em>; los demás precios conservan su margen sobre el costo.`,
    `${b('Aplicar precios')} sirve para lo que cambia sin tocar la tasa (el costo o el precio en dólares de un producto): pide confirmación y aplica a los marcados.`,
  ])}
  ${nota('Ninguna factura ni cotización ya hecha cambia. El costo que se actualiza es el de catálogo (el de reposición); el costo promedio con el que se asienta el costo de venta solo lo mueven las compras. El icono «Dejar de seguir al dólar» suelta un producto y le deja sus precios tal como estén.')}

  <h3 class="subsection-title">Códigos de barra — ${ruta('Inventario', 'Códigos de Barra')}</h3>
  <p>Pantalla <strong>Gestión Unificada de Códigos</strong>: totales con y sin código, filtros ${b('Todos')}, ${b('Con Código')} y ${b('Sin Código')}. ${b('Autogenerar Faltantes')} asigna códigos a todos los productos que no tienen (pide confirmación). Por fila, ${b('Editar o Generar Código')}. ${b('Imprimir Etiquetas')} abre la ventana de etiquetas: modo de selección (producto único, seleccionados, por categoría o todo el catálogo), tamaño (30×20, 50×25, 50×30, 60×40 mm o personalizado), cantidad por producto, campos visibles (marca, nombre, precio, SKU, código, QR), formato del código y vista previa; ${b('Mandar a Imprimir')} abre el PDF.</p>

  <h3 class="subsection-title">Almacenes y categorías</h3>
  <p><strong>Gestión de Almacenes</strong> (pestañas ${b('Almacenes')} / ${b('Registrar')}): código, nombre, dirección y estado. Un almacén se ${b('Deshabilitar')} / ${b('Habilitar')}; borrarlo para siempre solo lo puede el rol Sistemas. <strong>Categorías</strong> (pestañas ${b('Categorías')} / ${b('Registrar')}): nombre, descripción y estado.</p>

  <h3 class="subsection-title">Traslados — ${ruta('Inventario', 'Traslados')}</h3>
  ${pasos([
    `En «Ruta del Traslado» elija ${b('Almacén Origen')} y ${b('Almacén Destino')} (no pueden ser el mismo).`,
    `Busque el producto por nombre, SKU o código de barras (o léalo con el escáner: cada lectura suma 1). Se ve el stock disponible en el origen.`,
    `Escriba la cantidad y pulse ${b('Agregar a Lista')}. No se puede pasar del stock del origen ni repetir un producto.`,
    `Revise «Artículos a Trasladar», escriba el motivo si quiere y pulse ${b('Confirmar Traslado')}.`,
  ])}

  <h3 class="subsection-title">Ajustes de inventario — ${ruta('Inventario', 'Ajustes de Inventario')}</h3>
  <p>Para cuadrar la existencia con un conteo físico: elija el almacén, busque el producto, escriba la ${b('Nueva Cantidad Física')} (la diferencia se calcula sola), el motivo — obligatorio — y pulse ${b('Aplicar Ajuste')}. Debajo, la tabla «Productos Disponibles» permite ajustes rápidos con ${b('Establecer cantidad')}.</p>
  ${nota('Un ajuste que sube existencia la mete sin costo y sin asiento contable. Cómo se valora un sobrante de conteo es una decisión del contador.', 'warn')}

  <h3 class="subsection-title">Movimientos y reorden</h3>
  <p><strong>Historial de Movimientos</strong> (el kardex): entradas, salidas y variación, con filtros por almacén, producto, tipo (ventas, compras, traslados, ajustes) y fechas, e ${b('Imprimir')}. <strong>Sugerencias de Reorden</strong>: los productos por debajo de su mínimo, «Crítico» si están al 20 % del mínimo o menos, y ${b('Generar Compra')}, que abre una compra con el producto, la cantidad y el almacén ya puestos.</p>
`);

seccion('conduces', 'Conduces: despachar lo facturado', `
  <p class="intro-lead">Facturar no descuenta existencia. La mercancía sale del almacén —y se asienta su costo de venta— cuando se <strong>aprueba el conduce</strong> de la factura.</p>
  <p>La pantalla es <strong>Conduces de Entrega</strong> (${ruta('Inventario', 'Conduces')}), con las pestañas ${b('Conduces')} y ${b('Registrar')}. Según la configuración de la empresa, al emitir una factura se crea solo su conduce en borrador.</p>

  <h3 class="subsection-title">La lista y sus filtros</h3>
  <ul>
    <li>Filtro por <strong>Estado</strong> (Todos, Borrador, Despachado, Anulado) y por rango de <strong>Fecha de entrega</strong>. ${b('Quitar filtros')} aparece cuando hay alguno puesto. Si ninguno cumple: «Ningún conduce cumple esos filtros.»</li>
    <li>Por fila: ${b('Ver Conduce')} (el ojo) e ${b('Imprimir Conduce')}. En un borrador, ${b('Aprobar y Despachar Inventario')} y ${b('Eliminar Borrador')}; en uno despachado, ${b('Anular y Revertir Inventario')}, que devuelve la mercancía al almacén.</li>
    <li>«Aplicar Despacho por Código»: escriba el e-NCF de la factura o el número del conduce (por ejemplo CON-2026-000001) y pulse ${b('Aplicar Despacho')}.</li>
  </ul>

  <h3 class="subsection-title">Ver un conduce y lo que le falta</h3>
  <p>El ojo abre el conduce con su factura, cliente, almacén y, por mercancía, lo facturado, lo que despacha este conduce y la columna <strong>Faltante</strong>: «Disponible», «Faltan 4 · hay 1» (con el mínimo del almacén si lo tiene), «No lleva inventario» o «Despachado». Un conduce no se aprueba si dejaría el almacén por debajo de su mínimo.</p>
  <h4 class="mini">Despachar lo disponible</h4>
  <p>Cuando se puede despachar algo pero no todo, el visor ofrece ${b('Despachar lo disponible')}: sale lo que hay (existencia menos mínimo, sin pasar de lo pedido), se descuenta y se asienta su costo, y lo pendiente pasa a un <strong>conduce nuevo en borrador</strong> de la misma factura. La confirmación nombra lo que queda pendiente.</p>
  ${nota('Si un conduce automático no se pudo despachar por falta de mercancía, el panel de inicio avisa y dice qué falta, producto por producto. El aviso se cierra solo al aprobarse el conduce.')}

  <h3 class="subsection-title">Registrar un conduce a mano</h3>
  ${pasos([
    `Pestaña ${b('Registrar')} → ${b('Vincular Factura Afectada')}: busque por NCF, cliente o RNC entre las facturas aceptadas con despacho pendiente y pulse ${b('Vincular')}.`,
    `Complete fecha de despacho, chofer, licencia, placa y responsable.`,
    `En «Líneas de Despacho Físico» escriba lo que sale hoy en ${b('Despachar Hoy')} (no más de lo pendiente; al menos una línea).`,
    `Pulse ${b('Registrar Conduce')}: queda en borrador hasta que se apruebe.`,
  ])}
`);

seccion('facturacion', 'Facturación electrónica (e-CF)', `
  <p class="intro-lead">La pantalla <strong>Facturación e-CF</strong> (${ruta('Ingresos', 'Facturacion e-CF')}) emite los comprobantes fiscales electrónicos a través de mSeller, que los firma y los transmite a la DGII.</p>

  <h3 class="subsection-title">Tipos de comprobante</h3>
  ${tabla(['Código', 'Comprobante', 'Uso'], [
    ['<strong>e-31</strong>', 'Factura de Crédito Fiscal', 'Ventas a empresas o profesionales que sustentan costos e ITBIS. Exige RNC y razón social del cliente.'],
    ['<strong>e-32</strong>', 'Factura de Consumo', 'Ventas a consumidor final.'],
    ['<strong>e-44</strong>', 'Régimen Especial', 'Ventas a entidades de régimen especial.'],
    ['<strong>e-45</strong>', 'Gubernamental', 'Ventas al Estado. Exige RNC y razón social.'],
    ['<strong>e-46</strong>', 'Exportaciones', 'Ventas al exterior.'],
    ['<strong>e-33 / e-34</strong>', 'Nota de Débito / Nota de Crédito', 'No se eligen al facturar: se emiten desde la factura que corrigen (sección siguiente).'],
  ])}
  <p>El selector ofrece los tipos que la empresa tiene con secuencia activa.</p>

  <h3 class="subsection-title">Emitir una factura</h3>
  <p>Pestaña ${b('Registrar')}. El formulario va en cuatro pasos (${b('Atras')} / ${b('Siguiente')}), o todo en una página con ${b('Ver todo en una pagina')}.</p>
  ${pasos([
    `<strong>El comprobante:</strong> tipo de e-CF y método de pago — ${b('Efectivo / Caja')}, ${b('Crédito')} (pide la fecha límite pactada con el cliente) o ${b('Transferencia Bancaria')} (banco y número de referencia). Una venta en efectivo exige tener la <strong>caja abierta</strong>.`,
    `<strong>El cliente:</strong> búsquelo por razón social. Si no existe, regístrelo ahí mismo con ${b('Buscar DGII')} y ${b('Registrar Cliente')}.`,
    `<strong>Los artículos:</strong> ${b('Agregar Fila')}, elija el producto y el nivel de precio (Base, Consumidor, Mayorista o Proveedor); el precio también se puede escribir. ${b('Desc. Unit.')} es un descuento en pesos <em>por unidad</em> (solo administración y sistemas). ITBIS 18 %, 16 %, Exento o Tasa 0 % de exportación. Si un producto no tiene existencia, se avisa pero se puede emitir: lo que no se podrá es aprobar el conduce hasta que entre mercancía.`,
    `<strong>Revisar y emitir:</strong> el resumen con un enlace «editar» por apartado, las notas de la factura y los totales. Pulse ${b('Emitir e Imprimir')} y confirme. La flecha del botón ofrece ${b('Solo Guardar')} (emite sin imprimir).`,
  ])}
  ${nota('<strong>No se vende por debajo del costo, contando el descuento.</strong> Si el precio menos el descuento por unidad queda por debajo del costo del producto, el precio se pone en rojo y la factura no se emite: «Con el descuento queda por debajo del costo (mínimo: RD$ X por unidad).» Justo en el costo sí se permite.', 'warn')}

  <h4 class="mini">La tasa del dólar desde la factura</h4>
  <p>Si la empresa tiene productos atados al dólar, en la cabecera de la factura se ve «Tasa del dólar: RD$ X» y, para quien tiene permiso, ${b('Cambiar tasa')} → ${b('Guardar y aplicar precios')}. La tasa se guarda, los precios del catálogo se actualizan y las líneas de esta factura que seguían con el precio anterior pasan al nuevo; lo que se cambió a mano se respeta. La factura siempre cobra el precio del catálogo.</p>

  <h3 class="subsection-title">Borradores</h3>
  <p>${b('Guardar Borrador')} guarda la factura sin emitirla. Para seguirla, en el historial pulse ${b('Editar Borrador')}. Si desde entonces cambiaron precios, sale el aviso «El precio de N productos cambió desde que se guardó este borrador», con lo guardado tachado y lo actual, y dos botones: ${b('Actualizar precios')} (solo cambia las líneas que siguen con el precio guardado) y ${b('Dejar los del borrador')}. Cada línea recuerda su nivel de precio.</p>

  <h3 class="subsection-title">Qué pasa al emitir</h3>
  <ul>
    <li><strong>La factura se imprime en el acto.</strong> mSeller devuelve la firma (código de seguridad, fecha de firma y QR) al instante, y con eso la representación impresa es válida. El papel no lleva ninguna leyenda de "pendiente".</li>
    <li>El veredicto de la DGII llega segundos después. La pantalla lo sigue consultando sola y <strong>la lista se actualiza cuando responde</strong>; no hace falta recargar.</li>
    <li>La aceptación no se anuncia (es lo normal). El rechazo sí: «La DGII rechazó el comprobante», y si ya se imprimió, «El papel que se imprimió NO tiene validez fiscal: recupéralo.»</li>
    <li>Si el envío falló y no hay firma, el comprobante <strong>no se imprime</strong> y la pantalla dice por qué.</li>
    <li>El <strong>correo al cliente</strong> sale solo cuando la DGII acepta, con el PDF adjunto. En el historial, el sobre de cada factura es verde si el correo salió, rojo si falló (con el motivo) y gris si no consta; pulsarlo lo reenvía.</li>
  </ul>

  <h3 class="subsection-title">El historial</h3>
  <p>Pestaña ${b('Historial')}: totales del mes y del filtro, comprobantes pendientes de la DGII, y filtros por fechas, tipo, estado (Borrador, Firmado, Transmitido, Aceptado DGII, Rechazado) y cliente o NCF. Por fila: ${b('Ver Detalles')}, ${b('Descargar PDF')}, ${b('Descargar XML')} y el reenvío de correo. En ${b('Ver Detalles')} están ${b('Imprimir')}, ${b('Reenviar Correo')}, ${b('Nota de Crédito')} y ${b('Nota de Débito')}.</p>

  <h3 class="subsection-title">Cotizaciones — ${ruta('Ingresos', 'Cotizaciones')}</h3>
  <p>Pestañas ${b('Historial')} / ${b('Registrar')}. Una cotización lleva cliente, líneas con nivel de precio e ITBIS, y se guarda con ${b('Guardar e Imprimir')} (o ${b('Solo Guardar')}). En la lista: ${b('Convertir a Factura')} (solo las pendientes; abre Facturación con las líneas cargadas), ${b('Imprimir Cotización')} y ${b('Ver / Editar')}. Solo se editan las pendientes.</p>
`);

seccion('ecf', 'Central e-CF, notas de crédito y débito', `
  <p class="intro-lead">La <strong>Central e-CF</strong> (${ruta('Sistema', 'Comprobantes Fiscales')}) es donde se sigue cada comprobante ante la DGII. Arriba a la derecha dice en qué entorno se trabaja: PRODUCCIÓN o PRUEBA.</p>
  <p>Pestañas: ${b('Comprobantes')}, ${b('Cola DGII')}, ${b('Secuencias SACF')} y ${b('Notas Crédito/Débito')}.</p>

  <h3 class="subsection-title">Comprobantes: consultar el estado</h3>
  <ul>
    <li>${b('CONSULTAR DGII')} pregunta a la DGII (vía mSeller) el estado de <strong>todo lo que cumple el filtro</strong>, no solo la página que se ve, y dice cuántos se consultaron y cuántos cambiaron de estado. Lo aceptado y lo dado de baja no se consulta. Solo consulta: nunca reenvía.</li>
    <li>${b('RECARGAR LISTA')} vuelve a leer la lista guardada; no pregunta nada a la DGII.</li>
    <li>Marcando varias filas aparece una barra con ${b('Consultar DGII')} para esas.</li>
    <li>Si hay comprobantes sin respuesta hace rato, un aviso dice cuántos y cuánto lleva el más antiguo; ${b('Ver cuáles son')} los filtra. Un comprobante «Enviado» sí salió: no se reenvía.</li>
  </ul>
  ${nota('Una consulta nunca cambia un comprobante aceptado ni uno dado de baja, aunque mSeller conteste otra cosa.')}

  <h3 class="subsection-title">Un comprobante rechazado</h3>
  <p>Hay dos caminos, y el diálogo los explica antes de confirmar:</p>
  <div class="grid-2">
    <div class="feature-card"><h4>Reenviar a DGII</h4><p>Para corregirlo y volver a enviarlo con el mismo e-NCF. Solo aparece en rechazados, firmados o borradores — nunca en uno «Enviado».</p></div>
    <div class="feature-card"><h4>Dar de baja</h4><p>Registra el asiento contrario al de la emisión con fecha de hoy, retira su cuenta por cobrar y deja el comprobante ANULADO. Después ya no se puede reenviar. Se niega si tiene cobros, conduces o caja asociados.</p></div>
  </div>

  <h3 class="subsection-title">Notas de Crédito (e-34) y de Débito (e-33)</h3>
  <p>Se empiezan desde la factura que corrigen: en el historial de Facturación, ${b('Ver Detalles')} → ${b('Nota de Crédito')} o ${b('Nota de Débito')}. También desde ${ruta('Ingresos', 'Credito / Debito')} (pantalla <strong>Notas de Crédito / Débito</strong>): ${b('Vincular Factura Afectada')}, motivo, líneas del ajuste, «Motivo de la Modificación» (obligatorio) y ${b('Emitir Nota')}.</p>
  <ul>
    <li><strong>Motivos de la nota de crédito:</strong> 1 Anulación completa, 2 Corrección de texto, 3 Corrección de montos / Ajuste parcial.</li>
    <li><strong>Motivos de la nota de débito:</strong> 2 Ajuste de precio (intereses, cargos), 3 Ajuste de cantidad, 4 Otros.</li>
    <li>Solo se emiten notas sobre <strong>facturas aceptadas</strong> por la DGII, y una nota no modifica otra nota.</li>
    <li><strong>Límite:</strong> una nota de crédito no puede acreditar más de lo que queda de su factura (el total, más las notas de débito, menos las notas de crédito ya vigentes). Si lo supera, el sistema dice cuánto queda disponible.</li>
  </ul>

  <h3 class="subsection-title">Cola DGII y Secuencias SACF</h3>
  <p>${b('Cola DGII')} muestra los envíos en curso, con ${b('Actualizar')} y ${b('Reintentar todos')}. En ${b('Secuencias SACF')} se registran las autorizaciones de numeración de la DGII con ${b('Nueva Autorización')} y se activan o desactivan; editar una secuencia es exclusivo del rol Sistemas. Al llegar al 90 % de una secuencia, se avisa para pedir una nueva.</p>
`);

seccion('caja', 'Caja: apertura, arqueo y cierre', `
  <p class="intro-lead">El <strong>Módulo de Caja</strong> (${ruta('Ingresos', 'Modulo de Caja')}) controla el efectivo del turno. Tiene tres pestañas: ${b('Gestión de Caja')}, ${b('Arqueo y Cierre')} e ${b('Histórico de Cierres')}.</p>
  ${nota('Sin caja abierta no se puede vender, cobrar ni pagar en efectivo, ni registrar una compra en efectivo: toda salida o entrada de efectivo tiene que constar en la sesión para que la caja cuadre.', 'warn')}

  <h3 class="subsection-title">Abrir la caja</h3>
  ${pasos([
    `Elija el ${b('Punto de Venta *')} (la terminal). Si no hay ninguna, créela con ${b('+ Nueva Terminal')} (nombre y código único).`,
    `Escriba el ${b('Monto de Apertura (Fondo de Caja) *')} — el efectivo con que empieza — y pulse ${b('Abrir Caja')}. La fecha y la hora las pone el sistema.`,
  ])}

  <h3 class="subsection-title">Durante el turno</h3>
  <p>Las ventas y cobros en efectivo, los pagos a suplidores en efectivo y las compras en efectivo se anotan solos en la sesión. Para otros movimientos, ${b('Entrada de Efectivo')} o ${b('Salida de Efectivo')}, con monto y concepto. La tabla «Movimientos de Caja» lista todo; el botón de exportar descarga un <strong>CSV</strong> (fecha y hora, tipo, concepto, referencia y monto con signo) que abre en Excel.</p>
  <p><strong>Arqueo a ciegas:</strong> solo Administración y Sistemas ven el «Balance Actual» de la caja. El resto ve «Se ve al cerrar la caja»: quien cuenta el dinero no sabe cuánto debería haber.</p>

  <h3 class="subsection-title">Arqueo y cierre</h3>
  ${pasos([
    `Pestaña ${b('Arqueo y Cierre')}. En «Desglose de Efectivo (DOP)» anote cuántos billetes hay de 2,000, 1,000, 500, 200, 100 y 50, y cuántas monedas de 25, 10, 5 y 1. El sistema suma el «Total Contado»; no hay un campo de total para escribir a mano.`,
    `Añada observaciones si las hay y pulse ${b('Finalizar Turno e Imprimir Arqueo')}.`,
    `La ventana «Cierre Exitoso» muestra entonces el «Esperado en sistema», lo «Contado» y la «Diferencia», y los cobros por transferencia o cheque del turno con su constancia (número de transferencia o cheque): constan en el arqueo pero no entran en el conteo de efectivo.`,
  ])}
  <p>Si hay diferencia, el cierre <strong>se registra igual</strong> y queda pendiente de aprobación: «Hay diferencia: el cierre queda registrado y pendiente de aprobación de un supervisor.» El panel de inicio avisa del faltante o sobrante hasta que un supervisor, en ${b('Histórico de Cierres')}, pulsa ${b('Dar por revisada la diferencia')}. El cierre no hace ningún asiento por la diferencia: a qué cuenta va un faltante lo decide el contador.</p>

  <h3 class="subsection-title">Histórico de Cierres</h3>
  <p>Cada cierre con su apertura, terminal, esperado, real y diferencia, y las acciones ${b('Ver Detalle')}, ${b('Reimprimir')} y ${b('Dar por revisada la diferencia')}. Se filtra por fecha y estado, y ${b('EXPORTAR XLS')} descarga la lista (en formato CSV, que Excel abre).</p>
`);

seccion('cobros', 'Cobros y cuentas por cobrar', `
  <p class="intro-lead">${ruta('Ingresos', 'Pagos y Abonos')} abre la pantalla <strong>Cuentas por Cobrar</strong>, con el total pendiente de todos los clientes y tres pestañas: ${b('Balances de Clientes')}, ${b('Historial de Recibos')} y ${b('Estado de Cuenta y Abonos')}.</p>

  <h3 class="subsection-title">Balances de Clientes</h3>
  <p>Una tabla con un cliente por fila: RNC, facturas pendientes y balance. Al pulsar el nombre o la flecha se despliegan sus facturas (vencidas en rojo); abrir otro cliente cierra el anterior. En la fila: ${b('Imprimir')} y ${b('Registrar Cobro')}.</p>

  <h3 class="subsection-title">Registrar un cobro</h3>
  ${pasos([
    `Pulse ${b('Registrar Cobro')} en el cliente. Escriba el monto y elija el método: ${b('Banco / Transferencia')} o ${b('Caja Chica')} (efectivo).`,
    `Si es por banco, elija la ${b('Cuenta Bancaria')} donde entró el dinero (obligatoria) y escriba el número de la transferencia en ${b('Referencia (Cheque/Transfer)')}: es la constancia que aparece en el cuadre de caja. El cobro se asienta contra ese banco y queda como depósito pendiente de conciliar en su libro.`,
    `Si es en efectivo, entra en la sesión de caja abierta («Este cobro se agregará directamente al arqueo de tu sesión de caja actual»).`,
    `Reparta el monto entre las facturas (${b('Distribuir en Facturas')} lo hace solo) y pulse ${b('Procesar Recibo')}. El recibo se imprime.`,
  ])}
  ${nota('La suma aplicada a las facturas tiene que coincidir con el monto cobrado. Un cobro fechado en un período contable cerrado no se registra.')}

  <h3 class="subsection-title">Estados de cuenta y reportes</h3>
  <ul>
    <li>${b('Estado de Cuenta y Abonos')}: elija el cliente y verá, en orden de fecha, cada factura y cada abono con el balance acumulado; ${b('Imprimir Estado')}.</li>
    <li>${ruta('Ingresos', 'Cuenta por Cobrar')}: total por cobrar y balance vencido, filtro por cliente e ${b('Imprimir Reporte')}.</li>
    <li><strong>Antigüedad de Saldos</strong> (clientes y suplidores): cada uno clasificado como «Al día», «En observación» o «Acción inmediata», ${b('Exportar CSV')} y el estado de cuenta de cada uno.</li>
    <li>${ruta('Finanzas', 'E.C. Clientes (CxC)')} y ${ruta('Finanzas', 'E.C. Suplidores (CxP)')}: el auxiliar completo, imprimible entero, solo pendientes o solo vencidos.</li>
  </ul>
`);

seccion('compras', 'Compras, gastos y cuentas por pagar', `
  <p class="intro-lead"><strong>Compras y Gastos</strong> (${ruta('Egresos', 'Compras y Gastos')}) registra las facturas de suplidores y los gastos; alimenta el 606. Pestañas: ${b('Historial')}, ${b('Registrar')} y ${b('Cheques')}.</p>

  <h3 class="subsection-title">Registrar una compra o un gasto</h3>
  <p>Pestaña ${b('Registrar')}, en cuatro pasos (o ${b('Ver todo en una pagina')}):</p>
  ${pasos([
    `<strong>El comprobante:</strong> suplidor (con + para darlo de alta), NCF, fecha, ${b('Tipo de Gasto (Formato 606)')} y concepto. ${b('Es un Gasto Menor (Caja Chica)')} quita el suplidor y deja el NCF opcional. ${b('Lector OCR (Subir Factura)')} lee los datos de una foto de la factura.`,
    `<strong>Qué se compró:</strong> líneas de producto con cantidad, costo e ITBIS, y el ${b('Almacén Destino (Inventario)')} si la mercancía entra al inventario. O bien active ${b('Compra por Monto General')}: escriba el total y el sistema separa subtotal e ITBIS (total ÷ 1.18, editables), y elija la ${b('Cuenta de Costo / Gasto *')}; esa compra no toca inventario.`,
    `<strong>Cómo se paga:</strong> el ${b('Método de Pago')} (ver tabla). Para cheque/transferencia o tarjeta hay que decir ${b('¿De dónde sale el pago? *')}.`,
    `<strong>Revisar y guardar:</strong> el resumen con Subtotal, ITBIS, ISC y Otros Impuestos editables y el total neto. ${b('Guardar Compra / Gasto')}.`,
  ])}
  ${tabla(['Método de pago', 'De dónde sale el dinero'], [
    ['01 Efectivo', 'De la caja abierta (se anota en la sesión).'],
    ['02 Cheque / Transferencia / Depósito', 'De la cuenta bancaria que elija. El retiro queda en el libro de ese banco, pendiente de conciliar.'],
    ['03 Tarjeta de Crédito / Débito', 'Débito: elija la cuenta bancaria. Crédito: elija la cuenta por pagar de la tarjeta (se le debe al banco); viene propuesta la configurada.'],
    ['04 A Crédito (CxP)', 'No sale nada todavía: queda la deuda en Cuentas por Pagar. Admite cheque en garantía.'],
  ])}
  <p><strong>Productos en dólares:</strong> entran con su costo en US$ multiplicado por la tasa vigente. Junto a las líneas se ve la tasa y, para administración, ${b('Cambiar tasa')} → ${b('Guardar y aplicar precios')}, que también recalcula las líneas de esta compra que seguían con la tasa anterior. El costo de una línea siempre se puede corregir a mano: manda la factura del suplidor.</p>

  <h3 class="subsection-title">Cheques en garantía</h3>
  <p>En una compra a crédito marque ${b('Dejar Cheque en Garantía')} y complete el banco, el ${b('Número de Cheque *')}, el monto (si no coincide con el total se avisa), la ${b('Fecha de Cobro *')} y el beneficiario (el suplidor). La deuda se reconoce el día de la factura (en el 606 va como forma de pago 04), pero el dinero no sale del banco hasta que el cheque se cobra.</p>
  <ul>
    <li><strong>Cobrarlo:</strong> cuando el banco lo pagó, en ${ruta('Egresos', 'Pagos a Suplidores')} › ${b('Cheques en Garantía')} marque los cheques, indique la fecha de cobro (no puede ser futura) y pulse ${b('Confirmar cobro')}; o en la pestaña ${b('Cheques')} de Compras, ${b('Aplicar')}. Se rebaja la deuda y se registra la salida del banco.</li>
    <li>El panel de inicio avisa desde <strong>3 días antes</strong> de la fecha de cobro.</li>
    <li>Un cheque no se puede cobrar contra una factura que ya no debe su importe (por ejemplo, si se pagó por otro medio): el sistema lo rechaza y dice el motivo.</li>
  </ul>

  <h3 class="subsection-title">Pagar a un suplidor — ${ruta('Egresos', 'Pagos a Suplidores')}</h3>
  <p>Pantalla <strong>Módulo de Cuentas por Pagar</strong>, pestañas ${b('Cuentas por Pagar (Facturas)')}, ${b('Cheques en Garantía')} e ${b('Historial de Pagos')}. Las facturas van agrupadas por suplidor; en cada una, ${b('Registrar Pago')}:</p>
  <ul>
    <li><strong>Transferencia Bancaria</strong> o <strong>Cheque Bancario</strong>: hay que elegir la cuenta bancaria de la que sale (con cheque, también número y beneficiario). El pago se asienta contra ese banco y el retiro queda en su libro, pendiente de conciliar. Con cheque puede marcarse «Cheque en Garantía (Post-fechado)»: no se aplica a la deuda hasta su fecha de cobro.</li>
    <li><strong>Efectivo / Caja Chica</strong>: sale de la sesión de caja abierta.</li>
    <li>El monto no puede pasar del balance de la factura.</li>
  </ul>
  ${nota('Si la factura ya tiene cheques en garantía pendientes, la ventana de pago los muestra (número, banco, fecha de cobro y monto) con el saldo sin cubrir, y propone pagar solo eso. Pagar por encima pide confirmación: sería pagar dos veces lo mismo.', 'warn')}

  <h3 class="subsection-title">Pedidos a Suplidores</h3>
  <p>${ruta('Egresos', 'Pedidos a Suplidores')}: pedidos de mercancía sin factura. Pestañas ${b('Pedidos')} / ${b('Registrar')}: suplidor, almacén de destino, fecha estimada y productos; ${b('Guardar Pedido')}. Desde el detalle: ${b('Enviar al Suplidor')} (solo en borrador), ${b('Enviar por Correo')}, ${b('Imprimir PDF')}, ${b('Duplicar')}, ${b('Cancelar Pedido')} y ${b('Registrar Recepción')}, que mete en el inventario únicamente lo recibido. Solo se edita un pedido en borrador.</p>

  <h3 class="subsection-title">Retenciones</h3>
  <p>${ruta('Sistema', 'Retenciones')} (<strong>Retenciones Fiscales</strong>): pestañas ${b('Retenciones')} / ${b('Registrar')}. Cada retención lleva nombre, tipo (ISR, ITBIS u otra) y porcentaje; se aplican al crear la factura y salen en el PDF y en el 607.</p>
`);

seccion('finanzas', 'Bancos y contabilidad', `
  <h3 class="subsection-title">Cuentas Bancarias — ${ruta('Finanzas', 'Cuentas Bancarias')}</h3>
  <p>Pestañas ${b('Cuentas')} / ${b('Registrar')}. Cada cuenta lleva banco, número, moneda, tipo, color, balance inicial y su ${b('Cuenta Contable del Banco')} (obligatoria). Al elegir una cuenta se ve su historial de transacciones con ${b('Registrar Movimiento')} e ${b('Imprimir Reporte')}.</p>
  ${pasos([
    `Elija la cuenta (con «Todas las Cuentas» elegida el botón queda inactivo) y pulse ${b('Registrar Movimiento')}.`,
    `Tipo: depósito, transferencia recibida, retiro, transferencia enviada o cargo/comisión; monto y descripción.`,
    `La ${b('Cuenta Contable (Contrapartida)')} es <strong>obligatoria</strong>: es la otra mitad del asiento. Pulse ${b('Procesar Movimiento')}.`,
  ])}
  <p><strong>Conciliación Bancaria:</strong> elija la cuenta, el rango de fechas y el saldo final del estado del banco, y marque los movimientos que el banco ya pasó. ${b('Asentar Conciliación')} solo se activa cuando la diferencia es cero; si no cuadra, el sistema dice cuánto falta.</p>

  <h3 class="subsection-title">Contabilidad — ${ruta('Finanzas', 'Contabilidad')}</h3>
  <p>Pantalla <strong>Libro Mayor y Asientos</strong>, pestañas: ${b('Catálogo de Cuentas')}, ${b('Asientos Contables')}, ${b('Libro Mayor')}, ${b('Balanza de Comprobación')}, ${b('Estados Financieros')} y ${b('Períodos Contables')}.</p>
  <ul>
    <li><strong>Catálogo:</strong> el plan de cuentas de la empresa, que se crea al crear la empresa y lo administra el contador (${b('Nueva Cuenta')}, ${b('Imprimir Catálogo')}).</li>
    <li><strong>Asiento manual:</strong> ${b('Nuevo Asiento')}, líneas con cuenta, débito o crédito (nunca los dos en la misma línea). ${b('Contabilizar')} solo se activa cuando el asiento está «Cuadrado»; si no, dice qué falta.</li>
    <li><strong>Libro Mayor:</strong> elija la cuenta y el rango; muestra saldo inicial, movimientos y saldo final.</li>
    <li><strong>Estados Financieros:</strong> ${b('Estado de Resultados')} y ${b('Balance General')}. Cada grupo suma sus cuentas hijas y el balance incluye el resultado acumulado; si no cuadrara, dice la diferencia.</li>
  </ul>
  <h4 class="mini">Períodos contables</h4>
  <p>Ningún asiento se registra en una fecha sin período abierto: «No hay un período contable abierto para la fecha …: está cerrado o no se ha abierto todavía.» Esto vale también para las facturas, compras y cobros, que asientan solos.</p>
  ${pasos([
    `En ${b('Períodos Contables')} pulse ${b('Abrir próximos 12 meses')}: abre los meses que falten desde el actual hasta dentro de un año, sin tocar los que ya existen.`,
    `${b('Abrir Período')} crea uno a mano (nombre, inicio y fin; no admite fechas invertidas ni solapes).`,
    `Al terminar un mes, ${b('Cerrar Período')} impide registrar en él; ${b('Reabrir Período')} lo deshace.`,
  ])}
  ${nota('Nada se abre solo. El panel avisa cuando quedan menos de 45 días con período abierto: hay que pulsar el botón en cada empresa y en cada modo (Producción y Prueba).', 'warn')}

  <h3 class="subsection-title">Reportes fiscales 606 y 607</h3>
  <p>Desde ${ruta('Finanzas', 'Reportes')}. Elija el <strong>Período</strong> (mes) y el informe se carga solo.</p>
  ${tabla(['', '606 — Compras', '607 — Ventas'], [
    ['Exportar', b('Exportar TXT'), b('Exportar TXT 607')],
    ['Formato', 'Anexo A de la NG 07-2018, nombre DGII_F_606_RNC_AAAAMM.TXT', 'Anexo B, nombre DGII_F_607_RNC_AAAAMM.TXT'],
    ['Quedan fuera del TXT', 'Las compras sin NCF («Sin NCF: no va en el TXT»)', 'Las facturas de consumo (e-32) de menos de RD$ 250,000 y los comprobantes rechazados'],
  ])}
  <ul>
    <li>El 607 muestra el <strong>«Resumen General de Facturas de Consumo (Oficina Virtual)»</strong> —cantidad de NCF, monto, ITBIS y total— para el módulo de la Oficina Virtual de la DGII.</li>
    <li>${b('Marcar como presentado')} deja constancia de que ya se envió a la DGII (pasa a «Presentado el …»; pulsándolo otra vez se quita). No envía nada: la declaración se presenta en la DGII. Mientras un mes cerrado no esté marcado, el panel avisa, con plazo el día 15.</li>
  </ul>

  <h3 class="subsection-title">Dashboard Financiero</h3>
  <p>${ruta('Finanzas', 'Dashboard Financiero')}: lo pendiente y lo vencido por cobrar y por pagar, el balance neto, y los clientes y suplidores con mayor saldo y mayor volumen.</p>
`);

seccion('rrhh', 'Recursos humanos y nómina', `
  <p class="intro-lead">El grupo ${b('Recursos Humanos')} calcula la nómina con las retenciones de ley (TSS e ISR) y las prestaciones del Código de Trabajo.</p>
  ${tabla(['Pantalla', 'Para qué'], [
    ['Dashboard RRHH', 'Empleados, costo mensual de nómina, aportes TSS del patrono, ISR retenido, vacaciones disponibles.'],
    ['Empleados', `Pestañas lista / ${b('Registrar')}: datos personales y laborales (contrato, frecuencia de pago, estado).`],
    ['Departamentos', 'Departamentos y cargos, cada lista con su botón Agregar.'],
    ['Nominas', `${b('Generar Nómina')} (frecuencia y período); en el detalle ${b('Recalcular Todo')}, ${b('Aprobar Nómina')} y los volantes de pago.`],
    ['Horas Extras y Adicionales', 'Pestañas Horas Extras, Ingresos Adicionales y Deducciones; lo que se registra es del tipo de la pestaña elegida.'],
    ['Vacaciones', 'Días generados, tomados y disponibles por empleado, según la escala del Art. 177 del Código de Trabajo.'],
    ['Liquidacion y Prestaciones', 'Preaviso, cesantía y vacaciones no tomadas, y el Salario de Navidad (doble sueldo), con impresión.'],
    ['Configuracion de Ley', 'Porcentajes de TSS y de horas extras, tramos del ISR y topes de AFP, SFS y riesgos laborales.'],
  ])}
  ${nota('<strong>La nómina no genera asientos contables.</strong> Aprobarla cambia su estado y marca como procesadas las novedades del período, pero sueldos, TSS e ISR retenido no entran solos al libro mayor: el contador los registra con un asiento manual.', 'warn')}
  <p>Los porcentajes y topes legales se mantienen en ${b('Configuracion de Ley')}; ${b('Restablecer')} vuelve a los valores de fábrica. Revíselos cuando cambien las tasas de la TSS o la escala del ISR.</p>
`);

seccion('herramientas', 'Herramientas y soporte', `
  <ul>
    <li><strong>Desglose Ventanas</strong> (Optimizador & Desglose de Ventanas): sistemas TRAD, P-65 y P-92, de 2 a 4 vías (P-65 hasta 3); con el ancho y el alto en pulgadas calcula los cortes de perfiles y el vidrio. Se autoguarda.</li>
    <li><strong>Desglose Puertas Comerciales:</strong> agrega puertas al desglose de cortes.</li>
    <li><strong>Corte de Vidrio:</strong> con el tamaño de la lámina y los cortes requeridos, calcula cuántas planchas hacen falta y cómo acomodar las piezas.</li>
    <li><strong>QR Tienda Online:</strong> el código QR de la tienda en línea, con colores, logo y resolución; ${b('Descargar PNG/SVG')}, ${b('Copiar Enlace')} e ${b('Imprimir')}.</li>
  </ul>
  ${nota('La pantalla «Soporte y Centro de Ayuda» tiene preguntas frecuentes. Su formulario de ticket todavía no envía el mensaje a nadie: para soporte, contacte directamente al equipo técnico.', 'warn')}
`);

seccion('configuracion', 'Configuración y administración', `
  <h3 class="subsection-title">Ajustes del Sistema — ${ruta('Sistema', 'Configuración')}</h3>
  <p>Pestañas: ${b('Mi Perfil')} (su foto y sus datos), ${b('Configuración Empresa')}, ${b('Tienda')}, ${b('Cuentas Puente')}, ${b('Plan & Suscripción')} y ${b('Tipos de Gastos')}. Todas menos Mi Perfil son de Administración y Sistemas.</p>
  <h4 class="mini">Configuración Empresa</h4>
  <ul>
    <li><strong>Identidad Fiscal:</strong> nombre comercial, RNC, dirección, teléfono, correo y logo (sale en facturas y reportes). Nombre y RNC solo los cambia Sistemas una vez guardados.</li>
    <li><strong>Avisos del sistema:</strong> el correo de destino de los avisos, o la casilla ${b('Usar el correo de la empresa')}. Vacío = sin avisos por correo.</li>
    <li><strong>Integración mSeller API:</strong> las credenciales de facturación electrónica (se guardan cifradas y no se vuelven a mostrar).</li>
    <li><strong>Parámetros Operativos:</strong> ${b('Modo del sistema')} (Pruebas o Producción), formato de impresión predeterminado (Carta, Ticket 80 mm o 58 mm) y copias, conduces automáticos, límites y códigos de barra (tipo, prefijo y longitud).</li>
  </ul>
  <p>Al terminar, ${b('Guardar Cambios')}.</p>
  <h4 class="mini">Cuentas Puente</h4>
  <p>Aquí el contador elige a qué cuenta del catálogo va cada asiento automático. Están agrupadas en cinco bloques: <strong>Caja, bancos y tarjetas · Clientes y ventas · Inventario y costo · Compras y proveedores · Impuestos y retenciones</strong>, cada uno con una línea que dice qué alimenta. El sistema no lleva códigos de cuenta fijos: si una cuenta no es la correcta, se corrige aquí. ${b('Guardar Cuentas Puente')}.</p>
  <h4 class="mini">Tipos de Gastos</h4>
  <p>Los tipos del 606. Los códigos 01 a 10 son estándar de la DGII y solo se pueden desactivar; ${b('Crear Tipo de Gasto')} añade otros (código de 2 dígitos).</p>
  <h4 class="mini">Tienda y Plan</h4>
  <p>${b('Tienda')} configura la portada de la tienda en línea (sección siguiente). ${b('Plan & Suscripción')} muestra el plan contratado y sus límites de e-CF, usuarios y almacenes; para cambiarlo, contacte a soporte.</p>

  <h3 class="subsection-title">Administración — ${ruta('Sistema', 'Administracion')}</h3>
  <p>Pantalla <strong>Gestión de Acceso y Planes</strong>:</p>
  <ul>
    <li>${b('Usuarios')}: ${b('Nuevo Usuario')} (nombre, correo, contraseña inicial de 6 caracteres o más, rol). Al editar, el campo de contraseña en blanco no la cambia; si se cambia, <strong>se cierran todas las sesiones de ese usuario</strong>. Un usuario se puede suspender y volver a activar.</li>
    <li>${b('Sesiones Activas')} (solo Sistemas): ver y cerrar sesiones a distancia.</li>
    <li>${b('Roles del Sistema')} y ${b('Mi Suscripción')}.</li>
  </ul>
  <p><strong>Empresas</strong> (${ruta('Sistema', 'Empresas')}, solo Sistemas): pestañas de lista y ${b('Registrar')}; por empresa, gestionar su suscripción, limpiar sus datos de prueba (hay que escribir el nombre para confirmar) o desactivarla.</p>
`);

seccion('tienda', 'La tienda en línea', `
  <p class="intro-lead">Cada empresa tiene una tienda pública donde cualquiera ve los productos y sus precios y arma una cotización imprimible. <strong>No hay cuentas ni inicio de sesión</strong>, y la tienda no vende: el carrito es una cotización.</p>
  <p>La dirección es <strong>/&lt;empresa&gt;</strong> después del dominio del sistema: el nombre de la empresa en minúsculas, sin acentos, espacios ni signos (una empresa llamada «Mi Empresa S.R.L.» queda en <em>/miempresasrl</em>). La herramienta ${ruta('Herramientas', 'QR Tienda Online')} genera e imprime el código QR que lleva a ella.</p>

  <h3 class="subsection-title">Qué ve el visitante</h3>
  <ul>
    <li><strong>Cabecera:</strong> el logo, ${b('Buscar')} a la izquierda, y a la derecha el corazón de favoritos y la bolsa de «Mi cotización», cada uno con su contador.</li>
    <li><strong>Menú:</strong> «Todos los productos», las categorías con más productos y «Promociones» solo si hay alguna oferta.</li>
    <li><strong>Portada:</strong> el anuncio de arriba (si hay), título, texto e imagen configurables, «Compra por categoría» y «Nuestros productos».</li>
    <li><strong>Catálogo:</strong> filtro por categoría, búsqueda por nombre y ${b('Ordenar por:')} Relevancia, Precio: menor a mayor, Precio: mayor a menor o Nombre: A a Z. Los precios se muestran sin ITBIS («+ ITBIS»); si hay oferta, sale la etiqueta «Oferta» con el precio anterior tachado.</li>
    <li><strong>Ficha del producto:</strong> foto, precio, descripción, cantidad y ${b('Añadir a mi cotización')}.</li>
    <li><strong>Favoritos:</strong> el corazón guarda el producto en ese navegador (en otro dispositivo se empieza sin favoritos).</li>
  </ul>

  <h3 class="subsection-title">Mi cotización</h3>
  <p>Muestra cada producto con su precio de hoy (siempre el del catálogo, nunca uno guardado en el navegador), la cantidad y el importe; abajo «Subtotal», «ITBIS (18 %)» y «Total». Si un producto ya no se vende, se avisa con su nombre y no suma. ${b('Imprimir cotización')} abre la impresión del navegador (desde ahí también se guarda en PDF): el papel lleva el nombre, RNC, teléfono, correo y dirección de la empresa, la fecha y la nota «Esta cotización no es una factura ni un comprobante fiscal».</p>

  <h3 class="subsection-title">Configurar la portada — ${ruta('Sistema', 'Configuración')} › pestaña ${b('Tienda')}</h3>
  <p>Solo administración y sistemas. La tarjeta «Portada de la tienda» tiene un enlace ${b('Ver la tienda')} y cuatro campos; <strong>un campo vacío usa lo de siempre</strong>:</p>
  ${tabla(['Campo', 'Tope', 'Si se deja vacío'], [
    ['Anuncio de arriba', '120 caracteres, una línea', 'No hay barra de anuncio'],
    ['Título', '80 caracteres, una línea', '«Bienvenido a &lt;empresa&gt;»'],
    ['Texto', '400 caracteres, admite párrafos', 'Un texto neutro de bienvenida'],
    ['Imagen', 'JPG, PNG o WebP (se reduce sola; mejor apaisada)', 'El logo de la empresa'],
  ])}
  <p>Suba la imagen con ${b('Subir imagen')} (luego ${b('Cambiar')} o ${b('Quitar')}) y pulse ${b('Guardar portada')}: «Portada guardada. Ya se ve en la tienda.» La foto y la descripción de cada producto se ponen en la ficha del producto (sección de Inventario).</p>
`);


// ─── Montaje ──────────────────────────────────────────────────────────────────
function htmlDeSeccion(s, i) {
  return `<div class="page" id="${s.id}"><h2 class="section-title"><span class="num">${i + 1}.</span>${s.titulo}</h2>${s.html}</div>`;
}

function documento(cuerpo) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Manual de Usuario — ContFast Enterprise</title><style>${CSS}</style></head><body>${cuerpo}</body></html>`;
}

const PORTADA = `
  <div class="cover-page">
    <div class="cover-header">ContFast Enterprise</div>
    <div class="cover-middle">
      <h1>Manual de Usuario<br>y Guía de Operaciones</h1>
      <h2>Sistema ERP contable y de Facturación Electrónica (e-CF) — República Dominicana</h2>
      <div class="cover-divider"></div>
      <div class="cover-meta"><strong>Versión ${VERSION}</strong> · ${FECHA}</div>
    </div>
    <div class="cover-footer">
      <div><strong>Para quien usa el sistema</strong><br>Administración, contabilidad, caja, facturación y almacén</div>
      <div style="text-align:right"><strong>Desarrollado para</strong><br>Latin Doors SRL y empresas afiliadas</div>
    </div>
  </div>`;

function indice(paginas) {
  const filas = SECCIONES.map(
    (s, i) => `<li class="toc-item"><a href="#${s.id}"><span class="toc-name">${i + 1}. ${s.titulo}</span>
      <span class="toc-dots"></span><span class="toc-page">${paginas ? 'Pág. ' + paginas[i] : ''}</span></a></li>`,
  ).join('');
  return `<div class="page" id="indice"><h2 class="section-title">Tabla de contenidos</h2>
    <p class="intro-lead">Esta guía explica, pantalla por pantalla, cómo se trabaja en ContFast Enterprise. Los nombres de botones y pestañas aparecen ${b('así')}, tal como se ven en el sistema.</p>
    <ul class="toc-list">${filas}</ul></div>`;
}

const OPCIONES_PDF = {
  format: 'Letter',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `
    <div style="font-family: Arial, sans-serif; font-size: 7px; color: #64748b; width: 100%; padding: 0 45px; display: flex; justify-content: space-between; box-sizing: border-box;">
      <span>ContFast Enterprise — Manual de Usuario v${VERSION}</span><span>${FECHA}</span>
    </div>`,
  footerTemplate: `
    <div style="font-family: Arial, sans-serif; font-size: 7px; color: #64748b; width: 100%; padding: 0 45px; display: flex; justify-content: space-between; box-sizing: border-box;">
      <span>Uso interno — Latin Doors SRL y empresas afiliadas</span>
      <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>`,
  margin: { top: '60px', bottom: '60px', left: '50px', right: '50px' },
};

const contarPaginas = (buf) =>
  (Buffer.from(buf).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

async function pdfDe(page, html) {
  await page.setContent(html, { waitUntil: 'load', timeout: 0 });
  return page.pdf(OPCIONES_PDF);
}

(async () => {
  let browser;
  try {
    console.log('Iniciando Chromium...');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // 1) Cuantas paginas ocupa cada pieza por separado.
    const pPortada = contarPaginas(await pdfDe(page, documento(PORTADA)));
    const pIndice = contarPaginas(await pdfDe(page, documento(indice(SECCIONES.map(() => 999)))));
    const paginas = [];
    let siguiente = pPortada + pIndice + 1;
    for (let i = 0; i < SECCIONES.length; i++) {
      paginas.push(siguiente);
      siguiente += contarPaginas(await pdfDe(page, documento(htmlDeSeccion(SECCIONES[i], i))));
    }

    // 2) El documento entero, con el indice ya numerado.
    const html = documento(PORTADA + indice(paginas) + SECCIONES.map(htmlDeSeccion).join(''));
    if (process.env.MANUAL_HTML) fs.writeFileSync(process.env.MANUAL_HTML, html);
    const buf = await pdfDe(page, html);
    const total = contarPaginas(buf);
    if (total !== siguiente - 1) {
      throw new Error(`El indice no cuadra: se esperaban ${siguiente - 1} paginas y salieron ${total}.`);
    }
    const pdfPath = path.join(RAIZ, 'manual_usuario_contfast.pdf');
    fs.writeFileSync(pdfPath, buf);
    console.log(`PDF generado (${total} paginas):`, pdfPath);
  } catch (error) {
    console.error('Error generando el PDF:', error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
