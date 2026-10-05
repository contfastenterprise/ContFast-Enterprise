/**
 * Lote 290: la escala del ISR de los asalariados, en UN sitio y con su fuente.
 *
 * Por que existe: `isr_brackets` estaba VACIA en PRODUCCION (medido el
 * 2026-10-04, solo lectura) y, con la escala vacia, el calculo daba un ISR de 0
 * sin decir nada. La escala la sembraba `src/db/run-migration.ts`, que nunca se
 * corrio contra esa base. Ahora:
 *  - la escala vive aqui (de aqui la toman `run-migration.ts`, la semilla de la
 *    base desechable y el guion de datos que la carga en las bases existentes);
 *  - el calculo de la nomina NO lleva ningun tramo escrito: lee la tabla, y si
 *    no hay NINGUNA escala del año de la nomina o anterior se niega
 *    (`motivoSinEscala`) en vez de calcular 0 ("nada estatico", lote 171).
 *
 * `isr_brackets` es GLOBAL (sin `company_id`): la escala es de la ley, la misma
 * para las seis empresas. Por eso no se siembra al crear una empresa.
 *
 * FUENTE (comprobada el 2026-10-04):
 *   DGII, centro de ayuda, CA687 "¿Cuál es la escala salarial correspondiente al
 *   año 2026 del Impuesto Sobre la Renta (ISR)?", publicada el 16/01/2026:
 *   https://ayuda.dgii.gov.do/conversations/impuesto-sobre-la-renta-isr/ca687-cul-es-la-escala-salarial-correspondiente-al-ao-2026-del-impuesto-sobre-la-renta-isr/696a664277932619036537b8
 *   Base legal: Ley 11-92 (Codigo Tributario), art. 296, modificado por la
 *   Ley 30-26, art. 10. Resolucion DDG-AR1-2026-00001.
 *
 *   | Renta neta anual              | Tasa                                              |
 *   |-------------------------------|---------------------------------------------------|
 *   | hasta 416.220,00              | exento                                            |
 *   | 416.220,01 a 624.329,00       | 15 % del excedente de 416.220,01                  |
 *   | 624.329,01 a 867.123,00       | 31.216,00 + 20 % del excedente de 624.329,01      |
 *   | 867.123,01 en adelante        | 79.776,00 + 25 % del excedente de 867.123,01      |
 *
 * VIGENCIA: año fiscal 2026. La misma DGII avisa de que las modificaciones de
 * la Ley 30-26 (art. 10) a los tramos rigen a partir del año fiscal 2027. La
 * primera version de este lote exigia por eso la escala del AÑO EXACTO; el
 * contador decidio otra cosa (via el dueño, 2026-10-04): "por ahora seguiremos
 * con la escala de 2026". Regla (`escalaParaLaNomina`): la del año de la nomina
 * si esta cargada; si no, la MAS RECIENTE ANTERIOR, y el calculo y la pantalla
 * AVISAN de que año se uso (`avisoDeEscala`), sin negarse. Solo se niega si no
 * hay ninguna del año o anterior. La de 2027 se añade aqui, con su fuente,
 * cuando la DGII la publique.
 *
 * El `desde` de cada tramo es el "excedente de" que publica la DGII (416.220,01,
 * no 416.220,00): el calculo resta `desde`, asi que se transcribe tal cual.
 */

export interface TramoIsr {
  /** Renta neta anual desde la que aplica, y "excedente de" sobre el que se cobra el porcentaje. */
  desde: number;
  /** Hasta donde llega el tramo; `null` en el ultimo. */
  hasta: number | null;
  /** Importe fijo anual del tramo. */
  fijo: number;
  /** Porcentaje sobre el excedente (15 = 15 %). */
  porcentaje: number;
}

export interface EscalaIsr {
  anio: number;
  tramos: readonly TramoIsr[];
  fuente: string;
}

export const ESCALAS_ISR_ASALARIADOS: readonly EscalaIsr[] = [
  {
    anio: 2026,
    fuente: 'DGII, CA687 (16/01/2026), Ley 11-92 art. 296 mod. por Ley 30-26 art. 10',
    tramos: [
      { desde: 0, hasta: 416220.0, fijo: 0, porcentaje: 0 },
      { desde: 416220.01, hasta: 624329.0, fijo: 0, porcentaje: 15 },
      { desde: 624329.01, hasta: 867123.0, fijo: 31216.0, porcentaje: 20 },
      { desde: 867123.01, hasta: null, fijo: 79776.0, porcentaje: 25 },
    ],
  },
];

