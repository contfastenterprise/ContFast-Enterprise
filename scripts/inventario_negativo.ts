/**
 * inventario_negativo.ts — corrige los niveles de inventario en negativo.
 *
 * CONTEXTO (auditoria F1-04)
 * --------------------------
 * `checkStock` no comparaba la cantidad pedida contra la existencia, asi que
 * autorizaba cualquier salida. El resultado son filas de `inventory_levels`
 * con cantidad negativa: mercancia que el sistema dice que salio pero que
 * nunca existio en el almacen.
 *
 * Este script las lleva a cero dejando rastro: por cada nivel negativo emite
 * un movimiento `adjustment` con la diferencia, igual que lo hace la pantalla
 * de ajuste manual (`/api/v1/inventory/adjustments`). El kardex queda cuadrado
 * y la correccion es auditable.
 *
 * ADVERTENCIA CONTABLE
 * --------------------
 * Ningun ajuste de inventario de la aplicacion genera asiento contable hoy
 * (la ruta de ajustes no toca `journal_entries`). Este script tampoco lo hace:
 * imprime el asiento que HARIA FALTA para que el mayor cuadre con el kardex, y
 * lo deja a criterio del contador. La cuenta a la que se imputa el faltante es
 * una decision del negocio, no del script.
 *
 * USO
 * ---
 *   npx tsx scripts/inventario_negativo.ts                      # solo reporta
 *   npx tsx scripts/inventario_negativo.ts --empresa=<uuid>     # filtra empresa
 *   npx tsx scripts/inventario_negativo.ts --modo=PRODUCCION    # filtra modo
 *   npx tsx scripts/inventario_negativo.ts --csv=faltantes.csv  # exporta detalle
 *   npx tsx scripts/inventario_negativo.ts --aplicar --usuario=admin@empresa.do
 *
 * Sin `--aplicar` no escribe absolutamente nada. `--usuario` es obligatorio al
 * aplicar porque `inventory_movements.user_id` es NOT NULL: el movimiento tiene
 * que quedar a nombre de alguien.
 *
 * Es idempotente: al terminar no queda ningun nivel negativo, y una segunda
 * ejecucion no encuentra nada que corregir.
 */
// Tiene que ir ANTES que cualquier import que toque la base: src/db aborta al
// cargarse si falta DATABASE_URL, y tsx no lee .env por su cuenta.
import './_cargarEnv';
import { db, inventoryLevels, inventoryMovements, products, warehouses, companies, users } from '../src/db';
import { and, eq, lt, sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

type Modo = 'PRODUCCION' | 'PRUEBA';

interface Fila {
  levelId: string;
  companyId: string;
  companyName: string;
  modo: Modo;
  productId: string;
  productName: string;
  sku: string | null;
  cost: number;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  /** Valor del faltante = |cantidad| * costo unitario. */
  valor: number;
}

// ---------------------------------------------------------------- argumentos

function leerArgumentos() {
  const args = process.argv.slice(2);
  const valor = (nombre: string): string | undefined => {
    const encontrado = args.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.slice(nombre.length + 3) : undefined;
  };

  const modo = valor('modo');
  if (modo && modo !== 'PRODUCCION' && modo !== 'PRUEBA') {
    throw new Error(`--modo debe ser PRODUCCION o PRUEBA, no "${modo}".`);
  }

  const opciones = {
    empresa: valor('empresa'),
    modo: modo as Modo | undefined,
    csv: valor('csv'),
    usuario: valor('usuario'),
    aplicar: args.includes('--aplicar'),
  };

  const desconocidos = args.filter(
    (a) => a !== '--aplicar' && !/^--(empresa|modo|csv|usuario)=/.test(a)
  );
  if (desconocidos.length > 0) {
    throw new Error(`Argumentos no reconocidos: ${desconocidos.join(', ')}`);
  }

  if (opciones.aplicar && !opciones.usuario) {
    throw new Error(
      'Al aplicar hay que indicar --usuario=<correo o uuid>: el movimiento de ajuste ' +
        'se registra a nombre de ese usuario (inventory_movements.user_id es obligatorio).'
    );
  }

  return opciones;
}

// ------------------------------------------------------------------ consulta

async function buscarNegativos(empresa?: string, modo?: Modo): Promise<Fila[]> {
  const filtros = [lt(inventoryLevels.quantity, '0')];
  if (empresa) filtros.push(eq(inventoryLevels.companyId, empresa));
  if (modo) filtros.push(eq(inventoryLevels.modo, modo));

  const filas = await db
    .select({
      levelId: inventoryLevels.id,
      companyId: inventoryLevels.companyId,
      companyName: companies.name,
      modo: inventoryLevels.modo,
      productId: inventoryLevels.productId,
      productName: products.name,
      sku: products.sku,
      cost: products.cost,
      warehouseId: inventoryLevels.warehouseId,
      warehouseName: warehouses.name,
      quantity: inventoryLevels.quantity,
    })
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.productId))
    .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouseId))
    .innerJoin(companies, eq(companies.id, inventoryLevels.companyId))
    .where(and(...filtros))
    .orderBy(companies.name, inventoryLevels.modo, warehouses.name, products.name);

  return filas.map((f) => {
    const quantity = Number(f.quantity);
    const cost = Number(f.cost || 0);
    return {
      ...f,
      modo: f.modo as Modo,
      quantity,
      cost,
      valor: Math.abs(quantity) * cost,
    };
  });
}

