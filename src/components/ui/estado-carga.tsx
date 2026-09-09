'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * "No pude cargarlo" no es lo mismo que "no hay nada".
 *
 * POR QUE EXISTE
 * --------------
 * Las listas del panel cargaban con un `catch` que solo hacia `console.error`,
 * o un toast que se va a los segundos. Cuando la carga fallaba -- red caida,
 * 500, sesion expirada -- la lista se quedaba vacia y la pantalla pintaba su
 * mensaje de "no se encontraron registros". Indistinguible de un vacio de
 * verdad, y encima persistente: el aviso desaparecia y el mensaje mentiroso se
 * quedaba.
 *
 * Cuentas por Pagar era el caso extremo: al fallar enseñaba un tilde verde y
 * "¡Al día con los proveedores!". Te felicitaba por no deber nada justo cuando
 * no habia podido comprobar si debias algo.
 *
 * COMO SE USA
 * -----------
 * La pantalla guarda el fallo en un estado que no se limpia solo, y donde
 * pintaba el vacio decide:
 *
 *     {errorCarga ? <ErrorDeCarga mensaje={errorCarga} onReintentar={cargar} />
 *                 : <SuVacioDeSiempre />}
 */
export function ErrorDeCarga({
  mensaje,
  onReintentar,
  className = '',
}: {
  mensaje: string;
  onReintentar?: () => void;
  className?: string;
}) {
  return (
    <div
      data-error-carga
      className={`flex flex-col items-center justify-center gap-3 py-16 px-6 text-center ${className}`}
    >
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <div>
        <p className="text-sm font-bold text-slate-800">No se pudieron cargar los datos</p>
        {/* El motivo, tal cual: sin el, reintentar es lo unico que se puede
            hacer, y si el fallo es de sesion o de permiso no se arregla
            reintentando. */}
        <p className="mt-1 text-xs text-slate-500 max-w-md">{mensaje}</p>
        <p className="mt-2 text-xs font-semibold text-amber-700">
          Esto NO significa que no haya registros: significa que no se pudieron leer.
        </p>
      </div>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-900 active:scale-95"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      )}
    </div>
  );
}

/**
 * El motivo de un fallo de carga, en una frase que sirva.
 *
 * Un `TypeError: Failed to fetch` no le dice nada a quien factura. Se traduce
 * lo que se reconoce y se deja pasar lo demas tal cual, que es mejor que
 * inventarse una explicacion.
 */
export function motivoDeCarga(err: unknown, mensajeApi?: string): string {
  if (mensajeApi && mensajeApi.trim()) return mensajeApi.trim();
  const e = err as { message?: string; name?: string } | undefined;
  const m = e?.message ?? '';
  if (e?.name === 'AbortError' || /timeout|timed out/i.test(m)) {
    return 'La consulta tardó demasiado y se canceló. Vuelve a intentarlo.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(m)) {
    return 'No se pudo contactar con el servidor. Revisa tu conexión.';
  }
  return m || 'Error inesperado al cargar los datos.';
}
