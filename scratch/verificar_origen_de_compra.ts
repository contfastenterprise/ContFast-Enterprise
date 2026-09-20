/**
 * Lote 170 -- una compra por cheque, transferencia o tarjeta NO acredita la caja.
 *
 * Dos partes:
 *   1) la REGLA, ejecutada de verdad (services/cxp/origenDeLaCompra.ts): que
 *      exige origen, que acepta, que rechaza y por que.
 *   2) el CABLEADO, leyendo el codigo: las tres puertas a las compras (alta,
 *      edicion, servicio) resuelven el origen ANTES de escribir, lo guardan,
 *      acreditan esa cuenta y lo llevan al libro del banco.
 *
 * La parte de base de datos -- que el asiento acredita el banco de verdad y que
 * editar mueve solo la diferencia -- esta en `verificar_origen_de_compra_db.ts`.
 *
 * Nota de metodo: los ficheros se leen, no se importan, salvo los modulos
 * puros. Importar una ruta de Next arrastra media aplicacion, y ademas la
 * contraprueba tiene que FALLAR comprobacion a comprobacion, no reventar al
 * cargar un modulo que el lote crea (por eso los import son perezosos y hay
 * `falta()`).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

/** El cuerpo de una funcion exportada: desde su firma hasta el siguiente `export`. */
const bloque = (src: string, nombre: string): string => {
  const i = src.indexOf(nombre);
  if (i < 0) return '';
  const desde = src.slice(i);
  const fin = desde.indexOf('\nexport ');
  return fin > 0 ? desde.slice(0, fin) : desde;
};

const RUTA_ALTA = 'src/app/api/v1/expenses/route.ts';
const RUTA_EDICION = 'src/app/api/v1/expenses/[id]/route.ts';
const SERVICIO = 'src/services/expenseService.ts';
const PANTALLA = 'src/app/dashboard/purchases/page.tsx';

