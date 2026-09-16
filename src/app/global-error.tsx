'use client';

/**
 * Lote 153: el error que rompe la aplicacion entera en el navegador (incluido
 * el layout raiz). No habia ni `global-error` ni ningun `error.tsx`: la pantalla
 * se quedaba en blanco y nadie se enteraba. Se reporta a Sentry y se ofrece
 * reintentar.
 *
 * Tiene que llevar su propio <html> y <body>: sustituye al layout raiz.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', color: '#0f172a' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Algo salió mal</h2>
        <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1.25rem' }}>
          El error quedó registrado. Puedes intentarlo de nuevo.
          {error.digest ? ` (Referencia: ${error.digest})` : ''}
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{ background: '#003366', color: '#fff', border: 0, borderRadius: '0.5rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Intentar de nuevo
        </button>
      </body>
    </html>
  );
}
