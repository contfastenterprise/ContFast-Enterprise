/**
 * Lote 179 -- el aviso encaja en la plantilla que Meta tiene aprobada.
 *
 * POR QUE
 * -------
 * El lote 178 mandaba el aviso como UN parametro suelto, porque cuando se
 * escribio no habia plantilla. La que se usa es `notificacion_operativa`
 * (es_MX, UTILITY). Cuando se escribio este banco se creia que era
 * `aviso_administrativo` con CINCO huecos y CON NOMBRE:
 *
 *     Hola {{administrador}}, se detectó el siguiente aviso: {{tipo_aviso}}.
 *
 *     Cantidad pendiente: {{cantidad}}
 *     Fecha: {{fecha}}
 *
 *     Revisa la información en {{app_name}}.
 *
 * Meta rechaza el mensaje entero si el numero de parametros no coincide (error
 * 132000) o si uno va vacio, lleva un salto de linea o cuatro espacios
 * seguidos. Con el cuerpo del 178 NO habria salido ni un aviso, y como nada
 * lanza, solo se habria visto en el registro. Esto es lo que se comprueba.
 *
 * LO QUE ESTE BANCO NO PUEDE COMPROBAR, y hay que saberlo: que la plantilla
 * exista de verdad en la cuenta de Meta. El 2026-09-21,
 * `GET /meta/whatsapp/v24.0/1111045594943789/message_templates` devolvia
 * `{"data":[]}` -- creada en el panel de Kapso, todavia no en la cuenta del
 * numero. Hasta que aparezca, con `KAPSO_PLANTILLA_AVISO` puesta Meta responde
 * 132001 y no sale ningun aviso.
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

const PLANTILLA = 'src/services/avisos/plantillaDeAviso.ts';
const REGLA = 'src/services/avisos/avisoPorWhatsApp.ts';
const CLIENTE = 'src/services/avisos/whatsappKapso.ts';
const ORQUESTA = 'src/services/avisos/enviarAvisosPendientes.ts';

// Los huecos de la plantilla aprobada. Escritos aqui a mano A PROPOSITO: si el
// codigo y el banco los sacaran del mismo sitio, cambiar el codigo cambiaria la
// comprobacion y no quedaria nadie vigilando el contrato con Meta.
// TRES VECES LA PLANTILLA NO ERA LA QUE SE CREIA, y cada vez el sintoma seria
// el mismo: Meta rechaza el mensaje ENTERO (132000) y no sale ni un aviso.
//   · 179: se escribio para CINCO, los que dijo el dueño.
//   · 184: la aprobada tenia SEIS (`empresa` propia).
//   · 186: la definitiva, `notificacion_operativa` (UTILITY), tiene SIETE:
//     aparece `referencia`.
// Escritos a mano AQUI a proposito: son el contrato con lo que Meta tiene
// aprobado, y si el codigo y el banco los sacaran del mismo sitio, cambiar el
// codigo cambiaria la comprobacion y no quedaria nadie vigilando.
const HUECOS = ['administrador', 'empresa', 'tipo_aviso', 'cantidad', 'fecha', 'referencia', 'app_name'];

async function main() {
  // Vale en los DOS estados: lo que el lote cambia es COMO se rellena la
  // plantilla, no que los avisos se manden.
  if (!/export function avisosQueSeMandan/.test(leer(REGLA))) {
    throw new Error('Precondicion: ya no se deciden los avisos que salen por WhatsApp (lote 178)');
  }
  if (!/KAPSO_PLANTILLA_AVISO/.test(leer(CLIENTE))) {
    throw new Error('Precondicion: el cliente ya no sabe mandar por plantilla (lote 178)');
  }
  // Estas DOS valian ya antes del lote, asi que como comprobacion regalaban
  // un OK en la contraprueba (seccion 4 del metodo). Son guardas de lo que el
  // lote NO puede romper, y por eso van aqui: una precondicion tiene que
  // valerse en los dos estados, y estas se valen.
  if (!/type: 'text', text: \{ body: texto \}/.test(sinComentarios(leer(CLIENTE)))) {
    throw new Error('Precondicion: sin plantilla configurada ya no sale texto libre (lote 178)');
  }
  if (/@\/db/.test(sinComentarios(leer(REGLA)))) {
    throw new Error('Precondicion: lo que DECIDE volvio a arrastrar la base de datos (lote 178)');
  }
  console.log('  pre   los avisos salen por WhatsApp, el cliente conoce la plantilla, el texto libre sigue y nada de esto toca la base');

  console.log('\n1) Los cinco huecos, ejecutados\n');
  let P: typeof import('../src/services/avisos/plantillaDeAviso') | null = null;
  try { P = await import('../src/services/avisos/plantillaDeAviso'); } catch { P = null; }

  const ETIQUETAS = [
    'salen los SIETE huecos que pide la plantilla, ni uno mas',
    'ninguno va vacio (Meta rechaza el mensaje entero)',
    'ninguno lleva salto de linea',
    'ni cuatro espacios seguidos',
    'la empresa va en su hueco, que es de quien es el aviso',
    'el importe sale del aviso cuando lo hay',
    'y dice "No aplica" cuando el aviso no habla de dinero',
    'un texto larguisimo se recorta',
  ];

  if (!P) {
    for (const t of ETIQUETAS) falta(t, 'no existe services/avisos/plantillaDeAviso.ts');
  } else {
    const { parametrosDelAviso, limpiarParametro, montoDelAviso, HUECOS_DE_LA_PLANTILLA, SIN_DATO } = P;

    const caja = {
      id: 'caja-diferencia-1', type: 'caja_con_diferencia',
      title: 'Faltan RD$ 500,00 en el arqueo de caja',
      description: 'Se contó menos efectivo del que el sistema esperaba.',
      actionText: 'Ver', actionLink: '/dashboard/cash',
    };
    const p = parametrosDelAviso(caja, 'Latin Doors S.R.L', '21/09/2026');

    ok(ETIQUETAS[0], JSON.stringify(Object.keys(p).sort()) === JSON.stringify([...HUECOS].sort()),
      Object.keys(p).join(','));
    ok('  y son SIETE, que es lo que Meta tiene aprobado', Object.keys(p).length === 7, String(Object.keys(p).length));
    ok('  y son los mismos que declara el modulo',
      JSON.stringify([...HUECOS_DE_LA_PLANTILLA].sort()) === JSON.stringify([...HUECOS].sort()));

    const valores = Object.values(p);
    ok(ETIQUETAS[1], valores.every((v) => typeof v === 'string' && v.trim() !== ''));
    ok(ETIQUETAS[2], valores.every((v) => !/[\r\n]/.test(v)));
    ok(ETIQUETAS[3], valores.every((v) => !/ {4}/.test(v)) && valores.every((v) => !/\t/.test(v)));

    //  LOTE 184: la empresa tiene su propio hueco. En `administrador` va un
    //  saludo generico: el destino se configura por empresa, no por persona, y
    //  repetir la empresa en la misma frase se lee mal.
    ok(ETIQUETAS[4], p.empresa === 'Latin Doors S.R.L', p.empresa);
    ok('  y el saludo no repite la empresa ni inventa un nombre',
      p.administrador === 'Administrador', p.administrador);
    //  LOTE 186: la referencia es la CLAVE ESTABLE del aviso, la misma que
    //  guarda `notifications.clave` y la que impide repetirlo. Asi quien recibe
    //  el mensaje y quien mira la base hablan del MISMO aviso; un codigo nuevo
    //  inventado aqui daria dos identidades para una cosa.
    ok('la referencia es la clave del aviso, no un codigo inventado',
      p.referencia === caja.id, p.referencia);
    ok('  la fecha es la que se le da, no la del reloj', p.fecha === '21/09/2026', p.fecha);
    ok('  y el nombre del sistema es el nuestro', p.app_name === 'ContFast', p.app_name);
    ok('el hueco del aviso dice QUE pasa y POR QUE',
      p.tipo_aviso.includes('Faltan RD$ 500,00') && p.tipo_aviso.includes('menos efectivo'), p.tipo_aviso);
    // La plantilla ya pone el punto: "...el siguiente aviso: {{tipo_aviso}}."
    ok('  sin punto final, que lo pone la plantilla', !p.tipo_aviso.endsWith('.'), p.tipo_aviso.slice(-12));

    ok(ETIQUETAS[5], p.cantidad === 'RD$ 500,00', p.cantidad);
    ok('  tambien si viene pegado y en el titulo',
      montoDelAviso(null, 'Cheque 123 por RD$144.092,15 se cobra mañana') === 'RD$ 144.092,15',
      String(montoDelAviso(null, 'Cheque 123 por RD$144.092,15 se cobra mañana')));

    const declaracion = {
      id: 'declaracion-606-202608', type: 'declaracion_pendiente',
      title: 'El 606 de agosto está pendiente', description: 'Vence el día 15.',
      actionText: 'Ver', actionLink: '/x',
    };
    const q = parametrosDelAviso(declaracion, 'Artalum', '21/09/2026');
    ok(ETIQUETAS[6], q.cantidad === SIN_DATO, q.cantidad);
    ok('  y no se inventa un numero cualquiera', montoDelAviso('vencen 15 dias') === null,
      String(montoDelAviso('vencen 15 dias')));

    // Texto escrito para una pantalla: con saltos, tabuladores y espacios.
    const sucio = limpiarParametro('  linea uno\n\nlinea    dos\ttres   ');
    ok('un texto de pantalla se deja apto para Meta',
      !/[\r\n\t]/.test(sucio) && !/ {4}/.test(sucio) && sucio.trim() === sucio, sucio);
    ok('  y los saltos no pegan las frases', sucio.includes('·'), sucio);
    ok('un hueco sin nada dentro nunca sale vacio',
      limpiarParametro('') === SIN_DATO && limpiarParametro(null) === SIN_DATO
      && limpiarParametro('   ') === SIN_DATO && limpiarParametro(undefined) === SIN_DATO);

    const largo = parametrosDelAviso({ ...caja, description: 'x'.repeat(5000) }, 'E', '21/09/2026');
    ok(ETIQUETAS[7], largo.tipo_aviso.length <= 1024, String(largo.tipo_aviso.length));
  }

  console.log('\n2) El cliente los manda como Meta los quiere\n');
  const cliente = leer(CLIENTE);
  const codigo = sinComentarios(cliente);
  // Con nombre, no por posicion: la plantilla usa {{administrador}}, no {{1}}.
  ok('los parametros van CON NOMBRE', /parameter_name/.test(codigo));
  ok('  uno por cada hueco, no uno solo',
    /Object\.entries\(parametros[^)]*\)/.test(codigo) && !/parameters: \[\{ type: 'text', text: texto \}\]/.test(codigo));
  ok('el idioma por defecto es el de la plantilla que existe',
    /KAPSO_PLANTILLA_IDIOMA \|\| 'es_MX'/.test(codigo));
  // Un envio que Meta va a rechazar seguro gasta el aviso: la marca de enviado
  // no se pone (lote 178), pero el aviso no llega y nadie lo mira.
  ok('con plantilla puesta y sin huecos NO se manda nada',
    /if \(plantilla && \(!parametros/.test(codigo));
  ok('  y se dice por que', /hay plantilla configurada pero el aviso no trae sus parametros/.test(cliente));

  console.log('\n3) Van enganchados de punta a punta\n');
  const regla = leer(REGLA);
  ok('la decision incluye los huecos en cada envio',
    /parametros: parametrosDelAviso\(a, empresa, fecha\)/.test(regla));
  const orq = leer(ORQUESTA);
  ok('el envio le pasa los huecos al cliente',
    /mandarWhatsApp\(envio\.numero, envio\.texto, envio\.parametros\)/.test(orq));
  // El defecto del lote 174, en otro sitio: en UTC, a partir de las 20:00 de RD
  // ya es mañana, y un aviso fechado mañana no se cree.
  ok('la fecha del mensaje es la de RD, no la del servidor',
    /diaRD\(\)/.test(sinComentarios(orq)) && !/new Date\(\)\.toISOString/.test(sinComentarios(orq)));
  ok('  y se enseña como se leen las fechas aqui (dd/mm/aaaa)',
    /formatDateDisplay\(diaRD\(\)\)/.test(sinComentarios(orq)));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
