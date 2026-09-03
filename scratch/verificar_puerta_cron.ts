/**
 * El cron no tiene sesion de navegador. Nunca la tendra.
 *
 * LO QUE PASO
 * -----------
 * `/api/v1/cron/sincronizar-ecf` exige `Authorization: Bearer <CRON_SECRET>`
 * y comprueba eso por su cuenta -- ver `route.ts`. Pero el middleware
 * (`proxy.ts`) trata TODO `/api/v1/*` como ruta protegida por SESION: exige
 * la cookie `accessToken` (o `refreshToken`), y si no la encuentra devuelve su
 * propio 401 -- ANTES de que la peticion llegue a la ruta.
 *
 * Un disparador externo (cron-job.org, GitHub Actions) no manda cookies. La
 * cabecera `Authorization` que sí manda nunca llegaba a mirarse: el
 * middleware cortaba primero, con un mensaje de sesion ("Sesion no valida o
 * expirada") que no tiene nada que ver con el secreto que faltaba.
 *
 * Es el mismo patron de esta auditoria en su version mas simple: dos
 * candados en la misma puerta, y solo se probo el de dentro.
 *
 * EL ARREGLO
 * ----------
 * `/api/v1/cron/` se anade a la lista de rutas que el middleware deja pasar
 * SIN sesion -- junto a login, register, refresh y setup. Sigue limpiando las
 * cabeceras de identidad (nadie puede colarse fingiendo ser un usuario), pero
 * ya no exige cookie. La proteccion de verdad -- el CRON_SECRET -- sigue
 * intacta DENTRO de la ruta, sin tocar.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const proxy = fuente('src/proxy.ts');

console.log('\n1) El cron esta en la lista que NO exige sesion\n');

// La lista de exclusion es un solo `if` con varios `||`, entre el inicio de
// `proxy()` y la variable `isProtectedRoute` que arranca la seccion
// siguiente. Anclas de CODIGO, no de comentario -- `fuente()` quita los
// comentarios, asi que un texto de comentario aqui nunca se encontraria.
const inicioExclusion = proxy.indexOf('export async function proxy(');
const finExclusion = proxy.indexOf('const isProtectedRoute =');
ok('las anclas de la seccion aparecen y en orden',
  inicioExclusion !== -1 && finExclusion !== -1 && inicioExclusion < finExclusion);
const bloqueExclusion = proxy.slice(inicioExclusion, finExclusion);

ok("el bloque incluye pathname.startsWith('/api/v1/cron/')",
  /pathname\.startsWith\('\/api\/v1\/cron\/'\)/.test(bloqueExclusion));

console.log('\n2) Sigue limpiando las cabeceras de identidad\n');

// El cron es una condicion `||` mas DENTRO del mismo `if` que las demas
// exclusiones (login, register, setup...). Lo confirmamos mirando que el
// cierre `) {` que sigue a la condicion del cron abre el mismo bloque de
// sanitizado -- es decir, el cron no tiene un `return` propio antes de esa
// limpieza, hereda el bloque comun.
const desdeCron = bloqueExclusion.indexOf("pathname.startsWith('/api/v1/cron/')");
const cierreDelIf = bloqueExclusion.indexOf(') {', desdeCron);
// `fuente()` no borra los comentarios, los deja en blanco -- el hueco sigue
// contando caracteres. La ventana tiene que ser generosa para llegar al
// codigo real que hay despues.
const trasElCierre = bloqueExclusion.slice(cierreDelIf, cierreDelIf + 900);
ok('justo despues del cierre del if viene el sanitizado de cabeceras',
  /const sanitized = new Headers\(req\.headers\)/.test(trasElCierre));
ok('y borra x-user-id / x-company-id / x-user-role, igual que el resto',
  /'x-user-id'/.test(trasElCierre) && /'x-company-id'/.test(trasElCierre) && /'x-user-role'/.test(trasElCierre));

console.log('\n3) La ruta sigue exigiendo su propio secreto -- eso NO cambio\n');

const ruta = fuente('src/app/api/v1/cron/sincronizar-ecf/route.ts');
ok('sin CRON_SECRET configurado, la ruta se niega a arrancar (503)',
  /if \(!esperado \|\| esperado\.trim\(\) === ''\)/.test(ruta) && /status: 503/.test(ruta));
ok('exige "Authorization: Bearer <secreto>"',
  /cabecera\?\.startsWith\('Bearer '\)/.test(ruta));
ok('compara en tiempo constante (timingSafeEqual)',
  /timingSafeEqual/.test(ruta));
ok('un secreto que no coincide -> 401, no pasa nunca sin el',
  /if \(!secretoValido\(recibido, esperado\)\)/.test(ruta) && /status: 401/.test(ruta));

console.log('\n4) Nadie mas se cuela por esta rendija\n');

// El unico prefijo que se exime es /api/v1/cron/ -- ni /api/v1/admin, ni
// /api/v1/invoices, ni el resto. Si algun dia se anade OTRA ruta bajo
// /api/v1/cron/ sin su propio secreto, quedaria expuesta -- por eso el
// convenio importa: TODO lo que viva bajo /api/v1/cron/ debe protegerse a si
// mismo, como hace esta.
ok('el prefijo eximido es exactamente /api/v1/cron/, no algo mas ancho',
  /pathname\.startsWith\('\/api\/v1\/cron\/'\)/.test(bloqueExclusion)
  && !/pathname\.startsWith\('\/api\/v1\/'\)[^c]/.test(bloqueExclusion));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
