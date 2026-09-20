/**
 * Lote 172 -- cerrar la caja deja de ser una formalidad.
 *
 * LO MEDIDO (2026-09-20, PRODUCCION, solo lectura)
 * ------------------------------------------------
 * Las TRES sesiones cerradas de Latin Doors cuadran al centavo y ninguna lleva
 * justificacion: 1.200.825,01 contra 1.200.825,01 (34 dias abierta) y
 * 2.204.992,49 contra 2.204.992,49 (44 dias), con 85.000,00 reales en la caja.
 * Los importes llevan centimos y los billetes son enteros: el unico campo con
 * decimales era "Total Monedas", libre y sin tope. Se escribio ahi el esperado.
 *
 * Y el esperado estaba inflado desde antes: de esos 2.204.992,49, **2.200.052,48
 * son cobros** marcados como efectivo -- uno de 602.000,00, otro de 550.000,00,
 * dos de 400.000,00 --, que son transferencias anotadas como efectivo porque
 * hasta el lote 151 el cobro no podia decir por que banco entro.
 *
 * QUE VIGILA ESTE BANCO
 * ---------------------
 *  1. la regla del conteo, ejecutada (modulo puro, sin base de datos);
 *  2. que el TOTAL lo calcule el servidor y no llegue del cliente;
 *  3. el arqueo ciego: el esperado no sale por la API con la sesion abierta,
 *     ni se pinta al lado del formulario;
 *  4. que una transferencia conste en el cuadre con su constancia, sin contar
 *     como efectivo, y que una venta a credito no toque la caja.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');

/**
 * El fichero sin comentarios.
 *
 * Hace falta para las comprobaciones en NEGATIVO ("ya no queda X"). Este lote
 * explica en sus comentarios que retira `actualBalance`, "Total Monedas" y
 * "Total Esperado" -- y esas mismas palabras hacian fallar al banco, que las
 * encontraba en la explicacion de que ya no estan. Un banco que obliga a no
 * poder nombrar lo que se retiro empuja a escribir comentarios peores.
 *
 * Limitacion conocida: corta tambien en un "//" dentro de una cadena (una URL).
 * Vale para buscar identificadores, no para analizar el fichero.
 */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const RUTA_CIERRE = 'src/app/api/v1/cash/sessions/[id]/close/route.ts';
const RUTA_ACTIVA = 'src/app/api/v1/cash/sessions/active/route.ts';
const SERVICIO = 'src/services/cashService.ts';
const REPO = 'src/repositories/cashRepository.ts';
const PANTALLA = 'src/app/dashboard/cash/page.tsx';
const FACTURA = 'src/services/invoice/invoiceDbBooker.ts';
const COBRO = 'src/services/cartera/cuentaDelCobro.ts';

