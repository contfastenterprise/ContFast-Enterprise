/**
 * El plan de una empresa y lo que deja hacer. UNA regla, pura: sin `@/db`.
 *
 * POR QUE EXISTE (lote 299)
 * -------------------------
 * La auditoria de los limites de los planes (2026-10-05) encontro la misma
 * pregunta contestada en seis sitios, y ninguno de acuerdo con otro:
 *
 *   · usuarios (`adminRepository`), almacenes (`warehouses`) y e-CF (`invoices`)
 *     solo limitaban `if (subscriptionInfo.length > 0)`: SIN suscripcion activa,
 *     no habia limite ninguno;
 *   · habia DOS contadores de e-CF: el de la ruta contaba por el modo de la
 *     sesion (PRUEBA tambien) y el mes de la hora del servidor (UTC), y el de
 *     `EcfValidator` contaba PRODUCCION sobre el periodo entero de la
 *     suscripcion, sin mirar si estaba vencida;
 *   · guardar como borrador y enviar despues (`invoices/[id]/submit`,
 *     `ecf/[id]/resubmit`) no comprobaba nada;
 *   · `hasActivePlan` (nomina y asientos) no contaba `trialing` como vigente, y
 *     la pantalla de asientos manuales (`accounting/journals`) ni lo miraba.
 *
 * Aqui se decide todo eso UNA vez; quien lee la base es `planRepositorio.ts`, y
 * quien la importa, las rutas. Lo que es una DECISION va en un fichero que no
 * importa `@/db` (la regla del lote 178): asi el banco la ejecuta sin base.
 *
 * LAS DECISIONES DEL DUEÑO (2026-10-05)
 * -------------------------------------
 *   · VIGENTE es una suscripcion `active` o `trialing` (la prueba gratis de 30
 *     dias con los limites del Plan Basico) DENTRO de su periodo, contado en
 *     DIAS DE RD: vale hasta el ultimo dia de `current_period_end` en hora de RD
 *     inclusive. Latin Doors termina `2026-12-31 23:59:59.999` (UTC), que en RD
 *     es el 31 a las 19:59: el 31 entero es suyo y el 1 de enero ya no.
 *   · Sin plan vigente -- ninguna suscripcion, `past_due`, `canceled`, o
 *     vencida -- se BLOQUEA lo que crea o emite: e-CF, calcular/aprobar/pagar
 *     nomina, asientos manuales, usuarios y almacenes. Consultar, imprimir y
 *     guardar borradores siguen.
 *   · Aviso 5 dias antes de vencer (`warning`) y al vencer (`error`).
 *   · El limite de e-CF cuenta SOLO PRODUCCION y SOLO lo que salio a la DGII
 *     (ver `ESTADOS_QUE_SALIERON`), por MES CALENDARIO DE RD. Aviso al 80 % y
 *     bloqueo al 100 %. -1 es ilimitado.
 */
import { diaRD, diasEntreDias, formatDateDisplay } from '@/utils/fechasLocales';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import type { AvisoDelPanel } from '@/services/avisos/avisoDelPanel';

// ---------------------------------------------------------------------------
// Constantes con su porque
// ---------------------------------------------------------------------------

/** Dias antes del vencimiento en que empieza el aviso (decision del dueño). */
export const DIAS_AVISO_VENCIMIENTO = 5;

/** Porcentaje del limite de e-CF a partir del cual se avisa. */
export const PORCENTAJE_AVISO_ECF = 80;

/** -1 en un limite del plan significa "sin limite". */
export const ILIMITADO = -1;

/**
 * Los estados de una factura que SALIERON a la DGII y por tanto consumen el
 * limite del plan. Medido en PRODUCCION el 2026-10-05: `accepted` 65,
 * `rejected` 1, `void` 1 y `draft` 9; `submitted` y `signed` existen en el
 * esquema (`invoices.status`).
 *
 *   · `rejected` cuenta: consumio un envio aunque la DGII no lo aceptara.
 *   · `void` cuenta: solo lo pone la baja de un RECHAZADO ya contabilizado
 *     (`bajaDeRechazado.ts`, lote 140), o sea algo que salio.
 *   · `signed` cuenta: firmado por mSeller es que se transmitio.
 *   · `draft` NO cuenta: un borrador lleva un `DFT...` y no ha salido.
 */
