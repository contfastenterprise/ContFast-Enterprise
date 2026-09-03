/**
 * El modo no se adivina, y el cartel no miente.
 *
 * ─── LO QUE HABIA ──────────────────────────────────────────────────────────
 *
 * OCHO sitios decidian el modo por descarte, y no coincidian entre ellos:
 *
 *     // middleware/auth.ts
 *     const environmentHeader = req.headers.get('x-environment') || 'PRODUCCION';
 *     const modo = environmentHeader === 'PRUEBA' ? 'PRUEBA' : 'PRODUCCION';
 *
 *     // dashboard/ClientLayout.tsx
 *     initialSettings.dgiiEnv === 'PRODUCCION' ? 'PRODUCCION' : 'PRUEBA';
 *
 * El MISMO valor desconocido caia a PRODUCCION en el middleware y a PRUEBA en
 * la pantalla. Y la del middleware es la que llega a `entornoDgii()`, que es el
 * segmento de la URL con la que se habla con mSeller: una cabecera ausente se
 * convertia en `eCF`, la DGII REAL.
 *
 * Es el patron de toda la auditoria en su version mas cara: un hueco tapado con
 * el peor valor por defecto disponible.
 *
 * ─── Y EL CARTEL ───────────────────────────────────────────────────────────
 *
 * Una empresa en CERTIFICACION caia a 'PRUEBA' en la linea de arriba -- todo lo
 * que no es 'PRODUCCION' cae ahi -- y luego una tercera rama le ponia la
 * insignia CERT. Operaba en pruebas con un cartel que decia Certificacion.
 *
 * Lo confirma el dato real: de las seis empresas, cinco en PRUEBA y una en
 * PRODUCCION. Ninguna en CERTIFICACION -- todavia.
 *
 * ─── Y UN TERCER FALLO, EL MISMO DIA DEL DESPLIEGUE ────────────────────────
 *
 * La primera version de este arreglo se paso de frenada: trato la cookie
 * `cf_environment` -- que escribe el NAVEGADOR, no nuestro codigo -- con el
 * mismo criterio estricto que la cabecera. Una cookie vieja (de una version
 * anterior, o simplemente rara) hacia LANZAR a la lectura, esa excepcion caia
 * dentro del `try` de `jwt.verify` en `middleware/auth.ts`, y su `catch` --
 * escrito solo para un token vencido -- la trataba como sesion invalida.
 *
 * Le paso a Latin Doors en produccion el mismo dia: pantalla de configuracion
 * vacia, insignia de PRUEBA, sin ningun error visible. La seccion 4 y la 7b
 * de este banco prueban justo eso: que una cookie que no se reconoce YA NO
 * puede tumbar la sesion.
 */
import {
  modoDePeticion,
  modoDeCookie,
  modoOperativo,
  esModoValido,
  MODOS_VALIDOS,
} from '../src/services/dgii/modoPeticion';
import { entornoDgii } from '../src/services/dgii/entorno';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const lanza = (fn: () => unknown) => {
  try { fn(); return false; } catch { return true; }
};

console.log('\n1) Lo que no es un modo, NO se interpreta\n');

// Cada uno de estos acababa siendo 'PRODUCCION' -> eCF -> la DGII de verdad.
for (const malo of [
  null, undefined, '', 'produccion', 'PRODUCCION ', 'test', 'production',
  'PRUEBAS', 'CERT', 'certificacion', 0, {}, [], true, 'eCF',
]) {
  ok(`${JSON.stringify(malo)} en la cabecera -> se para`,
    lanza(() => modoDePeticion(malo, 'la cabecera x-environment')));
}

console.log('\n2) Los tres modos validos pasan tal cual\n');

for (const bueno of MODOS_VALIDOS) {
  ok(`${bueno} pasa`, modoDePeticion(bueno, 'x') === bueno);
  ok(`${bueno} es reconocido`, esModoValido(bueno));
}
ok('y no hay un cuarto por la puerta de atras', MODOS_VALIDOS.length === 3);

