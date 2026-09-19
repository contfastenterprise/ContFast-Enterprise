/**
 * Las cuentas que el SISTEMA usa por su cuenta (al facturar, al comprar, al
 * cobrar), en UN solo sitio: la clave con la que se buscan, y la cuenta del
 * catalogo estandar que les corresponde.
 *
 * POR QUE EXISTE (lote 165)
 * -------------------------
 * Habia dos listas que no se hablaban: el sembrador del catalogo traia 9
 * claves, y el codigo de compras y facturas pedia 7 mas con un codigo "por
 * defecto" escrito en cada llamada. Esos codigos no existian en el catalogo
 * sembrado (1.1.08, 2.1.04, 2.1.05, 1.1.05, 5.1.02) o eran OTRA cosa (1.1.03
 * es "Inventarios", 1.1.04 "Impuestos Anticipados", las dos de agrupacion).
 *
 * Medido el 2026-09-19: Artalum, D'JIMENEZ, J'EDWARD y UltraElec NO podian
 * registrar una compra con ITBIS, con retenciones ni con otros impuestos, ni
 * una factura con retenciones del cliente ("no hay ninguna cuenta configurada").
 * Latin Doors si, porque antes del lote 137 el sistema le fue CREANDO esas
 * cuentas sobre la marcha (mal formadas: 2.1.04 y 2.1.05 como deudoras de
 * nivel 1) -- y asi acabo con dos "ITBIS Pagado en Compras", la sembrada
 * 1.1.04.01 sin uso y la 1.1.08 con 592.420,99.
 *
 * Tres de las siete ya estaban en el catalogo estandar con otro nombre de
 * clave (ITBIS pagado, ITBIS e ISR retenidos por pagar, anticipo de ISR); las
 * otras tres se anaden. Decidido por el dueño el 2026-09-19: las empresas que
 * ya existen se COMPLETAN sin mover saldos -- si una cuenta antigua ya tiene
 * movimientos, la clave se engancha a ella; si no, a la estandar.
 *
 * Sin base de datos: la tabla, y el plan que decide que hacer en cada empresa.
 */

export type TipoCuenta = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface CuentaDelSistema {
  /** La clave con la que el codigo la busca (`accounting_mappings.mapping_key`). */
  clave: string;
  /** La cuenta del catalogo estandar. */
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: 'debit' | 'credit';
}

/** La tabla. El sembrador la siembra entera y el codigo la usa por defecto. */
export const CUENTAS_DEL_SISTEMA: readonly CuentaDelSistema[] = [
  { clave: 'cash', codigo: '1.1.01.01', nombre: 'Caja General', tipo: 'asset', naturaleza: 'debit' },
  { clave: 'bank', codigo: '1.1.01.02', nombre: 'Banco Popular', tipo: 'asset', naturaleza: 'debit' },
  { clave: 'accounts_receivable', codigo: '1.1.02.01', nombre: 'Cuentas por Cobrar Clientes', tipo: 'asset', naturaleza: 'debit' },
  { clave: 'inventory', codigo: '1.1.03.01', nombre: 'Inventario de Mercancía', tipo: 'asset', naturaleza: 'debit' },
  { clave: 'itbis_purchases', codigo: '1.1.04.01', nombre: 'ITBIS Pagado en Compras', tipo: 'asset', naturaleza: 'debit' },
  // Lote 165: la misma cuenta, con la clave que usan las compras.
  { clave: 'purchase_itbis_paid', codigo: '1.1.04.01', nombre: 'ITBIS Pagado en Compras', tipo: 'asset', naturaleza: 'debit' },
  // El ISR que retiene el cliente es un anticipo del ISR de la empresa.
  { clave: 'isr_retention_receivable', codigo: '1.1.04.02', nombre: 'Anticipos de ISR', tipo: 'asset', naturaleza: 'debit' },
  { clave: 'itbis_retention_receivable', codigo: '1.1.04.03', nombre: 'ITBIS Retenido por Clientes', tipo: 'asset', naturaleza: 'debit' },
  { clave: 'other_retention_receivable', codigo: '1.1.04.04', nombre: 'Otras Retenciones por Clientes', tipo: 'asset', naturaleza: 'debit' },
  { clave: 'supplier_payable', codigo: '2.1.01.01', nombre: 'Cuentas por Pagar Proveedores', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'itbis_sales', codigo: '2.1.02.01', nombre: 'ITBIS Cobrado en Ventas', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'itbis_withholding_payable', codigo: '2.1.02.02', nombre: 'ITBIS Retenido por Pagar', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'isr_withholding_payable', codigo: '2.1.02.03', nombre: 'Retenciones de ISR por Pagar', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'sales_revenue', codigo: '4.1.01', nombre: 'Ventas de Mercancías', tipo: 'revenue', naturaleza: 'credit' },
  { clave: 'cost_of_goods_sold', codigo: '5.1.01', nombre: 'Costo de Ventas Mercancías', tipo: 'expense', naturaleza: 'debit' },
  { clave: 'purchase_other_taxes', codigo: '5.1.02', nombre: 'Otros Impuestos y Tasas', tipo: 'expense', naturaleza: 'debit' },
];

