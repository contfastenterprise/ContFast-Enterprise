/**
 * Lote 299 -- los limites de los planes, con UNA regla.
 *
 *   npx tsx scratch/verificar_limites_del_plan.ts
 *
 * Dos partes:
 *  1. La REGLA (`services/suscripcion/planVigente.ts`), EJECUTADA: activo, prueba en su
 *     periodo, vencido, sin plan, `past_due`, `canceled`; el aviso 5 dias antes y no 6; el
 *     79, 80 y 100 % del limite de e-CF y el -1 ilimitado; el ultimo dia del mes a las
 *     21:00 de RD (cuenta en ESE mes); el reenvio de un rechazado (no suma); PRUEBA (no
 *     cuenta); usuarios y almacenes n+1; avisos con clave estable y su severidad.
 *  2. El CABLEADO: cada puerta llama a la regla y no queda ningun contador propio.
 *
 * La regla se carga con `import()` perezoso: en la contraprueba no existe, y cada
 * comprobacion tiene que dar FALLA por su etiqueta en vez de reventar el banco.
 */
import { readFileSync, existsSync } from 'fs';
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
  new RegExp(`import\\s*\\{[^}]*\\b${nombre}\\b[^}]*\\}\\s*from\\s*'${desde.replace(/[/.@-]/g, (c) => `\\${c}`)}'`).test(src);
