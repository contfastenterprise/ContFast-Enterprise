/**
 * Quien puede cambiar de empresa, y como se rotula la empresa activa.
 *
 * POR QUE ESTE FICHERO (lote 193)
 * -------------------------------
 * El dueño pidio llevar el selector de empresa del menu lateral a la cabecera y
 * quitar de la cabecera el nombre suelto, para que solo quede el selector. Al
 * mover eso hay que mover tambien la regla de quien lo puede usar, y esa regla
 * estaba escrita dentro del componente, donde un banco no la puede ejecutar.
 *
 * MEDIDO ANTES DE TOCARLA (PRODUCCION, 2026-09-25):
 *
 *     "administracion"     6 usuarios
 *     "sistemas"           1
 *     "facturacion"        1
 *     "compras"            1
 *     banco, recursos_humanos, contabilidad, cajero   0
 *
 * Los nombres estan TODOS en minusculas y sin espacios. Por eso la comparacion
 * estricta que ya hacia el selector (`user?.role === 'sistemas'`) es correcta hoy
 * y **no se cambia**: otras pantallas aceptan ademas `'sistema'` en singular y sin
 * mayusculas (`admin/sessions`, `admin/users`, `dashboard/admin`), pero ningun rol
 * se llama asi, asi que ampliar aqui seria cambiar QUIEN puede cambiar de empresa
 * sin que nadie lo haya pedido. Queda anotado: si algun dia se ve un rol
 * "Sistemas" o "sistema" en la base, el sitio a tocar es este, uno solo.
 *
 * Consecuencia de la medicion, y es la que justifica el lote: para **6 de los 9
 * usuarios** el selector no es un selector, es el nombre de la empresa. O sea que
 * llevarlo a la cabecera no les quita nada — les enseña lo mismo que ya habia ahi.
 *
 * Fichero puro y sin imports, para que la regla se pueda ejecutar en un banco
 * (leccion del lote 190).
 */

/**
 * ¿Esta persona puede cambiar la empresa activa?
 *
 * Solo sistemas. No es una restriccion de comodidad: cambiar de empresa cambia
 * TODO lo que se ve y lo que se emite, y una factura emitida en la empresa
 * equivocada es un comprobante fiscal mal puesto.
 */
export function puedeCambiarDeEmpresa(rol: string | null | undefined): boolean {
  return rol === 'sistemas';
}

/**
 * La letra del distintivo de la empresa.
 *
 * `companyName.charAt(0).toUpperCase()` — lo que habia — da CADENA VACIA mientras
 * los ajustes no han llegado, y el distintivo sale como un circulo en blanco. En
 * la cabecera eso se ve mucho mas que en el pie del menu, porque es lo primero
 * que hay al lado del logo.
 *
 * Tambien se salta los espacios de delante: ' Latin Doors' daria un hueco.
 */
export function inicialDeEmpresa(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').trim();
  if (limpio === '') return '·';
  return limpio.charAt(0).toUpperCase();
}
