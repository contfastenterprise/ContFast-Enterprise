import {
  db,
  accountsReceivable,
  accountsPayable,
  customerReceiptApplied,
  supplierPaymentApplied,
  customers,
  suppliers,
  invoices,
  expenses,
} from '@/db';
import { and, eq, inArray, sql, isNull, desc } from 'drizzle-orm';
import { nivelPorAtraso, type NivelRiesgo } from '@/services/cartera/riesgo';

export type TipoCartera = 'clientes' | 'suplidores';
export type Modo = 'PRODUCCION' | 'PRUEBA';

/** Un punto de la grafica mensual. */
export interface PuntoMensual {
  /** 'AAAA-MM', para ordenar sin ambigüedad. La etiqueta corta la pone la pantalla. */
  mes: string;
  /** Lo facturado (clientes) o comprometido (suplidores) en ese mes. */
  monto: number;
  /** Variación porcentual contra el mes anterior. `null` en el primero: no hay contra qué comparar. */
  variacion: number | null;
}

/** Una linea del estado de cuenta: una factura y todo lo que le paso. */
export interface PartidaAbierta {
  ncf: string;
  codigo: string | null;
  fecha: string;
  vence: string;
  montoFacturado: number;
  notasDebito: number;
  notasCredito: number;
  abonos: number;
  saldo: number;
  diasAtraso: number;
  /** Nota de debito que no encontro su factura: sale sola y marcada. */
  huerfana: boolean;
}

export interface FilaCartera {
  id: string;
  nombre: string;
  rncCedula: string | null;
  telefono: string | null;
  correo: string | null;
  /** Suma de lo que queda por cobrar/pagar. Solo cuotas con saldo. */
  saldo: number;
  /** Solo clientes. `null` en suplidores: la tabla `suppliers` no tiene esa columna. */
  cupoCredito: number | null;
  /** Los dias de la cuota MAS atrasada que sigue con saldo. 0 si no hay nada vencido. */
  diasAtraso: number;
  nivelRiesgo: NivelRiesgo;
  /** Fecha del documento mas reciente. `null` si no hay ninguno. */
  ultimoDocumento: string | null;
  documentosPendientes: number;
  mensual: PuntoMensual[];
}

/**
 * Los numeros de la pantalla de cartera.
 *
 * DOS CONSULTAS, NO UNA POR ENTIDAD
 * ---------------------------------
 * Auditoria P2-28: el patron que hay que evitar es el bucle que consulta por
 * cada fila. Aqui son DOS consultas para toda la cartera -- los agregados y la
 * serie mensual -- y el cruce se hace en memoria. Con 300 clientes eso es la
 * diferencia entre 2 consultas y 601.
 *
 * EL RIESGO NO SE GUARDA
 * ----------------------
 * Sale de `nivelPorAtraso` sobre los dias de la cuota mas atrasada, calculados
 * por Postgres contra CURRENT_DATE en el momento de preguntar. Ver
 * `src/services/cartera/riesgo.ts`.
 *
 * MODO Y EMPRESA
 * --------------
 * Las dos consultas filtran por `companyId` Y por `modo`. Sin el modo, la
 * cartera de PRUEBA se sumaría a la real y la pantalla enseñaría un total que
 * no le debe nadie.
 */
export class CarteraRepository {
  static async resumen(
    companyId: string,
    modo: Modo,
    tipo: TipoCartera
  ): Promise<FilaCartera[]> {
    return tipo === 'clientes'
      ? await this.resumenClientes(companyId, modo)
      : await this.resumenSuplidores(companyId, modo);
  }

