import { eq } from 'drizzle-orm';
import { db, rncPadron } from '@/db';
import { Logger } from '@/utils/logger';
import { motivoDelError } from '@/utils/motivoDelError';
import { rncBuscable, estaActivo } from '@/services/dgii/padronDeRnc';

export interface RncLookupResult {
  success: boolean;
  rnc: string;
  name: string;
  status: string;
  message?: string;
  categoria?: string;
  regimen?: string;
  actividad_economica?: string;
  provincia?: string;
  municipio?: string;
}

/**
 * Consulta la razon social y el estado de un RNC o cedula.
 *
 * DE DONDE SALE ESTE CAMBIO (lote 198)
 * ------------------------------------
 * Hasta el 2026-09-26 esto llamaba a
 * `https://pptonanntevatndjyzmk.supabase.co/functions/v1/dgii-api`, un proxy de
 * TERCEROS ("dgiiapicloud") que **desaparecio**: su nombre ya no resuelve en DNS
 * (`fetch failed ← ENOTFOUND: getaddrinfo ENOTFOUND ...`, medido el 2026-09-25
 * cuando el dueño reporto que "buscar RNC" daba error). El mensaje que veia el
 * usuario era "Error de red al consultar DGII", que mentia dos veces: no consultaba
 * a la DGII, y no era un fallo de red pasajero -- no iba a volver nunca.
 *
 * Decision del dueño: usar la DGII. Y al medirlo salio que **su servicio web
 * tambien esta retirado**: `wsMovilDGII/WSMovilDGII.asmx` contesta 301 hacia el
 * portal, y `api.dgii.gov.do` no existe. Lo unico que la DGII publica es el padron
 * descargable, asi que el dato se importa a `rnc_padron` y se consulta aqui.
 *
 * LO QUE SE GANA: no depende de que nadie este levantado (ni la DGII), no lleva
 * clave de API, y responde en un acceso por clave primaria en vez de una peticion
 * por red de 30 segundos de plazo.
 *
 * LO QUE SE PIERDE, Y HAY QUE DECIRLO: el padron es una FOTO. Un contribuyente que
 * se registro despues de la ultima importacion no esta, y por eso el mensaje dice
 * **de cuando es el dato** en vez de afirmar que el RNC no existe. La DGII
 * republica el fichero cada pocos dias (medido: el 19/09 la version en linea tenia
 * 7 dias).
 *
 * NUNCA LANZA: quien llama ya decide. `EcfValidator` en modo no estricto registra y
 * sigue; las pantallas de clientes, suplidores y facturacion enseñan el mensaje y
 * dejan escribir el nombre a mano.
 */
export class DGIIService {
  static async lookupRNC(rnc: string): Promise<RncLookupResult> {
    const buscado = rncBuscable(rnc);
    //  La ruta ya valida la longitud, pero este servicio tambien lo llama
    //  `EcfValidator` con lo que traiga el comprobante: no se puede dar por hecho.
    if (!buscado) {
      return {
        success: false,
        rnc,
        name: '',
        status: '',
        message: 'El RNC o cédula debe tener 9 u 11 dígitos.',
      };
    }

    try {
      const [fila] = await db
        .select({
          rnc: rncPadron.rnc,
          nombre: rncPadron.nombre,
          comercial: rncPadron.nombreComercial,
          estado: rncPadron.estado,
          actividad: rncPadron.actividad,
        })
        .from(rncPadron)
        .where(eq(rncPadron.rnc, buscado))
        .limit(1);

      if (fila) {
        return {
          success: true,
          rnc: fila.rnc,
          name: fila.nombre,
          //  El estado va TAL COMO LO DICE LA DGII ("ACTIVO", "SUSPENDIDO", "DADO DE
          //  BAJA"): quien factura tiene que ver la palabra del Estado, no una
          //  traduccion nuestra.
          status: fila.estado || 'Desconocido',
          actividad_economica: fila.actividad || undefined,
          //  Un suplidor suele ser conocido por su nombre comercial, y la razon social
          //  no se parece. Se manda como dato aparte para que la pantalla elija.
          categoria: fila.comercial || undefined,
          //  Solo se avisa cuando NO esta activo: decirlo siempre seria ruido.
          message: estaActivo(fila.estado) ? undefined
            : `Atención: la DGII lo tiene como ${fila.estado || 'estado desconocido'}.`,
        };
      }

      //  NO ESTA. Hay dos motivos muy distintos y se dicen distinto, porque lo que
      //  hay que hacer es distinto: cargar el padron, o escribir el nombre a mano.
      const [alguna] = await db
        .select({ actualizado: rncPadron.actualizadoAt })
        .from(rncPadron)
        .limit(1);

      if (!alguna) {
        return {
          success: false,
          rnc: buscado,
          name: '',
          status: '',
          message: 'El padrón de RNC de la DGII no está cargado todavía. Escriba el nombre a mano.',
        };
      }

      const fecha = alguna.actualizado.toLocaleDateString('es-DO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      return {
        success: false,
        rnc: buscado,
        name: '',
        status: '',
        //  LA FECHA NO ES UN ADORNO: sin ella, "no está" suena a "no existe", y un
        //  contribuyente registrado la semana pasada existe perfectamente.
        message: `No está en el padrón de la DGII (cargado el ${fecha}). Si es un registro reciente, escriba el nombre a mano.`,
      };
    } catch (error: unknown) {
      //  AVISO, NO ERROR (lote 185): que la consulta falle es un caso previsto y
      //  quien llama ya decide. Con `console.error` esto abriria un incidente en
      //  Sentry por algo que el sistema tolera.
      //
      //  Con el motivo COMPLETO (lote 197): antes se registraba solo `error.message`,
      //  y el fallo de verdad viajaba en `cause` -- por eso el registro de produccion
      //  decia "fetch failed" durante semanas sin decir que el DNS no resolvia.
      Logger.warn('[rncLookup] no se pudo consultar el padrón; quien llama decide', {
        rnc: buscado,
        motivo: motivoDelError(error),
      });
      return {
        success: false,
        rnc: buscado,
        name: '',
        status: '',
        message: 'No se pudo consultar el padrón de RNC. Escriba el nombre a mano.',
      };
    }
  }
}
