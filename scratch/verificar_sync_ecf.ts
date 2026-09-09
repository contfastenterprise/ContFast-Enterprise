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
ok(
  "invoices: si sigue pendiente NO dice nada (no repetir el aviso de la emision)",
  s.includes("Si sigue en 'submitted' no se dice nada")
);
ok('invoices: un fallo de la consulta no molesta a quien ya termino', s.includes('no puede molestar a quien ya'));
ok(
  'invoices: recarga el listado en los dos veredictos',
  s.includes("              loadInvoices();\n            } else if (est.data?.status === 'rejected') {") &&
    s.includes("              loadInvoices();\n            }\n            // Si sigue en 'submitted'")
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
