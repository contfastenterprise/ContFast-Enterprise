/**
 * Las tres vistas `v_public_*`.
 *
 * DE DONDE SALEN
 * --------------
 * Estan declaradas en src/db/schema/products.ts y creadas en la migracion
 * 0001, y NO las consulta nadie: ni una sola referencia en `src/`. Andamiaje,
 * como el `?token=` del PDF o `withTenantContext`. Se dejan (pueden hacer falta
 * para un catalogo publico) pero se arreglan, porque el dia que alguien las use
 * heredaria el fallo sin enterarse.
 *
 * QUE LES FALTABA
 * ---------------
 * Solo a `v_public_products`, y son dos cosas:
 *
 *  1. La union no ata las empresas. Va `products` -> `price_list_items` ->
 *     `price_lists`, y las tres tablas llevan `company_id`, pero la vista no
 *     los iguala. Un renglon de tarifa de la empresa B apuntando a un producto
 *     de la empresa A sale como producto de A -- con el PRECIO de B. No es que
 *     se vea de mas: es que se ve MAL, y con el sello de la empresa que no es.
 *
 *  2. No mira `price_list_items.deleted_at`. Un renglon borrado sigue poniendo
 *     precio.
 *
 * Y ADEMAS, AUNQUE NO ES UN FILTRO
 * --------------------------------
 * Un producto en dos tarifas publicas sale DOS VECES, con dos precios. Eso no
 * se arregla con un filtro sin decidir que precio manda, asi que la vista pasa
 * a devolver un solo renglon por producto: el de la tarifa publica mas
 * reciente. Se comprueba abajo.
 *
 * LO QUE NO LES FALTA, Y CONVIENE DEJARLO ESCRITO
 * -----------------------------------------------
 * `modo`. Lo dije mal en su momento: estas cuatro tablas -- products,
 * product_categories, price_lists, price_list_items -- NO tienen columna
 * `modo`, y es correcto que no la tengan. `modo` vive en las 43 tablas
 * transaccionales. Un producto es el mismo producto se facture en PRUEBA o en
 * PRODUCCION; lo que cambia de entorno es la factura, no el catalogo.
 *
 * Tampoco les falta filtrar por empresa "la actual": una vista no sabe quien
 * pregunta. Exponen `company_id` para que quien las use filtre. Que nadie
 * pueda leerlas desde fuera es cosa de la 0037.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111'; // Alfa SRL
const B = '22222222-2222-2222-2222-222222222222'; // Beta SRL

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const filas = async <T>(q: any) => (await db.execute(q)) as unknown as T[];

const PROD_A = 'dddddddd-0000-0000-0000-0000000000a1';
const LISTA_A = 'eeeeeeee-0000-0000-0000-0000000000a1';
const LISTA_A2 = 'eeeeeeee-0000-0000-0000-0000000000a2';
const LISTA_B = 'eeeeeeee-0000-0000-0000-0000000000b1';
const LISTA_B2 = 'eeeeeeee-0000-0000-0000-0000000000b2';

async function sembrar() {
  await db.execute(sql`DELETE FROM price_list_items WHERE company_id IN (${A}::uuid, ${B}::uuid)`);
  await db.execute(sql`DELETE FROM price_lists WHERE company_id IN (${A}::uuid, ${B}::uuid)`);
  await db.execute(sql`DELETE FROM products WHERE id = ${PROD_A}::uuid`);

  await db.execute(sql`
    INSERT INTO products (id, company_id, sku, name, price, cost, status)
    VALUES (${PROD_A}::uuid, ${A}::uuid, 'CAT-01', 'Puerta de roble', 1000, 500, 'active')`);

  // Dos tarifas publicas de A, creadas en momentos distintos, y una de B.
  await db.execute(sql`
    INSERT INTO price_lists (id, company_id, name, is_public, status, created_at) VALUES
      (${LISTA_A}::uuid,  ${A}::uuid, 'Publica A (vieja)',  true, 'active', now() - interval '10 days'),
      (${LISTA_A2}::uuid, ${A}::uuid, 'Publica A (nueva)',  true, 'active', now() - interval '1 day'),
      (${LISTA_B}::uuid,  ${B}::uuid, 'Publica B',          true, 'active', now() - interval '2 days'),
      (${LISTA_B2}::uuid, ${B}::uuid, 'Publica B (otra)',   true, 'active', now())`);
}

const catalogo = (companyId: string) => filas<{ id: string; name: string; price: string; company_id: string }>(sql`
  SELECT id, name, price, company_id FROM v_public_products
   WHERE company_id = ${companyId}::uuid ORDER BY price`);

async function main() {
  await sembrar();

  console.log('\n1) El precio que sale es de la empresa que dice ser\n');

  // Renglon legitimo de A.
  await db.execute(sql`
    INSERT INTO price_list_items (company_id, price_list_id, product_id, price)
    VALUES (${A}::uuid, ${LISTA_A}::uuid, ${PROD_A}::uuid, 1200)`);

  let vistoA = await catalogo(A);
  ok('el producto de A sale en el catalogo de A', vistoA.length === 1, `${vistoA.length} renglones`);
  ok('y con SU precio', vistoA[0]?.price === '1200.00', vistoA[0]?.price);

  // Ahora el renglon cruzado: una tarifa de B poniendo precio a un producto de
  // A. En esta base la 0032 lo impide con sus claves compuestas, pero en
  // produccion la 0032 NO esta aplicada: alli esto entra. Se quitan un momento
  // para reproducir la situacion real y se devuelven al terminar.
  //
  // ESTO YA SALIO MAL UNA VEZ, Y ASI FUE
  // ------------------------------------
  // La primera version las quitaba, se caia a mitad (choque con el indice
  // unico) y NO las devolvia. Hasta ahi, normal. Lo grave vino despues: como
  // la lista se leia de `pg_constraint`, en la ejecucion siguiente ya no habia
  // nada que leer, el bucle no hacia nada... y el banco daba TODO CORRECTO.
  // Habia dejado la base sin dos claves foraneas estructurales y se declaraba
  // conforme -- y todos los bancos posteriores corrian sin ellas.
  //
  // Es el patron exacto que persigue esta auditoria: el estado se degrada y la
  // comprobacion calla. Por eso ahora:
  //   - las definiciones NO se leen de la base, estan escritas aqui (copiadas
  //     de la 0032), asi que se pueden devolver aunque falten;
  //   - la restitucion va en `finally`, se caiga lo que se caiga;
  //   - y al final se AFIRMA que estan puestas. Si no lo estan, el banco falla.
  const CLAVES_0032: Record<string, string> = {
    price_list_items_price_list_id_company_fk:
      'FOREIGN KEY (price_list_id, company_id) REFERENCES price_lists(id, company_id) NOT VALID',
    price_list_items_product_id_company_fk:
      'FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id) NOT VALID',
  };

  const clavesAlEmpezar = (await filas<{ conname: string }>(sql`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'price_list_items'::regclass AND contype = 'f' AND conname LIKE '%_company_fk'`))
    .map(c => c.conname);

  // Si la 0032 no esta aplicada -- el caso de produccion hoy -- no hay nada que
  // quitar, y tampoco hay que inventarse claves que la base no tiene.
  const restituir = async () => {
    for (const nombre of clavesAlEmpezar) {
      await db.execute(sql.raw(
        `ALTER TABLE price_list_items ADD CONSTRAINT ${nombre} ${CLAVES_0032[nombre]}`));
    }
  };

  for (const nombre of clavesAlEmpezar) {
    await db.execute(sql.raw(`ALTER TABLE price_list_items DROP CONSTRAINT ${nombre}`));
  }

  try {

  await db.execute(sql`
    INSERT INTO price_list_items (company_id, price_list_id, product_id, price)
    VALUES (${B}::uuid, ${LISTA_B}::uuid, ${PROD_A}::uuid, 1)`);

  vistoA = await catalogo(A);
  // EL FALLO: sin igualar los `company_id`, la union pega el producto de A al
  // renglon de B y la vista lo devuelve como producto de A a precio de B.
  ok('un renglon de tarifa de B NO pone precio a un producto de A',
    vistoA.length === 1,
    vistoA.length > 1 ? `salen ${vistoA.length} precios: ${vistoA.map(v => v.price).join(', ')}` : '');
  ok('el precio de 1.00 de B no aparece en el catalogo de A',
    !vistoA.some(v => Number(v.price) === 1),
    vistoA.map(v => v.price).join(', '));

  // SEGUNDO CRUCE, Y NO SOBRA.
  // El de arriba tiene la tarifa Y el renglon en B, asi que lo atrapa
  // `pl.company_id = p.company_id` el solo. Si se dejara solo ese caso, la
  // otra igualdad -- `pli.company_id = p.company_id` -- seria adorno: se podria
  // quitar de la vista y el banco seguiria en verde. Se comprobo: quitandola,
  // la unica que fallaba era la lectura del texto de la vista, no una
  // consulta. Este segundo cruce la hace obligatoria: tarifa de A (asi que la
  // otra igualdad pasa), renglon sellado como B.
  //
  // Va en LISTA_A2 y no en LISTA_A por dos razones. Una, hay indice unico
  // (price_list_id, product_id): en LISTA_A ya esta el renglon legitimo y
  // chocaria. Y dos, LISTA_A2 es la tarifa publica MAS RECIENTE, asi que con
  // el `DISTINCT ON ... ORDER BY pl.created_at DESC` este renglon malo seria
  // el que GANARA. Es el peor caso, que es el que hay que probar.
  await db.execute(sql`
    INSERT INTO price_list_items (company_id, price_list_id, product_id, price)
    VALUES (${B}::uuid, ${LISTA_A2}::uuid, ${PROD_A}::uuid, 2)`);

  vistoA = await catalogo(A);
  ok('un renglon sellado como B dentro de una tarifa de A tampoco pone precio',
    !vistoA.some(v => Number(v.price) === 2),
    vistoA.map(v => v.price).join(', '));
  ok('sigue saliendo solo el precio legitimo', vistoA.length === 1 && vistoA[0]?.price === '1200.00',
    `${vistoA.length} renglones: ${vistoA.map(v => v.price).join(', ')}`);

  // TERCER CRUCE. Hacen falta los tres, y esto no es celo: se comprobo
  // quitando cada igualdad por separado.
  //
  //   cruce 1 (renglon B, tarifa B, producto A) .... lo atrapan las dos
  //   cruce 2 (renglon B, tarifa A, producto A) .... solo pli.company_id
  //   cruce 3 (renglon A, tarifa B, producto A) .... solo pl.company_id
  //
  // Sin el cruce 3, se podia borrar `pl.company_id = p.company_id` de la vista
  // y el banco seguia en verde: la igualdad habria quedado de adorno. Este es
  // el caso en que el sello del renglon esta bien y la que esta fuera de sitio
  // es la TARIFA -- el producto de A colgando de la lista publica de B.
  //
  // Va en LISTA_B2 (la otra lista publica de B) porque en LISTA_B ya esta el
  // cruce 1 y hay indice unico (price_list_id, product_id). Y LISTA_B2 es la
  // tarifa publica mas reciente de todas, asi que sin el filtro este renglon
  // GANA el `DISTINCT ON`. Peor caso otra vez.
  await db.execute(sql`
    INSERT INTO price_list_items (company_id, price_list_id, product_id, price)
    VALUES (${A}::uuid, ${LISTA_B2}::uuid, ${PROD_A}::uuid, 3)`);

  vistoA = await catalogo(A);
  ok('un producto de A colgado de la tarifa publica de B no se publica',
    !vistoA.some(v => Number(v.price) === 3),
    vistoA.map(v => v.price).join(', '));
  ok('y sigue mandando el precio legitimo', vistoA.length === 1 && vistoA[0]?.price === '1200.00',
    `${vistoA.length} renglones: ${vistoA.map(v => v.price).join(', ')}`);

  await db.execute(sql`
    DELETE FROM price_list_items WHERE company_id = ${A}::uuid AND price_list_id = ${LISTA_B2}::uuid`);

  // Los renglones cruzados siguen en la base: la vista los tapa, no los borra.
  // Que no se queden tapados para siempre es lo que comprueba el diagnostico
  // `scratch/diagnostico_tarifas_cruzadas.sql`.
  const [{ n: cruzados }] = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM price_list_items pli
      JOIN products p ON p.id = pli.product_id
     WHERE pli.company_id <> p.company_id`);
  ok('los renglones cruzados siguen existiendo (la vista tapa, no cura)', cruzados === 2, String(cruzados));

  await db.execute(sql`
    DELETE FROM price_list_items WHERE company_id = ${B}::uuid AND price_list_id = ${LISTA_A2}::uuid`);

  } finally {
    // Pase lo que pase ahi dentro, las claves vuelven. Si esto se salta, la
    // base se queda sin ellas y los bancos siguientes corren sin la proteccion
    // estructural sin que nadie lo note.
    await restituir();
  }

  const clavesAlTerminar = (await filas<{ conname: string }>(sql`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'price_list_items'::regclass AND contype = 'f' AND conname LIKE '%_company_fk'`))
    .map(c => c.conname).sort();
  ok('las claves compuestas de la 0032 vuelven a su sitio',
    clavesAlTerminar.join(',') === [...clavesAlEmpezar].sort().join(','),
    `empezo con ${clavesAlEmpezar.length}, termina con ${clavesAlTerminar.length}`);

  console.log('\n2) Un renglon borrado no pone precio\n');

  await db.execute(sql`
    UPDATE price_list_items SET deleted_at = now()
     WHERE company_id = ${A}::uuid AND price_list_id = ${LISTA_A}::uuid`);
  vistoA = await catalogo(A);
  ok('con su unico renglon borrado, el producto desaparece', vistoA.length === 0,
    `${vistoA.length} renglones: ${vistoA.map(v => v.price).join(', ')}`);
  await db.execute(sql`
    UPDATE price_list_items SET deleted_at = NULL
     WHERE company_id = ${A}::uuid AND price_list_id = ${LISTA_A}::uuid`);

  console.log('\n3) Un producto en dos tarifas publicas sale UNA vez\n');

  await db.execute(sql`
    INSERT INTO price_list_items (company_id, price_list_id, product_id, price)
    VALUES (${A}::uuid, ${LISTA_A2}::uuid, ${PROD_A}::uuid, 1500)`);

  vistoA = await catalogo(A);
  ok('un solo renglon, no dos', vistoA.length === 1,
    vistoA.length > 1 ? `salen ${vistoA.length}: ${vistoA.map(v => v.price).join(', ')}` : '');
  ok('y manda la tarifa publica mas reciente (1500, no 1200)',
    vistoA[0]?.price === '1500.00', vistoA[0]?.price);

  console.log('\n4) Lo que ya funcionaba sigue funcionando\n');

  const [{ n: sinPublicar }] = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM v_public_products WHERE company_id = ${B}::uuid`);
  ok('B no ve productos que no son suyos', sinPublicar === 0, String(sinPublicar));

  await db.execute(sql`UPDATE price_lists SET is_public = false WHERE id = ${LISTA_A}::uuid`);
  await db.execute(sql`UPDATE price_lists SET is_public = false WHERE id = ${LISTA_A2}::uuid`);
  ok('una tarifa no publica no publica nada', (await catalogo(A)).length === 0);
  await db.execute(sql`UPDATE price_lists SET is_public = true WHERE id IN (${LISTA_A}::uuid, ${LISTA_A2}::uuid)`);

  await db.execute(sql`UPDATE products SET status = 'inactive' WHERE id = ${PROD_A}::uuid`);
  ok('un producto inactivo no sale', (await catalogo(A)).length === 0);
  await db.execute(sql`UPDATE products SET status = 'active' WHERE id = ${PROD_A}::uuid`);

  await db.execute(sql`UPDATE products SET deleted_at = now() WHERE id = ${PROD_A}::uuid`);
  ok('un producto borrado no sale', (await catalogo(A)).length === 0);
  await db.execute(sql`UPDATE products SET deleted_at = NULL WHERE id = ${PROD_A}::uuid`);

  ok('y al deshacerlo todo, vuelve', (await catalogo(A)).length === 1);

  console.log('\n5) Las otras dos vistas: no les faltaba nada, se comprueba igual\n');

  const cats = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM v_public_categories WHERE company_id = ${A}::uuid`);
  ok('v_public_categories responde', cats[0].n >= 0, `${cats[0].n} categorias de A`);

  const listas = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM v_public_price_lists WHERE company_id = ${A}::uuid`);
  ok('v_public_price_lists solo trae las publicas', listas[0].n === 2, String(listas[0].n));

  await db.execute(sql`UPDATE price_lists SET deleted_at = now() WHERE id = ${LISTA_A}::uuid`);
  const listas2 = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM v_public_price_lists WHERE company_id = ${A}::uuid`);
  ok('y no las borradas', listas2[0].n === 1, String(listas2[0].n));
  await db.execute(sql`UPDATE price_lists SET deleted_at = NULL WHERE id = ${LISTA_A}::uuid`);

  console.log('\n6) La definicion en la base y la del esquema TypeScript dicen lo mismo\n');

  // Si se cambia la vista en SQL y no en src/db/schema/products.ts, el proximo
  // `drizzle-kit generate` propone deshacer el arreglo. Esto lo caza.
  const [{ def }] = await filas<{ def: string }>(sql`
    SELECT pg_get_viewdef('v_public_products'::regclass, true) AS def`);
  ok('la vista en la base iguala los company_id',
    /pli\.company_id\s*=\s*p\.company_id/.test(def) || /p\.company_id\s*=\s*pli\.company_id/.test(def),
    def.replace(/\s+/g, ' ').slice(0, 110));
  ok('y mira el borrado del renglon de tarifa',
    /pli\.deleted_at IS NULL/.test(def));

  const esquema = fuente('src/db/schema/products.ts');
  const bloque = esquema.slice(esquema.indexOf('vPublicProducts'));
  ok('el esquema TypeScript tambien',
    /pli\.company_id = p\.company_id/.test(bloque) && /pli\.deleted_at IS NULL/.test(bloque));

  // Recoger. Este banco planta a proposito un renglon MAL SELLADO para
  // reproducir el fallo, y ese renglon es justo lo que cuenta
  // `diagnostico_tarifas_cruzadas.sql`. Si se queda, el diagnostico acusa una
  // suciedad que se ha creado el propio banco, y el siguiente que lo mire se
  // va a buscar un problema que no existe. Se limpia aqui y no solo en
  // `sembrar()`, que solo protege a la siguiente ejecucion de ESTE banco.
  await db.execute(sql`DELETE FROM price_list_items WHERE company_id IN (${A}::uuid, ${B}::uuid)`);
  await db.execute(sql`DELETE FROM price_lists WHERE company_id IN (${A}::uuid, ${B}::uuid)`);
  await db.execute(sql`DELETE FROM products WHERE id = ${PROD_A}::uuid`);

  const [{ n: restos }] = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM price_list_items pli
      JOIN products p ON p.id = pli.product_id
     WHERE pli.company_id <> p.company_id`);
  ok('no queda ningun renglon cruzado plantado por este banco', restos === 0, String(restos));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
