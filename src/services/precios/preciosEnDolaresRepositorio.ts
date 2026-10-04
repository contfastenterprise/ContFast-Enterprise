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
import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { db, products, type DbOTx } from '@/db';
import { tasasDeCambio, productosEnDolares, cambiosDePrecio } from '@/db/schema/dolar';
import { calcular, mismaTasa, type Calculo, type Importes, type Renglon, type Tasa } from './preciosEnDolares';

export class FaltaLaMigracionDeDolares extends Error {
  constructor(migracion = '0017_precios_en_dolares.sql', que = 'Los precios en dólares aún no se pueden usar') {
    super(`${que}: falta aplicar la migración ${migracion} en la base de datos.`);
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

/**
 * Lote 258: la columna `precio_usd` llega con la migracion 0018. Se mira si existe ANTES de nombrarla:
 * desplegar antes de aplicarla no puede tumbar la pantalla (que es lo que paso con las 0013 y 0015).
 * Una vez vista, no se vuelve a preguntar.
 */
let precioUsdVisto = false;
async function hayPrecioUsd(tx: DbOTx = db): Promise<boolean> {
  if (precioUsdVisto) return true;
  const filas = (await tx.execute(sql`SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos_en_dolares' AND column_name = 'precio_usd' LIMIT 1`)) as unknown as unknown[];
  precioUsdVisto = filas.length > 0;
  return precioUsdVisto;
}

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

/** Las columnas, con el precio base en dolares solo si la migracion 0018 esta aplicada. */
const columnasDe = (conPrecio: boolean) => (conPrecio ? { ...columnas, precioUsd: productosEnDolares.precioUsd } : columnas);

type Fila = {
  productId: string; costoUsd: string; precioUsd?: string | null; tasaAplicada: string | null; sku: string | null; name: string;
  cost: string; price: string; priceConsumidor: string; priceMayorista: string; priceProveedor: string;
  isOnSale: boolean; promotionalPrice: string;
};

function renglon(f: Fila, tasa: number | null): Renglon {
  const costoUsd = num(f.costoUsd);
  const precioUsd = f.precioUsd ? num(f.precioUsd) : null;
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
    precioUsd,
    actual,
    tasaAplicada: f.tasaAplicada === null ? null : num(f.tasaAplicada),
    calculo: tasa === null ? null : calcular({ ...actual, costoUsd, precioUsd, oferta: f.isOnSale ? num(f.promotionalPrice) : null }, tasa),
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
    const conPrecio = await hayPrecioUsd();
    const [tasa, filas] = await Promise.all([
      tasaVigente(companyId),
      db
        .select(columnasDe(conPrecio))
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
      //  Lote 251: hasta 20, que ahora se pueden marcar varios de una busqueda.
      .limit(20);
    return filas.map((f) => ({ ...f, cost: num(f.cost) }));
  }),

  /**
   * Ata uno o VARIOS productos al dolar con el mismo costo, o se lo cambia
   * (lote 251: productos distintos que se compran al mismo precio). Todo o nada:
   * si alguno no es de la empresa (o esta borrado) devuelve `false` y no ata
   * ninguno -- atar "los que se pudo" dejaria a quien confirma sin saber cuales.
   */
  atar: (companyId: string, productIds: string[], costoUsd: number): Promise<boolean> => conMigracion(() =>
    db.transaction(async (tx) => {
      const unicos = [...new Set(productIds)];
      if (unicos.length === 0) return false;
      const propios = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(inArray(products.id, unicos), eq(products.companyId, companyId), isNull(products.deletedAt)));
      if (propios.length !== unicos.length) return false;
      await tx
        .insert(productosEnDolares)
        .values(unicos.map((productId) => ({ productId, companyId, costoUsd: costoUsd.toFixed(4) })))
        .onConflictDoUpdate({
          target: productosEnDolares.productId,
          set: { costoUsd: costoUsd.toFixed(4), updatedAt: new Date() },
          //  Solo si la fila es de ESTA empresa: la clave es el producto a secas.
          setWhere: eq(productosEnDolares.companyId, companyId),
        });
      return true;
    })),

  /**
   * Lote 258: fija (o quita, con `null`) el precio BASE en dolares de un producto atado. No cambia
   * ningun precio todavia: eso se confirma al aplicar. `false` si el producto no esta atado en la empresa.
   */
  fijarPrecioUsd: (companyId: string, productId: string, precioUsd: number | null): Promise<boolean> => conMigracion(async () => {
    if (!(await hayPrecioUsd())) throw new FaltaLaMigracionDeDolares('0018_precio_base_en_dolares.sql', 'El precio base en dólares aún no se puede guardar');
    const filas = await db
      .update(productosEnDolares)
      .set({ precioUsd: precioUsd === null ? null : precioUsd.toFixed(4), updatedAt: new Date() })
      .where(and(eq(productosEnDolares.productId, productId), eq(productosEnDolares.companyId, companyId)))
      .returning({ id: productosEnDolares.productId });
    return filas.length > 0;
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

      const conPrecio = await hayPrecioUsd(tx);
      const filas = await tx
        .select(columnasDe(conPrecio))
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

      return { tasa, aplicados: await aplicarFilas(tx, companyId, userId, tasa, filas) };
    })),

