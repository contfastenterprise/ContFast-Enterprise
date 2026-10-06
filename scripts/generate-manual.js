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
 * LOTE 296 (version 3.1): la nomina completa (calcular, aprobar con su asiento, pagar), lo
 * que quedo falso desde el 283 (soporte por correo, registro publico, tarjetas de productos,
 * rotulos CSV, tienda, menu) y, por decision del dueño, NADA de lo que solo hace el rol
 * Sistemas (cambiar de empresa, empresas, sesiones, editar secuencias, modo, mSeller) ni
 * nada tecnico (guiones, migraciones). Donde una pantalla necesita eso, se dice "consulte
 * con el administrador del sistema".
 *
 * LOTE 302 (version 3.2): la seccion "Planes, prueba gratis y limites" (lotes 299 y 300)
 * y una linea en facturacion, contabilidad, nomina, almacenes, usuarios y avisos. Sin
 * Administracion > Planes ni la asignacion de suscripciones (son del rol Sistemas).
 *
 * LOTE 303 (version 3.3): Administracion > "Mi Suscripcion" enseña la MISMA tarjeta que
 * Plan & Suscripcion (estado, dias, uso), el estado "Sin plan" entra en la tabla, y los
 * mensajes de "sin plan" y "cancelado" remiten al administrador del sistema, no a soporte.
 *
 * LOTE 305 (version 3.4): Antiguedad de Saldos tal como quedo en el lote 304 (que cuenta como
 * deuda, el vencimiento pactado, los tramos, los niveles y sus colores, dona contra tarjetas,
 * la tabla y el CSV), y la nota de que una factura rechazada deja de contar como deuda.
 * LOTE 306 (version 3.5): «Cartera en Riesgo» cuenta desde el primer dia de atraso.
 * LOTE 307 (version 3.6): «Accion inmediata» tambien, y «En observacion» se retira.
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
const VERSION = '3.6';

// El logo del sistema, el mismo de la pantalla de acceso (`public/Logo.svg`), incrustado en el
// HTML: Chromium no tiene que salir a buscarlo. La portada es blanca, asi que va directo:
// la mitad del logo es azul oscuro (#202739, #242476) y sobre fondo oscuro desapareceria.
const LOGO_SVG = `data:image/svg+xml;base64,${fs.readFileSync(path.join(RAIZ, 'public', 'Logo.svg')).toString('base64')}`;

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
    padding: 60px; background: #fff;
    color: var(--azul); page-break-after: always;
  }
  .cover-header { font-size: 14px; font-weight: 700; letter-spacing: 3px; color: var(--oro-texto); text-transform: uppercase; }
  /* Portada blanca (pedido del dueño): el logo va directo, sin placa. */
  .cover-logo { align-self: flex-start; }
  .cover-logo img { display: block; width: 300px; height: auto; }
  .cover-middle { margin-top: 60px; }
  .cover-middle h1 { font-size: 40px; font-weight: 800; line-height: 1.15; margin: 0 0 16px; letter-spacing: -0.5px; color: var(--azul); }
  .cover-middle h2 { font-size: 17px; font-weight: 400; margin: 0 0 30px; color: #475569; }
  .cover-divider { width: 80px; height: 5px; background: var(--oro); border-radius: 2px; }
  .cover-meta { margin-top: 28px; font-size: 13px; color: #475569; }
  /* El dorado de la marca sobre blanco da 2,4:1; para texto va el dorado de texto (lote 275). */
  .cover-meta strong { color: var(--oro-texto); }
  .cover-footer { font-size: 12px; color: #475569; line-height: 1.8; border-top: 1px solid #e2e8f0; padding-top: 20px; display: flex; justify-content: space-between; }
  .cover-footer strong { color: var(--azul); }

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
  <h4 class="mini">¿No tiene cuenta? Registrar una empresa nueva</h4>
  <p>Bajo el formulario de acceso está ${b('Regístrate')} («¿No tienes cuenta? Regístrate»). El registro crea a la vez una empresa nueva y su primera cuenta:</p>
  ${pasos([
    `En «Tu empresa» escriba el ${b('RNC o cédula')} y pulse ${b('Buscar DGII')}: la ${b('Razón social')} se completa sola desde el padrón de la DGII (si no aparece, escríbala a mano). La ${b('Actividad económica (opcional)')} puede quedar en blanco.`,
    `En «Tu cuenta» escriba su ${b('Nombre completo')}, ${b('Correo electrónico')}, ${b('Contraseña')} y ${b('Confirmar contraseña')}, y pulse ${b('Crear empresa y cuenta')}.`,
    `Al terminar: «Tu empresa y tu cuenta están creadas. Ya puedes iniciar sesión.»`,
  ])}
  ${nota('Si el RNC ya tiene una empresa en ContFast, el registro se rechaza: «Ya hay una empresa registrada con ese RNC o cédula. Si trabajas en ella, pide a su administrador que te cree un usuario.» El registro nunca da acceso a una empresa que ya existe.')}

  <h4 class="mini">¿Olvidó su contraseña?</h4>
  <p>En la pantalla de acceso pulse ${b('¿Olvidó su contraseña?')}, escriba el correo de su cuenta y pulse ${b('Enviarme el enlace')}. La respuesta es siempre la misma, exista o no la cuenta.</p>
  <ul>
    <li><strong>Administración</strong> recibe un correo «Restablecer su contraseña» con un enlace. El enlace vale <strong>60 minutos</strong> y sirve una sola vez; pedir otro anula el anterior. Abra el enlace, escriba la ${b('Contraseña nueva')} dos veces (mínimo 6 caracteres) y pulse ${b('Guardar contraseña')}. Todas las sesiones que tenía abiertas se cierran.</li>
    <li><strong>El resto de usuarios</strong> no reciben correo: la contraseña se la cambia un administrador desde ${ruta('Sistema', 'Administracion')} › ${b('Usuarios')}. Al cambiarla, se cierran las sesiones de ese usuario.</li>
  </ul>

  <h3 class="subsection-title">La barra de arriba</h3>
  <div class="grid-2">
    <div class="feature-card"><h4>La empresa</h4><p>El nombre (y el logo) de la empresa en la que trabaja. Confírmelo antes de emitir: cada empresa tiene sus propios datos.</p></div>
    <div class="feature-card"><h4>El punto de entorno</h4><p>Un punto junto a la campana. <strong>Verde = Producción</strong>: lo que emita tiene validez fiscal. <strong>Ámbar = Pruebas</strong>: las operaciones son fiscalmente nulas. Pase el ratón por encima para leerlo. El modo no lo cambia el usuario: si hace falta, consulte con el administrador del sistema. La barra de arriba se ve igual en los dos modos: el punto es el que dice en cuál está.</p></div>
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
    ['<strong>Administración</strong>', 'Opera toda la empresa: ventas, compras, pagos, caja (ve el saldo esperado), contabilidad, configuración, usuarios. Aplica descuentos y escribe la tasa del dólar.'],
    ['<strong>Facturación</strong>', 'Trabaja en Facturación: no entra al panel de inicio ni a la Central e-CF.'],
    ['<strong>Otros roles</strong>', 'Lo que su rol permita módulo por módulo. Quien no es administración cuenta la caja «a ciegas» y no aplica descuentos.'],
  ])}
  <p>La configuración técnica de la plataforma (el modo Pruebas/Producción, la conexión con la facturación electrónica, la corrección de secuencias ya registradas y el alta de empresas) no la hace el usuario: para cualquier cambio de ese tipo, consulte con el administrador del sistema.</p>
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
    ['Padrón de RNC', 'El padrón de la DGII cargado en el sistema tiene 30 días o más.', 'Se actualiza el padrón (consulte con el administrador del sistema).'],
    ['El plan vence / venció', 'Desde 5 días antes de vencer, y al quedar sin plan.', 'Se renueva el plan.'],
    ['e-CF del mes', 'Al 80 % y al 100 % del límite del plan.', 'Empieza otro mes o se amplía el plan.'],
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
  <p><strong>Gestión de Clientes</strong>: RNC (opcional para consumidor final), nombre, contacto, límite de crédito y el ${b('Tipo de Precio')} que se le aplica por defecto. Cada opción dice su margen sobre la venta: «Precio 1 (Base, margen 25 % sobre la venta)», «Precio 2 (Consumidor Final, margen 20 % sobre la venta)», «Precio 3 (Mayorista, margen 15 % sobre la venta)» y «Precio 4 (Proveedor, margen 10 % sobre la venta)». Botón ${b('Registrar Cliente')} (al editar, ${b('Guardar Cambios')}). En la lista, ${b('Ver Historial')} abre la ficha del cliente con lo facturado, el balance y lo pagado, y las pestañas ${b('Facturas e-CF')} e ${b('Historial de Pagos')}.</p>

  <h3 class="subsection-title">Suplidores</h3>
  <p><strong>Gestión de Suplidores</strong>: RNC o cédula (opcional) con ${b('Buscar DGII')}, nombre o razón social, correo, teléfono y dirección. Botón ${b('Registrar Suplidor')}.</p>
