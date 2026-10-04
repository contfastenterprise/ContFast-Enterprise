/**
 * Lote 252 -- las advertencias de React Doctor de las pantallas pasadas a pestanas en los lotes
 * 248-250 (Retenciones, Bancos, Empleados, Horas extra, Empresas y Pedidos a suplidor).
 *
 * Medido con React Doctor en local (`--scope files --base cf45aa6`): 195 avisos; despues, 6 --
 * los seis "componente gigante", que solo se van partiendo cada pagina (como conduces, caja y
 * configuracion: lotes 226, 229 y 238) y quedan para sus propios lotes.
 *
 * Lo que este banco fija es la PROPIEDAD de cada arreglo, no la forma:
 *  · ninguna respuesta se lee sin mirar el estado (todo pasa por `leerRespuesta`);
 *  · cada etiqueta tiene su campo (htmlFor con su id EN el mismo fichero);
 *  · las cargas son funciones estables y los efectos dependen de ellas;
 *  · `m` con `LazyMotion`, y no `motion`;
 *  · nada se muta dentro de un actualizador de estado, y ninguna lista usa el indice como clave.
 * Y un defecto real que salio al leer Pedidos: "Cancelar pedido" mandaba DELETE a `/send` (405):
 * nunca funciono. Eso lo ejecuta `verificar_cancelar_pedido_db.ts`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const D = 'src/app/dashboard/';
const PANTALLAS = {
  retenciones: `${D}retentions/page.tsx`,
  bancos: `${D}bank/page.tsx`,
  empleados: `${D}hr/employees/page.tsx`,
  novedades: `${D}hr/overtime/page.tsx`,
  empresas: `${D}admin/companies/page.tsx`,
  pedidos: `${D}purchases/orders/page.tsx`,
};

/** Las etiquetas sin `htmlFor`, y las que apuntan a un id que no esta en el fichero. */
function etiquetasMal(src: string): string[] {
  const mal: string[] = [];
  for (const m of src.matchAll(/<label\b([^>]*)>/g)) {
    const para = /htmlFor=(?:"([^"]+)"|\{`([^`]+)`\})/.exec(m[1]);
    if (!para) { mal.push(m[0].slice(0, 60)); continue; }
    if (para[1] && !new RegExp(`\\bid="${para[1]}"`).test(src)) mal.push(`${para[1]} sin su campo`);
  }
  return mal;
}

