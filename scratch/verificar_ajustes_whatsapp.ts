/**
 * Lote 187 -- el ajuste de los avisos por WhatsApp se encuentra, y guardar
 * refleja lo GUARDADO.
 *
 * DOS COSAS, LAS DOS REPORTADAS POR EL DUEÑO (2026-09-24)
 * ------------------------------------------------------
 *
 * 1. "¿EN QUE PARTE SE CONFIGURA EL NUMERO?" -- y la respuesta era vergonzosa:
 *    dentro de la tarjeta "Configuracion de Codigos de Barra". El lote 178 lo
 *    metio ahi porque aquella rejilla de tres columnas tenia un hueco libre; o
 *    sea, por comodidad al escribir el codigo, no por criterio. Un ajuste que no
 *    se encuentra es un ajuste que no existe. Pasa a su propia tarjeta, con una
 *    explicacion de que llega y que no.
 *
 *    Y con algo que faltaba: LA PANTALLA DICE SI EL SISTEMA PUEDE MANDAR. El
 *    numero se configura aqui, pero para que un aviso salga hacen falta dos
 *    variables de entorno que se ponen en Vercel y que no se ven desde la
 *    aplicacion. Sin este aviso, alguien configura el numero, se queda
 *    tranquilo, y los avisos no salen nunca: el fallo se registra y no lo mira
 *    nadie. Es exactamente lo que pasaba el 2026-09-24 con
 *    `KAPSO_PLANTILLA_AVISO`, que ni yo pude comprobar porque Vercel la
 *    enmascara. El motivo nombra la VARIABLE, nunca su valor.
 *
 * 2. "QUE AL GUARDAR LA PAGINA ADQUIERA LOS DATOS NUEVOS CORRECTAMENTE."
 *    `handleSave` no releia nada: la pantalla se quedaba con lo ESCRITO, no con
 *    lo GUARDADO. Y no son lo mismo -- el servidor recorta espacios, convierte
 *    un campo vacio en nulo y puede rechazar un valor --, asi que lo que se veia
 *    podia no ser lo que habia en la base, sin ninguna señal. Ahora se llama a
 *    `fetchSettings()` despues de guardar.
 *
 * SE LEE DEL CODIGO, no se ejecuta: es una pantalla. Lo que si se ejecuta es la
 * regla de la ruta, que ya tiene su banco en `verificar_avisos_whatsapp.ts`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

/**
 * Las clases del envoltorio del bloque de WhatsApp.
 *
 * Es donde vive su separacion de la tarjeta padre: el margen va en el `div`
 * exterior y el relleno en el interior. Se mira el trozo de codigo que precede
 * al titulo, que es donde estan los dos.
 */
const tarjetaSeparacion = (codigo: string): string => {
  const i = codigo.indexOf('Avisos por WhatsApp');
  if (i < 0) return '';
  return codigo.slice(Math.max(0, i - 400), i);
};

const PANTALLA = 'src/app/dashboard/settings/page.tsx';
const RUTA = 'src/app/api/v1/admin/settings/route.ts';
const CLIENTE = 'src/services/avisos/whatsappKapso.ts';

