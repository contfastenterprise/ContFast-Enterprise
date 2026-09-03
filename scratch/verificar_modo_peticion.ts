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
 */
import {
  modoDePeticion,
  modoEnLaPuerta,
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

console.log('\n4) LA PUERTA: la ausencia cae a PRUEBA, no a la DGII real\n');

// El unico sitio donde faltar es normal: la cookie no existe hasta que el panel
// la escribe. Lo que cambia es hacia donde cae.
for (const vacio of [undefined, null, '']) {
  ok(`${JSON.stringify(vacio)} en la puerta -> PRUEBA`,
    modoEnLaPuerta(vacio, 'la cookie') === 'PRUEBA');
}
ok('y PRUEBA lleva a TesteCF, no a eCF',
  entornoDgii(modoEnLaPuerta(undefined, 'x')) === 'TesteCF');

// Presente pero desconocido NO es una ausencia: es un dato corrupto.
for (const malo of ['test', 'produccion', 'CERT', 'basura']) {
  ok(`${JSON.stringify(malo)} en la puerta -> se para igual`,
    lanza(() => modoEnLaPuerta(malo, 'la cookie')));
}
// Y los validos siguen pasando por la puerta.
for (const bueno of MODOS_VALIDOS) {
  ok(`${bueno} pasa la puerta`, modoEnLaPuerta(bueno, 'x') === bueno);
}

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
  // La cabecera la pone SIEMPRE el proxy: que falte es un fallo, no un cliente nuevo.
  ok('auth: la cabecera se lee en modo estricto',
    /modoDePeticion\(req\.headers\.get\('x-environment'\), 'la cabecera x-environment'\)/.test(auth));
  // La cookie puede faltar de verdad.
  ok('auth: la cookie se lee como puerta',
    (auth.match(/modoEnLaPuerta\(req\.cookies\.get\('cf_environment'\)\?\.value/g) || []).length === 2,
    String((auth.match(/modoEnLaPuerta\(req\.cookies\.get\('cf_environment'\)\?\.value/g) || []).length));
  ok('auth: y se acota a los modos operables',
    (auth.match(/modoOperativo\(/g) || []).length === 3,
    String((auth.match(/modoOperativo\(/g) || []).length));

  const proxy = fuente('src/proxy.ts');
  ok('proxy: las dos puertas usan modoEnLaPuerta',
    (proxy.match(/modoEnLaPuerta\(/g) || []).length === 2,
    String((proxy.match(/modoEnLaPuerta\(/g) || []).length));
}

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
