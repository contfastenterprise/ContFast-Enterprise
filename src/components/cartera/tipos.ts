import type { FilaCartera } from '@/repositories/carteraRepository';
import type { NivelRiesgo, ConfigNivel } from '@/services/cartera/riesgo';

export type TipoCartera = 'clientes' | 'suplidores';

/** Lo que la dona y la leyenda necesitan de cada nivel. */
export interface EstadisticaNivel {
  key: NivelRiesgo;
  config: ConfigNivel;
  cantidad: number;
  porcentaje: number;
  saldo: number;
}

export type { FilaCartera };

/**
 * Las palabras cambian con la pestaña, y no son un detalle: "te deben" y
 * "debes" son la misma tabla con el dinero al reves, y llamar a las dos
 * "cartera por cobrar" seria enseñar una deuda tuya como si fuera un cobro.
 */
export const PALABRAS: Record<TipoCartera, {
  entidad: string;
  entidades: string;
  totalTitulo: string;
  totalPie: string;
  documento: string;
  irA: string;
  rutaOperativa: string;
  moduloVacio: string;
}> = {
  clientes: {
    entidad: 'cliente',
    entidades: 'clientes',
    totalTitulo: 'Cartera por Cobrar',
    totalPie: 'Total que te deben',
    documento: 'factura',
    irA: 'Ir a Cuentas por Cobrar',
    rutaOperativa: '/dashboard/receivables',
    moduloVacio: 'Aún no hay facturas a crédito registradas en este entorno.',
  },
  suplidores: {
    entidad: 'suplidor',
    entidades: 'suplidores',
    totalTitulo: 'Cuentas por Pagar',
    totalPie: 'Total que debes',
    documento: 'compra',
    irA: 'Ir a Cuentas por Pagar',
    rutaOperativa: '/dashboard/ap',
    moduloVacio: 'Aún no hay compras a crédito registradas en este entorno.',
  },
};

/**
 * El plazo de credito, y por que hace falta decirlo en pantalla.
 *
 * Los niveles de riesgo NO se cuentan desde que se emite el documento: se
 * cuentan desde que vence su plazo de credito, que en este sistema son 30 dias
 * (`invoiceDbBooker` los pone al crear la cuenta por cobrar). Sin este aviso,
 * un cliente que te debe una cantidad grande pero esta dentro de su plazo
 * aparece en verde y parece un error de la pantalla -- y no lo es.
 *
 * Se escribe UNA vez y se usa en la pantalla y en el estado de cuenta, para que
 * las dos digan exactamente lo mismo.
 */
export const DIAS_CREDITO = 30;

export const AVISO_CREDITO =
  `El crédito es de ${DIAS_CREDITO} días. Los niveles de riesgo empiezan a contarse cuando ese ` +
  'plazo vence, no desde que se emite el documento: quien debe dinero pero sigue dentro de sus ' +
  `${DIAS_CREDITO} días aparece como riesgo bajo, y eso es correcto. El nivel lo marca el documento ` +
  'más atrasado que siga con saldo, no un promedio.';

/** RD$ con dos decimales. Un importe sin decimales invita a leerlo mal. */
export const dinero = (n: number, decimales = 2): string =>
  `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

/** Para las tarjetas, donde el espacio manda y el centavo no cambia la lectura. */
export const dineroCorto = (n: number): string =>
  `RD$ ${n.toLocaleString('es-DO', { maximumFractionDigits: 0 })}`;
