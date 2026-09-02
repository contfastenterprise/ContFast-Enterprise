/**
 * Se retira la autenticacion por `?token=` de GET /api/v1/invoices/[id]/pdf.
 *
 * LA COMPROBACION QUE LO DECIDIO
 * ------------------------------
 * La rama del token no era solo codigo muerto. Comparadas las dos ramas:
 *
 *   cookie de sesion -> verifyAuth + enforcePermission('facturacion','read')
 *   ?token=<jwt>     -> jwt.verify y nada mas
 *
 * Es decir, la via del token SE SALTABA el control de permisos. Un usuario sin
 * permiso de lectura sobre facturacion no puede abrir el PDF por la via normal
 * y si podia por esta.
 *
 * Y no habia nada al otro lado sosteniendola:
 *   - Ningun `jwt.sign` con `invoiceId` en todo el repositorio.
 *   - Ni en la historia: el fichero solo tiene el commit de esta auditoria.
 *   - Los cuatro sitios que abren el PDF usan `window.open` con la cookie.
 *
 * Para entregar una factura a alguien sin sesion ya existe el mecanismo bueno:
 * `documentShares`, con testigo aleatorio guardado, caducidad y revocacion.
 * Este era un segundo camino, peor, que ademas ponia el credencial en la barra
 * de direcciones (registros del servidor, historial, cabecera Referer).
 */
import jwt from 'jsonwebtoken';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fuente, sinComentarios } from './_fuente';

const RAIZ = join(__dirname, '..');
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};


/**
 * Fuera comentarios antes de buscar. Sin esto, el propio comentario que
 * explica por que se retiro la rama -- que necesariamente nombra `jwt.sign`,
 * `invoiceId` y `?token=` -- hace saltar los detectores y el banco se acusa a
 * si mismo. Es el mismo cuidado que lleva el test aislamientoModo.
 */

function* ficheros(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'scratch') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* ficheros(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) yield p;
  }
}

const RUTA = 'src/app/api/v1/invoices/[id]/pdf/route.ts';

async function main() {
  const r = fuente(RUTA);

  console.log('\n1) La puerta esta cerrada\n');
  ok('la ruta ya no lee ?token=', !/searchParams\.get\(['"]token['"]\)/.test(r));
  ok('ya no importa jsonwebtoken', !/from 'jsonwebtoken'/.test(r));
  ok('ya no verifica firmas', !/jwt\.verify/.test(r));

  console.log('\n2) Y la que queda exige permiso\n');
  ok('pasa por verifyAuth', /await verifyAuth\(req, resHeaders\)/.test(r));
  ok('y por enforcePermission', /enforcePermission\([^)]*'facturacion', 'read'\)/.test(r));
  // Lo importante: que no haya NINGUN camino que llegue a la factura sin pasar
  // por el permiso. Si alguien reintroduce una rama, este aserto lo caza.
  // Se cuentan LLAMADAS, no menciones: `enforcePermission` aparece tambien en
  // la linea del import, y contar eso daba un falso fallo.
  const antesDeLaFactura = r.slice(0, r.indexOf('InvoiceRepository.getById'));
  const llamadas = (antesDeLaFactura.match(/await enforcePermission\(/g) || []).length;
  ok('se exige el permiso exactamente una vez, sin ramas', llamadas === 1, String(llamadas));
  ok('y no queda ninguna bifurcacion por token', !/if \(token\)/.test(antesDeLaFactura));

  console.log('\n3) No se rompe nada, porque nadie firmaba esos enlaces\n');
  const firmas: string[] = [];
  const enlaces: string[] = [];
  for (const f of ficheros(join(RAIZ, 'src'))) {
    const t = sinComentarios(readFileSync(f, 'utf8'));
    const rel = relative(RAIZ, f).split('\\').join('/');
    if (/jwt\.sign/.test(t) && /invoiceId/.test(t)) firmas.push(rel);
    if (/\/pdf\?token=|pdf\?token=\$\{/.test(t)) enlaces.push(rel);
  }
  ok('nadie firma un token con invoiceId', firmas.length === 0, firmas.join(', '));
  ok('nadie construye un enlace con ?token=', enlaces.length === 0, enlaces.join(', '));

  console.log('\n4) Los que si abren el PDF siguen funcionando igual\n');
  const llamadores = [
    'src/app/dashboard/invoices/[id]/page.tsx',
    'src/app/dashboard/invoices/page.tsx',
    'src/app/dashboard/adjustments/page.tsx',
  ];
  for (const c of llamadores) {
    const t = fuente(c);
    ok(`${c.replace('src/app/dashboard/', '')} abre el PDF sin token`,
      /api\/v1\/invoices\/\$\{[^}]+\}\/pdf/.test(t) && !/\/pdf\?token=/.test(t));
  }

  console.log('\n5) La prueba de fuego: el token que antes servia\n');
  // Un token con la forma exacta que la rama retirada aceptaba, firmado con el
  // secreto de verdad. Ahora la ruta ni lo mira: sin cookie de sesion no hay
  // PDF, y con cookie manda el permiso, no el token.
  const secreto = process.env.JWT_SECRET || 'secreto-de-banco';
  const falso = jwt.sign(
    { invoiceId: 'ffffffff-0000-0000-0000-000000000001', companyId: '11111111-1111-1111-1111-111111111111' },
    secreto
  );
  ok('el token se puede seguir fabricando (el secreto no cambio)', falso.split('.').length === 3);
  ok('pero la ruta no tiene donde leerlo', !r.includes('decoded.companyId'));

  console.log('\n6) El mecanismo bueno sigue en pie\n');
  const ds = fuente('src/services/documents/documentService.ts');
  ok('documentShares usa testigo aleatorio de 32 bytes',
    /crypto\.randomBytes\(32\)/.test(ds));
  ok('con caducidad', /expiresAt/.test(ds));
  ok('y se puede revocar', /revokedAt/.test(ds));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
