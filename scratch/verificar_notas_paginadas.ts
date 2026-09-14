/**
 * Banco del lote 109: la pantalla de notas de credito y debito pagina NOTAS,
 * no facturas.
 *
 *     pnpm exec tsx scratch/verificar_notas_paginadas.ts
 *
 * EL FALLO
 * --------
 * `dashboard/adjustments` pedia a `/api/v1/ecf` la pagina N de 15 SIN tipo
 * cuando el filtro estaba en "Todos", y luego se quedaba en el navegador con
 * las filas 33/34/03/04. El servidor ya habia cortado la pagina contando
 * facturas, asi que:
 *
 *   - "Pagina 1 de 4" con las paginas 2, 3 y 4 VACIAS (medido abajo);
 *   - y en cuanto se acumulen facturas encima, una nota antigua cae en una
 *     pagina de 15 facturas, la pantalla la filtra, y enseña el mensaje de
 *     "no hay notas" con la nota existiendo. Un documento fiscal que parece
 *     no estar.
 *
 * MEDIDO (2026-09-14, READ ONLY): PRODUCCION 52 e-CF, 2 notas (34) en las filas
 * 8 y 10. Ninguna fila con tipo 03 ni 04.
 *
 * EL ARREGLO
 * ----------
 * Filtrar donde se pagina. `/api/v1/ecf` acepta `ecfType` como lista
 * (`33,34,03,04`) y la pantalla la manda siempre. Los cuatro codigos se
 * conservan aunque hoy no haya 03/04: son los que la pantalla ya enseñaba, y
 * quitar dos seria esconder algo que hoy se ve.
 *
 * La lista se lee con `tiposDelFiltro` (en `tiposComprobante.ts`, que ya
 * importa la pantalla y no toca la base): se ejecuta aqui con entradas de
 * verdad. Se carga con `await import()` y se comprueba que la funcion EXISTA:
 * el modulo existe antes del lote, la funcion no.
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
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

const API = 'src/app/api/v1/ecf/route.ts';
const PANT = 'src/app/dashboard/adjustments/page.tsx';
const TIPOS = 'src/services/dgii/tiposComprobante.ts';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
for (const f of [API, PANT, TIPOS]) exige(crudo(f).length > 1000, `No se pudo leer ${f}`);

//  La razon del fallo: la API pagina en la base. Si dejara de hacerlo, filtrar
//  en el cliente no cortaria nada.
exige(codigo(API).includes('.limit(perPage)') && codigo(API).includes('.offset(offset)'),
      'la API de e-CF ya no pagina en la base');
exige(codigo(API).includes('total_pages: Math.ceil(total / perPage)'),
      'la API ya no calcula total_pages sobre lo que filtra');
//  La pantalla pagina de 15 en 15 contra esa API.
exige(codigo(PANT).includes("per_page: '15',") && codigo(PANT).includes('fetch(`/api/v1/ecf?${params.toString()}`)'),
      'la pantalla de notas ya no pide paginas de 15 a /api/v1/ecf');
//  Las otras dos pantallas que filtran por UN tipo no pueden romperse: siguen
//  mandando un solo codigo.
exige(codigo('src/app/dashboard/ecf/page.tsx').includes('fetch(`/api/v1/ecf?ecfType=${t}'),
      'la pantalla de e-CF ya no pide un tipo suelto');

type Modulo = typeof import('../src/services/dgii/tiposComprobante');

async function main(): Promise<void> {
  let T: Partial<Modulo> | null = null;
  try { T = (await import('../src/services/dgii/tiposComprobante')) as Modulo; } catch { T = null; }
  function okA(t: string, prueba: (f: Modulo['tiposDelFiltro']) => boolean): void {
    const f = T?.tiposDelFiltro;
    if (typeof f !== 'function') { ok(`${t}  [no existe tiposDelFiltro]`, false); return; }
    let r = false;
    try { r = prueba(f); } catch (e) { console.log(`        ${(e as Error).message}`); }
    ok(t, r);
  }
  const igual = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

  // ───────────────────────────────────────────────────────────────────────
  console.log('A. LEER LA LISTA DE TIPOS, EJECUTANDOLA');
  // ───────────────────────────────────────────────────────────────────────
  okA('sin parametro, sin filtro', (f) => igual(f(null), []) && igual(f(undefined), []) && igual(f(''), []));
  okA('un tipo suelto sigue siendo un tipo', (f) => igual(f('31'), ['31']));
  okA('una lista se parte por comas', (f) => igual(f('33,34,03,04'), ['33', '34', '03', '04']));
  okA('con espacios y comas de sobra', (f) => igual(f(' 33 , ,34,'), ['33', '34']));
  okA('sin repetidos', (f) => igual(f('34,34,33'), ['34', '33']));

  // ───────────────────────────────────────────────────────────────────────
  console.log('B. LA API FILTRA LA LISTA ANTES DE PAGINAR');
  // ───────────────────────────────────────────────────────────────────────
  const api = codigo(API);
  ok('importa tiposDelFiltro',
     /import \{[^}]*\btiposDelFiltro\b[^}]*\} from '@\/services\/dgii\/tiposComprobante'/.test(api));
  ok('y la usa sobre ecfType', api.includes('const tipos = tiposDelFiltro(ecfType);'));
  ok('un tipo: la misma igualdad de siempre',
     api.includes('if (tipos.length === 1) conditions.push(eq(invoices.ecfType, tipos[0]));'));
  ok('varios: IN, dentro de la misma consulta que pagina',
     api.includes('else if (tipos.length > 1) conditions.push(inArray(invoices.ecfType, tipos));')
     && /import \{[^}]*\binArray\b[^}]*\} from 'drizzle-orm'/.test(api));
  //  Antes, `ecfType=basura` buscaba ese tipo literal y no devolvia nada. Si la
  //  lista queda vacia tras limpiarla, no puede pasar a devolverlo TODO.
  ok('un ecfType que no deja ningun tipo no se convierte en "todos"',
     api.includes('if (ecfType && tipos.length === 0) conditions.push(sql`false`);'));

  // ───────────────────────────────────────────────────────────────────────
  console.log('C. LA PANTALLA PIDE NOTAS, Y NO VUELVE A FILTRAR');
  // ───────────────────────────────────────────────────────────────────────
  const pant = codigo(PANT);
  ok('con "Todos" manda la lista de notas, no un tipo vacio',
     pant.includes("ecfType: typeFilter || TIPOS_DE_ESTA_PANTALLA.join(','),")
     && !pant.includes("ecfType: typeFilter || '',"));
  ok('la lista son las notas electronicas mas las dos que ya enseñaba',
     pant.includes("const TIPOS_DE_ESTA_PANTALLA = [...CODIGOS_NOTA, '03', '04'];")
     && /import \{[^}]*\bCODIGOS_NOTA\b[^}]*\} from '@\/services\/dgii\/tiposComprobante'/.test(pant));
  //  Dentro de `loadAdjustments`, no en todo el fichero: el buscador de la
  //  factura original filtra `data.data` con `esModificablePorNota`, y eso es
  //  otra lista y otro asunto.
  const carga = bloque(pant, 'const loadAdjustments = useCallback(');
  ok('y ya no filtra en el navegador una pagina que corto el servidor',
     carga.includes('setNotes(data.data);')
     && !/\.filter\(/.test(carga));

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
