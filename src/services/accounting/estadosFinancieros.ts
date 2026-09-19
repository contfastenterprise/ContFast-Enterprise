/**
 * El balance general y el estado de resultados, armados desde la balanza.
 *
 * POR QUE EXISTE (lote 164)
 * -------------------------
 * `getFinancials` sumaba como total solo las cuentas de NIVEL 1, y la balanza
 * da cada cuenta con lo SUYO (sin acumular hijas). Desde el lote 136 solo se
 * asienta en cuentas transaccionales (nivel 3-4), asi que los totales salian en
 * cero. Medido el 2026-09-19, Latin Doors PRODUCCION 2026: la pantalla decia
 * "Total ingresos 0,00" con 3.521.728,32 asentados, y "Total gastos 5,10" con
 * 3.254.963,51.
 *
 * Y habia dos defectos mas debajo:
 *  - El signo salia de la NATURALEZA de cada cuenta. Tres pasivos de Latin
 *    Doors (2.1.03 ITBIS por Pagar, 2.1.04 ISR Retenido, 2.1.05 ITBIS Retenido)
 *    estan en el catalogo como DEUDORAS, y salian en negativo: -628.685,95. Con
 *    el signo del TIPO (activo y gasto: debe - haber; pasivo, capital e
 *    ingreso: haber - debe) salen bien, y una cuenta correctora (depreciacion
 *    acumulada: activo acreedor) resta como debe restar.
 *  - El estado de resultados usaba el saldo ACUMULADO bajo el titulo "del
 *    periodo". Ahora es el movimiento del rango.
 *
 * Con esto, en Latin Doors: activos 1.211.409,01 = pasivos 944.644,20 +
 * capital 0 + resultado 266.764,81. Cuadra al centavo.
 *
 * Cada fila de grupo suma sus hijas (por `parentId`) mas lo suyo; los totales
 * suman cada cuenta UNA vez, sin mirar el nivel. Todo en centavos enteros.
 * Sin base de datos.
 */

export type TipoCuenta = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/** Una fila de la balanza (`AccountingRepository.getTrialBalance`). */
export interface FilaBalanza {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  level: number;
  isTransactional?: boolean | null;
  parentId?: string | null;
  /** Saldo antes del rango, con el signo de la NATURALEZA de la cuenta. */
  beginningBalance: number;
  /** Movimientos dentro del rango. */
  debit: number;
  credit: number;
}

export interface FilaEstado extends FilaBalanza {
  /** Lo que se enseña: la cuenta con sus hijas, con el signo de su TIPO. */
  endingBalance: number;
  /** Solo lo asentado en esta misma cuenta, con el signo de su tipo. */
  propio: number;
}

const c = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) : 0);
const pesos = (centavos: number) => centavos / 100;

/** +1 si el tipo es de saldo deudor (activo, gasto); -1 si acreedor. */
const signoDelTipo = (tipo: string) => (tipo === 'asset' || tipo === 'expense' ? 1 : -1);
/** +1 si la cuenta esta marcada deudora; -1 si acreedora. */
const signoDeNaturaleza = (naturaleza: string) => (naturaleza === 'credit' ? -1 : 1);

/**
 * Debe menos haber de la cuenta, en centavos: antes del rango (el saldo
 * inicial viene con el signo de la naturaleza, se deshace) y dentro de el.
 */
function netoDeudor(f: FilaBalanza) {
  const antes = signoDeNaturaleza(f.nature) * c(f.beginningBalance);
  const rango = c(f.debit) - c(f.credit);
  return { antes, rango, alCierre: antes + rango };
}

/**
 * Acumula cada cuenta en sus antepasados. `valor` da lo propio de cada cuenta;
 * devuelve, por id, lo propio mas lo de todas sus descendientes. Un padre que
 * no esta en la lista se ignora; un ciclo en el catalogo no cuelga el calculo.
 */
function acumular(filas: FilaBalanza[], valor: (f: FilaBalanza) => number): Map<string, number> {
  const porId = new Map(filas.map((f) => [f.id, f]));
  const total = new Map<string, number>(filas.map((f) => [f.id, 0]));
  for (const f of filas) {
    const v = valor(f);
    if (v === 0) continue;
    const vistos = new Set<string>();
    let actual: FilaBalanza | undefined = f;
    while (actual && !vistos.has(actual.id)) {
      vistos.add(actual.id);
      total.set(actual.id, (total.get(actual.id) ?? 0) + v);
      actual = actual.parentId ? porId.get(actual.parentId) : undefined;
    }
  }
  return total;
}

export function armarEstadosFinancieros(filas: FilaBalanza[]) {
  const deTipo = (tipos: string[]) => filas.filter((f) => tipos.includes(f.type));

  // Balance general: saldos al cierre del rango.
  const balance = deTipo(['asset', 'liability', 'equity']);
  const alCierre = (f: FilaBalanza) => signoDelTipo(f.type) * netoDeudor(f).alCierre;
  const balanceAcumulado = acumular(balance, alCierre);

  // Estado de resultados: solo el movimiento del rango.
  const resultados = deTipo(['revenue', 'expense']);
  const delRango = (f: FilaBalanza) => signoDelTipo(f.type) * netoDeudor(f).rango;
  const resultadosAcumulado = acumular(resultados, delRango);

  // Totales: cada cuenta UNA vez, por su tipo, sin mirar el nivel.
  const suma = (tipo: TipoCuenta, v: (f: FilaBalanza) => number) =>
    filas.filter((f) => f.type === tipo).reduce((s, f) => s + v(f), 0);

  const activos = suma('asset', alCierre);
  const pasivos = suma('liability', alCierre);
  const capital = suma('equity', alCierre);
  const ingresosRango = suma('revenue', delRango);
  const gastosRango = suma('expense', delRango);
  // En el balance el resultado es el ACUMULADO al cierre (no hay asientos de
  // cierre de ejercicio): sin el, la ecuacion no cierra.
  const resultadoAcumulado = suma('revenue', alCierre) - suma('expense', alCierre);
  const diferencia = activos - (pasivos + capital + resultadoAcumulado);

  const fila = (f: FilaBalanza, acumulado: Map<string, number>, propio: (f: FilaBalanza) => number): FilaEstado => ({
    ...f,
    endingBalance: pesos(acumulado.get(f.id) ?? 0),
    propio: pesos(propio(f)),
  });

  return {
    balanceSheet: {
      rows: balance.map((f) => fila(f, balanceAcumulado, alCierre)),
      totals: {
        assets: pesos(activos),
        liabilities: pesos(pasivos),
        equity: pesos(capital),
        /** Resultado acumulado al cierre, sin asientos de cierre. */
        netIncome: pesos(resultadoAcumulado),
        /** Activos - (pasivos + capital + resultado). 0 si el balance cuadra. */
        diferencia: pesos(diferencia),
      },
    },
    incomeStatement: {
      rows: resultados.map((f) => fila(f, resultadosAcumulado, delRango)),
      totals: {
        revenues: pesos(ingresosRango),
        expenses: pesos(gastosRango),
        netIncome: pesos(ingresosRango - gastosRango),
      },
    },
  };
}
