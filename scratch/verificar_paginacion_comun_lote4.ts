/**
 * Banco del lote 131 (P3-45, cuarto tramo): notas de ajuste, conduces y la
 * tabla de ajuste rapido de inventario.
 *
 *     pnpm exec tsx scratch/verificar_paginacion_comun_lote4.ts
 *
 * LAS TRES PAGINAN EN EL SERVIDOR Y NO GUARDABAN EL TOTAL: enseñaban "Página 2
 * de 4" (notas y ajustes) o "Mostrando 15 conduces" -- cuantas caben en la
 * pantalla, que no es lo mismo que cuantas hay. Las tres APIs SI devuelven
 * `meta.total`, asi que ahora se guarda y el componente enseña el rango y el
 * total: "Mostrando 16 - 30 de 57 conduces".
 *
 * Y NINGUNA FILTRA EN EL NAVEGADOR lo que ya vino paginado -- eso se cerro en el
 * lote 109 para las notas --, asi que el rango no puede mentir. Es precondicion
 * abajo: si alguien vuelve a filtrar la pagina recibida, salta.
 *
 * Como en el tramo 3, el tamano de pagina sale a una constante que se usa en lo
 * que se pide y en lo que se enseña.
 */
import fs from 'fs';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const NOTAS = 'src/app/dashboard/adjustments/page.tsx';
const CONDUCES = 'src/app/dashboard/delivery-notes/page.tsx';
const AJUSTES = 'src/app/dashboard/inventory/adjustments/page.tsx';

const TRAMO = [
  { f: NOTAS, carga: 'const loadAdjustments = useCallback(', pagina: 'page', set: 'setPage', total: 'totalPages', items: 'totalItems', tam: 15, etiqueta: 'notas' },
  { f: CONDUCES, carga: 'const fetchNotes = useCallback(', pagina: 'page', set: 'setPage', total: 'totalPages', items: 'totalItems', tam: 15, etiqueta: 'conduces' },
  { f: AJUSTES, carga: null, pagina: 'tablePage', set: 'setTablePage', total: 'tableTotalPages', items: 'tableTotalItems', tam: 10, etiqueta: 'productos' },
] as const;

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
{
  const p = codigo('src/components/ui/pagination.tsx');
  exige(p.includes('itemLabel = "registros"'), 'el componente ya no trae itemLabel con su valor por defecto');
  exige(p.includes('const endItem = totalItems ? Math.min(currentPage * pageSize, totalItems) : undefined;'),
        'el componente ya no calcula el rango con pageSize');
}
//  Las tres APIs dan el total: sin el, enseñar un rango seria inventarlo.
exige(codigo('src/repositories/deliveryRepository.ts').includes('total_pages: Math.ceil(total / perPage),'),
      'la API de conduces ya no devuelve total');
exige(codigo('src/app/api/v1/ecf/route.ts').includes('total_pages: Math.ceil(total / perPage),'),
      'la API de e-CF ya no devuelve total');
//  Y nadie filtra en el navegador la pagina que llego (lote 109).
exige(!/data\.data\.filter\(/.test(bloque(codigo(NOTAS), 'const loadAdjustments = useCallback(')),
      'la pantalla de notas volvio a filtrar la pagina recibida');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL TOTAL SE GUARDA, Y EL TAMANO ESTA EN UN SITIO');
// ─────────────────────────────────────────────────────────────────────────
for (const t of TRAMO) {
  const src = codigo(t.f);
  ok(`${t.etiqueta}: guarda el total que manda la API`,
     new RegExp(`const \\[${t.items}, set${t.items[0].toUpperCase()}${t.items.slice(1)}\\] = useState\\(0\\);`).test(src)
     && new RegExp(`set${t.items[0].toUpperCase()}${t.items.slice(1)}\\(data\\.meta\\?\\.total \\|\\| 0\\);`).test(src));
  ok(`${t.etiqueta}: el tamano de pagina, en una constante que tambien se pide`,
     new RegExp(`const itemsPerPage = ${t.tam};`).test(src)
     && (src.includes('per_page: String(itemsPerPage),') || src.includes('per_page=${itemsPerPage}')));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LAS TRES USAN EL COMPONENTE');
// ─────────────────────────────────────────────────────────────────────────
for (const t of TRAMO) {
  const src = codigo(t.f);
  ok(`${t.etiqueta}: importa el componente`,
     src.includes("import { Pagination } from '@/components/ui/pagination';"));
  ok(`${t.etiqueta}: con su pagina, su total y su nombre`,
     new RegExp(`<Pagination\\s+currentPage=\\{${t.pagina}\\}\\s+totalPages=\\{${t.total}\\}\\s+totalItems=\\{${t.items}\\}\\s+pageSize=\\{itemsPerPage\\}\\s+onPageChange=\\{${t.set}\\}\\s+itemLabel="${t.etiqueta}"`).test(src));
  ok(`${t.etiqueta}: sin la barra escrita a mano`,
     src.includes('<Pagination')
     && !new RegExp(`Pág\\. \\{${t.pagina}\\} de \\{${t.total}\\}`).test(src)
     && !new RegExp(`Página \\{${t.pagina}\\} de \\{${t.total}\\}`).test(src));
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