console.log('\n3) El mensaje dice donde mirar\n');

try {
  modoDePeticion('test', 'la cookie cf_environment');
  ok('deberia haber lanzado', false);
} catch (e) {
  const m = String((e as Error).message);
  ok('nombra el origen', m.includes('la cookie cf_environment'));
  ok('nombra el valor que llego', m.includes('"test"'));
  ok('lista los validos', /PRUEBA.*CERTIFICACION.*PRODUCCION/.test(m));
  ok('y explica por que no se elige uno por defecto', /manda comprobantes al ambiente equivocado/.test(m));
}

console.log('\n4) LA COOKIE: nunca lanza. Ausente o rara, cae a PRUEBA igual\n');

// EL FALLO REAL, en produccion, el mismo dia del despliegue:
//
//   try {
//     const decoded = jwt.verify(accessToken, JWT_SECRET);
//     const reqModo = modoOperativo(modoEnLaPuerta(cookie, ...), ...);  // lanzaba
//     return { ...decoded, modo: reqModo };
//   } catch (err) {
//     if (err.name !== 'TokenExpiredError') return null;  // "sesion invalida"
//   }
//
// Una cookie `cf_environment` con CUALQUIER valor que no fuera exactamente
// 'PRUEBA' o 'PRODUCCION' hacia lanzar a `modoEnLaPuerta`. Ese `catch` estaba
// escrito para un token vencido, no para esto -- lo confundio con una sesion
// invalida y devolvio null. Resultado: Latin Doors, en produccion, con la
// pantalla de configuracion vacia y sin ningun error visible.
//
// La cookie la escribe el NAVEGADOR: puede faltar, puede quedar vieja, puede
// traer un valor de una version anterior. Nada de eso debe poder cerrar una
// sesion. `modoDeCookie` no lanza NUNCA.
for (const vacio of [undefined, null, '']) {
  ok(`${JSON.stringify(vacio)} de la cookie -> PRUEBA, sin lanzar`,
    modoDeCookie(vacio, 'la cookie') === 'PRUEBA');
}
ok('y PRUEBA lleva a TesteCF, no a eCF',
  entornoDgii(modoDeCookie(undefined, 'x')) === 'TesteCF');

// Esto es lo que antes lanzaba y tumbaba la sesion. Ahora no.
for (const raro of [
  'test', 'produccion', 'CERT', 'basura', 'PRUEBA ', ' PRODUCCION',
  'CERTIFICACION', 'Prueba', 'null', 'undefined',
]) {
  // Una sola llamada protegida: si mutara para volver a lanzar, la SEGUNDA
  // comprobacion (comparar el resultado) no debe reventar el banco entero --
  // eso ocultaria las FALLAS del resto del bucle en vez de mostrarlas todas.
  let resultado: string | null = null;
  const noLanzo = !lanza(() => { resultado = modoDeCookie(raro, 'la cookie'); });
  ok(`${JSON.stringify(raro)} en la cookie -> PRUEBA, NO lanza`, noLanzo);
  ok(`  ...y cae exactamente a PRUEBA`, noLanzo && resultado === 'PRUEBA');
}

// Los dos que si se soportan pasan tal cual. CERTIFICACION NO, aunque sea un
// modo valido en otros sitios: la cookie no debe poder pedir un modo que el
// sistema no sabe operar, y tampoco debe lanzar por pedirlo -- cae a PRUEBA.
ok('PRODUCCION pasa tal cual', modoDeCookie('PRODUCCION', 'x') === 'PRODUCCION');
ok('PRUEBA pasa tal cual', modoDeCookie('PRUEBA', 'x') === 'PRUEBA');
ok('CERTIFICACION no lanza, cae a PRUEBA', modoDeCookie('CERTIFICACION', 'x') === 'PRUEBA');

console.log('\n5) CERTIFICACION: reconocido, pero no soportado\n');

