/**
 * Lote 304: lo que decide que una cuenta por cobrar o pagar ENTRA en la cartera, cuando vence, y
 * como se resume por cliente o suplidor. Puro (sin `@/db`), para que el banco lo ejecute y para que
 * la antiguedad de saldos y las demas pantallas de CxC/CxP no puedan volver a calcularlo cada una a
 * su manera.
 *
 * POR QUE EXISTE: lo medido el 2026-10-05 en Latin Doors (PRODUCCION)
 * -------------------------------------------------------------------
 * La antiguedad de saldos daba a JUNIO JOSE FLORENTINO NICACIO 1.060.446,79 y la deuda real es
 * 957.830,12. La diferencia, 102.616,67, es E310000000029: RECHAZADA por la DGII (1209, "secuencia
 * ya utilizada"; la venta salio despues como E310000000030, aceptada) y con su cuenta por cobrar
 * intacta, porque un rechazado ya contabilizado no se revierte solo (lote 140: se "da de baja"). Ni
 * la cartera ni ninguna otra pantalla miraba el estado de la factura: la misma venta se cobraba dos
 * veces. Un comprobante rechazado no es exigible -- si se corrige y se acepta, vuelve a contar solo,
 * porque la regla mira el estado en el momento de preguntar --.
 *
 * Y el vencimiento: la cuenta por cobrar guardaba `ahora + 1 mes` (en hora UTC), no la fecha limite
 * de pago PACTADA que la factura declara a la DGII (`invoices.payment_due_date`). En E320000000078
 * la factura dice 25/09 y la CxC 28/10: la pantalla la daba al dia y el papel que tiene el cliente
 * dice que vencio hace diez dias.
 */
import { analizarVencimiento, tramosEnCero, TOLERANCIA, type SumaPorTramo } from './vencimiento';
import { NIVELES, nivelPorAtraso, type NivelRiesgo } from './riesgo';

/**
 * Los estados de factura cuya cuenta por cobrar es deuda. Lista POSITIVA a proposito: un estado
 * nuevo o desconocido no cuenta hasta que alguien decida que si, en vez de colarse en la cartera.
 *   - accepted: aceptada por la DGII.
 *   - submitted / signed: enviada o firmada, sin veredicto todavia. La venta esta hecha y el papel
 *     se entrego (lote 180); si la DGII la rechaza despues, sale sola de la cartera.
 * Fuera: draft (no se emitio), rejected (no vale como comprobante) y void (dada de baja, lote 140).
 */
export const ESTADOS_QUE_SON_DEUDA = ['accepted', 'submitted', 'signed'] as const;

/** Si la cuenta por cobrar de una factura en este estado es deuda del cliente. */
export function facturaEsDeuda(estado: string | null | undefined, borrada = false): boolean {
  if (borrada) return false;
  return (ESTADOS_QUE_SON_DEUDA as readonly string[]).includes(String(estado ?? ''));
}

/**
 * El dia en que vence una cuenta por cobrar: la fecha limite de pago PACTADA en la factura (la que
 * se declara a la DGII como `FechaLimitePago` y sale impresa) y, si la factura no la tiene --las
 * emitidas antes de que existiera la columna--, la de la cuenta por cobrar.
 *
 * Manda la factura aunque sea anterior a la emision (E320000000078: pactada 25/09, emitida 28/09):
 * es lo que el cliente tiene en la mano y lo que la DGII conoce. Que se pudiera pactar un vencimiento
 * anterior a la emision es un dato a corregir, no algo que la antiguedad deba esconder.
 */
export function vencimientoDeCxc(
  pactado: string | Date | null | undefined,
  deLaCuenta: string | Date | null | undefined
): string | null {
  const dia = (v: string | Date | null | undefined): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
    const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };
  return dia(pactado) ?? dia(deLaCuenta);
}

/**
 * El vencimiento de una CxC cuya factura no trae fecha pactada: un mes despues del DIA DE RD en que
 * se emite. Antes era `new Date(); setMonth(+1)` en el reloj del servidor (UTC): emitida a las 21:00
 * de RD contaba desde mañana, y el 31 de enero vencia el 3 de MARZO (JavaScript normaliza el 31 de
 * febrero hacia adelante). Aqui el dia se ACOTA al ultimo del mes siguiente.
 */
export function vencimientoPorDefecto(instante: Date): string {
  const rd = new Date(instante.getTime() - 4 * 60 * 60 * 1000);
  const ano = rd.getUTCFullYear();
  const mes = rd.getUTCMonth() + 1; // el mes siguiente, base 0
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(ano, mes, Math.min(rd.getUTCDate(), ultimo)));
  return d.toISOString().slice(0, 10);
}

/** Un documento de la cartera, tal como lo necesita el resumen. */
export interface DocumentoDeCartera {
  entidadId: string;
  saldo: number;
  /** 'AAAA-MM-DD' ya resuelto con `vencimientoDeCxc` (CxC) o el de la CxP. */
  vence: string | null;
  /** Instante de creacion, para "ultimo documento". */
  creado: string | Date | null;
}

