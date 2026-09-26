/**
 * Lote 198 -- la consulta de RNC vuelve a funcionar, con el padron de la DGII.
 *
 * DE DONDE SALE
 * -------------
 * El dueño reporto el 2026-09-25: *"cuando introdusco un rnc en el registro
 * suplidores o clientes, y le doy a buscar rnc, da error y no lo busca"*.
 *
 * MEDIDO, Y NO ERA NUESTRO CODIGO
 *  · La consulta llamaba a `pptonanntevatndjyzmk.supabase.co` -- un proxy de
 *    TERCEROS, no la DGII -- y ese nombre **ya no resuelve en DNS**:
 *    `fetch failed ← ENOTFOUND: getaddrinfo ENOTFOUND ...`. El proveedor
 *    desaparecio sin avisar.
 *  · El mensaje que veia el usuario, "Error de red al consultar DGII", **mentia dos
 *    veces**: no consultaba a la DGII, y no era pasajero -- no iba a volver nunca.
 *  · `DGII_API_KEY` estaba puesta en el `.env` y en Vercel: no faltaba nada.
 *
 * DECISION DEL DUEÑO: usar la DGII. Y al medirlo salio que **su servicio web tambien
 * esta retirado**: `wsMovilDGII/WSMovilDGII.asmx` contesta 301 hacia el portal (mi
 * POST recibio 476 KB de su pagina) y `api.dgii.gov.do` no resuelve. Lo unico que la
 * DGII publica es el padron descargable, y esa es la via elegida.
 *
 * LA FORMA DEL PADRON, MEDIDA el 2026-09-26 (nunca supuesta -- la leccion de la
 * plantilla de Kapso, que costo tres lotes): `DGII_RNC.zip` de 21,8 MB con
 * `TMP/DGII_RNC.TXT` de 86,5 MB dentro; **791.412 lineas**, separador `|`, once
 * campos, **latin-1**, sin cabecera. En el ensayo de la importacion: 791.373
 * utilizables, 39 descartadas.
 *
 * Este banco EJECUTA la lectura de una linea con filas de verdad del fichero.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const SERVICIO = 'src/services/dgii/rncLookup.ts';
const MIGRACION = 'drizzle/0014_padron_de_rnc.sql';
const GUION = 'scratch/_to_delete/importar_padron_rnc.ts';
const REPO = 'src/repositories/dashboardRepository.ts';

async function main() {
  const servicio = leer(SERVICIO);
  const repo = leer(REPO);

  //  PRECONDICIONES, ciertas en los DOS estados.
  if (servicio === '') throw new Error('Precondicion: no esta el servicio de consulta de RNC');
  if (!/class DGIIService/.test(servicio)) throw new Error('Precondicion: ya no existe DGIIService');
  if (!/lookupRNC/.test(servicio)) throw new Error('Precondicion: ya no existe lookupRNC');
  //  Las tres pantallas y el validador siguen llamando por la misma puerta: si eso
  //  cambiara, este banco vigilaria algo que ya nadie usa.
  const clientes = leer('src/app/dashboard/customers/page.tsx');
  if (!/api\/v1\/dgii\/rnc\//.test(clientes)) {
    throw new Error('Precondicion: clientes ya no consulta el RNC por esa ruta');
  }
  if (!/DGIIService/.test(leer('src/services/ecfValidator.ts'))) {
    throw new Error('Precondicion: el validador de e-CF ya no consulta el RNC');
  }
  console.log('  pre   DGIIService.lookupRNC sigue siendo la puerta, y la usan las pantallas y el validador');

  const codigo = sinComentarios(servicio);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) Leer el padron, EJECUTADO con filas reales del fichero\n');
  // ───────────────────────────────────────────────────────────────────────────
  let M: typeof import('../src/services/dgii/padronDeRnc') | null = null;
  try { M = await import('../src/services/dgii/padronDeRnc'); } catch { M = null; }

  const ETIQUETAS = [
    'una fila del padron se lee entera',
    'el estado se lee DESDE EL FINAL, no por su posicion',
    'los ceros de delante de una cedula se conservan',
    'una linea inutil se descarta en vez de tumbar la importacion',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe services/dgii/padronDeRnc.ts');
  } else {
    const { filaDelPadron, rncBuscable, estaActivo, avisoDePadronViejo, DIAS_PARA_AVISAR_DEL_PADRON } = M;

    //  FILAS DE VERDAD, copiadas del fichero de la DGII el 2026-09-26.
    const conComercial = '430338852|FUNDACION EMPRENDE ACCIONA Y DESARROLLO FEADE|FUNDACION EMPRENDE ACCIONA Y DESARROLLO FEADE|SERVICIOS DE ASOCIACIONES N.C.| | | | |30/06/2020|ACTIVO|NORMAL';
    const cedula = '00300755329|VIRGINIA SOLEDAD PIMENTEL RAMIREZ||EMPLEADOS (ASALARIADOS) | | | | ||SUSPENDIDO|NORMAL';
    const deBaja = '130909636|G & N GESTORES DE PRESTAMOS Y CREDITOS SRL|G & N|PRESTAMO DE DINERO| | | | ||DADO DE BAJA|NORMAL';

    const a = filaDelPadron(conComercial);
    ok(ETIQUETAS[0],
      a?.rnc === '430338852' && a?.nombre.startsWith('FUNDACION EMPRENDE')
      && a?.nombreComercial.startsWith('FUNDACION EMPRENDE') && a?.estado === 'ACTIVO'
      && a?.actividad === 'SERVICIOS DE ASOCIACIONES N.C.',
      `${a?.rnc} · ${a?.estado}`);
    //  CONTAR DESDE DELANTE PONDRIA EL ESTADO EN LA COLUMNA EQUIVOCADA: el campo 9 de
    //  esta fila es la fecha y el 10 es el estado, pero en la de la cedula el 9 esta
    //  vacio. Solo contando desde el final sale bien en las dos.
    ok(ETIQUETAS[1],
      filaDelPadron(cedula)?.estado === 'SUSPENDIDO'
      && filaDelPadron(deBaja)?.estado === 'DADO DE BAJA',
      `${filaDelPadron(cedula)?.estado} / ${filaDelPadron(deBaja)?.estado}`);
    //  ESTAS TRES FILAS NO DISTINGUEN NADA, y por eso hace falta la de abajo: en las
    //  tres el estado cae en el campo 9 Y ADEMAS en el penultimo, asi que un mutante
    //  que lo leyera por posicion (`campos[9]`) SOBREVIVIA. Lo comprobado era una
    //  coincidencia del fichero de hoy, no la regla.
    //
    //  Esta lleva DOCE campos -- una columna metida en medio, que es el cambio que la
    //  DGII ya le hizo a este fichero otras veces -- y ahi las dos formas de leer dan
    //  cosas distintas: el campo 9 seria la fecha y el penultimo sigue siendo el
    //  estado.
    const conColumnaDeMas = '131793916|EMPRESA DE PRUEBA SRL|PRUEBA|VENTA AL POR MENOR|NUEVA COLUMNA| | | | |30/06/2020|ACTIVO|NORMAL';
    ok('  y sigue saliendo bien si la DGII mete una columna en medio',
      filaDelPadron(conColumnaDeMas)?.estado === 'ACTIVO',
      `campos=${conColumnaDeMas.split('|').length} estado=${filaDelPadron(conColumnaDeMas)?.estado}`);
    //  `00300755329` es una cedula de once digitos: quitarle los ceros la convierte en
    //  otro numero y no se encontraria nunca.
    ok(ETIQUETAS[2], filaDelPadron(cedula)?.rnc === '00300755329',
      String(filaDelPadron(cedula)?.rnc));
    ok(ETIQUETAS[3],
      filaDelPadron('') === null && filaDelPadron('sin barras') === null
      && filaDelPadron('|||') === null && filaDelPadron('430338852||X| |') === null);
    ok('  y sin nombre no vale, que es justo el dato que se busca',
      filaDelPadron('430338852| |algo|otro| | | | ||ACTIVO|NORMAL') === null);

    // ── lo que se busca ──
    ok('se busca por digitos, con 9 o con 11',
      rncBuscable('131-79391-6') === '131793916'
      && rncBuscable('00300755329') === '00300755329');
    ok('  y lo que no tiene esa forma no se busca',
      rncBuscable('123') === null && rncBuscable('') === null
      && rncBuscable(null) === null && rncBuscable('1234567890') === null);
    ok('solo ACTIVO esta activo',
      estaActivo('ACTIVO') && estaActivo(' activo ')
      && !estaActivo('SUSPENDIDO') && !estaActivo('DADO DE BAJA') && !estaActivo(null));

    // ── el aviso de padron viejo ──
    console.log('\n2) El padron envejece y el sistema lo dice\n');
    const ahora = new Date('2026-10-26T12:00:00Z');
    const hace = (d: number) => new Date(ahora.getTime() - d * 86_400_000);
    ok('un padron recien importado no molesta',
      avisoDePadronViejo({ actualizado: hace(7), ahora }) === null);
    ok('  ni justo antes del tope',
      avisoDePadronViejo({ actualizado: hace(DIAS_PARA_AVISAR_DEL_PADRON - 1), ahora }) === null);
    const viejo = avisoDePadronViejo({ actualizado: hace(45), ahora });
    ok('pasado el tope, avisa y dice cuantos dias lleva',
      viejo !== null && /45 días/.test(viejo.title), viejo?.title);
    //  Clave estable (lote 160): sin fecha dentro, o cada dia crearia un aviso nuevo
    //  en vez de actualizar el que hay.
    ok('  con clave estable, para que se actualice y no se multiplique',
      viejo?.id === 'padron-rnc-viejo');
    //  SIN PADRON CARGADO NO SE AVISA AQUI: la consulta ya lo dice con sus palabras, y
    //  un aviso permanente en una empresa que nunca busca un RNC es ruido.
    ok('sin padron cargado no se avisa (lo dice la consulta, no el panel)',
      avisoDePadronViejo({ actualizado: null, ahora }) === null);

    //  ESTO NO VA AL TELEFONO. `severidadDeAviso` manda por WhatsApp los `error` y los
    //  `warning` (lote 178); una tarea de mantenimiento no despierta a nadie.
    const A = await import('../src/services/avisos/avisoDelPanel');
    ok('y no llega por WhatsApp: es mantenimiento, no una urgencia',
      A.severidadDeAviso('padron_viejo') === 'info');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) La consulta ya no depende de nadie\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  NEGATIVA ATADA AL POSITIVO: "no llama al proxy" seria cierto de balde en un
  //  fichero vacio.
  ok('la consulta lee el padron de nuestra base',
    /from\(rncPadron\)/.test(codigo) && /rncBuscable\(/.test(codigo));
  //  SOBRE EL CODIGO, NO SOBRE LA PROSA: el fichero EXPLICA en su comentario cual era
  //  el proxy que desaparecio -- es el porque del lote --, asi que buscar el nombre en
  //  el texto daba FALLA por el comentario que dice exactamente lo que se comprueba.
  //  Tercera vez hoy que caigo en esto (lotes 195 y 196).
  ok('  y ya no llama al proveedor que desaparecio',
    /from\(rncPadron\)/.test(codigo) && !/pptonanntevatndjyzmk|dgiiapicloud/.test(codigo));
  ok('  ni necesita una clave de API',
    !/DGII_API_KEY/.test(codigo));
  //  Un RNC que no esta puede ser un registro reciente: decir "no existe" seria falso.
  ok('si un RNC no esta, se dice DE CUANDO es el padron',
    /No está en el padrón de la DGII \(cargado el/.test(servicio));
  ok('  y si el padron no esta cargado, se dice eso otro',
    /no está cargado todavía/.test(servicio));
  //  El estado va tal como lo dice la DGII, y solo se advierte cuando NO esta activo.
  ok('un RNC suspendido se encuentra, pero se advierte',
    /estaActivo\(fila\.estado\)/.test(codigo) && /Atención: la DGII lo tiene como/.test(servicio));
  //  Con el motivo completo (lote 197): el registro de produccion decia "fetch failed"
  //  durante semanas sin decir que el DNS no resolvia.
  ok('si la consulta falla, el registro dice por que',
    /motivoDelError\(error\)/.test(codigo));
  //  ATADA AL POSITIVO: que se registre como aviso y no como incidente ya era verdad
  //  antes de este lote (lo hizo el 185), asi que sola sobrevivia a la contraprueba.
  //  Lo de AHORA es que ademas lleve el motivo completo.
  ok('  y como aviso, no como incidente (lote 185)',
    /motivoDelError\(error\)/.test(codigo)
    && /Logger\.warn\('\[rncLookup\]/.test(codigo) && !/console\.error/.test(codigo));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) La tabla, la importacion y el aviso, enchufados\n');
  // ───────────────────────────────────────────────────────────────────────────
  const migracion = leer(MIGRACION);
  ok('hay migracion para la tabla del padron',
    /CREATE TABLE IF NOT EXISTS "rnc_padron"/.test(migracion));
  //  La clave primaria es el RNC: es lo que hace que reimportar ACTUALICE en vez de
  //  duplicar 791.412 filas.
  ok('  con el RNC como clave primaria, para que reimportar actualice',
    /"rnc" varchar\(11\) PRIMARY KEY/.test(migracion));
  //  Sin `company_id`: es dato publico del Estado, el mismo para las seis empresas.
  //  Sin los comentarios del SQL, por lo mismo: la migracion explica en su cabecera
  //  que va SIN `company_id`, y esa frase hacia fallar la comprobacion.
  //  La expresion se arma con `RegExp` en vez de escribir el salto de linea a mano:
  //  ya me rompio dos bancos hoy al editarlos con un guion (se convertia en un salto
  //  de verdad y dejaba la cadena sin cerrar).
  const sqlSinComentarios = migracion.replace(new RegExp('--[^\\n]*', 'g'), ' ');
  //  ATADA AL POSITIVO: sin migracion, "no tiene company_id" es cierto de balde.
  ok('  y sin company_id ni modo: es dato publico, no de cada empresa',
    /CREATE TABLE IF NOT EXISTS "rnc_padron"/.test(migracion)
    && !/company_id|modo/.test(sqlSinComentarios));

  const guion = leer(GUION);
  const codigoGuion = sinComentarios(guion);
  ok('hay guion de importacion, con ensayo por defecto',
    /--aplicar/.test(guion) && /ENSAYO \(nada se escribe\)/.test(guion));
  //  LA DGII DEVUELVE 403 A QUIEN NO PARECE UN NAVEGADOR, y su pagina de "Acceso
  //  Denegado" pesa 6 KB: un guion que solo mire el tamaño creeria que descargo el
  //  padron. Lo que decide es la firma del ZIP.
  ok('  manda User-Agent de navegador (si no, la DGII contesta 403)',
    /User-Agent/.test(guion) && /Mozilla/.test(guion));
  ok('  y comprueba que lo descargado ES un ZIP, no la pagina de 403',
    /0x04034b50/.test(guion));
  ok('  lee el fichero en latin-1, que es como viene',
    /latin1/.test(guion) && !/utf8'\)\;[\s\S]{0,40}split\('\\n'\)/.test(guion));
  //  Si la DGII cambiara la forma del fichero, media importacion es peor que ninguna.
  //  LA CONDICION, NO EL MENSAJE: un mutante que dejaba `if (false)` conservaba el
  //  texto del error y la comprobacion pasaba. Mera presencia otra vez.
  ok('  y se niega a cargar un padron a medias',
    /buenas\.length < 500_000/.test(codigoGuion));
  //  SOBRE EL CODIGO: el docstring del guion EXPLICA que usa `on conflict do update`,
  //  asi que buscarlo en el texto pasaba aunque el SQL dijera otra cosa. Cuarta vez hoy
  //  que la prosa hace pasar una comprobacion.
  ok('  sin borrar lo anterior: actualiza por RNC',
    /on conflict \(rnc\) do update/.test(codigoGuion));

  //  QUE SE AÑADA, no solo que se calcule: un mutante que dejaba
  //  `if (false && avisoPadron)` conservaba la llamada y la comprobacion pasaba.
  ok('el panel avisa cuando el padron envejece',
    /avisoDePadronViejo\(/.test(sinComentarios(repo))
    && /if \(avisoPadron\) alertsDetails\.push\(avisoPadron\)/.test(sinComentarios(repo)));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) Lo que este lote NO hace, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  El padron no se actualiza solo. Decision del dueño (2026-09-26): lo importa el,
  //  como los demas guiones de datos, en vez de meter `DATABASE_URL` como secreto de
  //  GitHub o intentar importar 791.412 filas desde una funcion de Vercel con 300 s.
  //  Si algun dia se automatiza, esta comprobacion es la que hay que cambiar.
  ok('no se importa solo: lo lanza el dueño, y el panel se lo recuerda',
    guion.includes('scratch/_to_delete/importar_padron_rnc.ts')
    && /avisoDePadronViejo\(/.test(sinComentarios(repo)));
  //  No se raspa el formulario web de la DGII: es un ASP.NET WebForms con VIEWSTATE, y
  //  un captcha lo dejaria muerto otra vez -- que es justo de donde venimos.
  //  ATADA AL POSITIVO: sin padron ni guion, "no se raspa nada" es cierto de balde.
  ok('y no se raspa la pagina web de la DGII',
    /from\(rncPadron\)/.test(codigo)
    && !/VIEWSTATE|ConsultasWeb/.test(servicio) && !/VIEWSTATE/.test(guion));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
