/**
 * Lote 176 -- una caja que no cuadro deja de pasar desapercibida.
 *
 * EL HUECO
 * --------
 * La caja ya esta asentada operacion por operacion (venta en efectivo, cobro,
 * compra, pago a suplidor), asi que un arqueo que CUADRA no necesita asiento:
 * el mayor ya dice la verdad. Pero si no cuadra, hasta ahora la diferencia se
 * quedaba SOLO en el resumen de la sesion. El mayor seguia contando un dinero
 * que no esta en la caja, y nada lo decia.
 *
 * QUE SE DECIDIO, Y QUE NO
 * ------------------------
 * Se penso en asentar la diferencia sola. **El dueño dijo que no** (2026-09-21):
 * a que cuenta va un faltante -- gasto, o cuenta por cobrar al cajero -- es una
 * decision contable que cambia segun el caso, y el sistema no la toma por su
 * cuenta. Lo que si hace es que NO SE OLVIDE: un aviso que se queda hasta que
 * un responsable lo da por revisado.
 *
 * Y para que ese aviso pueda apagarse hubo que enchufar algo que llevaba desde
 * siempre desconectado: la ruta `/approve` existia y NADIE la llamaba.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const AVISOS = 'src/services/avisos/vencimientos.ts';
const PANEL = 'src/repositories/dashboardRepository.ts';
const PANTALLA = 'src/app/dashboard/cash/page.tsx';
const REPO = 'src/repositories/cashRepository.ts';
const RUTA = 'src/app/api/v1/cash/sessions/[id]/approve/route.ts';

async function main() {
  for (const f of [AVISOS, PANEL, PANTALLA, REPO, RUTA]) {
    if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: falta ${f}`);
  }
  // Valen en los DOS estados: lo que el lote cambia es que se avise y que se
  // pueda resolver, no que el panel o la aprobacion existan.
  const panel = leer(PANEL);
  if (!/caja_sin_cerrar/.test(panel)) throw new Error('Precondicion: el panel ya no avisa de la caja sin cerrar (lote 158)');
  if (!/approveSession/.test(leer(REPO))) throw new Error('Precondicion: el repositorio ya no sabe aprobar una sesion');

  console.log('\n1) La regla, ejecutada\n');
  let V: typeof import('../src/services/avisos/vencimientos') | null = null;
  try {
    const m = await import('../src/services/avisos/vencimientos');
    V = 'diferenciaSinResolver' in m ? m : null;
  } catch { V = null; }

  if (!V) {
    for (const t of [
      'un faltante se reconoce como faltante',
      'un sobrante, como sobrante',
      'cuadrada no es ninguna de las dos',
      'unos centimos de redondeo no son una diferencia',
      'una sesion ABIERTA no se avisa (de esa avisa cajaSinCerrar)',
      'una cerrada con diferencia y sin aprobar SI se avisa',
      'y una ya aprobada deja de avisarse',
      'una cerrada que cuadro no se avisa',
      'una diferencia ilegible no inventa un aviso',
    ]) ok(t, false, 'vencimientos.ts no exporta diferenciaSinResolver');
  } else {
    const { claseDeDiferencia, diferenciaSinResolver } = V;

    ok('un faltante se reconoce como faltante', claseDeDiferencia(-500) === 'faltante');
    ok('  y tambien si viene como texto de la base', claseDeDiferencia('-500.00') === 'faltante');
    ok('un sobrante, como sobrante', claseDeDiferencia(120.5) === 'sobrante');
    ok('cuadrada no es ninguna de las dos', claseDeDiferencia(0) === null && claseDeDiferencia('0.00') === null);
    // En centavos: la diferencia sale de restar importes con decimales, y 0,004
    // no es dinero que falte.
    ok('unos centimos de redondeo no son una diferencia', claseDeDiferencia(0.004) === null, String(claseDeDiferencia(0.004)));
    ok('  pero un centavo SI lo es', claseDeDiferencia(-0.01) === 'faltante');
    ok('una diferencia ilegible no inventa un aviso',
      claseDeDiferencia(null) === null && claseDeDiferencia(undefined) === null && claseDeDiferencia('no es un numero') === null);

    const cerrada = { status: 'closed', difference: '-500.00', approvedAt: null };
    ok('una cerrada con diferencia y sin aprobar SI se avisa', diferenciaSinResolver(cerrada) === true);
    ok('y una ya aprobada deja de avisarse',
      diferenciaSinResolver({ ...cerrada, approvedAt: new Date() }) === false);
    ok('una cerrada que cuadro no se avisa',
      diferenciaSinResolver({ status: 'closed', difference: '0.00', approvedAt: null }) === false);
    // La sesion abierta todavia no tiene arqueo: su `difference` es nulo y de
    // ella ya avisa `cajaSinCerrar`. Avisar dos veces de la misma caja es ruido.
    ok('una sesion ABIERTA no se avisa (de esa avisa cajaSinCerrar)',
      diferenciaSinResolver({ status: 'open', difference: null, approvedAt: null }) === false);
    ok('  ni aunque arrastrara una diferencia vieja',
      diferenciaSinResolver({ status: 'open', difference: '-500.00', approvedAt: null }) === false);
  }

  console.log('\n2) El panel avisa\n');
  ok('el panel usa la regla, no una copia', /diferenciaSinResolver/.test(panel) && /claseDeDiferencia/.test(panel));
  ok('  importada del modulo de avisos',
    /diferenciaSinResolver,\s*\n?\s*claseDeDiferencia,\s*\n?\s*\} from '@\/services\/avisos\/vencimientos'/.test(panel));
  ok('el aviso tiene clave estable por sesion (para que se actualice y se cierre solo)',
    /id: `caja-diferencia-\$\{sesion\.id\}`/.test(panel));
  ok('  y tipo propio, distinto del de la caja sin cerrar',
    /type: 'caja_con_diferencia'/.test(panel) && /type: 'caja_sin_cerrar'/.test(panel));
  ok('dice si falta o si sobra', /Faltan RD\$/.test(panel) && /Sobran RD\$/.test(panel));
  ok('  y por que importa (el mayor sigue contando ese dinero)',
    /el mayor sigue contando ese dinero/.test(panel));
  ok('solo mira las sesiones CERRADAS', /eq\(cashSessions\.status, 'closed'\)/.test(panel));
  ok('  acotadas a la empresa y el entorno', /withTenantMode\(cashSessions, ctx, eq\(cashSessions\.status, 'closed'\)\)/.test(panel));

  // La severidad se clasifica en `avisoDelPanel.ts` desde el lote 178 (antes
  // en `sincronizarAvisos.ts`, que arrastraba `@/db`). Se miran los dos: lo
  // que este banco vigila es la REGLA, no en que fichero vive.
  const clasifica = ['src/services/avisos/avisoDelPanel.ts', 'src/services/avisos/sincronizarAvisos.ts']
    .map(leer).join('\n');
  ok('un descuadre de caja se marca como ERROR, no como recordatorio',
    /tipo === 'invoice_rejected' \|\| tipo === 'caja_con_diferencia'/.test(clasifica));

  console.log('\n3) Se puede resolver (si no, el aviso seria eterno)\n');
  const pantalla = leer(PANTALLA);
  const codigo = sinComentarios(pantalla);
  ok('la pantalla de caja llama a la ruta de aprobar, que nadie llamaba',
    /fetch\(`\/api\/v1\/cash\/sessions\/\$\{id\}\/approve`, \{ method: 'POST' \}\)/.test(codigo));
  ok('  y el boton solo sale cuando hay algo que resolver',
    /\{diferenciaSinResolver\(s\) && \(/.test(codigo));
  ok('  usando LA MISMA regla que el panel', /from '@\/services\/avisos\/vencimientos'/.test(pantalla));
  ok('  con su etiqueta para lectores de pantalla', /aria-label="Dar por revisada la diferencia del arqueo"/.test(codigo));
  ok('una vez revisada, se ve que lo esta', /\{s\.approvedAt && \(/.test(codigo));
  // Sin esto la pantalla no sabria si ya se reviso y el boton no se iria nunca.
  ok('el listado devuelve si ya se reviso', /approvedAt: cashSessions\.approvedAt/.test(leer(REPO)));

  console.log('\n4) Aprobar no cruza entornos\n');
  const repo = leer(REPO);
  const iAprobar = repo.indexOf('static async approveSession(');
  const cuerpo = iAprobar > 0 ? repo.slice(iAprobar, repo.indexOf('\n  static async', iAprobar + 10)) : '';
  ok('approveSession recibe el entorno', /approveSession\(sessionId: string, companyId: string, modo: ModoOperativo/.test(cuerpo));
  ok('  y filtra por el', /eq\(cashSessions\.modo, modo\)/.test(cuerpo));
  ok('  negandose si no encuentra la sesion en ese entorno',
    /No se encontró la sesión de caja a aprobar/.test(cuerpo));
  ok('la ruta le pasa el entorno de la sesion del usuario',
    /CashService\.approveSession\(auth\.userId, auth\.companyId, auth\.modo, id\)/.test(leer(RUTA)));
  // "Sigue" es verdad de balde antes del lote: va unida a que el entorno SI
  // viaje ahora, que es lo que este lote añade a esa misma ruta.
  ok('  y sigue exigiendo permiso de supervisor',
    /enforcePermission\([^)]*'administracion', 'write'\)/.test(leer(RUTA))
    && /auth\.companyId, auth\.modo, id\)/.test(leer(RUTA)));

  console.log('\n5) Lo que NO hace, a proposito\n');
  // El dueño decidio que la diferencia no se asienta sola. Si alguien lo
  // "mejora" mas adelante sin decidirlo, esto lo pone encima de la mesa.
  // Las dos son negaciones ciertas ANTES del lote (nunca se asento nada), asi
  // que solas serian OK regalados. Van unidas a la marca del estado posterior:
  // lo que este lote afirma no es "no asienta", sino "no asienta Y en su lugar
  // avisa". Si alguien añade el asiento mas adelante, tendra que decidirlo.
  const caja = leer('src/repositories/cashRepository.ts');
  const servicio = leer('src/services/cashService.ts');
  ok('cerrar una caja no asienta en el mayor: en su lugar, el panel avisa',
    !/createJournalEntry/.test(sinComentarios(caja)) && /closeSession/.test(caja)
    && /approvedAt: cashSessions\.approvedAt/.test(caja));
  ok('  ni el servicio de caja',
    !/createJournalEntry/.test(sinComentarios(servicio))
    && /modo: ModoOperativo, sessionId: string/.test(servicio));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
