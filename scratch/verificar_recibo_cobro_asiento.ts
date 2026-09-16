/**
 * Banco del lote 136: el asiento del recibo de cobro entraba al libro por una
 * puerta sin guardia.
 *
 *     pnpm exec tsx scratch/verificar_recibo_cobro_asiento.ts
 *
 * HAY DOS PUERTAS AL LIBRO DIARIO. `AccountingRepository.createJournalEntry`
 * valida que el asiento cuadre, que ningun renglon lleve debe Y haber, que la
 * cuenta exista, sea de la empresa, este activa y sea TRANSACCIONAL -- y
 * guarda `created_by`. `arRepository.registerReceipt` insertaba su asiento a
 * mano, sin nada de eso.
 *
 * Lo que se midio el 2026-09-15 contra la base (solo lectura):
 *
 * - AUTORIA. Desde que `created_by` se escribe, 68 asientos lo llevan y 7 no.
 *   Los 7 son TODOS "Recibo de Cobro"; el ultimo, de ese mismo dia. La columna
 *   se añadio (JRN-16) despues de aparecer un asiento duplicado de 545.724,30
 *   en julio sin forma de saber de donde salio. Este camino la ignoraba, con
 *   el `userId` a mano: ya lo usaba para el recibo, para el audit_log y para
 *   buscar la sesion de caja.
 *
 * - CUENTAS DE AGRUPACION. Usaba 1.1.01 y 1.1.02, que en el plan que el
 *   sistema siembra NO son transaccionales. `createJournalEntry` rechaza
 *   moverlas; esta puerta no. 108 renglones sobre 1.1.01 y 66 sobre 1.1.02,
 *   mientras sus subcuentas llevan movimiento por su cuenta. El balance no
 *   miente en los totales (suma cada cuenta por separado, sin acumular hijas),
 *   pero en el arbol el padre enseña solo lo suyo y se lee como el total del
 *   grupo.
 *
 * - Y resolvia con una copia local de `getOrCreateAccount`, que CREA la cuenta
 *   si no la encuentra, con `nature` y `level` por defecto -- lo que invierte
 *   signos en la balanza por jerarquia (JRN-01/02/12).
 *
 * Los libros CUADRAN, eso se midio tambien: 199 asientos en PRODUCCION, 598
 * renglones, ninguno con debe y haber a la vez ni con los dos en cero, y
 * diferencia global 0,00. Este lote no arregla un descuadre: quita la unica
 * puerta por la que podia entrar uno.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const AR = 'src/repositories/arRepository.ts';
const CONTA = 'src/repositories/accountingRepository.ts';
const RESOLVER = 'src/services/accounting/resolverCuentas.ts';
const FACTURA = 'src/services/invoice/invoiceDbBooker.ts';
const FACTURA_CUENTAS = 'src/services/invoice/asientoDeFactura.ts';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
{
  const conta = codigo(CONTA);
  //  El guardia que la otra puerta si tiene. Si dejara de estar, este lote
  //  cambia de sentido.
  exige(/Asiento contable descuadrado/.test(conta), 'createJournalEntry ya no comprueba que el asiento cuadre');
  exige(/no admite movimientos directos/.test(conta) || /isTransactional/.test(conta),
        'createJournalEntry ya no rechaza las cuentas de agrupacion');
  exige(/createdBy: \('createdBy' in data && data\.createdBy\) \|\| null,/.test(conta),
        'createJournalEntry ya no guarda el autor');
  //  El resolvedor no inventa cuentas: ese es el motivo de usarlo.
  const res = codigo(RESOLVER);
  exige(!/\.insert\(chartOfAccounts\)/.test(res), 'el resolvedor de cuentas ahora CREA cuentas');
  exige(/isTransactional/.test(res), 'el resolvedor ya no exige que la cuenta sea transaccional');
  //  Y la facturacion ya usaba estas dos claves: el cobro se pega a ellas.
  //  (Lote 140: la resolucion salio de invoiceDbBooker a asientoDeFactura.ts,
  //  que la emision llama. Se mira alli, y que la emision la sigue usando.)
  const fac = codigo(FACTURA_CUENTAS);
  exige(/await resolverCuentasDeVenta\(tx, data\.companyId, /.test(codigo(FACTURA)),
        'la facturacion ya no resuelve sus cuentas con asientoDeFactura');
  exige(/resolverCuentaPorMapeo\(tx, (data\.)?companyId, 'accounts_receivable', '1\.1\.02\.01'/.test(fac),
        'la facturacion ya no resuelve CxC con accounts_receivable/1.1.02.01');
  exige(/resolverCuentaPorMapeo\(tx, (data\.)?companyId, 'cash', '1\.1\.01\.01'/.test(fac),
        'la facturacion ya no resuelve caja con cash/1.1.01.01');
  //  El `userId` estaba a mano desde siempre.
  exige(/createdBy: data\.userId,/.test(codigo(AR)), 'registerReceipt ya no guarda el autor NI del recibo');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL ASIENTO DEL COBRO LLEVA AUTOR');
// ─────────────────────────────────────────────────────────────────────────
{
  const cabecera = bloque(codigo(AR), 'await tx.insert(journalEntries).values({');
  //  `bloque()` acota el `values({...})` del asiento: no basta con que el
  //  fichero mencione `createdBy`, porque ya lo mencionaba para la fila del
  //  recibo (P1-13) y para nada mas. Un primer intento miraba la distancia en
  //  caracteres desde la descripcion, y lo rompio el propio comentario que
  //  explica el arreglo: anclar la FORMA en vez de la propiedad, otra vez.
  ok('la cabecera del asiento guarda quien lo registro',
     /createdBy: data\.userId,/.test(cabecera) && /description: `Recibo de Cobro/.test(cabecera));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LAS CUENTAS SE RESUELVEN, NO SE INVENTAN');
// ─────────────────────────────────────────────────────────────────────────
{
  const src = codigo(AR);
  ok('caja y CxC salen del resolvedor, con las claves de la facturacion',
     /resolverCuentaPorMapeo\(tx, data\.companyId, 'cash', '1\.1\.01\.01'/.test(src)
     && /resolverCuentaPorMapeo\(tx, data\.companyId, 'accounts_receivable', '1\.1\.02\.01'/.test(src));
  ok('y ya no apunta a las cuentas de agrupacion',
     !/'1\.1\.01'/.test(src) && !/'1\.1\.02'/.test(src));
  ok('la copia local de getOrCreateAccount ya no existe, ni se llama',
     !/getOrCreateAccount/.test(src) && !/\.insert\(chartOfAccounts\)/.test(src));
  ok('importa el resolvedor de verdad (no vale nombrarlo)',
     // Lote 151: el import gano `resolverCuentaDeBanco` (el cobro por banco).
     // Se fija que el nombre venga de ese modulo, no la linea entera.
     /import \{[^}]*\bresolverCuentaPorMapeo\b[^}]*\} from '@\/services\/accounting\/resolverCuentas';/.test(src));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('C. TRINQUETE: NINGUN ASIENTO NUEVO SIN AUTOR');
// ─────────────────────────────────────────────────────────────────────────
//  Las puertas al libro se cuentan sobre el arbol entero: cada sitio que
//  inserta una cabecera de asiento tiene que decir quien la registra.
function ficherosTs(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'tests') continue;
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) ficherosTs(p, acc);
    else if (e.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}
const puertas: string[] = [];
const sinAutor: string[] = [];
for (const f of ficherosTs('src')) {
  const src = codigo(f);
  for (const m of src.matchAll(/\.insert\(journalEntries\)/g)) {
    puertas.push(f);
    //  La ventana del `values({...})` que sigue.
    const ventana = src.slice(m.index!, m.index! + 900);
    if (!/createdBy:/.test(ventana)) sinAutor.push(`${f} (posicion ${m.index})`);
  }
}
exige(puertas.length >= 2, `el barrido no encontro las puertas al libro (${puertas.length}): algo cambio de sitio`);
ok(`las ${puertas.length} puertas al libro diario guardan el autor (${sinAutor.length} sin el)`,
   sinAutor.length === 0);
for (const s of sinAutor) console.log(`         ${s}`);

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
