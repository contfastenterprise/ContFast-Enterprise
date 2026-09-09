/**
 * Los fallos de un esquema como mapa campo -> mensaje.
 *
 * Lo comparten los formularios que validan con zod en los dos lados (compras,
 * facturas): el servidor lo manda en `error.fields` y la pantalla lo pinta
 * debajo de cada campo.
 *
 * Un campo puede fallar por mas de una regla; se queda con la primera, que es
 * la que hay que arreglar antes. La clave es la ruta con puntos
 * (`guaranteeCheck.checkNumber`, `lines.0.unitPrice`), y es la misma que usan
 * las pantallas en `data-campo`.
 */
import type { ZodError } from 'zod';

export function erroresPorCampo(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.map(String).join('.') || '_';
    if (!(clave in out)) out[clave] = issue.message;
  }
  return out;
}
