/**
 * Acceso a datos del diagnostico de inventario y de la carga de conteo.
 *
 * Todas las consultas de aqui llevan empresa Y modo. No es celo: `modo` tiene
 * DEFAULT 'PRODUCCION' en las 40 tablas que lo tienen, asi que olvidarlo nunca
 * da error -- la fila simplemente cae en el entorno equivocado, en silencio.
 */
import { db, inventoryLevels, products, warehouses, companies, users } from '../src/db';
import { and, eq, lt, sql, isNull, or } from 'drizzle-orm';
import type { Modo, Nivel } from './_inventarioTipos';

// ------------------------------------------------------- resolucion de ambito

export const ES_UUID = (t: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

export async function resolverEmpresa(texto: string) {
  // El uuid solo se compara si el texto lo es: castear "Latin Doors" a uuid
  // revienta la consulta en Postgres antes de comparar nada.
  const condicion = ES_UUID(texto)
    ? eq(companies.id, texto)
    : sql`lower(${companies.name}) = lower(${texto})`;

  const filas = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(condicion)
    .limit(2);

  if (filas.length === 0) {
    throw new Error(`No encuentro ninguna empresa por "${texto}" (uuid o nombre exacto).`);
  }
  if (filas.length > 1) {
    throw new Error(`"${texto}" identifica a mas de una empresa. Usa el uuid.`);
  }
  return filas[0];
}

export async function resolverAlmacen(texto: string, companyId: string) {
  const condicion = ES_UUID(texto)
    ? eq(warehouses.id, texto)
    : or(
        sql`lower(${warehouses.name}) = lower(${texto})`,
        sql`lower(${warehouses.code}) = lower(${texto})`
      );

  const filas = await db
    .select({ id: warehouses.id, name: warehouses.name, code: warehouses.code })
    .from(warehouses)
    .where(and(eq(warehouses.companyId, companyId), isNull(warehouses.deletedAt), condicion));

  if (filas.length === 0) throw new Error(`La empresa no tiene ningun almacen "${texto}".`);
  if (filas.length > 1) {
    throw new Error(
      `"${texto}" identifica a mas de un almacen (${filas.map((f) => f.code).join(', ')}). ` +
        'Usa el uuid.'
    );
  }
  return filas[0];
}

// ------------------------------------------------------------------ consultas

const aNivel = (f: Record<string, unknown>): Nivel => ({
  ...(f as unknown as Nivel),
  modo: f.modo as Modo,
  quantity: Number(f.quantity),
  cost: Number(f.cost || 0),
});

export const SELECT_NIVEL = {
  levelId: inventoryLevels.id,
  companyId: inventoryLevels.companyId,
  companyName: companies.name,
  modo: inventoryLevels.modo,
  productId: inventoryLevels.productId,
  productName: products.name,
  sku: products.sku,
  activo: sql<boolean>`(${products.deletedAt} is null and ${products.status} = 'active')`,
  cost: products.cost,
  warehouseId: inventoryLevels.warehouseId,
  warehouseName: warehouses.name,
  quantity: inventoryLevels.quantity,
};

export async function buscarNegativos(empresa?: string, modo?: Modo): Promise<Nivel[]> {
  const filtros = [lt(inventoryLevels.quantity, '0')];
  if (empresa) filtros.push(eq(inventoryLevels.companyId, empresa));
  if (modo) filtros.push(eq(inventoryLevels.modo, modo));

  const filas = await db
    .select(SELECT_NIVEL)
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.productId))
    .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouseId))
    .innerJoin(companies, eq(companies.id, inventoryLevels.companyId))
    .where(and(...filtros))
    .orderBy(companies.name, inventoryLevels.modo, warehouses.name, products.name);

  return filas.map(aNivel);
}

/** Todos los niveles de un almacen, contados o no. Es la mitad "sistema". */
export async function nivelesDelAlmacen(companyId: string, modo: Modo, warehouseId: string): Promise<Nivel[]> {
  const filas = await db
    .select(SELECT_NIVEL)
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.productId))
    .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouseId))
    .innerJoin(companies, eq(companies.id, inventoryLevels.companyId))
    .where(
      and(
        eq(inventoryLevels.companyId, companyId),
        eq(inventoryLevels.modo, modo),
        eq(inventoryLevels.warehouseId, warehouseId)
      )
    )
    .orderBy(products.name);

  return filas.map(aNivel);
}

export async function contarCeros(empresa?: string, modo?: Modo): Promise<number> {
  const filtros = [eq(inventoryLevels.quantity, '0')];
  if (empresa) filtros.push(eq(inventoryLevels.companyId, empresa));
  if (modo) filtros.push(eq(inventoryLevels.modo, modo));

  const [fila] = await db
    .select({ total: sql<string>`count(*)` })
    .from(inventoryLevels)
    .where(and(...filtros));
  return Number(fila?.total || 0);
}

// ----------------------------------------------------------------- escritura

/**
 * Resuelve el usuario que firmara los ajustes. Acepta correo o uuid, y exige
 * que pertenezca a la empresa cuyos niveles se van a corregir: un movimiento
 * firmado por un usuario de otra empresa seria un registro invalido.
 */
export async function resolverUsuario(identificador: string, companyId: string) {
  const porUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identificador);
  const [usuario] = await db
    .select({ id: users.id, email: users.email, companyId: users.companyId })
    .from(users)
    .where(porUuid ? eq(users.id, identificador) : eq(users.email, identificador))
    .limit(1);

  if (!usuario) throw new Error(`No existe ningun usuario con "${identificador}".`);
  if (usuario.companyId !== companyId) {
    throw new Error(
      `El usuario ${usuario.email} no pertenece a la empresa ${companyId}. ` +
        'Ejecuta el script por empresa con un usuario de cada una.'
    );
  }
  return usuario;
}
