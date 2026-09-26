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

async function main() {
  const pantalla = leer(PANTALLA);
  const ruta = leer(RUTA);

  //  LOTE 200: las precondiciones del campo de WhatsApp se fueron con el canal. Lo
  //  que este banco sigue defendiendo es de la pantalla, no del canal: que hay un
  //  ajuste de avisos con su campo, y que guardar RELEE lo guardado.
  if (!/formData\.avisosCorreo/.test(pantalla)) {
    throw new Error('Precondicion: la pantalla ya no tiene el campo de avisos');
  }
  if (!/settingsUpdate\.avisosCorreo = /.test(ruta)) {
    throw new Error('Precondicion: la ruta ya no guarda el ajuste de avisos');
  }
  if (!/const fetchSettings|async function fetchSettings/.test(pantalla)) {
    throw new Error('Precondicion: la pantalla ya no tiene de donde releer los ajustes');
  }
  console.log('  pre   el campo de avisos, su guardado y el lector de ajustes siguen en pie');

  const codigo = sinComentarios(pantalla);

  console.log('\n1) El orden de las tarjetas, y los codigos de barra en su sitio\n');
  //  LOTE 200: aqui habia dos secciones mas -- donde vivia el campo del numero de
  //  WhatsApp (titulo, margen, borde, textos) y si el sistema podia mandar por ese
  //  canal. Las dos se fueron CON EL CANAL, retirado porque nunca entrego un aviso: la
  //  cuenta solo tiene el numero de PRUEBA de Meta y rechaza todo (#131037, medido el
  //  2026-09-26).
  //
  //  Se queda lo que no era del canal y sigue siendo del lote 187: el ORDEN de las
  //  tarjetas que pidio el dueño, los codigos de barra dentro de Parametros Operativos,
  //  y -- abajo -- que guardar relea lo GUARDADO y no lo escrito.
  ok('el orden es identidad, mSeller, parametros',
    codigo.indexOf('Identidad Fiscal') < codigo.indexOf('Integración mSeller API')
    && codigo.indexOf('Integración mSeller API') < codigo.indexOf('Parámetros Operativos'));
  ok('los codigos de barra van DENTRO de parametros operativos, no sueltos',
    codigo.indexOf('Parámetros Operativos') < codigo.indexOf('Códigos de Barra'));
  ok('  y dice que pertenecen a la configuracion de los productos',
    codigo.includes('productos'));

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
