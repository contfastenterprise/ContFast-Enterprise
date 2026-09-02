/**
 * Una nota RECHAZADA no puede dejar su factura sin salida.
 *
 * LO QUE PASO
 * -----------
 * La nota de credito E340000000002 se rechazo -- por el orden de los campos de
 * `Totales`, ya corregido. Al ir a emitirla otra vez, la factura original YA NO
 * APARECIA en el buscador. No habia forma de continuar desde la interfaz.
 *
 * EL PORQUE
 * ---------
 * `/api/v1/ecf?excludeAdjusted=true` excluia toda factura con una nota
 * apuntandole, SIN MIRAR EL ESTADO DE LA NOTA:
 *
 *     .where(and(..., sql`${invoices.modifiedInvoiceId} IS NOT NULL`))
 *
 * Una nota rechazada contaba igual que una aceptada. Y como el rechazo es
 * definitivo -- ese e-NCF ya se consumio y la nota se queda en `rejected` para
 * siempre -- la factura original quedaba excluida PARA SIEMPRE.
 *
 * Es el mismo patron de la auditoria una vez mas: tratar la EXISTENCIA de una
 * fila como si fuera el HECHO que esa fila representa. Una nota rechazada
 * consumio un numero; no ajusto ningun comprobante.
 *
 * LO QUE SI CUENTA
 * ----------------
 * Las notas que existen o pueden acabar existiendo: aceptada, enviada, firmada.
 * Emitir una segunda mientras una esta en vuelo si seria duplicar el ajuste.
 * Las que no: `rejected` y `void`.
 */
import { CODIGOS_MODIFICABLES_POR_NOTA, esModificablePorNota } from '../src/services/dgii/tiposComprobante';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const ruta = fuente('src/app/api/v1/ecf/route.ts');

console.log('\n1) El filtro mira el ESTADO de la nota\n');

ok('excluye por estado, no solo por existir',
  /notInArray\(invoices\.status, ESTADOS_QUE_NO_AJUSTAN/.test(ruta));
ok('y esos estados son rejected y void',
  /const ESTADOS_QUE_NO_AJUSTAN = \['rejected', 'void'\];/.test(ruta));
ok('notInArray esta importado',
  /import \{[^}]*notInArray[^}]*\} from 'drizzle-orm'/.test(ruta));

console.log('\n2) La condicion vieja ya no esta sola\n');

// El fallo era que `IS NOT NULL` fuera la UNICA condicion sobre la nota.
{
  const desde = ruta.indexOf('const adjustedSubquery');
  const hasta = ruta.indexOf('conditions.push', desde);
  const sub = ruta.slice(desde, hasta);
  ok('la subconsulta sigue mirando modifiedInvoiceId',
    /modifiedInvoiceId\} IS NOT NULL/.test(sub));
  ok('pero YA NO es la unica condicion sobre la nota',
    /notInArray/.test(sub));
  ok('sigue acotada a la empresa',
    /eq\(invoices\.companyId, auth\.companyId\)/.test(sub));
  ok('y al modo -- una nota de PRUEBA no puede bloquear una factura real',
    /eq\(invoices\.modo, auth\.modo\)/.test(sub));
}

console.log('\n3) Lo que sigue contando, cuenta\n');

// Aceptada, enviada y firmada NO estan en la lista de exclusion: una nota en
// vuelo sigue bloqueando, que es lo correcto.
for (const estado of ['accepted', 'submitted', 'signed']) {
  ok(`'${estado}' NO esta entre los que se ignoran`,
    !new RegExp(`ESTADOS_QUE_NO_AJUSTAN = \\[[^\\]]*'${estado}'`).test(ruta));
}

console.log('\n4) El buscador ofrece TODOS los tipos que admiten nota\n');

// Estaba escrito a mano en la pantalla: `'31' || '32' || '45'`. Faltaban el
// e-44 (Regimenes Especiales) y el e-46 (Exportaciones) -- y el e-44 es lo que
// la empresa factura en produccion. Otra lista paralela, la septima.
for (const t of ['31', '32', '44', '45', '46']) {
  ok(`e-${t} admite nota`, esModificablePorNota(t));
}
ok('el e-44 (Regimenes Especiales) ya NO se queda fuera', esModificablePorNota('44'));
ok('el e-46 (Exportaciones) tampoco', esModificablePorNota('46'));

// Una nota no modifica otra nota.
ok('el e-33 NO admite nota', !esModificablePorNota('33'));
ok('el e-34 tampoco', !esModificablePorNota('34'));
// Ni los de compras y gastos, que no se emiten desde ventas.
for (const t of ['41', '43', '47']) {
  ok(`e-${t} tampoco (no es de venta)`, !esModificablePorNota(t));
}
ok('un tipo desconocido tampoco', !esModificablePorNota('99'));
ok('la lista sale de TIPOS_COMPROBANTE, no escrita a mano',
  CODIGOS_MODIFICABLES_POR_NOTA.join(',') === '31,32,44,45,46',
  CODIGOS_MODIFICABLES_POR_NOTA.join(', '));

{
  const pantalla = fuente('src/app/dashboard/adjustments/page.tsx');
  ok('la pantalla usa el helper',
    /esModificablePorNota\(inv\.ecfType\)/.test(pantalla));
  ok('y ya no lleva la lista a pelo',
    !/inv\.ecfType === '31' \|\| inv\.ecfType === '32'/.test(pantalla));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
