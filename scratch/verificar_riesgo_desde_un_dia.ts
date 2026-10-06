/**
 * Lote 306: "Cartera en Riesgo" cuenta desde el PRIMER dia de atraso.
 *
 * Decision del dueño (2026-10-05): *"la Cartera en Riesgo debe de ser a partir del 1 dia de
 * atraso"*. Hasta ahora la tarjeta sumaba solo lo que llevaba mas de 15 dias (riesgo alto y
 * critico), y el contador de clientes entre parentesis contaba solo esos dos niveles.
 *
 * Lo que se comprueba, dibujando la tarjeta con `react-dom/server`:
 *   - la suma entra con 1 dia de atraso (riesgo medio), no solo con 16;
 *   - sigue siendo documento a documento (lote 304): lo que aun no vence no entra;
 *   - el parentesis cuenta todo cliente que no esta al dia;
 *   - el rotulo de debajo dice desde cuando, y ya no dice "Mas de 15 dias";
 *   - el manual dice lo mismo, con la version subida.
 *
 * Uso: npx tsx scratch/verificar_riesgo_desde_un_dia.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

let fallos = 0;
let oks = 0;
const ok = (etiqueta: string, cond: boolean, detalle?: unknown) => {
  if (cond) { oks++; console.log(`  OK    ${etiqueta}`); }
  else { fallos++; console.log(`  FALLA ${etiqueta}${detalle !== undefined ? ` -> ${JSON.stringify(detalle)}` : ''}`); }
};
const raiz = resolve(__dirname, '..');

async function main() {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { TarjetasResumen } = await import('../src/components/cartera/TarjetasResumen');

  const fila = (o: Record<string, unknown>) => ({
    id: 'c1', nombre: 'Cliente', rncCedula: null, telefono: null, correo: null, saldo: 0, cupoCredito: 0,
    diasAtraso: 0, nivelRiesgo: 'bajo', ultimoDocumento: null, documentosPendientes: 1, mensual: [],
    tramos: {}, saldoPorNivel: { bajo: 0, medio: 0, alto: 0, critico: 0 }, ...o,
  });
  const tarjeta = (filas: unknown[]) => {
    const html = renderToStaticMarkup(React.createElement(TarjetasResumen, { filas: filas as never, tipo: 'clientes' }));
    const i = html.indexOf('Cartera en Riesgo');
    if (i < 0) throw new Error('la tarjeta "Cartera en Riesgo" no se dibujo');
    // Desde el rotulo hasta la tarjeta siguiente (Facturacion Prom.).
    return html.slice(i, html.indexOf('Facturación Prom.', i));
  };
  const importe = (t: string) => (t.match(/RD\$ ([\d.,]+)</) ?? [])[1];
  const parentesis = (t: string) => (t.match(/>\((?:<!-- -->)?(\d+)(?:<!-- -->)?\)</) ?? [])[1];

  // Un cliente con 1 dia de atraso en 500 y 1.000 aun por vencer (riesgo medio).
  const unDia = fila({ id: 'a', saldo: 1500, diasAtraso: 1, nivelRiesgo: 'medio',
    saldoPorNivel: { bajo: 1000, medio: 500, alto: 0, critico: 0 } });
  // Uno con 30 dias en 200 (alto), uno con 60 en 300 (critico) y uno al dia con 4.000.
  const treinta = fila({ id: 'b', saldo: 200, diasAtraso: 30, nivelRiesgo: 'alto',
    saldoPorNivel: { bajo: 0, medio: 0, alto: 200, critico: 0 } });
  const sesenta = fila({ id: 'c', saldo: 300, diasAtraso: 60, nivelRiesgo: 'critico',
    saldoPorNivel: { bajo: 0, medio: 0, alto: 0, critico: 300 } });
  const alDia = fila({ id: 'd', saldo: 4000, saldoPorNivel: { bajo: 4000, medio: 0, alto: 0, critico: 0 } });

  console.log('\n1) La suma\n');
  {
    const t = tarjeta([unDia]);
    ok('con 1 dia de atraso ya entra en la cartera en riesgo (500)', importe(t) === '500', importe(t));
  }
  {
    const t = tarjeta([unDia, treinta, sesenta, alDia]);
    ok('suma 1-15, 16-45 y mas de 45 dias: 500 + 200 + 300 = 1.000', importe(t) === '1,000' || importe(t) === '1.000', importe(t));
    ok('el parentesis cuenta los tres clientes que no estan al dia', parentesis(t) === '3', parentesis(t));
  }
  {
    // Invariante del lote 304 (cierto antes y despues): lo que aun no vence no entra.
    const t = tarjeta([alDia]);
    if (importe(t) !== '0' && importe(t) !== '0.00' && importe(t) !== '0,00') {
      console.log(`  INV   un cliente al dia deberia dar 0 (dio ${importe(t)})`); fallos++;
    } else console.log('  inv   un cliente al dia no suma nada (lote 304)');
    if (parentesis(t) !== '0') { console.log(`  INV   un cliente al dia no deberia contar (dio ${parentesis(t)})`); fallos++; }
    else console.log('  inv   un cliente al dia no cuenta en el parentesis');
  }

  console.log('\n2) El rotulo\n');
  {
    const t = tarjeta([unDia]);
    ok('debajo dice "Desde 1 día de atraso"', /Desde 1 día de atraso/.test(t));
    ok('y ya no dice "Más de 15 días de atraso"', /Desde 1 día/.test(t) && !/Más de 15 días/.test(t));
  }

  console.log('\n3) El manual\n');
  {
    const m = readFileSync(resolve(raiz, 'scripts/generate-manual.js'), 'utf8');
    const linea = (m.match(/<strong>«Cartera en Riesgo»<\/strong>[^\n]*/) ?? [''])[0];
    ok('el manual dice que la cartera en riesgo suma desde 1 dia de atraso', /1 día de atraso o más/.test(linea), linea.slice(0, 160));
    ok('y ya no dice "más de 15 días" en esa linea', /1 día de atraso o más/.test(linea) && !/más de 15 días/.test(linea));
    ok('la version del manual sube a 3.5', /const VERSION = '3\.5';/.test(m));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} — ${oks} OK\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