  /**
   * Lote 261: escribe la tasa de hoy Y la aplica a TODOS los productos atados, en
   * una sola transaccion. Es lo que usan Compras y Facturacion.
   *
   * Decision del dueño (2026-10-03): al cambiar la tasa desde esas pantallas los
   * precios se aplican sin otra confirmacion -- "para facilitar el cambio de
   * precio". En Productos sigue el camino de dos pasos (escribir, revisar, aplicar
   * los marcados): alli se va a REVISAR precios, aqui a cambiar la tasa y seguir.
   *
   * Por que en UNA transaccion y no `guardarTasa` + `aplicar` desde la ruta: si la
   * segunda fallara quedaria la tasa nueva escrita y los precios con la vieja, que
   * es justo lo que el dueño quiere evitar al pedirlo en un solo gesto. Y no hace
   * falta la comprobacion de "la tasa que se vio": la tasa la escribe esta misma
   * llamada, no hay nada visto que pueda haberse quedado viejo.
   *
   * Mismo calculo y mismo registro en `cambios_de_precio` que la confirmacion de
   * Productos: los dos pasan por `aplicarFilas`.
   */
  guardarTasaYAplicar: (companyId: string, fecha: string, valor: number, userId: string): Promise<{ tasa: Tasa; aplicados: number; atados: number }> => conMigracion(() =>
    db.transaction(async (tx) => {
      await tx
        .insert(tasasDeCambio)
        .values({ companyId, fecha, tasa: valor.toFixed(4), registradaPor: userId })
        .onConflictDoUpdate({
          target: [tasasDeCambio.companyId, tasasDeCambio.fecha],
          set: { tasa: valor.toFixed(4), registradaPor: userId, updatedAt: new Date() },
        });
      const tasa: Tasa = { fecha, tasa: valor };

      //  Los productos atados se BLOQUEAN antes de leerlos, como en `aplicar`: dos
      //  cambios de tasa a la vez no pueden partir los dos del mismo "antes".
      const atados = tx
        .select({ id: productosEnDolares.productId })
        .from(productosEnDolares)
        .where(eq(productosEnDolares.companyId, companyId));
      await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.companyId, companyId), inArray(products.id, atados)))
        .for('update');

      const conPrecio = await hayPrecioUsd(tx);
      const filas = await tx
        .select(columnasDe(conPrecio))
        .from(productosEnDolares)
        .innerJoin(products, and(eq(products.id, productosEnDolares.productId), eq(products.companyId, productosEnDolares.companyId)))
        .where(and(eq(productosEnDolares.companyId, companyId), isNull(products.deletedAt)));

      return { tasa, aplicados: await aplicarFilas(tx, companyId, userId, tasa, filas), atados: filas.length };
    })),
};

/**
 * Aplica a cada fila los importes de `tasa` y apunta el cambio. Devuelve cuantos
 * productos cambiaron de precio. Las filas tienen que venir ya bloqueadas.
 *
 * Lote 261: sale de `aplicar`, para que la confirmacion de Productos y el cambio de
 * tasa de Compras y Facturacion calculen y registren lo mismo.
 */
async function aplicarFilas(tx: DbOTx, companyId: string, userId: string, tasa: Tasa, filas: Fila[]): Promise<number> {
  if (filas.length === 0) return 0;
  const ahora = new Date();
  const cambios = filas.flatMap((f) => {
    const r = renglon(f, tasa.tasa);
    return (r.calculo as Calculo).cambia ? [{ f, r }] : [];
  });

  //  Lote 261: ya no uno a uno en un bucle (React Doctor, `async-await-in-loop`).
  //  · Los precios: una actualizacion por producto (cada uno lleva sus importes), lanzadas a la
  //    vez. Es una transaccion, o sea UNA conexion, y postgres.js las encadena en ella sin esperar
  //    a cada respuesta: no van en paralelo, pero se ahorra una ida y vuelta por producto.
  //  · El registro en `cambios_de_precio`: una sola insercion.
  //  · "Con que tasa esta calculado": una sola actualizacion, para TODAS las filas, cambien o no.
  await Promise.all(cambios.map(({ f, r }) => {
    const d: Importes = (r.calculo as Calculo).despues;
    return tx
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
  }));
  if (cambios.length > 0) {
    await tx.insert(cambiosDePrecio).values(cambios.map(({ f, r }) => ({
      companyId,
      productId: f.productId,
      tasa: tasa.tasa.toFixed(4),
      costoUsd: r.costoUsd.toFixed(4),
      antes: (r.calculo as Calculo).antes,
      despues: (r.calculo as Calculo).despues,
      aplicadoPor: userId,
    })));
  }
  await tx
    .update(productosEnDolares)
    .set({ tasaAplicada: tasa.tasa.toFixed(4), aplicadaEn: ahora, updatedAt: ahora })
    .where(and(
      eq(productosEnDolares.companyId, companyId),
      inArray(productosEnDolares.productId, filas.map((f) => f.productId)),
    ));
  return cambios.length;
}
