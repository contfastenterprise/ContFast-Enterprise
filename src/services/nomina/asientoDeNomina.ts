/**
 * Lote 293 (el "lote C" de `docs/diseno_asientos_nomina.md`): el asiento de
 * DEVENGO de una nomina, que se registra al aprobarla. Puro: sin base de datos,
 * para que el banco lo pueda ejecutar.
 *
 * Que asienta (decisiones D1 y D10 del diseno): UNO por nomina, con los
 * importes sumados de todos sus empleados, fechado el FIN del periodo.
 *
 *   Debe   Sueldos y salarios ............ Σ bruto
 *   Debe   Aportes patronales TSS ........ Σ (AFP + SFS + SRL del empleador)
 *   Debe   Infotep ....................... Σ Infotep del empleador
 *   Haber  Sueldos por pagar ............. Σ neto
 *   Haber  TSS por pagar ................. Σ (AFP + SFS del empleado + AFP + SFS + SRL del empleador)
 *   Haber  ISR retenido por pagar (IR-3) . Σ ISR
 *   Haber  Infotep por pagar ............. Σ Infotep
 *   Haber  Otras deducciones ............. Σ otras deducciones
 *
 * Las cifras son las que la nomina GUARDO al calcularse (`payroll_details`):
 * aqui no se recalcula nada. Las decisiones del contador (la TSS no cotiza
 * horas extra ni bonos, no hay Infotep del empleado, el salario minimo de los
 * topes) ya estan en esos importes; el asiento solo los refleja.
 *
 * LOS REDONDEOS, Y POR QUE NO SE AJUSTA NADA
 * -----------------------------------------
 * Todo se suma en CENTAVOS enteros, no en coma flotante: cada importe guardado
 * es un `decimal(18,2)`, asi que en centavos la suma es exacta y no hay
 * redondeo que repartir. El asiento cuadra por construccion SI cada linea del
 * detalle cumple `neto = bruto - AFP - SFS - ISR - otras` al centavo, que es lo
 * que guarda el calculo (cada componente se redondea antes de restar).
 *
 * Si una linea NO lo cumple (un detalle tocado a mano, o calculado por una
 * version vieja del codigo), el asiento descuadraria en esa diferencia. No se
 * absorbe en ninguna cuenta: una diferencia de centavos metida en "Sueldos por
 * pagar" haria que el libro dijera que se debe al empleado algo distinto de lo
 * que dice su volante. Se NIEGA la aprobacion nombrando a los empleados cuya
 * linea no cuadra, para que se recalcule. Lo mismo con un importe negativo.
 *
 * Las cuentas no salen de aqui: llegan resueltas por clave (las del lote 292,
 * `CUENTAS_DEL_SISTEMA`, categoria `nomina`). Este modulo no conoce ningun
 * codigo de cuenta.
 */
import { CUENTAS_DEL_SISTEMA } from '@/services/accounting/cuentasDelSistema';

/** Las claves de Cuentas Puente que usa el asiento (lote 292). */
export type ClaveDeNomina =
  | 'payroll_salaries_expense'
  | 'payroll_employer_tss_expense'
  | 'payroll_infotep_expense'
  | 'payroll_salaries_payable'
  | 'payroll_tss_payable'
  | 'payroll_isr_payable'
  | 'payroll_infotep_payable'
  | 'payroll_other_deductions';

/** Una linea de `payroll_details`, tal como llega de la base (texto) o en numero. */
export interface ImportesDelDetalle {
  /** Para nombrar al empleado si su linea no cuadra. */
  empleado?: string;
  grossSalary: string | number;
  netSalary: string | number;
  afp: string | number;
  sfs: string | number;
  isr: string | number;
  otherDeductions: string | number;
  afpEmployer: string | number;
  sfsEmployer: string | number;
  riskEmployer: string | number;
  infotepEmployer: string | number;
}

/** Los ocho importes del asiento, en centavos. */
export interface TotalesDeNomina {
  bruto: number;
  patronalTss: number;
  infotep: number;
  neto: number;
  tssPorPagar: number;
  isr: number;
  otras: number;
}

export interface LineaDelAsiento {
  clave: ClaveDeNomina;
  accountId: string;
  debit: number;
  credit: number;
}

export type ResultadoDelAsiento =
  | { ok: true; lineas: LineaDelAsiento[]; totales: TotalesDeNomina; total: number }
  | { ok: false; motivo: string };

/** Importe guardado -> centavos enteros. `NaN` si no es un numero. */
export function aCentavos(valor: string | number): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 100);
}

const aPesos = (centavos: number) => centavos / 100;

/** Las ocho claves, en el orden de la tabla (no escritas a mano: salen de ella). */
export const CLAVES_DE_NOMINA: readonly ClaveDeNomina[] = CUENTAS_DEL_SISTEMA
  .filter((c) => c.categoria === 'nomina')
  .map((c) => c.clave as ClaveDeNomina);

