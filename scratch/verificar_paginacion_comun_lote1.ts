/**
 * Banco del lote 128 (P3-45, primer tramo): categorias, empleados y nominas
 * paginan con el componente comun.
 *
 *     pnpm exec tsx scratch/verificar_paginacion_comun_lote1.ts
 *
 * DE DONDE SALE
 * -------------
 * P3-45: la paginacion estaba reescrita a mano en 16 pantallas. Los defectos que
 * escondian registros ya se cerraron (lotes 109-111); lo que queda es cosmetico
 * y se hace de pocas en pocas. Estas tres primero porque son identicas entre si:
 * paginan en el navegador, de 15 en 15, con "Mostrando N de M <cosas>" y sin
 * botones cuando hay una sola pagina.
 *
 * LO QUE EL COMPONENTE NO SABIA HACER
 * -----------------------------------
 * `components/ui/pagination.tsx` decia siempre "registros" y pintaba los botones
 * siempre. Cambiarlas tal cual habria empeorado lo que se ve ("Mostrando 1 - 15
 * de 40 registros" en vez de "... categorias", y botones desactivados con una
 * sola pagina). Se le anaden dos opciones con el valor de SIEMPRE por defecto:
 *
 *   itemLabel                   (por defecto 'registros')
 *   hideControlsWhenSinglePage  (por defecto false)
 *
 * Clientes y suplidores, que ya lo usaban sin ellas, se ven igual. Se comprueba
 * PINTANDO el componente con renderToStaticMarkup, no leyendo el fuente.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean, d = ''): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const PANTALLAS = [
  { f: 'src/app/dashboard/inventory/categories/page.tsx', lista: 'categories', etiqueta: 'categorías' },
  { f: 'src/app/dashboard/hr/employees/page.tsx', lista: 'employeesList', etiqueta: 'empleados' },
  { f: 'src/app/dashboard/hr/payroll/page.tsx', lista: 'payrolls', etiqueta: 'nóminas' },
] as const;

async function main(): Promise<void> {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Pagination } = await import('../src/components/ui/pagination');
  const texto = (props: Record<string, unknown>) =>
    renderToStaticMarkup(React.createElement(Pagination as never, { onPageChange: () => {}, ...props }))
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // ───────────────────────────────────────────────────────────────────────
  //  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
  // ───────────────────────────────────────────────────────────────────────
  //  Quien ya lo usa sin las opciones nuevas se ve IGUAL.
  exige(texto({ currentPage: 2, totalPages: 3, totalItems: 40, pageSize: 15 }).includes('Mostrando 16 - 30 de 40 registros'),
        'el componente ya no dice "registros" por defecto');
  exige(texto({ currentPage: 1, totalPages: 1, totalItems: 5, pageSize: 15 }).includes('Anterior'),
        'el componente ya no pinta los botones por defecto con una sola pagina');
  for (const f of ['src/app/dashboard/customers/page.tsx', 'src/app/dashboard/suppliers/page.tsx']) {
    exige(codigo(f).includes("import { Pagination } from '@/components/ui/pagination';"), `${f} ya no usa el componente`);
  }
  for (const p of PANTALLAS) {
    exige(codigo(p.f).includes('const itemsPerPage = 15;'), `${p.f} ya no pagina de 15 en 15`);
    exige(codigo(p.f).includes(`${p.lista}.slice((page - 1) * itemsPerPage, page * itemsPerPage)`), `${p.f} ya no pagina en el navegador`);
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('A. EL COMPONENTE, PINTADO');
  // ───────────────────────────────────────────────────────────────────────
  ok('dice lo que lista, no "registros", cuando se le pide',
     texto({ currentPage: 1, totalPages: 3, totalItems: 40, pageSize: 15, itemLabel: 'categorías' })
       .includes('Mostrando 1 - 15 de 40 categorías'));
  ok('y con una sola pagina puede ocultar los botones, sin ocultar el conteo',
     (() => {
       const t = texto({ currentPage: 1, totalPages: 1, totalItems: 5, pageSize: 15, itemLabel: 'empleados', hideControlsWhenSinglePage: true });
       return !t.includes('Anterior') && t.includes('Mostrando 1 - 5 de 5 empleados');
     })());
  //  Atada a la opcion nueva: sin ella, "hay botones con 3 paginas" era cierto
  //  antes del lote y regalaba un OK.
  ok('pero con varias paginas los botones siguen aunque se pida ocultarlos',
     (() => {
       const t = texto({ currentPage: 2, totalPages: 3, totalItems: 40, pageSize: 15, itemLabel: 'nóminas', hideControlsWhenSinglePage: true });
       return t.includes('Anterior') && t.includes('de 40 nóminas');
     })());

  // ───────────────────────────────────────────────────────────────────────
  console.log('B. LAS TRES PANTALLAS LO USAN');
  // ───────────────────────────────────────────────────────────────────────
  for (const p of PANTALLAS) {
    const src = codigo(p.f);
    ok(`${p.f.split('/').slice(-2).join('/')}: importa el componente`,
       src.includes("import { Pagination } from '@/components/ui/pagination';"));
    ok(`${p.f.split('/').slice(-2).join('/')}: con su pagina, su tamano y su nombre`,
       new RegExp(`<Pagination\\s+currentPage=\\{page\\}\\s+totalPages=\\{totalPages\\}\\s+totalItems=\\{${p.lista}\\.length\\}\\s+pageSize=\\{itemsPerPage\\}\\s+onPageChange=\\{setPage\\}\\s+itemLabel="${p.etiqueta}"\\s+hideControlsWhenSinglePage`).test(src));
    ok(`${p.f.split('/').slice(-2).join('/')}: sin la barra escrita a mano`,
       src.includes('<Pagination') && !src.includes('Pág. {page} de {totalPages}'));
  }

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
