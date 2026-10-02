/**
 * Lote 246 -- tras emitir, la lista se actualiza sola cuando la DGII responde.
 * Reportado por el dueño (2026-10-02): "cuando emito una factura y vuelve al
 * historial, el estado de dicha factura no se actualiza; tengo que actualizar
 * la pagina para ver el estado correcto, ya que se queda en ENVIADO".
 *
 * La pantalla preguntaba UNA vez, a los 5 segundos. Medido en lotes anteriores:
 * a los 5 s solo ha resuelto el 15 % (lote 180, mediana 20 s); las e-32 tardan
 * 6-9 s y las e-31 entre 73 y 119 s (lote 219). El servidor si perseguia el
 * veredicto y lo guardaba; la pantalla no se enteraba.
 *
 * Ahora insiste con huecos que se alargan (`seguimientoDelVeredicto.ts`) hasta
 * que hay veredicto. Aqui se EJECUTA el seguimiento con un reloj y una ruta de
 * mentira.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco se quedo colgado y no llego al final'); process.exit(1); } });

const PAGINA = 'src/app/dashboard/invoices/page.tsx';

async function main() {
  const pagina = sinComentarios(leer(PAGINA));
  //  Vale en los dos estados: tras emitir en 'submitted' se pregunta a la ruta de estado.
  if (!/if \(estadoEmitido === 'submitted'\) \{\s*const ncfEmitido = data\.data\.ncf;/.test(pagina) || !/\/api\/v1\/ecf\/\$\{invoiceId\}\/dgii-status/.test(pagina)) {
    throw new Error('Precondicion: la pagina de facturas ya no consulta el estado tras emitir');
  }

  console.log('\n1) El seguimiento, ejecutado con un reloj de mentira\n');
  type M = typeof import('../src/services/invoice/seguimientoDelVeredicto');
  let S: M | null = null;
  try { S = await import('../src/services/invoice/seguimientoDelVeredicto'); } catch { S = null; }
  const E1 = ['insiste hasta que hay veredicto: la tercera consulta lo trae y ya no pregunta mas', 'un rechazo se devuelve con su motivo',
    'sin veredicto, se acaba la escalera y lo dice (no se queda preguntando para siempre)', 'una consulta que falla no corta el seguimiento',
    'si se sale de la pantalla deja de consultar', 'la escalera cubre lo medido: primera consulta a los 5 s, alcanza los 2 minutos de una e-31, y no pasa de 6 consultas'];
  if (!S) falta(E1, 'no existe services/invoice/seguimientoDelVeredicto.ts');
  else {
    const s = S;
    const corre = async (respuestas: Array<{ status?: string; message?: string } | null | 'LANZA'>, sigue?: () => boolean) => {
      const esperas: number[] = []; let n = 0;
      const fin = await s.seguirVeredicto({
        dormir: async (ms) => { esperas.push(ms); },
        sigue,
        consultar: async () => { const r = respuestas[Math.min(n, respuestas.length - 1)]; n++; if (r === 'LANZA') throw new Error('sin red'); return r; },
      });
      return { fin, esperas, consultas: n };
    };
    const a = await corre([{ status: 'submitted' }, { status: 'submitted' }, { status: 'accepted' }]);
    ok(E1[0], a.fin.veredicto === 'accepted' && a.consultas === 3 && a.esperas.join(',') === '5000,10000,20000', `${a.fin.veredicto} tras ${a.consultas} consultas, esperas ${a.esperas.join(',')}`);
    const r = await corre([{ status: 'rejected', message: 'Secuencia ya utilizada' }]);
    ok(E1[1], r.fin.veredicto === 'rejected' && 'mensaje' in r.fin && r.fin.mensaje === 'Secuencia ya utilizada' && r.consultas === 1);
    const nunca = await corre([{ status: 'submitted' }]);
    const total = nunca.esperas.reduce((x, y) => x + y, 0);
    ok(E1[2], nunca.fin.veredicto === null && nunca.consultas === s.ESPERAS_TRAS_EMITIR_MS.length && nunca.fin.consultas === nunca.consultas, `${nunca.consultas} consultas en ${total / 1000} s`);
    //  Envuelto: sin el `try` del seguimiento esto LANZA, y un banco que revienta no dice que fallo.
    try {
      const conFallo = await corre(['LANZA', null, { status: 'accepted' }]);
      ok(E1[3], conFallo.fin.veredicto === 'accepted' && conFallo.consultas === 3);
    } catch (e) { ok(E1[3], false, `lanzo: ${(e as Error).message}`); }
    let vivo = true; let hechas = 0;
    const ido = await s.seguirVeredicto({ dormir: async () => {}, sigue: () => vivo, consultar: async () => { hechas++; if (hechas === 2) vivo = false; return { status: 'submitted' }; } });
    ok(E1[4], ido.veredicto === null && hechas === 2, `${hechas} consultas`);
    const E = s.ESPERAS_TRAS_EMITIR_MS;
    ok(E1[5], E[0] === 5_000 && total >= 120_000 && total <= 300_000 && E.length <= 6 && E.every((x, i) => i === 0 || x >= E[i - 1]), `${E.map((x) => x / 1000).join(' + ')} = ${total / 1000} s`);
  }

  console.log('\n2) La pantalla\n');
  const i = pagina.indexOf("if (estadoEmitido === 'submitted') {\n        const ncfEmitido");
  const bloque = i < 0 ? '' : pagina.slice(i, pagina.indexOf('if (editingDraftId)', i));
  ok('tras emitir sigue el veredicto con el seguimiento, sin hacer esperar a quien factura',
    /void seguirVeredicto\(\{/.test(bloque) && /consultar: async \(\) => \{[\s\S]{0,260}\/api\/v1\/ecf\/\$\{invoiceId\}\/dgii-status/.test(bloque) && !/setTimeout\(/.test(bloque));
  ok('  deja de consultar al salir de la pantalla',
    /sigue: \(\) => montada\.current/.test(bloque) && /if \(!montada\.current\) return;/.test(bloque)
    && /const montada = useRef\(true\);\s*useEffect\(\(\) => \{ montada\.current = true; return \(\) => \{ montada\.current = false; \}; \}, \[\]\);/.test(pagina));
  ok('  y recarga la lista con los filtros de AHORA, no con los del momento de emitir',
    /const recargarLista = useRef\(loadInvoices\);\s*useEffect\(\(\) => \{ recargarLista\.current = loadInvoices; \}, \[loadInvoices\]\);/.test(pagina)
    && (bloque.match(/recargarLista\.current\(\);/g) ?? []).length === 2 && !/\bloadInvoices\(\)/.test(bloque));
  ok('el aviso de la emision ya no manda a "sincronizar"', /La lista se actualiza sola cuando responda\./.test(pagina) && !/Se actualiza al sincronizar/.test(pagina));

  console.log('\n3) Lo que no cambia\n');
  //  Cierto antes y despues: como `ok()` regalaria un OK en la contraprueba.
  invariante('la aceptacion sigue sin anunciarse y el rechazo si, con tiempo para leerlo (lotes 180 y 181)',
    !/toast\.success\('La DGII aceptó/.test(pagina) && /toast\.error\('La DGII rechazó el comprobante', \{[\s\S]{0,700}duration: 20000/.test(pagina));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
