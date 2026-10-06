/**
 * El ticket de soporte: que se acepta y como se escribe el correo (lote 288).
 *
 * POR QUE EXISTE
 * --------------
 * Hasta este lote la pantalla de Soporte SIMULABA el envio: esperaba 1,2 s con un
 * `setTimeout`, decia "Ticket de soporte creado" y no mandaba nada. Quien pedia ayuda
 * creia haberla pedido. Decision del dueño (2026-10-04): el ticket sale POR CORREO, por
 * el mismo SMTP que ya usan las facturas y los avisos, al CORREO DE LA EMPRESA de la sesion
 * (el campo de Configuracion > Empresa, `companies.email`). Primero se penso en una variable
 * de entorno (`SOPORTE_CORREO`); el dueño la descarto el mismo dia: el buzon es de cada
 * empresa y lo cambia ella misma, sin tocar Vercel.
 * LOTE 308 (decision del dueño, 2026-10-05): el ticket va al buzon de soporte de ContFast,
 * `contfastenterprise@gmail.com`, y no al de la empresa. Pedir ayuda es pedirsela a quien
 * mantiene el sistema; mandarlo al correo de la propia empresa era escribirse a si misma.
 * Ya no depende de que la empresa tenga su correo puesto.
 *
 * ESTE FICHERO ES PURO: ni base de datos ni SMTP, para que el banco lo ejecute. Quien lo
 * manda de verdad es `enviarTicketDeSoporte.ts`.
 *
 * TRES COSAS QUE SE PUEDEN EQUIVOCAR SIN QUE NADA FALLE
 * -----------------------------------------------------
 *  · **Lo que escribe el usuario es texto libre y va dentro de un HTML.** Sin escapar, un
 *    `<a href=...>` o un `<img src=...>` escrito en la descripcion llegaria al buzon de
 *    soporte como enlace o como imagen remota. Todo lo que viene de fuera pasa por
 *    `escaparHtml`, tambien el nombre de la empresa y el del usuario.
 *  · **El asunto es UNA linea.** Un salto dentro del asunto de un correo es la puerta de
 *    la inyeccion de cabeceras; el esquema lo rechaza en vez de "limpiarlo" en silencio.
 *  · **La fecha es la de RD**, no la del servidor (Vercel corre en UTC: a partir de las
 *    20:00 de RD ya seria mañana -- la trampa de los lotes 158 y 174).
 */
import { z } from 'zod';
import { DESFASE_RD_MS } from '@/utils/fechasLocales';
import { correoValido } from '@/services/avisos/avisoPorCorreo';

/** Las categorias que ofrece la pantalla, con el texto que se lee en el correo. */
export const CATEGORIAS_DE_SOPORTE = {
  billing: 'Facturación e-CF',
  cash: 'Módulo de Caja',
  bank: 'Bancos y Cuentas',
  account: 'Configuración / Empresa',
} as const;

export type CategoriaDeSoporte = keyof typeof CATEGORIAS_DE_SOPORTE;

/** Topes, los mismos para la pantalla (`maxLength`) y para el servidor. */
export const TOPES_DEL_TICKET = { asunto: 120, descripcion: 4000 } as const;

export const esquemaDelTicket = z.object({
  subject: z
    .string({ error: 'El asunto es obligatorio.' })
    .trim()
    .min(3, 'El asunto debe tener al menos 3 caracteres.')
    .max(TOPES_DEL_TICKET.asunto, `El asunto no puede pasar de ${TOPES_DEL_TICKET.asunto} caracteres.`)
    .refine((s) => !/[\r\n]/.test(s), 'El asunto debe ser una sola línea.'),
  category: z.enum(Object.keys(CATEGORIAS_DE_SOPORTE) as [CategoriaDeSoporte, ...CategoriaDeSoporte[]], {
    error: 'Elija una categoría de la lista.',
  }),
  message: z
    .string({ error: 'La descripción es obligatoria.' })
    .trim()
    .min(10, 'Describa el problema con al menos 10 caracteres.')
    .max(TOPES_DEL_TICKET.descripcion, `La descripción no puede pasar de ${TOPES_DEL_TICKET.descripcion} caracteres.`),
});

