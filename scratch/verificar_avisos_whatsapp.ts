/**
 * Lote 178 -- los avisos del panel llegan al WhatsApp de la empresa.
 *
 * POR QUE
 * -------
 * Los avisos existen desde el lote 158 y se guardan desde el 160, pero solo
 * los ve quien ABRE el panel. Un cheque que se cobra mañana, una caja con
 * diferencia o el 606 que vence el dia 15 no esperan a que alguien entre.
 *
 * VERIFICADO CONTRA LA API DE VERDAD el 2026-09-21: la clave responde 200, el
 * numero de LATIN DOORS (+1 555-346-2012) esta CONNECTED y en produccion, y un
 * mensaje de prueba llego al telefono del dueño.
 *
 * LO QUE MAS IMPORTA AQUI ES NO REPETIR. El panel recalcula sus avisos en cada
 * carga: sin la marca de enviado, el mismo cheque se anunciaria cada vez que
 * alguien abre el inicio, y un aviso que se repite es uno que se aprende a
 * ignorar. Esa regla se EJECUTA entera en este banco.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const REGLA = 'src/services/avisos/avisoPorWhatsApp.ts';
const CLIENTE = 'src/services/avisos/whatsappKapso.ts';
const ORQUESTA = 'src/services/avisos/enviarAvisosPendientes.ts';
const SINC = 'src/services/avisos/sincronizarAvisos.ts';
const PANEL = 'src/app/api/v1/dashboard/route.ts';

async function main() {
  // Vale en los dos estados: lo que el lote añade es el envio, no los avisos.
  const sinc = leer(SINC);
  // Vale en los DOS estados: antes del lote la severidad vivia en
  // `sincronizarAvisos`; el lote la baja a `avisoDelPanel.ts`, que no importa
  // la base. Una precondicion que solo valga despues revienta la contraprueba
  // en vez de hacerla fallar comprobacion a comprobacion.
  const PURO = 'src/services/avisos/avisoDelPanel.ts';
  if (![sinc, leer(PURO)].some((f) => /export function severidadDeAviso/.test(f))) {
    throw new Error('Precondicion: nadie clasifica la severidad de los avisos (lote 160)');
  }
  if (!/export async function sincronizarAvisos/.test(sinc)) {
    throw new Error('Precondicion: ya no se guardan los avisos del panel');
  }
  console.log('  pre   los avisos del panel ya se calculan, se guardan y se clasifican');

  console.log('\n1) Que aviso sale y a que numero, ejecutado\n');
  let A: typeof import('../src/services/avisos/avisoPorWhatsApp') | null = null;
  try { A = await import('../src/services/avisos/avisoPorWhatsApp'); } catch { A = null; }

  if (!A) {
    for (const t of [
      'los graves salen',
      'los de advertencia tambien',
      'los informativos no',
      'un numero dominicano de 10 digitos se completa con el 1',
      'un numero a medias NO se manda a nadie',
      'sin numero configurado no sale nada',
      'un aviso ya mandado no se repite',
      'el texto dice de que empresa es',
    ]) falta(t, 'no existe services/avisos/avisoPorWhatsApp.ts');
  } else {
    const { seMandaPorWhatsApp, normalizarNumero, textoDelAviso, avisosQueSeMandan, SEVERIDADES_POR_WHATSAPP } = A;

    // Decision del dueño: graves y de advertencia, no los informativos.
    ok('los graves salen', seMandaPorWhatsApp('invoice_rejected') && seMandaPorWhatsApp('caja_con_diferencia'));
    ok('los de advertencia tambien',
      seMandaPorWhatsApp('check_due') && seMandaPorWhatsApp('caja_sin_cerrar') && seMandaPorWhatsApp('declaracion_pendiente'));
    ok('los informativos no', !seMandaPorWhatsApp('periodos_por_agotarse') && !seMandaPorWhatsApp('lo_que_sea'));
    ok('  y la lista de severidades es la decidida',
      JSON.stringify([...SEVERIDADES_POR_WHATSAPP].sort()) === JSON.stringify(['error', 'warning']),
      SEVERIDADES_POR_WHATSAPP.join(','));

    ok('un numero dominicano de 10 digitos se completa con el 1',
      normalizarNumero('809 555 1234') === '18095551234' && normalizarNumero('(849)555-1234') === '18495551234');
    ok('  y el 829 tambien', normalizarNumero('8292144128') === '18292144128');
    ok('uno que ya trae el codigo de pais se respeta', normalizarNumero('+1 829 214 4128') === '18292144128');
    ok('  y uno de otro pais tambien', normalizarNumero('+34 600 123 456') === '34600123456');
    // Mandar "por si acaso" a un numero a medias es escribirle a un desconocido
    // con los avisos de una empresa.
    ok('un numero a medias NO se manda a nadie',
      normalizarNumero('5551234') === null && normalizarNumero('123') === null);
    ok('  ni un area que no es de RD sin codigo de pais', normalizarNumero('2125551234') === null);
    ok('  ni vacio, ni nulo, ni texto',
      normalizarNumero('') === null && normalizarNumero(null) === null && normalizarNumero('no es un numero') === null);
    ok('  ni uno absurdamente largo', normalizarNumero('1234567890123456789') === null);

    const aviso = { id: 'caja-diferencia-1', type: 'caja_con_diferencia', title: 'Faltan RD$ 500,00 en el arqueo de caja',
      description: 'Se contó menos efectivo del que el sistema esperaba.', actionText: 'x', actionLink: '/y' };
    const texto = textoDelAviso(aviso, 'Latin Doors S.R.L');
    ok('el texto dice de que empresa es', texto.includes('Latin Doors S.R.L'));
    ok('  y lleva el titulo y el porque', texto.includes(aviso.title) && texto.includes(aviso.description));

    const info = { id: 'periodos-PRODUCCION', type: 'periodos_por_agotarse', title: 'p', description: 'd', actionText: 'x', actionLink: '/y' };
    const todos = [aviso, info];

    ok('sin numero configurado no sale nada',
      avisosQueSeMandan(todos, 'X', null, new Set()).length === 0
      && avisosQueSeMandan(todos, 'X', '', new Set()).length === 0);
    ok('  ni con un numero que no se puede dar por bueno',
      avisosQueSeMandan(todos, 'X', '555', new Set()).length === 0);

    const salen = avisosQueSeMandan(todos, 'Latin Doors', '8292144128', new Set());
    ok('sale el grave y no el informativo', salen.length === 1 && salen[0].clave === 'caja-diferencia-1',
      JSON.stringify(salen.map((s) => s.clave)));
    ok('  ya normalizado', salen[0]?.numero === '18292144128', salen[0]?.numero);

    // LA regla: el panel se recalcula en cada carga.
    ok('un aviso ya mandado no se repite',
      avisosQueSeMandan(todos, 'Latin Doors', '8292144128', new Set(['caja-diferencia-1'])).length === 0);
  }

  console.log('\n2) El cliente de Kapso\n');
  const cliente = leer(CLIENTE);
  // Cuatro 404 costo encontrar esto: las dos bases son distintas.
  ok('envia por la base de MENSAJES, no por la de administracion',
    /https:\/\/api\.kapso\.ai\/meta\/whatsapp\/v24\.0/.test(cliente)
    && !/platform\/v1[^']*messages/.test(sinComentarios(cliente)));
  ok('con la cabecera que pide Kapso', /'X-API-Key': process\.env\.KAPSO_API_KEY/.test(cliente));
  ok('el numero que envia es configuracion, no esta escrito', /process\.env\.KAPSO_PHONE_NUMBER_ID/.test(cliente)
    && !/1405968992591205/.test(sinComentarios(cliente)));
  ok('sin configuracion dice QUE falta, en vez de fallar en silencio',
    /falta KAPSO_API_KEY/.test(cliente) && /falta KAPSO_PHONE_NUMBER_ID/.test(cliente));
  // Fuera de la ventana de 24 h Meta exige plantilla; el texto libre solo vale
  // para probar.
  ok('usa plantilla si esta configurada, y texto si no',
    /KAPSO_PLANTILLA_AVISO/.test(cliente) && /type: 'template'/.test(cliente) && /type: 'text'/.test(cliente));
  ok('no deja al panel esperando a WhatsApp', /AbortController/.test(cliente) && /8000/.test(cliente));
  ok('NUNCA lanza: devuelve el motivo', /catch \(err: unknown\)/.test(cliente) && /return \{ enviado: false, motivo/.test(cliente));
  ok('  y guarda el motivo de Meta tal cual', /datos\?\.error\?\.message/.test(cliente));

  console.log('\n3) Cuando se manda, y que se marca\n');
  const orq = leer(ORQUESTA);
  ok('se manda DESPUES de sincronizar, que es cuando se sabe que es nuevo',
    leer(PANEL).indexOf('sincronizarAvisos(') < leer(PANEL).indexOf('enviarAvisosPendientes('));
  ok('  y el panel no espera a que termine', /void enviarAvisosPendientes\(/.test(leer(PANEL)));
  ok('el destino sale de la empresa, no de una variable de entorno',
    /companySettings\.whatsappAvisos/.test(orq) && !/process\.env\.\w*NUMERO/.test(orq));
  ok('sin numero configurado, esa empresa no manda nada', /if \(!ajustes\?\.numero\) return 0;/.test(orq));
  // `.from(companySettings)` y no `companySettings` a secas: a secas lo
  // encuentra en la linea del `import`, que esta antes de todo.
  ok('  y si el sistema no puede mandar, ni se consulta la base',
    /if \(motivoParaNoMandar\(\)\) return 0;/.test(orq)
    && orq.indexOf('motivoParaNoMandar()') < orq.indexOf('.from(companySettings)'));
  // Marcar antes de saber si salio convertiria un fallo de red en un aviso
  // perdido para siempre.
  ok('se marca lo que SALIO, no lo que se intento',
    /if \(r\.enviado\) salieron\.push\(envio\.clave\)/.test(orq)
    && /marcarMandadasPorWhatsApp\(companyId, modo, salieron\)/.test(orq));
  ok('NUNCA lanza: avisar de un problema no puede ser un problema',
    /catch \(err: unknown\)/.test(orq) && /return 0;/.test(orq));

  ok('la marca de enviado vive en la fila del aviso', /whatsappEnviadoAt: timestamp\('whatsapp_enviado_at'\)/.test(leer('src/db/schema/system.ts')));
  ok('  y se lee de la base, no de la memoria del proceso',
    /isNotNull\(notifications\.whatsappEnviadoAt\)/.test(sinc));
  // Un aviso que se cerro y vuelve a aparecer SI es noticia otra vez.
  ok('un aviso que reaparece se puede volver a mandar',
    /case when \$\{notifications\.resolvedAt\} is null then \$\{notifications\.whatsappEnviadoAt\} else null end/.test(sinc));

  // Esto NO se vio al escribir el lote: se vio corriendo la verificacion
  // completa, donde no hay DATABASE_URL. `avisoPorWhatsApp` importaba de
  // `sincronizarAvisos`, que abre la conexion en cuanto se carga, asi que el
  // modulo "sin base ni red" no se podia cargar sin base. Lo que DECIDE
  // tiene que poder cargarse solo.
  const regla = leer(REGLA);
  ok('lo que DECIDE no arrastra la base de datos',
    regla !== '' && !/@\/db/.test(sinComentarios(regla)) && !/from '@\/services\/avisos\/sincronizarAvisos'/.test(sinComentarios(regla)));
  ok('  y la forma del aviso vive en un fichero sin `@/db`',
    /export function severidadDeAviso/.test(leer(PURO)) && !/@\/db/.test(sinComentarios(leer(PURO))));

  console.log('\n4) Se puede configurar desde la pantalla\n');
  const ajustes = leer('src/app/dashboard/settings/page.tsx');
  ok('hay un campo para el numero', /formData\.whatsappAvisos/.test(ajustes));
  ok('  que dice que pasa si se deja vacio', /Déjelo vacío para no recibir ninguno/.test(ajustes));
  const ruta = leer('src/app/api/v1/admin/settings/route.ts');
  ok('la ruta lo acepta y lo devuelve',
    /whatsappAvisos: z\.string\(\)\.max\(20\)/.test(ruta) && /whatsappAvisos: companySettings\.whatsappAvisos/.test(ruta));
  // ESTA comprobacion nacio de un defecto REAL de este mismo lote: el campo
  // estaba en el esquema de validacion y en el GET, la pantalla lo mandaba en
  // el cuerpo... y el PATCH no lo escribia. Es el parametro sordo del lote 135
  // otra vez: nadie falla, el numero se pierde al guardar y los avisos no
  // llegan nunca. Validar que existe no basta; tiene que LLEGAR a la columna.
  ok('  y LO GUARDA (no basta con validarlo)',
    /settingsUpdate\.whatsappAvisos = /.test(ruta) && /whatsappAvisos\s*\} = parsed\.data/.test(ruta));
  // La PROPIEDAD, no la forma (seccion 3): lo que importa es que el caso vacio
  // acabe en `null` -- sin eso no habria forma de APAGAR los avisos desde la
  // pantalla, porque el campo se quedaria con el numero anterior.
  ok('  vacio APAGA los avisos, no deja el numero anterior',
    /settingsUpdate\.whatsappAvisos\s*=\s*[^;]*:\s*null/.test(ruta));
  ok('  un numero que no se puede marcar se rechaza al guardar',
    /!\s*normalizarNumero\([^)]*\)/.test(ruta) && /status:\s*400/.test(ruta));

  console.log('\n5) La migracion\n');
  const mig = leer('drizzle/0013_avisos_por_whatsapp.sql');
  ok('hay migracion 0013', mig.length > 0);
  const sentencias = mig.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
  ok('  y solo AÑADE columnas', sentencias.length === 2 && sentencias.every((s) => /^ALTER TABLE .* ADD COLUMN\b/i.test(s)),
    `${sentencias.length} sentencias`);
  ok('  anotada en el diario', /0013_avisos_por_whatsapp/.test(leer('drizzle/meta/_journal.json')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