function main() {
  const s = Object.fromEntries(Object.entries(PANTALLAS).map(([k, p]) => [k, sinComentarios(leer(p))])) as Record<keyof typeof PANTALLAS, string>;
  //  Vale en los dos estados: las seis pantallas existen y son las de los lotes 248-250.
  for (const [k, v] of Object.entries(s)) if (!/<PestanasDeRegistro\b/.test(v)) throw new Error(`Precondicion: ${k} no es la pantalla en pestanas de los lotes 248-250`);

  console.log('\n1) Ninguna respuesta se lee sin mirar el estado\n');
  for (const [k, v] of Object.entries(s)) {
    const crudas = (v.match(/\.json\(\)/g) ?? []).length;
    ok(`${k}: todo pasa por leerRespuesta`, crudas === 0 && /import \{ leerRespuesta \} from '@\/utils\/leerRespuesta';/.test(v), `${crudas} lecturas sueltas`);
  }

  console.log('\n2) Cada etiqueta con su campo\n');
  //  Retenciones no entra: sus tres etiquetas ya se enlazaron en el lote 248, y como ok() regalaria
  //  un OK en la contraprueba.
  for (const [k, v] of Object.entries(s).filter(([k]) => k !== 'retenciones')) {
    const mal = etiquetasMal(v);
    ok(`${k}: ${(v.match(/<label\b/g) ?? []).length} etiquetas, todas con su campo`, mal.length === 0, mal.slice(0, 3).join(' | '));
  }
  const bp = s.pedidos;
  ok('pedidos: cada campo de una linea dice de que producto es',
    ['Marca', 'Modelo', 'Cantidad', 'Observaciones'].every((q) => bp.includes(`aria-label={\`${q} de \${line.productName}\`}`))
    && bp.includes('aria-label={`Cantidad a recibir de ${rec.productName}`}'));
  ok('pedidos y empresas: los botones de icono dicen lo que hacen',
    ['Ver pedido', 'Imprimir pedido', 'Editar pedido'].every((e) => bp.includes(`aria-label="${e}"`))
    //  Lote 273: las dos ventanas (detalle y recepcion) dicen QUE cierran ("Cerrar el detalle del
    //  pedido"); se mira que cada cierre lleve su nombre, no la palabra exacta "Cerrar".
    && /setShowDetailModal\(false\)\} aria-label="Cerrar[^"]*"/.test(bp) && /setShowReceiveModal\(false\)\} aria-label="Cerrar[^"]*"/.test(bp)
    && /aria-label="Cerrar"/.test(s.empresas) && /aria-label="Buscar empresa por nombre o RNC"/.test(s.empresas));
  ok('bancos: la tarjeta de cada cuenta se elige con el teclado, y "Rango de Fechas" no es una etiqueta suelta',
    /role="button"\s+tabIndex=\{0\}[\s\S]{0,300}onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\)/.test(s.bancos)
    && /<p className="[^"]*">Rango de Fechas<\/p>/.test(s.bancos));

  console.log('\n3) Las cargas: funciones estables, y los efectos dependen de ellas\n');
  const cargas: [keyof typeof PANTALLAS, string, RegExp][] = [
    ['retenciones', 'fetchRetentions', /\}, \[hasAccess, fetchRetentions\]\);/],
    ['bancos', 'fetchAccounts', /\}, \[fetchAccounts, fetchChartOfAccounts\]\);/],
    ['bancos', 'fetchTransactions', /\}, \[selectedAccount, fetchTransactions\]\);/],
    ['empleados', 'fetchData', /\}, \[fetchData\]\);/],
    ['novedades', 'fetchData', /\}, \[fetchData\]\);/],
    ['empresas', 'fetchData', /\}, \[fetchData\]\);/],
    ['pedidos', 'fetchOrders', /\}, \[fetchOrders, fetchSuppliers, fetchWarehouses\]\);/],
  ];
  for (const [k, fn, efecto] of cargas) {
    ok(`${k}: ${fn} es estable y su efecto depende de ella`, new RegExp(`const ${fn} = useCallback\\(async`).test(s[k]) && efecto.test(s[k]));
  }

  console.log('\n4) Lo demas\n');
  ok('retenciones, bancos y pedidos animan con `m` dentro de LazyMotion',
    (['retenciones', 'bancos', 'pedidos'] as const).every((k) => !/\bmotion\./.test(s[k]) && /<LazyMotion features=\{domAnimation\}>/.test(s[k]) && /<m\.div/.test(s[k])));
  ok('retenciones: dos clics en "Si, eliminar" no mandan dos peticiones',
    /if \(!deleteTarget \|\| borrando\.current\) return;\s*borrando\.current = true;/.test(s.retenciones));
  ok('pedidos: las lineas se cambian sin mutar el objeto de antes',
    !/copy\[index\]\./.test(bp) && (bp.match(/conCampo\(prev, index, \{/g) ?? []).length === 5);
  ok('pedidos: ninguna lista usa el indice como clave', !/key=\{idx\}/.test(bp) && /key=\{line\.productId\}/.test(bp));
  ok('novedades: el formulario es un solo estado, y abrirlo lo llena de una vez',
    /useState<FormularioDeNovedad>\(\(\) => formularioVacio\(\)\)/.test(s.novedades) && /setForm\(formularioVacio\(/.test(s.novedades));
  ok('empresas: la entrada de la ventana no usa `duration-*` (es `transition-duration`)', !/animate-in[^"]*\bduration-\d/.test(s.empresas));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
