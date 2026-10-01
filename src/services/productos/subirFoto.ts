/**
 * Subir una foto de la empresa al deposito publico (lotes 234 y 235).
 *
 * Nacio dentro de `POST /api/v1/products/image` (la foto de un producto) y
 * sube aqui en el lote 235, cuando la imagen de la PORTADA de la tienda
 * necesito exactamente lo mismo con otro permiso. Una sola copia de las
 * reglas: el peso se mira ANTES de leer el fichero, lo que es una imagen lo
 * dicen sus bytes, y el nombre con que se guarda lo pone el servidor bajo la
 * empresa de la sesion -- nunca el del fichero subido.
 */
import { randomUUID } from 'crypto';
import { StorageService } from '@/services/storageService';
import {
  DEPOSITO_DE_FOTOS, direccionDeFoto, motivoParaNoAceptarFoto, PESO_MAXIMO_DE_FOTO, rutaDeFoto, tipoDeFoto,
} from './fotoDeProducto';

export type FotoSubida = { bien: true; imageUrl: string } | { bien: false; mensaje: string };

export async function subirFotoDeLaEmpresa(companyId: string, file: unknown): Promise<FotoSubida> {
  if (!(file instanceof File)) return { bien: false, mensaje: 'No se recibió ninguna imagen.' };
  //  Antes de leerlo entero: un fichero enorme no se carga en memoria.
  if (file.size > PESO_MAXIMO_DE_FOTO) {
    return { bien: false, mensaje: 'La imagen pesa más de 1 MB. Súbela desde el formulario, que la reduce sola.' };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const motivo = motivoParaNoAceptarFoto(bytes);
  const tipo = tipoDeFoto(bytes);
  if (motivo || !tipo) return { bien: false, mensaje: motivo ?? 'El archivo no es una imagen válida.' };

  const ruta = rutaDeFoto(companyId, randomUUID(), tipo.ext);
  await StorageService.uploadPublicFile(DEPOSITO_DE_FOTOS, ruta, bytes, tipo.mime);
  return { bien: true, imageUrl: direccionDeFoto(process.env.SUPABASE_URL || '', ruta) };
}
