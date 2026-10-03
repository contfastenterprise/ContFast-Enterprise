/**
 * Lote 264 -- no se factura por debajo del costo, contando el descuento por unidad.
 *
 * Revisando el calculo de la factura (2026-10-03) salio que la regla comparaba el precio ANTES del
 * descuento con el costo: precio 100, costo 90 y 20 de descuento pasaba, aunque se vendia a 80.
 * Medido: 3 lineas facturadas asi. Decision del dueño: IMPEDIRLO.
 *
 * Codigo: la regla pura (`services/invoice/precioMinimo.ts`), EJECUTADA, y que la usen el servidor y
 * la pantalla. Lo que el servidor rechaza de verdad lo ejecuta `verificar_costo_tras_descuento_db.ts`.
 *
 * Se ejecuta con: npx tsx scratch/verificar_costo_tras_descuento.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => { const p = resolve(raiz, r); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => { comprobadas++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const booker = sinComentarios(leer('src/services/invoice/invoiceDbBooker.ts'));
  const pantalla = sinComentarios(leer('src/app/dashboard/invoices/page.tsx'));
  if (!booker || !pantalla) throw new Error('Precondicion: faltan el booker o la pantalla de facturas');

  console.log('\n1) La regla, ejecutada\n');
  const E = [
    'precio 100 con 20 de descuento sobre costo 90: se vende a 80, por debajo',
    'precio 100 con 5 de descuento: 95, no',
    'justo en el costo (100 - 10 = 90) no es "por debajo"',
    'sin descuento, la regla de siempre (85 < 90 si; 95 no)',
    'sin costo (0) no hay contra que comparar',
    'el motivo nombra el precio CON descuento cuando es el descuento el que lo deja abajo',
  ];
  let R: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/services/invoice/precioMinimo.ts'))) R = await import('../src/services/invoice/precioMinimo');
  if (!R) for (const t of E) ok(t, false, 'no existe services/invoice/precioMinimo.ts');
  else {
    const r = R;
    intenta(E[0], () => r.precioNeto({ unitPrice: 100, discount: 20 }) === 80 && r.quedaPorDebajoDelCosto({ unitPrice: 100, discount: 20 }, 90));
    intenta(E[1], () => !r.quedaPorDebajoDelCosto({ unitPrice: 100, discount: 5 }, 90));
    intenta(E[2], () => !r.quedaPorDebajoDelCosto({ unitPrice: 100, discount: 10 }, 90));
    intenta(E[3], () => r.quedaPorDebajoDelCosto({ unitPrice: 85, discount: 0 }, 90) && !r.quedaPorDebajoDelCosto({ unitPrice: 95, discount: null }, 90));
    intenta(E[4], () => !r.quedaPorDebajoDelCosto({ unitPrice: 1, discount: 50 }, 0));
    intenta(E[5], () => {
      const con = r.motivoBajoCosto({ unitPrice: 100, discount: 20 }, 90, 'Puerta');
      const sin = r.motivoBajoCosto({ unitPrice: 85, discount: 0 }, 90, 'Puerta');
      return con.includes('con descuento') && con.includes('RD$ 80.00') && con.includes('RD$ 90.00')
        && sin.includes('precio unitario') && sin.includes('RD$ 85.00');
    });
  }

  console.log('\n2) La usan el servidor y la pantalla\n');
  ok('el servidor rechaza con la regla nueva (y ya no compara el precio a secas)',
    /import \{[^}]*\bquedaPorDebajoDelCosto\b[^}]*\} from '\.\/precioMinimo'/.test(booker)
    && /if \(quedaPorDebajoDelCosto\(line, cost\)\) \{\s*throw new Error\(motivoBajoCosto\(line, cost, line\.name\)\);/.test(booker)
    && !/line\.unitPrice < cost/.test(booker));
  ok('  solo en ventas: la nota de credito sigue fuera',
    /if \(data\.ecfType !== '34'\) \{[\s\S]{0,2500}quedaPorDebajoDelCosto\(line, cost\)/.test(booker));
  ok('la pantalla frena la emision con la misma regla',
    /import \{ quedaPorDebajoDelCosto \} from '@\/services\/invoice\/precioMinimo'/.test(pantalla)
    && /if \(quedaPorDebajoDelCosto\(line, cost\)\) \{\s*out\[`lines\.\$\{idx\}\.unitPrice`\]/.test(pantalla)
    && !/Number\(line\.unitPrice\) < cost/.test(pantalla));
  ok('  y marca en rojo el precio tambien cuando es el descuento el que lo deja abajo',
    /const isBelowCost = quedaPorDebajoDelCosto\(line, pCost\);/.test(pantalla) && !/line\.unitPrice < pCost/.test(pantalla));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`} (${comprobadas} comprobaciones)\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
