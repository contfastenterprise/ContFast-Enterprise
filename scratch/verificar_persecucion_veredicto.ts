/**
 * Banco del lote 102: la factura persigue su propio veredicto.
 *
 *     pnpm exec tsx scratch/verificar_persecucion_veredicto.ts
 *
 * EL PROBLEMA, MEDIDO
 * -------------------
 * Las 30 ultimas filas de `dgii_submissions` traen TODAS `securityCode` y
 * `qr_url`: mSeller devuelve la firma en el acto. Lo que no llega en el acto es
 * el veredicto de la DGII. Asi que la factura se puede imprimir ya -- la
 * representacion impresa solo necesita firma y QR -- pero se quedaba en
 * "Enviado" en pantalla hasta que una persona pulsaba sincronizar.
 *
 * Y el barrido automatico no lo arreglaba porque NADIE LO LLAMA: el cron es una
 * ruta que espera que algo de fuera la despierte, y aqui no hay quien lo haga.
 *
 * LO QUE HACE ESTE LOTE
 * ---------------------
 * Al emitir, si el veredicto no vino, se encola una consulta a los 2 segundos,
 * y otra despues, con los huecos creciendo, hasta rendirse a los ~9 minutos y
 * dejarlo para el barrido.
 *
 * LAS DOS TRAMPAS
 * ---------------
 * 1. El worker de la cola `dgii-submissions` IGNORA el nombre del trabajo y
 *    siempre llama a `processDgiiSubmissionJob`, que EMITE. Encolar ahi una
 *    consulta habria reemitido el comprobante una vez por intento. Por eso la
 *    persecucion tiene cola propia, `dgii-estado`.
 * 2. El camino sin Redis ejecutaba siempre con retraso CERO, tirando el que
 *    pidiera quien encolaba. Con una escalera de esperas eso significa los ocho
 *    intentos de golpe.
 *
 * POR QUE LA PARTE A EJECUTA
 * --------------------------
 * La escalera es una politica -- unos numeros y una regla -- y vive aparte en
 * `escalera.ts` justamente para poder correrla sin levantar base de datos ni
 * cola. El resto se comprueba sobre el fuente: perseguir de verdad pediria una
 * base, mSeller al otro lado y una factura emitida.
 *
 * Y `escalera.ts` se carga A MANO, dentro, no con un `import` de arriba: lo
 * CREA este lote, asi que con un import normal la contraprueba -- correr este
 * banco sobre los fuentes sin tocar -- moria al cargar con "Cannot find
 * module" antes de comprobar nada. Reventar no es fallar.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

const PER = 'src/services/dgii/perseguirVeredicto.ts';
const ESC = 'src/services/dgii/escalera.ts';
const COLA = 'src/infrastructure/queue.ts';
const WRK = 'src/infrastructure/worker.ts';
const BOO = 'src/services/invoice/invoiceDbBooker.ts';
const JOB = 'src/infrastructure/jobRunners.ts';
const SIN = 'src/services/dgii/sincronizarPendientes.ts';

function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
/** ¿Nombra este fichero ese identificador ENTERO? `includes` es trampa de prefijo. */
function nombra(f: string, id: string): boolean {
  return new RegExp(`\\b${id}\\b`).test(codigo(f));
}

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
for (const f of [COLA, WRK, BOO, JOB, SIN]) {
  exige(crudo(f).length > 1000, `No se pudo leer ${f}. Revisa desde donde se corre.`);
}

//  LA RAZON DE SER DE LA COLA APARTE. Si el worker de `dgii-submissions`
//  dejara de emitir siempre, todo el razonamiento de este lote cambia.
//  La LLAMADA, no el nombre: `processDgiiSubmissionJob` esta tambien en el
//  import de arriba, asi que buscarlo suelto daba OK aunque el worker hubiera
//  dejado de llamarlo.
exige(codigo(WRK).includes("'dgii-submissions',") && codigo(WRK).includes('processDgiiSubmissionJob({'),
      'el worker de dgii-submissions ya no llama a processDgiiSubmissionJob: revisar por que hacia falta otra cola');
exige(!/dgii-submissions[\s\S]{0,400}job\.name/.test(codigo(WRK)),
      'el worker de dgii-submissions ahora mira job.name: el motivo de la cola aparte cambia');

//  El barrido sigue mirando SOLO lo que se envio y espera veredicto. Si eso
//  cambiara, acotarlo a una factura dejaria de ser seguro.
exige(codigo(SIN).includes("eq(invoices.status, 'submitted')"),
      'sincronizarPendientes ya no filtra por submitted');

