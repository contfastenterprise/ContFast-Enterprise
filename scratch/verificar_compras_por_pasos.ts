/**
 * El alta de compras, por pasos (P2-35).
 *
 * QUE SE COMPRUEBA DE VERDAD
 * --------------------------
 * Lo importante de este lote no es que haya cuatro pantallas: es que el reparto
 * de campos sea TOTAL. Este banco no lo afirma leyendo el fuente -- CORRE
 * `esquemaCompra`, el mismo que valida el servidor, contra cuerpos preparados
 * para disparar cada rama de su `superRefine`, recoge todas las rutas de error
 * que sabe producir, y comprueba una por una que caen en exactamente un paso.
 *
 * Si una ruta no cayera en ninguno, el asistente dejaria pasar los cuatro pasos
 * en verde y reventaria al guardar -- cuatro pantallas para nada. Si cayera en
 * dos, el mismo error se pintaria dos veces. Las dos cosas son silenciosas: la
 * pantalla compila igual.
 *
 * Y como las rutas salen del esquema y no de una lista escrita aqui, el dia que
 * alguien anada un campo obligatorio nuevo este banco se pone rojo hasta que se
 * le asigne un paso. Esa es toda la gracia.
 */
import { esquemaCompra, erroresPorCampo } from '../src/schemas/compra';
import { fuente } from './_fuente';

const RUTA_PANTALLA = 'src/app/dashboard/purchases/page.tsx';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const veces = (s: string, t: string): number => s.split(t).length - 1;

/** Cuerpos elegidos para disparar cada rama del `superRefine` del esquema. */
const CUERPOS: Record<string, unknown>[] = [
  // Compra formal vacia: suplidor y NCF.
  { expenseType: '02', issueDate: '2026-09-11', paymentMethod: '01', amount: 0, lines: [] },
  // Los tres obligatorios de primer nivel, en blanco.
  { expenseType: '', issueDate: '', paymentMethod: '', amount: 0, lines: [] },
  // NCF con formato invalido.
  { supplierId: 's1', ncf: 'XXX', expenseType: '02', issueDate: '2026-09-11', paymentMethod: '01', amount: 1, lines: [{ quantity: 1, unitCost: 1, subtotal: 1, itbis: 0, total: 1 }] },
  // Gasto menor con e-NCF: no puede.
  { isMinorExpense: true, ncf: 'E310100000001', expenseType: '02', issueDate: '2026-09-11', paymentMethod: '01', amount: 1, lines: [{ quantity: 1, unitCost: 1, subtotal: 1, itbis: 0, total: 1 }] },
  // Monto general sin subtotal, sin concepto y sin cuenta contable.
  { isMinorExpense: true, isGeneralAmount: true, expenseType: '02', issueDate: '2026-09-11', paymentMethod: '01', amount: 0, lines: [] },
  // Por lineas, sin ninguna linea.
  { isMinorExpense: true, expenseType: '02', issueDate: '2026-09-11', paymentMethod: '01', amount: 0, lines: [] },
  // Cheque de garantia a medio rellenar.
  {
    isMinorExpense: true, isGeneralAmount: true, amount: 100, description: 'x', debitAccountId: 'a1',
    expenseType: '02', issueDate: '2026-09-11', paymentMethod: '04', lines: [],
    guaranteeCheck: { bankAccountId: '', checkNumber: '', dueDate: '', amount: 0 },
  },
];

