/**
 * Los tramos de antiguedad se deciden en UN sitio.
 *
 * QUE HABIA
 * ---------
 * La misma cuenta escrita seis veces, y no daba lo mismo:
 *
 *   actions/receivables.ts        4 tramos   0-30 / 31-60 / 61-90 / 90+
 *   actions/payables.ts           4 tramos   los mismos
 *   reports/balances/customers    3 tramos   1-30 / 31-60 / 61+
 *   reports/balances/suppliers    3 tramos   idem
 *   financialRepository.ts (x2)   5 tramos   anade "no vencida", y con Math.ceil
 *
 * Un cliente con 75 dias de atraso salia en "61-90" en una pantalla y en "61+"
 * en otra. Y `financialRepository` era el unico que redondeaba hacia arriba.
 *
 * QUE COMPRUEBA ESTE BANCO
 * ------------------------
 * Primero EJECUTA la funcion: cada frontera por separado, el dia del
 * vencimiento, la cuenta saldada, la fila sin fecha y el reparto con las dos
 * formas de datos reales. Y despues comprueba que ninguno de los seis ficheros
 * conserva cortes propios -- porque mientras alguno los tenga, pueden volver a
 * separarse sin que nadie se entere.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

const RAIZ = join(__dirname, '..');
const leer = (r: string): string =>
  existsSync(join(RAIZ, r)) ? fuente(r).replace(/\r\n/g, '\n') : '';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const veces = (s: string, t: string): number => s.split(t).length - 1;

const MODULO = 'src/services/cartera/vencimiento.ts';
/** Los cinco que TENIAN tramos escritos a mano. `documentos.ts` nunca los tuvo,
 *  asi que exigirle que no los conserve saldria verde antes y despues: no
 *  comprobaria nada. Va en la lista de importadores, no en la de cortes. */
const USUARIOS: [string, string][] = [
  ['receivables', 'src/actions/receivables.ts'],
  ['payables', 'src/actions/payables.ts'],
  ['balances/customers', 'src/app/api/v1/reports/balances/customers/route.ts'],
  ['balances/suppliers', 'src/app/api/v1/reports/balances/suppliers/route.ts'],
  ['financialRepository', 'src/repositories/financialRepository.ts'],
  ['cartera/documentos', 'src/services/cartera/documentos.ts'],
];

