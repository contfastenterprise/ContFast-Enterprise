/**
 * Lote 303 -- Administracion > "Mi Suscripcion" dice la verdad del plan, con la
 * MISMA tarjeta que Configuracion > Plan & Suscripcion.
 *
 *   npx tsx scratch/verificar_mi_suscripcion.ts
 *
 * Antes la pestaña era la de antes del lote 299: rotulaba "Plan de Suscripción
 * Activo" / "Suscripción Activa" aunque el plan estuviera vencido o en prueba, y
 * sin plan decia "No se encontró una suscripción activa ... contacte con soporte".
 *
 * Tres partes:
 *  1. La TARJETA, DIBUJADA con `react-dom/server` en cada estado (activo, prueba,
 *     vencido, sin plan, pago pendiente, cancelado, por empezar, al 80 % y al 100 %),
 *     con los datos que arma la regla del lote 299 (`planParaLaPantalla`).
 *  2. Las DOS pantallas dicen lo mismo: se dibujan las dos (Plan & Suscripcion entera
 *     y la tarjeta que pinta Mi Suscripcion) y la tarjeta tiene que salir identica.
 *  3. El CABLEADO: Mi Suscripcion pinta la tarjeta compartida con el plan de la ruta
 *     de la regla, y no queda ninguna copia de la logica de estado.
 *
 * Los modulos del lote se cargan con `import()` perezoso: en la contraprueba la
 * tarjeta no existe, y cada comprobacion tiene que dar FALLA por su etiqueta.
 * Las negaciones ("no dice Activo", "no dice soporte") van atadas a una marca
 * positiva del estado nuevo: sin tarjeta no se dibuja nada, y "no dice" seria
 * verdad de balde.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => {
  total++;
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${!c && d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
/** Lo cierto antes y despues: no es una comprobacion del lote (codigo 3 si falla). */
const invariante = (t: string, c: boolean) => {
  console.log(`${c ? '  INV ' : ' ROTO '}  ${t}`);
  if (!c) { console.log('\nINVARIANTE ROTO: el banco no puede concluir'); process.exit(3); }
};

