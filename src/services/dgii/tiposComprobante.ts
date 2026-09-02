/**
 * Los tipos de e-CF de la DGII. UN SOLO SITIO.
 *
 * POR QUE EXISTE ESTE FICHERO
 * ---------------------------
 * La lista estaba escrita a mano en SEIS sitios distintos, y no coincidian
 * entre si:
 *
 *   1. `documentTemplates.ts`            (lo que se IMPRIME en el comprobante)
 *   2. `invoices/[id]/page.tsx`          (el detalle de la factura)
 *   3. `invoices/page.tsx` getTypeLabel  (el listado)
 *   4. `invoices/page.tsx` getLabel      (el desplegable al facturar)
 *   5. `ecf/page.tsx` mapa               (la pantalla de secuencias)
 *   6. `ecf/page.tsx` <option>           (su desplegable)
 *
 * Y las dos que deciden lo que ve el cliente -- la 1 y la 2 -- tenian la cola
 * de la lista CORRIDA UNA POSICION:
 *
 *      codigo   decia el sistema              dice la DGII
 *      ------   ---------------------------   -------------------------
 *        43     Registro de Unico Ingreso     Gastos Menores
 *        44     Gastos Menores                REGIMENES ESPECIALES
 *        45     Regimenes Especiales          GUBERNAMENTAL
 *        46     Gubernamentales               EXPORTACIONES
 *
 * O sea que un comprobante gubernamental (45) se imprimia como "Registro de
 * Regimenes Especiales". Un documento fiscal con el nombre de otro.
 *
 * Y ademas:
 *
 *     return types[type] || 'Factura de Consumo Electronica';
 *
 * Un tipo que no estuviera en el mapa se imprimia como FACTURA DE CONSUMO. No
 * fallaba, no avisaba: cambiaba el documento por otro. Es el mismo patron que
 * el codigo de seguridad fabricado y la fecha de secuencia inventada --
 * rellenar un hueco con algo plausible en vez de admitir que no se sabe.
 *
 * FUENTE
 * ------
 * Denominaciones tomadas de la DGII (Comunidad de Ayuda, CA4358, y el Formato
 * e-CF v1.0). No se abrevian ni se "mejoran": el nombre que se imprime en un
 * comprobante fiscal es el que dice la DGII.
 */

export interface TipoComprobante {
  /** El codigo de dos digitos que viaja en el e-CF. */
  codigo: string;
  /** Denominacion oficial de la DGII. Es lo que se imprime. */
  nombre: string;
  /** Version corta, para listados y columnas estrechas. */
  corto: string;
  /**
   * Si el sistema lo emite HOY desde el flujo de ventas.
   *
   * Los de compras y gastos (41, 43, 47) no son documentos de venta: los emite
   * el comprador sobre un tercero, con otro flujo y otras validaciones. Estan
   * en la lista para poder NOMBRARLOS correctamente cuando aparezcan, no para
   * ofrecerlos al facturar.
   */
  emitible: boolean;
  /**
   * Si el e-CF lleva `FechaVencimientoSecuencia` en el `IdDoc`.
   *
   * NO es un detalle de estilo: la DGII marca el campo como **No Aplica** para
   * el e-32, el e-34 y el e-47. Mandarlo en esos tres es mandar un campo que su
   * validador no espera; exigirlo es impedir que se emitan.
   *
   * Fuente: DGII, "Formato Comprobante Fiscal Electronico (e-CF) v1.0",
   * seccion IdDoc, campo 4 -- Obligatorio en 31, 33, 41, 43, 44, 45 y 46; No
   * Aplica en 32, 34 y 47. Coincide con los ejemplos de mSeller, que omiten el
   * campo justo en el 32 y el 34.
   */
  exigeVencimiento: boolean;
}