export const ESTADOS_QUE_SALIERON = ['signed', 'submitted', 'accepted', 'rejected', 'void'] as const;

/** Los estados de suscripcion que pueden estar vigentes. */
const ESTADOS_QUE_PUEDEN_ESTAR_VIGENTES = ['active', 'trialing'];

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Una suscripcion con su plan, tal y como la lee el repositorio. */
export interface SuscripcionConPlan {
  id: string;
  status: string;
  currentPeriodStart: Date | string;
  currentPeriodEnd: Date | string;
  planName: string;
  maxEcfLimit: number;
  maxUsers: number;
  maxWarehouses: number;
}

export type CodigoDelPlan = 'SIN_PLAN' | 'PLAN_VENCIDO' | 'LIMITE_ECF' | 'LIMITE_USUARIOS' | 'LIMITE_ALMACENES';

/**
 * Por que no se deja hacer algo. 403 cuando falta el plan (no hay permiso para
 * operar), 409 cuando hay plan pero el uso choca con su limite.
 */
export interface BloqueoDelPlan {
  code: CodigoDelPlan;
  status: 403 | 409;
  message: string;
}

export type EstadoDelPlan = 'activo' | 'prueba' | 'vencido' | 'pago_pendiente' | 'cancelado' | 'por_empezar' | 'sin_plan';

export interface SituacionDelPlan {
  estado: EstadoDelPlan;
  /** Lo que lee una persona: "Activo", "Prueba", "Vencido"... */
  rotulo: string;
  vigente: boolean;
  suscripcionId: string | null;
  plan: { nombre: string; maxEcf: number; maxUsuarios: number; maxAlmacenes: number } | null;
  /** El ultimo dia de RD en que vale (aaaa-mm-dd). */
  diaFin: string | null;
  /** Dias de hoy al ultimo dia: 0 es "vence hoy"; negativo, ya vencio. */
  diasRestantes: number | null;
  /** Si no esta vigente, el porque, listo para responder. */
  bloqueo: BloqueoDelPlan | null;
}

/** El error que lanzan las guardas que viven dentro de una transaccion. */
export class PlanNoPermiteError extends Error {
  readonly code: CodigoDelPlan;
  readonly status: 403 | 409;
  constructor(bloqueo: BloqueoDelPlan) {
    super(bloqueo.message);
    this.name = 'PlanNoPermiteError';
    this.code = bloqueo.code;
    this.status = bloqueo.status;
  }
}

/** La respuesta de TODAS las puertas: la misma forma, el mismo `code`. */
export function cuerpoDelBloqueo(b: BloqueoDelPlan) {
  return { success: false as const, error: { code: b.code, message: b.message } };
}

// ---------------------------------------------------------------------------
// El mes de RD
// ---------------------------------------------------------------------------

/**
 * El mes calendario de RD al que pertenece un instante, con sus dos bordes como
 * INSTANTES (para comparar contra `created_at`, que guarda UTC).
 *
 * RD es UTC-4 todo el año, asi que el mes de RD empieza el dia 1 a las 04:00
 * UTC. Se compara el instante y no `((created_at AT TIME ZONE ...))::date`
 * porque asi la consulta usa el indice (company_id, status, created_at, modo);
 * el resultado es el mismo mientras RD no cambie la hora (no lo hace).
 *
 * El ultimo dia del mes a las 21:00 de RD ya es el dia 1 en UTC: con el mes del
 * SERVIDOR contaba en el mes siguiente (el defecto del lote 174). Aqui no.
 */