/** Cuenta los niveles en cero. No requieren correccion; se informan aparte. */
async function contarCeros(empresa?: string, modo?: Modo): Promise<number> {
  const filtros = [eq(inventoryLevels.quantity, '0')];
  if (empresa) filtros.push(eq(inventoryLevels.companyId, empresa));
  if (modo) filtros.push(eq(inventoryLevels.modo, modo));

  const [fila] = await db
    .select({ total: sql<string>`count(*)` })
    .from(inventoryLevels)
    .where(and(...filtros));
  return Number(fila?.total || 0);
}

// ------------------------------------------------------------------- reporte

const dinero = (n: number) =>
  n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidad = (n: number) =>
  n.toLocaleString('es-DO', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function imprimirReporte(filas: Fila[], ceros: number) {
  console.log('');
  console.log('NIVELES DE INVENTARIO EN NEGATIVO');
  console.log('='.repeat(100));

  let empresaActual = '';
  let almacenActual = '';
  for (const f of filas) {
    const clave = `${f.companyName} [${f.modo}]`;
    if (clave !== empresaActual) {
      empresaActual = clave;
      almacenActual = '';
      console.log('');
      console.log(clave);
    }
    if (f.warehouseName !== almacenActual) {
      almacenActual = f.warehouseName;
      console.log(`  Almacen: ${almacenActual}`);
    }
    const nombre = `${f.sku ? `[${f.sku}] ` : ''}${f.productName}`;
    console.log(
      `    ${nombre.padEnd(52).slice(0, 52)} ` +
        `${cantidad(f.quantity).padStart(14)}  ` +
        `x costo ${dinero(f.cost).padStart(12)}  ` +
        `= ${dinero(f.valor).padStart(14)}`
    );
  }

  const total = filas.reduce((acc, f) => acc + f.valor, 0);
  const unidades = filas.reduce((acc, f) => acc + Math.abs(f.quantity), 0);

  console.log('');
  console.log('-'.repeat(100));
  console.log(`Niveles en negativo : ${filas.length}`);
  console.log(`Unidades faltantes  : ${cantidad(unidades)}`);
  console.log(`Valor del faltante  : RD$ ${dinero(total)}`);
  console.log(`Niveles en cero     : ${ceros}  (normales, no se tocan)`);

  const sinCosto = filas.filter((f) => f.cost <= 0);
  if (sinCosto.length > 0) {
    console.log('');
    console.log(
      `AVISO: ${sinCosto.length} de estos productos tienen costo 0, asi que su faltante ` +
        'no aporta valor al total. Revisa el costo antes de dar el monto por bueno.'
    );
  }

  return total;
}

function imprimirAsiento(total: number) {
  console.log('');
  console.log('ASIENTO CONTABLE QUE HARIA FALTA (no se registra)');
  console.log('='.repeat(100));
  console.log(
    'Ningun ajuste de inventario de la aplicacion genera asiento contable hoy, asi que\n' +
      'este script tampoco lo hace. Para que el mayor cuadre con el kardex hay que\n' +
      'registrar, con la cuenta de faltantes que decida el contador:'
  );
  console.log('');
  console.log(`  DEBE   Faltantes / Merma de inventario     RD$ ${dinero(total)}`);
  console.log(`  HABER  Inventario de mercancias            RD$ ${dinero(total)}`);
  console.log('');
  console.log(
    'La cuenta de faltantes es una decision del negocio (gasto operativo, costo de\n' +
      'ventas o cuenta por cobrar a un responsable, segun el caso). Deficit no\n' +
      'documentado tratado como gasto puede no ser deducible ante la DGII: consultalo\n' +
      'con el contador antes de registrarlo.'
  );
}

function exportarCsv(filas: Fila[], ruta: string) {
  const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [
    ['empresa', 'modo', 'almacen', 'sku', 'producto', 'cantidad', 'costo_unitario', 'valor_faltante', 'level_id']
      .map(escapar)
      .join(','),
    ...filas.map((f) =>
      [f.companyName, f.modo, f.warehouseName, f.sku || '', f.productName,
       f.quantity.toFixed(4), f.cost.toFixed(2), f.valor.toFixed(2), f.levelId]
        .map(escapar)
        .join(',')
    ),
  ];
  writeFileSync(ruta, lineas.join('\n') + '\n', 'utf8');
  console.log('');
  console.log(`Detalle exportado a ${ruta}`);
}

// ------------------------------------------------------------------ correccion

/**
 * Resuelve el usuario que firmara los ajustes. Acepta correo o uuid, y exige
 * que pertenezca a la empresa cuyos niveles se van a corregir: un movimiento
 * firmado por un usuario de otra empresa seria un registro invalido.
 */
async function resolverUsuario(identificador: string, companyId: string) {
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
        'Ejecuta el script por empresa (--empresa=<uuid>) con un usuario de cada una.'
    );
  }
  return usuario;
}