ok('es un modo valido', esModoValido('CERTIFICACION'));
ok('y entornoDgii sabe cual es su ambiente', entornoDgii('CERTIFICACION') === 'CerteCF');
ok('pero operar en el se para', lanza(() => modoOperativo('CERTIFICACION', 'x')));
ok('los dos que si se soportan pasan',
  modoOperativo('PRUEBA', 'x') === 'PRUEBA' && modoOperativo('PRODUCCION', 'x') === 'PRODUCCION');
try {
  modoOperativo('CERTIFICACION', 'los ajustes');
  ok('deberia haber lanzado', false);
} catch (e) {
  const m = String((e as Error).message);
  ok('el mensaje NO deja al usuario a oscuras', /todavia no esta soportado/.test(m));
  ok('y dice por que se prefiere pararlo', /seria peor/.test(m));
}

console.log('\n6) Ningun sitio decide el modo por descarte\n');

const SITIOS = [
  'src/middleware/auth.ts',
  'src/proxy.ts',
  'src/actions/payables.ts',
  'src/actions/receivables.ts',
  'src/app/dashboard/ClientLayout.tsx',
];
for (const f of SITIOS) {
  const src = fuente(f);
  ok(`${f.split('/').pop()}: sin "!== 'PRUEBA' -> PRODUCCION"`,
    !/=== 'PRUEBA' \? 'PRUEBA' : 'PRODUCCION'/.test(src));
  ok(`${f.split('/').pop()}: sin "|| 'PRODUCCION'" al leer el ambiente`,
    !/get\('x-environment'\) \|\| 'PRODUCCION'/.test(src)
    && !/get\('cf_environment'\)\?\.value \|\| .*\|\| 'PRODUCCION'/.test(src));
}

console.log('\n7) Cada sitio usa la lectura que le toca\n');

