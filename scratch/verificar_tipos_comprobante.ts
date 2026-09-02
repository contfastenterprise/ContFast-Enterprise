/**
 * Los tipos de e-CF: una sola lista, con los nombres de la DGII.
 *
 * LO QUE HABIA
 * ------------
 * La lista escrita a mano en SEIS sitios, sin coincidir entre ellos. Y las dos
 * que deciden lo que ve el cliente -- lo que se imprime en el comprobante y el
 * detalle de la factura -- tenian la cola CORRIDA UNA POSICION:
 *
 *      codigo   decia el sistema              dice la DGII
 *      ------   ---------------------------   -------------------------
 *        43     Registro de Unico Ingreso     Gastos Menores
 *        44     Gastos Menores                REGIMENES ESPECIALES
 *        45     Regimenes Especiales          GUBERNAMENTAL
 *        46     Gubernamentales               EXPORTACIONES
 *
 * Un comprobante gubernamental se imprimia con el nombre de otro documento.
 *
 * Y el remate:
 *
 *     return types[type] || 'Factura de Consumo Electronica';
 *
 * Un tipo desconocido se imprimia como FACTURA DE CONSUMO. No fallaba: cambiaba
 * el documento por otro. Mismo patron que el codigo de seguridad fabricado y la
 * fecha de secuencia inventada.
 *
 * Ademas el 44 y el 46 no estaban en el `z.enum` de la emision, asi que una
 * secuencia de esos tipos se podia elegir en el formulario y la emision la
 * rechazaba con "Tipo de e-CF invalido".
 */
import {
  TIPOS_COMPROBANTE, CODIGOS_EMITIBLES,
  nombreTipo, nombreCortoTipo, etiquetaTipo, esEmitible,
} from '../src/services/dgii/tiposComprobante';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n1) Los nombres son los de la DGII\n');

// Fuente: DGII, Comunidad de Ayuda CA4358 y Formato e-CF v1.0.
const OFICIAL: Record<string, string> = {
  '31': 'Crédito Fiscal',
  '32': 'Consumo',
  '33': 'Débito',
  '34': 'Crédito',
  '41': 'Compras',
  '43': 'Gastos Menores',
  '44': 'Regímenes Especiales',
  '45': 'Gubernamental',
  '46': 'Exportaciones',
  '47': 'Pagos al Exterior',
};

for (const [codigo, clave] of Object.entries(OFICIAL)) {
  const n = nombreTipo(codigo);
  ok(`e-${codigo} menciona "${clave}"`, !!n && n.includes(clave), n ?? 'sin nombre');
}

console.log('\n2) REGRESION: los cuatro que estaban corridos\n');

// Estos son los que el sistema tenia mal. Se comprueban por separado y en
// positivo Y en negativo: no basta con que diga lo correcto, tiene que haber
// dejado de decir lo que decia.
ok('e-43 ya NO dice "Unico Ingreso"', !/nico Ingreso/i.test(nombreTipo('43') ?? ''), nombreTipo('43')!);
ok('e-44 ya NO dice "Gastos Menores"', !/Gastos Menores/i.test(nombreTipo('44') ?? ''), nombreTipo('44')!);
ok('e-45 ya NO dice "Regímenes Especiales"', !/Reg.menes/i.test(nombreTipo('45') ?? ''), nombreTipo('45')!);
ok('e-46 ya NO dice "Gubernamental"', !/Gubernamental/i.test(nombreTipo('46') ?? ''), nombreTipo('46')!);

console.log('\n3) Un tipo desconocido NO se convierte en otro documento\n');

for (const malo of ['99', '', '  ', null, undefined, '3', 'abc']) {
  ok(`${JSON.stringify(malo)} -> nombreTipo devuelve null`, nombreTipo(malo as any) === null);
}
ok('y la etiqueta DICE que no se reconoce',
  /no reconocido/.test(etiquetaTipo('99')), etiquetaTipo('99'));
