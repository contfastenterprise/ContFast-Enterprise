/**
 * El timbre fiscal de un e-CF: que lleva el papel, y cuando se puede imprimir.
 *
 * POR QUE ESTE FICHERO (lote 180)
 * -------------------------------
 * Habia dos creencias en el codigo, contrarias entre si, y las dos falsas a
 * medias. Medido el 2026-09-22 sobre los envios reales de PRODUCCION:
 *
 *  1. `invoices/page.tsx` decia que el codigo de seguridad, la fecha de firma
 *     y el QR "los produce la DGII al firmar y todavia no existen" al emitir,
 *     y por eso NO imprimia hasta que la factura estuviera 'accepted'. Es
 *     falso: **los produce mSeller** y vienen en la respuesta del envio. Las 12
 *     respuestas mas recientes traen las seis claves
 *     `rnc, ecf, internalTrackId, securityCode, qr_url, signedDate`, y
 *     `invoiceDbBooker` las guarda en la factura en la misma transaccion. El
 *     papel esta listo desde el segundo cero; lo que faltaba era el veredicto,
 *     que es otra cosa.
 *
 *  2. `documentTemplates` colgaba el QR de `estadoFiscal === 'accepted'`,
 *     porque un lote anterior descubrio -- con razon -- que un RECHAZADO
 *     tambien trae esos datos. Comprobado otra vez aqui: E440000000001,
 *     E440000000002 (rechazados) y E340000000002 (dada de baja) recibieron la
 *     respuesta con LA MISMA forma que una exitosa; el motivo del rechazo
 *     ("The element 'Totales' has invalid child element 'MontoExento'") llego
 *     despues. Asi que la respuesta del envio significa "mSeller lo firmo y lo
 *     transmitio", NO "la DGII lo acepto".
 *
 * LA DISTINCION QUE LO RESUELVE, y es la razon de ser de este fichero: el QR es
 * el TIMBRE (`ecf.dgii.gov.do/.../consultatimbre?...`), un dato del documento,
 * no un certificado de aprobacion. Lo que NO puede afirmarse antes del
 * veredicto es la LEYENDA. El incidente que costo el lote anterior no fue el QR:
 * fue que dos comprobantes rechazados salieron rotulados "Firma Digital
 * Valida". Por eso aqui el timbre y la leyenda se deciden POR SEPARADO:
 *
 *   · el timbre se imprime en cuanto consta, salvo si hay rechazo;
 *   · la leyenda dice la verdad del estado, siempre, sin excepcion.
 *
 * DECISION DEL DUEÑO (2026-09-22): la factura se imprime INMEDIATAMENTE salvo
 * que el envio haya fallado. No se espera al veredicto -- mediana medida: 20
 * segundos -- porque en caja hay un cliente delante.
 *
 * Sin base de datos y sin red: aqui solo se decide.
 */

/** Lo poco que hace falta saber de la factura para decidir. */
export interface DatosDelTimbre {
  /** El estado fiscal: 'signed' | 'submitted' | 'accepted' | 'rejected' | 'void'... */
  estadoFiscal?: string | null;
  securityCode?: string | null;
  signatureDate?: string | Date | null;
  qrUrl?: string | null;
}

/** Los estados en que el comprobante NO vale, y el papel tiene que decirlo. */
const ESTADOS_SIN_VALIDEZ = ['rejected', 'void'];

