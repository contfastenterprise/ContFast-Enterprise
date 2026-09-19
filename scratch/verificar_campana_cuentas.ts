/**
 * Lote 168 -- la campana decia "3" y al abrirla salian 6.
 *
 * Reportado por el dueño el 2026-09-19. No era un error de cuenta: el numero
 * rojo cuenta los avisos SIN LEER y la lista enseña todos los VIGENTES (lote
 * 160: marcar leido no resuelve; el aviso sigue hasta que se atiende). Pero
 * nada lo decia, y los leidos solo se distinguian por un fondo muy tenue.
 *
 * Ahora la cabecera da las dos cifras y la lista separa "Sin leer" de "Leidos
 * -- siguen pendientes", con el porque.
 *
 * Solo codigo.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const RUTA = 'src/components/ui/campana-avisos.tsx';
const C = existsSync(join(__dirname, '..', RUTA)) ? fuente(RUTA) : '';
const CRUDO = existsSync(join(__dirname, '..', RUTA)) ? crudo(RUTA) : '';

// El numero rojo sigue contando los SIN LEER: es la premisa (si cambiara a
// contar todos, las dos cifras de la cabecera sobrarian y este banco se revisa).
if (!/\{sinLeer > 9 \? '9\+' : sinLeer\}/.test(C)) {
  throw new Error('PRECONDICION ROTA: el numero de la campana ya no cuenta los sin leer');
}
console.log('  pre   el numero rojo cuenta los avisos sin leer');

ok('la lista se parte en sin leer y leidos, por readAt',
  /const pendientesSinLeer = avisos\.filter\(\(a\) => !a\.readAt\);/.test(C)
  && /const pendientesLeidos = avisos\.filter\(\(a\) => !!a\.readAt\);/.test(C));
ok('la cabecera dice cuantos sin leer y cuantos vigentes',
  /\{pendientesSinLeer\.length\} sin leer · \{avisos\.length\} vigente/.test(C));
ok('primero el grupo "Sin leer", con sus avisos',
  /Sin leer<\/p>\s*<ul[^>]*>\{pendientesSinLeer\.map\(\(a\) => fila\(a, false\)\)\}/.test(C));
ok('despues "Leidos -- siguen pendientes", con los suyos',
  /Leídos — siguen pendientes/.test(C) && /\{pendientesLeidos\.map\(\(a\) => fila\(a, true\)\)\}/.test(C)
  && C.indexOf('pendientesSinLeer.map') < C.indexOf('pendientesLeidos.map'));
ok('y explica por que un leido sigue ahi',
  /Marcar como leído no resuelve el aviso: sigue aquí hasta que se atienda\./.test(C));
ok('los leidos se ven atenuados; los sin leer, destacados',
  /leido \? 'opacity-70' : 'bg-amber-50\/60'/.test(C));
ok('el porque queda escrito en el codigo', /Lote 168: el numero rojo cuenta los SIN LEER/.test(CRUDO));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
