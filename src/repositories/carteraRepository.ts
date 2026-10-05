import type { ModoOperativo } from '@/services/dgii/modoPeticion';
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
import { and, eq, inArray, sql, isNull, desc, type SQLWrapper } from 'drizzle-orm';
import type { NivelRiesgo } from '@/services/cartera/riesgo';
import { analizarVencimiento, type SumaPorTramo } from '@/services/cartera/vencimiento';
import {
  resumirPorEntidad, vencimientoDeCxc, type SaldoPorNivel,
} from '@/services/cartera/reglasDeCartera';
import { facturaEsDeudaSql, vencimientoDeCxcSql } from '@/services/cartera/sqlDeCartera';
import { diaRD } from '@/utils/fechasLocales';

/**
 * Un `timestamp` sin zona que guarda UTC, convertido a la hora de RD (lote 174: el primer
 * `AT TIME ZONE` no sobra, sin el Postgres lo lee en la zona de la sesion).
 */
const creadoEnRD = (col: SQLWrapper) => sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santo_Domingo')`;

export type TipoCartera = 'clientes' | 'suplidores';
export type Modo = ModoOperativo;

/** Un documento de la cartera con los datos de su cliente o suplidor, tal como sale de la consulta. */
interface FilaDocumentoCartera {
  id: string;
  nombre: string;
  rncCedula: string | null;
  telefono: string | null;
  correo: string | null;
  /** Solo clientes: `suppliers` no tiene cupo. */
  cupoCredito?: string | number | null;
  saldo: string;
  vence: string | null;
  creado: Date | string | null;
}

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
  /**
   * Suma de lo que queda por cobrar/pagar. Solo cuotas con saldo.
   * Siempre mayor que 0.01: el que no debe nada no es una fila de esta lista.
   */
  saldo: number;
  /** Solo clientes. `null` en suplidores: la tabla `suppliers` no tiene esa columna. */
  cupoCredito: number | null;
  /** Los dias de la cuota MAS atrasada que sigue con saldo. 0 si no hay nada vencido. */
  diasAtraso: number;
  nivelRiesgo: NivelRiesgo;
  /** Fecha del documento mas reciente. `null` si no hay ninguno. */
  ultimoDocumento: string | null;
  documentosPendientes: number;
  /** Lote 304: el saldo por antiguedad, documento a documento (por vencer, 1-30 ... 90+). */
  tramos: SumaPorTramo;
  /** Lote 304: el saldo por el nivel de riesgo de CADA documento, no el de la entidad. */
  saldoPorNivel: SaldoPorNivel;
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
 * Sale de `nivelPorAtraso` sobre los dias de la cuota mas atrasada, contados
 * contra el DIA DE RD en el momento de preguntar (lote 304: antes contra
 * `CURRENT_DATE`, que en Postgres es UTC). Ver `src/services/cartera/riesgo.ts`
 * y `reglasDeCartera.ts`.
 *
 * MODO Y EMPRESA
 * --------------
 * Las dos consultas filtran por `companyId` Y por `modo`. Sin el modo, la
 * cartera de PRUEBA se sumaría a la real y la pantalla enseñaría un total que
 * no le debe nadie.
 *
 * SOLO SALE QUIEN DEBE
 * --------------------
 * Un cliente con todo saldado seguia saliendo en la tabla con saldo 0, 0 dias
 * y 0 documentos. Quien lo quita es `resumirPorEntidad` (antes un `HAVING`),
 * con el mismo centavo de tolerancia. Y no es cosmetica:
 * la dona reparte sobre `filas.length` y el CSV exporta `filas`, asi que cada
 * saldado de mas encogia el porcentaje de los que si deben.
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
  //
  //  Lote 304: antes eran dos agregados en SQL que (1) sumaban la CxC de facturas RECHAZADAS
  //  (E310000000029: 102.616,67 de mas a un cliente), (2) contaban el atraso contra la fecha de la
  //  CxC y no contra la PACTADA en la factura, y (3) contra `CURRENT_DATE`, que en Postgres (UTC) es
  //  mañana desde las 20:00 de RD. Ahora se traen los documentos -- una consulta, no una por
  //  cliente (P2-28) -- y el resumen lo hace `resumirPorEntidad`, la misma regla que el banco
  //  ejecuta y que reparte el saldo por tramos documento a documento.
  private static async resumenClientes(companyId: string, modo: Modo): Promise<FilaCartera[]> {
    const hoy = diaRD();
    // Lote 304: las dos consultas no dependen una de otra: van a la vez.
    const [docs, series] = await Promise.all([
      db
      .select({
        id: customers.id,
        nombre: customers.name,
        rncCedula: customers.rncCedula,
        telefono: customers.phone,
        correo: customers.email,
        cupoCredito: customers.creditLimit,
        saldo: accountsReceivable.balance,
        vence: vencimientoDeCxcSql(invoices.paymentDueDate, accountsReceivable.dueDate),
        creado: accountsReceivable.createdAt,
      })
      .from(accountsReceivable)
      .innerJoin(customers, eq(accountsReceivable.customerId, customers.id))
      .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .where(
        and(
          eq(accountsReceivable.companyId, companyId),
          eq(accountsReceivable.modo, modo),
          isNull(accountsReceivable.deletedAt),
          // Un cliente borrado SIGUE debiendo: antes se le quitaba de la cartera y su deuda
          // desaparecia de esta pantalla mientras las demas la seguian enseñando.
          facturaEsDeudaSql(invoices.status, invoices.deletedAt)
        )
      ),
      db
      .select({
        id: accountsReceivable.customerId,
        mes: sql<string>`TO_CHAR(DATE_TRUNC('month', ${creadoEnRD(accountsReceivable.createdAt)}), 'YYYY-MM')`,
        monto: sql<string>`COALESCE(SUM(${accountsReceivable.amount}), 0)`,
      })
      .from(accountsReceivable)
      .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .where(
        and(
          eq(accountsReceivable.companyId, companyId),
          eq(accountsReceivable.modo, modo),
          isNull(accountsReceivable.deletedAt),
          facturaEsDeudaSql(invoices.status, invoices.deletedAt),
          sql`${creadoEnRD(accountsReceivable.createdAt)} >= ${this.ultimosSeisMeses(hoy)[0] + '-01'}::date`
        )
      )
      .groupBy(sql`1`, sql`2`),
    ]);

    return this.armar(docs, series, true, hoy);
  }

  // ─────────────────────────── suplidores ───────────────────────────
  //
  //  Del lado de compras no hay estado DGII que mirar: la deuda es la CxP de una compra que sigue
  //  viva. Una CxP cuya compra se borro no es deuda (antes contaba).
  private static async resumenSuplidores(companyId: string, modo: Modo): Promise<FilaCartera[]> {
    const hoy = diaRD();
    const compraViva = sql`(${expenses.id} IS NULL OR ${expenses.deletedAt} IS NULL)`;
    // Lote 304: las dos consultas no dependen una de otra: van a la vez.
    const [docs, series] = await Promise.all([
      db
      .select({
        id: suppliers.id,
        nombre: suppliers.name,
        rncCedula: suppliers.rnc,
        telefono: suppliers.phone,
        correo: suppliers.email,
        saldo: accountsPayable.balance,
        vence: accountsPayable.dueDate,
        creado: accountsPayable.createdAt,
      })
      .from(accountsPayable)
      .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
      .leftJoin(expenses, eq(accountsPayable.expenseId, expenses.id))
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          isNull(accountsPayable.deletedAt),
          compraViva
        )
      ),
      db
      .select({
        id: accountsPayable.supplierId,
        mes: sql<string>`TO_CHAR(DATE_TRUNC('month', ${creadoEnRD(accountsPayable.createdAt)}), 'YYYY-MM')`,
        monto: sql<string>`COALESCE(SUM(${accountsPayable.amount}), 0)`,
      })
      .from(accountsPayable)
      .leftJoin(expenses, eq(accountsPayable.expenseId, expenses.id))
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          isNull(accountsPayable.deletedAt),
          compraViva,
          sql`${creadoEnRD(accountsPayable.createdAt)} >= ${this.ultimosSeisMeses(hoy)[0] + '-01'}::date`
        )
      )
      .groupBy(sql`1`, sql`2`),
    ]);

    // `cupoCredito` va en null a proposito: `suppliers` NO tiene esa columna, y
    // poner 0 se leeria como "cupo cero", que es lo contrario de "no aplica".
    return this.armar(docs, series, false, hoy);
  }

  // ─────────────────────────── el cruce ───────────────────────────
  private static armar(
    docs: FilaDocumentoCartera[],
    series: { id: string; mes: string; monto: string }[],
    conCupo: boolean,
    hoy: string
  ): FilaCartera[] {
    const meses = this.ultimosSeisMeses(hoy);

    const porEntidad = new Map<string, Map<string, number>>();
    for (const s of series) {
      if (!porEntidad.has(s.id)) porEntidad.set(s.id, new Map());
      porEntidad.get(s.id)!.set(s.mes, Number(s.monto) || 0);
    }

    const datos = new Map<string, FilaDocumentoCartera>();
    for (const d of docs) if (!datos.has(d.id)) datos.set(d.id, d);

    const resumen = resumirPorEntidad(
      docs.map((d) => ({
        entidadId: d.id,
        saldo: Number(d.saldo) || 0,
        vence: d.vence ? String(d.vence).slice(0, 10) : null,
        creado: d.creado,
      })),
      hoy
    );

    return [...resumen.entries()].map(([id, r]) => {
      const f = datos.get(id)!;
      const suyos = porEntidad.get(id) ?? new Map<string, number>();

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

      return {
        id,
        nombre: f.nombre,
        rncCedula: f.rncCedula ?? null,
        telefono: f.telefono ?? null,
        correo: f.correo ?? null,
        saldo: r.saldo,
        cupoCredito: conCupo ? Number(f.cupoCredito) || 0 : null,
        diasAtraso: r.diasAtraso,
        nivelRiesgo: r.nivelRiesgo,
        ultimoDocumento: r.ultimoDocumento,
        documentosPendientes: r.documentosPendientes,
        tramos: r.tramos,
        saldoPorNivel: r.saldoPorNivel,
        mensual,
      };
    });
  }

  /** 'AAAA-MM' de los ultimos seis meses de RD, del mas viejo al actual. */
  private static ultimosSeisMeses(hoy: string = diaRD()): string[] {
    const ano = Number(hoy.slice(0, 4));
    const mes = Number(hoy.slice(5, 7)) - 1;
    const out: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(ano, mes - i, 1));
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
    //
    // Lote 304: las de facturas que son deuda (no rechazadas ni dadas de baja), con el
    // vencimiento PACTADO y los dias contra el dia de RD -- las mismas reglas que el resumen.
    const hoy = diaRD();
    const filas = await db
      .select({
        arId: accountsReceivable.id,
        invoiceId: accountsReceivable.invoiceId,
        monto: accountsReceivable.amount,
        saldo: accountsReceivable.balance,
        venceCuenta: accountsReceivable.dueDate,
        vencePactado: invoices.paymentDueDate,
        fecha: accountsReceivable.createdAt,
        ncf: invoices.ncf,
        codigo: invoices.codigoFactura,
        ecfType: invoices.ecfType,
        corrigeA: invoices.modifiedInvoiceId,
      })
      .from(accountsReceivable)
      .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .where(
        and(
          eq(accountsReceivable.companyId, companyId),
          eq(accountsReceivable.modo, modo),
          eq(accountsReceivable.customerId, clienteId),
          isNull(accountsReceivable.deletedAt),
          facturaEsDeudaSql(invoices.status, invoices.deletedAt)
        )
      );
    const cuentas = filas.map((c) => {
      const vence = vencimientoDeCxc(c.vencePactado, c.venceCuenta);
      return { ...c, vence: vence ?? '', diasAtraso: analizarVencimiento(vence, { hoy }).atraso };
    });

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
          inArray(invoices.modifiedInvoiceId, facturaIds),
          // Una nota de credito rechazada o dada de baja no acredita nada (lote 304).
          facturaEsDeudaSql(invoices.status, invoices.deletedAt)
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
      })
      .from(accountsPayable)
      .leftJoin(expenses, eq(accountsPayable.expenseId, expenses.id))
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          eq(accountsPayable.supplierId, suplidorId),
          isNull(accountsPayable.deletedAt),
          // Lote 304: la CxP de una compra borrada no es deuda (la misma regla que el resumen).
          sql`(${expenses.id} IS NULL OR ${expenses.deletedAt} IS NULL)`,
          sql`${accountsPayable.balance} > 0`
        )
      );
    const hoy = diaRD();

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
        // Lote 304: contra el dia de RD, no contra `CURRENT_DATE` (UTC).
        diasAtraso: analizarVencimiento(c.vence, { hoy }).atraso,
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
    // Lote 304: los mismos documentos y los mismos dias que el resumen. Antes el estado de cuenta
    // enseñaba la factura rechazada que la cartera ya habia sumado, y sus dias salian de
    // `CURRENT_DATE` (UTC) y del vencimiento de la CxC en vez del pactado.
    const hoy = diaRD();
    const conDias = <T extends { vence: string | null }>(filas: T[]) =>
      filas
        .map((f) => ({ ...f, diasAtraso: analizarVencimiento(f.vence, { hoy }).atraso }))
        .sort((a, b) => String(b.vence ?? '').localeCompare(String(a.vence ?? '')));

    if (tipo === 'clientes') {
      const filas = await db
        .select({
          id: accountsReceivable.id,
          referencia: invoices.ncf,
          codigo: invoices.codigoFactura,
          fecha: accountsReceivable.createdAt,
          vence: vencimientoDeCxcSql(invoices.paymentDueDate, accountsReceivable.dueDate),
          monto: accountsReceivable.amount,
          saldo: accountsReceivable.balance,
          estado: accountsReceivable.status,
        })
        .from(accountsReceivable)
        .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
        .where(
          and(
            eq(accountsReceivable.companyId, companyId),
            eq(accountsReceivable.modo, modo),
            eq(accountsReceivable.customerId, entidadId),
            isNull(accountsReceivable.deletedAt),
            facturaEsDeudaSql(invoices.status, invoices.deletedAt),
            sql`${accountsReceivable.balance} > 0`
          )
        );
      return conDias(filas.map((f) => ({ ...f, vence: f.vence ? String(f.vence).slice(0, 10) : null })));
    }

    const filas = await db
      .select({
        id: accountsPayable.id,
        referencia: expenses.ncf,
        codigo: sql<string | null>`NULL`,
        fecha: accountsPayable.createdAt,
        vence: accountsPayable.dueDate,
        monto: accountsPayable.amount,
        saldo: accountsPayable.balance,
        estado: accountsPayable.status,
      })
      .from(accountsPayable)
      .leftJoin(expenses, eq(accountsPayable.expenseId, expenses.id))
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.modo, modo),
          eq(accountsPayable.supplierId, entidadId),
          isNull(accountsPayable.deletedAt),
          sql`(${expenses.id} IS NULL OR ${expenses.deletedAt} IS NULL)`,
          sql`${accountsPayable.balance} > 0`
        )
      );
    return conDias(filas);
  }
}
