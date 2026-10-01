/**
 * Reducir una foto EN EL NAVEGADOR antes de subirla (lote 234). Pedido del
 * dueno: "codificar la imagen para que el servidor no se llene rapido".
 *
 * Una foto de movil pesa 3-8 MB y mide 4.000 px; la tienda la ensena en una
 * tarjeta. Se redibuja en un lienzo con el lado mayor acotado y se codifica en
 * WebP (o JPEG si el navegador no sabe WebP), bajando la calidad hasta caber en
 * `pesoMaximo`. Sin dependencias: `createImageBitmap` y `canvas.toBlob`.
 *
 * NO es la proteccion del almacenamiento -- esa es el tope de la ruta, que
 * rechaza lo que pase de 1 MB --: es lo que hace que una foto normal quepa.
 *
 * Solo corre en el navegador; las medidas las decide `medidasReducidas`, que
 * es pura y la ejecuta el banco.
 */
import { CALIDADES_DE_FOTO, LADO_MAXIMO_DE_FOTO, medidasReducidas, PESO_MAXIMO_DE_FOTO } from '@/services/productos/fotoDeProducto';

const aBlob = (lienzo: HTMLCanvasElement, tipo: string, calidad: number) =>
  new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, tipo, calidad));

export async function reducirImagen(file: File, lado = LADO_MAXIMO_DE_FOTO, pesoMaximo = PESO_MAXIMO_DE_FOTO): Promise<File> {
  //  `from-image`: respeta el giro que el movil guarda en la foto (EXIF).
  const mapa = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { ancho, alto } = medidasReducidas(mapa.width, mapa.height, lado);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo preparar la imagen.');

    for (const tipo of ['image/webp', 'image/jpeg'] as const) {
      ctx.clearRect(0, 0, ancho, alto);
      //  JPEG no tiene transparencia: sin fondo, lo transparente saldria NEGRO.
      if (tipo === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ancho, alto); }
      ctx.drawImage(mapa, 0, 0, ancho, alto);
      for (const calidad of CALIDADES_DE_FOTO) {
        const blob = await aBlob(lienzo, tipo, calidad);
        //  Un navegador que no sabe el formato devuelve PNG sin avisar: se mira el tipo.
        if (blob && blob.type === tipo && blob.size <= pesoMaximo) {
          return new File([blob], tipo === 'image/webp' ? 'foto.webp' : 'foto.jpg', { type: tipo });
        }
      }
    }
    throw new Error('No se pudo reducir la imagen lo suficiente. Prueba con otra.');
  } finally {
    mapa.close();
  }
}
