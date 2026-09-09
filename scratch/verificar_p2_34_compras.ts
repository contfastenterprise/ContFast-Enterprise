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

// ═══════ P2-34, lote 1: la compra se valida con UN esquema ═══════
//
// Lo que habia: en la pantalla, una cadena de `if (!x) return toast.error(...)`
// en el submit -- un aviso efimero y ningun campo marcado; en el servidor, las
// mismas reglas escritas otra vez a mano, en el alta y en la edicion, con otros
// mensajes.
//
// Lo que hay: src/schemas/compra.ts, el esquema zod del cuerpo con las reglas
// condicionales en un superRefine. El servidor lo usa como guarda y responde
// 400 con `fields` (campo -> mensaje); la pantalla lo pasa antes de llamar y
// pinta el mensaje debajo de cada campo, con el borde en rojo.
//
// Que el esquema haga lo que debe se prueba ejecutandolo, en
// src/tests/esquemaCompra.vitest.ts. Aqui: que exista, que lo usen los tres y
// que ninguno conserve su cadena de `if`.

const s = crudo('src/schemas/compra.ts');
ok('existe el esquema compartido', s !== null);
if (s) {
  ok(
    'las reglas condicionales van en un superRefine',
    s.includes('.superRefine((c, ctx) => {') &&
      s.includes("path: ['supplierId']") &&
      s.includes("path: ['ncf']") &&
      s.includes("path: ['lines']") &&
      s.includes("path: ['debitAccountId']")
  );
  ok(
    'el cheque de garantia se valida campo a campo',
    s.includes("checkNumber: z.string().trim().min(1, 'Ingresa el número de cheque')")
  );
  ok(
    'sin la bandera, el monto general se deduce de la forma del cuerpo',
    s.includes('const montoGeneral = c.isGeneralAmount || (c.lines.length === 0 && !!c.debitAccountId);')
  );
  ok(
    'erroresPorCampo da un mapa campo -> primer mensaje',
    s.includes('export function erroresPorCampo(error: z.ZodError): Record<string, string> {') &&
      s.includes("const clave = issue.path.map(String).join('.') || '_';")
  );
} else {
  for (let i = 0; i < 4; i++) ok('esquema: (no existe)', false);
}

const RUTAS = ['src/app/api/v1/expenses/route.ts', 'src/app/api/v1/expenses/[id]/route.ts'];
for (const r of RUTAS) {
  const t = crudo(r)!;
  const nombre = r.endsWith('expenses/route.ts') ? 'POST' : 'PUT';
  ok(
    `${nombre}: valida con el esquema y responde 400 con fields`,
    t.includes('const validacion = esquemaCompra.safeParse(body);') && t.includes('fields: erroresPorCampo(validacion.error)')
  );
  ok(
    `${nombre}: ya no valida a mano`,
    !t.includes('Suplidor es requerido para compras formales') &&
      !sinComentarios(t).includes('isValidNcfFormat(') &&
      t.includes("import { esquemaCompra, erroresPorCampo } from '@/schemas/compra';")
  );
}

const p = crudo('src/app/dashboard/purchases/page.tsx')!;
const pc = sinComentarios(p);
ok(
  'pantalla: pasa el cuerpo por el esquema ANTES de llamar al servidor',
  pc.includes('const validacion = esquemaCompra.safeParse(payload);') &&
    pc.indexOf('esquemaCompra.safeParse(payload)') < pc.indexOf('const url = editingExpenseId')
);
ok(
  'pantalla: ya no hay cadena de toasts en el submit',
  !pc.includes("return toast.error('Selecciona un suplidor')") &&
    !pc.includes("return toast.error('Agrega al menos una línea')") &&
    !pc.includes('isValidNcfFormat(')
);
ok('pantalla: el cuerpo lleva isGeneralAmount', pc.includes('      isGeneralAmount,\n'));
ok(
  'pantalla: el error se pinta debajo de cada campo con data-campo',
  pc.includes('const err = (campo: string) =>') &&
    pc.includes('<p data-campo={campo}') &&
    [
      'supplierId',
      'ncf',
      'issueDate',
      'description',
      'debitAccountId',
      'guaranteeCheck.bankAccountId',
      'guaranteeCheck.checkNumber',
      'guaranteeCheck.dueDate',
      'guaranteeCheck.amount',
    ].every((c) => pc.includes(`err('${c}')`))
);
ok('pantalla: las lineas vacias enseñan su error en la propia tabla', pc.includes('<span data-campo="lines">{errores.lines}</span>'));
ok(
  'pantalla: el borde se pone en rojo',
  pc.includes("const conError = (campo: string) => (errores[campo] ? ' ring-2 ring-red-400 bg-red-50' : '');") &&
    pc.includes("conError('ncf')")
);
ok(
  'pantalla: corregir el campo quita su error',
  pc.includes('const quitarError = (campo: string) =>') && pc.includes("quitarError('ncf')") && pc.includes("quitarError('supplierId')")
);
ok('pantalla: lleva la vista al primer error', pc.includes("document.querySelector('[data-campo]')?.scrollIntoView("));
ok('pantalla: los fields del servidor se pintan igual', pc.includes('setErrores(data.error.fields as Record<string, string>);'));

const t = crudo('src/tests/esquemaCompra.vitest.ts');
ok(
  'hay pruebas que EJECUTAN el esquema',
  t !== null && t.includes('esquemaCompra.safeParse(cuerpo)') && t.includes("'guaranteeCheck.checkNumber': 'Ingresa el número de cheque'")
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