export type SaldoPorNivel = Record<NivelRiesgo, number>;

export interface ResumenDeEntidad {
  saldo: number;
  /** Dias de la cuota MAS atrasada que sigue debiendo. 0 si no hay nada vencido. */
  diasAtraso: number;
  nivelRiesgo: NivelRiesgo;
  documentosPendientes: number;
  ultimoDocumento: string | null;
  /** El saldo repartido por antiguedad, DOCUMENTO A DOCUMENTO (los tramos de `vencimiento.ts`). */
  tramos: SumaPorTramo;
  /**
   * El saldo repartido por el nivel de riesgo de CADA DOCUMENTO. No es lo mismo que el saldo de la
   * entidad bajo su nivel: un cliente con una factura vencida de 10 dias y otras nueve al dia es
   * "riesgo medio", pero lo que lleva 10 dias de atraso es solo esa factura.
   */
  saldoPorNivel: SaldoPorNivel;
}

const redondear = (n: number): number => Math.round(n * 100) / 100;

export const nivelesEnCero = (): SaldoPorNivel =>
  Object.fromEntries(NIVELES.map((n) => [n, 0])) as SaldoPorNivel;

/**
 * Resume los documentos por entidad. Solo sale quien debe algo por encima de la tolerancia (el
 * mismo centavo de todo el sistema); los documentos saldados solo cuentan para "ultimo documento".
 * `hoy` es el DIA DE RD ('AAAA-MM-DD'): quien llama lo saca de `diaRD()`, nunca del reloj del
 * servidor (Vercel y Postgres corren en UTC: desde las 20:00 de RD su "hoy" ya es mañana).
 */
export function resumirPorEntidad(
  documentos: readonly DocumentoDeCartera[],
  hoy: string
): Map<string, ResumenDeEntidad> {
  const out = new Map<string, ResumenDeEntidad>();
  for (const d of documentos) {
    let r = out.get(d.entidadId);
    if (!r) {
      r = {
        saldo: 0, diasAtraso: 0, nivelRiesgo: 'bajo', documentosPendientes: 0,
        ultimoDocumento: null, tramos: tramosEnCero(), saldoPorNivel: nivelesEnCero(),
      };
      out.set(d.entidadId, r);
    }
    if (d.creado) {
      const t = new Date(d.creado);
      const iso = Number.isNaN(t.getTime()) ? null : t.toISOString();
      if (iso && (!r.ultimoDocumento || iso > r.ultimoDocumento)) r.ultimoDocumento = iso;
    }
    const saldo = Number(d.saldo) || 0;
    const v = analizarVencimiento(d.vence, { hoy, saldo });
    // `saldada` es saldo <= TOLERANCIA: incluye el saldo a favor (negativo), que no resta de ningun
    // tramo. (Un `|| saldo <= 0` aqui seria un mutante equivalente: ya esta dentro.)
    if (v.saldada) continue;
    r.saldo = redondear(r.saldo + saldo);
    r.documentosPendientes += 1;
    r.diasAtraso = Math.max(r.diasAtraso, v.atraso);
    r.tramos[v.tramo] = redondear(r.tramos[v.tramo] + saldo);
    const nivel = nivelPorAtraso(v.atraso);
    r.saldoPorNivel[nivel] = redondear(r.saldoPorNivel[nivel] + saldo);
  }
  for (const [id, r] of out) {
    if (r.saldo <= TOLERANCIA) out.delete(id);
    else r.nivelRiesgo = nivelPorAtraso(r.diasAtraso);
  }
  return out;
}

/** Suma de los tramos de varias entidades (las tarjetas y el total de la pantalla). */
export function sumarTramos(lista: readonly { tramos: SumaPorTramo }[]): SumaPorTramo {
  const s = tramosEnCero();
  for (const e of lista) for (const k of Object.keys(s) as (keyof SumaPorTramo)[]) s[k] = redondear(s[k] + (e.tramos?.[k] ?? 0));
  return s;
}

/** Suma de los saldos por nivel de documento de varias entidades. */
export function sumarPorNivel(lista: readonly { saldoPorNivel: SaldoPorNivel }[]): SaldoPorNivel {
  const s = nivelesEnCero();
  for (const e of lista) for (const n of NIVELES) s[n] = redondear(s[n] + (e.saldoPorNivel?.[n] ?? 0));
  return s;
}

/**
 * Las clases del texto de atraso. ROJO solo para lo que la pantalla llama "accion inmediata" (alto y
 * critico, mas de 15 dias); un atraso de 1 a 15 dias es riesgo MEDIO y va en ambar, como su icono.
 * Antes todo atraso salia en rojo, y una factura vencida hace dos dias se leia como la de 90.
 */
export function clasesDeAtraso(diasAtraso: number): string {
  const nivel = nivelPorAtraso(diasAtraso);
  if (nivel === 'bajo') return 'text-neutral-500';
  if (nivel === 'medio') return 'text-amber-700';
  return 'text-rose-700';
}
