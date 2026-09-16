/**
 * El TXT del 607 cumple el Anexo B de la Norma General 07-2018.
 *
 * EL FALLO (lote 142)
 * -------------------
 *   1. Cabecera `607|<uuid interno>|AAAAMM`: la norma pide
 *      `607|RNC|AAAAMM|cantidad de registros`.
 *   2. 27 campos por linea en vez de 23: tras el 10 se colaban cuatro del 606,
 *      y todo lo de detras caia cuatro posiciones corrido.
 *   3. Importes sin punto decimal: 13.610,66 salia `1361066`. Medido: 46 de 53
 *      comprobantes de PRODUCCION tienen centavos.
 *
 * Se EJECUTA el armado del fichero con comprobantes de prueba. Los campos 1 a 7
 * se comparan contra una transcripcion de la logica anterior: el lote cambia
 * la forma del fichero, no lo que decide declarar.
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

type Ret = { retentionType: string; retentionAmount: string; retentionDate: string | null };
const comprobante = (o: Partial<{ ncf: string; subtotal: string; discount: string; totalTaxes: string; total: string; totalNet: string | null; paymentType: string; createdAt: Date; customerRnc: string | null; retenciones: Ret[] }>) => ({
  ncf: 'E310000000020', subtotal: '11534.46', discount: '0.00', totalTaxes: '2076.20', total: '13610.66', totalNet: '13610.66',
  paymentType: 'credit', createdAt: new Date('2026-08-01T17:56:53.110Z'), customerRnc: '131-20461-9', retenciones: [] as Ret[], ...o,
});

/** Campos 1 a 7 como los armaba la ruta antes del lote (HEAD 9680477). */
function camposIdentidadDeAntes(c: ReturnType<typeof comprobante>): string[] {
  const rnc = (c.customerRnc || '').replace(/\D/g, '').substring(0, 11);
  const idTipo = rnc.length === 9 ? '1' : rnc.length === 11 ? '2' : '3';
  const fechaFactura = c.createdAt.toISOString().substring(0, 10).replace(/-/g, '');
  let fechaRet = '';
  if (c.retenciones.length > 0) fechaRet = c.retenciones[0].retentionDate ? c.retenciones[0].retentionDate.replace(/-/g, '') : fechaFactura;
  return [rnc, idTipo, c.ncf.trim(), '', '01', fechaFactura, fechaRet];
}