//  Y sigue siendo una CONSULTA: nada de reenviar.
exige(!nombra(SIN, 'sendDocument'), 'sincronizarPendientes ha empezado a enviar documentos');
exige(!nombra(PER, 'sendDocument'), 'la persecucion ha empezado a enviar documentos');

type Escalera = typeof import('../src/services/dgii/escalera');

async function main(): Promise<void> {
  let E: Escalera | null = null;
  try {
    E = (await import('../src/services/dgii/escalera')) as Escalera;
  } catch {
    E = null;
  }

  /** Como `ok`, pero si el modulo no existe la comprobacion falla sin ejecutarse. */
  function okA(t: string, prueba: () => boolean): void {
    if (!E) { ok(`${t}  [no existe escalera.ts]`, false); return; }
    let r = false;
    try { r = prueba(); } catch (e) { console.log(`        ${(e as Error).message}`); }
    ok(t, r);
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('A. LA ESCALERA, CORRIENDOLA');
  // ───────────────────────────────────────────────────────────────────────
  okA('empieza a los 2 segundos, que es lo pedido', () => E!.ESCALERA_MS[0] === 2_000);
  okA('son ocho peldaños', () => E!.ESCALERA_MS.length === 8);
  okA('y cada uno espera MAS que el anterior',
      () => E!.ESCALERA_MS.every((v, i) => i === 0 || v > E!.ESCALERA_MS[i - 1]));
  okA('cubre entre 8 y 15 minutos: ni un suspiro ni una tarde',
      () => E!.alcanceTotalMs() >= 8 * 60_000 && E!.alcanceTotalMs() <= 15 * 60_000);
  okA('la mitad de los intentos caen en el primer medio minuto, que es donde se resuelve',
      () => E!.ESCALERA_MS.filter(
        (_, i) => E!.ESCALERA_MS.slice(0, i + 1).reduce((a, b) => a + b, 0) <= 30_000
      ).length >= 4);
  okA('pasado el ultimo peldaño ya no hay hueco: la escalera se acaba',
      () => E!.huecoDelIntento(E!.ESCALERA_MS.length) === null);
  okA('y un intento absurdo tampoco devuelve nada',
      () => E!.huecoDelIntento(-1) === null && E!.huecoDelIntento(1.5) === null);
  okA('el primer peldaño es el que devuelve huecoDelIntento(0)',
      () => E!.huecoDelIntento(0) === E!.ESCALERA_MS[0]);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('B. COLA PROPIA: NO SE REEMITE NADA');
  // ─────────────────────────────────────────────────────────────────────────
  ok('existe la cola dgii-estado', codigo(COLA).includes("new Queue('dgii-estado'"));
  ok('con su tipo de trabajo', codigo(COLA).includes("'dgii-estado': {") && codigo(COLA).includes('intento: number'));
  ok('y su rama al encolar', codigo(COLA).includes("queueName === 'dgii-estado' && estadoQueue"));
  ok('el worker de dgii-estado consulta, no emite',
     codigo(WRK).includes("'dgii-estado',") && nombra(WRK, 'perseguirVeredicto'));
  //  Una negacion a secas es cierta gratis mientras el worker no exista, y en
  //  la contraprueba daba OK sin distinguir nada. Se ata a que el worker ESTE:
  //  lo que se fija es "existe y no emite", no "no emite".
  ok('y no llama a processDgiiSubmissionJob',
     codigo(WRK).includes("'dgii-estado',")
     && !/'dgii-estado',[\s\S]{0,700}processDgiiSubmissionJob/.test(codigo(WRK)));
  ok('la persecucion encola en dgii-estado, nunca en dgii-submissions',
     codigo(PER).includes("'dgii-estado'") && !codigo(PER).includes("'dgii-submissions'"));
  ok('queda escrito POR QUE hace falta otra cola',
     crudo(PER).includes('ignora el nombre del trabajo') || crudo(COLA).includes('IGNORA el nombre del trabajo'));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('C. SIN REDIS, LOS RETRASOS SE RESPETAN');
  // ─────────────────────────────────────────────────────────────────────────
  ok('el camino sin Redis recibe el retraso',
     codigo(COLA).includes('data: JobPayloads[K],') && codigo(COLA).includes('delay = 0'));
  ok('y lo usa en vez de ejecutar de golpe', codigo(COLA).includes('}, delay);'));
  ok('los tres sitios que caen al camino sin Redis se lo pasan',
     (codigo(COLA).match(/triggerFallback\(queueName, name, data, opts\.delay\)/g) ?? []).length === 3);
  ok('y ese camino sabe atender la cola nueva',
     /dgii-estado'[\s\S]{0,200}perseguirVeredicto/.test(codigo(COLA)));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('D. EL ENGANCHE, DESPUES DEL COMMIT Y SOLO SI HACE FALTA');
  // ─────────────────────────────────────────────────────────────────────────
  //  No basta con que el NOMBRE aparezca: un tapon local
  //  (`const empezarAPerseguir = async () => null`) lo deja estando y no
  //  persigue nada. Lo que se fija es que se importe el modulo de verdad Y que
  //  se llame.
  ok('la emision directa arranca la persecucion',
     codigo(BOO).includes("await import('@/services/dgii/perseguirVeredicto')")
     && codigo(BOO).includes('await empezarAPerseguir({'));
  ok('solo cuando quedo en submitted',
     codigo(BOO).includes("if (submission.finalStatus === 'submitted') {"));

  //  El orden es lo que importa: dentro de la transaccion, un trabajo que
  //  arranque a los 2 s leeria una factura que todavia no existe para el.
  //  `lastIndexOf('    });')` era inservible: encuentra el ULTIMO de todo el
  //  fichero, que esta muy por detras de este metodo. Se ancla en el `return`
  //  que cierra la transaccion de ESTE metodo y se mide desde ahi.
  ok('y FUERA de la transaccion, no dentro',
     (() => {
       const t = codigo(BOO);
       const dentro = t.indexOf('msellerResponse: submission.msellerResponsePayload');
       if (dentro < 0) return false;
       const cierraLaTransaccion = t.indexOf('});', dentro);
       const enganche = t.indexOf("if (submission.finalStatus === 'submitted') {");
       return cierraLaTransaccion > 0 && enganche > cierraLaTransaccion;
     })());
  ok('y el resultado se devuelve despues, no antes',
     codigo(BOO).includes('const resultado = await db.transaction')
     && codigo(BOO).includes('return resultado;'));
  ok('se explica por que va fuera', crudo(BOO).includes('antes del COMMIT'));
  //  Buscar `catch` a secas daba OK aunque se quitara el `try` -- la palabra
  //  seguia en el fichero, roto y todo. Se exige la forma entera.
  ok('y si no se puede encolar, la emision NO se cae',
     /try \{[\s\S]{0,300}empezarAPerseguir[\s\S]{0,400}\} catch/.test(codigo(BOO)));

  ok('el envio en diferido tambien persigue',
     codigo(JOB).includes("await import('@/services/dgii/perseguirVeredicto')")
     && codigo(JOB).includes('await empezarAPerseguir({'));
  ok('y tambien solo cuando quedo en submitted',
     codigo(JOB).includes("if (newStatus === 'submitted') {"));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('E. UNA SOLA LOGICA DE VEREDICTO, ACOTADA');
  // ─────────────────────────────────────────────────────────────────────────
  ok('el barrido acepta un filtro', codigo(SIN).includes('FiltroSincronizacion'));
  ok('que sabe acotar a una factura', codigo(SIN).includes('eq(invoices.id, filtro.invoiceId)'));
  ok('y a empresa y modo', codigo(SIN).includes('eq(invoices.companyId, filtro.companyId)')
     && codigo(SIN).includes('eq(invoices.modo, filtro.modo)'));
  ok('con una factura concreta, el limite de antiguedad no estorba',
     codigo(SIN).includes('filtro.invoiceId ? [] : [gte(invoices.createdAt, desde)]'));
  ok('la persecucion NO reescribe la lectura del estado: llama al barrido',
     nombra(PER, 'sincronizarPendientes') && !nombra(PER, 'leerEstado'));
  ok('y queda escrito por que no se copio', crudo(SIN).includes('CUARTA copia'));

  ok('antes de molestar a mSeller mira si ya hay veredicto',
     codigo(PER).includes("factura.estado !== 'submitted'"));
  //  Igual: sin el fichero, la negacion es cierta y no prueba nada. Primero
  //  tiene que EXISTIR el aviso de que la escalera se agoto; entonces si
  //  importa que detras no haya un UPDATE.
  ok('agotar la escalera no marca la factura de ninguna forma',
     crudo(PER).includes('se agoto la escalera')
     && !/se agoto la escalera[\s\S]{0,300}db\s*\n?\s*\.update/.test(codigo(PER)));

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
