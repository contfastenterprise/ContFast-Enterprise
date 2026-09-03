/**
 * Fase B -- lote de bajo riesgo: P1-15, P1-16, P1-17, P1-21, P1-22.
 *
 * P1-15: GET /api/v1/company/settings no exigia permiso y exponia las
 *        credenciales de mSeller (correo + blobs cifrados) tal cual.
 * P1-16: AdminRepository.updateUser/toggleUserStatus -- UPDATE final sin
 *        repetir companyId (defensa en profundidad; el SELECT previo ya
 *        filtraba, asi que no habia via de explotacion demostrada).
 * P1-17: BIRepository.getCustomerStats no filtraba por modo en dos
 *        consultas, a diferencia del resto del archivo.
 * P1-21: setup/confirm y setup/recover devolvian error.message crudo a un
 *        visitante sin sesion.
 * P1-22: setup/recover no estaba en la lista de exclusion de sesion de
 *        proxy.ts, pese a estar disenada para funcionar sin sesion valida.
 *
 * Banco de solo-codigo (no toca la base de datos).
 */
import { fuente, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n=== P1-15: company/settings sin permiso ni filtro de credenciales mSeller ===\n');

const settingsRoute = fuente('src/app/api/v1/company/settings/route.ts');

ok('importa enforcePermission', /from '@\/middleware\/permissions'/.test(settingsRoute));
ok("exige enforcePermission(..., 'administracion', 'read')",
  /enforcePermission\(session\.userId, session\.role, session\.roleId, session\.companyId, 'administracion', 'read'\)/.test(settingsRoute));
ok('desestructura y descarta msellerApiKeyEncrypted, msellerEmail y msellerPasswordEncrypted antes de responder',
  /const\s*\{\s*msellerApiKeyEncrypted,\s*msellerEmail,\s*msellerPasswordEncrypted,\s*\.\.\.settingsSinCredencialesMseller\s*\}\s*=\s*settings;/.test(settingsRoute));
ok('la respuesta usa el objeto ya filtrado, no el settings original',
  /data:\s*\{\s*\.\.\.settingsSinCredencialesMseller,/.test(settingsRoute));
ok('ya no queda "...settings" (el original, sin filtrar) en el cuerpo de la respuesta',
  !/data:\s*\{\s*\.\.\.settings,/.test(settingsRoute));

console.log('\n=== P1-16: adminRepository -- UPDATE final repite companyId ===\n');

const admin = fuente('src/repositories/adminRepository.ts');

// No se aisla desde la firma: el parametro `data: { ... }` tiene sus propias
// llaves (un tipo objeto), y bloque() se pararia ahi en vez de en el cuerpo
// de la funcion. Se ubica primero la firma y, desde ahi, el arranque de la
// transaccion -- que es unico para updateUser (createUser usa otra).
const marcaUpdateUser = admin.indexOf('static async updateUser(');
ok('se encontro la firma de updateUser', marcaUpdateUser >= 0);
const desdeUpdateUser = marcaUpdateUser >= 0 ? admin.slice(marcaUpdateUser) : '';
const cuerpoUpdateUser = bloque(desdeUpdateUser, /await db\.transaction\(async \(tx\) => \{/);
ok('se aislo el cuerpo de updateUser()', cuerpoUpdateUser.length > 0);
ok('el UPDATE final de updateUser exige and(id, companyId)',
  /\.update\(users\)\s*\.set\(updateData\)\s*\.where\(and\(eq\(users\.id, userId\), eq\(users\.companyId, companyId\)\)\)/.test(cuerpoUpdateUser));

const cuerpoToggle = bloque(admin, /static\s+async\s+toggleUserStatus\s*\(/);
ok('se aislo el cuerpo de toggleUserStatus()', cuerpoToggle.length > 0);
ok('el UPDATE final de toggleUserStatus exige and(id, companyId)',
  /\.update\(users\)\s*\.set\(\{ status: newStatus, updatedAt: new Date\(\) \}\)\s*\.where\(and\(eq\(users\.id, userId\), eq\(users\.companyId, companyId\)\)\)/.test(cuerpoToggle));

console.log('\n=== P1-17: biRepository.getCustomerStats filtra por modo ===\n');

const bi = fuente('src/repositories/biRepository.ts');
const cuerpoStats = bloque(bi, /static\s+async\s+getCustomerStats\s*\(/);
ok('se aislo el cuerpo de getCustomerStats()', cuerpoStats.length > 0);
const vecesModo = (cuerpoStats.match(/eq\(invoices\.modo, modo\)/g) || []).length;
ok('eq(invoices.modo, modo) aparece en las dos consultas (spenders + inactiveCustomers)', vecesModo >= 2,
  `encontrado ${vecesModo} vez/veces`);

console.log('\n=== P1-21: mensajes genericos en setup/confirm y setup/recover ===\n');

const confirm = fuente('src/app/api/v1/setup/confirm/route.ts');
ok('setup/confirm ya no interpola error.message en la respuesta al cliente',
  !/message:\s*`[^`]*\$\{error\.message\}/.test(confirm));
ok('setup/confirm sigue registrando el error completo con console.error',
  /console\.error\('Setup wizard confirmation error:', error\)/.test(confirm));

const recover = fuente('src/app/api/v1/setup/recover/route.ts');
ok('setup/recover ya no interpola error.message en la respuesta al cliente',
  !/message:\s*`[^`]*\$\{error\.message\}/.test(recover));
ok('setup/recover sigue registrando el error completo con console.error',
  /console\.error\('\[RECOVERY\] Error:', error\)/.test(recover));

console.log('\n=== P1-22: setup/recover excluida de sesion en proxy.ts ===\n');

const proxy = fuente('src/proxy.ts');
ok("proxy.ts excluye /api/v1/setup/recover de la verificacion de sesion",
  /pathname\.startsWith\('\/api\/v1\/setup\/recover'\)/.test(proxy));
// La exclusion tiene que estar en el MISMO bloque if que las otras tres rutas
// de setup, no en un guardia aislado y sin efecto.
const bloqueExclusion = bloque(proxy, /export async function proxy/);
const idxInit = bloqueExclusion.indexOf("pathname.startsWith('/api/v1/setup/init')");
const idxRecover = bloqueExclusion.indexOf("pathname.startsWith('/api/v1/setup/recover')");
const idxCron = bloqueExclusion.indexOf("pathname.startsWith('/api/v1/cron/')");
ok('la exclusion de setup/recover cae entre setup/init y cron/ (mismo if de arranque)',
  idxInit >= 0 && idxRecover > idxInit && idxCron > idxRecover);

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
