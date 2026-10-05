/**
 * Lote 293: el asiento de devengo de una nomina contra la base. La regla (que
 * lineas, que importes, cuando se niega) es pura y vive en `asientoDeNomina.ts`;
 * aqui solo se lee lo que hace falta, se resuelven las cuentas y se registra.
 *
 * Lo llama `HRRepository.approvePayroll` DENTRO de su transaccion y ANTES de
 * marcar la nomina como aprobada: si algo falla (una cuenta sin enlazar, el
 * periodo cerrado), la transaccion entera se deshace y la nomina sigue
 * `calculated`, sin asiento y sin novedades procesadas.
 *
 * El enlace nomina -> asiento es `journal_entries.reference = payrolls.id`, la
 * convencion de facturas y compras. Sin migracion a proposito: una columna
 * `journal_entry_id` declarada en `payrolls` la pediria todo `select()` de la
 * nomina antes de aplicarse (la leccion de las 0013 y 0015).
 */
import { and, eq, inArray, isNull, asc } from 'drizzle-orm';
import {
  db,
  accountingMappings,
  chartOfAccounts,
  employees,
  journalEntries,
  journalEntryLines,
  type DbTransaction,
} from '@/db';
import { AccountingRepository } from '@/repositories/accountingRepository';
import { cuentaDelSistema } from '@/services/accounting/cuentasDelSistema';
import { resolverCuentaPorMapeo } from '@/services/accounting/resolverCuentas';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { NominaNoPermitidaError } from '@/services/nomina/estadoDeNomina';
import {
  clavesNecesarias,
  descripcionDelAsiento,
  etiquetaDeClave,
  fechaDelAsiento,
  lineasDelAsiento,
  motivoDeCuentasFaltantes,
  motivoPeriodoNoAbierto,
  totalesDeNomina,
  type ClaveDeNomina,
  type ImportesDelDetalle,
} from '@/services/nomina/asientoDeNomina';

export interface NominaParaAsentar {
  id: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
}

type DetalleGuardado = Omit<ImportesDelDetalle, 'empleado'> & { employeeId: string };

export interface AsientoRegistrado {
  id: string;
  fecha: string;
  total: number;
  /** `true` si la nomina ya tenia su asiento y no se creo otro. */
  yaExistia: boolean;
}

/**
 * Registra el asiento de devengo. Lanza `NominaNoPermitidaError` (409) con el
 * motivo cuando no se puede; no escribe nada antes de haberlo comprobado todo.
 */
