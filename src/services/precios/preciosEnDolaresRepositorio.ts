/**
 * Lote 247: precios atados al dolar. Lo que toca la base.
 *
 * Las reglas (como se calcula un precio, que es una tasa valida) viven en
 * `preciosEnDolares.ts`, puras. Aqui solo se lee, se guarda y se aplica.
 *
 * Las tres tablas son de la migracion 0017. Si aun no se aplico, toda funcion
 * de aqui lanza `FaltaLaMigracionDeDolares`: la pantalla lo dice con su nombre
 * y el resto de la aplicacion (que no las lee) sigue como estaba.
 */
import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or } from 'drizzle-orm';
import { db, products, type DbOTx } from '@/db';
import { tasasDeCambio, productosEnDolares, cambiosDePrecio } from '@/db/schema/dolar';
import { calcular, mismaTasa, type Calculo, type Importes, type Renglon, type Tasa } from './preciosEnDolares';

export class FaltaLaMigracionDeDolares extends Error {
  constructor() {
    super('Los precios en dólares aún no se pueden usar: falta aplicar la migración 0017_precios_en_dolares.sql en la base de datos.');
    this.name = 'FaltaLaMigracionDeDolares';
  }
}

/** Lo que se pide no se puede hacer tal como esta la base (se contesta 409). */
export class ConflictoDePrecios extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ConflictoDePrecios';
  }
}

/** Postgres 42P01: la tabla no existe. Drizzle envuelve el fallo: la causa viaja en `cause`. */
const faltaLaTabla = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '42P01' || err?.cause?.code === '42P01';
};

async function conMigracion<T>(tarea: () => Promise<T>): Promise<T> {
  try {
    return await tarea();
  } catch (e) {
    if (faltaLaTabla(e)) throw new FaltaLaMigracionDeDolares();
    throw e;
  }
}

const num = (v: string | null | undefined) => Number(v ?? 0) || 0;

/** Escapa `%` y `_`: buscar "50%" no puede significar "cualquier cosa" (lote 110). */
const patron = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const columnas = {
  productId: productosEnDolares.productId,
  costoUsd: productosEnDolares.costoUsd,
  tasaAplicada: productosEnDolares.tasaAplicada,
  sku: products.sku,
  name: products.name,
  cost: products.cost,
  price: products.price,
  priceConsumidor: products.priceConsumidor,
  priceMayorista: products.priceMayorista,
  priceProveedor: products.priceProveedor,
  isOnSale: products.isOnSale,
  promotionalPrice: products.promotionalPrice,
};

type Fila = {
  productId: string; costoUsd: string; tasaAplicada: string | null; sku: string | null; name: string;
  cost: string; price: string; priceConsumidor: string; priceMayorista: string; priceProveedor: string;
  isOnSale: boolean; promotionalPrice: string;
};

function renglon(f: Fila, tasa: number | null): Renglon {
  const costoUsd = num(f.costoUsd);
  const actual: Importes = {
    cost: num(f.cost),
    price: num(f.price),
    priceConsumidor: num(f.priceConsumidor),
    priceMayorista: num(f.priceMayorista),
    priceProveedor: num(f.priceProveedor),
  };
  return {
    productId: f.productId,
    sku: f.sku,
    name: f.name,
    costoUsd,
    actual,
    tasaAplicada: f.tasaAplicada === null ? null : num(f.tasaAplicada),
    calculo: tasa === null ? null : calcular({ ...actual, costoUsd, oferta: f.isOnSale ? num(f.promotionalPrice) : null }, tasa),
  };
}

/** La tasa vigente: la del dia mas reciente. Con `tx`, dentro de su transaccion. */
async function tasaVigente(companyId: string, tx: DbOTx = db): Promise<Tasa | null> {
  const [f] = await tx
    .select({ fecha: tasasDeCambio.fecha, tasa: tasasDeCambio.tasa })
    .from(tasasDeCambio)
    .where(eq(tasasDeCambio.companyId, companyId))
    .orderBy(desc(tasasDeCambio.fecha))
    .limit(1);
  return f ? { fecha: f.fecha, tasa: num(f.tasa) } : null;
}