  // ─────────────────────────── clientes ───────────────────────────
  private static async resumenClientes(companyId: string, modo: Modo): Promise<FilaCartera[]> {
    const filas = await db
      .select({
        id: customers.id,
        nombre: customers.name,
        rncCedula: customers.rncCedula,
        telefono: customers.phone,
        correo: customers.email,
        cupoCredito: customers.creditLimit,
        // Solo las cuotas que siguen debiendo algo suman al saldo.
        saldo: sql<string>`COALESCE(SUM(CASE WHEN ${accountsReceivable.balance} > 0 THEN ${accountsReceivable.balance} ELSE 0 END), 0)`,
        // La cuota MAS atrasada con saldo. `GREATEST(...,0)` para que una
        // factura dentro de sus 30 dias de credito no reste dias y disfrace
        // el atraso de las que si vencieron.
        diasAtraso: sql<number>`COALESCE(MAX(CASE WHEN ${accountsReceivable.balance} > 0 THEN GREATEST(CURRENT_DATE - ${accountsReceivable.dueDate}, 0) ELSE 0 END), 0)`,
        documentosPendientes: sql<number>`COUNT(*) FILTER (WHERE ${accountsReceivable.balance} > 0)`,
        ultimoDocumento: sql<string | null>`MAX(${accountsReceivable.createdAt})`,
      })
      .from(accountsReceivable)
      .innerJoin(customers, eq(accountsReceivable.customerId, customers.id))
      .where(
        and(
          eq(accountsReceivable.companyId, companyId),
          eq(accountsReceivable.modo, modo),
          isNull(accountsReceivable.deletedAt),
          isNull(customers.deletedAt)
        )
      )
      .groupBy(
        customers.id,
        customers.name,
        customers.rncCedula,
        customers.phone,
        customers.email,
        customers.creditLimit
      );

    const series = await db
      .select({
        id: accountsReceivable.customerId,
        mes: sql<string>`TO_CHAR(DATE_TRUNC('month', ${accountsReceivable.createdAt}), 'YYYY-MM')`,
        monto: sql<string>`COALESCE(SUM(${accountsReceivable.amount}), 0)`,
      })
      .from(accountsReceivable)
      .where(
        and(
          eq(accountsReceivable.companyId, companyId),
          eq(accountsReceivable.modo, modo),
          isNull(accountsReceivable.deletedAt),
          sql`${accountsReceivable.createdAt} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'`
        )
      )
      .groupBy(accountsReceivable.customerId, sql`DATE_TRUNC('month', ${accountsReceivable.createdAt})`);

    return this.armar(filas, series, true);
  }