/** Como se llama una clave en la pantalla de Cuentas Puente. */
export function etiquetaDeClave(clave: string): string {
  return CUENTAS_DEL_SISTEMA.find((c) => c.clave === clave)?.etiqueta ?? clave;
}

/**
 * Suma el detalle en centavos y comprueba cada linea. `motivo` si alguna linea
 * no cuadra o trae un importe que no es un numero no negativo.
 */
export function totalesDeNomina(detalles: readonly ImportesDelDetalle[]): { ok: true; totales: TotalesDeNomina } | { ok: false; motivo: string } {
  if (detalles.length === 0) {
    return { ok: false, motivo: 'La nómina no tiene ninguna línea de detalle: no hay nada que asentar.' };
  }
  const t: TotalesDeNomina = { bruto: 0, patronalTss: 0, infotep: 0, neto: 0, tssPorPagar: 0, isr: 0, otras: 0 };
  const descuadradas: string[] = [];
  const invalidas: string[] = [];

  detalles.forEach((d, i) => {
    const nombre = d.empleado || `línea ${i + 1}`;
    const v = {
      bruto: aCentavos(d.grossSalary),
      neto: aCentavos(d.netSalary),
      afp: aCentavos(d.afp),
      sfs: aCentavos(d.sfs),
      isr: aCentavos(d.isr),
      otras: aCentavos(d.otherDeductions),
      afpE: aCentavos(d.afpEmployer),
      sfsE: aCentavos(d.sfsEmployer),
      srl: aCentavos(d.riskEmployer),
      infotep: aCentavos(d.infotepEmployer),
    };
    if (Object.values(v).some((x) => !Number.isFinite(x) || x < 0)) {
      invalidas.push(nombre);
      return;
    }
    if (v.bruto - v.afp - v.sfs - v.isr - v.otras !== v.neto) {
      const dif = v.bruto - v.afp - v.sfs - v.isr - v.otras - v.neto;
      descuadradas.push(`${nombre} (${dif > 0 ? '+' : ''}${aPesos(dif).toFixed(2)})`);
    }
    const patronal = v.afpE + v.sfsE + v.srl;
    t.bruto += v.bruto;
    t.patronalTss += patronal;
    t.infotep += v.infotep;
    t.neto += v.neto;
    t.tssPorPagar += v.afp + v.sfs + patronal;
    t.isr += v.isr;
    t.otras += v.otras;
  });

  if (invalidas.length > 0) {
    return {
      ok: false,
      motivo: `El detalle de la nómina trae importes negativos o que no son números (${invalidas.join(', ')}). Recalcule la nómina antes de aprobarla.`,
    };
  }
  if (descuadradas.length > 0) {
    return {
      ok: false,
      motivo:
        `El detalle de la nómina no cuadra: en ${descuadradas.join(', ')} el neto no es el bruto menos AFP, SFS, ISR y otras deducciones. ` +
        'El asiento no se registra descuadrado ni se ajusta la diferencia en ninguna cuenta. Recalcule la nómina y vuelva a aprobarla.',
    };
  }
  return { ok: true, totales: t };
}

/** Las claves que el asiento necesita: solo las de los importes que no son cero. */
export function clavesNecesarias(t: TotalesDeNomina): ClaveDeNomina[] {
  const usadas: [ClaveDeNomina, number][] = [
    ['payroll_salaries_expense', t.bruto],
    ['payroll_employer_tss_expense', t.patronalTss],
    ['payroll_infotep_expense', t.infotep],
    ['payroll_salaries_payable', t.neto],
    ['payroll_tss_payable', t.tssPorPagar],
    ['payroll_isr_payable', t.isr],
    ['payroll_infotep_payable', t.infotep],
    ['payroll_other_deductions', t.otras],
  ];
  return usadas.filter(([, importe]) => importe !== 0).map(([clave]) => clave);
}

/**
 * El motivo de no poder asentar porque faltan cuentas enlazadas; `null` si no
 * falta ninguna. Nombra cada cuenta como la llama la pantalla.
 */
export function motivoDeCuentasFaltantes(faltan: readonly string[]): string | null {
  if (faltan.length === 0) return null;
  const nombres = faltan.map((c) => `"${etiquetaDeClave(c)}"`).join(', ');
  return (
    `No se puede aprobar la nómina: la empresa no tiene enlazada${faltan.length === 1 ? ' la cuenta' : 's las cuentas'} de nómina ${nombres}, ` +
    `y sin ${faltan.length === 1 ? 'ella' : 'ellas'} no se puede registrar su asiento. Enlácela${faltan.length === 1 ? '' : 's'} en Configuración > Cuentas Puente (bloque Nómina), ` +
    'o pida que se lance el guion que completa las cuentas del sistema de la empresa.'
  );
}

/**
 * Las lineas del asiento, en pesos, sin ceros (`createJournalEntry` rechaza una
 * linea en cero) y con las del mismo lado y la misma cuenta juntas: si el
 * contador apunta dos claves a una sola cuenta (D8: TSS e Infotep juntos),
 * sale una linea, no dos.
 */
