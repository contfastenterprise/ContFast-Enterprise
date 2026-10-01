/**
 * Lote 234 -- la foto se reduce en el navegador antes de subir.
 *
 * Pedido del dueno al ver el lote: "codificar la imagen para que el servidor
 * no se llene rapido". `utils/reducirImagen.ts` usa `createImageBitmap` y
 * `canvas.toBlob`, que no existen en Node: aqui se EMPAQUETA la funcion de
 * verdad y se ejecuta en un Chromium, con imagenes generadas alli mismo. Leer
 * el fichero no demuestra que una foto de 12 megapixeles salga pesando poco.
 */
import { createRequire } from 'module';
import { join } from 'path';
import { existsSync } from 'fs';

const raiz = join(__dirname, '..');
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };

type Salida = { tipo: string; peso: number; ancho: number; alto: number; original: number; esquina: number[] } | { error: string };

async function main() {
  console.log('\n1) Las medidas, ejecutadas\n');
  type F = typeof import('../src/services/productos/fotoDeProducto');
  let M: F | null = null;
  try { M = await import('../src/services/productos/fotoDeProducto'); } catch { M = null; }
  const E1 = ['una foto grande se acota a 1.200 px por su lado mayor, sin deformar', 'una pequena NO se agranda',
    'el servidor no guarda nada de mas de 1 MB'];
  if (!M || !('medidasReducidas' in M)) falta(E1, 'no existe medidasReducidas');
  else {
    const m = M;
    const a = m.medidasReducidas(4000, 3000), b = m.medidasReducidas(3000, 4000), c = m.medidasReducidas(5000, 100);
    ok(E1[0], a.ancho === 1200 && a.alto === 900 && b.ancho === 900 && b.alto === 1200 && c.ancho === 1200 && c.alto === 24, JSON.stringify([a, b, c]));
    const p = m.medidasReducidas(640, 480);
    ok(E1[1], p.ancho === 640 && p.alto === 480 && m.medidasReducidas(1200, 1200).ancho === 1200);
    const justo = new Uint8Array(m.PESO_MAXIMO_DE_FOTO); justo.set([0xff, 0xd8, 0xff]);
    const pasado = new Uint8Array(m.PESO_MAXIMO_DE_FOTO + 1); pasado.set([0xff, 0xd8, 0xff]);
    ok(E1[2], m.PESO_MAXIMO_DE_FOTO === 1024 * 1024 && m.motivoParaNoAceptarFoto(justo) === null && /1 MB/.test(m.motivoParaNoAceptarFoto(pasado) ?? ''));
  }

  console.log('\n2) La reduccion, ejecutada en un navegador de verdad\n');
  const E2 = ['una foto de 12 megapixeles sale en WebP, a 1.200 px y por debajo de 1 MB', '  y pesa menos de la quinta parte de un original de varios MB',
    'una foto pequena conserva sus medidas', 'un PNG con transparencia no sale con fondo negro', 'lo que no es una imagen se rechaza, no se sube'];
  if (!existsSync(join(raiz, 'src/utils/reducirImagen.ts'))) { falta(E2, 'no existe utils/reducirImagen.ts'); return fin(); }

  //  esbuild viene con tsx; se pide desde alli porque pnpm no lo deja a la vista.
  const pedir = createRequire(createRequire(join(raiz, 'package.json')).resolve('tsx/package.json'));
  //  Con un tipo minimo propio: `typeof import('esbuild')` no compila, por lo mismo.
  const esbuild = pedir('esbuild') as { build: (o: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
  const paquete = await esbuild.build({
    stdin: { contents: `import { reducirImagen } from './src/utils/reducirImagen'; (globalThis).reducirImagen = reducirImagen;`, resolveDir: raiz, loader: 'ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': join(raiz, 'src') }, logLevel: 'silent',
  });
  const codigo = paquete.outputFiles[0].text;

  const puppeteer = (await import('puppeteer')).default;
  const navegador = await puppeteer.launch({ headless: true });
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent('<!doctype html><title>banco</title>');
    await pagina.addScriptTag({ content: codigo });
    const probar = (ancho: number, alto: number, modo: 'ruido' | 'transparente' | 'texto') => pagina.evaluate(async (w, h, modo) => {
      const reducir = (globalThis as unknown as { reducirImagen: (f: File) => Promise<File> }).reducirImagen;
      let original: File;
      if (modo === 'texto') original = new File(['esto no es una imagen'], 'foto.png', { type: 'image/png' });
      else {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d')!;
        if (modo === 'ruido') {
          //  Como una foto de camara: formas suaves con GRANO pixel a pixel, y
          //  guardada en JPEG de alta calidad. Bloques de color plano no valen:
          //  el PNG los comprime a casi nada, y una foto de verdad no es asi.
          const datos = x.createImageData(w, h);
          let semilla = 12345;
          for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k += 4) {
            semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
            const grano = (semilla >> 16) % 48;
            datos.data[k] = (128 + 90 * Math.sin(i / 97) + grano) & 255;
            datos.data[k + 1] = (128 + 90 * Math.sin(j / 61) + grano) & 255;
            datos.data[k + 2] = (128 + 90 * Math.sin((i + j) / 143) + grano) & 255;
            datos.data[k + 3] = 255;
          }
          x.putImageData(datos, 0, 0);
        } else { x.fillStyle = 'rgba(200,30,30,1)'; x.fillRect(w / 2, 0, w / 2, h); } // mitad izquierda TRANSPARENTE
        const formato = modo === 'ruido' ? 'image/jpeg' : 'image/png';
        const b: Blob = await new Promise((r) => c.toBlob((bb) => r(bb as Blob), formato, 0.95));
        original = new File([b], 'foto', { type: formato });
      }
      try {
        const f = await reducir(original);
        const mapa = await createImageBitmap(f);
        const l = document.createElement('canvas'); l.width = mapa.width; l.height = mapa.height;
        const y = l.getContext('2d')!; y.drawImage(mapa, 0, 0);
        return { tipo: f.type, peso: f.size, ancho: mapa.width, alto: mapa.height, original: original.size, esquina: [...y.getImageData(2, 2, 1, 1).data] };
      } catch (e) { return { error: (e as Error).message || String(e) }; }
    }, ancho, alto, modo) as Promise<Salida>;

    const grande = await probar(4000, 3000, 'ruido');
    ok(E2[0], !('error' in grande) && grande.tipo === 'image/webp' && grande.ancho === 1200 && grande.alto === 900 && grande.peso <= 1024 * 1024, JSON.stringify(grande));
    ok(E2[1], !('error' in grande) && grande.original > 3 * 1024 * 1024 && grande.peso < grande.original / 5, 'error' in grande ? grande.error : `${Math.round(grande.original / 1024)} KB -> ${Math.round(grande.peso / 1024)} KB`);
    const chica = await probar(320, 240, 'ruido');
    ok(E2[2], !('error' in chica) && chica.ancho === 320 && chica.alto === 240, JSON.stringify(chica));
    const trans = await probar(400, 400, 'transparente');
    //  En WebP la transparencia se conserva (alfa 0); si saliera JPEG, blanco. Nunca negro opaco.
    ok(E2[3], !('error' in trans) && (trans.esquina[3] === 0 || trans.esquina.slice(0, 3).every((v) => v > 240)), JSON.stringify(trans));
    const texto = await probar(1, 1, 'texto');
    ok(E2[4], 'error' in texto, JSON.stringify(texto));
  } finally {
    await navegador.close();
  }
  fin();
}

function fin() {
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