async function main() {
  const RUTA = 'src/app/api/v1/reports/607/txt/route.ts';
  console.log('\n0) Precondiciones: la consulta del 607 sigue igual\n');
  {
    const src = fuente(RUTA);
    exige('filtra por modo', /eq\(invoices\.modo, auth\.modo\)/.test(src));
    exige('saca rechazados, borradores y anulados (lote 141)', /notInArray\(invoices\.status, ESTADOS_FUERA_DEL_607\)/.test(src));
    exige('sigue comprobando de quien es la empresa', /auth\.role !== 'sistemas' && auth\.companyId !== companyId/.test(src));
  }

  let f: typeof import('../src/services/dgii/formato607') | null = null;
  try { f = await import('../src/services/dgii/formato607'); } catch { f = null; }

  const lote = [
    comprobante({}),
    comprobante({ ncf: 'E320000000060', paymentType: 'cash', customerRnc: null, subtotal: '1000.00', totalTaxes: '180.00', total: '1180.00', totalNet: '1180.00' }),
    comprobante({ ncf: 'E310000000030', paymentType: 'bank_transfer', customerRnc: '001-1234567-8', retenciones: [
      { retentionType: 'ISR', retentionAmount: '115.34', retentionDate: '2026-08-15' },
      { retentionType: 'ITBIS', retentionAmount: '622.86', retentionDate: '2026-08-15' },
    ], totalNet: '12872.46' }),
    comprobante({ ncf: 'E310000000031', paymentType: 'tarjeta', discount: '34.46' }),
  ];
  const txt = f ? f.txtDel607({ rncEmisor: '132796845', periodo: '2026-08', comprobantes: lote }) : '';
  const lineas = txt.split('\n');
  const detalle = lineas.slice(1).filter((l) => l !== '');
  const campo = (i: number, n: number) => (detalle[i] ?? '').split('|')[n - 1];

  console.log('\n1) Cabecera: 607|RNC|AAAAMM|cantidad\n');
  ok('la cabecera es exactamente 607|132796845|202608|4', lineas[0] === '607|132796845|202608|4', JSON.stringify(lineas[0]));
  ok('el RNC se limpia de guiones', !!f && f.cabecera607('1-32-79684-5', '2026-08', 0) === '607|132796845|202608|0');
  ok('la cantidad es la de lineas de detalle, sin la cabecera', !!f && detalle.length === 4 && lineas[0].endsWith('|4'));
  ok('fichero vacio: cabecera con 0 y nada mas', !!f && f.txtDel607({ rncEmisor: '132796845', periodo: '2026-09', comprobantes: [] }) === '607|132796845|202609|0\n');

  console.log('\n2) Detalle: 23 campos, en el orden del Anexo B\n');
  ok('cada linea tiene exactamente 23 campos', detalle.length === 4 && detalle.every((l) => l.split('|').length === 23),
    detalle.map((l) => l.split('|').length).join(','));
  ok('campos 1 a 7 identicos a los de antes (el lote no decide que declarar)',
    detalle.length === 4 && lote.every((c, i) => JSON.stringify(detalle[i].split('|').slice(0, 7)) === JSON.stringify(camposIdentidadDeAntes(c))));
  ok('10 ITBIS retenido y 12 retencion de renta, en su sitio', campo(2, 10) === '622.86' && campo(2, 12) === '115.34', `${campo(2, 10)} / ${campo(2, 12)}`);
  ok('11, 13, 14 y 16 (percibidos, selectivo, propina) vacios', [11, 13, 14, 16].every((n) => campo(2, n) === ''));
  ok('17 efectivo', campo(1, 17) === '1180.00' && campo(1, 20) === '', campo(1, 17));
  ok('18 cheque/transferencia', campo(2, 18) === '12872.46', campo(2, 18));
  ok('19 tarjeta (cualquier otra forma, como antes)', campo(3, 19) === '13610.66', campo(3, 19));
  ok('20 venta a credito', campo(0, 20) === '13610.66' && campo(0, 17) === '', campo(0, 20));
  ok('21 a 23 vacios', detalle.length === 4 && detalle.every((l) => l.split('|').slice(20).every((x) => x === '')));

  console.log('\n3) Importes con punto decimal\n');
  ok('monto facturado 11534.46, no 1153446', campo(0, 8) === '11534.46', campo(0, 8));
  ok('ITBIS facturado 2076.20', campo(0, 9) === '2076.20', campo(0, 9));
  ok('con descuento: 11534.46 - 34.46 = 11500.00', campo(3, 8) === '11500.00', campo(3, 8));
  ok('un cero va en blanco', !!f && f.importe607(0) === '' && f.importe607('0.00') === '');

  console.log('\n4) La ruta usa el formato y el RNC de la empresa\n');
  {
    const src = fuente(RUTA);
    ok('importa el armado del fichero', src.includes("from '@/services/dgii/formato607';"));
    ok('lo arma con el RNC de la empresa', /txtDel607\(\{\s*rncEmisor: empresa\.rnc,/.test(src) && /\.select\(\{ rnc: companies\.rnc \}\)/.test(src));
    ok('ya no escribe el id interno en la cabecera', src.includes("from '@/services/dgii/formato607';") && !/607\|\$\{companyId\}/.test(src));
    ok('ya no arma lineas por su cuenta', src.includes("from '@/services/dgii/formato607';") && !/\.join\('\|'\)/.test(src) && !/replace\('\.', ''\)/.test(src));
    ok('el fichero se llama como el de la herramienta de la DGII',
      /filename="\$\{nombreFichero607\(empresa\.rnc, period\)\}"/.test(src) && !!f && f.nombreFichero607('132796845', '2026-08') === 'DGII_F_607_132796845_202608.TXT');
    const pantalla = fuente('src/app/dashboard/reports/607/page.tsx');
    //  Leer la cabecera no basta: el mutante que la lee y sigue poniendo su
    //  propio nombre sobrevivia. Se fija que el nombre SALE de ella.
    ok('la pantalla respeta el nombre que manda el servidor',
      /const disposicion = res\.headers\.get\('Content-Disposition'\)/.test(pantalla)
      && /a\.download = \/filename="\(\[\^"\]\+\)"\/\.exec\(disposicion\)\?\.\[1\] \|\|/.test(pantalla));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
