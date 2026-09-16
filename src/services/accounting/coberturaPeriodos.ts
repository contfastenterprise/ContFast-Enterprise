/**
 * Cuanto futuro cubren los periodos contables, y que meses faltan.
 *
 * POR QUE EXISTE (lote 145)
 * -------------------------
 * `isPeriodOpen` rechaza un asiento sin periodo abierto, y hace bien: desde
 * JRN-11 un control no crea el dato que valida. Pero nadie creaba periodos
 * nuevos. `sembrarPeriodosContables` corria solo al dar de alta la empresa, y
 * sembraba hasta DICIEMBRE de ese año. Medido el 2026-09-16: las 6 empresas, en
 * los dos modos, terminan el 31/12/2026. El 01/01/2027 ninguna podria registrar
 * una factura, una compra ni un cobro -- lo mismo que le paso a Latin Doors el
 * 1 de agosto de 2026, ahora a todas a la vez.
 *
 * Y crear un periodo a mano no validaba nada: ni que el inicio fuera anterior
 * al fin, ni que no se pisara con otro. Asi nacio "periodo 2026" (01/08 a
 * 31/12), que se pisa con los mensuales de septiembre a diciembre -- y con el
 * abierto, cerrar septiembre no cierra septiembre.
 *
 * Aqui solo se calcula. Crear es una accion deliberada (boton "Abrir los
 * proximos 12 meses") y el aviso del panel de inicio la pide a tiempo.
 */

/** Meses que abre de una vez el boton, y que siembra una empresa nueva. */
export const MESES_A_ABRIR = 12;

/** Con menos dias cubiertos que esto, el panel de inicio avisa. */
export const DIAS_AVISO_PERIODOS = 45;

export interface RangoDePeriodo {
  startDate: string; // AAAA-MM-DD
  endDate: string;   // AAAA-MM-DD
}

export interface PeriodoNuevo extends RangoDePeriodo {
  name: string; // MM/AAAA
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** AAAA-MM-DD de una fecha, en hora local (sin pasar por UTC). */
export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

/** Si dos rangos de fechas comparten al menos un dia. Las fechas AAAA-MM-DD se comparan como texto. */
export function seSolapan(a: RangoDePeriodo, b: RangoDePeriodo): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Por que no se puede crear un periodo, o `null` si se puede. */
export function motivoParaNoCrearPeriodo(nuevo: RangoDePeriodo, existentes: Array<RangoDePeriodo & { name?: string }>): string | null {
  if (nuevo.startDate > nuevo.endDate) {
    return 'La fecha de inicio del período es posterior a la de fin.';
  }
  const pisado = existentes.find((p) => seSolapan(nuevo, p));
  if (pisado) {
    return `El período se pisa con "${pisado.name ?? `${pisado.startDate} a ${pisado.endDate}`}" (${pisado.startDate} a ${pisado.endDate}). ` +
      'Dos períodos sobre las mismas fechas hacen que cerrar uno no cierre esas fechas.';
  }
  return null;
}

/**
 * Los periodos mensuales que faltan desde el mes de `desde` y los `meses`
 * siguientes, cruzando de año. Un mes que ya toca CUALQUIER periodo existente
 * -- mensual o no, abierto o cerrado -- no se crea: se pisarian.
 */
export function mesesQueFaltan(existentes: RangoDePeriodo[], desde: Date, meses: number = MESES_A_ABRIR): PeriodoNuevo[] {
  const faltan: PeriodoNuevo[] = [];
  for (let i = 0; i < meses; i++) {
    const inicio = new Date(desde.getFullYear(), desde.getMonth() + i, 1);
    const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0);
    const mes: PeriodoNuevo = {
      name: `${dosDigitos(inicio.getMonth() + 1)}/${inicio.getFullYear()}`,
      startDate: fechaLocal(inicio),
      endDate: fechaLocal(fin),
    };
    if (!existentes.some((p) => seSolapan(mes, p))) faltan.push(mes);
  }
  return faltan;
}

/**
 * Cuantos dias seguidos, desde hoy incluido, cubren los periodos ABIERTOS.
 * 0 si hoy no tiene periodo abierto. Mira la cobertura seguida: un hueco a
 * mitad corta la cuenta, porque en el hueco tampoco se podra asentar.
 */
export function diasDeCobertura(abiertos: RangoDePeriodo[], hoy: Date): number {
  const unDia = 24 * 60 * 60 * 1000;
  let dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let dias = 0;
  // Tope de dos años: mas alla no cambia ninguna decision y evita un bucle largo.
  for (let i = 0; i < 731; i++) {
    const texto = fechaLocal(dia);
    const cubre = abiertos.find((p) => p.startDate <= texto && texto <= p.endDate);
    if (!cubre) break;
    // Salta al dia siguiente al fin del periodo que cubre.
    const [a, m, d] = cubre.endDate.split('-').map(Number);
    const siguiente = new Date(a, m - 1, d + 1);
    dias += Math.round((siguiente.getTime() - dia.getTime()) / unDia);
    dia = siguiente;
  }
  return dias;
}
