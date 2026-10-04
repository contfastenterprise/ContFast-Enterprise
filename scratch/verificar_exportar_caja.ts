/**
 * Lote 281 -- el boton "Exportar" de los movimientos de caja no hacia nada.
 *
 * Lo encontro la auditoria de UI (lote 273): `IconButton` con su `aria-label` y SIN `onClick`. Ahora
 * exporta a CSV lo mismo que enseña la tabla del turno, y respeta el arqueo ciego (lote 172): el total
 * neto solo sale si la sesion deja ver el saldo. De paso, el CSV del historico (que ya funcionaba) pasa
 * por las mismas funciones y pierde dos defectos: una comilla en un texto rompia la fila, y un texto que
 * empieza por "=" lo ejecutaba Excel como formula.
 *
 * Las reglas (`cash/exportarCaja.ts`) y la descarga (`utils/descargarCsv.ts`) se EJECUTAN.
 *
 * Se ejecuta con: npx tsx scratch/verificar_exportar_caja.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => readFileSync(resolve(raiz, r), 'utf8');
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MOVS = [
  { id: '1', type: 'sale', amount: '1500.5', description: 'Venta mostrador', reference: 'E320000000101', createdAt: '2026-10-04T14:00:00Z' },
  { id: '2', type: 'cash_out', amount: '200', description: 'Pago de "agua" al suplidor', createdAt: '2026-10-04T15:00:00Z' },
  { id: '3', type: 'refund', amount: '50', description: '=HYPERLINK("http://x","clic")', createdAt: '2026-10-04T16:00:00Z' },
];

async function main() {
  const gestion = leer('src/app/dashboard/cash/components/VistaGestion.tsx');
  if (!/aria-label="Exportar los movimientos de caja"/.test(gestion)) throw new Error('Precondicion: no esta el boton de exportar');
  const RUTA = 'src/app/dashboard/cash/exportarCaja.ts';
  const X: AnyRec | null = existsSync(resolve(raiz, RUTA)) ? await import('../src/app/dashboard/cash/exportarCaja') : null;
  const D: AnyRec | null = existsSync(resolve(raiz, 'src/utils/descargarCsv.ts')) ? await import('../src/utils/descargarCsv') : null;

  console.log('\n1) El boton hace algo\n');
  ok('el boton "Exportar" del turno llama a exportarMovimientos', /aria-label="Exportar los movimientos de caja" onClick=\{c\.exportarMovimientos\}/.test(gestion));
  const caja = leer('src/app/dashboard/cash/hooks/useCaja.ts');
  ok('  y exportarMovimientos arma el fichero con la SESION y las terminales, y lo descarga',
    /archivoDeMovimientos\(movements, session, registers\)/.test(caja) && /descargarCsv\(nombre, contenido\)/.test(caja) && /exportarMovimientos \};/.test(caja));
  ok('  sin movimientos, lo dice en vez de bajar un fichero vacio',
    /if \(movements\.length === 0\) return void toast\.error\('No hay movimientos para exportar'\);/.test(caja));
  if (!X) ok('el fichero del turno sigue la regla de la SESION: ciega sin total, visible con total, y la terminal en el nombre', false, 'no existe exportarCaja.ts');
  else {
    const t = [{ id: 'r1', code: 'CAJA-01', name: 'Caja Principal' }];
    intenta('el fichero del turno sigue la regla de la SESION: ciega sin total, visible con total, y la terminal en el nombre', () => {
      const ciega = X.archivoDeMovimientos(MOVS, { saldoVisible: false, expectedBalance: '900', cashRegisterId: 'r1' }, t, '2026-10-04');
      const vista = X.archivoDeMovimientos(MOVS, { saldoVisible: true, expectedBalance: '900', cashRegisterId: 'r1' }, t, '2026-10-04');
      return !/Total neto/.test(ciega.contenido) && /"Total neto en caja",,,,900\.00$/.test(vista.contenido) && ciega.nombre === 'movimientos_caja_caja_01_2026-10-04.csv';
    });
  }

  console.log('\n2) El CSV de los movimientos (ejecutado)\n');
  const E = ['una fila por movimiento, con los mismos tipos que la tabla y el monto CON SIGNO (salidas y devoluciones restan)',
    'arqueo ciego: sin saldo visible NO lleva el total; con saldo visible, si',
    'una comilla dentro de un concepto no rompe la fila', 'un concepto que empieza por "=" no es una formula (inyeccion de CSV)',
    'marca UTF-8 al principio y filas en CRLF (lo que espera Excel)', 'el nombre lleva la terminal y el dia, sin tildes ni espacios'];
  if (!X) for (const t of E) ok(t, false, `no existe ${RUTA}`);
  else {
    const x = X;
    const ciego = x.csvDeMovimientos(MOVS, { saldoVisible: false, saldoEsperado: '1250.50' }) as string;
    const visible = x.csvDeMovimientos(MOVS, { saldoVisible: true, saldoEsperado: '1250.50' }) as string;
    const filas = ciego.replace(/^﻿/, '').split('\r\n');
    intenta(E[0], () => filas.length === 4 && /"Venta",.*,1500\.50$/.test(filas[1]) && /"Salida",.*,-200\.00$/.test(filas[2]) && /"Devolución",.*,-50\.00$/.test(filas[3]));
    intenta(E[1], () => !/Total neto/.test(ciego) && /"Total neto en caja",,,,1250\.50$/.test(visible));
    intenta(E[2], () => filas[2].includes('"Pago de ""agua"" al suplidor"') && filas[2].split(',').length >= 5);
    intenta(E[3], () => filas[3].includes(`"'=HYPERLINK(""http://x"",""clic"")"`) && x.celdaCsv('-5') === `"'-5"` && x.importeCsv(-5) === '-5.00');
    intenta(E[4], () => ciego.startsWith('﻿') && ciego.includes('\r\n') && !/[^\r]\n/.test(ciego));
    intenta(E[5], () => x.nombreDelCsv('movimientos caja', '2026-10-04', 'Caja Principal Nº1') === 'movimientos_caja_caja_principal_n_1_2026-10-04.csv');
  }

  console.log('\n3) La descarga (ejecutada con un documento de mentira)\n');
  if (!D) ok('descarga con el nombre dado y suelta la memoria del fichero', false, 'no existe utils/descargarCsv.ts');
  else {
    const traza: string[] = [];
    const enlace: AnyRec = { style: {}, click: () => traza.push('click') };
    const g = globalThis as AnyRec;
    const antes = { document: g.document, URL: g.URL };
    g.document = { createElement: () => enlace, body: { appendChild: () => traza.push('pone'), removeChild: () => traza.push('quita') } };
    g.URL = { createObjectURL: () => 'blob:1', revokeObjectURL: (u: string) => traza.push(`suelta ${u}`) };
    try { D.descargarCsv('x.csv', 'a,b'); } finally { g.document = antes.document; g.URL = antes.URL; }
    ok('descarga con el nombre dado y suelta la memoria del fichero', enlace.download === 'x.csv' && enlace.href === 'blob:1' && traza.join(' ') === 'pone click quita suelta blob:1', traza.join(' '));
  }

  console.log('\n4) El historico, por las mismas funciones\n');
  const hist = leer('src/app/dashboard/cash/hooks/useHistorialCaja.ts');
  ok('el CSV del historico escapa sus textos (celdaCsv) y baja por descargarCsv con el dia de RD',
    /descargarCsv\(nombreDelCsv\('historico caja', diaRD\(\)\), contenidoCsv\(/.test(hist) && /celdaCsv\(h\.registerName\)/.test(hist) && !/\.map\(v => `"\$\{v\}"`\)/.test(hist));

  console.log('\n5) Lo que no cambia (invariantes)\n');
  invariante('el historico conserva sus nueve columnas, en el mismo orden',
    /const headers = \['Terminal', 'Usuario', 'Apertura', 'Cierre', 'Fondo Inicial', 'Saldo Esperado', 'Saldo Real', 'Diferencia', 'Estado'\];/.test(hist));
  invariante('la tabla del turno sigue enseñando el total solo con saldo visible',
    /\{c\.session\?\.saldoVisible \? fmt\(c\.session\.expectedBalance \|\| '0'\) : TEXTO_SALDO_OCULTO\}/.test(gestion));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
