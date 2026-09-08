import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

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

  ok(
    'fileGenerator: importa auditLogs',
    src.includes("import { db, products, productCategories, auditLogs } from '@/db';")
  );
  ok('fileGenerator: existe el helper de traza durable', src.includes('private static async registrarFalloPostEmision('));
  ok(
    'fileGenerator: la traza va a audit_logs con su propia accion',
    src.includes("action: 'fallo_post_emision',") && src.includes('await db.insert(auditLogs).values({')
  );
  ok(
    'fileGenerator: la traza guarda paso, NCF y motivo (localizable)',
    src.includes('newValues: { paso, ncf, motivo: (err as Error)?.message || String(err) },')
  );
  ok('fileGenerator: escribir la traza nunca tumba la emision', src.includes('} catch (trazaErr) {'));

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