export const PreciosEnDolaresRepositorio = {
  /** La tasa vigente y las ultimas escritas. */
  tasas: (companyId: string): Promise<{ vigente: Tasa | null; historial: Tasa[] }> => conMigracion(async () => {
    const filas = await db
      .select({ fecha: tasasDeCambio.fecha, tasa: tasasDeCambio.tasa })
      .from(tasasDeCambio)
      .where(eq(tasasDeCambio.companyId, companyId))
      .orderBy(desc(tasasDeCambio.fecha))
      .limit(10);
    const historial = filas.map((f) => ({ fecha: f.fecha, tasa: num(f.tasa) }));
    return { vigente: historial[0] ?? null, historial };
  }),

  /** Escribe la tasa de un dia. Corregirla el mismo dia la sustituye. */
  guardarTasa: (companyId: string, fecha: string, tasa: number, userId: string): Promise<Tasa> => conMigracion(async () => {
    await db
      .insert(tasasDeCambio)
      .values({ companyId, fecha, tasa: tasa.toFixed(4), registradaPor: userId })
      .onConflictDoUpdate({
        target: [tasasDeCambio.companyId, tasasDeCambio.fecha],
        set: { tasa: tasa.toFixed(4), registradaPor: userId, updatedAt: new Date() },
      });
    return { fecha, tasa };
  }),

  /** Los productos atados, cada uno con lo que cambiaria a la tasa vigente. */
  listar: (companyId: string): Promise<{ tasa: Tasa | null; renglones: Renglon[] }> => conMigracion(async () => {
    const [tasa, filas] = await Promise.all([
      tasaVigente(companyId),
      db
        .select(columnas)
        .from(productosEnDolares)
        .innerJoin(products, and(eq(products.id, productosEnDolares.productId), eq(products.companyId, productosEnDolares.companyId)))
        .where(and(eq(productosEnDolares.companyId, companyId), isNull(products.deletedAt)))
        .orderBy(asc(products.name)),
    ]);
    return { tasa, renglones: filas.map((f) => renglon(f, tasa?.tasa ?? null)) };
  }),

  /** Productos de la empresa que aun NO estan atados, para elegir uno. */
  buscarParaAtar: (companyId: string, texto: string): Promise<{ id: string; sku: string | null; name: string; cost: number }[]> => conMigracion(async () => {
    const atados = db
      .select({ id: productosEnDolares.productId })
      .from(productosEnDolares)
      .where(eq(productosEnDolares.companyId, companyId));
    const t = texto.trim();
    const filas = await db
      .select({ id: products.id, sku: products.sku, name: products.name, cost: products.cost })
      .from(products)
      .where(and(
        eq(products.companyId, companyId),
        isNull(products.deletedAt),
        notInArray(products.id, atados),
        t ? or(ilike(products.name, patron(t)), ilike(products.sku, patron(t))) : undefined,
      ))
      .orderBy(asc(products.name))
      .limit(8);
    return filas.map((f) => ({ ...f, cost: num(f.cost) }));
  }),

  /** Ata un producto al dolar, o le cambia el costo en dolares. `false` si el producto no es de la empresa. */
  atar: (companyId: string, productId: string, costoUsd: number): Promise<boolean> => conMigracion(async () => {
    const [p] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.companyId, companyId), isNull(products.deletedAt)))
      .limit(1);
    if (!p) return false;
    await db
      .insert(productosEnDolares)
      .values({ productId, companyId, costoUsd: costoUsd.toFixed(4) })
      .onConflictDoUpdate({
        target: productosEnDolares.productId,
        set: { costoUsd: costoUsd.toFixed(4), updatedAt: new Date() },
        //  Solo si la fila es de ESTA empresa: la clave es el producto a secas.
        setWhere: eq(productosEnDolares.companyId, companyId),
      });
    return true;
  }),

  /** Suelta un producto: sus precios se quedan como estan y dejan de seguir al dolar. */
  desatar: (companyId: string, productId: string): Promise<boolean> => conMigracion(async () => {
    const filas = await db
      .delete(productosEnDolares)
      .where(and(eq(productosEnDolares.productId, productId), eq(productosEnDolares.companyId, companyId)))
      .returning({ id: productosEnDolares.productId });
    return filas.length > 0;
  }),

  /**
   * Aplica los precios de la tasa vigente a los productos elegidos. Todo o nada.
   *
   * `tasaVista` es la tasa que quien confirma tenia en pantalla: si ya no es la
   * vigente, se rechaza (se confirmo otra cosa). Los productos se BLOQUEAN antes
   * de leerlos: el calculo parte del costo y los precios de ese momento, y dos
   * confirmaciones a la vez no pueden partir las dos del mismo "antes".
   */
  aplicar: (companyId: string, userId: string, tasaVista: unknown, ids: string[]): Promise<{ tasa: Tasa; aplicados: number }> => conMigracion(() =>
    db.transaction(async (tx) => {
      const tasa = await tasaVigente(companyId, tx);
      if (!tasa) throw new ConflictoDePrecios('Todavía no hay ninguna tasa escrita.');
      if (!mismaTasa(tasaVista, tasa.tasa)) {
        throw new ConflictoDePrecios('La tasa cambió mientras revisabas los precios. Vuelve a cargarlos y confirma otra vez.');
      }
      if (ids.length === 0) return { tasa, aplicados: 0 };

      await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.companyId, companyId), inArray(products.id, ids)))
        .for('update');

      const filas = await tx
        .select(columnas)
        .from(productosEnDolares)
        .innerJoin(products, and(eq(products.id, productosEnDolares.productId), eq(products.companyId, productosEnDolares.companyId)))
        .where(and(
          eq(productosEnDolares.companyId, companyId),
          inArray(productosEnDolares.productId, ids),
          isNull(products.deletedAt),
        ));
      if (filas.length !== new Set(ids).size) {
        throw new ConflictoDePrecios('Alguno de los productos ya no está atado al dólar. Vuelve a cargar la lista.');
      }

      let aplicados = 0;
      const ahora = new Date();
      //  Uno a uno y en orden, a proposito: es UNA transaccion, o sea una sola conexion;
      //  lanzarlos a la vez no los haria ir en paralelo.
      for (const f of filas) {
        const r = renglon(f, tasa.tasa);
        const c = r.calculo as Calculo;
        if (c.cambia) {
          const d: Importes = c.despues;
          await tx
            .update(products)
            .set({
              cost: d.cost.toFixed(2),
              price: d.price.toFixed(2),
              priceConsumidor: d.priceConsumidor.toFixed(2),
              priceMayorista: d.priceMayorista.toFixed(2),
              priceProveedor: d.priceProveedor.toFixed(2),
              updatedAt: ahora,
            })
            .where(and(eq(products.id, f.productId), eq(products.companyId, companyId)));
          await tx.insert(cambiosDePrecio).values({
            companyId,
            productId: f.productId,
            tasa: tasa.tasa.toFixed(4),
            costoUsd: r.costoUsd.toFixed(4),
            antes: c.antes,
            despues: c.despues,
            aplicadoPor: userId,
          });
          aplicados += 1;
        }
        //  Aunque no cambie nada, queda dicho con que tasa esta calculado.
        await tx
          .update(productosEnDolares)
          .set({ tasaAplicada: tasa.tasa.toFixed(4), aplicadaEn: ahora, updatedAt: ahora })
          .where(and(eq(productosEnDolares.productId, f.productId), eq(productosEnDolares.companyId, companyId)));
      }
      return { tasa, aplicados };
    })),
};
