/**
 * Lo que pide el registro publico: la cuenta de quien se registra Y su empresa.
 *
 * DE DONDE SALE (lote 287)
 * ------------------------
 * Hasta este lote, `POST /api/v1/auth/register` creaba cada empresa con datos
 * FIJOS: "Empresa Demo S.R.L.", RNC 101001001, "Servicios Generales". La segunda
 * persona que se registrara chocaba con el indice unico de `companies.rnc` (500), y
 * la primera tenia una empresa con un RNC que no es el suyo -- el que sale impreso
 * en cada factura. Decision del dueño (2026-10-04): el registro sigue ABIERTO, pero
 * la empresa nace con su razon social y su RNC de verdad. Medido: nunca se habia
 * usado (0 empresas "Empresa Demo"), asi que no hay datos que tocar.
 *
 * EL NOMBRE `rncEmpresa`, Y NO `rnc`, ES A PROPOSITO
 * --------------------------------------------------
 * En esta ruta `rnc` significaba "unirme a la empresa que ya existe con este RNC",
 * y la auditoria F0-02 cerro esa puerta con un 403 (el RNC es un dato publico:
 * bastaba para entrar como administracion en un tenant ajeno). Reutilizar el
 * nombre para la empresa NUEVA dejaria el mismo campo diciendo dos cosas, y el dia
 * que alguien "simplifique" el freno, volveria el agujero. `rncEmpresa` es la
 * empresa que se crea; `rnc` sigue siendo lo que se rechaza siempre.
 *
 * El esquema es UNO para la pantalla y la ruta: si fueran dos, la pantalla podria
 * dejar pasar lo que el servidor rechaza, y el aviso llegaria tarde y lejos del
 * campo (la leccion del lote 188).
 *
 * Fichero puro: zod y otro modulo puro. Se ejecuta en el banco.
 */
import { z } from 'zod';
import { RNC_INVALIDO, rncDeLaEmpresa } from '@/services/empresas/rncDeLaEmpresa';

const campos = {
  razonSocial: z.string().trim()
    .min(1, 'Escribe la razón social de la empresa')
    .min(3, 'La razón social debe tener al menos 3 caracteres')
    .max(255, 'La razón social no puede pasar de 255 caracteres'),
  rncEmpresa: z.string().trim()
    .min(1, 'Escribe el RNC o la cédula de la empresa')
    .refine((t) => rncDeLaEmpresa(t) !== null, RNC_INVALIDO),
  //  Opcional: el padron la trae, pero no todo contribuyente la tiene, y no es
  //  motivo para no dejar registrarse.
  actividad: z.string().trim().max(255, 'La actividad no puede pasar de 255 caracteres').optional(),
  fullName: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().trim().min(1, 'Escribe tu correo electrónico').email('Ese correo no tiene un formato válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
};

/** Lo que valida el servidor. */
export const esquemaDelRegistro = z.object(campos);
export type DatosDelRegistro = z.infer<typeof esquemaDelRegistro>;

/** Lo que valida la pantalla: lo mismo, mas repetir la contraseña. */
export const esquemaDelFormularioDeRegistro = z.object({
  ...campos,
  confirmPassword: z.string().min(1, 'Repite la contraseña'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});
export type ValoresDelFormularioDeRegistro = z.infer<typeof esquemaDelFormularioDeRegistro>;

/**
 * La empresa que se crea, a partir de lo validado: el RNC SOLO CON DIGITOS (asi lo
 * guarda Administracion y asi lo busca el padron) y la actividad vacia como nula.
 *
 * Lanza si el RNC no tiene la forma: solo se llama con datos que ya pasaron el
 * esquema, y si no la tuvieran, crear la empresa seria peor que el 500.
 */
export function empresaDelRegistro(d: DatosDelRegistro): { name: string; rnc: string; businessActivity: string | null } {
  const rnc = rncDeLaEmpresa(d.rncEmpresa);
  if (!rnc) throw new Error(RNC_INVALIDO);
  return { name: d.razonSocial.trim(), rnc, businessActivity: d.actividad?.trim() || null };
}
