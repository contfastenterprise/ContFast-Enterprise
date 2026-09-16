/**
 * Sentry en el navegador (lote 153). Next carga este fichero antes que la app.
 *
 * Solo errores: sin `browserTracingIntegration` ni Replay, que son las dos
 * integraciones que grabarian navegacion y pantallas (con RNC, montos y
 * clientes). Los errores sin atrapar llegan por los manejadores globales del
 * SDK; los que rompen el arbol de React, por `app/global-error.tsx`.
 */
import * as Sentry from '@sentry/nextjs';
import { opcionesSentry } from './lib/observabilidad/opcionesSentry';

Sentry.init(opcionesSentry());
