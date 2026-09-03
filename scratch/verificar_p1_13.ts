/**
 * P1-13: pagos a proveedores (ap_payments) y cobros a clientes
 * (customer_receipts) sin autor identificable.
 *
 * Cambios: migracion 0049 (created_by/voided_by, nulos, en ambas tablas);
 * schema actualizado; los 4 puntos del codigo que INSERTAN una fila en
 * ap_payments (ApRepository.createPayment, y los dos cheques en garantia de
 * expenses/route.ts y expenses/[id]/route.ts) ahora guardan createdBy y
 * escriben un audit_logs; el unico punto que inserta en customer_receipts
 * (ArRepository.registerReceipt) igual.
 *
 * Banco de solo-codigo (mas el propio .sql de la migracion, tambien
 * solo-texto -- no se ejecuta contra ninguna base de datos).
 */
import { fuente, bloque, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n=== Migracion 0049 ===\n');

const migracion = crudo('drizzle/0049_autor_de_pagos_y_cobros.sql');
for (const [tabla, columna] of [
  ['ap_payments', 'created_by'], ['ap_payments', 'voided_by'],
  ['customer_receipts', 'created_by'], ['customer_receipts', 'voided_by'],
]) {
  ok(`agrega ${tabla}.${columna} de forma idempotente (IF NOT EXISTS)`,
    new RegExp(`WHERE table_name = '${tabla}' AND column_name = '${columna}'\\)\\s*THEN\\s*\\n\\s*ALTER TABLE public\\.${tabla}\\s*\\n\\s*ADD COLUMN ${columna} uuid REFERENCES public\\.users\\(id\\)`).test(migracion));
}
ok('no hay ningun UPDATE que rellene datos historicos (solo se cierra el hueco hacia adelante)',
  !/^\s*UPDATE public\./m.test(migracion));

console.log('\n=== Esquema Drizzle ===\n');

const schema = fuente('src/db/schema/accounting.ts');
const cuerpoReceipts = bloque(schema, /export const customerReceipts = pgTable/);
ok('customerReceipts.createdBy', /createdBy:\s*uuid\('created_by'\)\.references\(\(\) => users\.id\)/.test(cuerpoReceipts));
ok('customerReceipts.voidedBy', /voidedBy:\s*uuid\('voided_by'\)\.references\(\(\) => users\.id\)/.test(cuerpoReceipts));

const cuerpoApPayments = bloque(schema, /export const apPayments = pgTable/);
ok('apPayments.createdBy', /createdBy:\s*uuid\('created_by'\)\.references\(\(\) => users\.id\)/.test(cuerpoApPayments));
ok('apPayments.voidedBy', /voidedBy:\s*uuid\('voided_by'\)\.references\(\(\) => users\.id\)/.test(cuerpoApPayments));

console.log('\n=== ApRepository.createPayment ===\n');

const apRepo = fuente('src/repositories/apRepository.ts');
// No se aisla con un solo bloque(): el parametro `data: { ... }` tiene sus
// propias llaves (un tipo objeto) que bloque() cerraria antes de llegar al
// cuerpo real del metodo -- mismo caso que updateUser en el lote anterior.
const idxCreatePayment = apRepo.indexOf('static async createPayment(');
ok('se encontro la firma de createPayment', idxCreatePayment >= 0);
const desdeCreatePayment = idxCreatePayment >= 0 ? apRepo.slice(idxCreatePayment) : '';
const cuerpoTipoCreatePayment = bloque(desdeCreatePayment, /data:\s*\{/);
ok('createPayment() acepta createdBy en su tipo de datos', /createdBy\?:\s*string;/.test(cuerpoTipoCreatePayment));
const cuerpoInsertCreatePayment = bloque(desdeCreatePayment, /tx\.insert\(apPayments\)\s*\.values\(\{/);
ok('createPayment() guarda createdBy en el INSERT', /createdBy:\s*data\.createdBy \|\| null/.test(cuerpoInsertCreatePayment));

console.log('\n=== ApService.registerPayment: los dos caminos (garantia y aplicado) ===\n');

const apService = fuente('src/services/apService.ts');
ok('importa auditLogs', /import\s*\{[^}]*\bauditLogs\b[^}]*\}\s*from\s*'@\/db\/schema'/.test(apService));

const vecesCreatedByPasado = (apService.match(/createdBy:\s*input\.createdBy,/g) || []).length;
ok('createdBy: input.createdBy se pasa en los DOS llamados a ApRepository.createPayment',
  vecesCreatedByPasado >= 2, `encontrado ${vecesCreatedByPasado}`);

const vecesAuditApPago = (apService.match(/action:\s*'ap_payment_created'/g) || []).length;
ok("action: 'ap_payment_created' aparece en los DOS caminos (garantia y aplicado)",
  vecesAuditApPago >= 2, `encontrado ${vecesAuditApPago}`);

console.log('\n=== ArRepository.registerReceipt ===\n');

const arRepo = fuente('src/repositories/arRepository.ts');
ok('importa auditLogs', /import\s*\{[^}]*\bauditLogs\b[^}]*\}\s*from\s*'@\/db'/.test(arRepo));
const cuerpoRegisterReceipt = bloque(arRepo, /static\s+async\s+registerReceipt\s*\(/);
ok('registerReceipt() guarda createdBy: data.userId en el INSERT de customerReceipts',
  /createdBy:\s*data\.userId,/.test(cuerpoRegisterReceipt));
ok("registerReceipt() escribe un audit_logs con action 'customer_receipt_created'",
  /action:\s*'customer_receipt_created'/.test(cuerpoRegisterReceipt));

console.log('\n=== Los dos cheques en garantia insertados fuera de ApRepository ===\n');

for (const archivo of ['src/app/api/v1/expenses/route.ts', 'src/app/api/v1/expenses/[id]/route.ts']) {
  const src = fuente(archivo);
  ok(`${archivo}: importa auditLogs`, /\bauditLogs\b/.test(src.slice(0, src.indexOf("} from '@/db'"))));
  ok(`${archivo}: el INSERT de apPayments (cheque en garantia) guarda createdBy: session.userId`,
    /\.insert\(apPayments\)\.values\(\{[\s\S]{0,800}?createdBy:\s*session\.userId,/.test(src));
  ok(`${archivo}: escribe un audit_logs con action 'ap_payment_created' junto a ese INSERT`,
    /createdBy:\s*session\.userId,\s*\}\)\.returning\(\);[\s\S]{0,300}?action:\s*'ap_payment_created'/.test(src));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
