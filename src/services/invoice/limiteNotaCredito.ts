/**
 * Cuando una nota de credito o de debito NO se puede emitir.
 *
 * POR QUE EXISTE (lote 146)
 * -------------------------
 * Nada comparaba una nota con la factura que modifica. El esquema solo exigia
 * que trajera un NCF modificado; `modifiedInvoiceId` era opcional; y al
 * asentar, la rebaja de la CxC se recortaba en cero sin avisar
 * (`Math.max(0, saldo - nota)`) mientras el asiento abonaba la nota ENTERA.
 *
 * Asi nacio E340000000002 + E340000000003: dos notas por el total de
 * E310000000020 (30.302,40) con una hora de diferencia. La segunda se emitio,
 * se envio a la DGII y se asento sin que nada lo impidiera; el mayor abono
 * 60.604,80 contra una factura de 30.302,40 y el auxiliar se quedo en cero en
 * silencio. Lo destapo el cuadre de Latin Doors (informe, D-3) y se corrigio a
 * mano el 2026-09-16 dando de baja la 0002.
 *
 * La comprobacion va ANTES de reservar el NCF y de enviar a la DGII: despues,
 * negarse dejaria un comprobante fiscal emitido sin factura en el sistema, que
 * es peor que la nota de mas.
 *
 * Aqui solo se decide, sin base de datos: la consulta la hace quien llama.
 */

/**
 * Cuanto vive una reserva de nota de credito si nadie la libera (lote 149).
 * El envio a mSeller tiene 45 s por defecto y la ruta corta a los 60: cinco
 * minutos cubren de sobra una emision entera, y si el proceso muere la factura
 * no queda bloqueada mas de eso.
 */
export const RESERVA_NOTA_MINUTOS = 5;

/** Estados en los que una nota ya emitida cuenta contra su factura. */
export const NOTAS_VIGENTES = ['accepted', 'submitted', 'signed'];

export interface FacturaModificada {
  ncf: string | null;
  ecfType: string;
  status: string;
  totalNet: number;
}

export interface NotaAEmitir {
  ecfType: string;          // '33' debito, '34' credito
  netoNota: number;
  modifiedNcf: string | null | undefined;
}

export class NotaNoPermitidaError extends Error {
  readonly status = 409;
  readonly code = 'NOTA_NO_PERMITIDA';
}

const dinero = (v: number) => v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Por que no se puede emitir la nota, o `null` si se puede.
 *
 * `creditoVigente` y `debitoVigente`: suma del neto de las notas de credito y
 * de debito YA emitidas sobre la factura que siguen vigentes (NOTAS_VIGENTES),
 * sin contar la que se quiere emitir.
 */
export function motivoParaNoEmitirNota(
  nota: NotaAEmitir,
  factura: FacturaModificada | null,
  creditoVigente: number,
  debitoVigente: number
): string | null {
  if (nota.ecfType !== '33' && nota.ecfType !== '34') return null;

  if (!factura) {
    return 'La nota debe indicar la factura que modifica, y esa factura tiene que ser de esta empresa y de este modo.';
  }
  if ((factura.ncf ?? '').trim() !== (nota.modifiedNcf ?? '').trim()) {
    return `El NCF modificado (${nota.modifiedNcf ?? 'vacío'}) no es el de la factura indicada (${factura.ncf ?? 'sin NCF'}).`;
  }
  if (factura.ecfType === '33' || factura.ecfType === '34') {
    return `${factura.ncf} es una nota, no una factura: una nota modifica facturas.`;
  }
  // La DGII rechaza una nota que modifica un e-NCF que no tiene aceptado. Una
  // factura en `submitted` todavia no lo es: se espera a su veredicto.
  if (factura.status !== 'accepted') {
    return `La factura ${factura.ncf} está "${factura.status}". Solo se emiten notas sobre facturas aceptadas por la DGII.`;
  }

  if (nota.ecfType === '34') {
    const disponible = Math.round((factura.totalNet + debitoVigente - creditoVigente) * 100) / 100;
    if (nota.netoNota > disponible + 0.01) {
      return disponible <= 0.01
        ? `La factura ${factura.ncf} ya está acreditada por completo (${dinero(creditoVigente)} en notas de crédito vigentes). No admite otra nota de crédito.`
        : `La nota de crédito (${dinero(nota.netoNota)}) supera lo que queda por acreditar de ${factura.ncf}: ${dinero(disponible)} ` +
          `(factura ${dinero(factura.totalNet)}${debitoVigente > 0 ? ` más ${dinero(debitoVigente)} de notas de débito` : ''}, ` +
          `menos ${dinero(creditoVigente)} ya acreditados).`;
    }
  }
  return null;
}
