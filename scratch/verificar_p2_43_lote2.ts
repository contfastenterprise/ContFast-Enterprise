/**
 * P2-43 lote 2: la configuracion vieja que se sigue sirviendo.
 *
 * `getSettings` cachea la configuracion de la empresa en Redis 24 HORAS, y ahi
 * dentro van el ambiente DGII y las credenciales de mSeller. Quien la cambia
 * tiene que tirar esa copia. Habia tres agujeros distintos:
 *
 *   1. LA INVALIDACION FALLABA EN SILENCIO Y LA RUTA DECIA QUE SI.
 *      `admin/settings` guardaba, intentaba `delCache`, y si eso lanzaba, el
 *      `console.error` se lo tragaba y devolvia `success: true`. Cambias la
 *      clave de mSeller porque la vieja quedo revocada y la aplicacion sigue
 *      firmando con la vieja hasta 24 horas, con todos los e-CF fallando. O
 *      cambias de certificacion a produccion y sigues emitiendo contra el
 *      entorno que no es. Y te dijeron que se guardo.
 *
 *   2. `updateLogoUrl` NO INVALIDABA NADA. No es un catch silencioso: es que no
 *      habia ni catch. El logo nuevo no salia en los comprobantes hasta que
 *      caducara la copia.
 *
 *   3. LA COPIA CORRUPTA SE QUEDABA. En `expenses/types`, un JSON cacheado
 *      ilegible caia a la base -- correcto -- pero la clave envenenada seguia
 *      ahi, asi que la MISMA excepcion se repetia en cada peticion durante el
 *      resto del TTL.
 *
 * La invalidacion pasa a vivir en un solo sitio, `CompanyRepository`, para que
 * nadie pueda actualizar la configuracion y olvidarse -- que es justo lo que le
 * paso a `updateLogoUrl`.
 *
 * Contra el HEAD anterior: las 9 fallan.
 */
import { fuente as fuenteCruda, crudo as crudoCrudo, bloque } from './_fuente';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const fuente = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');
const crudo = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const REPO = 'src/repositories/companyRepository.ts';

// ─── la invalidacion, en un solo sitio ──────────────────────────────────
{
  const src = fuente(REPO);
  const b = bloque(src, 'static async invalidarCacheDeConfiguracion(');

  // Que no lance es lo que la hace llamable desde donde hace falta: siempre
  // despues de que el guardado ya salio bien.
  ok('la invalidacion vive en un solo sitio, devuelve si borro y NUNCA lanza',
    src.includes('static async invalidarCacheDeConfiguracion(companyId: string): Promise<boolean> {')
    && b.includes('return true;') && b.includes('return false;')
    && b.includes('await registrarFalloSilencioso({')
    && !b.includes('throw'));

  ok('la clave de la cache se escribe en un solo sitio',
    src.includes('private static claveDeCache(companyId: string): string {')
    && src.includes('const cacheKey = this.claveDeCache(companyId);'));

  ok('updateLogoUrl POR FIN tira la copia (antes no habia ni catch)',
    bloque(src, 'static async updateLogoUrl(').includes('await this.invalidarCacheDeConfiguracion(companyId);'));

  ok('leer o cachear mal la configuracion dice de que empresa habla',
    !src.includes("console.error('Failed to get settings cache:'")
    && !src.includes("console.error('Failed to set settings cache:'")
    && src.includes('no se pudo leer la cache de configuracion; se lee de la base')
    && src.includes('no se pudo cachear la configuracion'));
}

// ─── las rutas avisan en vez de callarse ────────────────────────────────
{
  const s = fuente('src/app/api/v1/admin/settings/route.ts');
  ok('admin/settings: el fallo de invalidacion sube como aviso, no como silencio',
    s.includes('const seInvalido = await CompanyRepository.invalidarCacheDeConfiguracion(session.companyId);')
    && s.includes("message: 'Configuración actualizada', avisos });")
    && crudo('src/app/api/v1/admin/settings/route.ts').includes('pueden tardar ')
    && !s.includes('delCache'));

  const d = fuente('src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts');
  ok('clear-sandbox: mismo trato',
    d.includes('const seInvalido = await CompanyRepository.invalidarCacheDeConfiguracion(companyId);')
    && d.includes('avisos,')
    && !d.includes('delCache'));
}

// ─── la pantalla lo ensena ──────────────────────────────────────────────
{
  const p = fuente('src/app/dashboard/settings/page.tsx');
  ok('la pantalla de configuracion ensena el aviso (guardar != surtir efecto)',
    p.includes('for (const aviso of (data.avisos ?? []) as string[]) {')
    && p.includes('toast.warning(aviso, { duration: 12000 });'));
}

// ─── la copia ilegible no se queda ──────────────────────────────────────
{
  const e = fuente('src/app/api/v1/expenses/types/route.ts');
  ok('la copia ilegible se tira en vez de repetir el mismo fallo todo el TTL',
    e.includes('await delCache(cacheKey).catch(() => {});')
    && crudo('src/app/api/v1/expenses/types/route.ts').includes('cache ilegible; se tira la clave y se lee de la base')
    && !e.includes("console.error('Failed to parse cached expense types:'"));
}

// ─── y que nadie vuelva a armar la clave por su cuenta ──────────────────
{
  // Esta es la que impide que el arreglo se deshaga solo: mientras la clave se
  // escriba en un unico sitio, no se puede borrar "la de al lado" por error.
  const raiz = join(__dirname, '..');
  const encontrados: string[] = [];
  const recorrer = (dir: string): void => {
    for (const n of readdirSync(dir)) {
      const ruta = join(dir, n);
      if (statSync(ruta).isDirectory()) { recorrer(ruta); continue; }
      if (!/\.tsx?$/.test(n)) continue;
      if (readFileSync(ruta, 'utf8').includes('company_settings:')) {
        encontrados.push(ruta.slice(raiz.length + 1).replace(/\\/g, '/'));
      }
    }
  };
  recorrer(join(raiz, 'src'));
  ok('nadie fuera del repositorio arma la clave de la cache a mano',
    encontrados.length === 1 && encontrados[0] === REPO);
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