ok('NUNCA se devuelve "Factura de Consumo" para un desconocido',
  !/Consumo/.test(etiquetaTipo('99')) && !/Consumo/.test(etiquetaTipo(null)));

console.log('\n4) Que se puede emitir desde ventas\n');

ok('el 44 (Regímenes Especiales) es emitible', esEmitible('44'));
ok('el 46 (Exportaciones) tambien', esEmitible('46'));
ok('el 41 (Compras) NO: no es un documento de venta', !esEmitible('41'));
ok('el 43 (Gastos Menores) tampoco', !esEmitible('43'));
ok('el 47 (Pagos al Exterior) tampoco', !esEmitible('47'));
ok('CODIGOS_EMITIBLES incluye 44 y 46',
  CODIGOS_EMITIBLES.includes('44' as any) && CODIGOS_EMITIBLES.includes('46' as any),
  CODIGOS_EMITIBLES.join(', '));
ok('y no incluye ninguno de compras/gastos',
  !['41', '43', '47'].some(c => (CODIGOS_EMITIBLES as readonly string[]).includes(c)));

console.log('\n5) La lista esta en UN sitio, no en seis\n');

// Los ficheros que tenian su propia copia. Se comprueba que ya no la tengan:
// una tabla de tipos duplicada es exactamente como se desincronizaron.
const copias: Array<[string, RegExp]> = [
  ['src/utils/templates/documentTemplates.ts', /'44':\s*'/],
  ['src/app/dashboard/invoices/[id]/page.tsx', /'44':\s*'/],
  ['src/app/dashboard/invoices/page.tsx', /case '45': return 'Gubernamental'/],
];
for (const [f, patron] of copias) {
  ok(`${f.split('/').pop()}: sin tabla propia`, !patron.test(fuente(f)));
}
for (const f of ['src/utils/templates/documentTemplates.ts',
                 'src/app/dashboard/invoices/[id]/page.tsx',
                 'src/app/dashboard/invoices/page.tsx']) {
  ok(`${f.split('/').pop()}: usa la lista unica`, /tiposComprobante/.test(fuente(f)));
}

const plantilla = fuente('src/utils/templates/documentTemplates.ts');
ok('la plantilla ya no cae en "Factura de Consumo" por defecto',
  !/\|\|\s*'Factura de Consumo Electrónica'/.test(plantilla));

console.log('\n6) La emision acepta lo que el formulario ofrece\n');

for (const f of ['src/app/api/v1/invoices/route.ts', 'src/app/api/v1/invoices/draft/route.ts']) {
  const src = fuente(f);
  ok(`${f.split('/').slice(-2).join('/')}: el enum sale de la lista`,
    /z\.enum\(CODIGOS_EMITIBLES/.test(src));
  ok(`${f.split('/').slice(-2).join('/')}: ya no lleva la lista a pelo`,
    !/z\.enum\(\['31', '32', '33', '34', '45'\]/.test(src));
}


console.log('\n7) El dialogo de confirmacion: el peor sitio para un valor por defecto\n');

// Decia literalmente:
//     : 'Consumo (e-32)'
// como ultimo `else`. Al confirmar un e-44 la pantalla mostraba
// "Consumo (e-32)" -- un comprobante que no es el que se iba a emitir, en la
// unica pantalla cuya funcion es verificar antes de emitir.
{
  const form = fuente('src/app/dashboard/invoices/page.tsx');
  ok('el dialogo ya no cae en "Consumo (e-32)"',
    !/:\s*'Consumo \(e-32\)'/.test(form));
  ok('el dialogo lee de la lista unica',
    /nombreCortoTipo\(ecfType\)/.test(form));
  ok('y si no reconoce el tipo, LO DICE',
    /TIPO NO RECONOCIDO/.test(form));
  ok('no queda ningun switch de tipos en el formulario',
    !/case '31': return isElectronic/.test(form) &&
    !/case '45': return 'Gubernamental'/.test(form));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
