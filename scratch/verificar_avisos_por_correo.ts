/**
 * Lote 200 -- los avisos del panel, por correo.
 *
 * DE DONDE SALE
 * -------------
 * Decision del dueño el 2026-09-26, despues de medir por que no le llegaba ningun
 * aviso por WhatsApp. La cadena de hallazgos de ese dia:
 *
 *   · 196: el motivo del rechazo se tiraba a la basura ("HTTP 422" a secas).
 *   · 197: el panel devolvia 500 y la causa viajaba en `error.cause`, sin leerse.
 *   · 199: el envio se lanzaba con `void` y en serverless **no llegaba a correr**.
 *   · Y con todo eso arreglado, el motivo por fin aparecio, en palabras:
 *
 *       HTTP 400: (#131037) WhatsApp provided number needs display name approval
 *
 *     Medido contra Meta: la cuenta tiene UN solo numero, `+1 555-346-2012`, que es el
 *     de PRUEBA que regala Meta ("WhatsApp **provided** number", lo dice el error). No
 *     manda nada: ni plantilla ni texto libre, con la ventana de 24 h abierta o
 *     cerrada. Se arregla dando de alta un numero propio -- tramite de Meta, no codigo.
 *
 * Asi que el aviso sale por donde SI puede salir hoy: el correo. El SMTP de este
 * sistema funciona (el lote 157 dejo su registro, con filas). El canal de WhatsApp no
 * se toca: queda esperando su numero.
 *
 * LO QUE ESTE BANCO EJECUTA: la decision de que se manda y como se escribe, que es pura.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const SERVICIO = 'src/services/avisos/enviarAvisosPorCorreo.ts';
const RUTA_PANEL = 'src/app/api/v1/dashboard/route.ts';
const RUTA_AJUSTES = 'src/app/api/v1/admin/settings/route.ts';
const PANTALLA = 'src/app/dashboard/settings/page.tsx';
const MIGRACION = 'drizzle/0015_avisos_por_correo.sql';
const SINCRONIZAR = 'src/services/avisos/sincronizarAvisos.ts';

async function main() {
  const panel = leer(RUTA_PANEL);
  const ajustes = leer(RUTA_AJUSTES);
  const pantalla = leer(PANTALLA);

  //  PRECONDICIONES, ciertas en los DOS estados.
  if (panel === '') throw new Error('Precondicion: no esta la ruta del panel');
  if (!/sincronizarAvisos\(/.test(panel)) throw new Error('Precondicion: el panel ya no sincroniza avisos');
  //  LOTE 200, SEGUNDA PARTE: el canal de WhatsApp SE RETIRA en este mismo lote
  //  (decision del dueño el 2026-09-26, tras medir que no puede entregar nada). Lo que
  //  al principio era una precondicion -- "el canal sigue en su sitio" -- es ahora una
  //  comprobacion invertida, en la seccion 5: que no queda ni rastro.
  //
  //  La precondicion que SI vale en los dos estados: que la pantalla de Configuracion
  //  siga teniendo donde poner el destino de los avisos. Si eso desapareciera, este
  //  banco estaria vigilando una cascara.
  if (!/Avisos del sistema|Avisos por WhatsApp/.test(pantalla)) {
    throw new Error('Precondicion: la pantalla ya no tiene el bloque de avisos');
  }
  console.log('  pre   el panel sincroniza y la pantalla tiene su bloque de avisos');

  const codigoPanel = sinComentarios(panel);
  const codigoAjustes = sinComentarios(ajustes);
  const codigoPantalla = sinComentarios(pantalla);
  const servicio = leer(SERVICIO);
  const codigoServicio = sinComentarios(servicio);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) Que se manda y como se escribe, EJECUTADO\n');
  // ───────────────────────────────────────────────────────────────────────────
  let M: typeof import('../src/services/avisos/avisoPorCorreo') | null = null;
  try { M = await import('../src/services/avisos/avisoPorCorreo'); } catch { M = null; }

  const ETIQUETAS = [
    'una direccion utilizable pasa; una que no, no',
    'solo salen los graves y los de advertencia',
    'lo que ya salio no se repite',
    'sin direccion configurada no se manda nada',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe services/avisos/avisoPorCorreo.ts');
  } else {
    const { correoValido, seMandaPorCorreo, asuntoDelAviso, cuerpoDelAviso, avisosQueSeMandanPorCorreo } = M;

    ok(ETIQUETAS[0],
      correoValido(' avisos@miempresa.com ') === 'avisos@miempresa.com'
      && correoValido('sin arroba') === null
      && correoValido('a@b') === null
      && correoValido('') === null
      && correoValido(null) === null);
    //  DOS DIRECCIONES PEGADAS es el error de verdad al escribir esto, y un espacio
    //  dentro es su forma. Y un punto pegado a la arroba deja pasar "a@.com".
    ok('  dos direcciones o un dominio raro no pasan',
      correoValido('uno@a.com dos@b.com') === null
      && correoValido('a@.com') === null
      && correoValido('a@b.') === null
      && correoValido('a@@b.com') === null);

    //  MISMO CRITERIO QUE EL WHATSAPP (lote 178): un comprobante rechazado o una caja
    //  descuadrada salen; un periodo que se acaba dentro de un mes, no.
    ok(ETIQUETAS[1],
      seMandaPorCorreo('invoice_rejected') && seMandaPorCorreo('caja_con_diferencia')
      && seMandaPorCorreo('declaracion_pendiente') && seMandaPorCorreo('check_due')
      && !seMandaPorCorreo('padron_viejo') && !seMandaPorCorreo('periodos_por_agotarse'));

    const aviso = {
      id: 'declaracion-606-202608',
      type: 'declaracion_pendiente',
      title: 'El 606 de agosto no consta presentado',
      description: 'Descárguelo y preséntelo en la Oficina Virtual antes del 15.',
      actionText: 'Ir al 606',
      actionLink: '/dashboard/reports/606?period=202608',
    };
    //  LA EMPRESA VA EN EL ASUNTO: quien administra varias las recibe todas en la misma
    //  bandeja, y "El 606 de agosto" sin decir de quien no se puede ni buscar.
    ok('el asunto dice de que empresa es',
      asuntoDelAviso(aviso, 'Latin Doors S.R.L') === '[Latin Doors S.R.L] El 606 de agosto no consta presentado');
    const cuerpo = cuerpoDelAviso(aviso, 'Latin Doors S.R.L');
    ok('  y el cuerpo lleva el porque y donde atenderlo',
      cuerpo.includes('Oficina Virtual') && cuerpo.includes('/dashboard/reports/606?period=202608')
      && cuerpo.includes('Latin Doors S.R.L'));

    const yaSalio = new Set(['declaracion-606-202608']);
    ok(ETIQUETAS[2],
      avisosQueSeMandanPorCorreo([aviso], 'X', 'a@b.com', yaSalio).length === 0
      && avisosQueSeMandanPorCorreo([aviso], 'X', 'a@b.com', new Set()).length === 1);
    ok(ETIQUETAS[3],
      avisosQueSeMandanPorCorreo([aviso], 'X', null, new Set()).length === 0
      && avisosQueSeMandanPorCorreo([aviso], 'X', 'no es un correo', new Set()).length === 0);
    const salida = avisosQueSeMandanPorCorreo([aviso], 'Latin Doors', 'a@b.com', new Set())[0];
    ok('  y lo que sale lleva destino, asunto, cuerpo y su clave',
      salida?.destino === 'a@b.com' && salida?.clave === 'declaracion-606-202608'
      && (salida?.asunto.length ?? 0) > 0 && (salida?.cuerpo.length ?? 0) > 0);
    //  El correo tiene su propia lista de severidades aunque hoy coincida con la del
    //  WhatsApp: son dos decisiones, y una puede cambiar sin la otra.
    const fuente = leer('src/services/avisos/avisoPorCorreo.ts');
    ok('  la regla es pura: ni SMTP, ni base de datos',
      fuente !== '' && !/nodemailer|getTransporter|@\/db/.test(fuente));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El envio: las cuatro garantias\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  1. NUNCA LANZA: avisar de un problema no puede convertirse en un problema.
  ok('el envio no puede tumbar el panel',
    /catch \(err: unknown\)/.test(codigoServicio) && /return 0;/.test(codigoServicio));
  //  2. MARCA LO QUE SALIO, no lo que se intento.
  ok('marca lo que salio, no lo que se intento',
    /marcarMandadasPorCorreo\(companyId, modo, salieron\)/.test(codigoServicio));
  //  3. Sin direccion, ni una consulta de mas.
  ok('sin direccion configurada no consulta nada mas',
    /if \(!ajustes\?\.correo\) return 0;/.test(codigoServicio));
  //  4. Lo que falla por configuracion no se repite en la misma pasada (lote 196).
  ok('lo que falla por configuracion no se repite cuatro veces',
    /sinIntentar/.test(codigoServicio) && /break;/.test(codigoServicio));
  ok('  y el motivo del fallo se registra completo (lote 197)',
    /motivoDelError\(err\)/.test(codigoServicio));
  //  Sin SMTP se dice UNA vez y con el nombre de la variable, nunca su valor.
  ok('si falta el SMTP se dice, con el nombre de la variable y no su valor',
    /falta SMTP_HOST/.test(servicio) && !/process\.env\.SMTP_PASS\}/.test(servicio));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Enchufado: la ruta, los dos canales y sus marcas separadas\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('el panel manda los avisos por correo',
    /after\(\(\) => enviarAvisosPorCorreo\(/.test(codigoPanel));
  //  CON `after`, no con `void` (lote 199): en serverless un `void` no llega a correr.
  ok('  con `after`, que es lo que sobrevive a la respuesta (lote 199)',
    /after\(\(\) => enviarAvisosPorCorreo\(/.test(codigoPanel)
    && !/void enviarAvisosPorCorreo\(/.test(codigoPanel));
  //  EL CORREO ES EL UNICO CANAL, y tiene SU marca. Estas dos comprobaciones decian
  //  "los dos canales van por separado" mientras el de WhatsApp existia; al retirarlo se
  //  reescriben a lo que ahora es verdad, que no es lo mismo que borrarlas: lo que
  //  defienden -- que la marca del correo sea la suya y no la de otro canal -- es lo que
  //  impide mandar dos veces el mismo aviso.
  const sinc = sinComentarios(leer(SINCRONIZAR));
  ok('el correo es el unico canal que manda',
    /after\(\(\) => enviarAvisosPorCorreo\(/.test(codigoPanel)
    && !/enviarAvisosPendientes/.test(codigoPanel));
  ok('  y lleva SU marca, no la del canal retirado',
    /marcarMandadasPorCorreo/.test(sinc) && /clavesYaMandadasPorCorreo/.test(sinc)
    && !/marcarMandadasPorWhatsApp|clavesYaMandadasPorWhatsApp/.test(sinc));
  //  Y al reabrirse un aviso cerrado se limpia la marca DEL CORREO, no otra: si se
  //  limpiara la del canal retirado, un aviso que vuelve no se volveria a mandar.
  ok('  al reabrirse un aviso, se limpia la marca del correo',
    /correoEnviadoAt: sql`case when/.test(sinc));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) El ajuste llega hasta la columna (el defecto del lote 178)\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  EL PARAMETRO SORDO. En el lote 178 el campo estaba en el esquema de validacion, en
  //  el GET y en la pantalla, y el PATCH **no lo escribia**: nada fallaba, el valor se
  //  perdia al guardar y los avisos no llegaban nunca. Se comprueban los seis sitios.
  ok('1/6 el esquema de la base tiene la columna',
    /avisosCorreo: varchar\('avisos_correo'/.test(leer('src/db/schema/companies.ts')));
  ok('2/6 la validacion lo acepta', /avisosCorreo: z\.string\(\)/.test(codigoAjustes));
  ok('3/6 el GET lo devuelve', /avisosCorreo: companySettings\.avisosCorreo/.test(codigoAjustes));
  ok('4/6 se saca del cuerpo de la peticion', /\n?\s*avisosCorreo\s*\n?\s*\} = parsed\.data/.test(codigoAjustes));
  ok('5/6 una direccion inutilizable se RECHAZA, no se guarda',
    /!correoValido\(avisosCorreo\)/.test(codigoAjustes) && /status: 400/.test(codigoAjustes));
  //  ESTE es el que faltaba en el 178.
  ok('6/6 Y SE ESCRIBE EN LA COLUMNA (el sitio que se olvido en el 178)',
    /settingsUpdate\.avisosCorreo = avisosCorreo/.test(codigoAjustes));
  //  Vacio es un valor: "esta empresa no recibe avisos por correo".
  ok('  y vaciarlo desactiva el canal, en vez de dejarlo como estaba',
    /settingsUpdate\.avisosCorreo = avisosCorreo && avisosCorreo\.trim\(\) !== '' \? avisosCorreo\.trim\(\) : null/.test(codigoAjustes));

  ok('la pantalla tiene el campo, y avisa mientras se escribe',
    /formData\.avisosCorreo/.test(codigoPantalla) && /correoValido\(formData\.avisosCorreo\)/.test(codigoPantalla));
  ok('  y carga lo que hay guardado',
    /avisosCorreo: data\.data\.settings\.avisosCorreo/.test(codigoPantalla));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) La migracion, y lo que este lote NO hace\n');
  // ───────────────────────────────────────────────────────────────────────────
  const migracion = leer(MIGRACION);
  ok('hay migracion con las dos columnas',
    /ADD COLUMN IF NOT EXISTS "avisos_correo"/.test(migracion)
    && /ADD COLUMN IF NOT EXISTS "correo_enviado_at"/.test(migracion));
  //  Solo añade columnas: una migracion que no quita nada se puede aplicar con el
  //  sistema en marcha.
  //  ATADA AL POSITIVO: sin migracion, "no borra nada" es cierto de balde.
  ok('  y solo añade: no borra ni cambia nada existente',
    /ADD COLUMN IF NOT EXISTS "avisos_correo"/.test(migracion)
    && !/DROP|ALTER COLUMN|DELETE|UPDATE /i.test(migracion.replace(/--[^\n]*/g, '')));
  //  EL CANAL DE WHATSAPP, RETIRADO. No queda codigo que lo mande ni campo que lo
  //  configure. Estuvo desde el lote 178 y nunca entrego un aviso en produccion: la
  //  cuenta solo tiene el numero de PRUEBA que regala Meta y rechaza todo lo que salga de
  //  el (#131037), y para arreglarlo habia que dar de alta un numero propio de la
  //  empresa -- tramite de Meta, no codigo.
  const RETIRADOS = [
    'src/services/avisos/whatsappKapso.ts',
    'src/services/avisos/enviarAvisosPendientes.ts',
    'src/services/avisos/plantillaDeAviso.ts',
    'src/services/avisos/avisoPorWhatsApp.ts',
    'src/services/avisos/rechazoDeWhatsApp.ts',
  ];
  const quedan = RETIRADOS.filter((f) => existsSync(join(raiz, f)));
  ok('el canal de WhatsApp se retiro: no queda ni un fichero',
    quedan.length === 0, quedan.join(' · ') || `${RETIRADOS.length} ficheros fuera`);
  //  Y NADIE LO IMPORTA. Un fichero borrado con una referencia viva es lo que tumbo el
  //  despliegue del lote 198: compila en local y revienta en el servidor.
  ok('  y nadie lo importa: ni la ruta, ni los ajustes, ni la pantalla',
    !/avisoPorWhatsApp|whatsappKapso|enviarAvisosPendientes|plantillaDeAviso|rechazoDeWhatsApp/
      .test(codigoPanel + codigoAjustes + codigoPantalla));
  //  LAS COLUMNAS SE QUEDAN, con su dato. Mismo criterio que el lote 107 con `voided_by`:
  //  borrar una columna con historia es irreversible, y hay un aviso que si salio por ahi
  //  el 24/09. Si algun dia vuelve el canal, el dato esta.
  ok('  pero la columna con su historia NO se borra',
    !/DROP COLUMN/i.test(migracion)
    && /whatsappEnviadoAt/.test(leer('src/db/schema/system.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