/** El cuerpo de un bloque que empieza en `inicio` (llaves equilibradas). */
const bloque = (src: string, inicio: string | RegExp): string => {
  const i = typeof inicio === 'string' ? src.indexOf(inicio) : src.search(inicio);
  if (i < 0) return '';
  //  El cuerpo de una funcion empieza DESPUES de sus parametros: `{ params }: {...}`
  //  lleva llaves dentro de los parentesis, y la primera llave no es la del cuerpo.
  let p = src.indexOf('(', i);
  if (p < 0) return '';
  for (let d = 0; p < src.length; p++) {
    if (src[p] === '(') d++;
    else if (src[p] === ')') { d--; if (d === 0) break; }
  }
  const a = src.indexOf('{', p);
  if (a < 0) return '';
  let n = 0;
  for (let k = a; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return '';
};

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  // =====================================================================
  // 1. LA REGLA, EJECUTADA
  // =====================================================================
  let R: AnyRec | null = null;
  try { R = (await import('../src/services/suscripcion/planVigente')) as AnyRec; } catch { R = null; }
  const etiquetasRegla: string[] = [];
  const regla = (t: string, f: () => boolean) => {
    etiquetasRegla.push(t);
    if (!R) return ok(t, false, 'no existe services/suscripcion/planVigente.ts');
    let c = false;
    try { c = f(); } catch (e) { return ok(t, false, `LANZO ${(e as Error).message}`); }
    ok(t, c);
  };

  const AHORA = new Date('2026-10-05T15:00:00Z'); // 5 de octubre, 11:00 de RD
  const PLAN = { planName: 'Plan Básico', maxEcfLimit: 100, maxUsers: 2, maxWarehouses: 1 };
  const sub = (id: string, status: string, ini: string, fin: string, plan: Partial<typeof PLAN> = {}) =>
    ({ id, status, currentPeriodStart: new Date(ini), currentPeriodEnd: new Date(fin), ...PLAN, ...plan });
  const sit = (subs: AnyRec[], ahora = AHORA) => R!.situacionDelPlan(subs, ahora) as AnyRec;

  const activo = sub('s-act', 'active', '2026-07-03T17:45:51Z', '2026-12-31T23:59:59.999Z', { planName: 'Plan Corporativo', maxEcfLimit: 2000, maxUsers: 15, maxWarehouses: 5 });
  const pruebaVigente = sub('s-pru', 'trialing', '2026-09-20T15:00:00Z', '2026-10-20T15:00:00Z');
  const pruebaVencida = sub('s-pv', 'trialing', '2026-09-01T15:00:00Z', '2026-10-01T15:00:00Z');
  const activoVencido = sub('s-av', 'active', '2026-09-01T15:00:00Z', '2026-10-04T12:00:00Z');

  regla('activo en su periodo: vigente, "Activo", sin bloqueo', () => {
    const s = sit([activo]);
    return s.vigente === true && s.estado === 'activo' && s.rotulo === 'Activo' && s.bloqueo === null && s.diaFin === '2026-12-31';
  });
  regla('trialing DENTRO de su periodo cuenta como vigente ("Prueba")', () => {
    const s = sit([pruebaVigente]);
    return s.vigente === true && s.estado === 'prueba' && s.rotulo === 'Prueba' && s.bloqueo === null;
  });
  regla('trialing vencido: PLAN_VENCIDO 403, "La prueba gratis venció el 01-10-2026"', () => {
    const s = sit([pruebaVencida]);
    return !s.vigente && s.estado === 'vencido' && s.bloqueo?.code === 'PLAN_VENCIDO' && s.bloqueo?.status === 403
      && /prueba gratis venció el 01-10-2026/.test(s.bloqueo?.message);
  });
  regla('active vencido: "Vencido", PLAN_VENCIDO, y el mensaje dice que borradores e imprimir siguen', () => {
    const s = sit([activoVencido]);
    return s.rotulo === 'Vencido' && s.bloqueo?.code === 'PLAN_VENCIDO' && /borradores/.test(s.bloqueo?.message) && /imprimir/.test(s.bloqueo?.message);
  });
  regla('el ultimo dia vale ENTERO en hora de RD (31/12 23:00 RD, ya 1/1 en UTC: vigente)', () =>
    sit([activo], new Date('2027-01-01T03:00:00Z')).vigente === true);
  regla('  y el 1/1 a las 00:30 de RD ya no', () =>
    sit([activo], new Date('2027-01-01T04:30:00Z')).vigente === false);
  regla('sin ninguna suscripcion: SIN_PLAN 403', () => {
    const s = sit([]);
    return !s.vigente && s.estado === 'sin_plan' && s.bloqueo?.code === 'SIN_PLAN' && s.bloqueo?.status === 403;
  });
  regla('past_due en su periodo NO es vigente (PLAN_VENCIDO, "Pago pendiente")', () => {
    const s = sit([sub('s-pd', 'past_due', '2026-09-01T00:00:00Z', '2026-12-31T00:00:00Z')]);
    return !s.vigente && s.bloqueo?.code === 'PLAN_VENCIDO' && s.rotulo === 'Pago pendiente';
  });
  regla('canceled NO es vigente (SIN_PLAN, "Cancelado")', () => {
    const s = sit([sub('s-c', 'canceled', '2026-09-01T00:00:00Z', '2026-12-31T00:00:00Z')]);
    return !s.vigente && s.bloqueo?.code === 'SIN_PLAN' && s.rotulo === 'Cancelado';
  });
  regla('con una vencida y una prueba vigente, manda la vigente', () =>
    sit([activoVencido, pruebaVigente]).suscripcionId === 's-pru');
  regla('  y una vigente gana a una cancelada aunque la cancelada termine despues', () =>
    sit([sub('s-can', 'canceled', '2026-09-01T00:00:00Z', '2027-06-30T00:00:00Z'), activo]).suscripcionId === 's-act');

  // --- el aviso de vencimiento: 5 dias antes si, 6 no
  const finEn = (dia: string) => sub('s-v', 'active', '2026-09-01T15:00:00Z', `${dia}T20:00:00Z`);
  const avisos = (s: AnyRec, modo = 'PRODUCCION', usados = 0, ahora = AHORA) =>
    R!.avisosDelPlan(s, { modo, usadosEnElMes: usados, ahora }) as AnyRec[];
  regla('a 5 dias del vencimiento: aviso `plan_por_vencer` "El plan vence en 5 días", clave estable', () => {
    const s = sit([finEn('2026-10-10')]);
    const a = avisos(s).filter((x) => x.type === 'plan_por_vencer');
    return s.diasRestantes === 5 && a.length === 1 && a[0].title === 'El plan vence en 5 días' && a[0].id === 'plan-vence-s-v-2026-10-10';
  });
  regla('a 6 dias: ningun aviso de vencimiento', () =>
    avisos(sit([finEn('2026-10-11')])).filter((x) => x.type === 'plan_por_vencer').length === 0);
  regla('el dia del vencimiento: "El plan vence hoy" (aun vigente)', () => {
    const s = sit([finEn('2026-10-05')]);
    return s.vigente && avisos(s).some((x) => x.type === 'plan_por_vencer' && x.title === 'El plan vence hoy');
  });
  regla('vencido: aviso `plan_vencido` (clave plan-vencido-<id>) en PRODUCCION y en PRUEBA', () => {
    const s = sit([activoVencido]);
    const p = avisos(s, 'PRODUCCION'); const q = avisos(s, 'PRUEBA');
    return p.length === 1 && p[0].type === 'plan_vencido' && p[0].id === 'plan-vencido-s-av' && p[0].title === 'El plan venció'
      && q.length === 1 && q[0].id === 'plan-vencido-s-av';
  });
  regla('sin plan: aviso `plan_vencido` con clave plan-sin-vigente', () => {
    const a = avisos(sit([]));
    return a.length === 1 && a[0].id === 'plan-sin-vigente' && a[0].title === 'No hay un plan vigente';
  });

  // --- el limite de e-CF: 79, 80, 100 %, -1
  const s100 = () => sit([sub('s-100', 'active', '2026-09-01T15:00:00Z', '2027-09-01T15:00:00Z')]);
  const emitir = (s: AnyRec, p: AnyRec) => R!.decidirEmision(s, { ahora: AHORA, ...p }) as AnyRec | null;
  regla('99 de 100 en PRODUCCION: se emite (el 100.º cabe)', () => emitir(s100(), { modo: 'PRODUCCION', usadosEnElMes: 99 }) === null);
  regla('100 de 100: LIMITE_ECF 409, y dice "100 de 100", el 1 de noviembre y que los borradores siguen', () => {
    const b = emitir(s100(), { modo: 'PRODUCCION', usadosEnElMes: 100 });
    return b?.code === 'LIMITE_ECF' && b?.status === 409 && /100 de 100/.test(b.message) && /1 de noviembre/.test(b.message) && /borradores/.test(b.message);
  });
  regla('el reenvio de un e-NCF que YA cuenta no suma: con 100 de 100 se deja', () =>
    emitir(s100(), { modo: 'PRODUCCION', usadosEnElMes: 100, yaCuenta: true }) === null);
  regla('PRUEBA no cuenta: con 100 de 100 en PRODUCCION, emitir en PRUEBA se deja', () =>
    emitir(s100(), { modo: 'PRUEBA', usadosEnElMes: 100 }) === null);
  regla('  pero sin plan vigente tampoco se emite en PRUEBA', () =>
    emitir(sit([activoVencido]), { modo: 'PRUEBA', usadosEnElMes: 0 })?.code === 'PLAN_VENCIDO');
  regla('-1 es ilimitado: 5.000 en el mes y se emite; sin aviso del 80 %', () => {
    const s = sit([sub('s-i', 'active', '2026-09-01T15:00:00Z', '2027-09-01T15:00:00Z', { maxEcfLimit: -1 })]);
    return emitir(s, { modo: 'PRODUCCION', usadosEnElMes: 5000 }) === null
      && avisos(s, 'PRODUCCION', 5000).filter((x) => String(x.type).startsWith('ecf_')).length === 0;
  });
  regla('79 %: ningun aviso de e-CF', () => avisos(s100(), 'PRODUCCION', 79).filter((x) => String(x.type).startsWith('ecf_')).length === 0);
  regla('80 %: aviso `ecf_cerca_del_limite` "(80 de 100)" con clave ecf-80-2026-10', () => {
    const a = avisos(s100(), 'PRODUCCION', 80).filter((x) => String(x.type).startsWith('ecf_'));
    return a.length === 1 && a[0].type === 'ecf_cerca_del_limite' && a[0].id === 'ecf-80-2026-10'
      && a[0].title === 'Ha usado el 80 % de sus e-CF de este mes (80 de 100)';
  });
  regla('100 %: aviso `ecf_en_el_limite` (ecf-limite-2026-10), y ya no el del 80 %', () => {
    const a = avisos(s100(), 'PRODUCCION', 100).filter((x) => String(x.type).startsWith('ecf_'));
    return a.length === 1 && a[0].type === 'ecf_en_el_limite' && a[0].id === 'ecf-limite-2026-10' && a[0].title === 'Llegó al límite de e-CF del mes';
  });
  regla('los avisos de e-CF solo salen en PRODUCCION', () =>
    avisos(s100(), 'PRUEBA', 100).filter((x) => String(x.type).startsWith('ecf_')).length === 0);
  regla('usoDelMes: 79 normal, 80 ochenta, 100 limite (porcentaje entero)', () => {
    const u = (n: number) => R!.usoDelMes(s100(), n) as AnyRec;
    return u(79).nivel === 'normal' && u(80).nivel === 'ochenta' && u(100).nivel === 'limite' && u(80).porcentaje === 80;
  });

  // --- el mes de RD
  regla('el 31/10 a las 21:00 de RD cuenta en OCTUBRE (en UTC ya es 1/11)', () => {
    const instante = new Date('2026-10-31T21:00:00-04:00');
    const m = R!.mesDeRD(instante) as AnyRec;
    return m.mes === '2026-10' && m.desde.toISOString() === '2026-10-01T04:00:00.000Z'
      && m.hasta.toISOString() === '2026-11-01T04:00:00.000Z' && instante >= m.desde && instante < m.hasta;
  });
  regla('  y el 31/12 a las 21:00 de RD, en diciembre (el mes siguiente es enero del año que viene)', () => {
    const m = R!.mesDeRD(new Date('2026-12-31T21:00:00-04:00')) as AnyRec;
    return m.mes === '2026-12' && m.hasta.toISOString() === '2027-01-01T04:00:00.000Z';
  });

  // --- que cuenta
  regla('cuentan PRODUCCION y salidos (signed, submitted, accepted, rejected, void); no draft, no PRUEBA', () => {
    const c = (modo: string, status: string) => R!.cuentaParaElLimite({ modo, status }) as boolean;
    return ['signed', 'submitted', 'accepted', 'rejected', 'void'].every((s) => c('PRODUCCION', s))
      && !c('PRODUCCION', 'draft') && !c('PRUEBA', 'rejected') && !c('PRUEBA', 'accepted');
  });

  // --- usuarios y almacenes
  regla('usuarios: 2 permitidos, 1 activo, se deja; 2 activos: LIMITE_USUARIOS 409', () => {
    const s = s100();
    const b = R!.decidirAltaDeUsuario(s, 2) as AnyRec | null;
    return R!.decidirAltaDeUsuario(s, 1) === null && b?.code === 'LIMITE_USUARIOS' && b?.status === 409;
  });
  regla('usuarios con plan vencido: PLAN_VENCIDO aunque haya cupo', () => R!.decidirAltaDeUsuario(sit([activoVencido]), 0)?.code === 'PLAN_VENCIDO');
  regla('usuarios ilimitados (-1): 500 activos y se deja', () =>
    R!.decidirAltaDeUsuario(sit([sub('s-u', 'active', '2026-09-01T15:00:00Z', '2027-09-01T15:00:00Z', { maxUsers: -1 })]), 500) === null);
  regla('almacenes: 1 permitido, 0 existentes se deja; 1: LIMITE_ALMACENES 409; sin plan: SIN_PLAN', () => {
    const b = R!.decidirAltaDeAlmacen(s100(), 1) as AnyRec | null;
    return R!.decidirAltaDeAlmacen(s100(), 0) === null && b?.code === 'LIMITE_ALMACENES' && b?.status === 409
      && R!.decidirAltaDeAlmacen(sit([]), 0)?.code === 'SIN_PLAN';
  });
  regla('la respuesta es `{ success: false, error: { code, message } }`', () => {
    const c = R!.cuerpoDelBloqueo({ code: 'LIMITE_ECF', status: 409, message: 'm' }) as AnyRec;
    return c.success === false && c.error.code === 'LIMITE_ECF' && c.error.message === 'm' && !('status' in c.error);
  });

  // --- severidad y correo (los warning/error salen por correo: lotes 200 y 205)
  let S: AnyRec | null = null;
  let C: AnyRec | null = null;
  try { S = (await import('../src/services/avisos/avisoDelPanel')) as AnyRec; C = (await import('../src/services/avisos/avisoPorCorreo')) as AnyRec; } catch { S = null; }
  ok('severidad: plan_vencido y ecf_en_el_limite son `error`; plan_por_vencer y ecf_cerca_del_limite, `warning`',
    !!S && S.severidadDeAviso('plan_vencido') === 'error' && S.severidadDeAviso('ecf_en_el_limite') === 'error'
    && S.severidadDeAviso('plan_por_vencer') === 'warning' && S.severidadDeAviso('ecf_cerca_del_limite') === 'warning');
  ok('  y por eso los cuatro salen por correo', !!C && ['plan_vencido', 'ecf_en_el_limite', 'plan_por_vencer', 'ecf_cerca_del_limite'].every((t) => C!.seMandaPorCorreo(t)));

  // --- la pantalla, dibujada
  let dibujo = '';
  try {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const P = (await import('../src/app/dashboard/settings/components/PlanYSuscripcion')) as AnyRec;
    const plan = R ? R.planParaLaPantalla({ situacion: sit([finEn('2026-10-10')]), ecf: R.usoDelMes(sit([finEn('2026-10-10')]), 80), mes: '2026-10', usuarios: 1, almacenes: 1 }) : null;
    dibujo = plan ? renderToStaticMarkup(React.createElement(P.PlanYSuscripcion, { subscription: plan, availablePlans: [] })) : '';
  } catch (e) { dibujo = `LANZO ${(e as Error).message}`; }
  ok('pantalla: enseña el estado ("Activo"), los dias que quedan y "80 de 100" e-CF del mes', /Activo/.test(dibujo) && /Quedan 5 días/.test(dibujo) && /80 de 100/.test(dibujo) && /80 %/.test(dibujo), dibujo.slice(0, 120));
  ok('pantalla: usuarios "1 de 2" y almacenes "1 de 1"', /1 de 2/.test(dibujo) && /1 de 1/.test(dibujo));

  // =====================================================================
  // 2. EL CABLEADO
  // =====================================================================
  const REPO = '@/services/suscripcion/planRepositorio';
  const facturas = leer('src/app/api/v1/invoices/route.ts');
  const submit = leer('src/app/api/v1/invoices/[id]/submit/route.ts');
  const reenvio = leer('src/app/api/v1/ecf/[id]/resubmit/route.ts');
  const borrador = leer('src/app/api/v1/invoices/draft/route.ts');
  const validador = leer('src/services/ecfValidator.ts');
  const admin = leer('src/repositories/adminRepository.ts');
  const rutaUsuarios = leer('src/app/api/v1/admin/users/route.ts');
  const almacenes = leer('src/app/api/v1/warehouses/route.ts');
  const nomina = leer('src/app/api/v1/hr/payroll/route.ts');
  const pago = leer('src/app/api/v1/hr/payroll/[id]/pay/route.ts');
  const entries = leer('src/app/api/v1/accounting/entries/route.ts');
  const journals = leer('src/app/api/v1/accounting/journals/route.ts');
  const planes = leer('src/app/api/v1/admin/plans/route.ts');
  const planesId = leer('src/app/api/v1/admin/plans/[id]/route.ts');
  const ajustes = leer('src/app/api/v1/admin/settings/route.ts');
  const panel = leer('src/repositories/dashboardRepository.ts');
  const repo = leer('src/services/suscripcion/planRepositorio.ts');

  if (!facturas || !submit || !reenvio || !borrador || !validador || !admin || !almacenes || !nomina || !pago || !entries || !journals) {
    console.log('PRECONDICION: falta alguno de los ficheros de las puertas'); process.exit(2);
  }

  const POSTfacturas = bloque(facturas, 'export async function POST');
  ok('emision (invoices POST): importa `bloqueoDeEmision` y la llama con el modo de la sesion',
    importa(facturas, 'bloqueoDeEmision', REPO) && /bloqueoDeEmision\(auth\.companyId,\s*auth\.modo\)/.test(POSTfacturas));
  ok('  la llama ANTES de emitir (antes de `InvoiceService.issueInvoice`)',
    POSTfacturas.search(/bloqueoDeEmision\(/) > 0 && POSTfacturas.search(/bloqueoDeEmision\(/) < POSTfacturas.indexOf('InvoiceService.issueInvoice'));
  ok('  y ya no lleva contador propio (ni `subscriptions` ni `maxEcfLimit` ni `count(`)',
    importa(facturas, 'bloqueoDeEmision', REPO) && !nombra(facturas, 'subscriptions') && !nombra(facturas, 'maxEcfLimit') && !/\bcount\(\)/.test(facturas));
  for (const [n, src] of [['invoices/[id]/submit', submit], ['ecf/[id]/resubmit', reenvio]] as const) {
    const cuerpo = bloque(src, 'export async function POST');
    ok(`${n}: llama a \`bloqueoDeEmision\` con el estado de la factura (un reenvio que ya cuenta no suma)`,
      importa(src, 'bloqueoDeEmision', REPO) && /bloqueoDeEmision\(auth\.companyId,\s*auth\.modo,\s*\{\s*modo:\s*auth\.modo,\s*status:\s*invoice\.status\s*\}\)/.test(cuerpo));
    ok(`  ${n}: antes de encolar el envio (\`addJob\`) y de crear el intento`,
      cuerpo.search(/bloqueoDeEmision\(/) > 0 && cuerpo.search(/bloqueoDeEmision\(/) < cuerpo.indexOf('addJob(') && cuerpo.search(/bloqueoDeEmision\(/) < cuerpo.indexOf('insert(dgiiSubmissions)'));
    ok(`  ${n}: responde con \`cuerpoDelBloqueo\` y el estado del bloqueo`,
      /return NextResponse\.json\(cuerpoDelBloqueo\(bloqueoDelPlan\),\s*\{\s*status:\s*bloqueoDelPlan\.status/.test(cuerpo));
  }
  invariante('guardar un borrador (invoices/draft) sigue libre: no pasa por el plan', !nombra(borrador, 'bloqueoDeEmision') && !nombra(borrador, 'subscriptions'));

  const valSub = bloque(validador, 'static async validateSubscription');
  ok('EcfValidator: ya no cuenta por su cuenta -- delega en `bloqueoDeEmision` (sin `subscriptions`, `plans` ni `invoices`)',
    /return bloqueoDeEmision\(companyId,\s*modo\)/.test(valSub) && !nombra(validador, 'subscriptions') && !/import \{[^}]*\binvoices\b/.test(validador));
  ok('  y `runAll` LANZA el bloqueo con su codigo (no lo mezcla en un 422)',
    /throw new PlanNoPermiteError\(bloqueoDelPlan\)/.test(bloque(validador, 'static async runAll')));

  const crear = bloque(admin, 'static async createUser');
  const toggle = bloque(admin, 'static async toggleUserStatus');
  ok('alta de usuario: `exigirAltaDeUsuario(tx, ...)` DENTRO de la transaccion, antes del insert',
    /db\.transaction\(async \(tx\)/.test(crear) && /await exigirAltaDeUsuario\(tx,\s*data\.companyId\)/.test(crear)
    && crear.indexOf('exigirAltaDeUsuario(') < crear.indexOf('tx.insert(users)'));
  ok('reactivar: la cuenta y el cambio en UNA transaccion (antes se contaba fuera)',
    /db\.transaction\(async \(tx\)/.test(toggle) && /if \(newStatus === 'active'\) \{\s*await exigirAltaDeUsuario\(tx,\s*companyId\)/.test(toggle)
    && /tx\.update\(users\)/.test(toggle) && !/\bdb\.update\(users\)/.test(toggle));
  ok('  y adminRepository ya no lee suscripciones por su cuenta', importa(admin, 'exigirAltaDeUsuario', REPO) && !nombra(admin, 'subscriptions'));
  ok('  la ruta de usuarios responde el bloqueo con su `code` (POST y PATCH)',
    (rutaUsuarios.match(/err instanceof PlanNoPermiteError/g) || []).length === 2 && (rutaUsuarios.match(/cuerpoDelBloqueo\(err\)/g) || []).length === 2);

  const exigeU = bloque(repo, 'export async function exigirAltaDeUsuario');
  const exigeA = bloque(repo, 'export async function exigirAltaDeAlmacen');
  ok('las altas toman el candado de la empresa ANTES de contar (pg_advisory_xact_lock)',
    /pg_advisory_xact_lock/.test(bloque(repo, 'export async function bloquearLimitesDeLaEmpresa'))
    && exigeU.indexOf('bloquearLimitesDeLaEmpresa(tx') >= 0 && exigeU.indexOf('bloquearLimitesDeLaEmpresa(tx') < exigeU.indexOf('contarUsuariosActivos(')
    && exigeA.indexOf('bloquearLimitesDeLaEmpresa(tx') >= 0 && exigeA.indexOf('bloquearLimitesDeLaEmpresa(tx') < exigeA.indexOf('contarAlmacenes('));
  ok('la cuenta de e-CF del repositorio: PRODUCCION, estados que salieron y el mes de RD',
    /eq\(invoices\.modo,\s*'PRODUCCION'\)/.test(repo) && /inArray\(invoices\.status,\s*\[\.\.\.ESTADOS_QUE_SALIERON\]\)/.test(repo)
    && /gte\(invoices\.createdAt,\s*desde\)/.test(repo) && /lt\(invoices\.createdAt,\s*hasta\)/.test(repo) && /mesDeRD\(ahora\)/.test(repo));

  const POSTalm = bloque(almacenes, 'export async function POST');
  ok('almacenes: `exigirAltaDeAlmacen(tx, ...)` en la MISMA transaccion que el insert',
    /db\.transaction\(async \(tx\)\s*=>\s*\{\s*await exigirAltaDeAlmacen\(tx,\s*companyId\);\s*return await tx\.insert\(warehouses\)/.test(POSTalm));
  ok('  sin contador propio, y el bloqueo sale con su `code`',
    importa(almacenes, 'exigirAltaDeAlmacen', REPO) && !nombra(almacenes, 'subscriptions') && /error instanceof PlanNoPermiteError/.test(POSTalm));

  const POSTnom = bloque(nomina, 'export async function POST');
  const PUTnom = bloque(nomina, 'export async function PUT');
  ok('nomina: crear (calcular) pasa por `bloqueoSinPlanVigente` y ya no por `hasActivePlan`',
    importa(nomina, 'bloqueoSinPlanVigente', REPO) && /bloqueoSinPlanVigente\(session\.companyId\)/.test(POSTnom) && !nombra(nomina, 'hasActivePlan'));
  ok('  recalcular y aprobar tambien, antes de hacerlo (eliminar no)',
    /if \(action === 'recalculate' \|\| action === 'approve'\) \{\s*const bloqueoDelPlan = await bloqueoSinPlanVigente/.test(PUTnom)
    && PUTnom.search(/bloqueoSinPlanVigente/) < PUTnom.indexOf('recalculatePayroll(') && !/bloqueoSinPlanVigente/.test(bloque(nomina, 'export async function DELETE')));
  const POSTpago = bloque(pago, 'export async function POST');
  ok('  pagar la nomina (lote 295) tambien, antes de `pagarNomina`',
    /bloqueoSinPlanVigente\(session\.companyId\)/.test(POSTpago) && POSTpago.search(/bloqueoSinPlanVigente/) < POSTpago.indexOf('pagarNomina('));
  ok('asientos manuales: `accounting/entries` con la regla y sin `hasActivePlan`',
    /bloqueoSinPlanVigente\(auth\.companyId\)/.test(bloque(entries, 'export async function POST')) && !nombra(entries, 'hasActivePlan'));
  const POSTj = bloque(journals, 'export async function POST');
  ok('  y `accounting/journals` -- la que USA la pantalla, que no lo miraba -- antes de crear el asiento',
    /bloqueoSinPlanVigente\(session\.companyId\)/.test(POSTj) && POSTj.search(/bloqueoSinPlanVigente/) < POSTj.indexOf('createJournalEntry('));

  ok('admin/plans: `maxWarehouses` admite -1 (alta y edicion)',
    /maxWarehouses:\s*z\.number\(\)\.int\([^)]*\)\.min\(-1/.test(planes) && /maxWarehouses:\s*z\.number\(\)\.int\(\)\.min\(-1\)/.test(planesId));
  ok('Configuracion lee el plan con la regla (`usoDelPlan`) y no una suscripcion `active` a mano',
    importa(ajustes, 'usoDelPlan', REPO) && /planParaLaPantalla\(await usoDelPlan\(session\.companyId\)\)/.test(ajustes) && !nombra(ajustes, 'subscriptions'));
  ok('el panel suma los avisos del plan (`avisosDelPlanDeLaEmpresa`) a los que sincroniza',
    importa(panel, 'avisosDelPlanDeLaEmpresa', REPO) && /const avisosPlan = await avisosDelPlanDeLaEmpresa\(companyId,\s*modo\)/.test(panel) && /alertsDetails\.push\(\{\s*\.\.\.a/.test(panel));

  // Barrido: en src/ nadie mas lee `plans.max*` para decidir (solo la regla y las pantallas de administracion).
  const { execFileSync } = await import('child_process');
  let quien: string[] = [];
  try {
    quien = execFileSync('git', ['grep', '--untracked', '-l', '-E', 'plans\\.(maxEcfLimit|maxUsers|maxWarehouses)', '--', 'src'], { cwd: RAIZ, encoding: 'utf8' })
      .split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\\/g, '/'));
  } catch { quien = []; }
  const PERMITIDOS = ['src/services/suscripcion/planRepositorio.ts', 'src/app/api/v1/admin/settings/route.ts', 'src/app/api/v1/admin/subscriptions/route.ts'];
  const sobran = quien.filter((f) => !PERMITIDOS.includes(f));
  ok('barrido: ningun otro fichero de src/ lee los limites del plan para decidir', quien.includes('src/services/suscripcion/planRepositorio.ts') && sobran.length === 0, sobran.join(', '));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} (${total} comprobaciones)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
