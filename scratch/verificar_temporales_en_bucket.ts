/**
 * Lote 183 -- el PDF temporal deja de vivir en el disco de la instancia.
 *
 * EL DEFECTO, REPORTADO Y MEDIDO
 * ------------------------------
 * El dueño (2026-09-22): al registrar un recibo de cobro, la pantalla de
 * impresion da error. En los logs de PRODUCCION, leidos con el CLI:
 *
 *     201  POST /api/v1/ar/receipts                  <- el recibo se registra
 *     200  POST /api/v1/ar/receipts/{id}/print       <- el PDF se genera
 *     404  GET  /api/v1/documents/{uuid}/download    <- aqui
 *
 * 404 y NO 403, asi que la firma era valida: el fichero no estaba. Dos causas:
 *
 *  1. se escribia en el disco LOCAL de la instancia, y la descarga es otra
 *     peticion que Vercel enruta por su cuenta;
 *  2. se BORRABA un segundo despues de la primera descarga, y los visores de PDF
 *     piden el documento dos veces.
 *
 * No era solo el recibo: OCHO rutas usan `saveTemporaryFile`.
 *
 * UNA TRAMPA DE MEDICION QUE MERECE QUEDAR ESCRITA: el ruido de Redis (cuota de
 * Upstash agotada) marcaba como `level: error` peticiones que devolvieron 200.
 * Sin filtrarlo, esto apuntaba al sitio equivocado. El estado de verdad esta en
 * `responseStatusCode`, no en el nivel de la linea.
 *
 * QUE COMPRUEBA ESTE BANCO
 * ------------------------
 * Lo esencial se EJECUTA, con `StorageService` sustituido por un doble en
 * memoria: guardar, leer, no encontrar, y barrer por edad. Asi se prueba la
 * regla sin tocar Supabase.
 */
//  `documentService` LANZA al cargarse si falta `URL_SIGNATURE_SECRET` (es una
//  guarda del lote F0-04: sin secreto, cualquiera podria forjar la firma de una
//  URL de descarga). En la verificacion no hay `.env`, asi que el banco se pone
//  uno de mentira ANTES de importar. No se toca si ya viene puesto.
process.env.URL_SIGNATURE_SECRET ||= 'secreto-de-banco-no-real';

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const SERVICIO = 'src/services/print/documentService.ts';
const DESCARGA = 'src/app/api/v1/documents/[uuid]/download/route.ts';
const ALMACEN = 'src/services/storageService.ts';

/** Las ocho rutas que dependen de esto. Escritas a mano: son el alcance real. */
const RUTAS = [
  'src/app/api/v1/ap/print/route.ts',
  'src/app/api/v1/ar/receipts/[id]/print/route.ts',
  'src/app/api/v1/ar/receipts/by-customer/print/route.ts',
  'src/app/api/v1/financial/statements/customers/[id]/print/route.ts',
  'src/app/api/v1/financial/statements/suppliers/[id]/print/route.ts',
  'src/app/api/v1/invoices/[id]/print/route.ts',
  'src/app/api/v1/quotes/[id]/print/route.ts',
  'src/app/api/v1/tools/print/route.ts',
];