const RAIZ = path.resolve(__dirname, '..');
const leer = (f: string) => { const p = path.join(RAIZ, f); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const nombra = (src: string, id: string) => new RegExp(`\\b${id}\\b`).test(src);
const importa = (src: string, nombre: string, desde: string) =>
  new RegExp(`import\\s*(type\\s*)?\\{[^}]*\\b${nombre}\\b[^}]*\\}\\s*from\\s*'${desde.replace(/[/.@-]/g, (c) => `\\${c}`)}'`).test(src);
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** El texto visible de un HTML: sin etiquetas y con las entidades basicas. */
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TARJETA = 'src/components/suscripcion/TarjetaDelPlan.tsx';
const ADMIN = 'src/app/dashboard/admin/page.tsx';
const PYS = 'src/app/dashboard/settings/components/PlanYSuscripcion.tsx';
const REGLA = 'src/services/suscripcion/planVigente.ts';

async function main() {
  // Precondicion valida en los dos estados: la regla del 299 y la pantalla de Configuracion existen.
  if (!leer(REGLA) || !leer(PYS) || !leer(ADMIN)) { console.log('PRECONDICION: falta la regla del 299, Plan & Suscripcion o Administracion'); process.exit(2); }

  const R = (await import('../src/services/suscripcion/planVigente')) as AnyRec;
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let T: AnyRec | null = null;
  try { T = (await import('../src/components/suscripcion/TarjetaDelPlan')) as AnyRec; } catch { T = null; }
  const P = (await import('../src/app/dashboard/settings/components/PlanYSuscripcion')) as AnyRec;

  // ---------------------------------------------------------------------
  // Los casos, armados con la regla (como `admin/settings`)
  // ---------------------------------------------------------------------
  const AHORA = new Date('2026-10-05T15:00:00Z'); // 5 de octubre, 11:00 de RD
  const BASICO = { planName: 'Plan Básico', maxEcfLimit: 100, maxUsers: 2, maxWarehouses: 1 };
  const sub = (status: string, ini: string, fin: string) =>
    ({ id: `s-${status}`, status, currentPeriodStart: new Date(ini), currentPeriodEnd: new Date(fin), ...BASICO });
  const plan = (subs: AnyRec[], usados = 10, usuarios = 1, almacenes = 1) => {
    const situacion = R.situacionDelPlan(subs, AHORA);
    return { situacion, p: R.planParaLaPantalla({ situacion, ecf: R.usoDelMes(situacion, usados), mes: '2026-10', usuarios, almacenes }) as AnyRec | null };
  };
  const CASOS: Record<string, { situacion: AnyRec; p: AnyRec | null }> = {
    activo: plan([sub('active', '2026-07-01T04:00:00Z', '2026-12-31T23:59:59.999Z')]),
    prueba: plan([sub('trialing', '2026-09-20T04:00:00Z', '2026-10-20T03:59:59.999Z')]),
    vencido: plan([sub('active', '2026-09-01T04:00:00Z', '2026-10-03T03:59:59.999Z')]),
    pago_pendiente: plan([sub('past_due', '2026-09-01T04:00:00Z', '2026-12-31T23:59:59.999Z')]),
    cancelado: plan([sub('canceled', '2026-09-01T04:00:00Z', '2026-12-31T23:59:59.999Z')]),
    por_empezar: plan([sub('active', '2026-11-01T04:00:00Z', '2026-12-31T23:59:59.999Z')]),
    sin_plan: plan([]),
    al_80: plan([sub('active', '2026-07-01T04:00:00Z', '2026-12-31T23:59:59.999Z')], 80),
    al_100: plan([sub('active', '2026-07-01T04:00:00Z', '2026-12-31T23:59:59.999Z')], 100),
  };
  invariante('la regla da los estados de los casos (vencido, prueba, sin plan sin suscripcion)',
    CASOS.vencido.situacion.estado === 'vencido' && CASOS.prueba.situacion.estado === 'prueba' && CASOS.sin_plan.p === null
    && CASOS.pago_pendiente.situacion.estado === 'pago_pendiente' && CASOS.por_empezar.situacion.estado === 'por_empezar');

  /** Lo que pinta Mi Suscripcion: la tarjeta compartida. */
  const dibujarTarjeta = (p: AnyRec | null): string => {
    if (!T || typeof T.TarjetaDelPlan !== 'function') return '';
    try { return renderToStaticMarkup(React.createElement(T.TarjetaDelPlan, { plan: p })); } catch (e) { return `LANZO ${(e as Error).message}`; }
  };
  const dibujarPys = (p: AnyRec | null): string => {
    try { return renderToStaticMarkup(React.createElement(P.PlanYSuscripcion, { subscription: p, availablePlans: [] })); } catch (e) { return `LANZO ${(e as Error).message}`; }
  };
  const D: Record<string, string> = {};
  for (const k of Object.keys(CASOS)) D[k] = dibujarTarjeta(CASOS[k].p);
  const hay = (k: string) => D[k].length > 0 && !D[k].startsWith('LANZO');
  const tx = (k: string) => texto(D[k]);

  // =====================================================================
  // 1. LA TARJETA, DIBUJADA
  // =====================================================================
  ok('activo: el chip dice "Activo" (el rotulo de la regla), en verde, con "Quedan N días"',
    hay('activo') && /emerald-700[^"]*"><span[^>]*><\/span>Activo</.test(D.activo) && /Quedan 87 días/.test(tx('activo')), tx('activo').slice(0, 160));
  ok('prueba: dice "Prueba" y NUNCA "Activo"/"Activa"',
    hay('prueba') && /<\/span>Prueba</.test(D.prueba) && !/\bActiv[oa]\b/.test(tx('prueba')) && /Quedan 14 días/.test(tx('prueba')), tx('prueba').slice(0, 160));
  ok('vencido: dice "Vencido" en rojo, NUNCA "Activo"/"Activa", y desde cuando ("02-10-2026", "Venció hace 3 días")',
    hay('vencido') && /rose-700[^"]*"><span[^>]*><\/span>Vencido</.test(D.vencido) && !/\bActiv[oa]\b/.test(tx('vencido'))
    && /02-10-2026/.test(tx('vencido')) && /Venció hace 3 días/.test(tx('vencido')), tx('vencido').slice(0, 200));
  ok('  y el aviso en rojo dice lo que se bloquea (el texto de la regla) y a quien acudir',
    hay('vencido') && /role="alert"/.test(D.vencido) && tx('vencido').includes(R.LO_QUE_SE_BLOQUEA ?? '\u0000')
    && /consulte con el administrador del sistema/.test(tx('vencido')));
  ok('pago pendiente, cancelado y por empezar: su rotulo, ninguno "Activo", y el aviso de no vigente',
    ['pago_pendiente', 'cancelado', 'por_empezar'].every((k) => hay(k) && tx(k).includes(CASOS[k].situacion.rotulo)
      && !/\bActiv[oa]\b/.test(tx(k)) && /role="alert"/.test(D[k])));
  ok('sin plan: chip "Sin plan", "Esta empresa no tiene un plan." y lo que se bloquea',
    hay('sin_plan') && /<\/span>Sin plan</.test(D.sin_plan) && /Esta empresa no tiene un plan\./.test(tx('sin_plan'))
    && tx('sin_plan').includes(R.LO_QUE_SE_BLOQUEA ?? '\u0000'));
  ok('  y remite al administrador del sistema, no a "soporte" ni a "No se encontró una suscripción activa"',
    hay('sin_plan') && /consulte con el administrador del sistema/.test(tx('sin_plan'))
    && !/soporte/i.test(tx('sin_plan')) && !/No se encontró una suscripción activa/.test(tx('sin_plan')));
  ok('ningun estado dice "soporte": todos remiten al administrador del sistema',
    Object.keys(D).every((k) => hay(k) && /administrador del sistema/.test(tx(k)) && !/soporte/i.test(tx(k))));
  ok('uso: "10 de 100" e-CF con "10 %", usuarios "1 de 2" y almacenes "1 de 1"',
    hay('activo') && /10 de 100/.test(tx('activo')) && /10 % · emitidos en PRODUCCIÓN/.test(tx('activo')) && /1 de 2/.test(tx('activo')) && /1 de 1/.test(tx('activo')));
  ok('al 80 %: "80 de 100" y "80 %", la cifra en ambar',
    hay('al_80') && /text-amber-700">80 de 100</.test(D.al_80) && /80 %/.test(tx('al_80')));
  ok('al 100 %: "100 de 100" y "100 %", la cifra en rojo',
    hay('al_100') && /text-rose-700">100 de 100</.test(D.al_100) && /100 %/.test(tx('al_100')));
  ok('por debajo del 80 % la cifra no se colorea (ni ambar ni rojo)',
    hay('activo') && /text-slate-800">10 de 100</.test(D.activo));

  // =====================================================================
  // 2. LAS DOS PANTALLAS DICEN LO MISMO
  // =====================================================================
  const ROTULOS: Record<string, string> = { activo: 'Activo', prueba: 'Prueba', por_empezar: 'Por empezar', vencido: 'Vencido', pago_pendiente: 'Pago pendiente', cancelado: 'Cancelado', sin_plan: 'Sin plan' };
  ok('los siete rotulos de Mi Suscripcion son los de Plan & Suscripcion, dibujando las dos',
    Object.entries(ROTULOS).every(([k, r]) => {
      const pys = texto(dibujarPys(CASOS[k].p));
      return hay(k) && tx(k).includes(r) && pys.includes(r);
    }));
  ok('  y la tarjeta sale IDENTICA dentro de Plan & Suscripcion, en los nueve casos',
    Object.keys(CASOS).every((k) => hay(k) && dibujarPys(CASOS[k].p).includes(D[k])));

  // La regla: los mensajes de bloqueo dicen lo mismo que la tarjeta
  ok('mensajes de bloqueo "sin plan" y "cancelado": consulte con el administrador del sistema, no "Contacte a soporte"',
    ['sin_plan', 'cancelado'].every((k) => {
      const m = String(CASOS[k].situacion.bloqueo?.message ?? '');
      return /consulte con el administrador del sistema/.test(m) && !/soporte/i.test(m);
    }));

  // =====================================================================
  // 3. EL CABLEADO
  // =====================================================================
  const admin = leer(ADMIN);
  const pys = leer(PYS);
  const tarjeta = leer(TARJETA);
  const i = admin.indexOf("{activeTab === 'plans' && currentUserRole !== 'sistemas' && (");
  const pestana = i < 0 ? '' : admin.slice(i, admin.indexOf('\n            )}', i));
  invariante('la pestaña Mi Suscripcion sigue siendo la de quien no es Sistemas', i > 0 && /'Mi Suscripción'/.test(admin));
  ok('Mi Suscripcion importa la tarjeta compartida y la pinta con el plan de la ruta',
    importa(admin, 'TarjetaDelPlan', '@/components/suscripcion/TarjetaDelPlan') && /<TarjetaDelPlan plan=\{subscription\} \/>/.test(pestana));
  ok('  el plan es el de la regla: `PlanParaLaPantalla`, leido de `/api/v1/admin/settings`',
    importa(admin, 'PlanParaLaPantalla', '@/services/suscripcion/planVigente') && /useState<PlanParaLaPantalla \| null>/.test(admin)
    && /fetch\('\/api\/v1\/admin\/settings'\)/.test(admin) && /setSubscription\(sData\.data\.subscription \|\| null\)/.test(admin));
  ok('  y la pestaña ya no pinta nada por su cuenta (ni "Suscripción Activa" ni "No se encontró")',
    /<TarjetaDelPlan/.test(pestana) && !/Suscripci[oó]n Activ/.test(sinComentarios(admin)) && !/No se encontró una suscripción/.test(admin)
    && !/subscription\.(maxEcfLimit|maxUsers|maxWarehouses|planName|currentPeriodEnd)/.test(admin));
  ok('Plan & Suscripcion pinta la MISMA tarjeta',
    importa(pys, 'TarjetaDelPlan', '@/components/suscripcion/TarjetaDelPlan') && /<TarjetaDelPlan plan=\{subscription\} \/>/.test(pys));
  ok('la tarjeta toma lo que se bloquea, a quien acudir y "Sin plan" de la regla',
    importa(tarjeta, 'LO_QUE_SE_BLOQUEA', '@/services/suscripcion/planVigente') && importa(tarjeta, 'PARA_ACTIVAR_UN_PLAN', '@/services/suscripcion/planVigente')
    && importa(tarjeta, 'ROTULO_SIN_PLAN', '@/services/suscripcion/planVigente') && /\{rotulo\}/.test(tarjeta));
  //  Una sola copia: el texto de los dias y el color del estado viven en la tarjeta, y en ningun otro fichero de src/.
  const ficheros: string[] = [];
  const recorrer = (d: string) => {
    for (const n of readdirSync(path.join(RAIZ, d))) {
      const r = `${d}/${n}`;
      if (statSync(path.join(RAIZ, r)).isDirectory()) recorrer(r);
      else if (/\.tsx?$/.test(n)) ficheros.push(r);
    }
  };
  recorrer('src');
  const definen = (re: RegExp) => ficheros.filter((f) => re.test(sinComentarios(leer(f))));
  const dias = definen(/function textoDeLosDias\b/);
  const colores = definen(/\bCOLOR_DEL_ESTADO\s*[:=]/);
  ok('una sola copia del texto de los dias y del color del estado: en la tarjeta',
    dias.length === 1 && dias[0] === TARJETA && colores.length === 1 && colores[0] === TARJETA, `${dias.join(',')} | ${colores.join(',')}`);
  ok('ni la pestaña, ni Plan & Suscripcion, ni la tarjeta escriben sus propios rotulos de estado (los da la regla)',
    /\{rotulo\}/.test(tarjeta) && /<TarjetaDelPlan/.test(pestana)
    && [pestana, pys, tarjeta].every((f) => !/'(Activo|Prueba|Vencido|Pago pendiente|Cancelado|Por empezar)'/.test(sinComentarios(f))));

  // El manual (lote 302) copiaba los mensajes: tiene que decir lo mismo que el codigo
  const manual = leer('scripts/generate-manual.js');
  ok('el manual copia los mensajes nuevos y lleva "Sin plan" en la tabla de estados',
    !/Contacte a soporte/.test(manual) && /Para activar un plan, consulte con el administrador del sistema\./.test(manual)
    && /\['<strong>Sin plan<\/strong>'/.test(manual));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} (${total} comprobaciones)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
