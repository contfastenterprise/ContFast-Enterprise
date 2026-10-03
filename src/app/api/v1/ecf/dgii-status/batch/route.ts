import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { db, dgiiSubmissions, companySettings, invoices } from '@/db';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { entornoDgii } from '@/services/dgii/entorno';
import { credencialesMseller } from '@/services/dgii/credenciales';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { envioVigente } from '@/repositories/dgiiSubmissionRepository';
import { leerCodigoSeguridad } from '@/services/dgii/codigoSeguridad';
import { camposDeFirma, leerEstado, motivoDgii } from '@/services/dgii/estadoEnvio';
import { enviarFacturaPorCorreo } from '@/services/invoice/correoFactura';
import { Logger } from '@/utils/logger';
import { baseUrlMseller } from '@/services/dgii/urlMseller';
import { filtroDelCuerpo } from '@/services/dgii/filtroDelListadoEcf';
import { facturasParaConsultar, type FacturaParaConsultar } from '@/services/dgii/facturasParaConsultar';
import { MAXIMO_POR_CONSULTA, enTandas, estadoTrasConsultar } from '@/services/dgii/consultaDeEstado';

export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'read');

    const body = await req.json().catch(() => ({}));
    const { invoiceIds } = body;

    //  DOS FORMAS DE DECIR QUE CONSULTAR (lote 260).
    //
    //  `invoiceIds`: las que alguien eligio (la seleccion de la tabla).
    //  `filtro`: TODAS las del filtro de la pantalla, no solo la pagina que se
    //  ve. Antes el boton mandaba los ids de la pagina visible, asi que con el
    //  filtro "Enviado" y tres paginas, dos se quedaban sin consultar sin que
    //  nada lo dijera. El filtro se resuelve AQUI, con las mismas condiciones
    //  que el listado (`condicionesDelFiltro`).
    const filtro = Array.isArray(invoiceIds) ? null : filtroDelCuerpo(body?.filtro);

    if (!filtro && (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Debe proveer una lista de invoiceIds o un filtro.' } },
        { status: 400, headers: resHeaders }
      );
    }

    if (!filtro && invoiceIds.length > MAXIMO_POR_CONSULTA) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: `El límite máximo es de ${MAXIMO_POR_CONSULTA} facturas por consulta.` } },
        { status: 400, headers: resHeaders }
      );
    }

    const alcance = { companyId: auth.companyId, modo: auth.modo };
    let sinConsultar = 0;
    let recortadas = 0;
    let foundInvoices: FacturaParaConsultar[];

    if (filtro) {
      //  Del filtro solo se consulta lo que todavia puede cambiar; lo demas se
      //  cuenta para decirlo. Ver `facturasParaConsultar`.
      const r = await facturasParaConsultar(alcance, filtro);
      foundInvoices = r.facturas;
      sinConsultar = r.sinConsultar;
      recortadas = r.recortadas;
    } else {
      // Retrieve invoices for the logged-in company
      foundInvoices = await db
        .select({
          id: invoices.id,
          ncf: invoices.ncf,
          status: invoices.status,
          msellerTrackId: invoices.msellerTrackId,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, auth.companyId),
            // Los ids llegan en el cuerpo de la peticion sin comprobar contra el
            // entorno de la sesion. Sin este filtro, una sesion de PRUEBA podia
            // mandar ids de facturas REALES de su empresa, traerselas y -- mas
            // abajo -- sobrescribirles el estado y el mensaje de la DGII con el
            // resultado de una consulta hecha contra el ambiente de pruebas.
            // La incoherencia estaba a la vista: el UPDATE del envio SI filtraba
            // por modo y el de la factura no, asi que la factura se tocaba en un
            // entorno y su envio en otro.
            eq(invoices.modo, auth.modo),
            isNull(invoices.deletedAt),
            inArray(invoices.id, invoiceIds)
          )
        );
    }

    const resumen = { sinConsultar, recortadas, fallo: null as string | null };

    if (foundInvoices.length === 0) {
      return NextResponse.json(
        { success: true, data: [], meta: resumen, message: 'No se encontraron facturas válidas para consultar.' },
        { headers: resHeaders }
      );
    }

    // Build mapping and list of NCFs to query
    const ncfToInvoiceMap = new Map<string, typeof foundInvoices[0]>();
    const ncfsToQuery: string[] = [];

    for (const inv of foundInvoices) {
      if (inv.ncf) {
        ncfToInvoiceMap.set(inv.ncf, inv);
        ncfsToQuery.push(inv.ncf);
      }
    }

    // Load credentials
    const [settings] = await db
      .select()
      .from(companySettings)
      .where(and(eq(companySettings.companyId, auth.companyId), isNull(companySettings.deletedAt)))
      .limit(1);

    // El entorno lo decide el MODO de la sesion por encima del ajuste de la
    // empresa: consultar en modo PRUEBA no puede acabar preguntandole a la DGII
    // real. Y las credenciales se piden PARA ese entorno, porque la clave de
    // API es distinta en cada uno.
    //
    // El respaldo a las variables de entorno globales que habia aqui era una
    // fuga entre empresas: una sin credenciales propias consultaba con la
    // cuenta de mSeller de OTRA, y no fallaba. Ahora falla y dice cual falta.
    const entorno = entornoDgii(auth.modo);

    let credenciales;
    try {
      credenciales = await credencialesMseller(auth.companyId, entorno);
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_CONFIG', message: (err as Error).message } },
        { status: 500, headers: resHeaders }
      );
    }
    const msellerUrl = settings?.msellerUrl || 'https://api.mseller.app/v1';
    //  Misma correccion que en la consulta individual: esto tiraba una URL
    //  propia y la sustituia por la de por defecto.
    const baseUrl = baseUrlMseller(msellerUrl);

    const client = new MSellerClient({
      baseUrl,
      entorno,
      email: credenciales.email,
      password: credenciales.password,
      apiKeyEncrypted: credenciales.apiKeyEncrypted,
    });

    //  mSeller acepta 100 e-NCF por consulta; el filtro puede traer mas. Si una
    //  tanda falla despues de otras buenas, lo ya consultado se guarda y se
    //  dice que la consulta se corto; si falla la primera, error como antes.
    const resultados: Awaited<ReturnType<typeof client.getDocumentsStatusBatch>>['results'] = [];
    for (const tanda of enTandas(ncfsToQuery, MAXIMO_POR_CONSULTA)) {
      const batchResult = await client.getDocumentsStatusBatch(tanda);
      if (!batchResult.success) {
        const motivo = batchResult.message || 'Error en consulta batch.';
        if (resultados.length === 0) {
          return NextResponse.json(
            { success: false, error: { code: 'MSELLER_ERROR', message: motivo } },
            { status: 500, headers: resHeaders }
          );
        }
        resumen.fallo = motivo;
        break;
      }
      resultados.push(...batchResult.results);
    }

    const updatedResults = [];

    for (const result of resultados) {
      const inv = ncfToInvoiceMap.get(result.ecf);
      if (!inv) continue;

      let newStatus = inv.status;
      let updatePerformed = false;

      if (result.found) {
        // EL ESTADO SE LEE EN UN SOLO SITIO.
        //
        // Aqui habia una copia propia de la interpretacion. Con la de la
        // sincronizacion individual y la de `estadoEnvio` eran TRES cadenas de
        // `includes` haciendo lo mismo, y esta comprobaba "acept" ANTES que
        // "rechaz": un "No Aceptado" se habria leido como ACEPTADO.
        //
        // Lo que SI se conserva es juntar los mensajes del validador de la
        // DGII, porque eso `leerEstado` no lo hace y es lo que explica al
        // usuario POR QUE se rechazo.
        const lectura = leerEstado(result.data ?? { status: result.status });
        //  Una consulta no deshace un veredicto definitivo (lote 260): una
        //  aceptada o una dada de baja se quedan como estan aunque mSeller diga
        //  otra cosa. Ver `consultaDeEstado.ts`, con los dos casos medidos.
        const tras = estadoTrasConsultar(inv.status, lectura.estado);
        newStatus = tras.estado;
        if (tras.protegido) {
          Logger.warn('[dgii-status/batch] la consulta contradice un estado definitivo; no se cambia', {
            invoiceId: inv.id, ncf: result.ecf, estado: inv.status, leido: lectura.estado,
          });
        }

        // Aqui habia una copia propia del bucle que saca los mensajes del
        // validador, mirando SOLO el primer nivel de `dgiiResponse`. Vive ahora
        // en `motivoDgii`, que recorre tambien las cadenas JSON anidadas.
        const motivo = motivoDgii(result.data);
        const displayMessage = motivo
          ? `Consulta batch - ${result.status}: ${motivo}`
          : `Consulta batch - Estado: ${result.status}`;

        // Always update database on sync to ensure fresh status and messages
        // -- salvo estado y mensaje cuando la consulta contradice un veredicto
        // definitivo: la firma se sigue recuperando, que es para lo que sirve
        // consultar una aceptada.
        await db
          .update(invoices)
          .set({
            ...(tras.protegido ? {} : { status: newStatus as any, dgiiMessage: displayMessage }),
            // DB-22: la firma que devuelve mSeller se guarda en la FACTURA, que es
            // donde nada la pisa. `camposDeFirma` solo trae lo que vino, asi que
            // un dato ausente no aparece en el objeto y este `set` NUNCA sustituye
            // un valor bueno por uno vacio.
            ...camposDeFirma(result.data),
            updatedAt: new Date()
          })
          .where(and(eq(invoices.id, inv.id), eq(invoices.companyId, auth.companyId)));
        
        // Mismo arreglo que en la sincronizacion individual: se actualiza UN
        // envio -- el vigente -- y no todas las filas de la factura; y la
        // respuesta de la consulta no puede borrar el codigo de seguridad que
        // dejo el envio. Ver el comentario largo en
        // src/app/api/v1/ecf/[id]/dgii-status/route.ts.
        const envio = tras.protegido ? null : await envioVigente(inv.id, auth.companyId, auth.modo);
        if (envio) {
          const codigoConsultado = leerCodigoSeguridad(result.data);

          await db
            .update(dgiiSubmissions)
            .set({
              status: newStatus as any,
              responseMessage: displayMessage,
              // El `response_payload` del envio ya no se reescribe desde una
              // consulta de estado: ver la nota en la sincronizacion individual.
              // La firma se guarda en la factura, unas lineas mas arriba.
              securityCode: codigoConsultado || undefined,
              updatedAt: new Date(),
            })
            .where(and(
              eq(dgiiSubmissions.id, envio.id),
              eq(dgiiSubmissions.companyId, auth.companyId)
            ));
        }

        // El documento y el correo salen con la aceptacion, tambien por aqui.
        //
        // Este es el boton "Sincronizar" del listado de e-CF, o sea el camino que
        // mas se usa. Sin esto, sincronizar dejaba la factura en aceptada y no
        // generaba el PDF ni mandaba el correo: quedaba aceptada y muda.
        //
        // `enviarFacturaPorCorreo` toma la marca `customer_email_sent_at` con
        // `IS NULL` en el propio UPDATE, asi que si otra via vio antes la misma
        // transicion el cliente recibe un correo y no dos. Y el fallo se traga:
        // que falle un correo no puede tumbar la sincronizacion de las demas.
        if (inv.status !== 'accepted' && newStatus === 'accepted') {
          try {
            await enviarFacturaPorCorreo({
              invoiceId: inv.id,
              companyId: auth.companyId,
              modo: auth.modo,
              esReenvio: false,
            });
          } catch (correoErr: unknown) {
            // Mismo rastro que las otras dos vias. Aqui importa el doble: son
            // muchas facturas de una pasada, y sin el id no hay forma de saber
            // a cual de todas le fallo el correo.
            Logger.warn('[dgii-status/batch] no se pudo enviar el correo de la factura aceptada', {
              invoiceId: inv.id, ncf: result.ecf, error: (correoErr as Error)?.message,
            });
          }
        }

        updatePerformed = true;
      }

      const cambio = newStatus !== inv.status;

      updatedResults.push({
        invoiceId: inv.id,
        ncf: result.ecf,
        found: result.found,
        dgiiStatus: result.status,
        status: newStatus,
        updated: updatePerformed,
        cambio,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: updatedResults,
        meta: resumen,
      },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error in POST /api/v1/ecf/dgii-status/batch:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
