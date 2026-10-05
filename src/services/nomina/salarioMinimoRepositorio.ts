/**
 * Lote 290: leer, guardar y sembrar el salario minimo de los topes de la TSS
 * (`payroll_configs.salario_minimo_tss`, migracion 0020).
 *
 * La columna NO esta en el esquema de Drizzle, a proposito (la leccion de las
 * 0013 y 0015: la nomina lee la fila entera de `payroll_configs`). Se mira si
 * existe ANTES de nombrarla, como `hayNivelDePrecio` (lote 266):
 *  - leer nunca lanza: sin columna, o sin valor, el calculo usa 10.000
 *    (`SALARIO_MINIMO_TSS_POR_DEFECTO`, decision del contador);
 *  - sembrar sin columna no hace nada (la empresa se crea igual);
 *  - guardar sin columna lo dice (409, nombrando la migracion).
 */
import { sql } from 'drizzle-orm';
import { db, type DbOTx } from '@/db';
import { NominaNoPermitidaError } from './estadoDeNomina';
import {
  SALARIO_MINIMO_TSS_POR_DEFECTO,
  MOTIVO_SIN_COLUMNA_SALARIO_MINIMO,
  salarioMinimoEfectivo,
  salarioMinimoValido,
} from './topesTss';

let columnaVista = false;
export async function haySalarioMinimo(tx: DbOTx = db): Promise<boolean> {
  if (columnaVista) return true;
  const filas = (await tx.execute(sql`SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_configs' AND column_name = 'salario_minimo_tss' LIMIT 1`)) as unknown as unknown[];
  columnaVista = filas.length > 0;
  return columnaVista;
}

/** Solo para los bancos: olvidar que la columna se vio (para simular la base sin la 0020). */
export function olvidarColumnaSalarioMinimo() {
  columnaVista = false;
}

export interface SalarioMinimoLeido {
  /** El que usa el calculo. */
  valor: number;
  /** Si es el de la empresa (`true`) o el de por defecto. */
  guardado: boolean;
  /** Si la base tiene la columna (migracion 0020 aplicada). */
  hayColumna: boolean;
}

/** El salario minimo de los topes de una empresa. Nunca lanza por falta de columna. */
export async function leerSalarioMinimo(companyId: string, tx: DbOTx = db): Promise<SalarioMinimoLeido> {
  if (!(await haySalarioMinimo(tx))) return { valor: SALARIO_MINIMO_TSS_POR_DEFECTO, guardado: false, hayColumna: false };
  const filas = (await tx.execute(sql`SELECT salario_minimo_tss::text AS valor FROM payroll_configs
    WHERE company_id = ${companyId}::uuid LIMIT 1`)) as unknown as Array<{ valor: string | null }>;
  const guardado = salarioMinimoValido(filas[0]?.valor);
  return { valor: salarioMinimoEfectivo(filas[0]?.valor), guardado: guardado !== null, hayColumna: true };
}

/** Guarda el salario minimo de la empresa (la fila de `payroll_configs` ya existe). 409 sin la columna. */
export async function guardarSalarioMinimo(companyId: string, valor: number, tx: DbOTx = db): Promise<void> {
  const v = salarioMinimoValido(valor);
  if (v === null) throw new NominaNoPermitidaError('El salario mínimo de los topes de la TSS tiene que ser un importe mayor que cero.');
  if (!(await haySalarioMinimo(tx))) throw new NominaNoPermitidaError(MOTIVO_SIN_COLUMNA_SALARIO_MINIMO);
  await tx.execute(sql`UPDATE payroll_configs SET salario_minimo_tss = ${v.toFixed(2)}::numeric, updated_at = now()
    WHERE company_id = ${companyId}::uuid`);
}

/**
 * La siembra de una empresa nueva: 10.000 si hay columna; si no, nada (el
 * calculo ya usa 10.000 por defecto). Va despues de insertar su `payroll_configs`.
 */
export async function sembrarSalarioMinimo(companyId: string, tx: DbOTx = db): Promise<void> {
  if (!(await haySalarioMinimo(tx))) return;
  await tx.execute(sql`UPDATE payroll_configs SET salario_minimo_tss = ${SALARIO_MINIMO_TSS_POR_DEFECTO.toFixed(2)}::numeric
    WHERE company_id = ${companyId}::uuid AND salario_minimo_tss IS NULL`);
}