{
  const auth = fuente('src/middleware/auth.ts');
  // La cabecera la pone SIEMPRE el proxy: que falte es un fallo nuestro, no un
  // dato del usuario. Ahi si tiene sentido pararse.
  ok('auth: la cabecera se lee en modo estricto',
    /modoDePeticion\(req\.headers\.get\('x-environment'\), 'la cabecera x-environment'\)/.test(auth));
  ok('auth: y se acota a los modos operables (solo la cabecera)',
    (auth.match(/modoOperativo\(/g) || []).length === 1,
    String((auth.match(/modoOperativo\(/g) || []).length));

  // La cookie NUNCA debe poder lanzar -- las dos rutas por cookie usan la
  // version que no lanza, no la que se para.
  ok('auth: las DOS rutas por cookie usan modoDeCookie',
    (auth.match(/modoDeCookie\(req\.cookies\.get\('cf_environment'\)\?\.value/g) || []).length === 2,
    String((auth.match(/modoDeCookie\(req\.cookies\.get\('cf_environment'\)\?\.value/g) || []).length));
  ok('auth: y ninguna cookie pasa ya por modoEnLaPuerta (retirada)',
    !/modoEnLaPuerta/.test(auth.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

  const proxy = fuente('src/proxy.ts');
  ok('proxy: las dos puertas usan modoDeCookie',
    (proxy.match(/modoDeCookie\(/g) || []).length === 2,
    String((proxy.match(/modoDeCookie\(/g) || []).length));

  for (const f of ['src/actions/payables.ts', 'src/actions/receivables.ts']) {
    const src = fuente(f);
    ok(`${f.split('/').pop()}: usa modoDeCookie, no la que lanzaba`,
      /modoDeCookie\(cookieStore\.get\('cf_environment'\)\?\.value/.test(src));
  }
}

console.log('\n7b) EL FALLO EXACTO: una cookie rara ya no tumba la sesion\n');

// Reproduce el try/catch de verdad de `resolveAuthPayload`, en miniatura. El
// catch de jwt.verify solo debia perdonar un token vencido; una cookie rara se
// colaba por la misma puerta y la sesion entera se perdia.
function comoEraLaSesionAntes(cookieCruda: unknown): 'sesion valida' | 'sesion invalida (401)' {
  try {
    // jwt.verify no lanza aqui: el token es valido.
    //
    // La version vieja de la lectura de puerta (`modoEnLaPuerta`, ya retirada)
    // resolvia la ausencia a PRUEBA pero LANZABA con cualquier otra cosa -- el
    // mismo criterio que hoy tiene `modoDePeticion` para la cabecera.
    const esAusente = cookieCruda === undefined || cookieCruda === null || cookieCruda === '';
    const puerta = esAusente ? 'PRUEBA' : modoDePeticion(cookieCruda, 'la cookie cf_environment');
    // Y la lectura vieja tambien acotaba a los modos operables -- por eso
    // CERTIFICACION, aun siendo un modo "valido", tumbaba la sesion igual.
    modoOperativo(puerta, 'la cookie cf_environment');
    return 'sesion valida';
  } catch (err: any) {
    // El catch real solo miraba err.name !== 'TokenExpiredError'.
    if ((err?.name ?? 'Error') !== 'TokenExpiredError') return 'sesion invalida (401)';
    return 'sesion valida';
  }
}
function comoEsAhora(cookieCruda: unknown): 'sesion valida' | 'sesion invalida (401)' {
  try {
    modoDeCookie(cookieCruda, 'la cookie cf_environment'); // nunca lanza
    return 'sesion valida';
  } catch {
    return 'sesion invalida (401)';
  }
}

ok('ANTES: una cookie de una version vieja tumbaba la sesion (el fallo real)',
  comoEraLaSesionAntes('CERTIFICACION') === 'sesion invalida (401)');
ok('AHORA: la misma cookie deja la sesion viva',
  comoEsAhora('CERTIFICACION') === 'sesion valida');
ok('AHORA: cualquier basura en la cookie deja la sesion viva',
  ['test', 'basura', 'PRUEBA ', 'null'].every((v) => comoEsAhora(v) === 'sesion valida'));
ok('AHORA: y una cookie ausente tambien, como siempre',
  comoEsAhora(undefined) === 'sesion valida');

console.log('\n8) CERTIFICACION no se puede guardar\n');

// Se rechaza en la ENTRADA. Si se pudiera guardar, la empresa acabaria operando
// en pruebas con la insignia de certificacion -- que es justo lo que pasaba.
for (const f of [
  'src/app/api/v1/admin/settings/route.ts',
  'src/app/api/v1/setup/fiscal/route.ts',
  'src/app/api/v1/setup/confirm/route.ts',
]) {
  const src = fuente(f);
  ok(`${f.split('/').slice(-2).join('/')}: el enum ya no lo admite`,
    !/z\.enum\(\['PRUEBA', 'PRODUCCION', 'CERTIFICACION'\]/.test(src));
  ok(`${f.split('/').slice(-2).join('/')}: y lo dice con un mensaje`,
    /CERTIFICACION todavia no esta soportado/.test(src));
}

console.log('\n9) La insignia dice lo que el sistema va a hacer\n');

{
  const cl = fuente('src/app/dashboard/ClientLayout.tsx');
  ok('ya no hay una rama CERT que contradiga al modo',
    !/setEntorno\('CERT'\)/.test(cl));
  ok('la insignia sale del MISMO valor que decide el ambiente',
    /setEntorno\(targetEnv === 'PRODUCCION' \? 'PROD' : 'TEST'\)/.test(cl));
}

console.log('\n10) Y el consumidor sigue sin adivinar\n');

// entorno.ts ya lanzaba; lo que faltaba era que nadie le pasara basura.
ok('entornoDgii se para con un modo desconocido',
  lanza(() => entornoDgii('CERT' as never)));
ok('PRUEBA -> TesteCF', entornoDgii('PRUEBA') === 'TesteCF');
ok('PRODUCCION -> eCF', entornoDgii('PRODUCCION') === 'eCF');

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
