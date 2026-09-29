/**
 * Lote 227 -- las advertencias de React Doctor de la pantalla de conduces,
 * cerradas. Pedido del dueño tras partir la pagina (lote 226).
 *
 * Eran 36 en los ficheros de conduces (las mismas que tenia la pagina vieja).
 * Medido despues con React Doctor en local: 0. Las que cambian comportamiento:
 *
 *  · nueve lecturas `await res.json()` sin mirar `res.ok`: ahora todas pasan por
 *    `src/utils/leerRespuesta.ts`. Un 5xx con cuerpo HTML ya no se cuenta como
 *    "error de red" (la red funciono), y un 4xx no depende de que el servidor
 *    ponga `success: false`;
 *  · el doble clic en "Aplicar Despacho" lanzaba dos peticiones: guarda con
 *    `useRef` (con el estado, dos clics seguidos ven los dos `false`);
 *  · accesibilidad: cada etiqueta apunta a su campo y los campos sin etiqueta
 *    llevan `aria-label`; las facturas del buscador son <button> (teclado).
 *
 * El banco EJECUTA el lector con respuestas de verdad y DIBUJA el formulario y
 * el buscador para comprobar en el HTML que cada `for` tiene su `id`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };

const DIR = 'src/app/dashboard/delivery-notes';
const FICHEROS = (() => {
  const out: string[] = [];
  const barrer = (d: string) => {
    if (!existsSync(join(raiz, d))) return;
    for (const e of readdirSync(join(raiz, d))) {
      const r = `${d}/${e}`;
      if (statSync(join(raiz, r)).isDirectory()) barrer(r);
      else if (/\.(tsx?|ts)$/.test(e)) out.push(r);
    }
  };
  barrer(DIR);
  return out;
})();

async function main() {
  if (FICHEROS.length < 5) throw new Error('Precondicion: no esta la pantalla de conduces');

  console.log('\n1) El lector, ejecutado con respuestas de verdad\n');
  let L: { leerRespuesta?: (r: Response) => Promise<{ bien: boolean; cuerpo?: any; mensaje?: string; estado?: number }> } = {};
  try { L = await import('../src/utils/leerRespuesta'); } catch { L = {}; }
  const E1 = ['200 con success: se da por bueno y trae el cuerpo', '200 sin success: fallo, con su mensaje',
    '400: fallo, con el mensaje del servidor y su estado', '500 con HTML: fallo, SIN lanzar (antes: "error de red")',
    '500 que dijera success: sigue siendo fallo (manda el estado)', '200 que no es JSON: fallo, sin lanzar'];
  if (!L.leerRespuesta) falta(E1, 'no existe src/utils/leerRespuesta.ts');
  else {
    const R = (cuerpo: string, estado: number) => new Response(cuerpo, { status: estado, headers: { 'Content-Type': 'application/json' } });
    const lr = L.leerRespuesta;
    const a = await lr(R(JSON.stringify({ success: true, data: [1] }), 200));
    ok(E1[0], a.bien === true && a.cuerpo?.data?.[0] === 1);
    const b = await lr(R(JSON.stringify({ success: false, error: { message: 'no' } }), 200));
    ok(E1[1], b.bien === false && b.mensaje === 'no');
    const c = await lr(R(JSON.stringify({ success: false, error: { message: 'Conduce no encontrado.' } }), 404));
    ok(E1[2], c.bien === false && c.mensaje === 'Conduce no encontrado.' && c.estado === 404);
    let lanzo = false; let d: Awaited<ReturnType<typeof lr>> | null = null;
    try { d = await lr(new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 })); } catch { lanzo = true; }
    ok(E1[3], !lanzo && d?.bien === false && d?.estado === 502 && d?.mensaje === undefined);
    const e = await lr(R(JSON.stringify({ success: true }), 500));
    ok(E1[4], e.bien === false && e.estado === 500);
    let lanzo2 = false; let f: Awaited<ReturnType<typeof lr>> | null = null;
    try { f = await lr(new Response('ok', { status: 200 })); } catch { lanzo2 = true; }
    ok(E1[5], !lanzo2 && f?.bien === false);
  }

  console.log('\n2) Ninguna llamada lee la respuesta por su cuenta\n');
  const conJson = FICHEROS.filter((f) => /\.json\(\)/.test(sinComentarios(leer(f))));
  ok('ningun fichero de conduces hace .json() a mano', conJson.length === 0, conJson.join(', ') || `${FICHEROS.length} ficheros`);
  const usan = FICHEROS.filter((f) => /await leerRespuesta</.test(leer(f))).map((f) => f.split('/').pop());
  ok('  todos los que piden algo usan el lector',
    ['page.tsx', 'useFormularioConduce.ts', 'AplicarPorCodigo.tsx', 'VerConduce.tsx'].every((n) => usan.includes(n)), usan.join(', '));

  console.log('\n3) Accesibilidad, dibujada\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const fake = {
    submitting: false, deliveryDate: '2026-09-29', driverName: '', driverLicense: '', vehiclePlate: '', dispatcherName: '', notesText: '',
    showInvoiceSearch: true, invoiceSearchQuery: '', invoicesLoading: false,
    invoicesList: [{ id: 'f1', ncf: 'E310000000030', buyerName: 'Cliente', total: 100 }],
    targetInvoice: { id: 'f1', ncf: 'E310000000030', buyerName: 'Cliente' },
    dispatchLines: [
      { lineId: 'l1', productId: 'p', productName: 'Puerta', invoicedQty: 2, previouslyDelivered: 0, pendingQty: 2, quantity: 2 },
      { lineId: 'l2', productId: 'p', productName: 'Puerta', invoicedQty: 1, previouslyDelivered: 0, pendingQty: 1, quantity: 1 },
    ],
  } as Record<string, unknown>;
  for (const k of ['setDeliveryDate', 'setDriverName', 'setDriverLicense', 'setVehiclePlate', 'setDispatcherName', 'setNotesText',
    'setShowInvoiceSearch', 'setInvoiceSearchQuery', 'descartarFactura', 'cambiarCantidad', 'handleSearchInvoices', 'abrirBuscador',
    'handleSelectInvoice', 'handleSubmit']) fake[k] = () => {};
  let htmlForm = ''; let htmlBusc = '';
  try {
    const { FormularioDeConduce } = await import('../src/app/dashboard/delivery-notes/components/FormularioDeConduce');
    htmlForm = renderToStaticMarkup(React.createElement(FormularioDeConduce as never, { formulario: fake, onSalir: () => {} }));
    const { BuscadorDeFacturas } = await import('../src/app/dashboard/delivery-notes/components/BuscadorDeFacturas');
    const { LazyMotion, domAnimation } = await import('framer-motion');
    htmlBusc = renderToStaticMarkup(React.createElement(LazyMotion, { features: domAnimation },
      React.createElement(BuscadorDeFacturas as never, { formulario: fake })));
  } catch (e) { ok('se pueden dibujar el formulario y el buscador', false, (e as Error).message); }

  const fors = [...htmlForm.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]);
  const labelsSinFor = [...htmlForm.matchAll(/<label(?![^>]*for=)[^>]*>/g)].length;
  ok('cada etiqueta del formulario apunta a un campo QUE EXISTE',
    fors.length === 6 && labelsSinFor === 0 && fors.every((id) => new RegExp(`id="${id}"`).test(htmlForm)),
    `${fors.length} etiquetas con for, ${labelsSinFor} sin: ${fors.join(', ')}`);
  const campos = [...htmlForm.matchAll(/<(input|textarea)\b[^>]*>/g)].map((m) => m[0]);
  ok('  y todo campo tiene etiqueta o aria-label', campos.length > 0 && campos.every((c) => /\bid="/.test(c) || /aria-label="/.test(c)),
    `${campos.length} campos`);
  ok('  cada cantidad dice de que producto es', /aria-label="Despachar hoy: Puerta"/.test(htmlForm));
  //  El elemento de CADA FACTURA (el de `cursor-pointer group`), no "un boton y
  //  luego el NCF": el de cerrar tambien es un boton y va antes, y con eso un
  //  mutante que devolvia las facturas a <div> sobrevivia (mera presencia).
  const filaFactura = /<(\w+)(?:\s[^>]*)?\sclass="[^"]*cursor-pointer group"/.exec(htmlBusc);
  ok('las facturas del buscador son botones, y el cerrar dice que cierra',
    filaFactura?.[1] === 'button' && /aria-label="Cerrar"/.test(htmlBusc)
    && /aria-label="Buscar facturas por NCF, cliente o RNC"/.test(htmlBusc));

  console.log('\n4) El resto de avisos\n');
  const hook = sinComentarios(leer(`${DIR}/hooks/useFormularioConduce.ts`));
  const apl = sinComentarios(leer(`${DIR}/components/AplicarPorCodigo.tsx`));
  const pag = sinComentarios(leer(`${DIR}/page.tsx`));
  const form = sinComentarios(leer(`${DIR}/components/FormularioDeConduce.tsx`));
  ok('el doble clic en "Aplicar Despacho" se guarda con una referencia',
    /const enCurso = useRef\(false\);/.test(apl) && /if \(enCurso\.current\) return;/.test(apl)
    && /enCurso\.current = true;/.test(apl) && /finally \{\s*enCurso\.current = false;/.test(apl));
  ok('las filas del despacho tienen clave propia (la factura puede repetir producto)',
    /key=\{line\.lineId\}/.test(form) && /lineId: l\.id,/.test(hook));
  ok('lo entregado se pide en paralelo, no en un bucle', /await Promise\.all\(approvedNotes\.map\(/.test(hook) && !/for \(const an of approvedNotes\)/.test(hook));
  ok('la fecha se inicializa perezosa, y las lineas en una sola pasada',
    /useState\(\(\) => new Date\(\)\.toISOString\(\)/.test(hook) && /dispatchLines\.flatMap\(/.test(hook));
  ok('las animaciones cargan solo lo que usan (LazyMotion + m)',
    /<LazyMotion features=\{domAnimation\}>/.test(pag) && FICHEROS.every((f) => !/\bmotion\./.test(sinComentarios(leer(f)))));
  ok('imprimir vive fuera del componente', /^function imprimirConduce\(/m.test(pag) && /onImprimir=\{imprimirConduce\}/.test(pag));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
