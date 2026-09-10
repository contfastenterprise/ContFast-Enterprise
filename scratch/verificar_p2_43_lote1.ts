/**
 * P2-43 lote 1: el rastro que se pierde en silencio.
 *
 * La auditoria cuenta 122 `catch` silenciosos y dice, con razon, que no hay
 * que tocar los 122: hay que priorizar los que protegen auditoria y negocio.
 * Este lote son esos -- los que dejan un documento fiscal o un registro de
 * auditoria a medias y siguen adelante como si nada.
 *
 *   1. UN SITIO PARA LA TRAZA. `invoiceFileGenerator` ya lo tenia resuelto
 *      (P2-30), en privado y solo para si. Sale a
 *      `src/services/auditoria/rastroDeFallo.ts` para que el siguiente que lo
 *      necesite no haga la tercera copia.
 *
 *   2. EL HUECO DE SECUENCIA DEL NCF. Si la traza de un NCF quemado no se
 *      escribe, el `console.error` decia "no se pudo registrar el hueco" y se
 *      acabo: el numero desaparecia sin forma de reconstruirlo.
 *
 *   3. EL CORREO QUE SALIO Y NO QUEDO ANOTADO. `system_email_logs` es la
 *      prueba de que mandaste el documento.
 *
 *   4. LAS TRES VIAS DEL CORREO AL ACEPTAR, IGUALES. `sincronizarPendientes`
 *      ya lo hacia bien; las dos rutas de e-CF no decian de que factura
 *      hablaban.
 *
 * Contra el HEAD anterior: las 9 fallan.
 */
import { fuente as fuenteCruda, crudo as crudoCrudo } from './_fuente';

const fuente = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');
const crudo = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ─── el rastro compartido ───────────────────────────────────────────────
{
  const src = fuente('src/services/auditoria/rastroDeFallo.ts');

  // Que no relance es la regla que lo sostiene todo: se llama desde dentro de
  // un catch, muchas veces con otro error propagandose.
  ok('rastro: escribe en audit_logs y NUNCA relanza',
    src.includes('await db.insert(auditLogs).values({')
    && src.includes('action: `fallo_${f.paso}`,')
    && src.includes('} catch (trazaErr) {')
    && !src.includes('throw'));

  ok('rastro: si no puede escribir, el log se lleva la fila entera',
    src.includes('Se pierde esta fila:')
    && src.includes('errorAlEscribir: motivoDe(trazaErr)')
    && src.includes('companyId: f.companyId'));

  // `audit_logs.company_id` es NOT NULL: sin empresa no hay fila. Y marcar
  // como PRODUCCION un fallo de PRUEBA seria ensuciar el rastro justo donde se
  // va a leer, asi que sin modo se deja el valor por defecto de la columna.
  ok('rastro: sin empresa no disimula, y no inventa un modo que no sabe',
    src.includes('if (!f.companyId) {')
    && crudo('src/services/auditoria/rastroDeFallo.ts').includes('SIN empresa')
    && src.includes('...(f.modo ? { modo: f.modo } : {}),'));
}

// ─── el generador deja su copia privada ─────────────────────────────────
{
  const src = fuente('src/services/invoice/invoiceFileGenerator.ts');

  // `db` sigue haciendo falta en este fichero (consulta productos mas abajo);
  // lo que se va es `auditLogs`, que era lo unico que usaba la copia privada.
  ok('fileGenerator: se queda sin la copia privada de la escritura',
    !src.includes('auditLogs')
    && src.includes("import { registrarFalloSilencioso } from '@/services/auditoria/rastroDeFallo';")
    && src.includes('await registrarFalloSilencioso({'));

  // Lo que P2-30 defiende no cambia: la fila tiene que salir con la MISMA
  // forma, o las viejas y las nuevas no se pueden consultar juntas.
  ok('fileGenerator: la fila sale IGUAL que antes (accion, paso, NCF)',
    src.includes("paso: 'post_emision',")
    && src.includes("entityType: 'invoices',")
    && src.includes('contexto: { paso, ncf },')
    && src.includes('private static async registrarFalloPostEmision('));
}

// ─── el hueco de secuencia del NCF ──────────────────────────────────────
{
  const src = fuente('src/services/invoice/invoiceDbBooker.ts');
  ok('el hueco de secuencia del NCF: el log se lleva la fila entera',
    src.includes('No se pudo registrar el hueco de secuencia del NCF ${ncf}. Se pierde esta fila:')
    && src.includes("action: 'ncf_reservado_sin_usar',")
    && src.includes('errorAlEscribir: (err as Error)?.message || String(err),')
    && src.includes("import { Logger } from '@/utils/logger';"));
}

// ─── el correo que salio y no quedo anotado ─────────────────────────────
{
  const src = fuente('src/services/documents/emailService.ts');

  ok('el registro de correo perdido deja traza durable',
    src.includes('await registrarFalloSilencioso({')
    && src.includes("paso: 'registro_correo',")
    && src.includes("entityType: 'system_email_logs',")
    && src.includes('estadoDelEnvio: status'));

  ok('y el fallo de SMTP dice a quien y de que documento',
    src.includes("Logger.error('[EmailService] fallo el envio por SMTP'")
    && !src.includes("console.error('[EmailService] Exception sending email via SMTP:'"));
}

// ─── las tres vias del correo al aceptar ────────────────────────────────
{
  const uno = fuente('src/app/api/v1/ecf/[id]/dgii-status/route.ts');
  const dos = fuente('src/app/api/v1/ecf/dgii-status/batch/route.ts');
  const tres = fuente('src/services/dgii/sincronizarPendientes.ts');

  ok('las tres vias del correo al aceptar dejan el MISMO rastro',
    uno.includes("Logger.warn('[dgii-status] no se pudo enviar el correo de la factura aceptada'")
    && uno.includes('invoiceId: id, ncf: invoice.ncf')
    && dos.includes("Logger.warn('[dgii-status/batch] no se pudo enviar el correo de la factura aceptada'")
    && dos.includes('invoiceId: inv.id, ncf: result.ecf')
    && tres.includes("Logger.warn('[sincronizarPendientes] no se pudo enviar el correo de la factura aceptada'")
    && !uno.includes("console.error('[dgii-status]"));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