/** La escala conocida de un año, o `null` si este fichero no la tiene. */
export function escalaDelAnio(anio: number): EscalaIsr | null {
  return ESCALAS_ISR_ASALARIADOS.find((e) => e.anio === anio) ?? null;
}

/**
 * El año fiscal de una nomina: el de su fin de periodo, leido del texto
 * `AAAA-MM-DD`. No con `new Date(...).getFullYear()`: la cadena se interpreta
 * como medianoche UTC y en RD (UTC-4) el 01/01 seria todavia el año anterior.
 */
export function anioDeLaNomina(periodEnd: string): number {
  const anio = Number(String(periodEnd).slice(0, 4));
  if (!Number.isInteger(anio) || anio < 1900) throw new Error(`Fecha de fin de periodo no valida: ${periodEnd}`);
  return anio;
}

/** El mensaje cuando la tabla no tiene ninguna escala del año de la nomina ni anterior. */
export function motivoSinEscala(anio: number): string {
  return `Falta la escala del ISR de ${anio}: la tabla de tramos del ISR de asalariados no tiene ese año ni ninguno anterior, `
    + 'y calcular la nómina sin ella retendría un ISR de 0. Hay que cargar la escala vigente de la DGII antes de calcular.';
}

/**
 * Que escala usa una nomina, de las cargadas en la tabla: la de su año si esta;
 * si no, la mas reciente ANTERIOR (decision del contador, 2026-10-04). Una
 * posterior nunca. `null` si no hay ninguna del año o anterior (se niega).
 */
export function escalaParaLaNomina(aniosCargados: readonly number[], anioNomina: number): number | null {
  let elegido: number | null = null;
  for (const a of aniosCargados) {
    if (a <= anioNomina && (elegido === null || a > elegido)) elegido = a;
  }
  return elegido;
}

/** El aviso cuando la escala usada no es la del año de la nomina; `null` si lo es. */
export function avisoDeEscala(anioUsado: number, anioNomina: number): string | null {
  if (anioUsado === anioNomina) return null;
  return `ISR calculado con la escala de ${anioUsado}: la de ${anioNomina} no está cargada en el sistema. `
    + `Revísela cuando la DGII publique la de ${anioNomina}.`;
}

/** Una fila de `isr_brackets` tal como llega de la base (los `decimal` como texto). */
export interface FilaIsr {
  fromAmount: string | number;
  toAmount: string | number | null;
  fixedAmount: string | number;
  percentage: string | number;
}

const centavos = (n: string | number | null) => (n === null ? null : Math.round(Number(n) * 100));

/**
 * Que hay que hacer para que la tabla tenga la escala de un año (lo usa el
 * guion de datos, que ensaya por defecto):
 *  - `insertar`: la tabla no tiene ese año; se insertan sus tramos;
 *  - `nada`: ya tiene exactamente esos tramos;
 *  - `distinta`: tiene OTROS tramos para ese año. No se pisan: lo que haya en
 *    la tabla lo puso alguien, y decidir cual vale es del contador.
 */
export function planDeSiembra(existentes: readonly FilaIsr[], escala: EscalaIsr): 'insertar' | 'nada' | 'distinta' {
  if (existentes.length === 0) return 'insertar';
  const clave = (f: { desde: number | null; hasta: number | null; fijo: number | null; porcentaje: number | null }) =>
    `${f.desde}|${f.hasta}|${f.fijo}|${f.porcentaje}`;
  const deLaTabla = existentes
    .map((f) => clave({ desde: centavos(f.fromAmount), hasta: centavos(f.toAmount), fijo: centavos(f.fixedAmount), porcentaje: centavos(f.percentage) }))
    .sort();
  const deLaLey = escala.tramos
    .map((t) => clave({ desde: centavos(t.desde), hasta: centavos(t.hasta), fijo: centavos(t.fijo), porcentaje: centavos(t.porcentaje) }))
    .sort();
  return deLaTabla.length === deLaLey.length && deLaTabla.every((c, i) => c === deLaLey[i]) ? 'nada' : 'distinta';
}

/** Las filas a insertar en `isr_brackets` para una escala (los `decimal` como texto). */
export function filasDeLaEscala(escala: EscalaIsr) {
  return escala.tramos.map((t) => ({
    year: escala.anio,
    fromAmount: t.desde.toFixed(2),
    toAmount: t.hasta === null ? null : t.hasta.toFixed(2),
    fixedAmount: t.fijo.toFixed(2),
    percentage: t.porcentaje.toFixed(2),
  }));
}