async function main() {
  for (const f of [RUTA_CIERRE, RUTA_ACTIVA, SERVICIO, REPO, PANTALLA, FACTURA, COBRO]) {
    if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: falta ${f}`);
  }
  const pantalla = leer(PANTALLA);
  // Vale en los dos estados: lo que cambia es QUE se ve, no que exista.
  if (!/Resumen de Auditoría/.test(pantalla)) throw new Error('Precondicion: la pantalla de cierre ya no tiene el resumen de auditoria');

  console.log('\n1) La regla del conteo, ejecutada\n');
  let C: typeof import('../src/services/caja/conteoDeCaja') | null = null;
  try { C = await import('../src/services/caja/conteoDeCaja'); } catch { C = null; }

  if (!C) {
    for (const t of [
      'las monedas son denominaciones, no un campo libre',
      'el total sale del desglose',
      'un conteo vacio no es un conteo',
      'una denominacion que no existe se rechaza',
      'media unidad de billete se rechaza',
      'una cantidad negativa se rechaza',
      'una denominacion repetida se rechaza',
      'falta una denominacion: se rechaza',
      'la caja vacia SI es un conteo valido',
      'la diferencia se calcula en centavos',
      'una transferencia sin constancia se señala',
    ]) falta(t, 'no existe services/caja/conteoDeCaja.ts');
  } else {
    const { DENOMINACIONES, totalDelConteo, motivoParaNoContar, arquear, resumirTransferencias } = C;
    const completo = (billetes: Record<number, number> = {}) =>
      DENOMINACIONES.map((d) => ({ denominacion: d.valor, cantidad: billetes[d.valor] || 0 }));

    const monedas = DENOMINACIONES.filter((d) => d.tipo === 'moneda').map((d) => d.valor);
    ok('las monedas son denominaciones, no un campo libre',
      monedas.length > 0 && [25, 10, 5, 1].every((v) => monedas.includes(v)), monedas.join(', '));
    ok('  y los billetes siguen estando', DENOMINACIONES.filter((d) => d.tipo === 'billete').length === 6);

    ok('el total sale del desglose', totalDelConteo(completo({ 2000: 2, 100: 3, 25: 4 })) === 4000 + 300 + 100,
      String(totalDelConteo(completo({ 2000: 2, 100: 3, 25: 4 }))));
    ok('  y un desglose todo a cero suma cero', totalDelConteo(completo()) === 0);

    ok('un conteo vacio no es un conteo', !!motivoParaNoContar([]));
    ok('  ni uno que no llega', !!motivoParaNoContar(undefined) && !!motivoParaNoContar(null));
    const inventada = motivoParaNoContar([{ denominacion: 3, cantidad: 1 }]);
    ok('una denominacion que no existe se rechaza', !!inventada && /curso legal/.test(inventada), String(inventada));
    const media = motivoParaNoContar(completo().map((l) => l.denominacion === 50 ? { ...l, cantidad: 1.5 } : l));
    ok('media unidad de billete se rechaza', !!media && /entero/.test(media), String(media));
    const negativa = motivoParaNoContar(completo().map((l) => l.denominacion === 50 ? { ...l, cantidad: -1 } : l));
    ok('una cantidad negativa se rechaza', !!negativa, String(negativa));
    const repetida = motivoParaNoContar([...completo(), { denominacion: 100, cantidad: 1 }]);
    ok('una denominacion repetida se rechaza', !!repetida && /dos veces/.test(repetida), String(repetida));
    const incompleto = motivoParaNoContar(completo().slice(0, 3));
    ok('falta una denominacion: se rechaza (declarar el cero es parte del arqueo)',
      !!incompleto && /todas las denominaciones/.test(incompleto), String(incompleto));
    ok('la caja vacia SI es un conteo valido (una caja puede estar vacia)', motivoParaNoContar(completo()) === null);

    const a = arquear(completo({ 100: 1, 50: 1 }), 200);
    ok('el arqueo dice contado, esperado y diferencia',
      a.contado === 150 && a.esperado === 200 && a.diferencia === -50, JSON.stringify(a));
    ok('  y marca que hay que aprobarlo', a.requiereAprobacion === true);
    ok('  sin diferencia, no hace falta aprobacion', arquear(completo({ 100: 2 }), 200).requiereAprobacion === false);
    // El esperado SI trae centimos: sale de sumar importes de venta. Restar en
    // pesos deja residuos de coma flotante y una caja cuadrada sale descuadrada.
    const conCentimos = arquear(completo({ 2000: 1, 100: 1, 25: 1, 5: 1 }), 2130.00);
    ok('la diferencia se calcula en centavos, no en pesos', conCentimos.diferencia === 0,
      String(conCentimos.diferencia));
    // Lo contado es SIEMPRE entero (las denominaciones lo son) y el esperado
    // trae centimos, que es justo donde la resta ingenua se rompe:
    // 100 - 99.9 da 0.09999999999999432, no 0.10. Un faltante de diez centavos
    // saldria como una cifra imposible de explicar en un arqueo.
    ok('  un faltante de diez centavos es 0,10 y no 0,0999...',
      arquear(completo({ 100: 1 }), 99.9).diferencia === 0.1,
      String(arquear(completo({ 100: 1 }), 99.9).diferencia));
    ok('  y con dos mil en caja, igual', arquear(completo({ 2000: 1 }), 1999.9).diferencia === 0.1,
      String(arquear(completo({ 2000: 1 }), 1999.9).diferencia));

    const r = resumirTransferencias([
      { id: 'a', forma: 'bank', importe: 602000, constancia: 'TRF-1' },
      { id: 'b', forma: 'check', importe: 0.1, constancia: null },
      { id: 'c', forma: 'bank', importe: 0.2, constancia: '   ' },
    ]);
    ok('una transferencia sin constancia se señala', r.sinConstancia.length === 2, JSON.stringify(r.sinConstancia.map((x) => x.id)));
    ok('  y el total tambien se suma en centavos', r.total === 602000.3, String(r.total));
  }

  console.log('\n2) El total lo calcula el servidor, no el cliente\n');
  const cierre = leer(RUTA_CIERRE);
  ok('la ruta de cierre recibe el conteo', /conteo: z\.array\(/.test(cierre));
  // La negacion sola seria verdad de balde si la ruta no existiera: va unida a
  // que el conteo SI llegue.
  ok('  y ya NO acepta un total del cliente',
    !/actualBalance/.test(sinComentarios(cierre)) && /conteo: z\.array\(/.test(cierre));
  const servicio = leer(SERVICIO);
  ok('el servicio calcula el arqueo con la regla', /arquear\(conteo,/.test(servicio));
  ok('  y valida el conteo antes de nada', /motivoParaNoContar\(conteo\)/.test(servicio));
  ok('  guardando el desglose', /conteo,/.test(servicio) && /conteo: data\.conteo/.test(leer(REPO)));
  // El freno viejo filtraba el importe de la diferencia en su mensaje de error.
  ok('el cierre ya no se niega por una diferencia (filtraba el esperado)',
    !/Debe proveer una justificación/.test(servicio) && /arquear\(/.test(servicio));

  console.log('\n3) Arqueo ciego\n');
  const activa = leer(RUTA_ACTIVA);
  ok('la sesion abierta no devuelve el saldo esperado', /expectedBalance: undefined/.test(activa));
  ok('  y se hace en el SERVIDOR, no en la pantalla', /sinEsperado/.test(activa) && /data: sinEsperado/.test(activa));
  ok('la pantalla ya no calcula el esperado ni la diferencia',
    !/getExpectedBalance/.test(pantalla) && !/getDifference/.test(pantalla));
  ok('  ni suma las entradas y salidas al lado del formulario (eso ES el esperado)',
    !/Total Esperado/.test(sinComentarios(pantalla)));
  ok('el resultado del arqueo sale DESPUES de cerrar', /resultadoArqueo/.test(pantalla)
    && /setResultadoArqueo\(data\.data\?\.summary/.test(pantalla));
  ok('la pantalla manda el conteo entero, con los ceros',
    /conteo = DENOMINATIONS\.map\(\(d\) => \(\{ denominacion: d\.value, cantidad: denomQty\[d\.value\] \|\| 0 \}\)\)/.test(pantalla));
  ok('el campo libre de monedas ya no existe',
    !/coinsTotal/.test(sinComentarios(pantalla)) && !/Total Monedas/.test(sinComentarios(pantalla))
    && /DENOMINACIONES/.test(pantalla));
  ok('las denominaciones salen del modulo compartido, no de una copia',
    /import \{ DENOMINACIONES \} from '@\/services\/caja\/conteoDeCaja'/.test(pantalla));

  console.log('\n4) Lo que no es efectivo: consta, pero no cuadra la caja\n');
  const repo = leer(REPO);
  ok('el cuadre recoge los cobros que no son efectivo', /cobrosNoEfectivoDeLaSesion/.test(repo));
  ok('  acotados a la ventana de la sesion', /gte\(customerReceipts\.createdAt, desde\)/.test(repo)
    && /lte\(customerReceipts\.createdAt, hasta\)/.test(repo));
  ok('  y excluyendo el efectivo, que ya se cuenta', /ne\(customerReceipts\.paymentMethod, 'cash'\)/.test(repo));
  ok('el resumen guarda el total y el detalle', /totalTransferencias: data\.totalTransferencias/.test(repo)
    && /transferencias: data\.transferencias/.test(repo));
  ok('el total de transferencias NO entra en la diferencia de caja',
    /difference: arqueo\.diferencia/.test(servicio) && !/diferencia \+ /.test(servicio));

  // La regla se EJECUTA, no se lee: `if (false && ...)` deja el mensaje en el
  // fichero intacto y no exige nada. Lo cazo un mutante.
  let R: typeof import('../src/services/cartera/cuentaDelCobro') | null = null;
  try { R = await import('../src/services/cartera/cuentaDelCobro'); } catch { R = null; }
  if (!R) {
    for (const t of ['un cobro por transferencia exige su constancia', '  y uno por cheque, el numero del cheque'])
      falta(t, 'no se pudo cargar cuentaDelCobro.ts');
  } else {
    const { motivoParaNoRegistrarCobro } = R;
    const sinNumero = motivoParaNoRegistrarCobro('bank', 'b1', null);
    ok('un cobro por transferencia exige su constancia',
      !!sinNumero && /transferencia/.test(sinNumero), String(sinNumero));
    ok('  y en blanco tampoco vale', !!motivoParaNoRegistrarCobro('bank', 'b1', '   '));
    const cheque = motivoParaNoRegistrarCobro('check', 'b1', '');
    ok('  y uno por cheque, el numero del cheque', !!cheque && /cheque/.test(cheque), String(cheque));
    ok('  con la constancia puesta, pasa', motivoParaNoRegistrarCobro('bank', 'b1', 'TRF-9912') === null);
    // En efectivo no hay transferencia que acreditar: exigirla seria absurdo, y
    // esta comprobacion impide "arreglarlo" pidiendola a todo el mundo.
    ok('  al efectivo no se le pide constancia', motivoParaNoRegistrarCobro('cash', null, null) === null);
  }
  ok('  la constancia llega desde las tres puertas',
    /motivoParaNoRegistrarCobro\(parsed\.data\.paymentMethod, parsed\.data\.bankAccountId, parsed\.data\.reference\)/.test(leer('src/app/api/v1/ar/receipts/route.ts'))
    && /motivoParaNoRegistrarCobro\(data\.paymentMethod, data\.bankAccountId, data\.reference\)/.test(leer('src/repositories/arRepository.ts'))
    && /motivoParaNoRegistrarCobro\(paymentForm\.paymentMethod, paymentForm\.bankAccountId, paymentForm\.reference\)/.test(leer('src/app/dashboard/receivables/page.tsx')));

  const factura = leer(FACTURA);
  ok('una venta que no es en efectivo no toca la caja, aunque le manden sesion',
    /if \(paymentType !== 'cash'\) return undefined;/.test(factura));
  // Sin comentarios: el porque del corte cita la linea que venia antes, y el
  // banco la encontraba en la explicacion en vez de en el codigo.
  const facturaCodigo = sinComentarios(factura);
  const iCorte = facturaCodigo.indexOf("if (paymentType !== 'cash') return undefined;");
  const iProvided = facturaCodigo.indexOf('let activeCashSessionId = providedCashSessionId;');
  ok('  y el corte va ANTES de aceptar la sesion del cuerpo', iCorte > 0 && iProvided > iCorte, `${iCorte} < ${iProvided}`);

  console.log('\n5) El esquema y la migracion\n');
  const esquema = leer('src/db/schema/cash.ts');
  ok('la sesion guarda el desglose del arqueo', /conteo: jsonb\('conteo'\)/.test(esquema));
  ok('el resumen guarda el desglose y las transferencias',
    /totalTransferencias: decimal\('total_transferencias'/.test(esquema) && /transferencias: jsonb\('transferencias'\)/.test(esquema));
  const mig = leer('drizzle/0012_arqueo_de_caja.sql');
  ok('hay migracion 0012', mig.length > 0);
  const sentencias = mig.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
  ok('  y solo AÑADE columnas, no reescribe ni borra nada ya cerrado',
    sentencias.length > 0 && sentencias.every((s) => /^ALTER TABLE .* ADD COLUMN\b/i.test(s)),
    `${sentencias.length} sentencias`);
  ok('  anotada en el diario de drizzle', /0012_arqueo_de_caja/.test(leer('drizzle/meta/_journal.json')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
