/**
 * Manda el ticket de soporte por correo y lo deja registrado (lote 288).
 *
 * POR QUE EL ENVIO VA DENTRO DE LA PETICION, y no en `after()` ni en la cola
 * ---------------------------------------------------------------------------
 * Los avisos del panel salen en `after()` (lotes 199 y 205) porque el panel no debe
 * esperar al SMTP. Aqui es al reves: la pantalla tiene que poder decir "enviado" SOLO si
 * salio. Lo que se simulaba antes de este lote era justo eso -- decir "creado" sin que
 * nada saliera --, y responder antes de saber si el SMTP lo acepto seria la misma mentira
 * con otro mecanismo. Un correo tarda un segundo; el usuario espera con el boton en
 * "Enviando".
 *
 * EL DESTINO ES EL BUZON DE SOPORTE DE CONTFAST (`CORREO_DE_SOPORTE`, lote 308). Hasta
 * el 308 era el correo de la empresa de la sesion, y sin el no se intentaba nada.
 *
 * EL MISMO TRANSPORTE QUE TODO LO DEMAS: `getTransporter`/`getFromEmail` de
 * `utils/mailer.ts`, los que usan las facturas (`sendEmailJob`) y los avisos. Y el MISMO
 * REGISTRO: `system_email_logs` con la fila que decide `filaDeRegistro` (lote 157), con
 * contexto `soporte` y el identificador del ticket como referencia. Se registra salga o
 * falle.
 *
 * Las dependencias se inyectan para que el banco lo ejecute sin SMTP ni base: por defecto
 * se importan al usarse, asi que este modulo no arrastra `@/db` al cargarse (la leccion
 * del lote 178).
 */
import { randomBytes } from 'node:crypto';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { getTransporter, getFromEmail } from '@/utils/mailer';
import { motivoDelError, motivoParaLaPantalla } from '@/utils/motivoDelError';
import { CONTEXTOS_CORREO, filaDeRegistro, type FilaDeRegistro } from '@/services/correo/registroCorreo';
import {
  CORREO_DE_SOPORTE,
  correoDelTicket,
  identificadorDeTicket,
  type QuienEscribe,
  type TicketDeSoporte,
} from '@/services/soporte/ticketDeSoporte';

export interface MensajeSaliente {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

export interface DependenciasDelTicket {
  /** Manda el mensaje; lanza si el SMTP no lo acepta. Devuelve el id del proveedor. */
  mandar: (m: MensajeSaliente) => Promise<{ messageId?: string }>;
  /** Escribe la fila en `system_email_logs`. */
  registrar: (fila: FilaDeRegistro) => Promise<void>;
  /** Nombre y correo de quien escribe, y el nombre de su empresa. */
  quienEscribe: (userId: string, companyId: string) => Promise<QuienEscribe>;
  remitente: () => string;
  ahora: () => Date;
  bytes: () => Uint8Array;
}

export interface SesionDelTicket {
  userId: string;
  companyId: string;
  modo: ModoOperativo;
}

export type ResultadoDelTicket =
  | { enviado: true; id: string }
  | { enviado: false; codigo: 'ERROR_DE_ENVIO'; mensaje: string; id?: string };

const porDefecto: DependenciasDelTicket = {
  mandar: async (m) => {
    const info = await getTransporter().sendMail(m);
    return { messageId: info.messageId };
  },
  registrar: async (fila) => {
    const [{ db }, { systemEmailLogs }] = await Promise.all([import('@/db'), import('@/db/schema/system')]);
    //  El `modo` se repite a proposito, como en `sendEmailJob`: la columna tiene DEFAULT
    //  'PRODUCCION' y la prueba de aislamiento exige verlo en el propio INSERT.
    await db.insert(systemEmailLogs).values({ ...fila, modo: fila.modo });
  },
  quienEscribe: async (userId, companyId) => {
    const [{ db, users, companies }, { eq }] = await Promise.all([import('@/db'), import('drizzle-orm')]);
    const [[u], [c]] = await Promise.all([
      db.select({ nombre: users.name, correo: users.email }).from(users).where(eq(users.id, userId)).limit(1),
      db.select({ empresa: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1),
    ]);
    return { nombre: u?.nombre ?? '', correo: u?.correo ?? '', empresa: c?.empresa ?? '' };
  },
  remitente: () => getFromEmail('ContFast Soporte'),
  ahora: () => new Date(),
  bytes: () => randomBytes(6),
};

export async function enviarTicketDeSoporte(
  ticket: TicketDeSoporte,
  sesion: SesionDelTicket,
  deps: Partial<DependenciasDelTicket> = {},
): Promise<ResultadoDelTicket> {
  const d: DependenciasDelTicket = { ...porDefecto, ...deps };

  const quien = await d.quienEscribe(sesion.userId, sesion.companyId);

  const destino = CORREO_DE_SOPORTE;

  const id = identificadorDeTicket(d.bytes());
  const correo = correoDelTicket(ticket, id, quien, d.ahora());

  let estado: 'sent' | 'failed' = 'failed';
  let providerMessageId = '';
  let errorMessage = '';
  let mensajeAlUsuario = '';
  try {
    const info = await d.mandar({
      from: d.remitente(),
      to: destino,
      ...(correo.replyTo ? { replyTo: correo.replyTo } : {}),
      subject: correo.subject,
      text: correo.text,
      html: correo.html,
    });
    providerMessageId = info.messageId ?? '';
    estado = 'sent';
  } catch (err: unknown) {
    //  Con la causa entera para el registro (lote 197) y la mas honda para la pantalla.
    errorMessage = motivoDelError(err);
    mensajeAlUsuario = motivoParaLaPantalla(err);
    console.warn('[soporte] no salió el ticket', { id, motivo: errorMessage });
  }

  //  SE REGISTRA SALGA O FALLE (lote 157). Un fallo al registrar no cambia lo que pasó con
  //  el correo: si salió, salió, y decir lo contrario haría que el usuario lo reenviara.
  const fila = filaDeRegistro(
    {
      companyId: sesion.companyId,
      modo: sesion.modo,
      context: CONTEXTOS_CORREO.soporte,
      referenceId: id,
      userId: sesion.userId,
      to: destino,
      subject: correo.subject,
    },
    { status: estado, errorMessage, providerMessageId, ahora: d.ahora() },
  );
  if (fila) {
    try {
      await d.registrar(fila);
    } catch (err: unknown) {
      console.error('[soporte] el ticket no quedó registrado', { id, motivo: motivoDelError(err) });
    }
  }

  if (estado === 'sent') return { enviado: true, id };
  return {
    enviado: false,
    codigo: 'ERROR_DE_ENVIO',
    id,
    mensaje: `No se pudo enviar el ticket${mensajeAlUsuario ? `: ${mensajeAlUsuario}` : '.'} Inténtelo de nuevo; lo escrito se conserva.`,
  };
}