export function mesDeRD(ahora: Date = new Date()): { mes: string; desde: Date; hasta: Date } {
  const mes = diaRD(ahora).slice(0, 7);
  const anio = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const siguiente = m === 12 ? `${anio + 1}-01` : `${anio}-${String(m + 1).padStart(2, '0')}`;
  return {
    mes,
    desde: new Date(`${mes}-01T00:00:00-04:00`),
    hasta: new Date(`${siguiente}-01T00:00:00-04:00`),
  };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "1 de noviembre": cuando vuelve a haber cupo. */
function primeroDelMesSiguiente(ahora: Date): string {
  const { hasta } = mesDeRD(ahora);
  const mes = diaRD(hasta).slice(5, 7);
  return `1 de ${MESES[Number(mes) - 1]}`;
}

// ---------------------------------------------------------------------------
// Que suscripcion manda
// ---------------------------------------------------------------------------

const vigenteEl = (s: SuscripcionConPlan, hoy: string): boolean =>
  ESTADOS_QUE_PUEDEN_ESTAR_VIGENTES.includes(s.status)
  && diaRD(s.currentPeriodStart) <= hoy
  && hoy <= diaRD(s.currentPeriodEnd);

/**
 * De todas las suscripciones de una empresa, la que manda hoy: una vigente (si
 * hay varias, la que dura mas; a igualdad, `active` antes que `trialing`), y si
 * ninguna lo esta, la mas reciente -- para poder decir POR QUE no hay plan.
 */
export function elegirSuscripcion(
  suscripciones: readonly SuscripcionConPlan[],
  ahora: Date = new Date(),
): SuscripcionConPlan | null {
  if (suscripciones.length === 0) return null;
  const hoy = diaRD(ahora);
  const porFin = (a: SuscripcionConPlan, b: SuscripcionConPlan) =>
    diaRD(b.currentPeriodEnd).localeCompare(diaRD(a.currentPeriodEnd))
    || (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0);
  const vigentes = suscripciones.filter((s) => vigenteEl(s, hoy)).sort(porFin);
  if (vigentes.length > 0) return vigentes[0];
  return [...suscripciones].sort(porFin)[0];
}

/**
 * Lo que se bloquea sin plan vigente. Lo comparten los mensajes de bloqueo y la
 * tarjeta del plan (Configuracion > Plan & Suscripcion y Administracion > Mi
 * Suscripcion, lote 303): una pantalla que lo dijera con otras palabras acabaria
 * diciendo otra cosa.
 */
export const LO_QUE_SE_BLOQUEA =
  'Mientras tanto no se pueden emitir e-CF, calcular, aprobar ni pagar nóminas, ' +
  'ni crear asientos manuales, usuarios o almacenes. Consultar, imprimir y guardar borradores sigue funcionando.';

/**
 * A quien se acude sin plan (lote 303). El cliente no contrata ni renueva desde la
 * aplicacion: lo hace el administrador del sistema. Antes decia "Contacte a soporte",
 * y el manual (lote 302) ya remitia al administrador.
 */
export const PARA_ACTIVAR_UN_PLAN = 'Para activar un plan, consulte con el administrador del sistema.';

/** El rotulo de una empresa sin plan: lo usan la regla y la tarjeta cuando no hay suscripcion. */
export const ROTULO_SIN_PLAN = 'Sin plan';

/** La situacion del plan de una empresa, hoy. */
export function situacionDelPlan(
  suscripciones: readonly SuscripcionConPlan[],
  ahora: Date = new Date(),
): SituacionDelPlan {
  const s = elegirSuscripcion(suscripciones, ahora);
  if (!s) {
    return {
      estado: 'sin_plan', rotulo: ROTULO_SIN_PLAN, vigente: false, suscripcionId: null, plan: null,
      diaFin: null, diasRestantes: null,
      bloqueo: {
        code: 'SIN_PLAN', status: 403,
        message: `La empresa no tiene un plan vigente. ${LO_QUE_SE_BLOQUEA} ${PARA_ACTIVAR_UN_PLAN}`,
      },
    };
  }

  const hoy = diaRD(ahora);
  const diaFin = diaRD(s.currentPeriodEnd);
  const diasRestantes = diasEntreDias(hoy, diaFin);
  const plan = { nombre: s.planName, maxEcf: s.maxEcfLimit, maxUsuarios: s.maxUsers, maxAlmacenes: s.maxWarehouses };
  const base = { suscripcionId: s.id, plan, diaFin, diasRestantes };

  if (vigenteEl(s, hoy)) {
    const prueba = s.status === 'trialing';
    return { ...base, estado: prueba ? 'prueba' : 'activo', rotulo: prueba ? 'Prueba' : 'Activo', vigente: true, bloqueo: null };
  }

  if (s.status === 'past_due') {
    return {
      ...base, estado: 'pago_pendiente', rotulo: 'Pago pendiente', vigente: false,
      bloqueo: { code: 'PLAN_VENCIDO', status: 403, message: `El ${s.planName} tiene un pago pendiente. ${LO_QUE_SE_BLOQUEA} Renueve el pago para continuar.` },
    };
  }
  if (s.status === 'canceled') {
    return {
      ...base, estado: 'cancelado', rotulo: 'Cancelado', vigente: false,
      bloqueo: { code: 'SIN_PLAN', status: 403, message: `El ${s.planName} está cancelado. ${LO_QUE_SE_BLOQUEA} ${PARA_ACTIVAR_UN_PLAN}` },
    };
  }
  if (ESTADOS_QUE_PUEDEN_ESTAR_VIGENTES.includes(s.status) && hoy < diaRD(s.currentPeriodStart)) {
    return {
      ...base, estado: 'por_empezar', rotulo: 'Por empezar', vigente: false,
      bloqueo: { code: 'SIN_PLAN', status: 403, message: `El ${s.planName} empieza el ${formatDateDisplay(diaRD(s.currentPeriodStart))}. ${LO_QUE_SE_BLOQUEA}` },
    };
  }
  //  Un estado que no se conoce no se da por vigente: tampoco se puede decir que
  //  haya vencido sin mentir sobre la fecha, asi que se dice tal cual.
  if (!ESTADOS_QUE_PUEDEN_ESTAR_VIGENTES.includes(s.status)) {
    return {
      ...base, estado: 'sin_plan', rotulo: ROTULO_SIN_PLAN, vigente: false,
      bloqueo: { code: 'SIN_PLAN', status: 403, message: `El ${s.planName} no está vigente (estado "${s.status}"). ${LO_QUE_SE_BLOQUEA}` },
    };
  }
  const prueba = s.status === 'trialing';
  return {
    ...base, estado: 'vencido', rotulo: 'Vencido', vigente: false,
    bloqueo: {
      code: 'PLAN_VENCIDO', status: 403,
      message: `${prueba ? 'La prueba gratis' : `El ${s.planName}`} venció el ${formatDateDisplay(diaFin)}. ${LO_QUE_SE_BLOQUEA} Renueve el plan para continuar.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Lo que se deja hacer
// ---------------------------------------------------------------------------

/** Si una factura ya cuenta para el limite (de PRODUCCION y salio a la DGII). */
export function cuentaParaElLimite(factura: { modo: string; status: string }): boolean {
  return factura.modo === 'PRODUCCION' && (ESTADOS_QUE_SALIERON as readonly string[]).includes(factura.status);
}

/**
 * Si se puede emitir (o enviar, o reenviar) un e-CF.
 *
 *   · `modo`: en PRUEBA no se cuenta nada -- practicar no consume el plan --,
 *     pero sin plan vigente tampoco se emite: el bloqueo es de la empresa.
 *   · `usadosEnElMes`: los e-CF de PRODUCCION que ya salieron este mes de RD.
 *   · `yaCuenta`: el envio NO añade uno -- un rechazado que se reenvia con su
 *     mismo e-NCF ya se conto cuando salio la primera vez (es la misma fila de
 *     `invoices`, y se cuenta por filas). Sin esto, corregir un rechazo con el
 *     limite lleno seria imposible, y ademas no gasta nada nuevo.
 */
export function decidirEmision(
  sit: SituacionDelPlan,
  p: { modo: ModoOperativo; usadosEnElMes: number; yaCuenta?: boolean; ahora?: Date },
): BloqueoDelPlan | null {
  if (!sit.vigente || !sit.plan) return sit.bloqueo;
  if (p.modo !== 'PRODUCCION') return null;
  const limite = sit.plan.maxEcf;
  if (limite === ILIMITADO) return null;
  const nuevo = p.yaCuenta ? 0 : 1;
  if (p.usadosEnElMes + nuevo <= limite) return null;
  return {
    code: 'LIMITE_ECF', status: 409,
    message:
      `Llegó al límite de e-CF de su plan este mes (${p.usadosEnElMes} de ${limite}). ` +
      `No se pueden emitir más hasta el ${primeroDelMesSiguiente(p.ahora ?? new Date())} o hasta ampliar el plan; ` +
      'los borradores se pueden seguir guardando.',
  };
}

/** Si se puede dar de alta (o reactivar) un usuario, con `activos` ya contados. */
export function decidirAltaDeUsuario(sit: SituacionDelPlan, activos: number): BloqueoDelPlan | null {
  if (!sit.vigente || !sit.plan) return sit.bloqueo;
  const max = sit.plan.maxUsuarios;
  if (max === ILIMITADO || activos + 1 <= max) return null;
  return {
    code: 'LIMITE_USUARIOS', status: 409,
    message: `Su plan permite ${max} usuario(s) activo(s) y ya tiene ${activos}. Desactive otro usuario o amplíe el plan.`,
  };
}

/** Si se puede crear un almacen, con `existentes` ya contados. */
export function decidirAltaDeAlmacen(sit: SituacionDelPlan, existentes: number): BloqueoDelPlan | null {
  if (!sit.vigente || !sit.plan) return sit.bloqueo;
  const max = sit.plan.maxAlmacenes;
  if (max === ILIMITADO || existentes + 1 <= max) return null;
  return {
    code: 'LIMITE_ALMACENES', status: 409,
    message: `Su plan permite ${max} almacén(es) y ya tiene ${existentes}. Amplíe el plan para crear otro.`,
  };
}

/** Uso de e-CF del mes, para la pantalla y los avisos. */
export function usoDelMes(sit: SituacionDelPlan, usados: number): {
  usados: number; limite: number | null; porcentaje: number | null; nivel: 'normal' | 'ochenta' | 'limite';
} {
  const limite = sit.plan && sit.plan.maxEcf !== ILIMITADO ? sit.plan.maxEcf : null;
  if (limite === null) return { usados, limite: null, porcentaje: null, nivel: 'normal' };
  const porcentaje = limite === 0 ? 100 : Math.floor((usados * 100) / limite);
  //  Entero: 79 de 100 no es el 80 %, y 80 de 100 si.
  const nivel = usados >= limite ? 'limite' : usados * 100 >= PORCENTAJE_AVISO_ECF * limite ? 'ochenta' : 'normal';
  return { usados, limite, porcentaje, nivel };
}

// ---------------------------------------------------------------------------
// Avisos del panel (lotes 158-160), con clave ESTABLE: se cierran solos
// ---------------------------------------------------------------------------

/**
 * Los avisos del plan. `sincronizarAvisos` los guarda por su `id` y cierra los
 * que dejen de salir, asi que basta con NO devolverlos cuando ya no aplican.
 *
 * Los del vencimiento salen en los dos modos (el plan es de la empresa: una
 * empresa en prueba gratis suele estar todavia en PRUEBA); los del limite de
 * e-CF, solo en PRODUCCION, que es lo unico que cuenta.
 */
export function avisosDelPlan(
  sit: SituacionDelPlan,
  p: { modo: ModoOperativo; usadosEnElMes: number; ahora?: Date },
): AvisoDelPanel[] {
  const ahora = p.ahora ?? new Date();
  const avisos: AvisoDelPanel[] = [];
  //  La pantalla de Configuracion no abre una pestaña por la direccion: el plan
  //  esta en su pestaña "Plan & Suscripción".
  const irAlPlan = { actionText: 'Ver el plan', actionLink: '/dashboard/settings' };

  if (!sit.vigente) {
    avisos.push({
      id: sit.suscripcionId ? `plan-vencido-${sit.suscripcionId}` : 'plan-sin-vigente',
      type: 'plan_vencido',
      title: sit.estado === 'vencido' ? 'El plan venció' : 'No hay un plan vigente',
      description: sit.bloqueo?.message ?? '',
      ...irAlPlan,
    });
    return avisos;
  }

  if (sit.diasRestantes !== null && sit.diasRestantes <= DIAS_AVISO_VENCIMIENTO) {
    const n = sit.diasRestantes;
    avisos.push({
      //  La clave lleva la suscripcion Y su ultimo dia: renovar (otro fin) cierra
      //  este aviso, y si vuelve a acercarse el vencimiento, es otro aviso.
      id: `plan-vence-${sit.suscripcionId}-${sit.diaFin}`,
      type: 'plan_por_vencer',
      title: n === 0 ? 'El plan vence hoy' : `El plan vence en ${n} día${n === 1 ? '' : 's'}`,
      description:
        `${sit.estado === 'prueba' ? 'La prueba gratis' : `El ${sit.plan?.nombre}`} vale hasta el ${formatDateDisplay(sit.diaFin)}. ` +
        'Al vencer se bloquea la emisión de e-CF, la nómina y los asientos manuales hasta renovar.',
      ...irAlPlan,
    });
  }

  if (p.modo === 'PRODUCCION') {
    const uso = usoDelMes(sit, p.usadosEnElMes);
    const { mes } = mesDeRD(ahora);
    if (uso.nivel === 'limite') {
      avisos.push({
        id: `ecf-limite-${mes}`,
        type: 'ecf_en_el_limite',
        title: 'Llegó al límite de e-CF del mes',
        description: `Ha emitido ${uso.usados} de ${uso.limite} e-CF este mes. No se pueden emitir más hasta el ${primeroDelMesSiguiente(ahora)} o hasta ampliar el plan.`,
        ...irAlPlan,
      });
    } else if (uso.nivel === 'ochenta') {
      avisos.push({
        id: `ecf-80-${mes}`,
        type: 'ecf_cerca_del_limite',
        title: `Ha usado el ${PORCENTAJE_AVISO_ECF} % de sus e-CF de este mes (${uso.usados} de ${uso.limite})`,
        description: `Al llegar a ${uso.limite} no se podrán emitir más e-CF este mes. Los borradores se pueden seguir guardando.`,
        ...irAlPlan,
      });
    }
  }
  return avisos;
}

// ---------------------------------------------------------------------------
// Configuracion > Plan & Suscripcion
// ---------------------------------------------------------------------------

/** Lo que pinta la pantalla del plan. La cuenta de e-CF es la de las guardas. */
export interface PlanParaLaPantalla {
  id: string;
  planName: string;
  maxEcfLimit: number;
  maxUsers: number;
  maxWarehouses: number;
  /** El ultimo dia de RD en que vale (aaaa-mm-dd). */
  currentPeriodEnd: string | null;
  estado: EstadoDelPlan;
  rotulo: string;
  vigente: boolean;
  diasRestantes: number | null;
  ecf: ReturnType<typeof usoDelMes>;
  /** El mes de RD de la cuenta (aaaa-mm). */
  mes: string;
  usuariosActivos: number;
  almacenes: number;
}

export function planParaLaPantalla(u: {
  situacion: SituacionDelPlan; ecf: ReturnType<typeof usoDelMes>; mes: string; usuarios: number; almacenes: number;
}): PlanParaLaPantalla | null {
  const s = u.situacion;
  if (!s.suscripcionId || !s.plan) return null;
  return {
    id: s.suscripcionId,
    planName: s.plan.nombre,
    maxEcfLimit: s.plan.maxEcf,
    maxUsers: s.plan.maxUsuarios,
    maxWarehouses: s.plan.maxAlmacenes,
    currentPeriodEnd: s.diaFin,
    estado: s.estado,
    rotulo: s.rotulo,
    vigente: s.vigente,
    diasRestantes: s.diasRestantes,
    ecf: u.ecf,
    mes: u.mes,
    usuariosActivos: u.usuarios,
    almacenes: u.almacenes,
  };
}