async function main(): Promise<number> {
  // El modulo es nuevo: un `import` normal reventaria el banco contra el arbol
  // anterior en vez de dar FALLA.
  let V: any = null;
  try { V = await import('../src/services/cartera/vencimiento'); } catch { V = null; }
  const hay = !!V && typeof V.analizarVencimiento === 'function'
    && typeof V.repartirEnTramos === 'function' && typeof V.tramoDeAtraso === 'function';

  ok('existe la funcion de vencimiento, en su propio modulo', hay);

  const H = '2026-09-12';
  const v = (f: any, o: any = {}) => V.analizarVencimiento(f, { hoy: H, ...o });

  // EL FALLO QUE ORIGINO TODO: el dia en que algo vence todavia se puede pagar.
  ok('el dia del vencimiento no cuenta como atraso',
    hay && v('2026-09-12').atraso === 0 && v('2026-09-12').vencida === false
    && v('2026-09-12').venceHoy === true && v('2026-09-12').tramo === 'por-vencer'
    && v('2026-09-11').atraso === 1 && v('2026-09-11').tramo === '1-30');

  // Las cuatro fronteras, una por una. Son el motivo de que esto exista.
  ok('las fronteras de los tramos, exactas',
    hay && V.tramoDeAtraso(30) === '1-30' && V.tramoDeAtraso(31) === '31-60'
    && V.tramoDeAtraso(60) === '31-60' && V.tramoDeAtraso(61) === '61-90'
    && V.tramoDeAtraso(90) === '61-90' && V.tramoDeAtraso(91) === '90+'
    && V.tramoDeAtraso(0) === 'por-vencer' && V.tramoDeAtraso(-5) === 'por-vencer');

  ok('una saldada no esta vencida, tenga la fecha que tenga',
    hay && v('2020-01-01', { saldo: 0 }).tramo === 'saldado'
    && v('2020-01-01', { saldo: 0 }).atraso === 0
    && v('2020-01-01', { saldo: 0.01 }).tramo === 'saldado'   // el centavo de la casa
    && v('2020-01-01', { saldo: 0.02 }).tramo === '90+'
    && v('2020-01-01').saldada === false);                    // sin saldo, no opina

  // Sin fecha no se inventa una: poner hoy seria afirmar algo que el documento
  // no dice, y poner el epoch la haria vencida desde 1970.
  ok('una fila sin fecha no se inventa un vencimiento',
    hay && v(null).dia === null && v(null).texto === '-'
    && v(null).vencida === false && v(null).venceHoy === false
    && v('no es fecha').dia === null);

  // El reparto, con las dos formas reales: cobrar manda cadenas, pagar numeros.
  {
    const filas = [
      { balance: '1000.00', dueDate: '2026-09-12' },
      { balance: '2000.00', dueDate: '2026-09-11' },
      { balance: '3000.00', dueDate: '2026-08-13' },
      { balance: '4000.00', dueDate: '2026-08-12' },
      { balance: '5000.00', dueDate: '2026-06-13' },
      { balance: '0.00', dueDate: '2020-01-01' },
    ];
    const s = hay ? V.repartirEnTramos(filas, (f: any) => Number(f.balance), (f: any) => f.dueDate, H) : null;
    ok('el reparto pone cada saldo en su tramo',
      !!s && s['por-vencer'] === 1000 && s['1-30'] === 5000
      && s['31-60'] === 4000 && s['61-90'] === 0 && s['90+'] === 5000 && s['saldado'] === 0);
    ok('lo vencido es la suma de los cuatro tramos de atraso',
      !!s && V.sumaVencida(s) === 14000
      && V.sumaVencida(V.repartirEnTramos([], () => 0, () => null, H)) === 0);
  }

  // ── y ahora, que nadie conserve cortes propios ──
  const CORTES = /<=\s*30\b|<=\s*60\b|<=\s*90\b|>\s*90\b|>\s*60\b|>\s*30\b/;

  for (const [etiqueta, ruta] of USUARIOS) {
    const src = leer(ruta);

    ok(`${etiqueta}: usa el modulo de vencimiento`,
      src.includes("from '@/services/cartera/vencimiento'")
      || src.includes("from './vencimiento'"));

    // Mientras alguno guarde sus propios cortes, pueden volver a divergir.
    // Solo a los cinco que los tenian: en `documentos.ts` seria vacio.
    if (ruta.includes('cartera/documentos')) continue;
    ok(`${etiqueta}: no conserva cortes de tramos propios`,
      src.length > 0 && !CORTES.test(src));
  }

  {
    const fr = leer('src/repositories/financialRepository.ts');

    ok('financialRepository ya no construye un Date de un vencimiento',
      fr.length > 0 && !/new Date\([^)]*dueDate/.test(fr));

    // Era el unico que redondeaba hacia arriba sobre una resta de milisegundos,
    // y con la diferencia fraccionada daba un tramo distinto que los otros
    // cinco calculos de lo mismo.
    //
    // Prohibir `Math.ceil` en todo el fichero seria pasarse: queda uno
    // legitimo, la antiguedad del cliente desde su `createdAt`, que es una
    // MARCA DE TIEMPO -- ahi la duracion es real y redondear hacia arriba es
    // una decision, no un fallo. Lo que no puede volver es sobre un
    // vencimiento.
    // Mirar linea a linea no valia: el `Math.ceil` estaba en una linea y el
    // `due` en la de arriba, asi que esta comprobacion salia verde contra el
    // arbol anterior. Se ancla en la variable que ese calculo producia: si
    // `diffDays` ha desaparecido del fichero, el calculo a mano tambien.
    ok('financialRepository ya no cuenta los dias por su cuenta',
      fr.length > 0 && !fr.includes('diffDays') && !fr.includes('diffTime'));
  }

  {
    const m = leer(MODULO);
    // Los cortes viven aqui y en ningun otro sitio. Si esta lista deja de ser
    // la unica, lo de arriba deja de significar nada.
    ok('los cortes viven en el modulo, en una sola tabla',
      veces(m, "[30, '1-30']") === 1 && veces(m, "[60, '31-60']") === 1
      && veces(m, "[90, '61-90']") === 1);
  }

  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
  return fallos === 0 ? 0 : 1;
}

main().then(c => process.exit(c), e => { console.error(e); process.exit(2); });