`);

seccion('inventario', 'Inventario: productos, precios y existencias', `
  <p class="intro-lead">El grupo ${b('Inventario')} del menú reúne el catálogo, los precios, los códigos de barra, los almacenes y todo lo que mueve existencia.</p>

  <h3 class="subsection-title">Cómo se registra en todo el sistema: pestañas «Registrar»</h3>
  <p>Las pantallas que dan de alta registros (productos, almacenes, categorías, conduces, clientes, suplidores, retenciones, cuentas bancarias, empleados, novedades de nómina y pedidos a suplidor) trabajan igual: arriba a la derecha hay dos pestañas, la lista (por ejemplo ${b('Catálogo')}) y ${b('Registrar')}. El formulario ocupa la página entera; al editar un registro la segunda pestaña pasa a decir ${b('Editando')}. Los botones de la lista (imprimir, buscar, etc.) están en la barra de la propia lista, nunca junto a las pestañas.</p>

  <h3 class="subsection-title">Productos — ${ruta('Inventario', 'Productos')}</h3>
  <p>La pantalla se llama <strong>Catálogo de Productos</strong>. Arriba hay tres tarjetas:</p>
  <ul>
    <li><strong>Total en Catálogo:</strong> cuántos productos hay.</li>
    <li><strong>Valor de Inventario (a costo promedio):</strong> todo el catálogo —no solo la página que se ve—, la existencia de cada almacén multiplicada por su costo promedio, que es el costo con el que la contabilidad registra las entradas y las salidas. No es un precio de venta. Una existencia sin costo promedio cuenta como 0, y la tarjeta lo dice («7 existencias sin costo promedio cuentan como 0»).</li>
    <li><strong>Stock Bajo:</strong> cuántos productos tienen algún almacén en su mínimo o por debajo; es la misma regla que las Sugerencias de Reorden. Solo cuentan los productos con un mínimo puesto. Si la cifra no se pudo calcular, las tarjetas muestran «—».</li>
  </ul>
  <p>En la lista se busca por código, nombre o código de barras y se filtra por categoría. Por fila: ${b('Ver Inventario')} (existencia por almacén, con sus mínimos y máximos), ${b('Editar')} e ${b('Imprimir Etiquetas')}. En la barra de la lista: ${b('Precios en dólares')}, ${b('Gestión de Códigos')} e ${b('Imprimir')}, que ofrece ${b('Imprimir Normal')}, ${b('Imprimir con Stock')} e ${b('Imprimir Etiquetas')}.</p>
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
    `<strong>La tasa del día.</strong> Arriba se ve la ${b('Tasa vigente')} (y cuántos días lleva sin tocarse). Escriba la tasa de hoy y pulse ${b('Guardar y aplicar precios')}: se guarda la tasa y se actualizan en el acto el costo y los precios de todos los productos que siguen al dólar. Solo Administración escribe la tasa; los demás ven «La tasa la escribe administración.»`,
    `<strong>Atar productos.</strong> En «Añadir productos que se compran en dólares» busque por nombre o código y marque uno o varios (también ${b('Marcar los N')}); lo marcado se conserva entre búsquedas. Escriba el ${b('Costo en US$')} y pulse ${b('Añadir')} (con varios, ${b('Añadir N productos')}): todos reciben el mismo costo. Atar no cambia ningún precio todavía.`,
    `<strong>La tabla</strong> (15 productos por página) muestra el costo y el precio en US$ — editables con el lápiz —, el costo y los cuatro precios en pesos, y la variación. El <em>precio en US$</em> es opcional: si lo tiene, el precio base pasa a ser <em>precio US$ × tasa</em>; los demás precios conservan su margen sobre el costo.`,
    `${b('Aplicar precios')} sirve para lo que cambia sin tocar la tasa (el costo o el precio en dólares de un producto): pide confirmación y aplica a los marcados.`,
  ])}
  ${nota('Ninguna factura ni cotización ya hecha cambia. El costo que se actualiza es el de catálogo (el de reposición); el costo promedio con el que se asienta el costo de venta solo lo mueven las compras. El icono «Dejar de seguir al dólar» suelta un producto y le deja sus precios tal como estén.')}

  <h3 class="subsection-title">Códigos de barra — ${ruta('Inventario', 'Códigos de Barra')}</h3>
  <p>Pantalla <strong>Gestión Unificada de Códigos</strong>: totales con y sin código, filtros ${b('Todos')}, ${b('Con Código')} y ${b('Sin Código')}. ${b('Autogenerar Faltantes')} asigna códigos a todos los productos que no tienen (pide confirmación). Por fila, ${b('Editar o Generar Código')}. ${b('Imprimir Etiquetas')} abre la ventana de etiquetas: modo de selección (producto único, seleccionados, por categoría o todo el catálogo), tamaño (30×20, 50×25, 50×30, 60×40 mm o personalizado), cantidad por producto, campos visibles (marca, nombre, precio, SKU, código, QR), formato del código y vista previa; ${b('Mandar a Imprimir')} abre el PDF.</p>

  <h3 class="subsection-title">Almacenes y categorías</h3>
  <p><strong>Gestión de Almacenes</strong> (pestañas ${b('Almacenes')} / ${b('Registrar')}): código, nombre, dirección y estado. Un almacén se ${b('Deshabilitar')} / ${b('Habilitar')}. Crear uno nuevo exige un plan vigente y no pasar de su límite de almacenes. <strong>Categorías</strong> (pestañas ${b('Categorías')} / ${b('Registrar')}): nombre, descripción y estado.</p>

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
    `<strong>Los artículos:</strong> ${b('Agregar Fila')}, elija el producto y el nivel de precio (Base, Consumidor, Mayorista o Proveedor); el precio también se puede escribir. ${b('Desc. Unit.')} es un descuento en pesos <em>por unidad</em> (solo Administración). ITBIS 18 %, 16 %, Exento o Tasa 0 % de exportación. Si un producto no tiene existencia, se avisa pero se puede emitir: lo que no se podrá es aprobar el conduce hasta que entre mercancía.`,
    `<strong>Revisar y emitir:</strong> el resumen con un enlace «editar» por apartado, las notas de la factura y los totales. Pulse ${b('Emitir e Imprimir')} y confirme. La flecha del botón ofrece ${b('Solo Guardar')} (emite sin imprimir).`,
  ])}
  ${nota('<strong>El plan.</strong> Emitir exige un plan vigente, y en PRODUCCIÓN, no haber llegado al límite de e-CF del mes. Si no, la factura no sale y la pantalla dice por qué; el borrador sí se puede guardar (sección «Planes, prueba gratis y límites»).')}
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
    <li>El filtro por tipo nombra cada comprobante como la DGII, por ejemplo «e-46 Exportaciones» y «e-47 Pagos al Exterior»; al registrar una secuencia, «E46 — Comprobante Electrónico para Exportaciones» y «E47 — Comprobante Electrónico para Pagos al Exterior».</li>
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
  <p>${b('Cola DGII')} muestra los envíos en curso, con ${b('Actualizar')} y ${b('Reintentar todos')}. En ${b('Secuencias SACF')} se registran las autorizaciones de numeración de la DGII con ${b('Nueva Autorización')} y se activan o desactivan. Para corregir una secuencia ya registrada, consulte con el administrador del sistema. Al llegar al 90 % de una secuencia, se avisa para pedir una nueva.</p>
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
  <p>Las ventas y cobros en efectivo, los pagos a suplidores en efectivo y las compras en efectivo se anotan solos en la sesión. Para otros movimientos, ${b('Entrada de Efectivo')} o ${b('Salida de Efectivo')}, con monto y concepto. La tabla «Movimientos de Caja» lista todo; el icono «Exportar» descarga un <strong>CSV</strong> (fecha y hora, tipo, concepto, referencia y monto con signo) que abre en Excel; el total neto en caja solo va en el fichero de quien puede ver el saldo.</p>
  <p><strong>Arqueo a ciegas:</strong> solo Administración ve el «Balance Actual» de la caja. El resto ve «Se ve al cerrar la caja»: quien cuenta el dinero no sabe cuánto debería haber.</p>

  <h3 class="subsection-title">Arqueo y cierre</h3>
  ${pasos([
    `Pestaña ${b('Arqueo y Cierre')}. En «Desglose de Efectivo (DOP)» anote cuántos billetes hay de 2,000, 1,000, 500, 200, 100 y 50, y cuántas monedas de 25, 10, 5 y 1. El sistema suma el «Total Contado»; no hay un campo de total para escribir a mano.`,
    `Añada observaciones si las hay y pulse ${b('Finalizar Turno e Imprimir Arqueo')}.`,
    `La ventana «Cierre Exitoso» muestra entonces el «Esperado en sistema», lo «Contado» y la «Diferencia», y los cobros por transferencia o cheque del turno con su constancia (número de transferencia o cheque): constan en el arqueo pero no entran en el conteo de efectivo.`,
  ])}
  <p>Si hay diferencia, el cierre <strong>se registra igual</strong> y queda pendiente de aprobación: «Hay diferencia: el cierre queda registrado y pendiente de aprobación de un supervisor.» El panel de inicio avisa del faltante o sobrante hasta que un supervisor, en ${b('Histórico de Cierres')}, pulsa ${b('Dar por revisada la diferencia')}. El cierre no hace ningún asiento por la diferencia: a qué cuenta va un faltante lo decide el contador.</p>

  <h3 class="subsection-title">Histórico de Cierres</h3>
  <p>Cada cierre con su apertura, terminal, esperado, real y diferencia, y las acciones ${b('Ver Detalle')}, ${b('Reimprimir')} y ${b('Dar por revisada la diferencia')}. Se filtra por fecha y estado, y ${b('EXPORTAR CSV')} descarga la lista en un fichero CSV, que Excel abre.</p>
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
    <li>${ruta('Finanzas', 'Cuentas por Cobrar')} y ${ruta('Finanzas', 'Cuentas por Pagar')}: la lista de saldos de clientes y de suplidores; el botón ${b('CSV')} la descarga en un fichero que Excel abre.</li>
    <li>${ruta('Finanzas', 'Antigüedad de Saldos')}: lo que deben los clientes y lo que se debe a los suplidores, repartido por días de atraso (ver más abajo).</li>
    <li>${ruta('Finanzas', 'E.C. Clientes (CxC)')} y ${ruta('Finanzas', 'E.C. Suplidores (CxP)')}: el auxiliar completo, imprimible entero, solo pendientes o solo vencidos.</li>
  </ul>
  ${nota(`Una factura <strong>rechazada por la DGII</strong> deja de contar como deuda del cliente en todas las pantallas de cobros (Cuentas por Cobrar, reportes, estados de cuenta, Antigüedad de Saldos y el panel financiero). Si se corrige y la DGII la acepta, vuelve a contar sola. Para retirarla del todo, también de la contabilidad, se da de baja desde la Central e-CF (${b('Dar de baja')}).`)}

  <h3 class="subsection-title">Antigüedad de Saldos — ${ruta('Finanzas', 'Antigüedad de Saldos')}</h3>
  <p>Una pantalla para <strong>consultar</strong>: los cobros y los pagos se registran en sus pantallas (el botón ${b('Ir a Cuentas por Cobrar')} o ${b('Ir a Cuentas por Pagar')} lleva a ellas). Tiene dos pestañas, ${b('Clientes (por cobrar)')} y ${b('Suplidores (por pagar)')}; cada persona ve solo la que le corresponde: la de clientes, quien lleva los cobros; la de suplidores, quien lleva los suplidores. Arriba, ${b('Actualizar')} y ${b('Exportar CSV')}, que descarga la lista (Excel la abre) con el riesgo, los días de atraso, el saldo y sus cinco tramos.</p>
  <h4 class="mini">Qué cuenta como deuda</h4>
  <ul>
    <li><strong>Clientes:</strong> solo las facturas <strong>aceptadas</strong> por la DGII o <strong>enviadas</strong> (esperando respuesta). No cuentan las rechazadas, las dadas de baja ni los borradores. El saldo de cada factura es lo que queda por cobrar: el total (menos las retenciones que hace el cliente), menos lo cobrado y menos sus notas de crédito.</li>
    <li><strong>Suplidores:</strong> el saldo de cada compra a crédito. Una compra eliminada no cuenta. Los <strong>cheques en garantía</strong> pendientes no rebajan lo que se debe hasta que el banco los cobra. Solo salen quienes tienen saldo pendiente.</li>
  </ul>
  <h4 class="mini">El vencimiento y los días de atraso</h4>
  <p>Cada factura vence en la <strong>fecha límite de pago pactada</strong> en ella (la que sale impresa y se declara a la DGII); si no la tiene, en la de su cuenta por cobrar, a un mes de la emisión. Los días de atraso se cuentan desde ese vencimiento, no desde la emisión, y con el día de <strong>República Dominicana</strong>. <strong>Lo que vence hoy todavía no está vencido</strong>: se atrasa a partir de mañana. Por eso quien debe mucho sin haber llegado a su vencimiento sale como riesgo bajo, y es correcto (lo recuerda el aviso azul de la pantalla).</p>
  <h4 class="mini">Lo que se ve, de arriba abajo</h4>
  <ul>
    <li><strong>Tarjetas:</strong> «Cartera por Cobrar» (o «Cuentas por Pagar»), el total; «Total clientes» y cuántos están al día; <strong>«Cartera en Riesgo»</strong>, la suma de las facturas con <strong>1 día de atraso o más</strong> (entre paréntesis, cuántos clientes no están al día); y «Facturación Prom.» (variación del último mes).</li>
    <li><strong>«Saldo por antigüedad»:</strong> el saldo repartido en «Por vencer», «1 a 30 días», «31 a 60 días», «61 a 90 días» y «Más de 90 días» de atraso, cada uno con su porcentaje, y el «Total». Son los mismos tramos de Cuentas por Cobrar y por Pagar, así que las cifras se pueden comparar.</li>
    <li><strong>«Distribución de Riesgo»</strong> (la dona) y la leyenda <strong>«Niveles de Riesgo»</strong>: cuántos clientes hay en cada nivel, con su porcentaje y su saldo. Pulsar un nivel filtra la tabla; ${b('Restablecer')} o ${b('Ver todos')} quita el filtro.</li>
    <li><strong>«Balance Operativo»:</strong> dos cifras, «Por vencer» (facturas que aún no vencen) y «Acción inmediata» (facturas con 1 día de atraso o más). Entre las dos suman el total.</li>
  </ul>
  ${tabla(['Nivel', 'Días de atraso', 'Color'], [
    ['Bajo Riesgo — «Al día / Solvente»', 'Ninguno: todo dentro de su plazo', 'Verde'],
    ['Riesgo Medio — «Atraso ≤ 15 días»', '1 a 15', 'Ámbar'],
    ['Alto Riesgo — «Atraso de 16 a 45 días»', '16 a 45', 'Naranja (el texto del atraso, en rojo)'],
    ['Crítico — «Atraso de más de 45 días»', 'Más de 45', 'Rojo'],
  ])}
  <p><strong>Dos formas de sumar, a propósito.</strong> La dona y la leyenda clasifican <strong>clientes</strong>: el nivel de un cliente lo marca su factura <strong>más atrasada</strong> que siga con saldo, y su saldo entero va a ese nivel. «Cartera en Riesgo» y el «Balance Operativo» suman <strong>factura por factura</strong>: un cliente con una factura de 10 días de atraso y otras cuatro por vencer está en Riesgo Medio, pero en «Acción inmediata» solo cuenta esa factura.</p>
  <h4 class="mini">La tabla y el estado de cuenta</h4>
  <ul>
    <li>Una fila por cliente o suplidor: nombre y cuántas facturas tiene sin saldar, RNC/cédula, teléfono, correo, la facturación de los últimos meses, el «Saldo Pendiente» y su icono de riesgo con los días de atraso. Bajo el saldo, la línea <strong>«Vencido»</strong> dice cuánto está vencido. El atraso sale en <strong>ámbar de 1 a 15 días</strong> y en <strong>rojo desde 16 días</strong>. Se busca por nombre, RNC/cédula, teléfono o correo, y se ordena pulsando «Nombre», «Saldo Pendiente» o «Riesgo».</li>
    <li>${b('Ver')} abre el estado de cuenta: el «Saldo pendiente» (sin color de alarma: deber no es estar atrasado), el cupo si lo tiene, y los «Documentos sin saldar» con fecha, vencimiento, monto, saldo y atraso. ${b('Imprimir estado')} o el icono de la impresora sacan el estado de cuenta en PDF.</li>
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
    <li><strong>Asiento manual:</strong> ${b('Nuevo Asiento')}, líneas con cuenta, débito o crédito (nunca los dos en la misma línea). ${b('Contabilizar')} solo se activa cuando el asiento está «Cuadrado»; si no, dice qué falta. Sin un plan vigente, el asiento manual no se registra.</li>
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
  <p class="intro-lead">El grupo ${b('Recursos Humanos')} calcula la nómina con las retenciones de ley (TSS e ISR), la aprueba con su asiento contable y la paga desde un banco o desde la caja.</p>
  ${tabla(['Pantalla', 'Para qué'], [
    ['Dashboard RRHH', 'Empleados, costo mensual de nómina, aportes TSS del patrono, ISR retenido, vacaciones disponibles.'],
    ['Empleados', `Pestañas lista / ${b('Registrar')}: datos personales y laborales (contrato, frecuencia de pago, estado).`],
    ['Departamentos', 'Departamentos y cargos, cada lista con su botón Agregar.'],
    ['Nominas', 'El ciclo de la nómina: generar, calcular, aprobar y pagar (ver abajo).'],
    ['Horas Extras y Adicionales', 'Pestañas Horas Extras, Ingresos Adicionales y Deducciones; lo que se registra es del tipo de la pestaña elegida.'],
    ['Vacaciones', 'Días generados, tomados y disponibles por empleado, según la escala del Art. 177 del Código de Trabajo.'],
    ['Liquidacion y Prestaciones', 'Preaviso, cesantía y vacaciones no tomadas, y el Salario de Navidad (doble sueldo), con impresión.'],
    ['Configuracion de Ley', 'Porcentajes de la TSS y de las horas extras, el salario mínimo de los topes de la TSS y la escala del ISR vigente (esta última, solo para consultar).'],
  ])}

  <h3 class="subsection-title">El ciclo de una nómina — ${ruta('Recursos Humanos', 'Nominas')}</h3>
  <p>La pantalla <strong>Procesamiento de Nóminas</strong> lista las nóminas con su período, fecha de pago y estado. Por fila, el icono ${b('Ver Volantes')} abre el detalle y el icono ${b('Eliminar')} borra una nómina que aún no se ha aprobado. Una nómina pasa por estos estados:</p>
  ${tabla(['Estado', 'Qué se puede hacer'], [
    ['<strong>Calculada</strong>', `Revisar los volantes, ${b('Recalcular Todo')}, ${b('Aprobar Nómina')} o eliminarla.`],
    ['<strong>Aprobada</strong>', `Sus importes quedan fijos y su asiento de devengo, registrado. Se puede ${b('Pagar nómina')}.`],
    ['<strong>Pagada</strong>', 'Muestra su pago y el asiento del pago, y ya no admite cambios.'],
  ])}

  <h4 class="mini">1. Generar y calcular</h4>
  ${pasos([
    `Pulse ${b('Generar Nómina')}. En la ventana «Generar Nómina de Período» elija la ${b('Frecuencia de la Nómina')} (Mensual, Quincenal o Semanal) y escriba la ${b('Fecha de Inicio del Período')}, la ${b('Fecha de Fin del Período')} y la ${b('Fecha Estimada de Pago')}.`,
    `Pulse ${b('Generar y Calcular')}: «Nómina creada y calculada correctamente.» Se abre el detalle con un volante por empleado activo de esa frecuencia: salario base, horas extras, bonos y comisiones, AFP, SFS, ISR, otras deducciones y neto.`,
    `Si algo cambió después (un empleado, una novedad del período), pulse ${b('Recalcular Todo')}. Solo se recalcula una nómina en borrador o calculada: una aprobada ya tiene sus importes fijos.`,
  ])}
  <p>${b('Imprimir Todos los Volantes')} saca los volantes de pago de todos los empleados.</p>

  <h4 class="mini">2. Aprobar: el asiento de devengo</h4>
  <p>${b('Aprobar Nómina')} solo aparece en una nómina <strong>calculada y con detalle</strong>. Pide confirmación («¿Está seguro de aprobar esta nómina? Esto bloqueará los montos y procesará todos los adicionales y descuentos del período.») y, al aceptar: «Nómina aprobada y asentada en el libro diario.»</p>
  <p>Al aprobar, el sistema registra <strong>un asiento contable</strong> por la nómina entera, con la fecha del <strong>fin del período</strong> y los importes ya calculados en los volantes:</p>
  ${tabla(['Debe (gasto de la empresa)', 'Haber (lo que se queda debiendo)'], [
    ['Sueldos y Salarios — el bruto de los empleados', 'Sueldos por Pagar — el neto que se pagará a los empleados'],
    ['Aportes Patronales TSS (AFP, SFS, SRL) — lo que aporta la empresa', 'TSS por Pagar (AFP, SFS, SRL) — lo retenido al empleado más lo que aporta la empresa'],
    ['Aporte Infotep — lo que paga la empresa (1 % por defecto)', 'ISR Retenido a Asalariados (IR-3) — el ISR retenido'],
    ['', 'Infotep por Pagar'],
    ['', 'Otras deducciones de nómina — las demás deducciones de los empleados'],
  ])}
  <p>Las cuentas son las que la empresa tiene enlazadas en ${ruta('Sistema', 'Configuración')} › ${b('Cuentas Puente')}, bloque «Nómina». Una línea sin importe (por ejemplo, un ISR de 0) no sale en el asiento. Tras aprobar, el detalle de la nómina muestra el asiento —fecha, descripción, cada cuenta con su debe y su haber, y el total— con el enlace ${b('Ver en el Libro Diario')}.</p>

  <h4 class="mini">3. Pagar</h4>
  <p>En una nómina aprobada aparece ${b('Pagar nómina')}. Se paga <strong>el neto de todos los empleados, de una vez</strong>:</p>
  ${pasos([
    `En «De dónde sale el dinero» elija ${b('Transferencia')}, ${b('Cheque')} o ${b('Efectivo (caja)')}.`,
    `Con transferencia o cheque, elija la ${b('Cuenta bancaria')} y escriba la ${b('Referencia de la transferencia')} o el ${b('Número del cheque')}. Es obligatorio: sin él, el retiro no se encuentra en el estado de cuenta al conciliar. Con efectivo, el dinero sale de la <strong>sesión de caja abierta</strong>.`,
    `Revise la ${b('Fecha del pago')} (viene la de hoy y no puede ser futura) y pulse ${b('Pagar RD$ …')}: «Nómina pagada: el asiento y el movimiento quedaron registrados.»`,
  ])}
  <p>El pago registra su propio asiento, con la fecha del pago: <strong>debe Sueldos por Pagar / haber</strong> la cuenta contable del banco elegido o la Caja. Un pago por banco queda en el libro de ese banco como <strong>retiro pendiente de conciliar</strong>; uno en efectivo queda en la sesión de caja. La nómina pasa a pagada y su detalle muestra «Pagada el …», de dónde salió el dinero, el importe, quién lo registró y el asiento del pago.</p>
  ${nota('<strong>La TSS, el IR-3 y el Infotep no se pagan aquí.</strong> Se pagan desde ' + ruta('Finanzas', 'Cuentas Bancarias') + ' › ' + b('Registrar Movimiento') + ' (tipo «Egreso (Transferencia)» o «Egreso (Retiro)»), eligiendo como ' + b('Cuenta Contable (Contrapartida)') + ' la cuenta por pagar que corresponde: TSS por Pagar, ISR Retenido a Asalariados por Pagar o Infotep por Pagar.')}

  <h4 class="mini">Cuando el sistema se niega, y por qué</h4>
  <p>Calcular, recalcular, aprobar y pagar exigen además que la empresa tenga un <strong>plan vigente</strong> (sección «Planes, prueba gratis y límites»); eliminar una nómina no aprobada, no.</p>
  <p>Si algo impide un paso, la nómina <strong>no cambia</strong> y la pantalla dice el motivo: al generar o recalcular, en un aviso; al aprobar, además queda a la vista en el detalle; al pagar, dentro de la ventana de pago, que no se cierra.</p>
  ${tabla(['Situación', 'Lo que dice la pantalla', 'Qué hacer'], [
    ['No hay escala del ISR para el año de la nómina ni para uno anterior', '«Falta la escala del ISR de 2026: … Hay que cargar la escala vigente de la DGII antes de calcular.»', 'Consulte con el administrador del sistema.'],
    ['Falta enlazar una cuenta de nómina', '«No se puede aprobar la nómina: la empresa no tiene enlazada la cuenta de nómina "…", y sin ella no se puede registrar su asiento. Enlácela en Configuración &gt; Cuentas Puente (bloque Nómina)…»', 'Enlazarla en Cuentas Puente, bloque «Nómina». Si la cuenta no aparece, consulte con el administrador del sistema.'],
    ['El fin del período cae en un período contable cerrado o sin abrir', '«…en esa fecha no hay un período contable abierto, porque está cerrado o no se ha abierto todavía…»', 'Si no se ha abierto: ábralo en Contabilidad › Períodos Contables y vuelva a aprobar. Si está cerrado: <strong>la nómina no se aprueba en el sistema; el contador la asienta a mano</strong>.'],
    ['El día del pago cae en un período cerrado o sin abrir', '«No se puede pagar la nómina con fecha …: en esa fecha no hay un período contable abierto…»', 'Elegir la fecha real del pago, o abrir el período.'],
    ['La nómina ya está pagada', '«Esta nómina ya está pagada: no se paga dos veces.»', 'Nada: el pago ya consta en su detalle.'],
    ['Pago en efectivo sin caja abierta', '«No hay una caja abierta para registrar el efectivo. Abra caja primero…»', 'Abrir la caja en el Módulo de Caja, o pagar por banco.'],
    ['Aprobar una nómina sin empleados calculados', '«No se puede aprobar una nómina sin detalle…»', 'Recalcularla o eliminarla.'],
  ])}
  ${nota('Una nómina que se aprobó antes de que el sistema registrara este asiento lo dice en su detalle («Esta nómina se aprobó sin registrar asiento contable: su devengo lo asienta el contador a mano.») y no se puede pagar desde aquí: su devengo y su pago los asienta el contador.', 'warn')}

  <h3 class="subsection-title">La escala del ISR</h3>
  <p>El ISR de cada empleado se calcula sobre su sueldo menos AFP y SFS, llevado a un año. La escala vigente es la de <strong>2026</strong>, publicada por la DGII (Ley 11-92, art. 296, modificado por la Ley 30-26, art. 10):</p>
  ${tabla(['Renta neta anual', 'ISR'], [
    ['Hasta RD$ 416,220.00', 'Exento'],
    ['RD$ 416,220.01 a RD$ 624,329.00', '15 % del excedente de RD$ 416,220.01'],
    ['RD$ 624,329.01 a RD$ 867,123.00', 'RD$ 31,216.00 + 20 % del excedente de RD$ 624,329.01'],
    ['RD$ 867,123.01 en adelante', 'RD$ 79,776.00 + 25 % del excedente de RD$ 867,123.01'],
  ])}
  <p>La escala se consulta en ${ruta('Recursos Humanos', 'Configuracion de Ley')} («Escala de ISR Anual (DGII)»). Si el año de la nómina no tiene escala propia, se usa la más reciente anterior y la pantalla avisa: «ISR calculado con la escala de 2026: la de 2027 no está cargada en el sistema. Revísela cuando la DGII publique la de 2027.»</p>

  <h3 class="subsection-title">Topes y aportes de la TSS</h3>
  <ul>
    <li>En ${ruta('Recursos Humanos', 'Configuracion de Ley')} › «Topes de la TSS» está el ${b('Salario mínimo para los topes (RD$ mensual)')}, que viene en <strong>RD$ 10,000.00</strong>. Con él se calculan los topes de cotización: AFP hasta 20 salarios mínimos, SFS hasta 10 y riesgo laboral hasta 4. Si el campo aparece bloqueado, consulte con el administrador del sistema.</li>
    <li><strong>Las horas extras y los bonos no cotizan a la TSS</strong>: la AFP y el SFS se calculan sobre el salario.</li>
    <li>El 0,5 % de Infotep a cargo del empleado <strong>no se calcula</strong>; el aporte de la empresa, sí.</li>
    <li>Los porcentajes (AFP, SFS, riesgo laboral, Infotep) y los recargos de horas extras se cambian en la misma pantalla con ${b('Guardar Cambios')}; ${b('Restablecer')} vuelve a los valores de fábrica.</li>
  </ul>
