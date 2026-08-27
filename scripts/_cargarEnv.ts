/**
 * Carga el fichero .env en process.env.
 *
 * Next.js lee .env solo, pero un script suelto ejecutado con `tsx` no: los
 * scripts de esta carpeta importan `src/db`, que aborta al cargarse si falta
 * DATABASE_URL, asi que fallaban con "DATABASE_URL environment variable is not
 * defined" antes siquiera de empezar.
 *
 * Se importa PRIMERO, antes que cualquier modulo que toque la base:
 *
 *     import './_cargarEnv';
 *     import { db } from '../src/db';
 *
 * El orden importa. TypeScript conserva el orden de los imports al compilar, y
 * el efecto secundario de este modulo tiene que ocurrir antes de que `src/db`
 * se evalue.
 *
 * No usa dotenv a proposito: no es dependencia del proyecto y esto son quince
 * lineas. Lo que ya venga en el entorno NO se pisa, para que
 * `DATABASE_URL=... npx tsx ...` siga mandando sobre el fichero.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

for (const nombre of ['.env.local', '.env']) {
  const ruta = join(RAIZ, nombre);
  if (!existsSync(ruta)) continue;

  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const corte = limpia.indexOf('=');
    if (corte < 1) continue;

    const clave = limpia.slice(0, corte).trim();
    if (process.env[clave] !== undefined) continue; // el entorno manda

    let valor = limpia.slice(corte + 1).trim();
    // Quita las comillas envolventes si las hay, sin tocar las de dentro.
    if (valor.length >= 2 && ((valor[0] === '"' && valor.endsWith('"')) ||
                              (valor[0] === "'" && valor.endsWith("'")))) {
      valor = valor.slice(1, -1);
    }
    process.env[clave] = valor;
  }
}