/**
 * Los codigos que el codigo usaba por defecto antes del lote 165 y que, en las
 * empresas donde se crearon sobre la marcha, tienen movimientos. Si una de esas
 * cuentas ya se usa, la clave se engancha a ella: no se mueven saldos.
 */
export const CODIGOS_ANTIGUOS: Readonly<Record<string, string>> = {
  purchase_itbis_paid: '1.1.08',
  isr_withholding_payable: '2.1.04',
  itbis_withholding_payable: '2.1.05',
  other_retention_receivable: '1.1.05',
};

/** La cuenta estandar de una clave. Lanza si la clave no es del sistema. */
export function cuentaDelSistema(clave: string): CuentaDelSistema {
  const c = CUENTAS_DEL_SISTEMA.find((x) => x.clave === clave);
  if (!c) throw new Error(`"${clave}" no es una cuenta del sistema (ver services/accounting/cuentasDelSistema.ts).`);
  return c;
}

// ---------------------------------------------------------------------------
// El plan para completar una empresa que ya existe
// ---------------------------------------------------------------------------

export interface CuentaExistente {
  id: string;
  code: string;
  type: string;
  isTransactional: boolean;
  status: string;
  /** Renglones de asiento que tiene. */
  renglones: number;
}

export type PasoDelPlan =
  | { accion: 'nada'; clave: string; motivo: string }
  | { accion: 'enlazar'; clave: string; accountId: string; codigo: string; motivo: string }
  /** Crea la cuenta estandar y le enlaza TODAS las claves que la piden. */
  | { accion: 'crear_y_enlazar'; claves: string[]; cuenta: CuentaDelSistema; codigoPadre: string; padreId: string };

/**
 * Que hacer en una empresa para que cada clave del sistema tenga su cuenta.
 * No toca lo que ya esta enlazado. Lanza, sin decidir nada, si la cuenta
 * estandar existe pero no sirve (de agrupacion, de otro tipo, inactiva) o si
 * falta su cuenta padre: eso lo tiene que ver una persona.
 */
export function planParaCompletar(
  catalogo: CuentaExistente[],
  clavesEnlazadas: Set<string>,
): PasoDelPlan[] {
  const porCodigo = new Map(catalogo.map((c) => [c.code, c]));
  const usable = (c: CuentaExistente | undefined, tipo: string) =>
    !!c && c.isTransactional && c.status === 'active' && c.type === tipo;

  const plan: PasoDelPlan[] = [];
  const porCrear = new Map<string, Extract<PasoDelPlan, { accion: 'crear_y_enlazar' }>>();
  for (const cuenta of CUENTAS_DEL_SISTEMA) {
    if (clavesEnlazadas.has(cuenta.clave)) {
      plan.push({ accion: 'nada', clave: cuenta.clave, motivo: 'ya enlazada' });
      continue;
    }

    // 1. Una cuenta antigua que YA tiene movimientos: se engancha, sin mover saldos.
    const antiguo = CODIGOS_ANTIGUOS[cuenta.clave];
    const cuentaAntigua = antiguo ? porCodigo.get(antiguo) : undefined;
    if (cuentaAntigua && usable(cuentaAntigua, cuenta.tipo) && cuentaAntigua.renglones > 0) {
      plan.push({ accion: 'enlazar', clave: cuenta.clave, accountId: cuentaAntigua.id, codigo: antiguo!,
        motivo: `cuenta en uso (${cuentaAntigua.renglones} renglones)` });
      continue;
    }

    // 2. La estandar, si ya existe y sirve.
    const estandar = porCodigo.get(cuenta.codigo);
    if (estandar) {
      if (!usable(estandar, cuenta.tipo)) {
        throw new Error(`La cuenta ${cuenta.codigo} existe pero no sirve para "${cuenta.clave}" ` +
          `(debe ser ${cuenta.tipo}, transaccional y activa). Revisela en el catalogo.`);
      }
      plan.push({ accion: 'enlazar', clave: cuenta.clave, accountId: estandar.id, codigo: cuenta.codigo, motivo: 'cuenta estandar' });
      continue;
    }

    // 3. La estandar no existe: se crea bajo su padre, UNA vez, y se le
    //    enlazan todas las claves que la piden.
    const yaPlaneada = porCrear.get(cuenta.codigo);
    if (yaPlaneada) {
      yaPlaneada.claves.push(cuenta.clave);
      continue;
    }
    const codigoPadre = cuenta.codigo.slice(0, cuenta.codigo.lastIndexOf('.'));
    const padre = porCodigo.get(codigoPadre);
    if (!padre || padre.isTransactional || padre.type !== cuenta.tipo) {
      throw new Error(`Para crear ${cuenta.codigo} ${cuenta.nombre} falta su cuenta padre ${codigoPadre} ` +
        `(de agrupacion, tipo ${cuenta.tipo}). Revise el catalogo.`);
    }
    const paso = { accion: 'crear_y_enlazar' as const, claves: [cuenta.clave], cuenta, codigoPadre, padreId: padre.id };
    porCrear.set(cuenta.codigo, paso);
    plan.push(paso);
  }
  return plan;
}
