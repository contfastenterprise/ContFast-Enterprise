/**
 * Banco del lote 121: una sola cuenta de inventario para comprar y para vender.
 *
 *     pnpm exec tsx scratch/verificar_cuenta_inventario_unica.ts
 *
 * EL FALLO, MEDIDO (2026-09-14, solo lectura)
 * -------------------------------------------
 * Las compras con productos buscaban la clave `purchase_inventory` con defecto
 * `1.1.06`; el costo de venta del conduce y la devolucion de la nota de credito
 * buscaban `inventory` con defecto `1.1.03.01`. Ninguna empresa tiene mapeada
 * `purchase_inventory`, y el catalogo sembrado solo trae `1.1.03.01`. En Latin
 * Doors -- la unica con operacion real -- la cuenta `1.1.06` la creo el codigo
 * anterior a P0-05, con el MISMO nombre, "Inventario de Mercancia". Resultado
 * en PRODUCCION:
 *
 *     1.1.06     +347.892,30   entra por compras, nunca sale
 *     1.1.03.01  -229.927,25   sale por costo de venta, nunca entro
 *
 * Y en las otras cinco empresas, que no tienen `1.1.06`, registrar una compra
 * con productos FALLA: `resolverCuentaPorMapeo` no crea cuentas.
 *
 * EL ARREGLO
 * ----------
 * `resolverCuentaDeInventario` en resolverCuentas.ts: la clave `inventory` (la
 * que se configura en Ajustes > Contabilidad) con defecto `1.1.03.01`, en UN
 * sitio. La usan las tres puertas de compra, el conduce y la nota de credito.
 * Asi no pueden volver a separarse.
 *
 * LO QUE NO SE HACE: los saldos ya asentados en 1.1.06 y 1.1.03.01 no se tocan.
 * Reclasificarlos es un asiento del contador.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

const RES = 'src/services/accounting/resolverCuentas.ts';
const SEM = 'src/repositories/accountingRepository.ts';
const COMPRAS = ['src/app/api/v1/expenses/route.ts', 'src/app/api/v1/expenses/[id]/route.ts', 'src/services/expenseService.ts'];
const SALIDAS = ['src/repositories/deliveryRepository.ts', 'src/services/invoice/invoiceDbBooker.ts'];

const FUENTES: { ruta: string; texto: string }[] = [];
(function andar(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) andar(p);
    else if (/\.tsx?$/.test(p)) FUENTES.push({ ruta: p, texto: codigo(p) });
  }
})('src');

const importa = (f: string, id: string) =>
  new RegExp(`import \\{[^}]*\\b${id}\\b[^}]*\\} from '(@/services/accounting/resolverCuentas|\\./accounting/resolverCuentas)'`).test(codigo(f));
const llama = (f: string, id: string) => new RegExp(`\\b${id}\\(tx, `).test(codigo(f));

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(FUENTES.length > 400, 'no se leyeron las fuentes');
for (const f of [RES, SEM, ...COMPRAS, ...SALIDAS]) exige(crudo(f).length > 1000, `No se pudo leer ${f}`);
//  Que el resolvedor NUNCA crea cuentas es lo que hace que una clave con
//  defecto inexistente FALLE en vez de fabricar una segunda cuenta.
exige(!/\.insert\(/.test(codigo(RES)), 'resolverCuentas.ts ha empezado a insertar: el razonamiento cambia');
//  La cuenta de inventario sembrada y mapeada es 1.1.03.01.
exige(codigo(SEM).includes("{ key: 'inventory', code: '1.1.03.01' }"), 'el mapeo sembrado de inventory ya no es 1.1.03.01');
exige(codigo(SEM).includes("{ code: '1.1.03.01', name: 'Inventario de Mercancía'"), 'el catalogo sembrado ya no trae 1.1.03.01');
exige(!codigo(SEM).includes("code: '1.1.06'"), 'el catalogo sembrado trae 1.1.06: revisar cual es la cuenta de inventario');
//  Las compras con productos siguen yendo a una cuenta de inventario y las sin
//  productos a costo de venta: lo que cambia es CUAL cuenta de inventario.
for (const f of COMPRAS) {
  exige(codigo(f).includes("'cost_of_goods_sold', '5.1.01', 'Compra - Costo de Ventas'"),
        `${f} ya no manda las compras sin productos a costo de venta`);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LA CUENTA DE INVENTARIO SE DECIDE EN UN SITIO');
// ─────────────────────────────────────────────────────────────────────────
const res = codigo(RES);
ok('resolverCuentas exporta resolverCuentaDeInventario',
   /export async function resolverCuentaDeInventario\(\s*tx: DbTransaction,\s*companyId: string,\s*contexto: string\s*\): Promise<CuentaValidada> \{/.test(res));
ok('que usa la clave inventory con defecto 1.1.03.01',
   /return resolverCuentaPorMapeo\(tx, companyId, 'inventory', '1\.1\.03\.01', contexto\);/.test(res));
ok('y no queda en src/ ninguna otra resolucion de inventario escrita a mano',
   res.includes('export async function resolverCuentaDeInventario(')
   && FUENTES.filter((f) => /resolverCuentaPorMapeo\([^)]*'(purchase_)?inventory'/.test(f.texto)).map((f) => f.ruta)
        .every((r) => r === RES));
ok('ni rastro de purchase_inventory ni de 1.1.06 en src/',
   res.includes('export async function resolverCuentaDeInventario(')
   && !FUENTES.some((f) => /'purchase_inventory'|'1\.1\.06'/.test(f.texto)));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LAS TRES PUERTAS DE COMPRA LA USAN');
// ─────────────────────────────────────────────────────────────────────────
for (const f of COMPRAS) {
  ok(`${f}: la importa`, importa(f, 'resolverCuentaDeInventario'));
  ok(`${f}: y la llama para la compra con productos`,
     /hasInventory\s*\?\s*await resolverCuentaDeInventario\(tx, [\w.]+, 'Compra - Inventario de Mercancía'\)/.test(codigo(f)));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('C. Y LAS DOS SALIDAS TAMBIEN (conduce y nota de credito)');
// ─────────────────────────────────────────────────────────────────────────
for (const f of SALIDAS) {
  ok(`${f}: la importa y la llama`, importa(f, 'resolverCuentaDeInventario') && llama(f, 'resolverCuentaDeInventario'));
}

ok('queda escrito por que eran dos cuentas',
   crudo(RES).includes('347.892,30') && crudo(RES).includes('-229.927,25'));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