async function corregir(filas: Fila[], identificadorUsuario: string) {
  // Un usuario por empresa: el movimiento tiene que quedar firmado por alguien
  // de la misma empresa del nivel.
  const empresas = [...new Set(filas.map((f) => f.companyId))];
  const usuarioPorEmpresa = new Map<string, string>();
  for (const companyId of empresas) {
    const usuario = await resolverUsuario(identificadorUsuario, companyId);
    usuarioPorEmpresa.set(companyId, usuario.id);
  }

  let corregidos = 0;
  let omitidos = 0;

  for (const f of filas) {
    await db.transaction(async (tx) => {
      // Relee con bloqueo: entre el reporte y la correccion el nivel pudo
      // cambiar (una compra, otro ajuste). Si ya no esta en negativo, se deja.
      const [actual] = await tx
        .select({ quantity: inventoryLevels.quantity })
        .from(inventoryLevels)
        .where(eq(inventoryLevels.id, f.levelId))
        .for('update');

      if (!actual) {
        omitidos++;
        return;
      }
      const cantidadActual = Number(actual.quantity);
      if (cantidadActual >= 0) {
        omitidos++;
        console.log(`  omitido: ${f.productName} @ ${f.warehouseName} ya esta en ${cantidad(cantidadActual)}`);
        return;
      }

      const diferencia = -cantidadActual; // positiva: el ajuste sube el nivel a cero

      await tx
        .update(inventoryLevels)
        .set({ quantity: '0.0000', updatedAt: new Date() })
        .where(eq(inventoryLevels.id, f.levelId));

      await tx.insert(inventoryMovements).values({
        companyId: f.companyId,
        modo: f.modo,
        productId: f.productId,
        warehouseId: f.warehouseId,
        userId: usuarioPorEmpresa.get(f.companyId)!,
        type: 'adjustment',
        quantity: diferencia.toFixed(4),
        balanceAfter: '0.0000',
        description:
          `Ajuste F1-04: correccion de existencia negativa (${cantidadActual.toFixed(4)} -> 0). ` +
          `Salidas registradas sin existencia por la validacion de stock defectuosa. ` +
          `Valor estimado del faltante: RD$ ${(Math.abs(cantidadActual) * f.cost).toFixed(2)}.`,
      });

      corregidos++;
    });
  }

  console.log('');
  console.log(`Niveles corregidos: ${corregidos}`);
  if (omitidos > 0) console.log(`Niveles omitidos  : ${omitidos} (ya no estaban en negativo)`);
}

