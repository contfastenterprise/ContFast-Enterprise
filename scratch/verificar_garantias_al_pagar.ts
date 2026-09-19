/**
 * Lote 161 -- al pagar una factura de suplidor, se ven sus cheques en garantia.
 *
 * EL HUECO
 * --------
 * Un cheque en garantia queda `pending_guarantee` y NO rebaja el saldo de la
 * factura hasta que se confirma su cobro. El dialogo "Registrar Pago Contable"
 * no lo enseñaba y ademas proponia el saldo ENTERO como monto: pagar ahi era
 * pagar dos veces. Medido el 2026-09-19 (solo lectura) en Latin Doors
 * PRODUCCION: 3 facturas con cheque pendiente, RD$395.352,21, las tres
 * cubiertas enteras, y una ya con un pago encima del cheque.
 *
 * LO QUE SE COMPRUEBA
 * -------------------
 * 1. La cuenta (`services/cxp/garantiasDeFactura.ts`), EJECUTANDOLA.
 * 2. El componente pide los cheques de ESA factura al servidor, y una lista
 *    cortada no pasa por completa.
 * 3. La pagina: lo enseña en el dialogo, propone lo sin cubrir y pide
 *    confirmacion ANTES de enviar un pago que pagaria de mas.
 *
 * Solo codigo: no toca base de datos.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const RAIZ = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(RAIZ, r)) ? fuente(r) : '');

type Mod = typeof import('../src/services/cxp/garantiasDeFactura');

async function main() {
  // Perezoso: el modulo lo crea este lote, y un import estatico reventaria la
  // contraprueba en vez de fallar comprobacion a comprobacion.
  let m: Mod | null = null;
  try { m = await import('../src/services/cxp/garantiasDeFactura'); } catch { m = null; }
  const con = <T,>(f: (m: Mod) => T, d: T): T => (m ? f(m) : d);

  console.log('\n1) La cuenta de lo que cubren los cheques\n');
  {
    const sin = con((m) => m.resumirGarantias([], '5000.00'), null);
    ok('sin cheques: nada cubierto y todo el saldo sin cubrir',
      !!sin && sin.cantidad === 0 && sin.totalCheques === 0 && sin.saldoSinCubrir === 5000 && !sin.cubiertoDeMas,
      JSON.stringify(sin));
    ok('sin cheques nunca "paga de mas" (el tope del saldo lo pone el dialogo)',
      con((m) => sin !== null && !m.pagariaDeMas(sin, 999999), false));

    // El caso medido: la factura cubierta entera por su cheque.
    const entera = con((m) => m.resumirGarantias([{ amount: '395352.21', checkNumber: '123' }], '395352.21'), null);
    ok('cubierta entera: sin cubrir 0', !!entera && entera.saldoSinCubrir === 0 && entera.totalCheques === 395352.21,
      JSON.stringify(entera));
    ok('  y un solo centavo de pago ya es pagar de mas', con((m) => entera !== null && m.pagariaDeMas(entera, 0.01), false));
    ok('  CONTROL: pagar 0 no lo es', con((m) => entera !== null && !m.pagariaDeMas(entera, 0), false));

    const parcial = con((m) => m.resumirGarantias([{ amount: '600' }], '1000'), null);
    ok('cubierta en parte: sin cubrir es la diferencia', !!parcial && parcial.saldoSinCubrir === 400, JSON.stringify(parcial));
    ok('  pagar exactamente lo sin cubrir NO es de mas', con((m) => parcial !== null && !m.pagariaDeMas(parcial, '400.00'), false));
    ok('  un centavo por encima SI', con((m) => parcial !== null && m.pagariaDeMas(parcial, '400.01'), false));

    const varios = con((m) => m.resumirGarantias([{ amount: '100.10' }, { amount: 200.2 }, { amount: '50' }], '1000'), null);
    ok('varios cheques se suman', !!varios && varios.cantidad === 3 && varios.totalCheques === 350.3 && varios.saldoSinCubrir === 649.7,
      JSON.stringify(varios));

    // 0,1 + 0,2 en coma flotante es 0,30000000000000004 > 0,3.
    const flotante = con((m) => m.resumirGarantias([{ amount: '0.1' }, { amount: '0.2' }], '0.3'), null);
    ok('en centavos: 0,10 + 0,20 cubren justo 0,30 (sin el error de coma flotante)',
      !!flotante && flotante.saldoSinCubrir === 0 && !flotante.cubiertoDeMas, JSON.stringify(flotante));

    // 0,1+0,2 frente a 0,3 no basta: sin redondear, los dos lados arrastran el
    // MISMO error y salen iguales (un mutante sin `Math.round` sobrevivio).
    // 19,99 * 100 = 1998,9999999999998: aqui el error solo esta en un lado.
    const redondeo = con((m) => m.resumirGarantias([{ amount: '19.99' }], '20'), null);
    ok('en centavos: 20,00 - 19,99 deja exactamente 0,01 sin cubrir',
      !!redondeo && redondeo.saldoSinCubrir === 0.01, JSON.stringify(redondeo));
    ok('  y pagar ese 0,01 no es pagar de mas', con((m) => redondeo !== null && !m.pagariaDeMas(redondeo, '0.01'), false));

    const deMas = con((m) => m.resumirGarantias([{ amount: '150' }], '100'), null);
    ok('cheques por encima del saldo: se marca, y lo sin cubrir no baja de 0',
      !!deMas && deMas.cubiertoDeMas && deMas.saldoSinCubrir === 0, JSON.stringify(deMas));

    const basura = con((m) => m.resumirGarantias([{ amount: 'abc' }], '100'), null);
    ok('un importe ilegible cuenta 0, no NaN', !!basura && basura.totalCheques === 0 && basura.saldoSinCubrir === 100,
      JSON.stringify(basura));
  }

  console.log('\n2) El componente pide los cheques de ESA factura\n');
  const COMP = leer('src/app/dashboard/ap/components/GarantiasDeLaFactura.tsx');
  {
    const params = bloque(COMP, 'new URLSearchParams(');
    ok('filtra por la factura y por cheque pendiente',
      /\bapId\b/.test(params) && /status:\s*'pending_guarantee'/.test(params) && /payments:\s*'true'/.test(params), params.replace(/\s+/g, ' '));
    ok('al servidor, no a la lista cortada de la pagina', /fetch\(`\/api\/v1\/ap\?\$\{query\.toString\(\)\}`\)/.test(COMP));
    ok('una lista cortada (total > recibidos) se trata como no comprobada',
      /Number\(json\.data\.total\)\s*>\s*items\.length/.test(COMP) && /onEstado\(\{\s*estado:\s*'error'\s*\}\)/.test(COMP));
    // En LAS DOS salidas de la peticion: con una sola, un mutante que quitaba
    // la otra sobrevivia (el texto seguia presente una vez).
    ok('una respuesta que llega tarde no pisa la de otra factura',
      /let vigente = true/.test(COMP) && /return \(\) => \{ vigente = false; \}/.test(COMP)
      && /\.then\(\(json\) => \{\s*if \(!vigente\) return;/.test(COMP)
      && /\.catch\(\(\) => \{\s*if \(!vigente\) return;/.test(COMP));
    ok('enseña numero, banco, fecha de cobro y monto de cada cheque',
      /c\.checkNumber/.test(COMP) && /banco\(c\.checkBankAccountId\)/.test(COMP) && /c\.dueDate/.test(COMP) && /c\.amount/.test(COMP));
    ok('y el total cubierto y lo que queda sin cubrir',
      /resumen\.totalCheques/.test(COMP) && /resumen\.saldoSinCubrir/.test(COMP));
  }

  console.log('\n3) La pagina lo usa antes de pagar\n');
  const PAG = leer('src/app/dashboard/ap/page.tsx');
  {
    ok('importa el componente y la cuenta',
      /from '\.\/components\/GarantiasDeLaFactura'/.test(PAG) && /import \{ pagariaDeMas \} from '@\/services\/cxp\/garantiasDeFactura'/.test(PAG));
    const modal = PAG.slice(PAG.indexOf('<form onSubmit={handleSubmitPayment}'));
    ok('lo pinta dentro del dialogo de pago, con la factura elegida',
      /<GarantiasDeLaFactura\s[\s\S]*?apId=\{selectedBill\.apId\}[\s\S]*?saldoFactura=\{selectedBill\.balance\}[\s\S]*?onEstado=\{setEstadoGarantias\}/.test(modal.slice(0, 1500)));

    const enviar = bloque(PAG, 'const handleSubmitPayment = async');
    const iPost = enviar.indexOf("fetch('/api/v1/ap/payments'");
    const iMas = enviar.search(/pagariaDeMas\(estadoGarantias\.resumen, amountVal\)/);
    const iCargando = enviar.search(/estadoGarantias\.estado === 'cargando'/);
    ok('comprueba si pagaria de mas ANTES de enviar el pago', iPost > 0 && iMas > 0 && iMas < iPost, `${iMas} < ${iPost}`);
    ok('  y si pagaria de mas, pide confirmacion y sin ella no envia',
      /pagariaDeMas\([^)]*\)\)\s*\{\s*const r = [^;]+;\s*const seguir = await confirm\(\{[\s\S]*?\}\);\s*if \(!seguir\) return;/.test(enviar));
    ok('mientras no se sabe, no se paga a ciegas', iCargando > 0 && iCargando < iPost
      && /estadoGarantias\.estado === 'cargando'\)\s*\{[^}]*return;/.test(enviar));
    ok('si no se pudo comprobar, tambien pide confirmacion',
      /estadoGarantias\.estado === 'error'\)\s*\{\s*const seguir = await confirm\(/.test(enviar));

    const abrir = bloque(PAG, 'const handleOpenPayment = (');
    ok('al abrir otra factura se olvida lo de la anterior', /setEstadoGarantias\(\{\s*estado:\s*'cargando'\s*\}\)/.test(abrir));

    const propone = bloque(PAG, /useEffect\(\(\) => \{\s*if \(estadoGarantias\.estado !== 'listo'/);
    ok('propone lo sin cubrir en vez del saldo entero',
      /saldoSinCubrir\.toFixed\(2\)/.test(propone) && /amount:\s*sinCubrir/.test(propone));
    ok('  pero solo si el monto sigue siendo el propuesto (lo escrito no se toca)',
      /prev\.amount === selectedBill\.balance\.toString\(\)\s*\?/.test(propone));
    ok('  y solo si la factura tiene cheques', /resumen\.cantidad === 0/.test(propone));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