export function lineasDelAsiento(t: TotalesDeNomina, cuentas: Readonly<Partial<Record<ClaveDeNomina, string>>>): ResultadoDelAsiento {
  const crudas: { clave: ClaveDeNomina; lado: 'debe' | 'haber'; centavos: number }[] = [
    { clave: 'payroll_salaries_expense', lado: 'debe', centavos: t.bruto },
    { clave: 'payroll_employer_tss_expense', lado: 'debe', centavos: t.patronalTss },
    { clave: 'payroll_infotep_expense', lado: 'debe', centavos: t.infotep },
    { clave: 'payroll_salaries_payable', lado: 'haber', centavos: t.neto },
    { clave: 'payroll_tss_payable', lado: 'haber', centavos: t.tssPorPagar },
    { clave: 'payroll_isr_payable', lado: 'haber', centavos: t.isr },
    { clave: 'payroll_infotep_payable', lado: 'haber', centavos: t.infotep },
    { clave: 'payroll_other_deductions', lado: 'haber', centavos: t.otras },
  ];

  const faltan = crudas.filter((l) => l.centavos !== 0 && !cuentas[l.clave]).map((l) => l.clave);
  const motivoFaltan = motivoDeCuentasFaltantes(faltan);
  if (motivoFaltan) return { ok: false, motivo: motivoFaltan };

  const juntas = new Map<string, { clave: ClaveDeNomina; accountId: string; lado: 'debe' | 'haber'; centavos: number }>();
  for (const l of crudas) {
    if (l.centavos === 0) continue;
    const accountId = cuentas[l.clave] as string;
    const llave = `${l.lado}:${accountId}`;
    const previa = juntas.get(llave);
    if (previa) previa.centavos += l.centavos;
    else juntas.set(llave, { clave: l.clave, accountId, lado: l.lado, centavos: l.centavos });
  }

  const debe = [...juntas.values()].filter((l) => l.lado === 'debe').reduce((s, l) => s + l.centavos, 0);
  const haber = [...juntas.values()].filter((l) => l.lado === 'haber').reduce((s, l) => s + l.centavos, 0);
  if (debe !== haber) {
    // No deberia pasar si `totalesDeNomina` dio el detalle por bueno; se
    // comprueba igual porque es la promesa del modulo: nunca descuadrado.
    return {
      ok: false,
      motivo: `El asiento de la nómina no cuadra (debe ${aPesos(debe).toFixed(2)}, haber ${aPesos(haber).toFixed(2)}). No se registra.`,
    };
  }
  if (debe === 0) {
    return { ok: false, motivo: 'La nómina no tiene importes: no hay nada que asentar.' };
  }

  const lineas = [...juntas.values()].map((l) => ({
    clave: l.clave,
    accountId: l.accountId,
    debit: l.lado === 'debe' ? aPesos(l.centavos) : 0,
    credit: l.lado === 'haber' ? aPesos(l.centavos) : 0,
  }));
  return { ok: true, lineas, totales: t, total: aPesos(debe) };
}

/** Todo de una vez: del detalle guardado y las cuentas resueltas, al asiento. */
export function asientoDeNomina(
  detalles: readonly ImportesDelDetalle[],
  cuentas: Readonly<Partial<Record<ClaveDeNomina, string>>>,
): ResultadoDelAsiento {
  const r = totalesDeNomina(detalles);
  if (!r.ok) return r;
  return lineasDelAsiento(r.totales, cuentas);
}

const FRECUENCIAS: Record<string, string> = { mensual: 'mensual', quincenal: 'quincenal', semanal: 'semanal' };

/**
 * La descripcion del asiento, legible: "Nómina quincenal 01-15/10/2026". Si el
 * periodo cruza de mes o de año, las dos fechas enteras.
 */
export function descripcionDelAsiento(periodStart: string, periodEnd: string, frequency: string): string {
  const [ai, mi, di] = periodStart.slice(0, 10).split('-');
  const [af, mf, df] = periodEnd.slice(0, 10).split('-');
  const freq = FRECUENCIAS[frequency] ?? frequency;
  const rango = ai === af && mi === mf
    ? `${di}-${df}/${mf}/${af}`
    : `${di}/${mi}/${ai}-${df}/${mf}/${af}`;
  return `Nómina ${freq} ${rango}`.replace(/\s+/g, ' ').trim();
}

/** La fecha del asiento (D10): el fin del periodo, 'aaaa-MM-dd'. */
export function fechaDelAsiento(periodEnd: string): string {
  return periodEnd.slice(0, 10);
}

/** El motivo cuando el periodo contable de esa fecha no esta abierto. */
export function motivoPeriodoNoAbierto(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return (
    `No se puede aprobar la nómina: su asiento va con la fecha de fin del período (${d}-${m}-${a}) y en esa fecha no hay un período contable abierto, ` +
    'porque está cerrado o no se ha abierto todavía. Si el período está cerrado, la nómina no se aprueba en el sistema: el contador la asienta a mano. ' +
    'Si no se ha abierto, ábralo en Contabilidad > Períodos y vuelva a aprobarla.'
  );
}
