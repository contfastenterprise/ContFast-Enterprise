/**
 * Que comprobantes NO van al formato 607 (ventas) de la DGII.
 *
 * POR QUE EXISTE (lote 141)
 * -------------------------
 * El TXT del 607 y el libro de ventas -- la tabla y los totales de la pantalla
 * del 607 -- filtraban cada uno por su cuenta, con `ne(status, 'draft')` y
 * `ne(status, 'void')`. Ninguno excluia `rejected`, asi que un comprobante que
 * la DGII rechazo salia en el fichero que se le presenta a la propia DGII.
 * Medido el 2026-09-16: dos e-44 rechazadas en PRUEBA, y en PRODUCCION
 * E320000000059 en agosto.
 *
 * OJO CON ESE CASO, QUE ES LA RAZON DE QUE EL ESTADO TENGA QUE SER VERDAD.
 * E320000000059 esta en el sistema como `rejected` pero la DGII la tiene
 * ACEPTADA (portal de facturas de consumo, consultado el 2026-09-16): el primer
 * envio salio, el segundo recibio "ya existe", y el codigo de entonces lo leyo
 * como rechazo (lo cerro b4e7201). Excluir `rejected` es correcto solo si
 * `rejected` significa lo que dice; ese estado se corrige consultandolo, no
 * aqui.
 *
 * Una sola lista para los dos caminos: si divergen, la pantalla ensena un total
 * y el fichero declara otro.
 *
 * QUE SI VA
 * ---------
 * `accepted`, y tambien `submitted` y `signed`: salieron o estan por salir con
 * su e-NCF, y quitarlos esconderia ventas reales mientras llega el veredicto.
 * Quien presente el 607 con comprobantes todavia sin veredicto lo ve en el
 * aviso de la pantalla de e-CF (lote 138).
 */
export const ESTADOS_FUERA_DEL_607 = ['draft', 'rejected', 'void'];
