/**
 * El padron de contribuyentes de la DGII: como se lee su fichero.
 *
 * POR QUE EXISTE ESTE FICHERO (lote 198)
 * --------------------------------------
 * El 2026-09-25 el dueño reporto que "buscar RNC" daba error en clientes y
 * suplidores. Medido: el codigo llamaba a
 * `https://pptonanntevatndjyzmk.supabase.co/functions/v1/dgii-api` -- un proxy de
 * TERCEROS, no la DGII -- y ese nombre **ya no resuelve en DNS**
 * (`getaddrinfo ENOTFOUND`). El proveedor desaparecio sin avisar.
 *
 * Decision del dueño (2026-09-26): usar la DGII. Y ahi salio que **el servicio web
 * de la DGII tambien esta retirado**: `wsMovilDGII/WSMovilDGII.asmx` contesta 301
 * hacia el portal y `api.dgii.gov.do` no existe. Lo que la DGII SI publica es el
 * padron descargable, y esa es la via elegida: dato oficial, sin terceros, sin
 * clave, y la consulta no depende de que nadie este levantado.
 *
 * LA FORMA DEL FICHERO, MEDIDA (no supuesta)
 * -----------------------------------------
 * `https://dgii.gov.do/app/WebApps/Consultas/RNC/DGII_RNC.zip`
 *   · 22.911.217 bytes; dentro, `TMP/DGII_RNC.TXT` de 90.657.256 bytes.
 *   · **791.412 filas**, una por contribuyente.
 *   · Separador `|`, **once campos** (diez barras).
 *   · Codificacion **latin-1**, no UTF-8: "PRESTAMO" viene con la E acentuada en un
 *     solo byte. Leerlo como UTF-8 destroza los nombres con tilde o eñe.
 *   · Sin cabecera: la primera linea ya es un contribuyente.
 *   · Los campos vacios vienen como un espacio, no como cadena vacia.
 *
 * Dos filas de verdad, para que se vea:
 *
 *   00300755329|VIRGINIA SOLEDAD PIMENTEL RAMIREZ||EMPLEADOS (ASALARIADOS) | | | | ||SUSPENDIDO|NORMAL
 *   430338852|FUNDACION EMPRENDE...|FUNDACION EMPRENDE...|SERVICIOS DE ASOCIACIONES N.C.| | | | |30/06/2020|ACTIVO|NORMAL
 *
 * OJO CON LA DESCARGA: la DGII responde **403 a los clientes que no parecen un
 * navegador**. Sin `User-Agent` de navegador devuelve una pagina de "Acceso
 * Denegado" de 6 KB con codigo 200 aparente en el HEAD -- o sea que un guion que no
 * compruebe el contenido creeria que descargo el padron.
 *
 * Fichero puro: la lectura de una linea es lo que mas se puede equivocar, y tiene
 * que poder ejecutarse en un banco. El unico `import` es DE TIPO (`AvisoDelPanel`,
 * que vive en un modulo igual de puro): no arrastra nada en ejecucion.
 */

import type { AvisoDelPanel } from '@/services/avisos/avisoDelPanel';

export interface FilaDelPadron {
  /** Solo digitos. Un RNC tiene 9; una cedula, 11. */
  rnc: string;
  nombre: string;
  /** El nombre con el que opera, si lo tiene. Para un suplidor suele ser el util. */
  nombreComercial: string;
  /** ACTIVO, SUSPENDIDO, DADO DE BAJA... tal como lo dice la DGII. */
  estado: string;
  actividad: string;
}

/**
 * Una linea del padron, o `null` si no es utilizable.
 *
 * Devuelve `null` en vez de lanzar porque esto recorre 791.412 lineas: una linea
 * rara no puede tumbar una importacion de veinte minutos. Quien importa cuenta las
 * descartadas y las dice.
 */
export function filaDelPadron(linea: string): FilaDelPadron | null {
  if (!linea) return null;
  const campos = linea.split('|');
  //  Once campos es la forma medida. Se exige un minimo de tres (RNC, nombre y algo
  //  mas) en vez de exactamente once: si la DGII añade una columna al final, la
  //  importacion no se queda a cero -- que es lo que pasaria con una comprobacion
  //  estricta, y sin avisar de por que.
  if (campos.length < 3) return null;

  const limpio = (i: number) => (campos[i] ?? '').trim();
  //  El RNC puede venir con ceros delante (`00300755329`): se conservan, porque es
  //  una cedula de once digitos y quitarlos la convertiria en otra cosa.
  const rnc = limpio(0).replace(/\D/g, '');
  if (rnc === '') return null;
  const nombre = limpio(1);
  //  Sin nombre no sirve para nada: es justo el dato que se va a buscar.
  if (nombre === '') return null;

  return {
    rnc,
    nombre,
    nombreComercial: limpio(2),
    //  El estado y el regimen son los dos ultimos campos. Se cuentan DESDE EL FINAL
    //  y no por su posicion: si la DGII mete una columna EN MEDIO -- ya cambio la
    //  forma de este fichero otras veces --, contar desde delante pondria el estado en
    //  la columna equivocada y el padron entero saldria con la fecha por estado.
    //
    //  LA SALVEDAD, que conviene saber: contar desde el final aguanta una columna
    //  metida EN MEDIO, pero NO una añadida AL FINAL (ahi el estado pasaria a ser el
    //  antepenultimo). No hay forma de aguantar las dos, asi que se elige la que rompe
    //  de forma visible: el guion de importacion imprime una fila del medio con su
    //  estado, y un "30/06/2020" donde deberia decir "ACTIVO" se ve al instante.
    //
    //  Esto lo destapo un mutante: las tres filas reales con las que empece a probar
    //  tenian el estado en el campo 9 **y** en el penultimo a la vez, asi que leerlo
    //  por posicion pasaba las comprobaciones. El banco lleva ahora una fila de doce
    //  campos, que es la unica que distingue las dos formas.
    estado: campos.length >= 2 ? (campos[campos.length - 2] ?? '').trim() : '',
    actividad: limpio(3),
  };
}

