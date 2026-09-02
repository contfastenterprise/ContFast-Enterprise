/**
 * El despertador de la sincronizacion.
 *
 * QUE HACE
 * --------
 * Llama a `sincronizarPendientes`, que consulta a la DGII el veredicto de los
 * comprobantes que siguen en "Enviado". Solo CONSULTA: no reenvia nada.
 *
 * QUIEN LO LLAMA
 * --------------
 * Cualquier programador de tareas. En el plan Hobby de Vercel los cron corren
 * una vez al dia, que para esto no sirve, asi que lo dispara un servicio
 * externo (cron-job.org, GitHub Actions) cada pocos minutos. En Pro lo puede
 * hacer el cron de Vercel. El codigo es el mismo en los dos casos.
 *
 * COMO SE PROTEGE
 * ---------------
 * Esta ruta no lleva sesion de usuario -- no hay nadie delante cuando corre --
 * y toca los comprobantes de TODAS las empresas. Sin proteccion seria una
 * puerta abierta para provocar consultas contra la DGII desde fuera.
 *
 * Exige `Authorization: Bearer <CRON_SECRET>`. Sin `CRON_SECRET` configurado la
 * ruta NO funciona: devuelve 503 y no hace nada. Es deliberado -- una ruta que
 * se abre sola cuando falta su secreto es peor que una que no arranca.
 *
 * La comparacion es de tiempo constante. Un `===` sobre cadenas corta en el
 * primer caracter distinto, y esa diferencia de tiempo deja adivinar el secreto
 * caracter a caracter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { sincronizarPendientes } from '@/services/dgii/sincronizarPendientes';
import { Logger } from '@/utils/logger';

// Consultar varias empresas contra mSeller lleva su tiempo.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` exige la misma longitud, y comparar longitudes ya filtra.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const esperado = process.env.CRON_SECRET;

  if (!esperado || esperado.trim() === '') {
    Logger.warn('[cron/sincronizar-ecf] CRON_SECRET no esta configurado: la ruta no se ejecuta.');
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CRON_NO_CONFIGURADO',
          message: 'Falta CRON_SECRET. La sincronizacion automatica esta desactivada a proposito.',
        },
      },
      { status: 503 }
    );
  }

  const cabecera = req.headers.get('authorization');
  const recibido = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!secretoValido(recibido, esperado)) {
    // Sin detalles: un mensaje que distinga "falta" de "no coincide" ayuda a
    // quien esta probando a ciegas.
    return NextResponse.json(
      { success: false, error: { code: 'NO_AUTORIZADO', message: 'No autorizado.' } },
      { status: 401 }
    );
  }

  try {
    const inicio = Date.now();
    const resultados = await sincronizarPendientes();
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

    const totales = resultados.reduce(
      (acc, r) => ({
        consultados: acc.consultados + r.consultados,
        aceptados: acc.aceptados + r.aceptados,
        rechazados: acc.rechazados + r.rechazados,
        sinCambio: acc.sinCambio + r.sinCambio,
        desconocidos: acc.desconocidos + r.desconocidos,
        conError: acc.conError + (r.error ? 1 : 0),
      }),
      { consultados: 0, aceptados: 0, rechazados: 0, sinCambio: 0, desconocidos: 0, conError: 0 }
    );

    Logger.info('[cron/sincronizar-ecf] pasada completada', { ...totales, segundos });

    return NextResponse.json({
      success: true,
      data: { segundos, totales, porEmpresa: resultados },
    });
  } catch (error: any) {
    Logger.error('[cron/sincronizar-ecf] fallo la pasada', { error: error?.message });
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message: error?.message || 'Error desconocido.' } },
      { status: 500 }
    );
  }
}
