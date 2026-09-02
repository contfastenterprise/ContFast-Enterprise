/**
 * Consultar el veredicto de la DGII sin que nadie pulse un boton.
 *
 * POR QUE EXISTE
 * --------------
 * mSeller NO devuelve el veredicto al enviar. Devuelve la FIRMA -- el codigo de
 * seguridad y el QR, que los produce el -- y el veredicto de la DGII llega
 * despues, al consultar el estado. Son dos momentos distintos.
 *
 * Por eso `submitted` es el estado CORRECTO justo despues de emitir. El fallo
 * no era leer mal la respuesta: era que nadie volvia a preguntar. El
 * comprobante se quedaba en "Enviado" hasta que una persona abria la factura y
 * pulsaba "Sincronizar", y si no lo hacia, se quedaba asi para siempre.
 *
 * Esto hace lo mismo que ese boton, solo, para todos los pendientes.
 *
 * NO REENVIA NADA
 * ---------------
 * Solo CONSULTA. Reenviar un documento que la DGII pudo haber aceptado es
 * arriesgarse a duplicar un comprobante fiscal, y eso no se retira. Los que
 * quedaron en 'signed' -- emitidos localmente, nunca enviados -- son otro caso
 * y los atiende la cola de reenvio, no esto.
 *
 * EL ESTADO SE LEE EN UN SOLO SITIO
 * ---------------------------------
 * Usa `leerEstado`, igual que la emision. La ruta de sincronizacion manual
 * tiene todavia su propia copia de esa interpretacion, escrita a mano, y en esa
 * copia la comprobacion de "aceptado" va ANTES que la de "rechazado" -- de modo
 * que un "no aceptado" se leeria como aceptado. Aqui no se repite ese codigo a
 * proposito: una cuarta copia de la misma logica es como se desincronizaron
 * todas las demas.
 */
import { db, invoices, dgiiSubmissions, companies } from '@/db';
import { and, eq, isNull, gte, desc } from 'drizzle-orm';
import { entornoDgii, type ModoSistema } from '@/services/dgii/entorno';
import { credencialesMseller } from '@/services/dgii/credenciales';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { leerEstado, mensajeEstado, camposDeFirma } from '@/services/dgii/estadoEnvio';
import { leerCodigoSeguridad } from '@/services/dgii/codigoSeguridad';
import { envioVigente } from '@/repositories/dgiiSubmissionRepository';
import { Logger } from '@/utils/logger';

/** mSeller acepta como mucho 100 e-NCF por consulta. */
const MAXIMO_POR_LOTE = 100;

/**
 * Cuanto atras se mira. Un comprobante que lleva meses en 'submitted' ya no se
 * resuelve consultando: se mira a mano. El limite evita que cada pasada
 * arrastre el historico entero.
 */
const DIAS_ATRAS = 30;

export interface ResultadoSincronizacion {
  empresa: string;
  modo: string;
  consultados: number;
  aceptados: number;
  rechazados: number;
  sinCambio: number;
  /** e-NCF que mSeller dice no conocer pese a llevar rato enviados. */
  desconocidos: number;
  error?: string;
}

/**
 * Cuanto se espera antes de decir que mSeller "no conoce" un e-NCF.
 *
 * Un comprobante recien enviado puede tardar en aparecer en la consulta, asi
 * que un "no encontrado" a los dos minutos no significa nada. Pasado este rato
 * si significa algo: o no llego, o llego y se perdio.
 *
 * Importa porque un envio con desenlace desconocido -- una conexion cortada --
 * queda en `submitted` a proposito. Si ademas mSeller no lo reconoce nunca, hay
 * que verlo: es un NCF reservado que no existe en ninguna parte.
 */
const MINUTOS_PARA_DARLO_POR_NO_LLEGADO = 30;

/**
 * Consulta el estado de los comprobantes que siguen esperando veredicto.
 *
 * Recorre cada empresa y cada modo por separado, porque el ambiente de la DGII
 * y las credenciales dependen del modo: consultar un comprobante de PRUEBA
 * contra la DGII real seria preguntar por algo que ahi no existe.
 *
 * Un fallo en una empresa no detiene a las demas: se anota y se sigue. Si media
 * docena de empresas dependieran de que la primera tenga las credenciales
 * puestas, una configuracion incompleta pararia la sincronizacion de todas.
 */
