/**
 * Lote 177 -- recuperar la contraseña.
 *
 * NO EXISTIA. Quien la olvidaba tenia que pedirle a alguien con acceso a la
 * base que se la cambiara a mano. Y sin embargo la tabla `password_resets`
 * estaba en el esquema DESDE EL PRINCIPIO y con la forma correcta
 * (`token_hash`, `expires_at`, `used_at`), con CERO referencias en `src/`: 0
 * filas en PRODUCCION el 2026-09-21. Mismo caso que `notifications` antes del
 * lote 160 -- por eso este lote no lleva migracion.
 *
 * LO QUE SE VIGILA AQUI ES LA SEGURIDAD, y se EJECUTA:
 *   1. que el token no se guarde en claro;
 *   2. que caduque y se use una sola vez;
 *   3. que pedir el enlace no diga si la cuenta existe;
 *   4. que cambiar la contraseña cierre las sesiones abiertas.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const PEDIR = 'src/app/api/v1/auth/forgot-password/route.ts';
const CAMBIAR = 'src/app/api/v1/auth/reset-password/route.ts';
const LOGIN = 'src/app/auth/login/page.tsx';
const P_PEDIR = 'src/app/auth/forgot-password/page.tsx';
const P_CAMBIAR = 'src/app/auth/reset-password/page.tsx';

async function main() {
  // Precondicion que vale en los DOS estados: la tabla ya estaba.
  const esquema = leer('src/db/schema/auth.ts');
  if (!/export const passwordResets = pgTable\('password_resets'/.test(esquema)) {
    throw new Error('Precondicion: la tabla password_resets ya no esta en el esquema');
  }
  if (!/tokenHash: varchar\('token_hash'/.test(esquema)) {
    throw new Error('Precondicion: password_resets ya no guarda un hash del token');
  }
  // Precondicion y no comprobacion: la tabla ya traia caducidad y un solo uso
  // ANTES del lote, asi que como `ok()` seria un OK de balde. Lo que vigila es
  // que nadie se las quite creyendo que no se usan.
  if (!/expiresAt: timestamp\('expires_at'\)/.test(esquema) || !/usedAt: timestamp\('used_at'\)/.test(esquema)) {
    throw new Error('Precondicion: password_resets ya no tiene caducidad o marca de uso');
  }
  console.log('  pre   password_resets ya existia, con hash, caducidad y un solo uso');

  console.log('\n1) El token: la parte que protege\n');
  let R: typeof import('../src/services/auth/recuperarAcceso') | null = null;
  try { R = await import('../src/services/auth/recuperarAcceso'); } catch { R = null; }

  if (!R) {
    for (const t of [
      'cada token es distinto',
      'el token tiene entropia suficiente',
      'lo que se guarda NO es el token',
      'el mismo token da siempre el mismo hash',
      'el enlace caduca',
      'un enlace ya usado no sirve',
      'un enlace caducado no sirve',
      'un enlace que no existe no sirve',
      'un enlace vivo si sirve',
      'la respuesta al pedir el enlace no dice si la cuenta existe',
    ]) falta(t, 'no existe services/auth/recuperarAcceso.ts');
  } else {
    const { generarToken, hashDelToken, mismoToken, caducidad, motivoParaNoUsarElEnlace,
      MINUTOS_DE_VIGENCIA, RESPUESTA_NEUTRA, esquemaNuevaContrasena, enlaceDeRecuperacion } = R;

    const muestras = Array.from({ length: 200 }, () => generarToken());
    ok('cada token es distinto', new Set(muestras.map((m) => m.token)).size === 200);
    // 32 bytes en base64url son 43 caracteres. Un token corto se puede probar a
    // fuerza bruta contra un indice.
    ok('el token tiene entropia suficiente (32 bytes)',
      muestras.every((m) => m.token.length >= 43), String(muestras[0].token.length));
    ok('  y no lleva caracteres que una URL tenga que escapar',
      muestras.every((m) => /^[A-Za-z0-9_-]+$/.test(m.token)));

    // LA propiedad: quien lea la base no puede entrar con lo que ve.
    ok('lo que se guarda NO es el token', muestras.every((m) => m.hash !== m.token));
    ok('  sino su hash, de 64 caracteres hexadecimales',
      muestras.every((m) => /^[0-9a-f]{64}$/.test(m.hash)));
    ok('el mismo token da siempre el mismo hash',
      hashDelToken('abc') === hashDelToken('abc') && hashDelToken('abc') !== hashDelToken('abd'));
    ok('comparar dos tokens no depende de cuanto coinciden',
      mismoToken('abc', 'abc') === true && mismoToken('abc', 'abd') === false && mismoToken('abc', 'abcd') === false);

    const ahora = new Date('2026-09-21T12:00:00Z');
    ok('el enlace caduca', caducidad(ahora).getTime() === ahora.getTime() + MINUTOS_DE_VIGENCIA * 60_000);
    ok('  en una hora, no en un dia', MINUTOS_DE_VIGENCIA === 60, String(MINUTOS_DE_VIGENCIA));

    const vivo = { expiresAt: new Date(ahora.getTime() + 60_000), usedAt: null };
    ok('un enlace vivo si sirve', motivoParaNoUsarElEnlace(vivo, ahora) === null);
    const usado = motivoParaNoUsarElEnlace({ ...vivo, usedAt: new Date() }, ahora);
    ok('un enlace ya usado no sirve', !!usado && /ya se usó/.test(usado), String(usado));
    const caducado = motivoParaNoUsarElEnlace({ expiresAt: new Date(ahora.getTime() - 1), usedAt: null }, ahora);
    ok('un enlace caducado no sirve', !!caducado && /caducó/.test(caducado), String(caducado));
    ok('  y justo al vencer, tampoco (el borde cuenta como caducado)',
      motivoParaNoUsarElEnlace({ expiresAt: ahora, usedAt: null }, ahora) !== null);
    ok('un enlace que no existe no sirve', !!motivoParaNoUsarElEnlace(null, ahora));
    ok('  ni uno con fecha ilegible',
      !!motivoParaNoUsarElEnlace({ expiresAt: 'no es una fecha', usedAt: null }, ahora));

    ok('la respuesta al pedir el enlace no dice si la cuenta existe',
      /Si ese correo pertenece a una cuenta/.test(RESPUESTA_NEUTRA));

    // La contraseña nueva no puede ser mas exigente que la del acceso, o habria
    // cuentas imposibles de recuperar.
    const nueva = (password: string, confirmacion: string) =>
      esquemaNuevaContrasena.safeParse({ token: 't', password, confirmacion });
    ok('la contraseña nueva exige lo mismo que el acceso (6)', nueva('12345', '12345').success === false
      && nueva('123456', '123456').success === true);
    const noCoincide = nueva('123456', '1234567');
    ok('dos contraseñas distintas se rechazan, señalando la confirmacion',
      !noCoincide.success && noCoincide.error.issues[0].path[0] === 'confirmacion');
    ok('sin token no se acepta', nueva('123456', '123456').success && !esquemaNuevaContrasena.safeParse(
      { token: '', password: '123456', confirmacion: '123456' }).success);

    ok('el enlace apunta a la pantalla de cambiar la contraseña',
      enlaceDeRecuperacion('https://x.do', 'abc') === 'https://x.do/auth/reset-password?token=abc');
    ok('  sin duplicar la barra si la base ya la trae',
      enlaceDeRecuperacion('https://x.do/', 'abc') === 'https://x.do/auth/reset-password?token=abc');
    ok('  y escapando el token', enlaceDeRecuperacion('https://x.do', 'a b+c').includes('a%20b%2Bc'));
  }

  console.log('\n1-bis) Solo administracion se recupera sola\n');
  if (!R || !('puedeRecuperarSolo' in R)) {
    for (const t of [
      'administracion y sistemas se recuperan solos',
      'un cajero no',
      'y un rol con nombre parecido tampoco',
      'la ruta lo comprueba, y sale por el mismo sitio',
    ]) falta(t, 'recuperarAcceso.ts no exporta puedeRecuperarSolo');
  } else {
    const { puedeRecuperarSolo } = R;
    ok('administracion y sistemas se recuperan solos',
      puedeRecuperarSolo('administracion') && puedeRecuperarSolo('sistemas'));
    ok('un cajero no', !puedeRecuperarSolo('cajero') && !puedeRecuperarSolo('vendedor'));
    // Comparacion EXACTA (P0-02): con `includes`, "admin de ventas" pasaria.
    ok('y un rol con nombre parecido tampoco',
      !puedeRecuperarSolo('administracion de ventas') && !puedeRecuperarSolo('sistemas de inventario'));
    ok('  ni un rol vacio', !puedeRecuperarSolo('') && !puedeRecuperarSolo(null) && !puedeRecuperarSolo(undefined));
  }

  console.log('\n2) Pedir el enlace no dice quien tiene cuenta\n');
  const pedir = leer(PEDIR);
  const pedirCodigo = sinComentarios(pedir);
  ok('la ruta existe y responde siempre lo mismo', /const neutra = NextResponse\.json\(\{ success: true, message: RESPUESTA_NEUTRA \}\)/.test(pedir));
  ok('  tambien si la cuenta no existe o esta inactiva',
    /if \(!user \|\| user\.status !== 'active'\) return neutra;/.test(pedir));
  ok('  y tambien si falla la base o el correo',
    /catch \(err: unknown\) \{[\s\S]{0,400}?Logger\.error/.test(pedir) && /return neutra;\s*\}\s*$/m.test(pedirCodigo.trim() + '\n'));
  // Un 404 o un mensaje distinto delataria la cuenta igual que un texto.
  // Sin la ruta, la negacion es cierta de balde: va unida a que la ruta exista.
  ok('no hay ninguna respuesta de "no encontrado"',
    pedir.length > 0 && !/NOT_FOUND/.test(pedirCodigo) && !/status: 404/.test(pedirCodigo));
  ok('lleva freno de intentos, del tipo que se aplica aunque Redis falle',
    /checkRateLimit\(ip, 'auth'\)/.test(pedir));
  ok('guarda el HASH, nunca el token', /tokenHash: hash/.test(pedir) && !/tokenHash: token/.test(pedirCodigo));
  ok('pedir uno nuevo invalida el anterior',
    /\.update\(passwordResets\)[\s\S]{0,200}?set\(\{ usedAt: new Date\(\) \}\)[\s\S]{0,200}?isNull\(passwordResets\.usedAt\)/.test(pedir));
  ok('el correo va directo, no por la cola (que depende de Redis)',
    /getTransporter/.test(pedir) && !/queue|bullmq/i.test(pedirCodigo));
  ok('sin APP_URL no se inventa un enlace roto', /falta APP_URL/.test(pedir));
  ok('quien no es administracion no recibe enlace, y sale por el MISMO sitio',
    /if \(!puedeRecuperarSolo\(user\.rol\)\) return neutra;/.test(pedir));
  // Si el corte fuera despues de mandar el correo, no cortaria nada.
  ok('  y se comprueba ANTES de crear el token y de enviar',
    pedir.indexOf('puedeRecuperarSolo(user.rol)') < pedir.indexOf('generarToken()')
    && pedir.indexOf('puedeRecuperarSolo(user.rol)') < pedir.indexOf('enviarElEnlace('));

  console.log('\n2-bis) Administracion cambia la contraseña de cualquiera\n');
  const admin = leer('src/repositories/adminRepository.ts');
  // "Ya existia" es cierto antes del lote: va unido a lo que este añade, que es
  // que ademas cierre las sesiones. Lo que se afirma no es que exista, sino que
  // existe Y ya no deja a nadie dentro.
  ok('ya existia el camino para asignarla', /updateData\.passwordHash = await bcrypt\.hash/.test(admin)
    && /const cambiaLaClave = /.test(admin));
  // Esto es lo que faltaba: se cambiaba la clave y quien tuviera la sesion
  // abierta seguia dentro, incluido el motivo por el que se le cambia.
  // El cierre va PEGADO a su guarda, no solo presente en el fichero: un
  // mutante que cambiara la condicion por `false` dejaba el codigo entero
  // intacto y estas comprobaciones lo daban por bueno. Lo cazo el mutante.
  ok('y ahora cierra las sesiones de esa persona',
    /if \(cambiaLaClave\) \{\s*await tx\.update\(sessions\)[\s\S]{0,200}?invalidatedAt: new Date\(\)[\s\S]{0,200}?isNull\(sessions\.invalidatedAt\)/.test(admin));
  ok('  solo si de verdad cambio la contraseña',
    /const cambiaLaClave = !!\(data\.passwordRaw && data\.passwordRaw\.trim\(\)\.length >= 6\)/.test(admin)
    && /if \(cambiaLaClave\) \{\s*await tx\.update\(sessions\)/.test(admin));
  ok('  dentro de la misma transaccion',
    admin.indexOf('tx.update(sessions)') > admin.indexOf('db.transaction')
    && admin.indexOf('tx.update(sessions)') < admin.indexOf('tx.insert(auditLogs)'));
  ok('  y queda registrado quien lo hizo', /action: 'password_reset_admin'/.test(admin)
    && /userId: actorId \?\? userId/.test(admin));
  ok('la ruta le pasa quien lo hace',
    /AdminRepository\.updateUser\(params\.id, session\.companyId, parsed\.data, session\.userId\)/.test(leer('src/app/api/v1/admin/users/[id]/route.ts')));
  ok('  y sigue exigiendo permiso de administracion, y ahora tambien el actor',
    /enforcePermission\([^)]*'administracion', 'write'\)/.test(leer('src/app/api/v1/admin/users/[id]/route.ts'))
    && /parsed\.data, session\.userId\)/.test(leer('src/app/api/v1/admin/users/[id]/route.ts')));

  console.log('\n3) Cambiar la contraseña\n');
  const cambiar = leer(CAMBIAR);
  const cambiarCodigo = sinComentarios(cambiar);
  ok('busca por el hash, no por el token', /eq\(passwordResets\.tokenHash, hashDelToken\(datos\.token\)\)/.test(cambiar));
  ok('aplica la regla del enlace antes de nada', /motivoParaNoUsarElEnlace\(reset\)/.test(cambiar));
  ok('la contraseña se guarda cifrada', /bcrypt\.hash\(datos\.password, 10\)/.test(cambiar));
  ok('una cuenta inactiva no se reactiva cambiando la contraseña',
    /user\.status !== 'active'/.test(cambiar));
  // Las tres cosas en una transaccion: cambiar la clave y no marcar el enlace
  // dejaria un enlace que sirve para volver a cambiarla.
  ok('cambiar la contraseña y gastar el enlace van juntos',
    /db\.transaction\(async \(tx\) => \{[\s\S]*?\.update\(users\)[\s\S]*?\.update\(passwordResets\)/.test(cambiar));
  ok('y se cierran las sesiones abiertas',
    /\.update\(sessions\)[\s\S]{0,200}?invalidatedAt: new Date\(\)[\s\S]{0,200}?isNull\(sessions\.invalidatedAt\)/.test(cambiar));
  // `tx.insert(auditLogs)`, no `auditLogs` a secas: a secas lo encuentra en la
  // linea del `import`, que esta antes de todo, y la comparacion no medía nada.
  ok('  dentro de la misma transaccion',
    cambiar.indexOf('tx.update(sessions)') > cambiar.indexOf('db.transaction')
    && cambiar.indexOf('tx.update(sessions)') < cambiar.indexOf('tx.insert(auditLogs)'));
  ok('queda registrado quien lo hizo y cuando', /action: 'password_reset'/.test(cambiar));
  ok('lleva el mismo freno de intentos', /checkRateLimit\(ip, 'auth'\)/.test(cambiar));

  console.log('\n4) Las pantallas\n');
  const login = sinComentarios(leer(LOGIN));
  ok('el acceso ofrece recuperar la contraseña',
    /href="\/auth\/forgot-password"/.test(login) && /¿Olvidó su contraseña\?/.test(login));
  const pPedir = leer(P_PEDIR);
  ok('la pantalla de pedir el enlace existe', pPedir.length > 0);
  ok('  y enseña LA frase del servidor, sin añadirle nada',
    /setEnviado\(data\.message as string\)/.test(pPedir));
  ok('  anunciada a los lectores de pantalla', /role="status"/.test(pPedir));
  const pCambiar = leer(P_CAMBIAR);
  ok('la pantalla de cambiarla existe', pCambiar.length > 0);
  ok('  pide la confirmacion', /register\('confirmacion'\)/.test(pCambiar));
  ok('  avisa de que se cerraran las sesiones', /se cerrarán las sesiones/.test(pCambiar));
  ok('  y sin token no enseña un formulario que va a fallar',
    /if \(!token\) \{/.test(sinComentarios(pCambiar)));
  ok('  al terminar lleva al acceso, no al panel',
    /router\.push\('\/auth\/login'\)/.test(pCambiar));
  // `useSearchParams` sin Suspense rompe el build de Next.
  ok('la pantalla del enlace tiene su limite de Suspense', /<Suspense/.test(pCambiar));

  console.log('\n5) Sin migracion: la tabla ya estaba\n');
  const migraciones = leer('drizzle/meta/_journal.json');
  // La negacion sola es cierta antes del lote (no habia nada), asi que va unida
  // a que el mecanismo SI exista: lo que se afirma es "esto funciona y ademas
  // no hizo falta tocar la base".
  ok('el mecanismo funciona sin una migracion nueva',
    !/password_reset/i.test(migraciones) && /tokenHash: hash/.test(pedir), 'el diario menciona password_reset');

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
