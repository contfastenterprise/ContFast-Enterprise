import { crudo as crudoCrudo, fuente as fuenteCruda, bloque } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');
const fuente = (rutaRelativa: string): string => fuenteCruda(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const contar = (s: string, sub: string): number => s.split(sub).length - 1;

// ═══════════ P2-30: fallos post-transaccion solo logueados ═══════════
// Todo lo que corre despues del commit de la factura -- PDF, correo, conduce
// automatico, marcado de la cotizacion -- fallaba en silencio: un Logger.error SIN
// el NCF ni el id de la factura, imposible de localizar despues. El caso grave es el
// conduce, porque facturar NO descuenta stock (la deduccion esta diferida al
// conduce): si no llega a aprobarse, la factura queda emitida y el inventario sin
// tocar -- el "desfase silencioso entre factura emitida e inventario real".
// Ahora cada fallo deja traza en audit_logs y devuelve un aviso que sube hasta la
// respuesta y se ensena en pantalla a quien acaba de facturar.

// ─────────────── 1. invoiceFileGenerator.ts ───────────────
{
  const src = crudo('src/services/invoice/invoiceFileGenerator.ts');

  // P2-43 lote 1 (2026-09-10): la escritura en audit_logs ya no vive aqui. La
  // copia privada que tenia este fichero se saco a
  // `src/services/auditoria/rastroDeFallo.ts` para que no hubiera una tercera.
  // Lo que este banco defiende NO ha cambiado -- que el fallo post-emision deje
  // traza durable, con paso, NCF y motivo --, solo el sitio donde se escribe,
  // asi que las comprobaciones apuntan alli.
  ok(
    'fileGenerator: el import ya no arrastra auditLogs',
    !src.includes('auditLogs')
  );
  ok('fileGenerator: sigue existiendo el helper de traza durable', src.includes('private static async registrarFalloPostEmision('));
  ok(
    'fileGenerator: el helper delega en el rastro compartido',
    src.includes("import { registrarFalloSilencioso } from '@/services/auditoria/rastroDeFallo';")
    && src.includes('await registrarFalloSilencioso({')
  );
  ok(
    'fileGenerator: la fila sale igual que antes (accion, paso, NCF y motivo)',
    src.includes("paso: 'post_emision',")
    && src.includes("entityType: 'invoices',")
    && src.includes('contexto: { paso, ncf },')
  );
  {
    const rastro = crudo('src/services/auditoria/rastroDeFallo.ts');
    ok(
      'rastro compartido: escribe en audit_logs con `fallo_` + el paso',
      rastro.includes('await db.insert(auditLogs).values({')
      && rastro.includes('action: `fallo_${f.paso}`,')
      && rastro.includes('newValues: { motivo, ...f.contexto },')
    );
    ok(
      'rastro compartido: NUNCA relanza, y si no puede escribir deja la fila en el log',
      rastro.includes('} catch (trazaErr) {')
      && rastro.includes('Se pierde esta fila:')
    );
  }
  // Esto miraba el `catch (trazaErr)` que vivia AQUI. Esa guarda se fue con la
  // escritura al rastro compartido, y alli es donde se comprueba ahora (arriba:
  // "NUNCA relanza"). Lo que sigue siendo responsabilidad de ESTE fichero es no
  // volver a meter nada que lance en el camino de la traza: el metodo delega y
  // no hace otra cosa.
  {
    const metodo = bloque(fuente('src/services/invoice/invoiceFileGenerator.ts'),
      'private static async registrarFalloPostEmision(');
    ok('fileGenerator: escribir la traza sigue sin poder tumbar la emision',
      metodo.includes('await registrarFalloSilencioso({') && !metodo.includes('throw'));
  }

  ok(
    'fileGenerator: generateFilesAndSendEmail declara que devuelve avisos',
    src.includes('    msellerXmlPath: string\n  ): Promise<string[]> {\n    const avisos: string[] = [];')
  );
  ok(
    'fileGenerator: el fallo de correo deja traza',
    src.includes("await this.registrarFalloPostEmision(data, null, ncf, 'correo_cliente', emailErr);")
  );
  ok('fileGenerator: el fallo de correo avisa al usuario', src.includes('no se pudo encolar el correo al cliente'));
  ok(
    'fileGenerator: el fallo de PDF deja traza',
    src.includes("await this.registrarFalloPostEmision(data, null, ncf, 'pdf_o_xml', pdfErr);")
  );
  ok(
    'fileGenerator: el fallo de PDF avisa sin alarmar (el comprobante es valido)',
    src.includes('El comprobante es válido; vuelve a imprimirlo desde el listado de facturas.')
  );

  ok(
    'fileGenerator: processPostEmission recibe el NCF y devuelve avisos',
    src.includes('    invoiceId: string,\n    ncf: string,\n') &&
      src.includes('    itemLines: InvoiceItemLine[]\n  ): Promise<string[]> {')
  );
  ok(
    'fileGenerator: crear y aprobar el conduce ya no comparten catch',
    src.includes('let draftNoteId: string | null = null;') &&
      src.includes('draftNoteId = draftNote.id;') &&
      src.includes('if (draftNoteId) {')
  );
  ok(
    'fileGenerator: ya no queda el approve dentro del try de create (patron viejo)',
    !src.includes('await DeliveryRepository.approve(draftNote.id, data.userId, data.companyId, data.modo);')
  );
  ok(
    'fileGenerator: fallo al CREAR el conduce deja su traza propia',
    src.includes("await this.registrarFalloPostEmision(data, invoiceId, ncf, 'conduce_automatico_crear', autoErr);")
  );
  ok(
    'fileGenerator: fallo al APROBAR el conduce deja su traza propia',
    src.includes("await this.registrarFalloPostEmision(data, invoiceId, ncf, 'conduce_automatico_aprobar', aprobarErr);")
  );
  ok(
    'fileGenerator: ambos avisos de conduce dicen que el inventario NO se descontó',
    contar(src, 'NO se ha descontado.') === 2
  );
  ok(
    'fileGenerator: el aviso de aprobacion explica que el conduce quedo en BORRADOR',
    src.includes('el conduce automático quedó en BORRADOR')
  );
  ok(
    'fileGenerator: el fallo de la cotizacion deja traza y avisa',
    src.includes("await this.registrarFalloPostEmision(data, invoiceId, ncf, 'cotizacion_marcar_facturada', err);") &&
      src.includes('no quedó marcada como facturada')
  );
}

// ─────────────── 2. invoiceService.ts ───────────────
{
  const src = crudo('src/services/invoiceService.ts');

  ok(
    'invoiceService: recoge los avisos de la generacion de archivos',
    src.includes('const avisosArchivos = await InvoiceFileGenerator.generateFilesAndSendEmail(')
  );
  ok(
    'invoiceService: pasa el NCF a processPostEmision y recoge sus avisos',
    src.includes('const avisosPostEmision = await InvoiceFileGenerator.processPostEmission(') &&
      src.includes('      dbResult.invoice.id,\n      ncf,\n')
  );
  ok(
    'invoiceService: devuelve los avisos junto al resultado',
    src.includes('return { ...dbResult, avisos: [...avisosArchivos, ...avisosPostEmision] };')
  );
}

// ─────────────── 3. ruta POST /api/v1/invoices ───────────────
{
  const src = crudo('src/app/api/v1/invoices/route.ts');

  ok(
    'ruta: destructura los avisos del servicio',
    src.includes('const { invoice, msellerResponse, avisos } = await InvoiceService.issueInvoice({')
  );
  ok(
    'ruta: los devuelve en el cuerpo del 201',
    src.includes('return { status: 201, body: { success: true, data: invoice, msellerResponse, avisos } };')
  );
}

// ─────────────── 4. pantalla de facturacion ───────────────
{
  const src = crudo('src/app/dashboard/invoices/page.tsx');

  ok(
    'pantalla: ensena los avisos tras emitir (camino normal)',
    src.includes('for (const aviso of (data.avisos ?? []) as string[]) {')
  );
  ok(
    'pantalla: ensena los avisos tras emitir en local (camino de reintento)',
    src.includes('for (const aviso of (retryData.avisos ?? []) as string[]) {')
  );
  ok(
    'pantalla: el aviso sale como advertencia y con tiempo para leerlo',
    contar(src, "toast.warning('Atención tras emitir la factura', { description: aviso, duration: 12000 });") === 2
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