async function main() {
  // Vale en los DOS estados: lo que el lote cambia es DONDE se guarda, no que
  // exista el mecanismo ni la firma de la URL.
  const servicio = leer(SERVICIO);
  if (!/static async saveTemporaryFile/.test(servicio) || !/generateSignedUrl/.test(servicio)) {
    throw new Error('Precondicion: DocumentService ya no guarda temporales ni firma URLs');
  }
  if (!/validateSignature/.test(leer(DESCARGA))) {
    throw new Error('Precondicion: la descarga ya no valida la firma');
  }
  //  LAS OCHO RUTAS VALEN EN LOS DOS ESTADOS: el lote cambia DONDE se guarda, no
  //  la firma de `saveTemporaryFile`, asi que como comprobacion regalaban ocho OK
  //  en la contraprueba. Son precondicion -- y de las utiles: si alguna dejara de
  //  llamarla, este banco estaria vigilando un alcance que ya no es el real.
  const sinLlamar = RUTAS.filter((r) => !/DocumentService\.saveTemporaryFile\(/.test(leer(r)));
  if (sinLlamar.length > 0) {
    throw new Error(`Precondicion: estas rutas ya no guardan un temporal: ${sinLlamar.join(', ')}`);
  }
  console.log(`  pre   el mecanismo, la URL firmada y las ${RUTAS.length} rutas que dependen de el siguen en pie`);

  console.log('\n2) Guardar, leer y barrer: ejecutado\n');

  // Doble en memoria de `StorageService`. Se sustituye en el modulo ya cargado,
  // que es lo que usa `DocumentService`.
  let D: typeof import('../src/services/print/documentService') | null = null;
  let S: typeof import('../src/services/storageService') | null = null;
  try {
    S = await import('../src/services/storageService');
    D = await import('../src/services/print/documentService');
  } catch { D = null; }

  const ETIQUETAS = [
    'lo guardado se puede leer despues',
    '  y va al bucket de temporales, no a un disco',
    'leer dos veces devuelve el documento las DOS veces',
    'lo que no existe devuelve null (y la ruta responde 404)',
    'un identificador que no es un UUID no se busca',
    'el barrido se lleva lo viejo y respeta lo nuevo',
  ];

  //  En la contraprueba el modulo existe pero NO tiene los metodos nuevos, y
  //  llamarlos revienta el banco entero en vez de fallar comprobacion a
  //  comprobacion. Se mira antes.
  const completo = !!D && !!S
    && typeof (D.DocumentService as { leerTemporal?: unknown }).leerTemporal === 'function'
    && typeof (D.DocumentService as { barrerViejos?: unknown }).barrerViejos === 'function'
    && typeof D.BUCKET_TEMPORALES === 'string';

  if (!completo || !D || !S) {
    for (const t of ETIQUETAS) falta(t, 'documentService no guarda los temporales en un bucket');
  } else {
    const { DocumentService, BUCKET_TEMPORALES } = D;
    const almacen = new Map<string, { contenido: Buffer; createdAt: string }>();
    const subidas: { bucket: string; ruta: string; tipo?: string }[] = [];

    const Store = S.StorageService as unknown as Record<string, unknown>;
    Store.uploadFile = async (bucket: string, ruta: string, contenido: Buffer, tipo?: string) => {
      subidas.push({ bucket, ruta, tipo });
      almacen.set(`${bucket}/${ruta}`, { contenido, createdAt: new Date().toISOString() });
      return ruta;
    };
    //  Se apunta CADA ruta pedida. Sin esto no se puede distinguir "el
    //  identificador se rechazo" de "se pidio y no estaba": las dos devuelven
    //  null, y un mutante que quitara la guarda de recorrido sobrevivia.
    const pedidos: string[] = [];
    Store.downloadFile = async (bucket: string, ruta: string) => {
      pedidos.push(`${bucket}/${ruta}`);
      const f = almacen.get(`${bucket}/${ruta}`);
      if (!f) throw new Error('not found');
      return f.contenido;
    };
    Store.listFiles = async (bucket: string) =>
      [...almacen.entries()]
        .filter(([k]) => k.startsWith(`${bucket}/`))
        .map(([k, v]) => ({ name: k.slice(bucket.length + 1), createdAt: v.createdAt }));
    Store.deleteFile = async (bucket: string, ruta: string) => { almacen.delete(`${bucket}/${ruta}`); };

    const contenido = Buffer.from('%PDF-1.4 un recibo');
    const id = await DocumentService.saveTemporaryFile(contenido, 'pdf');

    ok(ETIQUETAS[1], subidas.length === 1 && subidas[0].bucket === BUCKET_TEMPORALES
      && subidas[0].ruta === `${id}.pdf` && subidas[0].tipo === 'application/pdf',
      JSON.stringify(subidas[0]));

    const primera = await DocumentService.leerTemporal(id, 'pdf');
    ok(ETIQUETAS[0], primera?.toString() === contenido.toString());

    // LA CAUSA 2: antes se borraba al descargar, asi que la segunda peticion del
    // visor de PDF -- que siempre llega -- daba 404.
    const segunda = await DocumentService.leerTemporal(id, 'pdf');
    ok(ETIQUETAS[2], segunda?.toString() === contenido.toString());

    ok(ETIQUETAS[3], (await DocumentService.leerTemporal('7b1f0c34-0000-4000-8000-000000000000', 'pdf')) === null);
    // Un identificador con barras o puntos leeria otra carpeta del bucket. Lo que
    // se exige no es solo que devuelva null: que NO SE PIDA NADA al almacen.
    const antes = pedidos.length;
    const malos = ['../../otro/secreto', '', 'no-es-un-uuid', 'a/b', '.', '../' + id];
    const resultados = [];
    for (const malo of malos) resultados.push(await DocumentService.leerTemporal(malo, 'pdf'));
    ok(ETIQUETAS[4],
      resultados.every((r) => r === null) && pedidos.length === antes,
      `pedidos al almacen: ${pedidos.slice(antes).join(', ') || 'ninguno'}`);

    // El barrido por EDAD. Se envejece a mano una entrada.
    const viejo = `${BUCKET_TEMPORALES}/viejo.pdf`;
    almacen.set(viejo, { contenido, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
    const barridos = await DocumentService.barrerViejos();
    ok(ETIQUETAS[5],
      barridos === 1 && !almacen.has(viejo) && almacen.has(`${BUCKET_TEMPORALES}/${id}.pdf`),
      `barridos=${barridos}`);
    // Justo en el limite no se borra: una hora exacta todavia vale.
    almacen.set(`${BUCKET_TEMPORALES}/limite.pdf`, { contenido, createdAt: new Date(Date.now() - 59 * 60 * 1000).toISOString() });
    ok('  y no se lleva lo que aun no ha cumplido la hora',
      (await DocumentService.barrerViejos()) === 0 && almacen.has(`${BUCKET_TEMPORALES}/limite.pdf`));
    // Sin fecha no se decide: borrar a ciegas se llevaria el PDF de alguien que
    // esta a punto de abrirlo.
    almacen.set(`${BUCKET_TEMPORALES}/sinfecha.pdf`, { contenido, createdAt: null as unknown as string });
    ok('  ni lo que no dice cuando se creo',
      (await DocumentService.barrerViejos()) === 0 && almacen.has(`${BUCKET_TEMPORALES}/sinfecha.pdf`));
    // Limpiar no puede tumbar una impresion.
    Store.listFiles = async () => { throw new Error('el almacen no responde'); };
    ok('el barrido NUNCA lanza, aunque el almacen falle',
      (await DocumentService.barrerViejos()) === 0);
  }

  console.log('\n3) Ni el servicio ni la descarga tocan el disco\n');
  const codigoServicio = sinComentarios(servicio);
  ok('el servicio no escribe en disco',
    !/from 'fs/.test(codigoServicio) && !/fs\.(writeFile|mkdir|readFile|unlink|access)/.test(codigoServicio));
  ok('  ni conoce un directorio de temporales',
    !/PDF_TEMP_DIR/.test(codigoServicio) && !/os\.tmpdir/.test(codigoServicio));
  const descarga = leer(DESCARGA);
  const codigoDescarga = sinComentarios(descarga);
  ok('la descarga lee del bucket', /DocumentService\.leerTemporal\(uuid, extension\)/.test(codigoDescarga));
  ok('  y ya no del disco', !/fs\.readFile/.test(codigoDescarga) && !/from 'fs/.test(codigoDescarga));
  // LA CAUSA 2, en el sitio donde estaba.
  ok('descargar YA NO BORRA el documento',
    !/deleteTemporaryFile/.test(codigoDescarga) && !/setTimeout/.test(codigoDescarga));
  ok('  y el 404 ya no dice que fuera por haberlo descargado',
    !/already downloaded/.test(codigoDescarga) && /ya no está disponible/.test(codigoDescarga));
  ok('la firma se sigue validando antes de servir nada',
    codigoDescarga.indexOf('validateSignature') < codigoDescarga.indexOf('leerTemporal'));

  console.log('\n4) El almacen sabe listar (hace falta para barrer)\n');
  const almacenSrc = leer(ALMACEN);
  ok('StorageService.listFiles existe', /static async listFiles\(/.test(almacenSrc));
  ok('  y no lanza: devuelve lista vacia si falla', /return \[\];/.test(almacenSrc));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
