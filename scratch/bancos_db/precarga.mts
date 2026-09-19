/**
 * Precarga del candado: `tsx --import ./scratch/bancos_db/precarga.mts banco.ts`.
 *
 * Va en un `.mts` porque el proyecto compila a CommonJS y ahi no hay `await`
 * de nivel superior; sin el, el banco empezaria antes de que el candado
 * decida. Si la base no es la desechable, sale con codigo 3 sin cargar nada.
 */
import { exigirBaseDesechable } from './candado.ts';

try {
  await exigirBaseDesechable();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(3);
}