function texto(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

/**
 * ¿Consta el timbre? Hacen falta las DOS cosas: el codigo de seguridad y la
 * fecha de firma. Con una sola, el papel no puede rotular un timbre completo.
 */
export function hayTimbre(inv: DatosDelTimbre): boolean {
  return texto(inv.securityCode) !== '' && texto(inv.signatureDate) !== '';
}

/** ¿La DGII lo confirmo? Es lo unico que autoriza a afirmar la firma. */
export function firmaConfirmada(inv: DatosDelTimbre): boolean {
  return texto(inv.estadoFiscal) === 'accepted' && texto(inv.signatureDate) !== '';
}

/** ¿Consta que NO vale? Un rechazo o una baja. */
export function sinValidez(inv: DatosDelTimbre): boolean {
  return ESTADOS_SIN_VALIDEZ.includes(texto(inv.estadoFiscal));
}

/**
 * ¿Se imprime el QR del timbre?
 *
 * Si consta el timbre y no consta un rechazo. Un rechazado no lo lleva porque
 * su timbre no esta registrado en la DGII -- los tres casos medidos fueron
 * XML invalido, y ahi la DGII ni siquiera anota el comprobante --, asi que su
 * QR llevaria a una consulta vacia.
 */
export function seImprimeElTimbre(inv: DatosDelTimbre): boolean {
  return hayTimbre(inv) && !sinValidez(inv);
}

/** Las tres cosas que puede decir el papel. Nunca otra. */
export type ClaseDeRotulo = 'valida' | 'pendiente' | 'rechazado';

export interface RotuloDelTimbre {
  clase: ClaseDeRotulo;
  /** El titular, en negrita en el papel. */
  titulo: string;
  /** La linea explicativa de debajo. */
  detalle: string;
  /** Si se enseñan el codigo de seguridad y la fecha de firma. */
  conCodigo: boolean;
  /** Si se pinta el QR. */
  conQr: boolean;
}

/**
 * Que dice el papel sobre la firma.
 *
 * LA REGLA, en una frase: "Firma Digital Valida" SOLO con veredicto de
 * aceptacion. Nunca antes, ni aunque el timbre conste, ni aunque mSeller haya
 * contestado que todo fue bien.
 */
export function rotuloDelTimbre(inv: DatosDelTimbre): RotuloDelTimbre {
  if (sinValidez(inv)) {
    return {
      clase: 'rechazado',
      titulo: 'RECHAZADO POR LA DGII',
      detalle: 'La DGII rechazó este comprobante. NO tiene validez fiscal.',
      conCodigo: false,
      conQr: false,
    };
  }

  if (firmaConfirmada(inv)) {
    return {
      clase: 'valida',
      titulo: 'Firma Digital Válida',
      detalle: 'Puede validar este e-CF en el portal de la DGII.',
      conCodigo: true,
      conQr: hayTimbre(inv),
    };
  }

  // Timbre sin veredicto: el caso NORMAL de una factura recien emitida. El
  // papel sale con su timbre y su codigo, y dice que falta la confirmacion.
  if (hayTimbre(inv)) {
    return {
      clase: 'pendiente',
      titulo: 'Pendiente de confirmación de la DGII',
      detalle: 'El timbre fiscal consta. La DGII aún no ha confirmado el comprobante.',
      conCodigo: true,
      conQr: true,
    };
  }

  // Ni timbre ni veredicto: no hay nada que rotular.
  return {
    clase: 'pendiente',
    titulo: 'Pendiente de confirmación de la DGII',
    detalle: 'Este comprobante aún no tiene la firma de la DGII.',
    conCodigo: false,
    conQr: false,
  };
}

/**
 * ¿Se puede imprimir YA, sin esperar el veredicto?
 *
 * Decision del dueño (2026-09-22): si, salvo que el envio haya fallado. Lo que
 * bloquea no es la falta de veredicto -- eso es lo normal -- sino la falta de
 * timbre: sin codigo de seguridad ni fecha de firma el papel saldria sin el
 * dato que lo identifica, que es el comprobante provisional que un lote
 * anterior quito a proposito.
 *
 * Un rechazado tampoco se imprime solo: ese papel no vale, y sacarlo sin que
 * nadie lo pida es entregarle al cliente un documento invalido. Se puede
 * imprimir a mano desde el listado, y saldra rotulado como rechazado.
 */
export function sePuedeImprimirYa(inv: DatosDelTimbre): boolean {
  return hayTimbre(inv) && !sinValidez(inv);
}

/**
 * Por que no se imprime, para poder decirlo en vez de no hacer nada.
 *
 * `null` cuando si se imprime.
 */
export function motivoParaNoImprimirYa(inv: DatosDelTimbre): string | null {
  if (sinValidez(inv)) return 'la DGII rechazó el comprobante: ese papel no tiene validez fiscal';
  if (!hayTimbre(inv)) return 'el comprobante todavía no tiene timbre fiscal (código de seguridad y fecha de firma)';
  return null;
}