`);

seccion('herramientas', 'Herramientas y soporte', `
  <ul>
    <li><strong>Desglose Ventanas</strong> (Optimizador & Desglose de Ventanas): sistemas TRAD, P-65 y P-92, de 2 a 4 vías (P-65 hasta 3); con el ancho y el alto en pulgadas calcula los cortes de perfiles y el vidrio. Se autoguarda.</li>
    <li><strong>Desglose Puertas Comerciales:</strong> agrega puertas al desglose de cortes.</li>
    <li><strong>Corte de Vidrio:</strong> con el tamaño de la lámina y los cortes requeridos, calcula cuántas planchas hacen falta y cómo acomodar las piezas.</li>
    <li><strong>QR Tienda Online:</strong> el código QR de la tienda en línea, con colores, logo y resolución; ${b('Descargar PNG/SVG')}, ${b('Copiar Enlace')} e ${b('Imprimir')}.</li>
  </ul>

  <h3 class="subsection-title">Soporte y Centro de Ayuda</h3>
  <p>Se abre desde el menú de su usuario (su nombre, arriba a la derecha) › ${b('Soporte')}. La pantalla tiene preguntas frecuentes y el formulario «Enviar Ticket de Soporte»:</p>
  ${pasos([
    `Elija la ${b('Categoría del Problema')} (Facturación e-CF, Módulo de Caja, Bancos y Cuentas o Configuración / Empresa), escriba el ${b('Asunto')} (una línea) y la ${b('Descripción del Problema')}.`,
    `Pulse ${b('Enviar Mensaje')}. El ticket sale por correo <strong>al correo de la empresa</strong>, el que está en ${ruta('Sistema', 'Configuración')} › ${b('Configuración Empresa')}, con un número del tipo <strong>SOP-XXXXXX</strong>, su nombre y su correo. La respuesta le llega a su correo.`,
    `Si salió: «Ticket SOP-… enviado», y debajo del formulario queda «Último ticket enviado: SOP-…». Lo escrito se borra solo cuando el ticket salió; si falla, la pantalla dice el motivo y conserva lo escrito para reintentar.`,
  ])}
  ${nota('Si la empresa no tiene un correo configurado, el ticket no sale y la pantalla lo dice: «Tu empresa no tiene un correo configurado en Configuración &gt; Empresa.»', 'warn')}
