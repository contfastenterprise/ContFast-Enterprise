/**
 * La pantalla de nomina ENTERA, para los bancos que la leen.
 *
 * Hasta el lote 293 era un solo fichero (`hr/payroll/page.tsx`, 607 lineas) mas
 * la tarjeta del asiento (`components/AsientoDeLaNomina.tsx`). En el lote 294 se
 * partio en `hooks/` y `components/` sin cambiar lo que hace, y los bancos que
 * leian la pagina se quedaron mirando solo el armazon. Este ayudante devuelve
 * todo lo que forma la pantalla, en los dos estados: antes del 294 es la pagina
 * y la tarjeta del asiento. Mismo criterio que `pantallaDeCaja.ts` (lote 229) y
 * `pantallaDeAjustes.ts` (lote 238).
 *
 * El corte no cambio ningun nombre: el hook (`useNominas`) devuelve las mismas
 * variables y cada pieza las saca de el con su nombre de siempre, asi que las
 * expresiones de los bancos no necesitan prefijo.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DIR_NOMINA = 'src/app/dashboard/hr/payroll';

export function ficherosDePantallaDeNomina(raiz: string): string[] {
  const fs: string[] = [`${DIR_NOMINA}/page.tsx`];
  for (const sub of ['hooks', 'components']) {
    const d = join(raiz, DIR_NOMINA, sub);
    if (!existsSync(d)) continue;
    for (const n of readdirSync(d).sort()) {
      if (/\.tsx?$/.test(n)) fs.push(`${DIR_NOMINA}/${sub}/${n}`);
    }
  }
  return fs;
}

export function leerPantallaDeNomina(raiz: string): string {
  return ficherosDePantallaDeNomina(raiz).map((f) => readFileSync(join(raiz, f), 'utf8')).join('\n');
}
