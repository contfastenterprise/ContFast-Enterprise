/**
 * Banco del lote 104: fuera el codigo al que no llega nadie.
 *
 *     pnpm exec tsx scratch/verificar_codigo_muerto_fuera.ts
 *
 * QUE SE RETIRA
 * -------------
 * Cuatro ficheros, 1.515 lineas, CERO importadores:
 *
 *   components/ui/dashboard-sidebar.tsx ................. 425
 *   components/ui/app-sidebar.tsx ....................... 702
 *   .../accounts-payable/components/DashboardTab.tsx .... 181
 *   .../accounts-receivable/components/DashboardTab.tsx . 207
 *
 * De las tres barras laterales que habia, la unica viva es
 * `new-app-sidebar.tsx`, que es la que monta `ClientLayout`. Las otras dos son
 * versiones anteriores que se quedaron.
 *
 * CUIDADO CON EL PREFIJO
 * ----------------------
 * Buscar `app-sidebar` a secas encuentra tambien `new-app-sidebar`, que es el
 * que VIVE. Es la misma trampa que ya mordio cuatro veces en esta auditoria
 * (`documentServiceX`, `MS_ENVIO_X`, un tapon de `empezarAPerseguir`, un import
 * que faltaba). Aqui se busca la ruta de importacion completa, con sus
 * comillas, que es lo unico que no se puede confundir.
 *
 * POR QUE CADA COMPROBACION MIRA DOS COSAS
 * ----------------------------------------
 * "Nadie lo importa" es cierto ANTES del lote -- es justamente el motivo de
 * borrarlo -- asi que como comprobacion suelta daria un OK gratis en la
 * contraprueba sin distinguir nada. Cada una exige las dos: que el fichero ya
 * no este Y que nadie lo nombre.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

/** Todos los fuentes de src/, sin comentarios. */
const FUENTES: { ruta: string; texto: string }[] = [];
(function andar(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) andar(p);
    else if (/\.tsx?$/.test(p)) FUENTES.push({ ruta: p, texto: sinComentarios(fs.readFileSync(p, 'utf8')) });
  }
})('src');

function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}

const VIVO = 'src/components/ui/new-app-sidebar.tsx';
const LAYOUT = 'src/app/dashboard/ClientLayout.tsx';

/** Los cuatro muertos, con la ruta EXACTA con que se importarian. */
const MUERTOS: Array<{ fichero: string; especificadores: string[] }> = [
  { fichero: 'src/components/ui/dashboard-sidebar.tsx',
    especificadores: ["'@/components/ui/dashboard-sidebar'", "'./dashboard-sidebar'", '"@/components/ui/dashboard-sidebar"'] },
  { fichero: 'src/components/ui/app-sidebar.tsx',
    especificadores: ["'@/components/ui/app-sidebar'", "'./app-sidebar'", '"@/components/ui/app-sidebar"'] },
  { fichero: 'src/app/dashboard/financial/accounts-payable/components/DashboardTab.tsx',
    especificadores: ["'./components/DashboardTab'", "'./DashboardTab'"] },
  { fichero: 'src/app/dashboard/financial/accounts-receivable/components/DashboardTab.tsx',
    especificadores: ["'./components/DashboardTab'", "'./DashboardTab'"] },
];

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: lo de aqui se cumple antes y despues.
// ─────────────────────────────────────────────────────────────────────────
exige(FUENTES.length > 400, `solo se han leido ${FUENTES.length} fuentes; revisa desde donde se corre`);

//  La barra lateral que SI vive, y quien la monta. Si esto cambiara, el
//  razonamiento de cual sobra cambia con ello.
exige(fs.existsSync(VIVO), 'new-app-sidebar.tsx es la barra lateral VIVA y no esta');
exige(codigo(LAYOUT).includes("from '@/components/ui/new-app-sidebar'"),
      'ClientLayout ya no monta new-app-sidebar: revisar cual es la barra viva');

//  El menu se arma desde los permisos, no desde un componente. Por eso quitar
//  dos componentes de barra lateral no puede cambiar lo que ve nadie.
exige(codigo('src/utils/rbacHelpers.ts').includes('buildSidebar'),
      'buildSidebar ya no vive en rbacHelpers: el menu se arma en otro sitio');

//  Los hermanos que SI se usan, en las dos carpetas. Borrar `DashboardTab` no
//  puede llevarselos por delante.
for (const lado of ['accounts-payable', 'accounts-receivable']) {
  for (const hermano of ['KanbanTab', 'ListTab']) {
    const f = `src/app/dashboard/financial/${lado}/components/${hermano}.tsx`;
    exige(fs.existsSync(f), `${f} se usa y ha desaparecido`);
    exige(FUENTES.some((x) => x.ruta !== f && x.texto.includes(`/${hermano}'`)),
          `${hermano} de ${lado} se ha quedado sin importadores`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LOS CUATRO MUERTOS: FUERA Y SIN RASTRO');
// ─────────────────────────────────────────────────────────────────────────
for (const m of MUERTOS) {
  const nombre = m.fichero.replace('src/', '');
  const quedan = FUENTES.filter(
    (f) => f.ruta !== m.fichero && m.especificadores.some((e) => f.texto.includes(e))
  );
  //  Las DOS cosas. "Nadie lo importa" ya era cierto antes de borrarlo -- es el
  //  motivo de borrarlo -- asi que sola no distingue nada.
  ok(`fuera ${nombre}${quedan.length ? ` (lo importa ${quedan[0].ruta})` : ''}`,
     !fs.existsSync(m.fichero) && quedan.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. NO SE LLEVO POR DELANTE LO QUE VIVE');
// ─────────────────────────────────────────────────────────────────────────
//  El prefijo: `app-sidebar` esta DENTRO de `new-app-sidebar`. Un borrado hecho
//  con un patron y no con la ruta exacta se habria llevado la barra buena.
//  Que la barra viva siga ahi, y que los paneles sigan montando sus pestañas,
//  son PRECONDICIONES arriba: se cumplen antes y despues del lote, asi que como
//  `ok()` daban un OK gratis en la contraprueba. Lo que si distingue es lo de
//  abajo: cuantas barras quedan, y cuantos ficheros hay en cada carpeta.
ok('en src/ solo queda UNA barra lateral',
   FUENTES.filter((f) => /\/(new-app-sidebar|app-sidebar|dashboard-sidebar)\.tsx$/.test(f.ruta)).length === 1);

ok('y cada carpeta de financial baja de cuatro ficheros a tres',
   ['accounts-payable', 'accounts-receivable'].every((lado) =>
     fs.readdirSync(`src/app/dashboard/financial/${lado}/components`).length === 3));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