  // ─────────────────────────── suplidores ───────────────────────────
  private static async resumenSuplidores(companyId: string, modo: Modo): Promise<FilaCartera[]> {
    const filas = await db
      .select({
        id: suppliers.id,
        nombre: suppliers.name,
        rncCedula: suppliers.rnc,
        telefono: suppliers.phone,
        correo: suppliers.email,
        saldo: sql<string>`COALESCE(SUM(CASE WHEN ${accountsPayable.balance} > 0 THEN ${accountsPayable.balance} ELSE 0 END), 0)`,
        diasAtraso: sql<number>`COALESCE(MAX(CASE WHEN ${accountsPayable.balance} > 0 THEN GREATEST(CURRENT_DATE - ${accountsPayable.dueDate}, 0) ELSE 0 END), 0)`,
        documentosPendientes: sql<number>`COUNT(*) FILTER (WHERE ${accountsPayable.balance} > 0)`,
        ultimoDocumento: sql<string | null>`MAX(${accountsPayable.createdAt})`,
      })
      .from(accountsPayable)
      .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          isNull(accountsPayable.deletedAt),
          isNull(suppliers.deletedAt)
        )
      )
      .groupBy(
        suppliers.id,
        suppliers.name,
        suppliers.rnc,
        suppliers.phone,
        suppliers.email
      );

    const series = await db
      .select({
        id: accountsPayable.supplierId,
        mes: sql<string>`TO_CHAR(DATE_TRUNC('month', ${accountsPayable.createdAt}), 'YYYY-MM')`,
        monto: sql<string>`COALESCE(SUM(${accountsPayable.amount}), 0)`,
      })
      .from(accountsPayable)
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          isNull(accountsPayable.deletedAt),
          sql`${accountsPayable.createdAt} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'`
        )
      )
      .groupBy(accountsPayable.supplierId, sql`DATE_TRUNC('month', ${accountsPayable.createdAt})`);

    // `cupoCredito` va en null a proposito: `suppliers` NO tiene esa columna, y
    // poner 0 se leeria como "cupo cero", que es lo contrario de "no aplica".
    return this.armar(filas, series, false);
  }

  // ─────────────────────────── el cruce ───────────────────────────
  private static armar(
    filas: any[],
    series: { id: string; mes: string; monto: string }[],
    conCupo: boolean
  ): FilaCartera[] {
    const meses = this.ultimosSeisMeses();

    const porEntidad = new Map<string, Map<string, number>>();
    for (const s of series) {
      if (!porEntidad.has(s.id)) porEntidad.set(s.id, new Map());
      porEntidad.get(s.id)!.set(s.mes, Number(s.monto) || 0);
    }

    return filas.map((f) => {
      const suyos = porEntidad.get(f.id) ?? new Map<string, number>();

      // Los seis meses SIEMPRE, con cero donde no hubo movimiento: si solo se
      // pintaran los meses con datos, un mes en blanco se leeria como una
      // caida suave en vez de como lo que fue, un mes sin facturar.
      const mensual: PuntoMensual[] = meses.map((mes, i) => {
        const monto = suyos.get(mes) ?? 0;
        const previo = i === 0 ? null : (suyos.get(meses[i - 1]) ?? 0);
        let variacion: number | null = null;
        if (previo !== null) {
          // Dividir entre cero no da "infinito por ciento": da que no hay
          // comparacion posible. Se dice con null, no con un numero inventado.
          variacion = previo === 0 ? null : ((monto - previo) / previo) * 100;
        }
        return { mes, monto, variacion };
      });

      const diasAtraso = Number(f.diasAtraso) || 0;

      return {
        id: f.id,
        nombre: f.nombre,
        rncCedula: f.rncCedula ?? null,
        telefono: f.telefono ?? null,
        correo: f.correo ?? null,
        saldo: Number(f.saldo) || 0,
        cupoCredito: conCupo ? Number(f.cupoCredito) || 0 : null,
        diasAtraso,
        nivelRiesgo: nivelPorAtraso(diasAtraso),
        ultimoDocumento: f.ultimoDocumento ? new Date(f.ultimoDocumento).toISOString() : null,
        documentosPendientes: Number(f.documentosPendientes) || 0,
        mensual,
      };
    });
  }

  /** 'AAAA-MM' de los ultimos seis meses, del mas viejo al actual. */
  private static ultimosSeisMeses(): string[] {
    const hoy = new Date();
    const out: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }

  /** Nombre y RNC de la entidad, para el membrete del estado de cuenta. */
  static async datosEntidad(
    companyId: string,
    tipo: TipoCartera,
    entidadId: string
  ): Promise<{ name: string; rncCedula: string | null } | null> {
    if (tipo === 'clientes') {
      const [c] = await db
        .select({ name: customers.name, rncCedula: customers.rncCedula })
        .from(customers)
        // La empresa NO es opcional: el id viene de la URL, y este nombre acaba
        // impreso en un papel que se entrega.
        .where(and(eq(customers.id, entidadId), eq(customers.companyId, companyId)))
        .limit(1);
      return c ?? null;
    }
    const [s] = await db
      .select({ name: suppliers.name, rncCedula: suppliers.rnc })
      .from(suppliers)
      .where(and(eq(suppliers.id, entidadId), eq(suppliers.companyId, companyId)))
      .limit(1);
    return s ?? null;
  }

  // ──────────────────── el estado de cuenta por NCF ────────────────────
  /**
   * Las partidas que siguen abiertas, UNA POR NCF DE FACTURA.
   *
   * QUE CAMBIA RESPECTO A UN LIBRO DE MOVIMIENTOS
   * ---------------------------------------------
   * Un libro de movimientos pone cada cosa en su renglon: la factura, el
   * recibo, la nota. Esto no: aqui cada renglon es UNA FACTURA, y lo que le
   * paso -- lo abonado, lo acreditado, lo cargado de mas -- va en columnas de
   * esa misma linea. Un recibo no aparece por su cuenta: aparece rebajando la
   * factura a la que se aplico.
   *
   * Y solo salen las que siguen DEBIENDO algo. Una factura saldada no es parte
   * de un estado de cuenta: es historia.
   *
   * COMO SE AGRUPA, Y POR QUE ASI
   * -----------------------------
   * En este sistema los dos tipos de nota se comportan distinto:
   *
   *   - la NOTA DE CREDITO (e-34) no crea cuenta por cobrar propia: rebaja el
   *     balance de la factura que corrige (`invoiceDbBooker`). Su importe no
   *     esta en ninguna columna, hay que ir a buscarlo a la factura e-34;
   *
   *   - la NOTA DE DEBITO (e-33) SI crea su propia cuenta por cobrar, con su
   *     NCF y su vencimiento. Si se dejara suelta, el cliente veria dos lineas
   *     para una sola venta.
   *
   * Las dos se agrupan bajo el NCF de la factura que corrigen, y entonces la
   * linea cuadra sola:
   *
   *     saldo = (facturado + notas de debito) - abonos - notas de credito
   *
   * Si una nota de debito apunta a una factura que no esta en la cartera --
   * porque era de contado, o es anterior -- no se esconde: sale con su propio
   * NCF y marcada, en vez de desaparecer de la suma.
   */
  static async estadoPorNcf(
    companyId: string,
    modo: Modo,
    tipo: TipoCartera,
    entidadId: string
  ): Promise<PartidaAbierta[]> {
    return tipo === 'clientes'
      ? await this.partidasCliente(companyId, modo, entidadId)
      : await this.partidasSuplidor(companyId, modo, entidadId);
  }

  private static async partidasCliente(
    companyId: string,
    modo: Modo,
    clienteId: string
  ): Promise<PartidaAbierta[]> {
    // TODAS las cuentas del cliente, no solo las que deben: una factura ya
    // saldada puede arrastrar una nota de debito que sigue abierta, y esa nota
    // tiene que colgar de su factura.
    const cuentas = await db
      .select({
        arId: accountsReceivable.id,
        invoiceId: accountsReceivable.invoiceId,
        monto: accountsReceivable.amount,
        saldo: accountsReceivable.balance,
        vence: accountsReceivable.dueDate,
        fecha: accountsReceivable.createdAt,
        ncf: invoices.ncf,
        codigo: invoices.codigoFactura,
        ecfType: invoices.ecfType,
        corrigeA: invoices.modifiedInvoiceId,
        diasAtraso: sql<number>`GREATEST(CURRENT_DATE - ${accountsReceivable.dueDate}, 0)`,
      })
      .from(accountsReceivable)
      .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .where(
        and(
          eq(accountsReceivable.companyId, companyId),
          eq(accountsReceivable.modo, modo),
          eq(accountsReceivable.customerId, clienteId),
          isNull(accountsReceivable.deletedAt)
        )
      );

    if (cuentas.length === 0) return [];

    const arIds = cuentas.map((c) => c.arId);
    const facturaIds = cuentas.map((c) => c.invoiceId);

    // Lo abonado a cada cuenta. Una consulta para todas, no una por linea.
    const abonos = await db
      .select({
        arId: customerReceiptApplied.arId,
        total: sql<string>`COALESCE(SUM(${customerReceiptApplied.amountApplied}), 0)`,
      })
      .from(customerReceiptApplied)
      .where(inArray(customerReceiptApplied.arId, arIds))
      .groupBy(customerReceiptApplied.arId);

    // Las notas de credito, que NO tienen cuenta por cobrar propia: su importe
    // solo existe en la factura e-34 que corrige a esta.
    const notasCredito = await db
      .select({
        corrigeA: invoices.modifiedInvoiceId,
        total: sql<string>`COALESCE(SUM(${invoices.totalNet}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          eq(invoices.modo, modo),
          eq(invoices.ecfType, '34'),
          inArray(invoices.modifiedInvoiceId, facturaIds)
        )
      )
      .groupBy(invoices.modifiedInvoiceId);

    const abonoPorAr = new Map(abonos.map((a) => [a.arId, Number(a.total) || 0]));
    const ncPorFactura = new Map(
      notasCredito.filter((n) => n.corrigeA).map((n) => [n.corrigeA as string, Number(n.total) || 0])
    );
    const esFacturaConocida = new Set(facturaIds);

    // Clave del grupo: la nota de debito cuelga de la factura que corrige,
    // siempre que esa factura este aqui. Si no esta, la nota es su propio grupo
    // -- y se marca, en vez de desaparecer.
    const grupos = new Map<string, PartidaAbierta & { _origenPuesto: boolean }>();

    for (const c of cuentas) {
      const esNotaDebito = c.ecfType === '33' && !!c.corrigeA;
      const cuelgaDe = esNotaDebito && esFacturaConocida.has(c.corrigeA as string)
        ? (c.corrigeA as string)
        : c.invoiceId;

      if (!grupos.has(cuelgaDe)) {
        grupos.set(cuelgaDe, {
          ncf: '',
          codigo: null,
          fecha: '',
          vence: '',
          montoFacturado: 0,
          notasDebito: 0,
          notasCredito: ncPorFactura.get(cuelgaDe) ?? 0,
          abonos: 0,
          saldo: 0,
          diasAtraso: 0,
          huerfana: false,
          _origenPuesto: false,
        });
      }
      const g = grupos.get(cuelgaDe)!;

      const monto = Number(c.monto) || 0;
      const saldo = Number(c.saldo) || 0;

      if (cuelgaDe === c.invoiceId) {
        // Esta linea ES la cabecera del grupo: su NCF y sus fechas mandan.
        g.ncf = c.ncf;
        g.codigo = c.codigo ?? null;
        g.fecha = new Date(c.fecha).toISOString();
        g.vence = String(c.vence);
        g._origenPuesto = true;
        // Una nota de debito que no encontro su factura es su propio grupo, y
        // eso hay que decirlo: si no, parece una venta que nadie recuerda.
        g.huerfana = esNotaDebito;
        g.montoFacturado += monto;
      } else {
        g.notasDebito += monto;
      }

      g.abonos += abonoPorAr.get(c.arId) ?? 0;
      g.saldo += saldo;
      // Los dias los marca la parte MAS atrasada que siga debiendo.
      if (saldo > 0) g.diasAtraso = Math.max(g.diasAtraso, Number(c.diasAtraso) || 0);
    }

    return [...grupos.values()]
      // Solo lo que sigue debiendo. El centavo de tolerancia es el mismo que usa
      // el resto del sistema para dar una cuenta por saldada.
      .filter((g) => g.saldo > 0.01 && g._origenPuesto)
      .map(({ _origenPuesto, ...g }) => g)
      .sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0));
  }

  private static async partidasSuplidor(
    companyId: string,
    modo: Modo,
    suplidorId: string
  ): Promise<PartidaAbierta[]> {
    const cuentas = await db
      .select({
        apId: accountsPayable.id,
        monto: accountsPayable.amount,
        saldo: accountsPayable.balance,
        vence: accountsPayable.dueDate,
        fecha: accountsPayable.createdAt,
        ncf: expenses.ncf,
        diasAtraso: sql<number>`GREATEST(CURRENT_DATE - ${accountsPayable.dueDate}, 0)`,
      })
      .from(accountsPayable)
      .leftJoin(expenses, eq(accountsPayable.expenseId, expenses.id))
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          eq(accountsPayable.supplierId, suplidorId),
          isNull(accountsPayable.deletedAt),
          sql`${accountsPayable.balance} > 0`
        )
      );

    if (cuentas.length === 0) return [];

    const abonos = await db
      .select({
        apId: supplierPaymentApplied.apId,
        total: sql<string>`COALESCE(SUM(${supplierPaymentApplied.amountApplied}), 0)`,
      })
      .from(supplierPaymentApplied)
      .where(inArray(supplierPaymentApplied.apId, cuentas.map((c) => c.apId)))
      .groupBy(supplierPaymentApplied.apId);

    const abonoPorAp = new Map(abonos.map((a) => [a.apId, Number(a.total) || 0]));

    // Del lado de compras no hay notas de credito ni de debito modeladas: no se
    // inventan dos columnas vacias para que las tablas se parezcan. Se dice que
    // no aplican y ya.
    return cuentas
      .map((c) => ({
        ncf: c.ncf || 'Sin NCF',
        codigo: null,
        fecha: new Date(c.fecha).toISOString(),
        vence: String(c.vence),
        montoFacturado: Number(c.monto) || 0,
        notasDebito: 0,
        notasCredito: 0,
        abonos: abonoPorAp.get(c.apId) ?? 0,
        saldo: Number(c.saldo) || 0,
        diasAtraso: Number(c.diasAtraso) || 0,
        huerfana: false,
      }))
      .filter((p) => p.saldo > 0.01)
      .sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0));
  }

  // ─────────────────────────── el detalle ───────────────────────────
  /**
   * Los documentos pendientes de UNA entidad, para el estado de cuenta.
   *
   * Va aparte de `resumen` a proposito: traer el detalle de toda la cartera
   * para ensenar el de uno seria mandar por la red cientos de facturas que
   * nadie va a mirar. Se pide cuando se abre el estado de cuenta.
   *
   * El `id` llega de la URL, asi que la empresa y el modo NO son opcionales:
   * sin ellos se podria pedir el estado de cuenta del cliente de otra empresa.
   */
  static async detalle(
    companyId: string,
    modo: Modo,
    tipo: TipoCartera,
    entidadId: string
  ) {
    if (tipo === 'clientes') {
      return await db
        .select({
          id: accountsReceivable.id,
          referencia: invoices.ncf,
          codigo: invoices.codigoFactura,
          fecha: accountsReceivable.createdAt,
          vence: accountsReceivable.dueDate,
          monto: accountsReceivable.amount,
          saldo: accountsReceivable.balance,
          estado: accountsReceivable.status,
          diasAtraso: sql<number>`GREATEST(CURRENT_DATE - ${accountsReceivable.dueDate}, 0)`,
        })
        .from(accountsReceivable)
        .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
        .where(
          and(
            eq(accountsReceivable.companyId, companyId),
            eq(accountsReceivable.modo, modo),
            eq(accountsReceivable.customerId, entidadId),
            isNull(accountsReceivable.deletedAt),
            sql`${accountsReceivable.balance} > 0`
          )
        )
        .orderBy(desc(accountsReceivable.dueDate));
    }

    return await db
      .select({
        id: accountsPayable.id,
        referencia: expenses.ncf,
        codigo: sql<string | null>`NULL`,
        fecha: accountsPayable.createdAt,
        vence: accountsPayable.dueDate,
        monto: accountsPayable.amount,
        saldo: accountsPayable.balance,
        estado: accountsPayable.status,
        diasAtraso: sql<number>`GREATEST(CURRENT_DATE - ${accountsPayable.dueDate}, 0)`,
      })
      .from(accountsPayable)
      .leftJoin(expenses, eq(accountsPayable.expenseId, expenses.id))
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          eq(accountsPayable.supplierId, entidadId),
          isNull(accountsPayable.deletedAt),
          sql`${accountsPayable.balance} > 0`
        )
      )
      .orderBy(desc(accountsPayable.dueDate));
  }
}