`);

seccion('configuracion', 'Configuración y administración', `
  <h3 class="subsection-title">Ajustes del Sistema — ${ruta('Sistema', 'Configuración')}</h3>
  <p>Pestañas: ${b('Mi Perfil')} (su foto y sus datos), ${b('Configuración Empresa')}, ${b('Tienda')}, ${b('Cuentas Puente')}, ${b('Plan & Suscripción')} y ${b('Tipos de Gastos')}. Todas menos Mi Perfil son de Administración.</p>
  <h4 class="mini">Configuración Empresa</h4>
  <ul>
    <li><strong>Identidad Fiscal:</strong> nombre comercial, RNC, dirección, teléfono, correo y logo (sale en facturas y reportes). Una vez guardados, el nombre y el RNC no se cambian desde aquí: consulte con el administrador del sistema. <strong>El correo de la empresa</strong> es también al que llegan los tickets de Soporte.</li>
    <li><strong>Avisos del sistema:</strong> el correo de destino de los avisos, o la casilla ${b('Usar el correo de la empresa')}. Vacío = sin avisos por correo.</li>
    <li><strong>Integración mSeller API:</strong> la conexión con la facturación electrónica. Aquí solo se consulta; para cualquier cambio, consulte con el administrador del sistema.</li>
    <li><strong>Parámetros Operativos:</strong> formato de impresión predeterminado (Carta, Ticket 80 mm o 58 mm) y copias, conduces automáticos, límites y códigos de barra (tipo, prefijo y longitud). Se ve también el ${b('Modo del sistema')} (Pruebas o Producción), que no cambia el usuario.</li>
  </ul>
  <p>Al terminar, ${b('Guardar Cambios')}.</p>
  <h4 class="mini">Cuentas Puente</h4>
  <p>Aquí el contador elige a qué cuenta del catálogo va cada asiento automático. Están agrupadas en seis bloques: <strong>Caja, bancos y tarjetas · Clientes y ventas · Inventario y costo · Compras y proveedores · Impuestos y retenciones · Nómina</strong>, cada uno con una línea que dice qué alimenta. El sistema no lleva códigos de cuenta fijos: si una cuenta no es la correcta, se corrige aquí. ${b('Guardar Cuentas Puente')}.</p>
  <p>El bloque <strong>Nómina</strong> («Sueldos, aportes a la TSS, Infotep y retenciones de ISR de los empleados: lo que la nómina asienta al aprobarse y paga después») tiene ocho cuentas: <em>Sueldos y Salarios</em>, <em>Aportes Patronales TSS (AFP, SFS, SRL)</em> y <em>Aporte Infotep</em> (gastos); <em>Sueldos por Pagar</em>, <em>TSS por Pagar (AFP, SFS, SRL)</em>, <em>ISR Retenido a Asalariados (IR-3)</em>, <em>Infotep por Pagar</em> y <em>Otras deducciones de nómina</em> (lo que se debe). Si falta enlazar alguna de las que el asiento necesita, la nómina no se puede aprobar.</p>
  <h4 class="mini">Tipos de Gastos</h4>
  <p>Los tipos del 606. Los códigos 01 a 10 son estándar de la DGII y solo se pueden desactivar; ${b('Crear Tipo de Gasto')} añade otros (código de 2 dígitos).</p>
  <h4 class="mini">Tienda y Plan</h4>
  <p>${b('Tienda')} configura la portada de la tienda en línea (sección «La tienda en línea»). ${b('Plan & Suscripción')} muestra el plan y su uso (sección siguiente).</p>

  <h3 class="subsection-title">Administración — ${ruta('Sistema', 'Administracion')}</h3>
  <p>Pantalla <strong>Gestión de Acceso y Planes</strong>. ${b('Usuarios')}: ${b('Nuevo Usuario')} (nombre, correo, contraseña inicial de 6 caracteres o más, rol). Al editar, el campo de contraseña en blanco no la cambia; si se cambia, <strong>se cierran todas las sesiones de ese usuario</strong>. Un usuario se puede suspender y volver a activar, dentro del límite del plan. ${b('Roles del Sistema')} muestra los roles y su descripción, y ${b('Mi Suscripción')}, la misma tarjeta del plan que la pestaña ${b('Plan & Suscripción')} de Configuración: estado, días que quedan y uso (ver «Planes, prueba gratis y límites»).</p>
