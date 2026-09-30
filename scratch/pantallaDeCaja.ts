/**
 * La pantalla de caja ENTERA, para los bancos que la leen.
 *
 * Hasta el lote 228 era un solo fichero (`cash/page.tsx`, 1.629 lineas). En el
 * lote 229 se partio en `caja.ts`, `components/` y `hooks/` sin cambiar lo que
 * hace, y los cinco bancos que leian la pagina se quedaron mirando solo las
 * pestanas. Este ayudante devuelve todo lo que forma la pantalla, en los dos
 * estados: antes del 229 solo existe la pagina y el resultado es ella.
 *
 * Tras partirla, lo que era `session` es `c.session` (el hook `useCaja`) y lo
 * del historico va por `h.` (`useHistorialCaja`): las expresiones de los bancos
 * aceptan ese prefijo con `(?:c\.)?` / `(?:h\.)?`, sin aflojar lo demas.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DIR_CAJA = 'src/app/dashboard/cash';

export function ficherosDePantallaDeCaja(raiz: string): string[] {
  const fs: string[] = [`${DIR_CAJA}/page.tsx`];
  if (existsSync(join(raiz, DIR_CAJA, 'caja.ts'))) fs.push(`${DIR_CAJA}/caja.ts`);
  for (const sub of ['hooks', 'components']) {
    const d = join(raiz, DIR_CAJA, sub);
    if (!existsSync(d)) continue;
    for (const n of readdirSync(d).sort()) {
      if (/\.tsx?$/.test(n)) fs.push(`${DIR_CAJA}/${sub}/${n}`);
    }
  }
  return fs;
}

export function leerPantallaDeCaja(raiz: string): string {
  return ficherosDePantallaDeCaja(raiz).map((f) => readFileSync(join(raiz, f), 'utf8')).join('\n');
}
