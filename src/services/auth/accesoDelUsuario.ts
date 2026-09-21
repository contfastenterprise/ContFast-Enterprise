/**
 * Lo que la pantalla de acceso valida y lo que dice cuando algo falla.
 *
 * POR QUE EXISTE (lote 173)
 * -------------------------
 * Estaba todo dentro del `onSubmit` de `auth/login/page.tsx`: el esquema, y
 * una cadena de `includes()` sobre el mensaje de error que traducia los fallos
 * de red. Dentro de un componente `'use client'` con framer-motion eso no se
 * puede probar sin arrastrar media aplicacion, y era justo la parte con
 * decisiones: que mensaje ve alguien que no puede entrar.
 *
 * Sin React y sin base de datos.
 */
import { z } from 'zod';

/**
 * Los campos del acceso.
 *
 * Los mensajes hablan de lo que falta, no de "formato invalido": a quien deja
 * el correo en blanco no le sirve que le digan que el formato esta mal. Antes
 * no se veian nunca, porque los `<input required>` disparaban primero el aviso
 * NATIVO del navegador -- en ingles y con otro estilo -- y zod no llegaba a
 * hablar. El lote 173 quita esos `required`.
 */
export const esquemaAcceso = z.object({
  email: z.string()
    .min(1, 'Ingrese su correo electrónico')
    .email('Ese correo no tiene un formato válido'),
  password: z.string()
    .min(1, 'Ingrese su contraseña')
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export type DatosDeAcceso = z.infer<typeof esquemaAcceso>;

/** Las formas en que el navegador dice "no hay red". */
const SIN_RED = ['failed to fetch', 'networkerror', 'load resource', 'network request failed'];

export const SIN_CONEXION = 'No hay conexión a internet.';
const GENERICO = 'No se pudo completar el acceso. Intente de nuevo.';

/**
 * El motivo que se le enseña a quien no pudo entrar.
 *
 * Un fallo de red no es un fallo de credenciales, y decirle "acceso
 * incorrecto" a alguien cuyo wifi se cayo le hace dudar de su contraseña.
 * Al reves tambien: un mensaje del servidor ("Usuario inactivo") se respeta
 * tal cual, porque dice algo que la persona necesita saber.
 *
 * Nunca devuelve vacio: un cuadro de error en blanco es peor que uno generico.
 */
export function motivoDelFallo(mensaje: unknown): string {
  if (typeof mensaje !== 'string' || !mensaje.trim()) return GENERICO;
  const limpio = mensaje.trim();
  const bajo = limpio.toLowerCase();
  if (SIN_RED.some((m) => bajo.includes(m))) return SIN_CONEXION;
  return limpio;
}
