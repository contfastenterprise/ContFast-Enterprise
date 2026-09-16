/**
 * El TXT del 606 cumple el Anexo A de la Norma General 07-2018.
 *
 * EL FALLO (lote 144)
 * -------------------
 * Cabecera `606|<uuid>|AAAA-MM` sin RNC ni cantidad; detalle de ANCHO FIJO, sin
 * un solo "|", con siete datos pegados (NCF relleno a 19, fecha, forma de pago
 * y cuatro importes sin punto decimal) donde la norma pide 23 campos; y las
 * compras borradas dentro. Medido el 2026-09-16: 105 compras de Latin Doors,
 * 13 de ellas gastos menores de julio sin NCF.
 *
 * Se EJECUTA el armado con compras de prueba; la consulta se lee.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

type Compra = Record<string, unknown>;
const compra = (o: Compra): Compra => ({
  ncf: 'E310000012204', ncfModified: null, supplierRnc: '1-01-12345-6', expenseType: '09',
  issueDate: '2026-07-15', paymentDate: null, paymentMethod: '04',
  amount: '545719.20', itbis: '98229.46', itbisRetained: '0.00', itbisProportionality: '0.00',
  isrRetained: '0.00', isc: '0.00', otherTaxes: '5.10', tip: '0.00', lineas: [], ...o,
});

async function main() {
  const SERVICIO = 'src/services/expenseService.ts';
  console.log('\n0) Precondiciones\n');
  {
    const src = fuente(SERVICIO);
    exige('getExpenses sigue filtrando por modo', src.includes('eq(expenses.modo, modo),'));
    exige('y cerrando el mes con el ayudante', /const end = ultimoDiaDelMes\(period\);/.test(src));
    exige('la ruta de descarga sigue comprobando la empresa', /auth\.role !== 'sistemas' && auth\.companyId !== companyId/.test(fuente('src/app/api/v1/reports/606/download/route.ts')));
  }

  let f: Record<string, unknown> | null = null;
  try { f = (await import('../src/services/dgii/formato606')) as Record<string, unknown>; } catch { f = null; }
  const fn = <T>(nombre: string) => (f && typeof f[nombre] === 'function' ? (f[nombre] as T) : null);
  const txtDel606 = fn<(p: { rncEmisor: string; periodo: string; compras: Compra[] }) => string>('txtDel606');

  const lote = [
    compra({}),
    compra({ ncf: 'E310000012260', expenseType: '09', paymentMethod: '04', amount: '100703.15', itbis: '18126.57', itbisRetained: '10804.22', isrRetained: '10070.32', otherTaxes: '0.00' }),
    compra({ ncf: 'B0100000123', supplierRnc: '001-1234567-8', expenseType: '02', paymentMethod: '01', amount: '1500.00', itbis: '270.00', otherTaxes: '0.00' }),
    compra({ ncf: 'E310000013249', expenseType: '09', paymentMethod: '01', amount: '1000.00', itbis: '180.00', otherTaxes: '0.00',
      lineas: [{ productId: 'p1', subtotal: '800.00' }, { productId: null, subtotal: '200.00' }] }),
    compra({ ncf: null, supplierRnc: null, expenseType: '02', paymentMethod: '01', amount: '400.00', itbis: '0.00', otherTaxes: '0.00' }),
  ];
  const txt = txtDel606 ? txtDel606({ rncEmisor: '132796845', periodo: '2026-07', compras: lote }) : '';
  const lineas = txt.split('\n').filter((l) => l !== '');
  const campo = (i: number, k: number) => (lineas[i + 1] ?? '').split('|')[k - 1];

  console.log('\n1) Cabecera\n');
  ok('606|132796845|202607|4 (la compra sin NCF no cuenta)', lineas[0] === '606|132796845|202607|4', JSON.stringify(lineas[0]));
  ok('el nombre de la herramienta de la DGII', fn<(r: string, p: string) => string>('nombreFichero606')?.('132796845', '2026-07') === 'DGII_F_606_132796845_202607.TXT');

  console.log('\n2) Detalle: 23 campos separados por |\n');
  ok('4 lineas, cada una con 23 campos', lineas.length === 5 && lineas.slice(1).every((l) => l.split('|').length === 23),
    lineas.slice(1).map((l) => l.split('|').length).join(','));
  ok('la compra sin NCF no esta', lineas.length === 5 && !lineas.some((l) => l.includes('|400.00|')));
  ok('1-2 RNC limpio y tipo de identificacion', campo(0, 1) === '101123456' && campo(0, 2) === '1' && campo(2, 1) === '00112345678' && campo(2, 2) === '2');
  ok('3 tipo de bienes y servicios, 4 NCF, 5 modificado vacio', campo(0, 3) === '09' && campo(0, 4) === 'E310000012204' && campo(0, 5) === '');
  ok('6 fecha comprobante AAAAMMDD', campo(0, 6) === '20260715');
  ok('23 forma de pago con el codigo del Anexo A', campo(0, 23) === '04' && campo(2, 23) === '01');

  console.log('\n3) Importes con punto decimal, en su casilla\n');
  ok('10 total facturado 545719.20 y 11 ITBIS 98229.46', campo(0, 10) === '545719.20' && campo(0, 11) === '98229.46', `${campo(0, 10)} / ${campo(0, 11)}`);
  ok('15 ITBIS por adelantar = facturado (llevado al costo no se registra)', campo(0, 15) === '98229.46' && campo(0, 14) === '');
  ok('12 ITBIS retenido y 18 retencion de renta', campo(1, 12) === '10804.22' && campo(1, 18) === '10070.32');
  ok('17 tipo de retencion ISR en blanco: no se inventa', campo(1, 17) === '');
  ok('21 otros impuestos', campo(0, 21) === '5.10');
  //  `every` sobre una lista vacia es verdad: sin el largo, esto pasaria antes
  //  del lote, cuando no salia ninguna linea con campos.
  ok('16 y 19 (percibidos, no habilitados) vacios',
    lineas.length === 5 && lineas.slice(1).every((l) => l.split('|')[15] === '' && l.split('|')[18] === ''));

  console.log('\n4) Servicios contra bienes\n');
  ok('tipo 09 sin lineas: todo bienes', campo(0, 8) === '' && campo(0, 9) === '545719.20');
  ok('tipo 02 sin lineas: todo servicios', campo(2, 8) === '1500.00' && campo(2, 9) === '');
  ok('con lineas: producto a bienes, sin producto a servicios', campo(3, 9) === '800.00' && campo(3, 8) === '200.00' && campo(3, 10) === '1000.00');

  console.log('\n5) Fecha de pago\n');
  ok('a credito sin fecha registrada: vacia', campo(0, 7) === '');
  ok('al contado sin fecha registrada: la del comprobante', campo(2, 7) === '20260715');
  const fp = fn<(c: Compra) => string>('fechaDePago606');
  ok('si esta registrada, manda la registrada', !!fp && fp(compra({ paymentDate: '2026-08-20', paymentMethod: '04' })) === '2026-08-20');

  console.log('\n6) El cableado\n');
  {
    const src = fuente(SERVICIO);
    const cuerpo = src.slice(src.indexOf('export async function generate606Txt('));
    ok('generate606Txt arma con txtDel606 y el RNC de la empresa',
      src.includes("from './dgii/formato606';") && /const rncEmisor = await rncDeLaEmpresa\(companyId\);/.test(cuerpo) && /txtDel606\(\{ rncEmisor, periodo: period, compras \}\)/.test(cuerpo));
    ok('y ya no pega campos de ancho fijo', !/padEnd\(19/.test(src) && !/\.replace\('\.', ''\)/.test(src) && src.includes("from './dgii/formato606';"));
    ok('trae el RNC del proveedor y las lineas de cada compra', /suppliers\.rnc/.test(cuerpo) && /expenseLines/.test(cuerpo));
    ok('getExpenses ya no trae compras borradas', /isNull\(expenses\.deletedAt\)/.test(src.slice(src.indexOf('export async function getExpenses('), src.indexOf('export async function generate606Txt('))));
    const descarga = fuente('src/app/api/v1/reports/606/download/route.ts');
    ok('la descarga se llama como la de la DGII', /filename="\$\{nombreFichero606\(/.test(descarga));
    const pantalla = fuente('src/app/dashboard/reports/606/page.tsx');
    ok('la pantalla respeta el nombre del servidor',
      /a\.download = \/filename="\(\[\^"\]\+\)"\/\.exec\(disposicion\)\?\.\[1\] \|\|/.test(pantalla));
    //  M12 sobrevivia: `!vaEnElDetalle606(e)` aparece tambien en el aviso de
    //  arriba. Se fijan por separado la marca de la fila y el aviso.
    ok('marca en la fila las compras sin NCF que no van al TXT',
      /\{!vaEnElDetalle606\(e\) && <span[^>]*>Sin NCF: no va en el TXT<\/span>\}/.test(pantalla));
    ok('y avisa arriba de cuantas son',
      /\{expenses\.filter\(\(e\) => !vaEnElDetalle606\(e\)\)\.length > 0 && \(/.test(pantalla));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
