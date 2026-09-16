/**
 * Las opciones de `Sentry.init`, iguales para el servidor y el navegador (lote 153).
 *
 * Decidido por el dueño el 2026-09-16:
 *  - SOLO errores. Sin trazas de rendimiento (no se pone `tracesSampleRate`: sin
 *    el, el SDK no traza nada) y sin grabacion de sesiones (Replay no se añade).
 *  - El DSN no vive en el codigo: `NEXT_PUBLIC_SENTRY_DSN`, configurada en
 *    Vercel. Sin ella, `enabled: false` y no sale nada; asi el desarrollo local
 *    no llena Sentry de ruido.
 *  - Nada de datos personales: `sendDefaultPii: false` y todo evento pasa por
 *    `limpiarEvento` (ver filtroSentry.ts) antes de enviarse.
 */
import { limpiarEvento } from './filtroSentry';

type Evento = Parameters<typeof limpiarEvento>[0];

export function opcionesSentry() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: !!dsn,
    //  production / preview / development: los errores de una rama de vista
    //  previa no se mezclan con los de produccion.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend<E extends Evento>(evento: E, hint?: { originalException?: unknown }): E | null {
      return limpiarEvento(evento, hint?.originalException);
    },
    //  Las migas de consola llevan lo que se imprimio antes del error; se
    //  descartan ya al crearlas (limpiarEvento las quita otra vez al enviar).
    beforeBreadcrumb<B extends { category?: string }>(miga: B): B | null {
      return miga.category === 'console' ? null : miga;
    },
  };
}
