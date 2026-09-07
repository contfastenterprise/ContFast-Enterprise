import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════════════ P2-32: reapertura de periodo borra rastro de cierre ═══════════════════
// Reabrir un periodo contable (PUT status: 'open') sobrescribia closedAt/closedBy sin dejar
// ningun rastro de quien habia cerrado el periodo ni cuando. Se envuelve el update en una
// transaccion y se registra el estado previo completo en audit_logs antes de sobrescribirlo.

const P = 'src/app/api/v1/accounting/periods/[id]/route.ts';
const src = crudo(P);

ok("periods/[id]: import auditLogs agregado", src.includes("import { db, accountingPeriods, auditLogs } from '@/db';"));
ok('periods/[id]: update envuelto en db.transaction', src.includes('const updated = await db.transaction(async (tx) => {'));
ok('periods/[id]: update usa tx en vez de db', src.includes('const [row] = await tx.update(accountingPeriods)'));
ok('periods/[id]: insert en auditLogs dentro de la misma transaccion', src.includes('await tx.insert(auditLogs).values({'));
ok(
  'periods/[id]: accion distingue close/reopen',
  src.includes("action: status === 'closed' ? 'close_accounting_period' : 'reopen_accounting_period',")
);
ok(
  'periods/[id]: oldValues captura el estado previo completo (status/closedAt/closedBy)',
  src.includes('oldValues: { status: existing.status, closedAt: existing.closedAt, closedBy: existing.closedBy },')
);
ok(
  'periods/[id]: newValues captura el estado nuevo completo',
  src.includes('newValues: { status: row.status, closedAt: row.closedAt, closedBy: row.closedBy },')
);
ok('periods/[id]: retorna row desde la transaccion', src.includes('return row;\n    });'));
ok(
  'periods/[id]: ya no queda el update directo fuera de transaccion (patron viejo)',
  !src.includes('const [updated] = await db.update(accountingPeriods)')
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