async function main() {
  const pantalla = leer(PANTALLA);
  const ruta = leer(RUTA);

  // Valen en los DOS estados: el campo y su guardado son del lote 178/184.
  if (!/formData\.whatsappAvisos/.test(pantalla)) {
    throw new Error('Precondicion: la pantalla ya no tiene el campo del numero');
  }
  if (!/settingsUpdate\.whatsappAvisos = /.test(ruta)) {
    throw new Error('Precondicion: la ruta ya no guarda el numero');
  }
  if (!/export function motivoParaNoMandar/.test(leer(CLIENTE))) {
    throw new Error('Precondicion: ya no existe la regla que dice por que no se puede mandar');
  }
  if (!/const fetchSettings|async function fetchSettings/.test(pantalla)) {
    throw new Error('Precondicion: la pantalla ya no tiene de donde releer los ajustes');
  }
  console.log('  pre   el campo, su guardado, la regla de envio y el lector de ajustes siguen en pie');

  const codigo = sinComentarios(pantalla);

  console.log('\n1) El ajuste se encuentra\n');

  // Lo que estaba mal: el campo DENTRO del bloque de codigos de barra. Ese bloque
  // ya no es una tarjeta suelta ni se llama igual (paso a `h4` dentro de
  // Parametros Operativos), asi que se busca por el titulo que tiene HOY.
  const bloqueBarras = (() => {
    const i = codigo.indexOf('Códigos de Barra');
    if (i < 0) return '';
    return codigo.slice(i, i + 3000);
  })();
  ok('el numero YA NO esta en el bloque de codigos de barra',
    bloqueBarras !== '' && !/whatsappAvisos/.test(bloqueBarras));

  //  EL ORDEN DE LOS BLOQUES, pedido por el dueño: la identidad primero, la
  //  integracion con mSeller despues y los parametros operativos al final. No es
  //  capricho: se leen de arriba abajo la primera vez que alguien configura una
  //  empresa, y los codigos de barra -- que son de PRODUCTOS -- estaban al mismo
  //  nivel que la identidad fiscal.
  const pos = (t: string) => codigo.indexOf(t);
  ok('el orden es identidad, mSeller, parametros',
    pos('Identidad Fiscal') < pos('Integración mSeller API')
    && pos('Integración mSeller API') < pos('Parámetros Operativos'),
    `${pos('Identidad Fiscal')} / ${pos('Integración mSeller API')} / ${pos('Parámetros Operativos')}`);
  ok('los codigos de barra van DENTRO de parametros operativos, no sueltos',
    pos('Parámetros Operativos') < pos('Códigos de Barra')
    && !/<h3[^>]*>Configuración de Códigos de Barra<\/h3>/.test(codigo));
  ok('  y dice que pertenecen a la configuracion de productos',
    /de los <strong>productos<\/strong>/.test(codigo));
  //  LOTE 187, segunda vuelta: el dueño lo quiso DENTRO de "Identidad Fiscal",
  //  debajo del logo. Asi que ya no es una tarjeta hermana sino un bloque
  //  anidado, y su titulo es `h4` -- pedir `h3` era fijar la FORMA. Lo que
  //  importa: que tenga titulo propio, que este donde se pidio, y que NO quede
  //  pegado a la tarjeta padre.
  ok('tiene titulo propio', /<h[34][^>]*>Avisos por WhatsApp<\/h[34]>/.test(codigo));
  ok('  esta dentro de Identidad Fiscal, no en otra tarjeta',
    codigo.indexOf('Identidad Fiscal') < codigo.indexOf('Avisos por WhatsApp')
    && codigo.indexOf('Avisos por WhatsApp') < codigo.indexOf('Parámetros Operativos'));
  ok('  y debajo del logo', codigo.indexOf('Logo de la Empresa') < codigo.indexOf('Avisos por WhatsApp'));
  //  La separacion es lo que pidio el dueño con nombre y apellido: sin ella el
  //  bloque parece un campo mas de la identidad de la empresa.
  const envoltorio = tarjetaSeparacion(codigo);
  ok('  separado de la tarjeta padre por un margen', /mt-6/.test(envoltorio), envoltorio.trim().slice(-70));
  ok('  y con su propio borde y relleno', /rounded-xl border[^"]*p-4/.test(envoltorio));

  //  TODO LO QUE SIGUE SE MIRA DENTRO DE ESA TARJETA, no en la pantalla entera.
  //  Cinco comprobaciones sobrevivieron a la contraprueba por mirar el fichero
  //  completo: los textos existian ya (en la tarjeta equivocada), y
  //  `indexOf('Avisos por WhatsApp')` vale -1 cuando la tarjeta no existe, asi
  //  que "el campo esta despues" era cierto DE BALDE. Acotar es lo que las
  //  convierte en comprobaciones de verdad.
  const tarjetaWhatsApp = (() => {
    const i = codigo.indexOf('Avisos por WhatsApp');
    if (i < 0) return '';
    //  Hasta el cierre de su tarjeta: el siguiente bloque de la pantalla.
    const j = codigo.indexOf('activeTab === ', i);
    return codigo.slice(i, j > -1 ? j : codigo.length);
  })();
  ok('  y el campo vive dentro de ella',
    tarjetaWhatsApp !== '' && /formData\.whatsappAvisos/.test(tarjetaWhatsApp));

  // Que llega y que no: sin esto, nadie sabe si esperar un aviso de cada cosa.
  ok('dice que llegan los graves y de advertencia', /graves y de advertencia/.test(tarjetaWhatsApp));
  ok('  y que los informativos no', /informativos no se env/.test(tarjetaWhatsApp));
  ok('  que vacio significa no recibir ninguno', /vac[ií]o para no recibir ninguno/i.test(tarjetaWhatsApp));
  ok('  que cada aviso se manda una sola vez', /una sola vez/.test(tarjetaWhatsApp));
  ok('  y que el numero es de ESTA empresa', /de esta empresa/i.test(tarjetaWhatsApp));

  console.log('\n2) La pantalla dice si el sistema puede mandar\n');

  // El servidor es quien lo sabe: el navegador no ve el entorno de Vercel.
  ok('la ruta calcula el motivo con la regla, no con una copia',
    /motivoParaNoMandar\(\)/.test(sinComentarios(ruta))
    && /from '@\/services\/avisos\/whatsappKapso'/.test(ruta));
  ok('  y lo devuelve en los ajustes',
    /whatsappMotivo,/.test(sinComentarios(ruta)) && /whatsappPuedeMandar: whatsappMotivo === null/.test(sinComentarios(ruta)));
  // El motivo nombra la variable que falta; su VALOR no sale de aqui.
  //  Negativa ATADA a la marca positiva: sola es cierta de balde en la
  //  contraprueba, donde la ruta no menciona ninguna variable de Kapso.
  ok('  sin sacar el valor de ninguna variable',
    /motivoParaNoMandar\(/.test(sinComentarios(ruta))
    && !/process\.env\.KAPSO_API_KEY/.test(sinComentarios(ruta)));
  ok('la pantalla lo lee y lo guarda en su estado',
    /setWhatsappMotivo\(data\.data\.settings\.whatsappMotivo/.test(codigo));
  ok('  y lo enseña cuando NO se puede mandar',
    /El sistema no puede enviar todav[ií]a/.test(codigo) && /\{whatsappMotivo \?/.test(codigo));
  ok('  diciendo que el numero se guarda pero no llega nada',
    /se guarda pero no llega ning[uú]n aviso/.test(codigo));
  ok('  y confirma cuando SI se puede', /configurado para enviar por WhatsApp/.test(codigo));

  console.log('\n3) Guardar releva lo GUARDADO, no lo escrito\n');

  //  ANCLADO EXACTO, no `indexOf('const handleSave')`: antes de `handleSave` hay
  //  `handleSaveType` y `handleSaveMappings`, y ese `indexOf` cazaba el primero
  //  -- la rebanada era de OTRA funcion y las comprobaciones fallaban sin que
  //  faltara nada. Es la trampa del `indexOf` que este repositorio lleva
  //  anotada tres veces.
  const bloqueGuardar = (() => {
    const i = codigo.indexOf('const handleSave = async (e: React.FormEvent)');
    if (i < 0) return '';
    return codigo.slice(i, codigo.indexOf('};', codigo.indexOf('finally', i)));
  })();
  if (bloqueGuardar === '') throw new Error('Precondicion: no se encuentra handleSave en la pantalla');
  ok('al guardar se vuelve a leer del servidor',
    /await fetchSettings\(\);/.test(bloqueGuardar));
  // Despues de avisar de que salio bien: releer antes de saber si se guardo
  // traeria los datos viejos.
  ok('  despues de confirmar que se guardo',
    bloqueGuardar.indexOf('await fetchSettings()') > bloqueGuardar.indexOf('if (data.success)'));
  // `location.reload()` tambien traeria los datos, pero perdiendo la pestaña en
  // la que estas y parpadeando. Y no hace falta.
  //  Igual: sin la marca positiva, "no recarga" es cierto de balde antes del
  //  lote, cuando no se recargaba NADA.
  ok('  sin recargar la pagina entera',
    /await fetchSettings\(\);/.test(bloqueGuardar) && !/location\.reload/.test(codigo));
  // Y lo que NO va en el formulario tambien se refresca: el motivo del envio.
  ok('  con lo que refresca tambien lo que no se envio (el motivo)',
    codigo.indexOf('setWhatsappMotivo') < codigo.indexOf('const handleSave')
    && /await fetchSettings\(\);/.test(bloqueGuardar));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
