/**
 * consultasCrudas.vitest.ts
 *
 * Guarda permanente del hallazgo ISO-04 de la auditoria.
 *
 * La emision de facturas consultaba el costo del producto y el limite de
 * credito del cliente con SQL crudo:
 *
 *   db.select({ cost: sql`cost` }).from(sql`products`).where(eq(sql`id`, ...))
 *
 * Escrito asi, el `where` no llevaba `company_id` y ninguna revision basada en
 * los nombres de columna de Drizzle lo detectaba: la tabla y las columnas eran
 * cadenas opacas. Como el mensaje de error devolvia el nombre y el importe, la
 * ruta se convertia en un oraculo para leer el catalogo y la cartera de otras
 * empresas.
 *
 * Las tablas del esquema estan tipadas: usarlas hace visible el filtro que
 * falta. Esta prueba falla si vuelve a aparecer una tabla referenciada como
 * cadena en un `.from()`.
 *
 * No comprueba que cada consulta filtre por empresa -- eso no se puede deducir
 * de forma fiable leyendo el texto. Comprueba que las consultas se escriban de
 * una forma en la que ese filtro sea legible.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

/**
 * `.from(sql`tabla`)` — la tabla como cadena en lugar del objeto del esquema.
 * Sin la bandera `g`: `test()` sobre una expresion global es stateful y
 * alternaria resultados entre llamadas.
 */
const TABLA_COMO_CADENA = /\.from\(\s*sql`/;

function ficherosTs(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next' || entrada === 'tests') continue;
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) ficherosTs(p, acc);
    else if (entrada.endsWith('.ts') || entrada.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

const FICHEROS = ficherosTs(SRC).map((p) => ({
  id: relative(RAIZ, p).split('\\').join('/'),
  contenido: readFileSync(p, 'utf8'),
}));

describe('ISO-04 · consultas con la tabla escrita como cadena', () => {
  it('el arbol de fuentes se recorre correctamente', () => {
    expect(FICHEROS.length).toBeGreaterThan(100);
  });

  it('ninguna consulta referencia una tabla como cadena en .from()', () => {
    const infractores = FICHEROS.filter((f) => TABLA_COMO_CADENA.test(f.contenido)).map((f) => f.id);

    expect(
      infractores,
      'Usa el objeto del esquema — .from(products) en vez de .from(sql`products`) — ' +
        'para que el filtro por empresa quede a la vista en el where.'
    ).toEqual([]);
  });
});