`);

// LOTE 302: planes y prueba gratis (lotes 299 y 300). Comprobado en
// `services/suscripcion/planVigente.ts`, `periodoDePrueba.ts`, la pestaña
// `settings/components/PlanYSuscripcion.tsx` y las rutas que bloquean. Sin
// Administracion > Planes ni la asignacion de suscripciones: son del rol Sistemas.
seccion('planes', 'Planes, prueba gratis y límites', `
  <p class="intro-lead">Cada empresa trabaja con un <strong>plan</strong> que fija cuántos e-CF puede emitir al mes, cuántos usuarios activos puede tener y cuántos almacenes. Mientras el plan está vigente todo funciona con normalidad; sin plan vigente, lo que crea o emite se detiene, pero nada de lo registrado se pierde.</p>

  <h3 class="subsection-title">Dónde se ve — ${ruta('Sistema', 'Configuración')} › pestaña ${b('Plan & Suscripción')}</h3>
  <p>Solo Administración. La misma tarjeta «Plan y Suscripción» sale también en ${ruta('Sistema', 'Administracion')} › ${b('Mi Suscripción')}: las dos pantallas dicen lo mismo del plan. La tarjeta muestra:</p>
  <ul>
    <li><strong>Plan Contratado:</strong> el nombre del plan y, a su lado, una etiqueta con su estado.</li>
    <li><strong>e-CF de este mes:</strong> «N de M», y debajo el porcentaje («x % · emitidos en PRODUCCIÓN»). La cifra se pone en ámbar al llegar al 80 % y en rojo al llegar al límite. Si el plan no tiene límite, sale «N (ilimitado)».</li>
    <li><strong>Usuarios activos</strong> y <strong>Almacenes:</strong> los que tiene la empresa contra los que permite el plan («2 de 2»; «ilimitado» si no hay tope).</li>
    <li><strong>Vencimiento / Renovación:</strong> el último día del plan y cuántos quedan («Quedan 12 días», «Vence hoy», «Venció hace 3 días»).</li>
  </ul>
  <p>Debajo, «Planes Disponibles en ContFast» enseña los planes con su precio mensual y sus límites; el suyo lleva la marca «Plan Actual». <strong>Para contratar, cambiar o renovar un plan, consulte con el administrador del sistema</strong>: no se hace desde esta pantalla.</p>
  ${tabla(['Estado', 'Qué significa'], [
    ['<strong>Prueba</strong>', 'La prueba gratis, dentro de sus 30 días. Funciona igual que un plan activo, con los límites del plan de prueba.'],
    ['<strong>Activo</strong>', 'Un plan contratado, dentro de su período.'],
    ['<strong>Por empezar</strong>', 'Hay un plan, pero su período todavía no ha comenzado.'],
    ['<strong>Vencido</strong>', 'Pasó el último día del plan (o de la prueba) sin renovarse.'],
    ['<strong>Pago pendiente</strong>', 'El plan tiene un pago por regularizar.'],
    ['<strong>Cancelado</strong>', 'El plan se dio de baja.'],
    ['<strong>Sin plan</strong>', 'La empresa no tiene ningún plan («Esta empresa no tiene un plan.»).'],
  ])}
  <p>Solo <strong>Prueba</strong> y <strong>Activo</strong> son un plan vigente. Con cualquier otro estado, la pantalla lo advierte en rojo («El plan no está vigente. Mientras tanto no se pueden…») y se aplica el bloqueo descrito más abajo. Un plan vale hasta el final de su último día, en hora de República Dominicana.</p>

  <h3 class="subsection-title">La prueba gratis</h3>
  <ul>
    <li>Toda empresa nueva empieza con una <strong>prueba gratis de 30 días</strong>, contados desde el día en que se registra. No hay que pedirla ni activarla.</li>
    <li>Durante la prueba rigen los límites del plan de prueba, que hoy es el <strong>Plan Básico: 100 e-CF al mes, 2 usuarios activos y 1 almacén</strong>.</li>
    <li>Cinco días antes de terminar aparece el aviso de vencimiento (más abajo). <strong>Al terminar la prueba hace falta un plan</strong>; para contratarlo, consulte con el administrador del sistema.</li>
  </ul>

  <h3 class="subsection-title">El límite de e-CF del mes</h3>
  <ul>
    <li><strong>Cuentan</strong> solo los comprobantes emitidos en <strong>PRODUCCIÓN</strong> que salieron a la DGII, <strong>también los rechazados</strong>: el envío se hizo aunque la DGII no lo aceptara.</li>
    <li><strong>No cuentan</strong> los borradores ni nada de lo emitido en modo <strong>PRUEBA</strong>: practicar no consume el plan. Aun así, sin plan vigente tampoco se emite en PRUEBA.</li>
    <li>El mes es el <strong>mes calendario</strong> (del día 1 al último día), en hora de República Dominicana; el día 1 el contador vuelve a cero.</li>
    <li><strong>Corregir un rechazado no cuenta dos veces:</strong> reenviar un comprobante rechazado con su mismo e-NCF es el mismo comprobante, que ya se contó. Por eso un rechazo se puede corregir aunque el mes esté lleno.</li>
    <li><strong>Al 80 %</strong> el panel avisa («Ha usado el 80 % de sus e-CF de este mes (N de M)»). <strong>Al 100 %</strong> no se puede emitir más hasta el día 1 del mes siguiente o hasta ampliar el plan; los borradores se pueden seguir guardando.</li>
  </ul>
  <h4 class="mini">Usuarios y almacenes</h4>
  <p>Crear un usuario, o volver a activar uno suspendido, exige no pasar del límite de <strong>usuarios activos</strong> del plan: si está lleno, suspenda otro usuario o amplíe el plan. Crear un almacén exige no pasar del límite de <strong>almacenes</strong>, y aquí cuentan todos los almacenes de la empresa, también los deshabilitados.</p>

  <h3 class="subsection-title">El vencimiento</h3>
  <ul>
    <li><strong>Desde 5 días antes</strong> el panel de inicio avisa «El plan vence en N días» (el último día, «El plan vence hoy»), y el aviso llega también por correo con los demás avisos.</li>
    <li>Al vencer, o si la empresa no tiene un plan vigente, el aviso pasa a «El plan venció» o «No hay un plan vigente», como aviso grave.</li>
  </ul>
  ${tabla(['Sin plan vigente se bloquea…', '…y sigue funcionando'], [
    ['Emitir e-CF (también enviar un borrador o reenviar un rechazado)', 'Consultar cualquier pantalla, reporte o comprobante'],
    ['Calcular, recalcular, aprobar y pagar nóminas', 'Imprimir y descargar facturas y documentos'],
    ['Crear asientos manuales', 'Guardar borradores de factura'],
    ['Crear o volver a activar usuarios, y crear almacenes', 'El resto de la operación diaria'],
  ])}
  <p>Lo bloqueado vuelve a funcionar en cuanto la empresa tiene un plan vigente otra vez.</p>

  <div style="page-break-inside: avoid">
  <h3 class="subsection-title">Los mensajes que se ven</h3>
  <p>Cuando el plan impide una acción, la acción no se hace y la pantalla muestra el motivo. Los textos son estos («…» es el nombre del plan; N y M, las cifras del caso):</p>
  ${tabla(['Situación', 'Lo que dice la pantalla'], [
    ['Sin plan', '«La empresa no tiene un plan vigente. Mientras tanto no se pueden emitir e-CF, calcular, aprobar ni pagar nóminas, ni crear asientos manuales, usuarios o almacenes. Consultar, imprimir y guardar borradores sigue funcionando. Para activar un plan, consulte con el administrador del sistema.»'],
    ['Plan vencido', '«El … venció el dd-mm-aaaa. Mientras tanto no se pueden emitir e-CF, … Renueve el plan para continuar.» Si era la prueba: «La prueba gratis venció el dd-mm-aaaa. …»'],
    ['Pago pendiente o plan cancelado', '«El … tiene un pago pendiente. … Renueve el pago para continuar.» / «El … está cancelado. … Para activar un plan, consulte con el administrador del sistema.»'],
    ['Límite de e-CF', '«Llegó al límite de e-CF de su plan este mes (N de M). No se pueden emitir más hasta el 1 de &lt;mes&gt; o hasta ampliar el plan; los borradores se pueden seguir guardando.»'],
    ['Límite de usuarios', '«Su plan permite N usuario(s) activo(s) y ya tiene N. Desactive otro usuario o amplíe el plan.»'],
    ['Límite de almacenes', '«Su plan permite N almacén(es) y ya tiene N. Amplíe el plan para crear otro.»'],
  ])}
  </div>
  ${nota('Para contratar, renovar o ampliar el plan, consulte con el administrador del sistema.')}
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
    <li><strong>Ficha del producto:</strong> foto, precio, descripción, cantidad y ${b('Añadir a mi cotización')}. Debajo lo dice la propia ficha: «Tu cotización se guarda en este navegador para imprimirla o guardarla en PDF.» No se envía a la empresa.</li>
    <li><strong>Favoritos:</strong> el corazón guarda el producto en ese navegador (en otro dispositivo se empieza sin favoritos).</li>
  </ul>

  <h3 class="subsection-title">Mi cotización</h3>
  <p>Muestra cada producto con su precio de hoy (siempre el del catálogo, nunca uno guardado en el navegador), la cantidad y el importe; abajo «Subtotal», «ITBIS (18 %)» y «Total». Si un producto ya no se vende, se avisa con su nombre y no suma. ${b('Imprimir cotización')} abre la impresión del navegador (desde ahí también se guarda en PDF): el papel lleva el nombre, RNC, teléfono, correo y dirección de la empresa, la fecha y la nota «Esta cotización no es una factura ni un comprobante fiscal».</p>

  <h3 class="subsection-title">Configurar la portada — ${ruta('Sistema', 'Configuración')} › pestaña ${b('Tienda')}</h3>
  <p>Solo Administración. La tarjeta «Portada de la tienda» tiene un enlace ${b('Ver la tienda')} y cuatro campos; <strong>un campo vacío usa lo de siempre</strong>:</p>
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
    <div class="cover-logo"><img src="${LOGO_SVG}" alt="ContFast Enterprise"></div>
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
