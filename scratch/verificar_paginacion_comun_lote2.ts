/**
 * Banco del lote 129 (P3-45, segundo tramo): compras, gastos y los dos listados
 * de cheques en garantia paginan con el componente comun.
 *
 *     pnpm exec tsx scratch/verificar_paginacion_comun_lote2.ts
 *
 * Cuatro bloques identicos entre si y al tramo anterior: paginan en el
 * navegador, de 10 en 10, con "Mostrando a a b de N <cosas>" y sin botones
 * cuando hay una sola pagina. El componente ya sabe las dos cosas desde el lote
 * 128 (`itemLabel`, `hideControlsWhenSinglePage`), asi que aqui solo se
 * sustituye la barra escrita a mano.
 *
 * DOS PAGINADORES POR PANTALLA, Y CADA UNO CON LO SUYO: en compras conviven
 * compras y gastos; en cheques, pendientes y aplicados. Cada `ok` mira su
 * pareja de estado/lista, para que cambiar uno por el otro no pase.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const COMPRAS = 'src/app/dashboard/purchases/page.tsx';
const CHEQUES = 'src/app/dashboard/purchases/components/GuaranteeChecksView.tsx';

const BLOQUES = [
  { f: COMPRAS, pagina: 'purchasesPage', set: 'setPurchasesPage', total: 'totalPurchasesPages', lista: 'filteredPurchases', etiqueta: 'compras' },
  { f: COMPRAS, pagina: 'expensesPage', set: 'setExpensesPage', total: 'totalExpensesPages', lista: 'filteredExpenses', etiqueta: 'gastos' },
  { f: CHEQUES, pagina: 'pendingPage', set: 'setPendingPage', total: 'totalPendingPages', lista: 'pendingChecks', etiqueta: 'cheques pendientes' },
  { f: CHEQUES, pagina: 'appliedPage', set: 'setAppliedPage', total: 'totalAppliedPages', lista: 'appliedChecks', etiqueta: 'cheques aplicados' },
] as const;

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(codigo(COMPRAS).includes('const itemsPerPage = 10;'), 'compras ya no pagina de 10 en 10');
exige(codigo(CHEQUES).includes('const itemsPerPage = 10;'), 'cheques ya no pagina de 10 en 10');
for (const b of BLOQUES) {
  const src = codigo(b.f);
  exige(new RegExp(`const ${b.total} = Math\\.ceil\\(${b.lista}\\.length / itemsPerPage\\);`).test(src),
        `${b.f}: ${b.total} ya no se calcula sobre ${b.lista}`);
  exige(new RegExp(`const \\[${b.pagina}, ${b.set}\\] = useState\\(1\\);`).test(src),
        `${b.f}: ${b.pagina} ya no es un estado de esta pantalla`);
}
//  El componente trae del lote 128 lo que estas pantallas necesitan.
{
  const p = codigo('src/components/ui/pagination.tsx');
  exige(p.includes('itemLabel = "registros"') && p.includes('hideControlsWhenSinglePage = false'),
        'el componente ya no trae las opciones del lote 128 con su valor por defecto');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LOS CUATRO BLOQUES, CADA UNO CON LO SUYO');
// ─────────────────────────────────────────────────────────────────────────
for (const b of BLOQUES) {
  const src = codigo(b.f);
  ok(`${b.etiqueta}: usa el componente con su pagina, su lista y su nombre`,
     new RegExp(`<Pagination\\s+currentPage=\\{${b.pagina}\\}\\s+totalPages=\\{${b.total}\\}\\s+totalItems=\\{${b.lista}\\.length\\}\\s+pageSize=\\{itemsPerPage\\}\\s+onPageChange=\\{${b.set}\\}\\s+itemLabel="${b.etiqueta}"\\s+hideControlsWhenSinglePage`).test(src));
  ok(`${b.etiqueta}: sin la barra escrita a mano`,
     !new RegExp(`Pág\\. \\{${b.pagina}\\} de \\{${b.total}\\}`).test(src));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LAS DOS PANTALLAS LO IMPORTAN, Y NO QUEDA NADA SUELTO');
// ─────────────────────────────────────────────────────────────────────────
for (const f of [COMPRAS, CHEQUES]) {
  const src = codigo(f);
  ok(`${f.split('/').slice(-2).join('/')}: importa el componente`,
     src.includes("import { Pagination } from '@/components/ui/pagination';"));
  ok(`${f.split('/').slice(-2).join('/')}: sin botones de paginacion propios`,
     src.includes('<Pagination') && !/Pág\. \{/.test(src));
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
