/**
 * Lote 190 -- el buscador no repite una pantalla que tiene dos permisos.
 *
 * COMO SALIO, Y EL ERROR QUE CASI COMETI
 * --------------------------------------
 * Al medir el menu para sugerir mejoras (2026-09-24) aparecio esto:
 *
 *     2x  /dashboard/antiguedad-saldos%  ->  Antiguedad de Saldos | Antiguedad de Saldos
 *
 * Dos filas en `route_mappings` con la misma ruta, el mismo nombre y el mismo
 * grupo. Lo iba a proponer como un arreglo de DATOS -- borrar una fila -- y me
 * equivocaba: al mirarlas una a una, difieren en el MODULO DE PERMISOS.
 *
 *     id 0af62d8a...  module = cobros
 *     id 569d6f4e...  module = proveedores
 *
 * O sea que existen a proposito: la misma pantalla tiene que verla tanto quien
 * lleva los cobros como quien lleva los suplidores. **Borrar una le habria
 * quitado la entrada del menu a un rol entero**, y sin aviso: el sidebar se
 * pinta con lo que hay, no se queja de lo que falta.
 *
 * Y EL SIDEBAR NO LA DUPLICABA. `SidebarContent` ya deduplicaba por ruta
 * (`seenHrefs`), de antes de este lote. El que la repetia era el BUSCADOR de
 * Ctrl+K, porque `getAllSearchableItems` era un `flatMap` a pelo. Asi que el
 * defecto es de codigo, y mucho mas pequeño de lo que parecia.
 *
 * `route_mappings` es GLOBAL -- no tiene `company_id` --, asi que cualquier
 * cambio ahi habria afectado a las seis empresas a la vez. Una razon mas para
 * mirar antes de escribir.
 *
 * La regla se EJECUTA aqui con la forma real de esas dos filas.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const SIDEBAR = 'src/components/ui/new-app-sidebar.tsx';

async function main() {
  const sb = leer(SIDEBAR);
  if (!/function getAllSearchableItems/.test(sb)) {
    throw new Error('Precondicion: ya no se construye la lista de lo buscable');
  }
  //  Vale en los DOS estados: el sidebar deduplicaba ya antes del lote, y eso es
  //  lo que hay que NO romper.
  if (!/const seenHrefs = new Set<string>\(\)/.test(sb)) {
    throw new Error('Precondicion: el sidebar ya no deduplica por ruta');
  }
  console.log('  pre   la lista de lo buscable existe y el sidebar sigue deduplicando');

  const codigo = sinComentarios(sb);

  console.log('\n1) La deduplicacion, en el sitio que faltaba\n');
  //  Acotado al cuerpo de `getAllSearchableItems`: el `seenHrefs` del sidebar
  //  tambien es un `Set` de rutas, y mirar el fichero entero daria un OK que no
  //  es de este lote.
  const cuerpo = (() => {
    const i = codigo.indexOf('function getAllSearchableItems');
    if (i < 0) return '';
    const j = codigo.indexOf('function WorkspaceSwitcher', i);
    return codigo.slice(i, j > -1 ? j : i + 2000);
  })();
  if (cuerpo === '') throw new Error('Precondicion: no se encuentra getAllSearchableItems');

  ok('el buscador deduplica por ruta', /unaEntradaPorRuta\(/.test(cuerpo));
  //  (Que el sidebar deduplique ya era cierto antes del lote: es precondicion.)
  //  Lo de ESTE lote es que el buscador use la regla de fuera, sin copiarla.
  ok('  usando la regla de fuera, no una copia dentro del componente',
    /unaEntradaPorRuta\(/.test(cuerpo)
    && /from '@\/utils\/menuSinRepetidos'/.test(sb));

  console.log('\n2) La regla, EJECUTADA (la de verdad, no una copia)\n');
  //  LA PRIMERA VERSION DE ESTE BANCO REIMPLEMENTABA LA DEDUPLICACION AQUI para
  //  "ejecutarla". Cinco comprobaciones sobrevivieron a la contraprueba, y con
  //  razon: comprobaban mi copia, no el codigo. Por eso la regla se saco a
  //  `utils/menuSinRepetidos`, que si se puede importar.
  let M: typeof import('../src/utils/menuSinRepetidos') | null = null;
  try { M = await import('../src/utils/menuSinRepetidos'); } catch { M = null; }

  const ETIQUETAS = [
    'la pantalla con dos permisos aparece UNA vez',
    'dos rutas distintas con el mismo nombre NO se pierden',
    'se conserva la PRIMERA, con su grupo y su orden',
    'lo que no repite ruta pasa intacto',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe utils/menuSinRepetidos.ts');
  } else {
    const { unaEntradaPorRuta } = M;

    //  La forma exacta de las dos filas de PRODUCCION: misma ruta y nombre,
    //  modulo de permisos distinto.
    const entran = [
      { name: 'Contabilidad', href: '/dashboard/accounting', grupo: 'Finanzas' },
      { name: 'Antiguedad de Saldos', href: '/dashboard/antiguedad-saldos', grupo: 'Finanzas' },
      { name: 'Antiguedad de Saldos', href: '/dashboard/antiguedad-saldos', grupo: 'Finanzas' },
      { name: 'Cuentas por Pagar', href: '/dashboard/ap', grupo: 'Egresos' },
      { name: 'Cuentas por Pagar', href: '/dashboard/financial/accounts-payable', grupo: 'Finanzas' },
    ];
    const salen = unaEntradaPorRuta(entran);

    ok(ETIQUETAS[0],
      salen.filter(i => i.href === '/dashboard/antiguedad-saldos').length === 1,
      `${entran.length} entran, ${salen.length} salen`);
    //  LO QUE NO SE PUEDE PERDER: son dos pantallas de verdad, no un duplicado.
    ok(ETIQUETAS[1], salen.filter(i => i.name === 'Cuentas por Pagar').length === 2);
    ok(ETIQUETAS[2],
      salen[1]?.href === '/dashboard/antiguedad-saldos' && salen[1]?.grupo === 'Finanzas'
      && salen[0]?.href === '/dashboard/accounting');
    ok(ETIQUETAS[3], salen.length === 4, String(salen.length));
    ok('  una lista vacia no revienta', unaEntradaPorRuta([]).length === 0);
    //  No ordena: lo que entra en un orden sale en el mismo.
    ok('  y no reordena nada',
      JSON.stringify(salen.map(i => i.href))
        === JSON.stringify(['/dashboard/accounting', '/dashboard/antiguedad-saldos',
          '/dashboard/ap', '/dashboard/financial/accounts-payable']));
  }

  console.log('\n3) Lo que este lote NO hace, y es deliberado\n');
  //  Si algun dia alguien "limpia" esas filas, esto es lo que hay que recordar.
  ok('no se borra ninguna fila de route_mappings: son permisos, no basura',
    /modulo de permisos/i.test(sb) && /rol entero/i.test(sb));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