export const TIPOS_COMPROBANTE: readonly TipoComprobante[] = [
  { codigo: '31', nombre: 'Factura de Crédito Fiscal Electrónica',            corto: 'Crédito Fiscal',       emitible: true,  exigeVencimiento: true  },
  { codigo: '32', nombre: 'Factura de Consumo Electrónica',                   corto: 'Consumo',              emitible: true,  exigeVencimiento: false },
  { codigo: '33', nombre: 'Nota de Débito Electrónica',                       corto: 'Nota de Débito',       emitible: true,  exigeVencimiento: true  },
  { codigo: '34', nombre: 'Nota de Crédito Electrónica',                      corto: 'Nota de Crédito',      emitible: true,  exigeVencimiento: false },
  { codigo: '41', nombre: 'Comprobante Electrónico de Compras',               corto: 'Compras',              emitible: false, exigeVencimiento: true  },
  { codigo: '43', nombre: 'Comprobante Electrónico para Gastos Menores',      corto: 'Gastos Menores',       emitible: false, exigeVencimiento: true  },
  { codigo: '44', nombre: 'Comprobante Electrónico para Regímenes Especiales', corto: 'Regímenes Especiales', emitible: true,  exigeVencimiento: true  },
  { codigo: '45', nombre: 'Comprobante Electrónico Gubernamental',            corto: 'Gubernamental',        emitible: true,  exigeVencimiento: true  },
  { codigo: '46', nombre: 'Comprobante Electrónico para Exportaciones',       corto: 'Exportaciones',        emitible: true,  exigeVencimiento: true  },
  { codigo: '47', nombre: 'Comprobante Electrónico para Pagos al Exterior',   corto: 'Pagos al Exterior',    emitible: false, exigeVencimiento: false },
] as const;

const POR_CODIGO = new Map(TIPOS_COMPROBANTE.map((t) => [t.codigo, t]));

/** Los codigos que el flujo de ventas puede emitir. Para los `z.enum` y los desplegables. */
export const CODIGOS_EMITIBLES = TIPOS_COMPROBANTE.filter((t) => t.emitible).map((t) => t.codigo) as
  ['31', '32', '33', '34', '44', '45', '46'];

/** Los que modifican otro comprobante y por tanto exigen `modifiedNcf`. */
export const CODIGOS_NOTA = ['33', '34'] as const;

/**
 * Los comprobantes de venta a los que se les puede emitir una nota.
 *
 * Son los emitibles menos las propias notas: una nota de credito modifica una
 * FACTURA, no otra nota.
 *
 * Existe porque el buscador de la pantalla de ajustes llevaba la lista escrita
 * a mano -- `'31' || '32' || '45'` -- y se dejaba fuera el e-44 y el e-46. Con
 * la empresa facturando e-44 en produccion, eso significaba no poder emitirle
 * una nota de credito a ningun regimen especial ni a ninguna exportacion. Otra
 * lista paralela mas, del mismo tipo que las seis que ya se unificaron aqui.
 */
export const CODIGOS_MODIFICABLES_POR_NOTA =
  TIPOS_COMPROBANTE
    .filter((t) => t.emitible && !(CODIGOS_NOTA as readonly string[]).includes(t.codigo))
    .map((t) => t.codigo);

/** ¿A este comprobante se le puede emitir una nota de credito o debito? */
export function esModificablePorNota(codigo: string | null | undefined): boolean {
  return CODIGOS_MODIFICABLES_POR_NOTA.includes(String(codigo ?? '').trim());
}

/**
 * El nombre oficial de un tipo.
 *
 * Un codigo desconocido devuelve `null`, NO "Factura de Consumo". Quien
 * imprime decide que hacer con esa ausencia, pero nadie va a cambiar un
 * comprobante por otro sin darse cuenta.
 */
export function nombreTipo(codigo: string | null | undefined): string | null {
  return POR_CODIGO.get(String(codigo ?? '').trim())?.nombre ?? null;
}

/** Version corta. Mismo criterio: sin codigo conocido, `null`. */
export function nombreCortoTipo(codigo: string | null | undefined): string | null {
  return POR_CODIGO.get(String(codigo ?? '').trim())?.corto ?? null;
}

/**
 * Para pantalla: el nombre, o una etiqueta que DICE que no se conoce en vez de
 * inventar uno. `e-99 (tipo no reconocido)` es feo a proposito: si aparece,
 * hay que mirarlo, no dejarlo pasar.
 */
export function etiquetaTipo(codigo: string | null | undefined): string {
  const c = String(codigo ?? '').trim();
  return nombreTipo(c) ?? `e-${c || '??'} (tipo no reconocido)`;
}

/** ¿Este codigo lo emite el flujo de ventas? */
export function esEmitible(codigo: string | null | undefined): boolean {
  return POR_CODIGO.get(String(codigo ?? '').trim())?.emitible === true;
}

/**
 * ¿Este tipo lleva `FechaVencimientoSecuencia`?
 *
 * Un codigo desconocido devuelve `true`: si no sabemos que tipo es, se pide la
 * fecha y como mucho el envio se detiene con un mensaje. Lo contrario --
 * suponer que no hace falta -- omitiria un campo obligatorio en un comprobante
 * que la DGII espera con el.
 */
export function exigeVencimientoSecuencia(codigo: string | null | undefined): boolean {
  const t = POR_CODIGO.get(String(codigo ?? '').trim());
  return t ? t.exigeVencimiento : true;
}
