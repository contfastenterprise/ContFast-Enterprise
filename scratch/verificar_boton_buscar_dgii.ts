/**
 * Lote 210 -- "Buscar DGII" es UN botón, y la ventana de suplidores se ve como la de
 * clientes.
 *
 * Reportado por el dueño el 2026-09-27: "los formularios de clientes y suplidores, los
 * colores de los botones son diferentes aunque ejecutan la misma función... principalmente
 * el de buscar en la DGII el RNC".
 *
 * MEDIDO: la misma acción estaba escrita a mano en TRES sitios, cada uno con su estilo:
 *   - clientes: dorado con texto BLANCO (se lee mal), h-8;
 *   - suplidores: AZUL MARINO y h-9 junto a un campo h-8 -- el mismo azul que el botón
 *     "Registrar Suplidor", así que el formulario tenía dos acciones principales;
 *   - facturas, alta rápida de cliente: ámbar (`variant="warning"`) y solo "DGII".
 * Y la cabecera de la ventana: azul oscuro en clientes, blanca en suplidores; el asterisco
 * de obligatorio dorado en uno y rojo en otro; el sello "Validado DGII" de otro tamaño.
 *
 * LA CURA: `components/ui/boton-buscar-dgii.tsx`, usado por los tres. Lo que se vigila
 * es la PROPIEDAD -- que ningún formulario vuelva a pintar el botón a mano, y que las dos
 * ventanas compartan las clases de la cabecera --, no la forma de cada línea.
 *
 * SE EJECUTA el componente (renderToStaticMarkup), porque lo que de verdad puede romperse
 * no se ve leyendo: el botón vive DENTRO de un <form>, y sin `type="button"` pulsarlo
 * ENVIARÍA el formulario -- registraría el cliente a medio escribir.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let contadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  contadas++;
  if (!c) fallos++;
};

const COMPONENTE = 'src/components/ui/boton-buscar-dgii.tsx';
const CLIENTES = 'src/app/dashboard/customers/page.tsx';
const SUPLIDORES = 'src/app/dashboard/suppliers/page.tsx';
const FACTURAS = 'src/app/dashboard/invoices/page.tsx';

/** Los tres formularios: su manejador, el estado de "buscando" y el campo del RNC. */
const FORMULARIOS = [
  { nombre: 'clientes', fichero: CLIENTES, manejador: 'handleSearchDGII', buscando: 'isSearchingRnc', campo: '!formData.rncCedula' },
  { nombre: 'suplidores', fichero: SUPLIDORES, manejador: 'handleSearchDGII', buscando: 'searchingDGII', campo: '!formData.rnc' },
  { nombre: 'facturas (alta rápida)', fichero: FACTURAS, manejador: 'handleNewCustomerSearchDGII', buscando: 'isSearchingRnc', campo: '!newCustomerData.rncCedula' },
] as const;

const ETIQUETAS_EJECUTADAS: readonly string[] = [
  'el botón es type="button": dentro de un <form> no lo envía',
  '  y dice "Buscar DGII"',
  '  habilitado cuando hay RNC y no se está buscando',
  '  deshabilitado sin RNC',
  '  deshabilitado MIENTRAS busca (no se lanza dos veces)',
  '  y mientras busca gira el icono',
  '  el texto se puede cambiar sin tocar el estilo',
];

function fallarLasQueQuedan(motivo: string): void {
  const hechas = contadas;
  for (const t of ETIQUETAS_EJECUTADAS.slice(hechas)) ok(t, false, motivo);
}

