/**
 * Los cuatro pasos del alta de compras, y QUE CAMPO DEL ESQUEMA vigila cada uno.
 *
 * POR QUE VIVE AQUI Y NO EN `page.tsx`
 * -----------------------------------
 * Para poder probarlo. Dentro de `page.tsx` -- 2.500 lineas, `'use client'`,
 * framer-motion -- no hay forma de cargar esta tabla desde un banco sin
 * arrastrar media aplicacion. Aqui es codigo puro: ni React ni estado.
 *
 * QUE SON ESOS NOMBRES
 * --------------------
 * `campos` NO son variables de la pantalla: son rutas de error de
 * `esquemaCompra` (src/schemas/compra.ts). Por eso un paso no tiene reglas
 * propias -- se corre el MISMO esquema que valida el servidor y se mira si algo
 * de lo que fallo cae en este paso. Una sola verdad, imposible de
 * desincronizar.
 *
 * EL REPARTO TIENE QUE SER TOTAL
 * ------------------------------
 * Todo campo que el esquema pueda rechazar tiene que caer en EXACTAMENTE un
 * paso. Si alguno no cae en ninguno, el asistente deja pasar los cuatro pasos
 * en verde y revienta al guardar, que es el peor asistente posible. Si cayera
 * en dos, el mismo error se pintaria dos veces. Lo comprueba
 * `scratch/verificar_compras_por_pasos.ts` ejecutando el esquema de verdad.
 *
 * LAS DOS DECISIONES DE FORMA VAN EN EL PASO 1
 * --------------------------------------------
 * Gasto menor y monto general deciden que campos existen despues -- incluido si
 * el concepto pasa a ser obligatorio. En el paso 2 llegarian tarde.
 *
 * `guaranteeCheck` cubre por prefijo a sus cuatro hijos
 * (`guaranteeCheck.checkNumber` y compania).
 */
export const PASOS = [
  { n: 1, titulo: 'El comprobante', campos: ['supplierId', 'ncf', 'issueDate', 'expenseType', 'description'] },
  { n: 2, titulo: 'Que se compro', campos: ['amount', 'debitAccountId', 'lines'] },
  { n: 3, titulo: 'Como se paga', campos: ['paymentMethod', 'guaranteeCheck'] },
  { n: 4, titulo: 'Revisar y guardar', campos: [] },
] as const;

/** Un campo cae en un paso si es suyo o cuelga de el (`guaranteeCheck.amount`). */
export const campoDelPaso = (campo: string, n: number): boolean => {
  const campos: readonly string[] = PASOS.find(p => p.n === n)?.campos ?? [];
  return campos.some(c => campo === c || campo.startsWith(c + '.'));
};
