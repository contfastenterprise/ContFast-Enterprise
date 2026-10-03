/**
 * Lote 255 -- Bancos y Pedidos a suplidor, partidas sin cambiar lo que hacen. Es lo que dejo
 * pendiente el lote 252: React Doctor las marcaba "componente gigante" (mas de 300 lineas).
 *
 * Como se partieron (guion `scratch/_to_delete/partir.py`): el estado y las acciones pasan TAL
 * CUAL a un hook en el mismo fichero (`useBancos`, `usePedidos`), y del JSX se cortan
 * tramos a componentes que reciben el hook y sacan de el lo que usan. Ninguna linea de JSX se
 * reescribe: se mueve.
 *
 * Lo que se demuestra:
 *  · la HUELLA visible (clases, textos, ejemplos, titulos, avisos y direcciones de la API) es la
 *    misma que en `a72acdc` (main antes del lote), una por una y con repetidos -- invariante;
 *  · ningun componente del fichero pasa de 300 lineas;
 *  · la pagina usa su hook, y los componentes lo reciben (no hay una copia del estado).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { diferencia, enCommit, huella, piezas } from './huellaDePantalla';

const raiz = join(__dirname, '..');
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};

const ANTES = 'a72acdc';
const PANTALLAS = [
  { nombre: 'Bancos', ruta: 'src/app/dashboard/bank/page.tsx', pagina: 'BankAccountsPage', hook: 'useBancos',
    partes: ['CuentasYMovimientos', 'AltaDeCuenta', 'VentanaDeMovimiento'] },
  { nombre: 'Pedidos a suplidor', ruta: 'src/app/dashboard/purchases/orders/page.tsx', pagina: 'PurchaseOrdersPage', hook: 'usePedidos',
    partes: ['FiltrosDePedidos', 'TablaDePedidos', 'FormularioDePedido', 'VentanasDePedido'] },
];

for (const p of PANTALLAS) {
  console.log(`\n${p.nombre}\n`);
  const ahora = readFileSync(join(raiz, p.ruta), 'utf8').replace(/\r\n/g, '\n');
  const antes = enCommit(ANTES, p.ruta);
  const { faltan, sobran } = diferencia(huella(antes), huella(ahora));
  invariante(`lo visible es lo mismo que en ${ANTES} (${huella(antes).length} elementos, uno por uno)`,
    faltan.length === 0 && sobran.length === 0, `faltan ${JSON.stringify(faltan.slice(0, 3))} sobran ${JSON.stringify(sobran.slice(0, 3))}`);

  const ps = piezas(ahora).filter((x) => /^[A-Z]/.test(x.nombre));
  const grandes = ps.filter((x) => x.lineas > 300);
  ok(`ningun componente pasa de 300 lineas (${ps.map((x) => `${x.nombre} ${x.lineas}`).join(', ')})`, grandes.length === 0 && ps.length >= 1);
  ok(`  la pagina usa su hook (${p.hook}), que vive en el mismo fichero`,
    new RegExp(`export default function ${p.pagina}\\(\\) \\{\\n  const h = ${p.hook}\\(\\);`).test(ahora) && new RegExp(`\\nfunction ${p.hook}\\(\\) \\{`).test(ahora));
  //  Sin partes, "cada parte lo recibe" seria cierto de balde: entonces se mira que la pagina saque
  //  del hook lo que pinta.
  ok(`  y cada parte lo recibe (${p.partes.join(', ') || 'sin partes: la pagina saca del hook lo que pinta'})`,
    p.partes.length === 0 ? new RegExp(`const h = ${p.hook}\\(\\);\\n  const \\{[^}]+\\} = h;`).test(ahora) : p.partes.every((x) => new RegExp(`<${x} h=\\{h\\} />`).test(ahora) && new RegExp(`function ${x}\\(\\{ h \\}: \\{ h: Estado\\w+ \\}\\)`).test(ahora)));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
