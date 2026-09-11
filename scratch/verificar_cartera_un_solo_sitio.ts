/**
 * El analisis de cartera, en un solo sitio.
 *
 * `/dashboard/financial/accounts-receivable` y su espejo de pagar tenian una
 * pestaña "Resumen Ejecutivo" con antiguedad de saldos, estado de cartera y
 * top deudores. Es casi exactamente lo que hace /dashboard/antiguedad-saldos.
 *
 * Dos sitios que calculan lo mismo son dos sitios que pueden discrepar, y aqui
 * el que discrepara no se iba a notar: esa pestaña vivia detras de un menu que
 * -- hasta que se corrigio el modulo de esas dos entradas -- solo veian
 * `sistemas` y `administracion`. Una segunda fuente de verdad que nadie mira
 * es peor que no tenerla.
 *
 * Se queda lo que la pantalla nueva NO hace: la lista factura por factura y el
 * tablero. Y se va, ademas del resumen, lo que solo era un cartel:
 * "Calendario de Vencimientos" y "Linea de Tiempo", las dos con un
 * "(Modulo en construccion)" debajo. Una promesa ocupando sitio en la barra no
 * es una funcion a medias, es ruido: el usuario la pulsa, no pasa nada, y
 * aprende a no fiarse del resto de pestañas.
 */
import { crudo as crudoCrudo } from './_fuente';

const c = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const veces = (s: string, t: string): number => s.split(t).length - 1;

const PANTALLAS: [string, string][] = [
  ['CxC', 'src/app/dashboard/financial/accounts-receivable/components/AccountsReceivableDashboard.tsx'],
  ['CxP', 'src/app/dashboard/financial/accounts-payable/components/AccountsPayableDashboard.tsx'],
];

for (const [etiqueta, ruta] of PANTALLAS) {
  const src = c(ruta);

  ok(`${etiqueta}: no queda la pestaña que duplicaba el analisis`,
    !src.includes("activeTab === 'dashboard'") && !src.includes('DashboardTab'));

  ok(`${etiqueta}: no quedan pestañas que solo anuncian algo futuro`,
    !src.includes('Módulo en construcción')
    && !src.includes("activeTab === 'calendar'")
    && !src.includes("activeTab === 'activity'"));

  // Arrancar en una pestaña retirada pinta la pantalla vacia, sin avisar.
  ok(`${etiqueta}: arranca en una pestaña que existe`,
    src.includes("useState('list');"));

  // Comprobar solo que las dos buenas siguen ahi pasaba tambien ANTES --
  // estaban las cinco. Apretada: tienen que ser las UNICAS dos, para que la
  // barra no pueda volver a llenarse sin que esto se caiga.
  ok(`${etiqueta}: se quedan SOLO las dos que aportan algo distinto`,
    veces(src, '<TabsTrigger') === 2
    && src.includes("activeTab === 'list' && <ListTab")
    && src.includes("activeTab === 'kanban' && <KanbanTab"));

  // Quitar una pestaña sin decir adonde fue deja al usuario buscandola.
  ok(`${etiqueta}: dice adonde se mudo el analisis, con enlace`,
    src.includes('href="/dashboard/antiguedad-saldos"')
    && src.includes('Ver análisis de cartera')
    && src.includes("import Link from 'next/link';"));

  // Un icono importado y ya sin uso es ruido que el linter no siempre ve.
  ok(`${etiqueta}: no quedan iconos de las pestañas retiradas`,
    !src.includes('LayoutDashboard') && !src.includes('CalendarIcon') && !src.includes('Activity'));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
