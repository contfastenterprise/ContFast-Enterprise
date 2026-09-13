/**
 * La fecha en el formato de la DGII (dd-MM-aaaa), en un solo sitio y en las
 * dos direcciones.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL FALLO
 * ─────────────────────────────────────────────────────────────────────────
 * Habia CINCO copias de este formateo repartidas por el sistema, todas con el
 * mismo cuerpo:
 *
 *     const dd = String(d.getDate()).padStart(2, '0');
 *     const mm = String(d.getMonth() + 1).padStart(2, '0');
 *     return `${dd}-${mm}-${d.getFullYear()}`;
 *
 * Cuatro de las cinco reciben una MARCA DE TIEMPO real (`createdAt`,
 * `new Date()`), y ahi los captadores locales son lo correcto. La quinta
 * -- `vencimientoSecuencia` en secuencia.ts -- recibe `expiry_date`, que es
 * una columna `date`: drizzle la entrega como la cadena 'AAAA-MM-DD', y
 * `new Date('2026-12-31')` es MEDIANOCHE UTC, o sea el dia 30 a las 20:00 en
 * Republica Dominicana. Los captadores locales leen entonces el dia anterior:
 *
 *     en la base    se declaraba a la DGII    correcto
 *     2026-12-31 -> 30-12-2026                31-12-2026
 *     2027-06-30 -> 29-06-2027                30-06-2027
 *     2027-01-01 -> 31-12-2026                01-01-2027
 *
 * Medido: 336 de 336 fechas de un anio entero salian corridas un dia. Y el
 * ultimo caso es el peor de todos: una secuencia que vence el 1 de enero se
 * declaraba como vencida el 31 de diciembre ANTERIOR, es decir, se declaraba
 * a la DGII una autorizacion YA VENCIDA en el propio comprobante.
 *
 * No se veia porque las cinco copias son identicas: mirando cualquiera de
 * ellas no hay nada que objetar. El fallo esta en lo que cada una RECIBE, y
 * eso no se ve desde la copia.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CURA
 * ─────────────────────────────────────────────────────────────────────────
 * Un solo formateador, apoyado en `diaDe` (utils/fechasLocales), que ya sabe
 * distinguir las dos cosas:
 *
 *   - una CADENA se corta, no se interpreta: 'AAAA-MM-DD' ya es el dia que la
 *     base guardo, y construir un `Date` es justo lo que lo rompe;
 *   - un `Date` es un instante real, y ahi si valen los captadores locales.
 *
 * Por eso los cuatro sitios que hoy estan bien siguen dando exactamente lo
 * mismo, y el quinto deja de corregirse un dia. El banco de comprobaciones lo
 * fija: para marcas de tiempo, antes y despues coinciden.
 *
 * AQUI NO SE CONSTRUYE NINGUN `Date`. Ni para formatear ni para validar. Esa
 * es la propiedad que hay que conservar si alguien toca este fichero.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA VUELTA: POR QUE `diaDesdeFechaDgii` VALIDA EL CALENDARIO
 * ─────────────────────────────────────────────────────────────────────────
 * Las dos rutas de secuencias validaban la fecha que teclea el usuario con
 * una expresion regular:
 *
 *     if (!/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) -> 400
 *
 * Eso comprueba la FORMA, no la fecha. '32-13-2026' y '31-02-2026' la pasan
 * enteras. Y `sequence_expiry` se guarda TAL CUAL y es lo primero que
 * `vencimientoSecuencia` devuelve, asi que ese texto imposible viaja dentro
 * del e-CF hasta la DGII. Es el mismo agujero que el '31-12-2026' fijo que
 * origino secuencia.ts, solo que entrando por el teclado en vez de por un
 * valor por defecto.
 *
 * El PUT ademas hacia `new Date(anio, mes, dia)` para derivar `expiry_date`,
 * y ese constructor NORMALIZA en silencio: el 32 de enero se convierte en el
 * 1 de febrero. Resultado: las dos columnas de la misma secuencia quedaban
 * diciendo cosas distintas, y la que se envia a la DGII era la imposible.
 *
 * `diaDesdeFechaDgii` devuelve `null` para una fecha que no existe en el
 * calendario -- con los bisiestos de verdad, regla de los 400 incluida -- y
 * no normaliza nada.
 */
import { diaDe } from '@/utils/fechasLocales';

/**
 * dd-MM-aaaa para la DGII, o `null` si no hay fecha que leer.
 *
 * Acepta las dos formas por la misma razon que `diaDe`: una cadena
 * 'AAAA-MM-DD' de una columna `date` se corta, un `Date` de una columna
 * `timestamp` se lee con los captadores locales.
 *
 * Devuelve `null` -- y no una cadena vacia ni una fecha supuesta -- para que
 * quien llame decida. Un campo fiscal vacio se puede detectar; uno inventado,
 * no.
 */
export function fechaDgii(valor: Date | string | null | undefined): string | null {
  const dia = diaDe(valor);
  if (!dia) return null;
  return `${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}`;
}

/**
 * Igual, pero para los campos que el e-CF EXIGE: si no hay fecha, se para.
 *
 * Un comprobante al que le falta la fecha de emision no es un comprobante que
 * se pueda presentar. Pararse con el nombre del campo delante es reparable;
 * mandar el hueco a la DGII dentro de un documento fiscal no lo es.
 */
export function fechaDgiiExigida(valor: Date | string | null | undefined, campo: string): string {
  const f = fechaDgii(valor);
  if (!f) {
    throw new Error(
      `No se puede armar el e-CF: el campo ${campo} no tiene una fecha legible. ` +
      'No se envia el comprobante con la fecha vacia ni supuesta.'
    );
  }
  return f;
}

const DIAS_DEL_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Bisiesto de verdad: 2000 lo es, 1900 no. La regla de los 400 no es un adorno. */
const esBisiesto = (anio: number): boolean =>
  (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

/**
 * La vuelta: de 'dd-MM-aaaa' de la DGII al dia 'AAAA-MM-DD' de la base.
 *
 * `null` si el texto no tiene la forma o si la FECHA NO EXISTE. Un 31 de
 * febrero no es una fecha con un problema de formato: es una fecha que no
 * existe, y aceptarla es guardar un dato fiscal imposible.
 *
 * Sin `Date` de por medio, a proposito: `new Date(2026, 1, 31)` no falla, se
 * convierte en el 3 de marzo, y esa normalizacion callada es lo que hacia que
 * las dos columnas de una secuencia acabaran diciendo cosas distintas.
 */
export function diaDesdeFechaDgii(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null;
  const m = texto.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const aaaa = Number(m[3]);
  if (mm < 1 || mm > 12) return null;
  const tope = mm === 2 && esBisiesto(aaaa) ? 29 : DIAS_DEL_MES[mm - 1];
  if (dd < 1 || dd > tope) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** `true` solo si el texto es un dd-MM-aaaa que existe en el calendario. */
export function esFechaDgii(texto: string | null | undefined): boolean {
  return diaDesdeFechaDgii(texto) !== null;
}
