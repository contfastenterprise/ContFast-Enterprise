/**
 * Una fila de cartera, venga de donde venga.
 *
 * POR QUE HACE FALTA NORMALIZAR
 * -----------------------------
 * Las dos pantallas reciben la MISMA idea con formas distintas, y esa es la
 * mitad de por que se separaron:
 *
 *              cobrar (accounts_receivable)      pagar (accounts_payable)
 *   monto      cadena ('1180.00', decimal)       numero
 *   saldo      cadena                            numero
 *   entidad    customerName                      supplierName
 *   documento  codigoFactura o ncf               no tiene: se arma del id
 *
 * Cada tabla resolvia eso a su manera, con sus propios `Number(...)` repartidos
 * por el JSX. Aqui se resuelve UNA vez y lo de abajo ya no sabe de que lado
 * viene.
 *
 * ANTIGUEDAD Y ATRASO SON DOS COLUMNAS, NO UNA
 * --------------------------------------------
 * La tabla de cobrar contaba desde la EMISION y titulaba la columna "Dias
 * Venc."; la de pagar contaba desde el VENCIMIENTO. Ninguna de las dos estaba
 * de mas: una factura de hace 90 dias con 30 de credito tiene 90 de antiguedad
 * y 60 de atraso, y las dos cifras se usan. Lo que estaba mal era llamarlas
 * igual. Ahora salen las dos, cada una con su nombre.
 *
 * El atraso sale de `diasDeAtraso`, que vale cero el mismo dia del vencimiento
 * -- ese dia todavia se puede pagar -- y no construye ningun `Date` a partir
 * de la fecha (ver `utils/fechasLocales.ts`).
 */
import { diaDe, diasDeAntiguedad, hoyDia } from '@/utils/fechasLocales';
import { analizarVencimiento, TOLERANCIA } from './vencimiento';

// Se reexporta para no romper a quien ya la importaba de aqui. La define
// `vencimiento.ts`, que es quien decide cuando una cuenta esta saldada.
export { TOLERANCIA };

export type TipoCuenta = 'cobrar' | 'pagar';

export type EstadoCuenta = 'pagado' | 'vencida' | 'al-dia';

export interface FilaCuenta {
  id: string;
  /** Lo que el usuario reconoce: el NCF o el codigo. Nunca vacio. */
  documento: string;
  entidad: string;
  /** 'AAAA-MM-DD', o null si el documento no la trae. */
  emision: string | null;
  vencimiento: string | null;
  montoOriginal: number;
  saldo: number;
  /** Dias desde la emision. */
  antiguedad: number;
  /** Dias desde el vencimiento. Cero el mismo dia del vencimiento y antes. */
  atraso: number;
  estado: EstadoCuenta;
}

export const PALABRAS: Record<TipoCuenta, {
  entidad: string; entidadPlural: string; titulo: string; fichero: string; prefijo: string; buscar: string;
}> = {
  cobrar: {
    entidad: 'Cliente', entidadPlural: 'clientes',
    titulo: 'Reporte de Cuentas por Cobrar',
    fichero: 'Cuentas_por_Cobrar.csv',
    prefijo: 'CXC',
    buscar: 'Buscar por cliente o documento...',
  },
  pagar: {
    entidad: 'Suplidor', entidadPlural: 'suplidores',
    titulo: 'Reporte de Cuentas por Pagar',
    fichero: 'Cuentas_por_Pagar.csv',
    prefijo: 'CXP',
    buscar: 'Buscar por suplidor o documento...',
  },
};

/** `Number` sobre una cadena vacia da 0, pero sobre `null` tambien: se fuerza a 0 explicito. */
const aNumero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizarFila(bruta: any, tipo: TipoCuenta, hoy: string = hoyDia()): FilaCuenta {
  const P = PALABRAS[tipo];
  const id = String(bruta?.id ?? '');
  const saldo = aNumero(bruta?.balance);
  // Una sola llamada decide el dia, el atraso y si esta saldada. Antes esas
  // tres cosas se sacaban por separado y el estado se recomponia aqui a mano.
  const v = analizarVencimiento(bruta?.dueDate, { hoy, saldo });

  return {
    id,
    // El codigo que el usuario dicta por telefono manda; el trozo del id es el
    // ultimo recurso, no la primera opcion.
    documento: bruta?.codigoFactura || bruta?.ncf
      || (id ? `${P.prefijo}-${id.split('-')[0].toUpperCase()}` : '—'),
    entidad: (tipo === 'cobrar' ? bruta?.customerName : bruta?.supplierName) || '—',
    emision: diaDe(bruta?.createdAt),
    vencimiento: v.dia,
    montoOriginal: aNumero(bruta?.amount),
    saldo,
    antiguedad: diasDeAntiguedad(bruta?.createdAt, hoy),
    atraso: v.atraso,
    // Saldada primero: una cuenta pagada no esta vencida aunque su fecha pasara.
    estado: v.saldada ? 'pagado' : (v.vencida ? 'vencida' : 'al-dia'),
  };
}

export const normalizarFilas = (brutas: any[], tipo: TipoCuenta, hoy: string = hoyDia()): FilaCuenta[] =>
  (Array.isArray(brutas) ? brutas : []).map(b => normalizarFila(b, tipo, hoy));

/** Lo que se ve: saldadas fuera salvo que se pidan, y el texto buscado en documento o entidad. */
export function filtrarFilas(filas: FilaCuenta[], busca: string, verSaldadas: boolean): FilaCuenta[] {
  const t = busca.trim().toLowerCase();
  return filas.filter(f => {
    if (!verSaldadas && f.estado === 'pagado') return false;
    if (!t) return true;
    return f.entidad.toLowerCase().includes(t) || f.documento.toLowerCase().includes(t);
  });
}
