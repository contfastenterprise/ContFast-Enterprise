import { sql } from 'drizzle-orm';

/**
 * Numeracion interna del documento: FAC-2026-000123.
 *
 * No confundir con el NCF/e-CF, que es el comprobante fiscal autorizado por la
 * DGII y lo asigna `ecf_sequences`. Este es el numero de la casa.
 *
 * POR QUE EXISTE ESTE FICHERO
 * ---------------------------
 * El codigo se generaba en tres sitios contando filas:
 *
 *     SELECT count(*) FROM invoices WHERE codigo_factura LIKE 'FAC-2026-%'
 *     -> nextNum = count + 1
 *
 * COUNT(*) no bloquea nada. Dos facturas emitidas a la vez leen el mismo total
 * y las dos escriben FAC-2026-000123. En `invoices/draft` era peor todavia: el
 * conteo se hacia fuera de la transaccion y sin filtrar `modo`, asi que un
 * borrador de PRUEBA consumia un numero del correlativo real.
 *
 * Ademas contar es fragil por si mismo: si alguna vez se borra una factura, el
 * conteo devuelve un numero ya usado.
 *
 * COMO LO RESUELVE
 * ----------------
 * Una tabla de secuencias por empresa, entorno, prefijo y ano -- la misma forma
 * que `quote_sequences` y `supplier_order_sequences`, que ya siguen este patron
 * en este esquema.
 *
 * El avance es un INSERT ... ON CONFLICT DO UPDATE ... RETURNING: una sola
 * sentencia, y por tanto atomica. La segunda transaccion espera a que la
 * primera confirme y recibe el numero siguiente, sin ventana entre leer y
 * escribir. No hace falta FOR UPDATE.
 *
 * Se llama SIEMPRE dentro de la transaccion que inserta la factura: si esa
 * transaccion aborta, el numero se devuelve con ella y no se pierde.
 */

/** FAC para una factura, NC para nota de credito (e-34), ND para debito (e-33). */
export function prefijoDe(ecfType: string | undefined | null): 'FAC' | 'NC' | 'ND' {
  if (ecfType === '34') return 'NC';
  if (ecfType === '33') return 'ND';
  return 'FAC';
}

/**
 * Reserva y devuelve el siguiente codigo.
 *
 * @param tx        el ejecutor de la transaccion que va a insertar la factura
 * @param companyId empresa
 * @param modo      PRODUCCION o PRUEBA: cada entorno lleva su propia serie
 * @param ecfType   tipo de e-CF, para elegir el prefijo
 * @param anio      por defecto el ano en curso
 */
export async function siguienteCodigoFactura(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  companyId: string,
  modo: 'PRODUCCION' | 'PRUEBA',
  ecfType: string | undefined | null,
  anio: number = new Date().getFullYear()
): Promise<string> {
  const prefijo = prefijoDe(ecfType);

  const filas = (await tx.execute(sql`
    INSERT INTO invoice_sequences (company_id, modo, prefix, current_year, current_sequence)
    VALUES (${companyId}::uuid, ${modo}::environment_mode, ${prefijo}, ${anio}, 1)
    ON CONFLICT (company_id, prefix, current_year, modo)
    DO UPDATE SET current_sequence = invoice_sequences.current_sequence + 1,
                  updated_at = now()
    RETURNING current_sequence
  `)) as unknown as { current_sequence: number }[];

  const numero = Number(filas[0]?.current_sequence);
  if (!Number.isFinite(numero) || numero < 1) {
    throw new Error(
      `No se pudo reservar el codigo de factura para ${prefijo}-${anio} ` +
      `(empresa ${companyId}, ${modo}).`
    );
  }

  return `${prefijo}-${anio}-${String(numero).padStart(6, '0')}`;
}
