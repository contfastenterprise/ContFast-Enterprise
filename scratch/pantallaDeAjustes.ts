/**
 * La pantalla de Configuracion ENTERA, para los bancos que la leen.
 *
 * Hasta el lote 237 era un solo fichero (`settings/page.tsx`, 1.481 lineas) mas
 * la tarjeta de la portada. En el lote 238 se partio en `hooks/` y
 * `components/` sin cambiar lo que hace, y los seis bancos que leian la pagina
 * se quedaron mirando solo las pestanas. Este ayudante devuelve todo lo que
 * forma la pantalla. Mismo criterio que `pantallaDeCaja.ts` (lote 229).
 *
 * Tras partirla, lo que era `formData` es `a.formData` (el hook `useAjustes`),
 * lo de las cuentas puente va por `p.` y lo de los tipos de gasto por `g.`: las
 * expresiones de los bancos aceptan ese prefijo con `(?:a\.)?`, sin aflojar lo
 * demas.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DIR_AJUSTES = 'src/app/dashboard/settings';

export function ficherosDePantallaDeAjustes(raiz: string): string[] {
  const fs: string[] = [`${DIR_AJUSTES}/page.tsx`];
  for (const sub of ['hooks', 'components']) {
    const d = join(raiz, DIR_AJUSTES, sub);
    if (!existsSync(d)) continue;
    for (const n of readdirSync(d).sort()) {
      if (/\.tsx?$/.test(n)) fs.push(`${DIR_AJUSTES}/${sub}/${n}`);
    }
  }
  return fs;
}

export function leerPantallaDeAjustes(raiz: string): string {
  return ficherosDePantallaDeAjustes(raiz).map((f) => readFileSync(join(raiz, f), 'utf8')).join('\n');
}

/**
 * La misma pantalla, SIN el prefijo del hook: `a.formData` vuelve a ser
 * `formData`, `p.draftMappings` `draftMappings` y `g.typeCode` `typeCode`.
 *
 * Es para los bancos escritos cuando todo era un fichero: sus expresiones
 * nombran las variables a pelo, y reescribirlas una por una para aceptar el
 * prefijo era cambiar decenas de comprobaciones que no tienen nada que ver con
 * el corte. Lo que se pierde: estos bancos ya no distinguen `a.x` de `x`. No
 * vigilan eso -- lo vigila `tsc`, que no compila una variable que no existe.
 */
export function leerPantallaDeAjustesSinPrefijo(raiz: string): string {
  return leerPantallaDeAjustes(raiz).replace(/(?<![\w.$])[apg]\.(?=[A-Za-z_])/g, '');
}