/** Cada elemento JSX `<Nombre ... />` o `<Nombre ...>` completo, hasta su cierre de apertura. */
function elementos(src: string, nombre: string): string[] {
  const res: string[] = [];
  const re = new RegExp(`<${nombre}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + 1;
    let prof = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') prof++;
      else if (c === '}') prof--;
      else if (c === '>' && prof === 0) break;
    }
    res.push(src.slice(m.index, i + 1));
  }
  return res;
}

/** El `className` de la primera etiqueta que cumple el patrón, cerca del ancla. */
function claseTras(src: string, ancla: RegExp, etiqueta: RegExp): string | null {
  const m = ancla.exec(src);
  if (!m) return null;
  const antes = src.slice(Math.max(0, m.index - 1200), m.index);
  const etiquetas = [...antes.matchAll(etiqueta)];
  const ultima = etiquetas[etiquetas.length - 1];
  return ultima ? ultima[1] : null;
}

async function main() {
  //  PRECONDICIONES, ciertas en los DOS estados: los tres formularios existen y cada uno
  //  sigue consultando el padrón con su manejador. Si alguien retira uno, el banco no debe
  //  dar FALLA -- debe negarse a correr.
  for (const f of FORMULARIOS) {
    const src = leer(f.fichero);
    if (src === '') throw new Error(`Precondición: no está ${f.fichero}`);
    if (!/\/api\/v1\/dgii\/rnc\//.test(src)) throw new Error(`Precondición: ${f.nombre} ya no consulta el padrón`);
    if (!new RegExp(`const ${f.manejador}\\s*=`).test(src)) throw new Error(`Precondición: ${f.nombre} ya no tiene ${f.manejador}`);
  }
  console.log('  pre   los tres formularios existen y consultan el padrón');

  try {
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n1) El botón -- EJECUTADO\n');
    // ─────────────────────────────────────────────────────────────────────────
    const [React, { renderToStaticMarkup }, M] = await Promise.all([
      import('react'),
      import('react-dom/server'),
      import('../src/components/ui/boton-buscar-dgii'),
    ]);
    const pinta = (p: Record<string, unknown>) =>
      renderToStaticMarkup(React.createElement(M.BotonBuscarDgii, { onClick: () => {}, ...p } as never));

    const normal = pinta({ buscando: false, disabled: false });
    ok(ETIQUETAS_EJECUTADAS[0], /<button[^>]*\btype="button"/.test(normal), normal.slice(0, 120));
    ok(ETIQUETAS_EJECUTADAS[1], />\s*Buscar DGII\s*<\/button>/.test(normal));
    // El ATRIBUTO, no la palabra: la clase lleva `disabled:opacity-50` y casaría siempre.
    const deshabilitado = (h: string) => /<button[^>]*\sdisabled=""/.test(h);
    ok(ETIQUETAS_EJECUTADAS[2], /<button/.test(normal) && !deshabilitado(normal));
    ok(ETIQUETAS_EJECUTADAS[3], deshabilitado(pinta({ buscando: false, disabled: true })));
    const buscando = pinta({ buscando: true, disabled: false });
    ok(ETIQUETAS_EJECUTADAS[4], deshabilitado(buscando));
    ok(ETIQUETAS_EJECUTADAS[5], /animate-spin/.test(buscando) && !/animate-spin/.test(normal));
    const otro = pinta({ buscando: false, texto: 'Consultar' });
    const claseDe = (h: string) => /<button[^>]*class="([^"]*)"/.exec(h)?.[1] ?? '';
    ok(ETIQUETAS_EJECUTADAS[6], />\s*Consultar\s*<\/button>/.test(otro) && claseDe(otro) === claseDe(normal) && claseDe(normal) !== '');
  } catch (e) {
    fallarLasQueQuedan(`no se pudo ejecutar: ${(e as Error).message.split('\n')[0]}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El estilo del botón, uno solo\n');
  // ───────────────────────────────────────────────────────────────────────────
  const comp = sinComentarios(leer(COMPONENTE));
  const clase = /className="([^"]*)"/.exec(comp)?.[1] ?? '';
  ok('dorado de la casa, el de "Imprimir"', /\bbg-\[#C5A059\]/i.test(clase));
  ok('  con texto OSCURO (el blanco sobre dorado no se lee)', /\btext-slate-950\b/.test(clase) && !/\btext-white\b/.test(clase));
  ok('  y NO el azul marino del botón que guarda', clase !== '' && !/#003366|#002244/i.test(clase));
  ok('  a la altura del campo (h-8)', /(^|\s)h-8(\s|$)/.test(clase));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Los tres formularios lo usan, y ninguno lo pinta a mano\n');
  // ───────────────────────────────────────────────────────────────────────────
  for (const f of FORMULARIOS) {
    const src = sinComentarios(leer(f.fichero));
    const importa = /import\s*\{[^}]*\bBotonBuscarDgii\b[^}]*\}\s*from\s*'@\/components\/ui\/boton-buscar-dgii'/.test(src);
    const usos = elementos(src, 'BotonBuscarDgii');
    const suyo = usos.find((u) => new RegExp(`onClick=\\{${f.manejador}\\}`).test(u)) ?? '';
    ok(`${f.nombre}: importa el componente`, importa);
    ok(`  y lo usa con su manejador`, suyo !== '');
    ok(`  "buscando" es su estado de búsqueda`, new RegExp(`buscando=\\{${f.buscando}\\}`).test(suyo));
    ok(`  sin RNC queda deshabilitado`, suyo.includes(`disabled={${f.campo}}`));
    // Toda aparición del manejador en el JSX tiene que estar DENTRO del componente: si
    // queda un `<button onClick={manejador}` suelto, el botón vuelve a estar pintado a mano.
    const enJsx = (src.match(new RegExp(`onClick=\\{${f.manejador}\\}`, 'g')) ?? []).length;
    ok(`  y el manejador no se engancha a ningún otro botón`, enJsx === 1 && suyo !== '', `${enJsx} enganches`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) La ventana de suplidores se ve como la de clientes\n');
  // ───────────────────────────────────────────────────────────────────────────
  const cli = sinComentarios(leer(CLIENTES));
  const sup = sinComentarios(leer(SUPLIDORES));
  const ANCLA_CLI = /\{editId \? 'Editar Cliente' : 'Registrar Nuevo Cliente'\}/;
  const ANCLA_SUP = /\{editId \? 'Editar Suplidor' : 'Registrar Nuevo Suplidor'\}/;
  if (!ANCLA_CLI.test(cli) || !ANCLA_SUP.test(sup)) throw new Error('Precondición: no se encuentra el título de alguna ventana');

  //  LOTE 244: las dos ventanas dejaron de ser modales con la cabecera pintada a mano (azul oscura, su icono
  //  y su X): el formulario es la segunda pestana de la pagina y su caja es `PanelDeRegistro`. Lo que este
  //  banco vigilaba --que las dos se vean IGUAL-- lo garantiza ahora que las dos usen el mismo componente,
  //  y que ninguna conserve una cabecera propia.
  const panel = (src: string) => /<PanelDeRegistro titulo=\{editId \? '[^']+' : '[^']+'\}>/.test(src);
  ok('la caja del formulario es la misma en las dos: el componente compartido', panel(cli) && panel(sup));
  ok('  y ninguna conserva una cabecera pintada a mano', !/bg-\[#001733\]/.test(cli) && !/bg-\[#001733\]/.test(sup) && !/fixed inset-0/.test(cli) && !/fixed inset-0/.test(sup));

  const asterisco = (src: string) => /Nombre o Razón Social <span className="([^"]*)">\*<\/span>/.exec(src)?.[1] ?? null;
  ok('el asterisco de obligatorio, del mismo color', asterisco(cli) !== null && asterisco(cli) === asterisco(sup));

  const sello = (src: string) => /<span className="([^"]*)">\s*<ShieldCheck[^>]*\/>\s*Validado DGII/.exec(src)?.[1] ?? null;
  ok('el sello "Validado DGII", del mismo tamaño', sello(cli) !== null && sello(cli) === sello(sup), `${sello(sup)} / ${sello(cli)}`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} (${contadas} comprobaciones)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
