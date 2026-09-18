/**
 * Que declaraciones de la DGII quedan por presentar. La regla, en un solo sitio.
 *
 * POR QUE ESTE FICHERO (lote 159)
 * -------------------------------
 * El 606 y el 607 se arman a mano: alguien entra a la pantalla, elige el mes y
 * pulsa exportar. Nada avisa de que el mes cerro, ni queda constancia de si se
 * presento. Medido el 2026-09-18 en Latin Doors (PRODUCCION): julio con 35
 * compras y 23 comprobantes, agosto con 33 y 17, septiembre en curso. El plazo
 * de la DGII para los dos formatos vence el dia 15 del mes siguiente, asi que
 * al medir ya habian vencido los de julio y los de agosto sin que nada lo
 * dijera.
 *
 * Decidido por el dueño el 2026-09-18:
 *   - El archivo NO se guarda: el aviso lleva a la pantalla y el TXT se genera
 *     al descargarlo, asi nunca queda viejo si se corrige una factura del mes.
 *   - El aviso vive hasta que alguien marca ese mes como presentado.
 *
 * Aqui no hay base de datos: son fechas. El dia es el de RD (UTC-4), como en
 * services/avisos/vencimientos.ts.
 */
import { diaRD } from '@/services/avisos/vencimientos';

export const TIPOS_DECLARACION = ['606', '607'] as const;
export type TipoDeclaracion = (typeof TIPOS_DECLARACION)[number];

/** La DGII recibe el 606 y el 607 hasta el dia 15 del mes siguiente. */
export const DIA_LIMITE_DECLARACION = 15;

/**
 * Cuantos periodos cerrados se miran hacia atras. Con tres, el panel avisa de
 * lo reciente sin convertirse en un historial: si falta algo de hace medio año,
 * eso no es un aviso, es una conversacion con el contador.
 */
export const PERIODOS_AVISADOS = 3;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * El periodo como lo guarda la base (AAAAMM) a partir de como lo maneja la
 * pantalla (AAAA-MM, que es lo que da un `<input type="month">`).
 */
export function periodoCompacto(periodoConGuion: string): string {
  return (periodoConGuion || '').replace('-', '');
}

/** El periodo (AAAAMM) al que pertenece un instante, en hora de RD. */
export function periodoDe(instante: Date | string): string {
  const dia = diaRD(instante);
  return dia ? dia.slice(0, 7).replace('-', '') : '';
}

/** El periodo anterior a uno dado. */
export function periodoAnterior(periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(4, 6));
  if (!anio || !mes) return '';
  const d = new Date(Date.UTC(anio, mes - 2, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Los ultimos periodos ya cerrados, del mas reciente al mas viejo. */
export function periodosCerrados(ahora: Date, cuantos = PERIODOS_AVISADOS): string[] {
  const periodos: string[] = [];
  let p = periodoAnterior(periodoDe(ahora));
  for (let i = 0; i < cuantos && p; i++) {
    periodos.push(p);
    p = periodoAnterior(p);
  }
  return periodos;
}

/** La fecha limite para presentar un periodo (aaaa-mm-dd). */
export function limiteDePresentacion(periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(4, 6));
  if (!anio || !mes) return '';
  const d = new Date(Date.UTC(anio, mes, DIA_LIMITE_DECLARACION));
  return d.toISOString().slice(0, 10);
}

/** Dias que faltan para el limite (negativo si ya paso). */
export function diasParaElLimite(periodo: string, ahora: Date): number {
  const limite = limiteDePresentacion(periodo);
  const hoy = diaRD(ahora);
  if (!limite || !hoy) return 0;
  return Math.round((Date.parse(`${limite}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
}

/** "agosto 2026" */
export function nombreDelPeriodo(periodo: string): string {
  const anio = periodo.slice(0, 4);
  const mes = Number(periodo.slice(4, 6));
  const nombre = MESES[mes - 1];
  return nombre ? `${nombre} ${anio}` : periodo;
}

export interface DeclaracionPendiente {
  tipo: TipoDeclaracion;
  periodo: string;
  limite: string;
  dias: number;
  vencida: boolean;
}

/**
 * Lo que queda por presentar: por cada periodo cerrado con datos, el formato
 * que no conste marcado como presentado.
 *
 * `conDatos` y `presentadas` los trae quien llama, de la base. Un periodo sin
 * datos no se avisa: no hay nada que declarar y el aviso seria ruido.
 */
export function declaracionesPendientes(entrada: {
  ahora: Date;
  conDatos: (tipo: TipoDeclaracion, periodo: string) => boolean;
  presentada: (tipo: TipoDeclaracion, periodo: string) => boolean;
  cuantosPeriodos?: number;
}): DeclaracionPendiente[] {
  const pendientes: DeclaracionPendiente[] = [];
  for (const periodo of periodosCerrados(entrada.ahora, entrada.cuantosPeriodos ?? PERIODOS_AVISADOS)) {
    for (const tipo of TIPOS_DECLARACION) {
      if (!entrada.conDatos(tipo, periodo)) continue;
      if (entrada.presentada(tipo, periodo)) continue;
      const dias = diasParaElLimite(periodo, entrada.ahora);
      pendientes.push({
        tipo,
        periodo,
        limite: limiteDePresentacion(periodo),
        dias,
        vencida: dias < 0,
      });
    }
  }
  return pendientes;
}

/** El titulo del aviso. */
export function tituloDeclaracion(d: DeclaracionPendiente): string {
  if (d.vencida) return `El ${d.tipo} de ${nombreDelPeriodo(d.periodo)} venció hace ${-d.dias} día(s)`;
  if (d.dias === 0) return `El ${d.tipo} de ${nombreDelPeriodo(d.periodo)} vence HOY`;
  return `El ${d.tipo} de ${nombreDelPeriodo(d.periodo)} vence en ${d.dias} día(s)`;
}
