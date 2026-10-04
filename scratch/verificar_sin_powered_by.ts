/**
 * Lote 268 -- fuera el letrero "Powered by MSeller API" de la pantalla de facturas.
 *
 * Pedido del dueño (2026-10-03): *"en la pagina /dashboard/invoices quita el letrero 'Powered by
 * MSeller API'"*. Era una pastilla con un punto verde parpadeante sobre los totales del mes, sola en
 * la columna izquierda de la fila; sin ella, la fila se alinea a la derecha para que los totales no
 * se muevan.
 *
 * Se ejecuta con: npx tsx scratch/verificar_sin_powered_by.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const pagina = readFileSync(resolve(__dirname, '..', 'src/app/dashboard/invoices/page.tsx'), 'utf8');
//  Sin comentarios: el comentario del lote nombra el letrero, y el banco mira el codigo.
const codigo = pagina.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean) => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean) => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}`); if (!c) rotas++; };

//  Vale en los dos estados: la fila de totales sigue ahi.
if (!/>Total Mes</.test(codigo)) throw new Error('Precondicion: no esta la fila de totales');

ok('la pantalla de facturas ya no dice "Powered by MSeller API"', !/Powered by/i.test(codigo));
ok('  y la fila de totales se alinea a la derecha (no se van a la izquierda sin su vecino)',
  /<div className="flex flex-col md:flex-row md:justify-end items-start md:items-end gap-6 mb-2">\s*<div className="flex (?:flex-wrap )?gap-4 w-full md:w-auto">/.test(codigo));
  //  LOTE 275: la fila de los totales gano `flex-wrap` (en el movil estiraba la pagina a 470 px); lo
  //  que vigila este banco es que se alinee a la derecha, no que no parta.
invariante('los totales del mes siguen en la pantalla', />Total Mes</.test(codigo) && /stats\?\.totalMonth/.test(codigo));

console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
