import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

const crudo = (rutaRelativa: string): string | null => {
  const p = join(RAIZ, rutaRelativa);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
};

/** Sin las lineas de comentario: los comentarios citan lo que se quito. */
const sinComentarios = (t: string): string =>
  t
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════ P2-34, lote 2: la factura, con el mismo esquema en los dos lados ═══════
//
// Aqui el punto de partida era distinto al de compras: la ruta YA tenia su
// esquema zod. Lo que faltaba era todo lo demas.
//
//   - vivia dentro del fichero de la ruta, asi que la pantalla no podia usarlo
//     y reimplementaba las reglas a mano -- en TRES sitios: `validateFormBasic`,
//     la cadena de `handleSubmitTrigger` y otra dentro de `handleIssueInvoice`,
//     cada una con su redaccion;
//   - las tres hacian `throw new Error(...)` y acababan en un unico toast, sin
//     marcar ningun campo;
//   - el 400 del servidor devolvia `issues[0].message`: el primer fallo, en
//     texto, sin decir de que campo era;
//   - y la pantalla tenia DOS reglas que el servidor no -- el RNC y la razon
//     social para e-31/e-45, y el motivo de la nota --, asi que un POST directo
//     se las saltaba.
//
// Que el esquema haga lo que debe se prueba ejecutandolo, en
// src/tests/esquemaFactura.vitest.ts.

const s = crudo('src/schemas/factura.ts');
ok('existe el esquema de la factura', s !== null);
if (s) {
  ok('el esquema esta exportado', s.includes('export const esquemaFactura = z.object({'));
  ok(
    'lleva la regla del RNC para e-31/e-45, que solo tenia la pantalla',
    s.includes("if (data.ecfType === '31' || data.ecfType === '45') {") && s.includes("path: ['buyerRnc'],")
  );
  ok(
    'y la del motivo del ajuste, que no tenia nadie en el servidor',
    s.includes("const validos = data.ecfType === '34' ? [1, 2, 3] : [2, 3, 4];") &&
      s.includes("path: ['indicadorNotaCredito'],")
  );
  ok(
    "los campos que faltan se dicen con palabras, no con 'expected string, received undefined'",
    s.includes("z.string({ message: 'Debe seleccionar un almacén.' }).uuid('Debe seleccionar un almacén.')") &&
      s.includes("{ message: 'La factura debe tener al menos una línea de producto' }") &&
      s.includes("{ message: 'Selecciona la forma de pago.' }")
  );
} else {
  for (let i = 0; i < 4; i++) ok('esquema de factura: (no existe)', false);
}

const e = crudo('src/schemas/errores.ts');
ok(
  'erroresPorCampo vive en su propio fichero, compartido',
  e !== null && e.includes('export function erroresPorCampo(error: ZodError): Record<string, string> {')
);
const c = crudo('src/schemas/compra.ts')!;
ok(
  'compras lo reexporta, para no romper a quien lo importaba de ahi',
  c.includes("export { erroresPorCampo } from './errores';") && !c.includes('export function erroresPorCampo')
);

const r = crudo('src/app/api/v1/invoices/route.ts')!;
ok('la ruta usa el esquema compartido', r.includes('esquemaFactura.safeParse(body)') && !r.includes('createInvoiceSchema'));
ok(
  'la ruta devuelve los campos, no solo el primer mensaje',
  r.includes('const campos = erroresPorCampo(result.error);') && r.includes('fields: campos')
);
ok(
  'la ruta ya no arrastra el import que se fue con el esquema',
  !r.includes('CODIGOS_EMITIBLES') && !r.includes('TIPOS_COMPROBANTE')
);

const p = crudo('src/app/dashboard/invoices/page.tsx')!;
const pc = sinComentarios(p);
ok('la pantalla pasa el mismo esquema antes de llamar', pc.includes('const validacion = esquemaFactura.safeParse(buildInvoicePayload());'));
ok(
  'ya no queda la cadena de throw de la emision',
  !pc.includes("throw new Error('El RNC y la Razón Social del cliente son requeridos") &&
    !pc.includes("throw new Error('Debe seleccionar un almacén.')") &&
    !pc.includes("throw new Error('La factura debe tener al menos una línea de producto seleccionada.')")
);
ok(
  'las reglas que dependen de productos quedan aparte y devuelven campos',
  pc.includes('const erroresBasicos = (): Record<string, string> => {') &&
    pc.includes('const erroresDeStock = (): Record<string, string> => {') &&
    pc.includes('Object.assign(campos, erroresBasicos(), erroresDeStock());')
);
// El borrador se guarda a medias a proposito: no puede exigir el esquema entero.
{
  const i = pc.indexOf('const handleSaveDraft');
  const j = pc.indexOf('const handleLoadDraft');
  const cuerpo = pc.slice(i, j);
  ok(
    'el borrador sigue guardandose incompleto, solo con lo minimo',
    cuerpo.includes('erroresBasicos()') && !cuerpo.includes('esquemaFactura')
  );
}
ok(
  'la pantalla pinta el error debajo de cada campo',
  pc.includes('const err = (campo: string) =>') &&
    ['buyerRnc', 'buyerName', 'bankName', 'transactionNumber', 'lines', 'warehouseId', 'modifiedNcf', 'indicadorNotaCredito'].every(
      (k) => pc.includes(`err('${k}')`)
    )
);
ok('los errores de linea se pintan con su numero', pc.includes("Línea {Number(k.split('.')[1]) + 1}: {m}"));
ok('corregir el campo quita su error', pc.includes("quitarError('bankName')") && pc.includes("quitarError('transactionNumber')"));
ok('los fields del servidor se pintan igual', pc.includes('setErrores(error.fields as Record<string, string>);'));

const t = crudo('src/tests/esquemaFactura.vitest.ts');
ok(
  'hay pruebas que EJECUTAN el esquema',
  t !== null && t.includes('esquemaFactura.safeParse(cuerpo)') && t.includes('e-31 sin RNC ni razón social')
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