/** Lo que se busca: solo digitos, y con la longitud que usa la DGII. */
export function rncBuscable(texto: string | null | undefined): string | null {
  const digitos = (texto ?? '').replace(/\D/g, '');
  if (digitos.length !== 9 && digitos.length !== 11) return null;
  return digitos;
}

/**
 * ¿Este contribuyente esta al dia?
 *
 * La DGII escribe el estado en mayusculas y con variantes ("DADO DE BAJA", "BAJA").
 * Lo que decide es si NO esta activo, porque eso es lo que hay que advertir a quien
 * va a facturarle: un RNC suspendido sigue existiendo y su nombre sigue siendo
 * correcto, pero emitirle un comprobante es otra conversacion.
 */
export function estaActivo(estado: string | null | undefined): boolean {
  return (estado ?? '').trim().toUpperCase() === 'ACTIVO';
}

/**
 * CUANDO HAY QUE VOLVER A IMPORTAR EL PADRON, como aviso del panel.
 *
 * El padron no se actualiza solo: es un fichero que se descarga y se importa con
 * `scratch/_to_delete/importar_padron_rnc.ts`, y lo lanza el dueño -- igual que los
 * demas guiones de datos de este proyecto (decision del dueño, 2026-09-26, frente a
 * una tarea de GitHub Actions que obligaria a poner `DATABASE_URL` como secreto del
 * repositorio, o a un cron de Vercel, que es el sitio equivocado para importar
 * 791.412 filas).
 *
 * Asi que lo que evita que se quede viejo es que el sistema lo diga. TREINTA DIAS,
 * y no menos: medido el 2026-09-26, la DGII republica el fichero cada pocos dias (la
 * version en linea tenia 7), pero avisar cada semana de una tarea manual convierte el
 * aviso en ruido -- y el panel ya tiene nueve clases de aviso. Un mes de retraso son
 * los contribuyentes registrados en un mes, que es justo lo que el mensaje de la
 * consulta ya explica cuando un RNC no aparece.
 *
 * SEVERIDAD `info`, Y NO ES UN DESCUIDO: `severidadDeAviso` manda al telefono los
 * `error` y los `warning` (lote 178). Que el padron tenga 31 dias no es para
 * despertar a nadie por WhatsApp; es una tarea de mantenimiento. El tipo
 * `padron_viejo` no esta en ninguna de esas dos listas, asi que cae en `info` -- y
 * hay una comprobacion en el banco que lo fija, porque un dia que alguien lo suba a
 * `warning` empezaria a mandar mensajes por esto.
 */
export const DIAS_PARA_AVISAR_DEL_PADRON = 30;

export function avisoDePadronViejo(
  { actualizado, ahora }: { actualizado: Date | null; ahora: Date },
  //  EL TIPO SE ESTRECHA A `'padron_viejo'`, y no es adorno: la lista de avisos del
  //  panel es CERRADA (`DashboardAlert`), mientras `AvisoDelPanel.type` es un `string`
  //  cualquiera. Devolver el tipo ancho obligaria a un molde en quien lo usa -- y un
  //  molde es exactamente lo que tapa un aviso mal tipado. Asi lo comprueba el
  //  compilador en los dos lados.
): (Omit<AvisoDelPanel, 'type'> & { type: 'padron_viejo' }) | null {
  //  Sin padron cargado NO se avisa aqui: la consulta ya lo dice con sus palabras
  //  ("no esta cargado todavia"), y un aviso permanente en el panel de una empresa
  //  que nunca busca un RNC es ruido puro.
  if (!actualizado) return null;
  const dias = Math.floor((ahora.getTime() - actualizado.getTime()) / 86_400_000);
  if (dias < DIAS_PARA_AVISAR_DEL_PADRON) return null;
  return {
    //  Clave estable (lote 160): sin fecha dentro, para que el aviso se ACTUALICE en
    //  vez de crear uno nuevo cada dia que pasa.
    id: 'padron-rnc-viejo',
    type: 'padron_viejo',
    title: `El padrón de RNC tiene ${dias} días`,
    description: 'La consulta de RNC usa el padrón descargado de la DGII. Vuelva a importarlo para que reconozca a los contribuyentes registrados desde entonces.',
    actionText: 'Ver cómo',
    //  A Configuracion, que es donde se administra el sistema: no hay pantalla para
    //  importar -- lo hace un guion -- y mandar a una pantalla que no existe seria
    //  peor que no poner enlace.
    actionLink: '/dashboard/settings',
  };
}
