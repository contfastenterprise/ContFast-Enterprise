import * as Sentry from '@sentry/nextjs';
import { opcionesSentry } from './lib/observabilidad/opcionesSentry';
import { errorDeLaLlamada } from './lib/observabilidad/filtroSentry';

// Lote 153: los errores de servidor que NADIE atrapa (un throw que sale de una
// ruta, de un Server Component o de una accion) los entrega Next aqui.
export const onRequestError = Sentry.captureRequestError;

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Lote 153: Sentry, antes que nada (ver lib/observabilidad/opcionesSentry.ts:
    // solo errores, sin datos personales, apagado si no hay DSN).
    Sentry.init(opcionesSentry());

    // Global console interceptor in production for structured logging (JSON)
    if (process.env.NODE_ENV === 'production') {
      const originalLog = console.log;
      const originalInfo = console.info;
      const originalWarn = console.warn;
      const originalError = console.error;

      const formatMessage = (level: string, args: any[]) => {
        const timestamp = new Date().toISOString();
        let message = '';
        let context: any = undefined;

        // Helper to serialize Error instances into plain objects
        const serializeArg = (arg: any): any => {
          if (arg instanceof Error) {
            return {
              name: arg.name,
              message: arg.message,
              stack: arg.stack,
            };
          }
          return arg;
        };

        if (args.length > 0) {
          const firstArg = args[0];
          if (firstArg instanceof Error) {
            message = firstArg.message;
            context = {
              stack: firstArg.stack,
              name: firstArg.name,
              ...(args.length > 1 ? { extra: args.slice(1).map(serializeArg) } : {}),
            };
          } else if (typeof firstArg === 'string') {
            message = firstArg;
            if (args.length > 1) {
              context = args.slice(1).map(serializeArg);
            }
          } else {
            message = 'Structured log entry';
            context = args.map(serializeArg);
          }
        }

        return JSON.stringify({
          timestamp,
          level,
          message,
          ...(context ? { context } : {}),
        });
      };

      console.log = (...args: any[]) => originalLog(formatMessage('INFO', args));
      console.info = (...args: any[]) => originalInfo(formatMessage('INFO', args));
      console.warn = (...args: any[]) => originalWarn(formatMessage('WARN', args));
      // Lote 153: la mayoria de las rutas ATRAPAN su error, lo escriben con
      // `console.error` (o `Logger.error`, que es lo mismo) y devuelven un 500:
      // `onRequestError` no llega a verlos. Se reportan desde aqui, sin tocar
      // ninguna ruta, y solo cuando la llamada lleva un Error de verdad (un
      // texto suelto no es un fallo). Los que el codigo lanza con estado 4xx
      // (una regla de negocio) los descarta `limpiarEvento`. `reportando`
      // evita el bucle si el propio envio escribiera un error por consola.
      let reportando = false;
      console.error = (...args: any[]) => {
        originalError(formatMessage('ERROR', args));
        const error = errorDeLaLlamada(args);
        if (!error || reportando) return;
        reportando = true;
        try {
          Sentry.captureException(error);
        } catch {
          // Reportar nunca puede romper a quien estaba escribiendo el error.
        } finally {
          reportando = false;
        }
      };
    }

    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.log('[Instrumentation] Build phase detected. Skipping background BullMQ workers.');
      return;
    }
    console.log('[Instrumentation] Starting background BullMQ workers...');
    await import('./infrastructure/worker');

    // Los PDF temporales que escribe DocumentService.saveTemporaryFile() (lo usan
    // 8 rutas de impresion vivas: facturas, cotizaciones, recibos, estados de
    // cuenta, AP, tools) solo se borraban al descargarlos, en
    // documents/[uuid]/download. Todo PDF generado y NO descargado -- la URL
    // firmada vence a los 10 minutos, el usuario cierra la pestana -- se quedaba
    // en disco indefinidamente. El barrido periodico ya existia (cleanupWorker en
    // services/jobs/reportQueue.ts) pero nadie llamaba a setupRecurringJobs(), asi
    // que el cron nunca llegaba a programarse.
    try {
      const { setupRecurringJobs } = await import('./services/jobs/reportQueue');
      await setupRecurringJobs();
    } catch (err: unknown) {
      // Nunca debe impedir el arranque de la aplicacion.
      console.error(
        '[Instrumentation] No se pudo programar el barrido de temporales:',
        (err as Error).message
      );
    }
  }
}
