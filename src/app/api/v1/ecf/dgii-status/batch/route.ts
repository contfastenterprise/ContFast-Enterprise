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

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Debe proveer una lista de invoiceIds.' } },
        { status: 400, headers: resHeaders }
      );
    }

    if (invoiceIds.length > 100) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'El límite máximo es de 100 facturas por consulta.' } },
        { status: 400, headers: resHeaders }
      );
    }

    // Retrieve invoices for the logged-in company
    const foundInvoices = await db
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

    if (foundInvoices.length === 0) {
      return NextResponse.json(
        { success: true, data: [], message: 'No se encontraron facturas válidas para consultar.' },
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
    const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : 'https://ecf.api.mseller.app';

    const client = new MSellerClient({
      baseUrl,
      entorno,
      email: credenciales.email,
      password: credenciales.password,
      apiKeyEncrypted: credenciales.apiKeyEncrypted,
    });

    const batchResult = await client.getDocumentsStatusBatch(ncfsToQuery);

    if (!batchResult.success) {
      return NextResponse.json(
        { success: false, error: { code: 'MSELLER_ERROR', message: batchResult.message || 'Error en consulta batch.' } },
        { status: 500, headers: resHeaders }
      );
    }

    const updatedResults = [];

    for (const result of batchResult.results) {
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
        newStatus = lectura.estado;

        // Aqui habia una copia propia del bucle que saca los mensajes del
        // validador, mirando SOLO el primer nivel de `dgiiResponse`. Vive ahora
        // en `motivoDgii`, que recorre tambien las cadenas JSON anidadas.
        const motivo = motivoDgii(result.data);
        const displayMessage = motivo
          ? `Consulta batch - ${result.status}: ${motivo}`
          : `Consulta batch - Estado: ${result.status}`;

        // Always update database on sync to ensure fresh status and messages
        await db
          .update(invoices)
          .set({
            status: newStatus as any,
            dgiiMessage: displayMessage,
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
        const envio = await envioVigente(inv.id, auth.companyId, auth.modo);
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
            console.error(
              `[dgii-status/batch] no se pudo enviar el correo de la factura aceptada ${result.ecf}:`,
              correoErr
            );
          }
        }

        updatePerformed = true;
      }

      updatedResults.push({
        invoiceId: inv.id,
        ncf: result.ecf,
        found: result.found,
        dgiiStatus: result.status,
        status: newStatus,
        updated: updatePerformed,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: updatedResults,
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