async function main(): Promise<number> {
  // ── el modulo de pasos, cargado de forma que se pueda NO existir ──
  // Contra el arbol anterior no existe, y un `import` normal reventaria el
  // banco entero en vez de dar FALLA. Una contraprueba que se cae no dice si
  // falla por lo que crees.
  let PASOS: readonly { n: number; titulo: string; campos: readonly string[] }[] = [];
  let campoDelPaso: (campo: string, n: number) => boolean = () => false;
  let hayModulo = false;
  try {
    const m = await import('../src/app/dashboard/purchases/pasos');
    PASOS = m.PASOS as any;
    campoDelPaso = m.campoDelPaso;
    hayModulo = true;
  } catch {
    hayModulo = false;
  }

  // ── las rutas que el esquema sabe rechazar ──
  const rutas = new Set<string>();
  for (const cuerpo of CUERPOS) {
    const v = esquemaCompra.safeParse(cuerpo);
    if (!v.success) for (const k of Object.keys(erroresPorCampo(v.error))) rutas.add(k);
  }

  // Esto NO es una comprobacion, es la condicion para poder comprobar: sale
  // igual antes y despues del arreglo, asi que va como excepcion y no como
  // `ok(...)`. Si los cuerpos dejaran de disparar el esquema, todo lo de abajo
  // pasaria por vacio -- verde por no mirar.
  if (rutas.size < 10) {
    throw new Error(
      `Los cuerpos de prueba solo dispararon ${rutas.size} rutas de error. ` +
      'El esquema cambio: revisa CUERPOS antes de creerte nada de lo que siga.'
    );
  }

  ok('existe el modulo de pasos, fuera de la pantalla', hayModulo);
  ok('son cuatro pasos, numerados 1..4',
    PASOS.length === 4 && PASOS.every((p, i) => p.n === i + 1));

  // ── EL REPARTO ES TOTAL: cada ruta, en exactamente un paso ──
  const sinPaso: string[] = [];
  const enVariosPasos: string[] = [];
  for (const ruta of rutas) {
    const cuantos = PASOS.filter(p => campoDelPaso(ruta, p.n)).length;
    if (cuantos === 0) sinPaso.push(ruta);
    if (cuantos > 1) enVariosPasos.push(ruta);
  }
  // Las dos mitades van en UNA asercion a proposito. Separadas, la de "ninguna
  // cae en dos pasos" salia verde contra el arbol anterior -- donde no habia
  // pasos, asi que ninguna ruta caia en dos. Cierto y vacio: la unica forma de
  // que diga algo es exigir EXACTAMENTE uno.
  const detalle = [
    sinPaso.length ? `sin paso: ${sinPaso.join(', ')}` : '',
    enVariosPasos.length ? `en varios: ${enVariosPasos.join(', ')}` : '',
  ].filter(Boolean).join(' | ');
  ok(`las ${rutas.size} rutas del esquema caen en EXACTAMENTE un paso${detalle ? ' -> ' + detalle : ''}`,
    sinPaso.length === 0 && enVariosPasos.length === 0);

  // Los hijos del cheque tienen que ir con su padre, no sueltos.
  ok('los campos del cheque de garantia caen en el mismo paso que el metodo de pago',
    hayModulo
    && campoDelPaso('paymentMethod', 3)
    && campoDelPaso('guaranteeCheck.checkNumber', 3)
    && campoDelPaso('guaranteeCheck.amount', 3));

  // El paso 4 no vigila campos: es el repaso. Si tuviera, seria un paso mas.
  ok('el paso 4 no vigila ningun campo (es el repaso)',
    hayModulo && PASOS[3].campos.length === 0);

  // Las dos decisiones de forma mandan sobre lo que viene despues, asi que su
  // campo obligatorio (`description`, solo con monto general) tiene que estar
  // donde se toman: en el paso 1.
  ok('el concepto se vigila en el paso 1, donde se decide si hace falta',
    hayModulo && campoDelPaso('description', 1) && !campoDelPaso('description', 2));

  // ── la pantalla ──
  const src = fuente(RUTA_PANTALLA).replace(/\r\n/g, '\n');

  // Un componente definido dentro del render se remonta en cada pasada y el
  // campo que escribes pierde el foco. Tienen que ser funciones, en minuscula.
  ok('los pasos son funciones que devuelven JSX, no componentes',
    /const paso1 = \(\) =>/.test(src)
    && /const paso4 = \(\) =>/.test(src)
    && !/const Paso[1-4]\b/.test(src)
    && !/<Paso[1-4]\b/.test(src));

  // El cuerpo se arma UNA vez. Si el paso armara el suyo, podria dar por bueno
  // algo que el guardado rechaza: cuatro pasos en verde y un error al final.
  ok('el cuerpo se arma en un solo sitio y lo usan el paso y el guardado',
    veces(src, 'const armarPayload = () =>') === 1
    && src.includes('esquemaCompra.safeParse(armarPayload())')
    && src.includes('const payload = armarPayload();'));

  // Saltar hacia adelante desde la barra no puede ser un atajo para esquivar lo
  // que el boton "Siguiente" si comprueba.
  ok('avanzar y saltar hacia adelante pasan por la misma comprobacion',
    veces(src, 'const frenaElPaso = ') === 1
    && /const avanzar = \(\) => \{\s*if \(frenaElPaso\(paso\)\) return;/.test(src)
    && /for \(let i = paso; i < n; i\+\+\) \{\s*if \(frenaElPaso\(i\)\)/.test(src));

  // Editar es corregir un campo que ya sabes cual es; cuatro pasos para llegar
  // es peor que el scroll de antes.
  // OJO: `fuente()` quita los comentarios, asi que anclar esto en el comentario
  // que lo explica seria una asercion que no puede pasar nunca. Se ancla en el
  // codigo, y ademas en su vecindario: `setVistaCompleta(true)` suelto en
  // cualquier parte no dice que sea el camino de la edicion.
  ok('al editar se abre la vista completa, no el asistente',
    veces(src, 'setVistaCompleta(true)') === 1
    && /setVistaCompleta\(true\);\s*setPaso\(1\);\s*setActiveTab\('nuevo'\);\s*setSelectedExpense\(null\);/.test(src));

  ok('al empezar de cero se vuelve al paso 1 y al asistente',
    veces(src, 'setVistaCompleta(false)') >= 3
    && /const resetForm = \(\) => \{\s*setEditingExpenseId\(null\);\s*setPaso\(1\);\s*setVistaCompleta\(false\);/.test(src));

  // La vista completa tiene que seguir siendo una SALIDA, no una pantalla
  // distinta: los mismos cuatro bloques, sin una segunda copia que mantener.
  ok('la vista completa reusa los mismos pasos, no los duplica',
    veces(src, 'paso1()') === 2 && veces(src, 'paso2()') === 2
    && veces(src, 'paso3()') === 2 && veces(src, 'paso4()') === 2);

  ok('se puede cambiar de vista en las dos direcciones',
    src.includes('setVistaCompleta(v => !v)')
    && src.includes('Ver todo en una pagina') && src.includes('Ver por pasos'));

  // El paso 4 sin repaso seria la caja de totales con otro nombre.
  ok('el paso 4 ensena que se va a guardar, con enlaces para corregir',
    veces(src, 'const repaso = ') === 1
    && src.includes('{!vistaCompleta && repaso()}')
    && /onClick=\{\(\) => irAPaso\(dePaso\)\}/.test(src));

  // Comprobar solo que el guardado sigue validando ya pasaba ANTES: lleva
  // validando desde P2-34. Apretada: el esquema tiene que consultarse en DOS
  // sitios exactos -- el paso y el guardado -- y en ninguno mas. Un tercero
  // seria una regla paralela, que es justo lo que P2-34 vino a quitar.
  ok('el esquema se consulta en dos sitios: el paso y el guardado, y en ninguno mas',
    veces(src, 'esquemaCompra.safeParse(') === 2
    && veces(src, 'esquemaCompra.safeParse(payload)') === 1
    && veces(src, 'esquemaCompra.safeParse(armarPayload())') === 1
    && src.includes('onClick={saveExpense}'));

  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
  return fallos === 0 ? 0 : 1;
}

main().then(c => process.exit(c), e => { console.error(e); process.exit(2); });
