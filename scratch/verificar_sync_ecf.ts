import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════ Emitir dejaba la factura en "enviado" para siempre ═══════════
// La DGII no acepta en el mismo momento del envio: mSeller recibe el documento y
// la DGII dicta despues, casi siempre en segundos. Que la emision deje la
// factura en 'submitted' es CORRECTO -- afirmar 'accepted' sin veredicto es lo
// que P0-06 vino a cerrar.
//
// Lo que faltaba era que alguien preguntara. El cron que lo hace
// (/api/v1/cron/sincronizar-ecf, con sincronizarPendientes) estaba escrito y
// NADIE lo llamaba: sin vercel.json y sin workflow, no corria nunca. Habia que
// sincronizar a mano, factura por factura.
//
// Aqui se cierra la mitad de cara al usuario: la pantalla pregunta sola unos
// segundos despues de emitir. La otra mitad es el cron
// (.github/workflows/sincronizar-ecf.yml) y CRON_SECRET, que son configuracion.

const s = crudo('src/app/dashboard/invoices/page.tsx');

ok(
  'invoices: solo consulta cuando la emision quedo pendiente',
  s.includes("      if (estadoEmitido === 'submitted') {\n        const ncfEmitido")
);
ok(
  'invoices: pregunta a la MISMA ruta que usa el boton de sincronizar',
  s.includes('await fetch(`/api/v1/ecf/${invoiceId}/dgii-status`)')
);
ok('invoices: espera unos segundos, sin bloquear al que factura', s.includes('}, 5000);'));
ok(
  'invoices: guarda el NCF antes de la espera (el formulario ya se reinicio)',
  s.includes('const ncfEmitido = data.data.ncf;')
);
ok(
  'invoices: avisa si la DGII acepto, y recarga el listado',
  s.includes("if (est.data?.status === 'accepted') {") &&
    s.includes("toast.success('La DGII aceptó el comprobante', {")
);
ok(
  'invoices: avisa si la DGII rechazo, con tiempo para leerlo',
  s.includes("else if (est.data?.status === 'rejected') {") &&
    s.includes("toast.error('La DGII rechazó el comprobante', {") &&
    s.includes('duration: 15000,')
);
//  4a57361 metio una tercera rama: quien pulso "emitir e imprimir" SI recibe un
//  aviso si sigue pendiente (espera un papel que no llega). La regla de fondo no
//  cambio -- sin pedir imprimir, un pendiente no dice nada -- pero el comentario
//  literal que buscaba esto cambio y quedo en rojo. Se fija la ESTRUCTURA: tres
//  avisos (aceptado, rechazado, imprimir pendiente) y ningun `else` a secas que
//  avise a todo pendiente. (Lote 116.)
const bloqueVeredicto = (() => {
  const i = s.indexOf("if (est.data?.status === 'accepted') {");
  const j = s.indexOf('} catch {', i);
  return i < 0 || j < 0 ? '' : s.slice(i, j);
})();
ok(
  "invoices: si sigue pendiente NO dice nada (no repetir el aviso de la emision)",
  /\} else if \(postAction === 'print'\) \{[\s\S]*?toast\.info\(/.test(bloqueVeredicto) &&
    !/\}\s*else\s*\{/.test(bloqueVeredicto) &&
    (bloqueVeredicto.match(/toast\.\w+\(/g) || []).length === 3
);
ok('invoices: un fallo de la consulta no molesta a quien ya termino', s.includes('no puede molestar a quien ya'));
ok(
  'invoices: recarga el listado en los dos veredictos',
  //  La recarga del rechazo ya no va seguida del comentario, sino de la rama de
  //  imprimir pendiente (4a57361). Se ancla en los dos avisos. (Lote 116.)
  /toast\.success\('La DGII aceptó el comprobante'[\s\S]*?\}\);\s*loadInvoices\(\);\s*\} else if \(est\.data\?\.status === 'rejected'\)/.test(bloqueVeredicto) &&
    /toast\.error\('La DGII rechazó el comprobante'[\s\S]*?\}\);\s*loadInvoices\(\);\s*\} else if \(postAction === 'print'\)/.test(bloqueVeredicto)
);
ok(
  "invoices: la nota explica por que 'submitted' al emitir es correcto",
  s.includes("'accepted' sin veredicto es justo lo que P0-06")
);
ok(
  'invoices: la nota remite al cron como red de seguridad',
  s.includes('.github/workflows/sincronizar-ecf.yml')
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
