import { crudo as crudoCrudo } from './_fuente';
import { existsSync } from 'fs';
import { join } from 'path';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════ P2-25: el registro del storefront no tenia limite de peticiones ═══════════
// La ruta CREA usuarios y no limitaba nada. Permitia dar de alta cuentas en masa
// y, sobre todo, enumerar correos: responde distinto segun el correo exista o no.
// v1/auth/register ya usaba el preset 'auth' (5/min), el UNICO con respaldo en
// memoria cuando Redis esta caido -- que es justo cuando mas falta hace.
//
// LOTE 233: la ruta se RETIRO entera -- la tienda dejo de tener cuentas
// (decision del dueno; medido, nunca creo una). El mejor limite para un
// registro publico que crea usuarios es que no exista. Lo que queda: que se
// fue, y con ella las paginas que la usaban.
{
  const raizRepo = join(__dirname, '..');
  ok('storefront/register: la ruta ya no existe', !existsSync(join(raizRepo, 'src/app/api/storefront/auth/register/route.ts')));
  ok('storefront/register: tampoco las paginas que la usaban (registro, login, mi cuenta)',
    ['registro', 'login', 'mi-cuenta'].every((d) => !existsSync(join(raizRepo, `src/app/[empresa]/${d}`))));
}

// ═══════════ P2-26: validacion manual en categories y warehouses ═══════════
// Las dos rutas destructuraban el cuerpo sin validar y comprobaban a mano solo la
// presencia. Nada verificaba tipos, longitudes ni el valor de `status`, que en la
// base es un varchar sin restriccion: cabia cualquier cosa, o un nombre de 10.000
// caracteres. El resto del repo ya usa zod.
{
  const s = crudo('src/app/api/v1/categories/route.ts');
  ok('categories: importa zod', s.includes("import { z } from 'zod';"));
  ok('categories: define el esquema de alta', s.includes('const crearCategoriaSchema = z.object({'));
  ok(
    'categories: acota el nombre a lo que aguanta la columna (255)',
    s.includes("max(255, 'El nombre no puede pasar de 255 caracteres')")
  );
  ok(
    'categories: status solo admite los dos valores reales',
    s.includes("status: z.enum(['active', 'inactive']).optional(),")
  );
  ok(
    'categories: valida el cuerpo con el esquema',
    s.includes('const parsed = crearCategoriaSchema.safeParse(body);') &&
      s.includes('const { name, description, status } = parsed.data;')
  );
  ok(
    'categories: sin la comprobacion manual de antes',
    !s.includes('const { name, description, status } = body;') && !s.includes('if (!name) {')
  );
}

{
  const s = crudo('src/app/api/v1/warehouses/route.ts');
  ok('warehouses: importa zod', s.includes("import { z } from 'zod';"));
  ok('warehouses: define el esquema de alta', s.includes('const crearAlmacenSchema = z.object({'));
  ok(
    'warehouses: acota nombre (255) y codigo (50) a lo que aguantan las columnas',
    s.includes("max(255, 'El nombre no puede pasar de 255 caracteres')") &&
      s.includes("max(50, 'El código no puede pasar de 50 caracteres')")
  );
  ok(
    'warehouses: status solo admite los dos valores reales',
    s.includes("status: z.enum(['active', 'inactive']).optional(),")
  );
  ok(
    'warehouses: valida el cuerpo con el esquema',
    s.includes('const parsed = crearAlmacenSchema.safeParse(data);') &&
      s.includes('const { name, code, address, status } = parsed.data;')
  );
  ok(
    'warehouses: sin la comprobacion manual de antes',
    !s.includes('const { name, code, address, status } = data;') && !s.includes('if (!name || !code) {')
  );
  ok(
    'warehouses: la nota explica por que el codigo se normaliza (indice UNIQUE)',
    s.includes('indice UNIQUE por')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