async function main() {
  // --- Precondiciones: los ficheros que el lote toca existen y se llaman asi.
  // Nombran ficheros, no cuentan. Valen en los DOS estados salvo los que el
  // lote crea, que por eso no son precondicion sino comprobacion.
  for (const f of [RUTA_ALTA, RUTA_EDICION, SERVICIO, PANTALLA]) {
    if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: falta ${f}`);
  }

  console.log('\n1) La regla: que forma de pago exige decir de donde sale el dinero\n');

  let R: typeof import('../src/services/cxp/origenDeLaCompra') | null = null;
  try { R = await import('../src/services/cxp/origenDeLaCompra'); } catch { R = null; }

  if (!R) {
    for (const t of [
      'el 02 (cheque/transferencia) exige origen',
      'el 03 (tarjeta) exige origen',
      'el 01 (efectivo) no lo exige',
      'el 04 (credito) no lo exige',
      'solo la tarjeta admite que el origen no sea un banco',
      'sin origen, el 02 se niega diciendo que la compra acreditaria la caja',
      'el 02 con una cuenta que no es de banco se niega',
      'el efectivo con banco se niega',
      'el credito con banco se niega',
      'un banco sin cuenta contable se niega',
      'un banco de otra empresa se niega',
      'la cuenta del asiento tiene que ser la del banco elegido',
      'la tarjeta contra una cuenta de agrupacion se niega',
      'la tarjeta contra una cuenta que no es pasivo se niega',
      'la tarjeta contra una cuenta por pagar transaccional vale',
      'la cuenta que acredita es la del banco',
      'la cuenta que acredita, en tarjeta de credito, es la elegida',
    ]) falta(t, 'no existe services/cxp/origenDeLaCompra.ts');
  } else {
    const { necesitaOrigen, admiteTarjetaDeCredito, motivoParaNoRegistrarCompra, motivoCuentaDelOrigen, cuentaQueAcredita } = R;

    ok('el 02 (cheque/transferencia) exige origen', necesitaOrigen('02') === true);
    ok('el 03 (tarjeta) exige origen', necesitaOrigen('03') === true);
    ok('el 01 (efectivo) no lo exige', necesitaOrigen('01') === false);
    ok('el 04 (credito) no lo exige', necesitaOrigen('04') === false);
    ok('solo la tarjeta admite que el origen no sea un banco',
      admiteTarjetaDeCredito('03') === true && admiteTarjetaDeCredito('02') === false && admiteTarjetaDeCredito('01') === false);

    const m02 = motivoParaNoRegistrarCompra('02', {});
    ok('sin origen, el 02 se niega diciendo que la compra acreditaria la caja',
      !!m02 && /caja/i.test(m02), String(m02));
    const m03 = motivoParaNoRegistrarCompra('03', {});
    ok('sin origen, el 03 se niega ofreciendo las dos opciones (debito o credito)',
      !!m03 && /bancaria/i.test(m03) && /tarjeta de cr/i.test(m03), String(m03));
    const m02cuenta = motivoParaNoRegistrarCompra('02', { paymentAccountId: 'c1' });
    ok('el 02 con una cuenta que no es de banco se niega',
      !!m02cuenta && /cuenta bancaria/i.test(m02cuenta), String(m02cuenta));
    ok('el 02 con banco pasa', motivoParaNoRegistrarCompra('02', { bankAccountId: 'b1' }) === null);
    ok('el 03 con cuenta de tarjeta pasa', motivoParaNoRegistrarCompra('03', { paymentAccountId: 'c1' }) === null);

    const m01 = motivoParaNoRegistrarCompra('01', { bankAccountId: 'b1' });
    ok('el efectivo con banco se niega', !!m01 && /efectivo/i.test(m01), String(m01));
    const m04 = motivoParaNoRegistrarCompra('04', { bankAccountId: 'b1' });
    ok('el credito con banco se niega', !!m04 && /cr[eé]dito/i.test(m04), String(m04));
    ok('el efectivo sin origen pasa', motivoParaNoRegistrarCompra('01', {}) === null);
    ok('el credito sin origen pasa', motivoParaNoRegistrarCompra('04', {}) === null);

    const banco = { chartAccountId: 'cta-banco', bankName: 'Popular', accountNumber: '777' };
    const pasivo = { id: 'c1', code: '2.1.05.01', name: 'Tarjeta Visa', type: 'liability', isTransactional: true, status: 'active', deletedAt: null };

    ok('un banco de otra empresa se niega',
      /no existe o no pertenece/i.test(String(motivoCuentaDelOrigen('02', { bankAccountId: 'b1' }, undefined, undefined))));
    const sinCta = motivoCuentaDelOrigen('02', { bankAccountId: 'b1' }, undefined, { ...banco, chartAccountId: null });
    ok('un banco sin cuenta contable se niega, y dice donde arreglarlo',
      !!sinCta && /cuenta contable/i.test(sinCta) && /Bancos/.test(sinCta), String(sinCta));
    const discrepa = motivoCuentaDelOrigen('02', { bankAccountId: 'b1', paymentAccountId: 'otra' }, undefined, banco);
    ok('la cuenta del asiento tiene que ser la del banco elegido',
      !!discrepa && /libro de banco/i.test(discrepa), String(discrepa));
    ok('el banco bien puesto pasa', motivoCuentaDelOrigen('02', { bankAccountId: 'b1' }, undefined, banco) === null);

    const agrupacion = motivoCuentaDelOrigen('03', { paymentAccountId: 'c1' }, { ...pasivo, isTransactional: false }, undefined);
    ok('la tarjeta contra una cuenta de agrupacion se niega', !!agrupacion && /agrupaci/i.test(agrupacion), String(agrupacion));
    const noPasivo = motivoCuentaDelOrigen('03', { paymentAccountId: 'c1' }, { ...pasivo, type: 'asset' }, undefined);
    ok('la tarjeta contra una cuenta que no es pasivo se niega', !!noPasivo && /pasivo/i.test(noPasivo), String(noPasivo));
    const borrada = motivoCuentaDelOrigen('03', { paymentAccountId: 'c1' }, { ...pasivo, deletedAt: new Date() }, undefined);
    ok('la tarjeta contra una cuenta borrada se niega', !!borrada, String(borrada));
    ok('la tarjeta contra una cuenta por pagar transaccional vale',
      motivoCuentaDelOrigen('03', { paymentAccountId: 'c1' }, pasivo, undefined) === null);
    ok('con efectivo no se mira ninguna cuenta', motivoCuentaDelOrigen('01', {}, undefined, undefined) === null);

    ok('la cuenta que acredita es la del banco', cuentaQueAcredita({ bankAccountId: 'b1' }, banco) === 'cta-banco');
    ok('la cuenta que acredita, en tarjeta de credito, es la elegida',
      cuentaQueAcredita({ paymentAccountId: 'c1' }, undefined) === 'c1');
    ok('el banco MANDA sobre la cuenta suelta (no se cuela otra cuenta con un banco elegido)',
      cuentaQueAcredita({ bankAccountId: 'b1', paymentAccountId: 'colada' }, banco) === 'cta-banco');
  }

  console.log('\n2) El desplegable de la pantalla: ida y vuelta del origen\n');
  if (!R) {
    for (const t of ['el valor del banco vuelve a salir banco', 'el valor de la cuenta vuelve a salir cuenta', 'sin origen, valor vacio', 'un valor vacio no inventa origen'])
      falta(t, 'no existe services/cxp/origenDeLaCompra.ts');
  } else {
    const { valorDeOrigen, partirOrigen, FORMAS_DE_PAGO } = R;
    ok('el valor del banco vuelve a salir banco',
      partirOrigen(valorDeOrigen({ bankAccountId: 'b1' })).bankAccountId === 'b1');
    ok('  y no arrastra cuenta contable',
      !partirOrigen(valorDeOrigen({ bankAccountId: 'b1' })).paymentAccountId);
    ok('el valor de la cuenta vuelve a salir cuenta',
      partirOrigen(valorDeOrigen({ paymentAccountId: 'c1' })).paymentAccountId === 'c1');
    ok('  y no arrastra banco',
      !partirOrigen(valorDeOrigen({ paymentAccountId: 'c1' })).bankAccountId);
    ok('sin origen, valor vacio', valorDeOrigen({}) === '');
    const vacio = partirOrigen('');
    ok('un valor vacio no inventa origen', !vacio.bankAccountId && !vacio.paymentAccountId);
    // Un id que empieza por el nombre del otro prefijo no se confunde.
    ok('un id que contiene ":" no rompe el reparto',
      partirOrigen('banco:b:1').bankAccountId === 'b:1');
    ok('el 03 se llama TARJETA, que es lo que declara el 606 (decia "Transferencia")',
      /tarjeta/i.test(FORMAS_DE_PAGO['03']) && !/transferencia/i.test(FORMAS_DE_PAGO['03']), FORMAS_DE_PAGO['03']);
    ok('el 02 es el que lleva la transferencia', /transferencia/i.test(FORMAS_DE_PAGO['02']), FORMAS_DE_PAGO['02']);
  }

  console.log('\n3) Que bancos se ajustan al editar o borrar\n');
  // `bancosAAjustar` vive en el modulo PURO (origenDeLaCompra), no junto al
  // movimiento de banco: si viviera alli, probarlo exigiria `@/db` y una
  // DATABASE_URL, y este banco no levanta ninguna base.
  if (!R) {
    for (const t of ['sin banco antes ni despues, no hay nada que ajustar', 'el mismo banco sale UNA vez', 'cambiar de banco saca los DOS'])
      falta(t, 'no existe services/cxp/origenDeLaCompra.ts o no exporta bancosAAjustar');
  } else {
    const { bancosAAjustar } = R;
    ok('sin banco antes ni despues, no hay nada que ajustar', bancosAAjustar({}, {}).length === 0);
    const mismo = bancosAAjustar({ bankAccountId: 'b1', paymentAccountId: 'cta1' }, { bankAccountId: 'b1', cuentaQueAcredita: 'cta1' });
    ok('el mismo banco sale UNA vez (se mueve la diferencia, no el importe entero)',
      mismo.length === 1 && mismo[0].bankAccountId === 'b1' && mismo[0].cuenta === 'cta1', JSON.stringify(mismo));
    const cambia = bancosAAjustar({ bankAccountId: 'b1', paymentAccountId: 'cta1' }, { bankAccountId: 'b2', cuentaQueAcredita: 'cta2' });
    ok('cambiar de banco saca los DOS (al viejo hay que devolverle lo que se le saco)',
      cambia.length === 2 && cambia[0].bankAccountId === 'b1' && cambia[1].bankAccountId === 'b2', JSON.stringify(cambia));
    ok('una compra anterior al lote (sin banco guardado) solo saca el nuevo',
      bancosAAjustar({}, { bankAccountId: 'b2', cuentaQueAcredita: 'cta2' }).length === 1);
    ok('borrar (sin "despues") saca el que tenia', bancosAAjustar({ bankAccountId: 'b1', paymentAccountId: 'cta1' }, {}).length === 1);
    ok('un banco guardado sin cuenta contable no se ajusta a ciegas',
      bancosAAjustar({ bankAccountId: 'b1', paymentAccountId: null }, {}).length === 0);
  }

  console.log('\n4) El esquema marca el campo, no revienta al guardar\n');
  let S: typeof import('../src/schemas/compra') | null = null;
  try { S = await import('../src/schemas/compra'); } catch { S = null; }
  if (!S) {
    for (const t of [
      'el esquema rechaza una compra 02 sin origen',
      '  y el error cae en paymentAccountId, para que el campo salga marcado',
      'con banco, el esquema la acepta',
      'en efectivo con banco, la rechaza',
      'en efectivo sin origen, la acepta',
    ]) falta(t, 'schemas/compra no carga (depende de origenDeLaCompra)');
  } else {
    const compra = (extra: Record<string, unknown>) => S!.esquemaCompra.safeParse({
      isMinorExpense: true, expenseType: '02', issueDate: '2026-09-19', amount: 100,
      description: 'prueba', debitAccountId: 'cta-gasto', isGeneralAmount: true, ...extra,
    });
    const sinOrigen = compra({ paymentMethod: '02' });
    const campos = sinOrigen.success ? {} : S.erroresPorCampo(sinOrigen.error);
    ok('el esquema rechaza una compra 02 sin origen', !sinOrigen.success);
    ok('  y el error cae en paymentAccountId, para que el campo salga marcado',
      !!campos['paymentAccountId'], JSON.stringify(campos));
    // "La acepta" es verdad de balde antes del lote (el esquema ignoraba los
    // dos campos y aceptaba todo): va unida a que sin banco la rechace.
    ok('con banco la acepta, y sin banco no', compra({ paymentMethod: '02', bankAccountId: 'b1' }).success === true && !sinOrigen.success);
    ok('en efectivo con banco, la rechaza', compra({ paymentMethod: '01', bankAccountId: 'b1' }).success === false);
    ok('en efectivo sin origen la acepta, y con banco no',
      compra({ paymentMethod: '01' }).success === true && compra({ paymentMethod: '01', bankAccountId: 'b1' }).success === false);
  }

  console.log('\n5) El asistente por pasos: el campo nuevo tiene paso\n');
  const pasos = leer('src/app/dashboard/purchases/pasos.ts');
  let P: typeof import('../src/app/dashboard/purchases/pasos') | null = null;
  try { P = await import('../src/app/dashboard/purchases/pasos'); } catch { P = null; }
  if (!P) {
    falta('paymentAccountId cae en el paso 3 (donde se elige la forma de pago)', 'no se pudo cargar pasos.ts');
  } else {
    const { campoDelPaso, PASOS } = P;
    ok('paymentAccountId cae en el paso 3 (donde se elige la forma de pago)', campoDelPaso('paymentAccountId', 3));
    ok('  y en ningun otro',
      PASOS.filter(p => campoDelPaso('paymentAccountId', p.n)).length === 1);
    ok('bankAccountId tambien tiene paso (el esquema podria colgar de el)', campoDelPaso('bankAccountId', 3));
  }
  // Precondicion, no comprobacion: es cierta en los DOS estados, asi que como
  // `ok()` seria un OK de balde antes del lote. Lo que vigila es que nadie
  // borre la regla de reparto al añadir el campo nuevo.
  if (!/EXACTAMENTE un/.test(pasos)) throw new Error('Precondicion: pasos.ts ya no documenta que el reparto es total');
  console.log('  pre   el reparto de campos por paso sigue documentado como total');

  console.log('\n6) El cableado del ALTA\n');
  const alta = leer(RUTA_ALTA);
  ok('el alta importa el resolvedor del origen', /from '@\/services\/cxp\/resolverOrigenDeCompra'/.test(alta));
  ok('  y lo llama', /\bresolverOrigenDeCompra\(/.test(alta));
  ok('el alta lee paymentAccountId y bankAccountId del cuerpo',
    /\n\s*paymentAccountId,/.test(alta) && /\n\s*bankAccountId\b/.test(alta));
  // Lo importante no es que resuelva, sino que resuelva ANTES de escribir: si
  // lo hiciera despues, una compra con banco de otra empresa quedaria a medias.
  const iOrigen = alta.indexOf('resolverOrigenDeCompra(');
  const iInsert = alta.indexOf('.insert(expenses)');
  ok('resuelve el origen ANTES de insertar la compra', iOrigen > 0 && iInsert > 0 && iOrigen < iInsert, `${iOrigen} < ${iInsert}`);
  ok('guarda el origen en la compra (no lo deduce luego)',
    /paymentAccountId: origen\.cuentaQueAcredita/.test(alta) && /bankAccountId: origen\.bankAccountId/.test(alta));
  ok('la cuenta que acredita sale del origen, no siempre de la caja',
    /origen\.cuentaQueAcredita\s*\n?\s*\?\s*\{ id: origen\.cuentaQueAcredita \}/.test(alta));
  // Estas dos son ciertas ANTES del lote (la caja era el unico recurso, y el
  // lote 169 ya limitaba la sesion al metodo 01): van unidas a la marca del
  // estado posterior, o serian dos OK regalados en la contraprueba.
  ok('  y la caja sigue siendo el recurso cuando no hay origen (efectivo)',
    /'cash', '1\.1\.01\.01'/.test(alta) && /origen\.cuentaQueAcredita/.test(alta));
  ok('el efectivo solo pasa por la sesion de caja si es metodo 01 (lote 169 intacto)',
    /\n\s*if \(paymentMethod === '01'\) await reflejarEnCaja\(/.test(alta) && /reflejarEnBancoDeCompra\(/.test(alta));
  ok('lo que sale de un banco queda en SU libro', /\n\s*if \(origen\.bankAccountId\) \{/.test(alta));
  ok('  con el importe medido en el mayor de esa cuenta, no recalculado',
    /cambioEnCuenta: await efectoEnCuentaDeDocumento\(/.test(alta));

  console.log('\n7) El cableado de la EDICION y el BORRADO\n');
  const ed = leer(RUTA_EDICION);
  ok('la edicion importa el resolvedor y los bancos a ajustar',
    /from '@\/services\/cxp\/resolverOrigenDeCompra'/.test(ed)
    && /import \{ bancosAAjustar \} from '@\/services\/cxp\/origenDeLaCompra'/.test(ed));
  ok('la edicion lee los dos campos del cuerpo',
    /\n\s*paymentAccountId,/.test(ed) && /\n\s*bankAccountId,/.test(ed));
  const iOrigenPut = ed.indexOf('resolverOrigenDeCompra(');
  const iUpdate = ed.indexOf('.update(expenses)');
  ok('la edicion resuelve el origen ANTES de escribir', iOrigenPut > 0 && iUpdate > 0 && iOrigenPut < iUpdate, `${iOrigenPut} < ${iUpdate}`);
  ok('la edicion GUARDA el origen nuevo', /paymentAccountId: origenPut\.cuentaQueAcredita/.test(ed));
  ok('la edicion acredita la cuenta del origen', /origenPut\.cuentaQueAcredita\s*\n?\s*\?\s*\{ id: origenPut\.cuentaQueAcredita \}/.test(ed));
  // La DIFERENCIA, no el importe: se mide antes y despues. Sin el "antes",
  // editar el concepto de una compra vieja duplicaria el retiro en el banco.
  ok('la edicion mide el banco ANTES de tocar nada', /const bancoAntesPut = new Map/.test(ed));
  ok('  y apunta solo la diferencia',
    /cambioEnCuenta:\s*\n?\s*\(await efectoEnCuentaDeDocumento\([^)]*\)\) -\s*\n?\s*\(bancoAntesPut\.get\(b\.bankAccountId\) \?\? 0\)/.test(ed));
  ok('la edicion recorre los bancos de bancosAAjustar (el viejo y el nuevo)',
    /const bancosPut = bancosAAjustar\(existing\[0\], origenPut\)/.test(ed));
  ok('el borrado mide el banco antes de revertir', /const bancosDel = bancosAAjustar\(expenseRow, \{\}\)/.test(ed));
  ok('  y devuelve al banco lo que la reversion le puso',
    /\(bancoAntesDel\.get\(b\.bankAccountId\) \?\? 0\)/.test(ed));
  ok('el detalle devuelve el origen guardado (si no, editar lo perderia)',
    /paymentAccountId: expenses\.paymentAccountId/.test(ed) && /bankAccountId: expenses\.bankAccountId/.test(ed));

  console.log('\n8) La otra puerta: createExpense\n');
  const svc = leer(SERVICIO);
  const cuerpo = bloque(svc, 'export async function createExpense');
  ok('createExpense admite el origen en su tipo', /paymentAccountId\?: string \| null/.test(cuerpo));
  ok('createExpense resuelve el origen', /resolverOrigenDeCompra\(/.test(cuerpo));
  const iOrigenSvc = cuerpo.indexOf('resolverOrigenDeCompra(');
  const iInsertSvc = cuerpo.indexOf('.insert(expenses)');
  ok('  antes de insertar', iOrigenSvc > 0 && iInsertSvc > 0 && iOrigenSvc < iInsertSvc, `${iOrigenSvc} < ${iInsertSvc}`);
  ok('createExpense guarda el origen', /paymentAccountId: origen\.cuentaQueAcredita/.test(cuerpo));
  ok('createExpense acredita la cuenta del origen', /origen\.cuentaQueAcredita/.test(cuerpo) && /\{ id: origen\.cuentaQueAcredita \}/.test(cuerpo));
  ok('createExpense lleva el retiro al libro del banco', /reflejarEnBancoDeCompra\(/.test(cuerpo));

  console.log('\n9) La pantalla\n');
  const ui = leer(PANTALLA);
  ok('la pantalla usa los nombres del catalogo, no una copia suya',
    /FORMAS_DE_PAGO\[/.test(ui) && !/'03': 'Transferencia'/.test(ui));
  ok('la pantalla pregunta de donde sale el pago solo cuando hace falta',
    /\{necesitaOrigen\(paymentMethod\) && \(/.test(ui));
  ok('  ofreciendo las cuentas bancarias', /bankAccountsList\.map/.test(ui) && /valorDeOrigen\(\{ bankAccountId: b\.id \}\)/.test(ui));
  ok('  y, solo en tarjeta, las cuentas por pagar',
    /admiteTarjetaDeCredito\(paymentMethod\) && \(/.test(ui) && /acc\.type === 'liability'/.test(ui));
  ok('lo manda partido en los dos campos', /partirOrigen\(necesitaOrigen\(paymentMethod\) \? origenDelPago : ''\)/.test(ui));
  ok('cambiar la forma de pago limpia el origen (el de un cheque no vale para una tarjeta)',
    /setPaymentMethod\(e\.target\.value\);[\s\S]{0,400}?setOrigenDelPago\(''\)/.test(ui));
  ok('al editar, el origen guardado vuelve al campo',
    /setOrigenDelPago\(valorDeOrigen\(\{ bankAccountId: expense\.bankAccountId/.test(ui));

  console.log('\n10) La columna existe en el esquema y hay migracion\n');
  // Acotado a la tabla `expenses`: `bank_account_id` existe ya en `checks` y en
  // los recibos de cobro, asi que buscarlo en todo el fichero daba un OK de
  // balde -- lo caza la contraprueba.
  const esquema = leer('src/db/schema/accounting.ts');
  const tablaExpenses = bloque(esquema, "export const expenses = pgTable(");
  ok('expenses guarda la cuenta del pago', /paymentAccountId: uuid\('payment_account_id'\)/.test(tablaExpenses));
  ok('expenses guarda la cuenta bancaria', /bankAccountId: uuid\('bank_account_id'\)/.test(tablaExpenses));
  const mig = leer('drizzle/0011_origen_de_pago_compra.sql');
  ok('hay migracion 0011', mig.length > 0);
  // La propiedad, no el texto: TODA sentencia de la migracion añade. Basta un
  // DROP, un UPDATE o un DELETE para que deje de ser aditiva, y una migracion
  // que reescribe datos ya emitidos no es de este lote. (`ON UPDATE no action`
  // lleva la palabra UPDATE dentro: por eso se mira sentencia a sentencia.)
  const sentencias = mig.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  ok('  y solo AÑADE (columnas y claves foraneas), no reescribe ni borra nada ya emitido',
    sentencias.length > 0 && sentencias.every(s => /^ALTER TABLE .* ADD (COLUMN|CONSTRAINT)\b/i.test(s)),
    `${sentencias.length} sentencias`);
  ok('  anotada en el diario de drizzle', /0011_origen_de_pago_compra/.test(leer('drizzle/meta/_journal.json')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