/**
 * La migracion 0031 anade el CHECK (quantity >= 0) como NOT VALID justamente
 * porque habia filas en negativo. Cuando no queda ninguna en TODA la tabla, el
 * CHECK se puede validar y a partir de ahi la base impide que vuelva a pasar.
 */
async function sugerirValidacionDelCheck() {
  const [fila] = await db
    .select({ total: sql<string>`count(*)` })
    .from(inventoryLevels)
    .where(lt(inventoryLevels.quantity, '0'));
  const restantes = Number(fila?.total || 0);

  console.log('');
  if (restantes > 0) {
    console.log(
      restantes === 1
        ? 'Queda 1 nivel en negativo fuera del alcance de esta ejecucion (otra empresa o ' +
          'el otro modo). Corrigelo antes del ultimo paso.'
        : `Quedan ${restantes} niveles en negativo fuera del alcance de esta ejecucion ` +
          '(otras empresas o el otro modo). Corrigelos antes del ultimo paso.'
    );
    return;
  }

  console.log('No queda ningun nivel en negativo en toda la tabla. Ultimo paso, en la base:');
  console.log('');
  console.log('  ALTER TABLE inventory_levels VALIDATE CONSTRAINT chk_inventory_no_negativo;');
  console.log('');
  console.log(
    'Eso convierte el CHECK de la migracion 0031 (creado NOT VALID porque habia\n' +
      'negativos) en una garantia real: a partir de ahi la propia base rechaza\n' +
      'cualquier existencia negativa, venga de donde venga.'
  );
}

// ---------------------------------------------------------------------- main

async function main() {
  const opciones = leerArgumentos();

  const [filas, ceros] = await Promise.all([
    buscarNegativos(opciones.empresa, opciones.modo),
    contarCeros(opciones.empresa, opciones.modo),
  ]);

  if (filas.length === 0) {
    console.log('');
    console.log('No hay ningun nivel de inventario en negativo.');
    console.log(`Niveles en cero: ${ceros} (normales, no se tocan).`);
    return;
  }

  const total = imprimirReporte(filas, ceros);
  if (opciones.csv) exportarCsv(filas, opciones.csv);
  imprimirAsiento(total);

  if (!opciones.aplicar) {
    console.log('');
    console.log('='.repeat(100));
    console.log('SIMULACION: no se escribio nada.');
    console.log('Para aplicar la correccion:');
    console.log('  npx tsx scripts/inventario_negativo.ts --aplicar --usuario=<correo>');
    return;
  }

  console.log('');
  console.log('='.repeat(100));
  console.log('APLICANDO CORRECCION...');
  await corregir(filas, opciones.usuario!);
  await sugerirValidacionDelCheck();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('');
    console.error('ERROR:', err.message);
    process.exit(1);
  });