export async function sincronizarPendientes(): Promise<ResultadoSincronizacion[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_ATRAS);

  // Los pendientes, con su empresa y su modo. Solo 'submitted': lo que nunca
  // llego a enviarse no se resuelve consultando, y es de la cola de reenvio.
  const pendientes = await db
    .select({
      id: invoices.id,
      ncf: invoices.ncf,
      companyId: invoices.companyId,
      modo: invoices.modo,
      emitida: invoices.createdAt,
      empresa: companies.name,
    })
    .from(invoices)
    .innerJoin(companies, eq(invoices.companyId, companies.id))
    .where(and(
      eq(invoices.status, 'submitted'),
      isNull(invoices.deletedAt),
      isNull(companies.deletedAt),
      gte(invoices.createdAt, desde),
    ))
    .orderBy(desc(invoices.createdAt))
    .limit(MAXIMO_POR_LOTE * 20);

  if (pendientes.length === 0) return [];

  // Agrupados por (empresa, modo): cada grupo es una consulta con sus propias
  // credenciales y su propio ambiente.
  const grupos = new Map<string, typeof pendientes>();
  for (const p of pendientes) {
    const clave = `${p.companyId}|${p.modo}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(p);
  }

  const salida: ResultadoSincronizacion[] = [];

  for (const [clave, grupo] of grupos) {
    const [companyId, modo] = clave.split('|');
    const empresa = grupo[0].empresa ?? companyId;
    const lote = grupo.slice(0, MAXIMO_POR_LOTE);
    const resumen: ResultadoSincronizacion = {
      empresa, modo, consultados: lote.length,
      aceptados: 0, rechazados: 0, sinCambio: 0, desconocidos: 0,
    };

    try {
      const entorno = entornoDgii(modo as ModoSistema);
      const credenciales = await credencialesMseller(companyId, entorno);

      const cliente = new MSellerClient({
        baseUrl: 'https://ecf.api.mseller.app',
        entorno,
        email: credenciales.email,
        password: credenciales.password,
        apiKeyEncrypted: credenciales.apiKeyEncrypted,
      });

      const respuesta = await cliente.getDocumentsStatusBatch(lote.map((i) => i.ncf!));
      if (!respuesta.success) {
        resumen.error = respuesta.message || 'La consulta no fue aceptada.';
        salida.push(resumen);
        continue;
      }

      const porNcf = new Map(lote.map((i) => [i.ncf, i]));
      const limite = new Date(Date.now() - MINUTOS_PARA_DARLO_POR_NO_LLEGADO * 60_000);

      for (const r of respuesta.results) {
        const factura = porNcf.get(r.ecf);
        if (!factura) continue;

        // mSeller NO LO CONOCE.
        //
        // Recien enviado no dice nada: tarda en aparecer. Pero pasado un rato
        // si dice algo, y hay que poder verlo. Antes esto era un `continue` y
        // el comprobante se quedaba en "Enviado" para siempre, sin que nadie
        // supiera que ahi habia un NCF reservado que no existe en la DGII.
        //
        // No se reenvia solo. Un "no encontrado" puede ser un fallo pasajero de
        // la consulta, y reenviar por si acaso es como se duplica un e-CF. Se
        // deja escrito para que una persona lo mire.
        if (!r.found) {
          if (factura.emitida && factura.emitida < limite) {
            resumen.desconocidos++;
            await db.update(invoices)
              .set({
                dgiiMessage:
                  'mSeller no reconoce este e-NCF ' +
                  `${MINUTOS_PARA_DARLO_POR_NO_LLEGADO} minutos despues de enviarlo. ` +
                  'Puede que no llegara. NO se ha reenviado, para no duplicarlo: ' +
                  'comprobar en el panel de mSeller antes de volver a emitir.',
                updatedAt: new Date(),
              })
              .where(and(eq(invoices.id, factura.id), eq(invoices.companyId, companyId)));
          } else {
            resumen.sinCambio++;
          }
          continue;
        }

        // La MISMA lectura que usa la emision. El rechazo se mira antes que la
        // aceptacion, porque "no aceptado" contiene "aceptado".
        const lectura = leerEstado(r.data ?? { status: r.status });

        // Solo se escribe cuando hay veredicto. Un pendiente que sigue siendo
        // pendiente no se toca: reescribirlo por reescribirlo solo sirve para
        // mover `updated_at` y perder la pista de cuando cambio de verdad.
        if (lectura.estado === 'submitted') { resumen.sinCambio++; continue; }

        const mensaje = mensajeEstado(lectura, null);

        await db.update(invoices)
          .set({
            status: lectura.estado,
            dgiiMessage: mensaje,
            // `camposDeFirma` solo trae lo que vino, asi que un dato ausente en
            // la respuesta de la consulta no borra el que dejo el envio.
            ...camposDeFirma(r.data),
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, factura.id), eq(invoices.companyId, companyId)));

        const envio = await envioVigente(factura.id, companyId, modo as any);
        if (envio) {
          const codigo = leerCodigoSeguridad(r.data);
          await db.update(dgiiSubmissions)
            .set({
              status: lectura.estado,
              responseMessage: mensaje,
              // El rastro de lo que contesto mSeller AL ENVIAR no se reescribe:
              // la respuesta de una consulta no lo lleva.
              securityCode: codigo || undefined,
              updatedAt: new Date(),
            })
            .where(and(eq(dgiiSubmissions.id, envio.id), eq(dgiiSubmissions.companyId, companyId)));
        }

        if (lectura.estado === 'accepted') resumen.aceptados++;
        else if (lectura.estado === 'rejected') resumen.rechazados++;
      }
    } catch (err: any) {
      // Una empresa mal configurada no puede parar a las demas.
      resumen.error = err?.message || 'Error desconocido';
      Logger.warn('[sincronizarPendientes] fallo en una empresa', {
        companyId, modo, error: resumen.error,
      });
    }

    salida.push(resumen);
  }

  return salida;
}