export type TicketDeSoporte = z.infer<typeof esquemaDelTicket>;

/** El primer motivo por el que el ticket no vale, o `null` si vale. */
export function validarTicket(
  cuerpo: unknown,
): { bien: true; ticket: TicketDeSoporte } | { bien: false; motivo: string } {
  const r = esquemaDelTicket.safeParse(cuerpo);
  if (r.success) return { bien: true, ticket: r.data };
  return { bien: false, motivo: r.error.issues[0]?.message ?? 'El ticket no es válido.' };
}

/** Escapa los cinco caracteres que cambian el sentido de un HTML. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A donde va el ticket: el buzon de soporte de ContFast (lote 308). Una constante y no una
 * variable de entorno, como se decidio en el 288: cambiarlo es un cambio de codigo, con su
 * lote, y no algo que se pierde en la configuracion de Vercel.
 */
export const CORREO_DE_SOPORTE = 'contfastenterprise@gmail.com';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I: se dicta por telefono

/**
 * Un identificador corto, "SOP-XXXXXX", para hablar del ticket con quien lo envio.
 *
 * No es unico garantizado (32^6 ≈ 10^9 combinaciones) ni lo necesita: es una referencia
 * para una conversacion, y va tambien al registro de correos con la empresa y la fecha.
 */
export function identificadorDeTicket(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFABETO[(bytes[i] ?? 0) % ALFABETO.length];
  return `SOP-${s}`;
}

/** 'dd-MM-aaaa hh:mm' en hora de RD (UTC-4 todo el año), sea cual sea la del servidor. */
export function fechaYHoraRD(instante: Date): string {
  const d = new Date(instante.getTime() - DESFASE_RD_MS);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}-${dos(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

export interface QuienEscribe {
  nombre: string;
  correo: string;
  empresa: string;
}

export interface CorreoDelTicket {
  subject: string;
  text: string;
  html: string;
  /** La respuesta de soporte va a quien escribio, no al buzon del sistema. */
  replyTo: string | undefined;
}

/** El correo que corresponde a un ticket. */
export function correoDelTicket(
  ticket: TicketDeSoporte,
  id: string,
  quien: QuienEscribe,
  ahora: Date,
): CorreoDelTicket {
  const categoria = CATEGORIAS_DE_SOPORTE[ticket.category];
  const fecha = fechaYHoraRD(ahora);
  const empresa = quien.empresa.trim() || '(sin nombre)';
  const nombre = quien.nombre.trim() || '(sin nombre)';
  //  Sin un correo valido no hay Reply-To: uno malo haria que la respuesta rebotara, y
  //  la direccion se repite en el cuerpo de todas formas.
  const replyTo = correoValido(quien.correo) ?? undefined;
  const correoTexto = replyTo ?? '(sin correo)';

  const filas: Array<[string, string]> = [
    ['Ticket', id],
    ['Empresa', empresa],
    ['Usuario', `${nombre} <${correoTexto}>`],
    ['Categoría', categoria],
    ['Fecha (hora de RD)', fecha],
  ];

  const text = [
    ...filas.map(([k, v]) => `${k}: ${v}`),
    `Asunto: ${ticket.subject}`,
    '',
    ticket.message,
  ].join('\n');

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b">',
    `<h2 style="color:#003366;margin:0 0 12px">${escaparHtml(ticket.subject)}</h2>`,
    '<table style="border-collapse:collapse;margin-bottom:16px">',
    ...filas.map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#64748b">${escaparHtml(k)}</td><td style="padding:2px 0">${escaparHtml(v)}</td></tr>`,
    ),
    '</table>',
    //  `white-space: pre-wrap` conserva los saltos de linea sin convertirlos a mano.
    `<div style="white-space:pre-wrap;border-top:1px solid #e2e8f0;padding-top:12px">${escaparHtml(ticket.message)}</div>`,
    '</div>',
  ].join('');

  return {
    subject: `[Soporte ${id}] ${empresa} — ${ticket.subject}`,
    text,
    html,
    replyTo,
  };
}