export async function asentarDevengoDeNomina(
  tx: DbTransaction,
  nomina: NominaParaAsentar,
  detalles: readonly DetalleGuardado[],
  companyId: string,
  modo: ModoOperativo,
  userId: string,
): Promise<AsientoRegistrado> {
  // 1. Una nomina, un asiento. Con la guarda de estado (solo se aprueba una
  //    `calculated`) y el `for update` del lote 290 no deberia llegar aqui con
  //    asiento; si llega (un asiento hecho a mano con su referencia), no se
  //    duplica.
  const [previo] = await tx
    .select({ id: journalEntries.id, fecha: journalEntries.date })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.modo, modo),
      eq(journalEntries.reference, nomina.id),
      isNull(journalEntries.deletedAt),
    ))
    .limit(1);
  if (previo) return { id: previo.id, fecha: String(previo.fecha), total: 0, yaExistia: true };

  // 2. Los importes guardados, sumados y comprobados linea a linea.
  const ids = detalles.map((d) => d.employeeId);
  const nombres = ids.length === 0 ? [] : await tx
    .select({ id: employees.id, codigo: employees.employeeCode, nombre: employees.firstName, apellido: employees.lastName })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), inArray(employees.id, ids)));
  const nombreDe = new Map(nombres.map((e) => [e.id, `${e.nombre} ${e.apellido} (${e.codigo})`]));
  const totales = totalesDeNomina(detalles.map((d) => ({ ...d, empleado: nombreDe.get(d.employeeId) ?? d.employeeId })));
  if (!totales.ok) throw new NominaNoPermitidaError(totales.motivo);

  // 3. Las cuentas: solo las que el asiento usa, y ENLAZADAS en Cuentas Puente.
  //    No se cae al codigo por defecto: el enlace lo elige el contador (lote
  //    171) y una cuenta adivinada es la que el lote 137 vino a quitar.
  const necesarias = clavesNecesarias(totales.totales);
  const mapeos = await tx
    .select({ clave: accountingMappings.mappingKey })
    .from(accountingMappings)
    .where(and(eq(accountingMappings.companyId, companyId), inArray(accountingMappings.mappingKey, necesarias)));
  const enlazadas = new Set(mapeos.map((m) => m.clave));
  const faltan = motivoDeCuentasFaltantes(necesarias.filter((c) => !enlazadas.has(c)));
  if (faltan) throw new NominaNoPermitidaError(faltan);

  // El mecanismo de siempre: valida que la cuenta enlazada sea de la empresa,
  // este activa y admita movimientos. El codigo por defecto sale de la tabla
  // (y no se usa: la clave esta enlazada).
  const cuentas: Partial<Record<ClaveDeNomina, string>> = {};
  const resueltas = await Promise.all(necesarias.map(async (clave) => {
    try {
      const c = await resolverCuentaPorMapeo(tx, companyId, clave, cuentaDelSistema(clave).codigo, `Nómina, cuenta "${etiquetaDeClave(clave)}"`);
      return { clave, id: c.id, error: null };
    } catch (e) {
      return { clave, id: null, error: (e as Error).message };
    }
  }));
  const malas = resueltas.filter((r) => r.error);
  if (malas.length > 0) {
    throw new NominaNoPermitidaError(
      `No se puede aprobar la nómina: ${malas.map((m) => m.error).join(' ')} Corríjalo en Configuración > Cuentas Puente (bloque Nómina).`
    );
  }
  for (const r of resueltas) cuentas[r.clave] = r.id as string;

  // 4. El periodo de la fecha del asiento (D10: fin del periodo). Lo comprueba
  //    tambien `createJournalEntry`; se mira antes para que el motivo diga que
  //    hacer con una NOMINA (la de julio de Latin Doors: la asienta el contador).
  const fecha = fechaDelAsiento(nomina.periodEnd);
  if (!(await AccountingRepository.isPeriodOpen(companyId, fecha, modo, tx))) {
    throw new NominaNoPermitidaError(motivoPeriodoNoAbierto(fecha));
  }

  // 5. Las lineas, y el asiento por el unico camino de los asientos (lote 152).
  const asiento = lineasDelAsiento(totales.totales, cuentas);
  if (!asiento.ok) throw new NominaNoPermitidaError(asiento.motivo);

  const entry = await AccountingRepository.createJournalEntry(tx, {
    companyId,
    modo,
    reference: nomina.id,
    date: fecha,
    description: descripcionDelAsiento(nomina.periodStart, nomina.periodEnd, nomina.frequency),
    createdBy: userId,
    lines: asiento.lineas.map(({ accountId, debit, credit }) => ({ accountId, debit, credit })),
  });
  return { id: entry.id, fecha, total: asiento.total, yaExistia: false };
}

export interface AsientoDeLaNomina {
  id: string;
  fecha: string;
  descripcion: string | null;
  lineas: { codigo: string; cuenta: string; debe: number; haber: number }[];
  total: number;
}

/** El asiento de una nomina, para la pantalla. `null` si no tiene. */
export async function asientoDeLaNomina(payrollId: string, companyId: string, modo: ModoOperativo): Promise<AsientoDeLaNomina | null> {
  const [entry] = await db
    .select({ id: journalEntries.id, fecha: journalEntries.date, descripcion: journalEntries.description })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.modo, modo),
      eq(journalEntries.reference, payrollId),
      isNull(journalEntries.deletedAt),
    ))
    .limit(1);
  if (!entry) return null;

  const filas = await db
    .select({ codigo: chartOfAccounts.code, cuenta: chartOfAccounts.name, debe: journalEntryLines.debit, haber: journalEntryLines.credit })
    .from(journalEntryLines)
    .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
    .where(and(eq(journalEntryLines.journalEntryId, entry.id), eq(journalEntryLines.companyId, companyId)))
    .orderBy(asc(chartOfAccounts.code));
  // El debe primero, como se lee un asiento.
  const lineas = filas
    .map((f) => ({ codigo: f.codigo, cuenta: f.cuenta, debe: Number(f.debe), haber: Number(f.haber) }))
    .sort((a, b) => Number(b.debe > 0) - Number(a.debe > 0));
  return {
    id: entry.id,
    fecha: String(entry.fecha),
    descripcion: entry.descripcion,
    lineas,
    total: Math.round(lineas.reduce((s, l) => s + l.debe, 0) * 100) / 100,
  };
}
