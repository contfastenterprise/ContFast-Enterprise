/**
 * inventario_negativo.ts — diagnostica los niveles en negativo y carga el
 * conteo fisico que los corrige.
 *
 * CONTEXTO (auditoria F1-04)
 * --------------------------
 * `checkStock` no comparaba la cantidad pedida contra la existencia, asi que
 * autorizaba cualquier salida. El resultado son filas de `inventory_levels` con
 * cantidad negativa: mercancia que el sistema dice que salio y que nunca entro.
 *
 * El diagnostico (`scratch/diagnostico_negativos.sql`) mostro que los productos
 * afectados tienen ventas y CERO compras registradas. No falta una salida: falta
 * la entrada. Por eso este script NO lleva los niveles a cero — cero es tan
 * falso como el negativo. El unico dato correcto es el conteo fisico, y eso es
 * lo que carga.
 *
 * SIN ASIENTO CONTABLE, A PROPOSITO
 * ---------------------------------
 * Las compras de estos productos se imputan directamente a costo de ventas. El
 * costo ya paso por resultados, asi que registrar aqui una merma lo contaria dos
 * veces. El ajuste mueve el kardex y nada mas. Lo que si corrige el resultado es
 * el inventario final del cierre, y eso lo hace el contador.
 *
 * USO
 * ---
 *   # 1. Diagnostico. No escribe nada.
 *   npx tsx scripts/inventario_negativo.ts
 *   npx tsx scripts/inventario_negativo.ts --empresa="Latin Doors" --csv=faltantes.csv
 *
 *   # 2. Simulacion de la carga del conteo. Tampoco escribe nada.
 *   npx tsx scripts/inventario_negativo.ts --conteo=conteo.csv \
 *       --empresa="Latin Doors" --modo=PRODUCCION --almacen=Principal
 *
 *   # 3. Carga real.
 *   npx tsx scripts/inventario_negativo.ts --conteo=conteo.csv \
 *       --empresa="Latin Doors" --modo=PRODUCCION --almacen=Principal \
 *       --aplicar --usuario=admin@empresa.do
 *
 * El CSV necesita dos columnas: `sku` y `cantidad_contada`. Acepta separador
 * `,` `;` o tabulador y varios nombres de cabecera; ver `_conteoCsv.ts`.
 *
 * Sin `--aplicar` no escribe absolutamente nada. `--usuario` es obligatorio al
 * aplicar porque `inventory_movements.user_id` es NOT NULL. Es idempotente: una
 * segunda ejecucion con el mismo conteo no encuentra ninguna diferencia.
 */
// Tiene que ir ANTES que cualquier import que toque la base: src/db aborta al
// cargarse si falta DATABASE_URL, y tsx no lee .env por su cuenta.
import './_cargarEnv';
import { db, inventoryLevels, inventoryMovements, products } from '../src/db';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { leerConteo } from './_conteoCsv';
import { CERO, type Modo, type Nivel, type Ajuste, type Plan } from './_inventarioTipos';
import {
  resolverEmpresa, resolverAlmacen, resolverUsuario,
  buscarNegativos, nivelesDelAlmacen, contarCeros,
} from './_inventarioDatos';
import {
  cantidad, etiqueta, imprimirNegativos, imprimirNotaContable, imprimirPlan, exportarCsv,
} from './_inventarioInforme';

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

  const ausentes = valor('ausentes') || 'ignorar';
  if (ausentes !== 'ignorar' && ausentes !== 'cero') {
    throw new Error(`--ausentes debe ser "ignorar" o "cero", no "${ausentes}".`);
  }

  const o = {
    empresa: valor('empresa'),
    modo: modo as Modo | undefined,
    almacen: valor('almacen'),
    conteo: valor('conteo'),
    referencia: valor('referencia'),
    ausentes: ausentes as 'ignorar' | 'cero',
    csv: valor('csv'),
    usuario: valor('usuario'),
    aplicar: args.includes('--aplicar'),
  };

  const desconocidos = args.filter(
    (a) => a !== '--aplicar' &&
      !/^--(empresa|modo|almacen|conteo|referencia|ausentes|csv|usuario)=/.test(a)
  );
  if (desconocidos.length > 0) {
    throw new Error(`Argumentos no reconocidos: ${desconocidos.join(', ')}`);
  }

  if (o.aplicar && !o.conteo) {
    throw new Error(
      'No hay nada que aplicar sin --conteo=<fichero.csv>.\n' +
        'Este script ya no lleva los niveles a cero: el diagnostico mostro que a estos ' +
        'productos les falta la entrada, no les sobra la salida, asi que cero seria tan ' +
        'falso como el negativo. La correccion es cargar el conteo fisico del almacen.'
    );
  }
  if (o.aplicar && !o.usuario) {
    throw new Error(
      'Al aplicar hay que indicar --usuario=<correo o uuid>: el movimiento de ajuste ' +
        'se registra a nombre de ese usuario (inventory_movements.user_id es obligatorio).'
    );
  }
  if (o.conteo && (!o.empresa || !o.modo || !o.almacen)) {
    throw new Error(
      'Cargar un conteo exige --empresa, --modo y --almacen: el fichero describe la ' +
        'existencia de UN almacen en UN entorno, y aplicarlo al que no es reescribiria ' +
        'las existencias equivocadas.'
    );
  }

  return o;
}

// ---------------------------------------------------- modo 2: carga de conteo

async function construirPlan(
  ruta: string, companyId: string, modo: Modo, warehouseId: string, warehouseName: string
): Promise<Plan> {
  const lineas = leerConteo(ruta);

  // Un mismo SKU puede venir en varias filas (varias estanterias). Se suman,
  // pero se avisa: tambien puede ser una captura duplicada.
  const porSku = new Map<string, { sku: string; cantidad: number; lineas: number[] }>();
  for (const l of lineas) {
    const clave = l.sku.trim().toLowerCase();
    const previo = porSku.get(clave);
    if (previo) { previo.cantidad += l.cantidad; previo.lineas.push(l.linea); }
    else porSku.set(clave, { sku: l.sku.trim(), cantidad: l.cantidad, lineas: [l.linea] });
  }

  const repetidos = [...porSku.values()]
    .filter((v) => v.lineas.length > 1)
    .map((v) => ({ sku: v.sku, lineas: v.lineas, total: v.cantidad }));

  // Catalogo de la empresa. `products.sku` es NULLABLE y su indice NO es unico,
  // asi que dos productos pueden compartir SKU: hay que detectarlo, no elegir.
  const catalogo = await db
    .select({
      id: products.id, name: products.name, sku: products.sku, cost: products.cost,
      activo: sql<boolean>`(${products.deletedAt} is null and ${products.status} = 'active')`,
    })
    .from(products)
    .where(and(eq(products.companyId, companyId), isNull(products.deletedAt)));

  const porClave = new Map<string, typeof catalogo>();
  for (const p of catalogo) {
    if (!p.sku) continue;
    const clave = p.sku.trim().toLowerCase();
    porClave.set(clave, [...(porClave.get(clave) || []), p]);
  }

  const ambiguos = [...porSku.entries()]
    .filter(([clave]) => (porClave.get(clave)?.length || 0) > 1)
    .map(([, v]) => v.sku);
  if (ambiguos.length > 0) {
    throw new Error(
      `Estos SKU del conteo corresponden a mas de un producto de la empresa: ` +
        `${ambiguos.join(', ')}. La tabla products no impone SKU unico. Depura el ` +
        'catalogo antes de cargar el conteo: no puedo elegir por ti a que producto ' +
        'pertenece la existencia contada.'
    );
  }

  const niveles = await nivelesDelAlmacen(companyId, modo, warehouseId);
  const nivelPorProducto = new Map(niveles.map((n) => [n.productId, n]));

  const plan: Plan = {
    ajustes: [], iguales: [], nuevos: [], desconocidos: [], noContados: [], repetidos,
  };
  const contados = new Set<string>();

  for (const [clave, v] of porSku) {
    const producto = porClave.get(clave)?.[0];
    if (!producto) {
      plan.desconocidos.push({ sku: v.sku, cantidad: v.cantidad, lineas: v.lineas });
      continue;
    }
    contados.add(producto.id);

    const nivel = nivelPorProducto.get(producto.id);
    const base: Nivel = nivel || {
      levelId: null,
      companyId, modo,
      productId: producto.id,
      productName: producto.name,
      sku: producto.sku,
      activo: producto.activo,
      cost: Number(producto.cost || 0),
      warehouseId, warehouseName,
      quantity: 0,
    };

    const diferencia = v.cantidad - base.quantity;
    const ajuste: Ajuste = {
      ...base,
      contado: v.cantidad,
      diferencia,
      valor: Math.abs(diferencia) * base.cost,
    };

    if (!nivel) plan.nuevos.push(ajuste);
    else if (Math.abs(diferencia) < CERO) plan.iguales.push(ajuste);
    else plan.ajustes.push(ajuste);
  }

  plan.noContados = niveles.filter((n) => !contados.has(n.productId));
  return plan;
}

// ----------------------------------------------------------------- escritura

async function aplicar(ajustes: Ajuste[], identificadorUsuario: string, referencia: string) {
  const empresas = [...new Set(ajustes.map((a) => a.companyId))];
  const usuarioPorEmpresa = new Map<string, string>();
  for (const companyId of empresas) {
    usuarioPorEmpresa.set(companyId, (await resolverUsuario(identificadorUsuario, companyId)).id);
  }

  let escritos = 0;
  let omitidos = 0;

  for (const a of ajustes) {
    await db.transaction(async (tx) => {
      // Relee con bloqueo. Entre la simulacion y la carga el nivel pudo moverse
      // (una venta, un despacho), asi que la diferencia se recalcula contra lo
      // que hay AHORA, no contra lo que habia al construir el plan. El destino
      // es siempre la cantidad contada.
      //
      // Si el nivel ya existia se localiza por su clave primaria. No es un
      // capricho: la busqueda compuesta necesita empresa Y modo Y producto Y
      // almacen, y olvidar el modo la deja apuntando a dos filas -- la de
      // PRODUCCION y la de PRUEBA -- de las que Postgres devuelve la que le
      // parece. Por el id no hay filtro que olvidar.
      const [actual] = a.levelId
        ? await tx
            .select({ id: inventoryLevels.id, quantity: inventoryLevels.quantity })
            .from(inventoryLevels)
            .where(eq(inventoryLevels.id, a.levelId))
            .for('update')
        : await tx
            // Sin id todavia: el producto se conto y no tenia nivel. Aqui la
            // busqueda compuesta es obligatoria, y el modo con ella, porque el
            // mismo producto puede tener nivel en el OTRO entorno y este
            // insert no debe convertirse en una actualizacion de aquel.
            .select({ id: inventoryLevels.id, quantity: inventoryLevels.quantity })
            .from(inventoryLevels)
            .where(
              and(
                eq(inventoryLevels.companyId, a.companyId),
                eq(inventoryLevels.modo, a.modo),
                eq(inventoryLevels.productId, a.productId),
                eq(inventoryLevels.warehouseId, a.warehouseId)
              )
            )
            .for('update');

      const desde = actual ? Number(actual.quantity) : 0;
      const diferencia = a.contado - desde;

      if (actual && Math.abs(diferencia) < CERO) {
        omitidos++;
        console.log(`  omitido: ${etiqueta(a)} ya esta en ${cantidad(desde)}`);
        return;
      }

      if (actual) {
        await tx
          .update(inventoryLevels)
          .set({ quantity: a.contado.toFixed(4), updatedAt: new Date() })
          .where(eq(inventoryLevels.id, actual.id));
      } else {
        await tx.insert(inventoryLevels).values({
          companyId: a.companyId,
          modo: a.modo,
          productId: a.productId,
          warehouseId: a.warehouseId,
          quantity: a.contado.toFixed(4),
        });
      }

      await tx.insert(inventoryMovements).values({
        companyId: a.companyId,
        modo: a.modo,
        productId: a.productId,
        warehouseId: a.warehouseId,
        userId: usuarioPorEmpresa.get(a.companyId)!,
        type: 'adjustment',
        quantity: diferencia.toFixed(4),
        balanceAfter: a.contado.toFixed(4),
        description:
          `Conteo fisico ${referencia}: existencia ajustada de ${desde.toFixed(4)} a ` +
          `${a.contado.toFixed(4)} en ${a.warehouseName}. ` +
          (actual ? '' : 'El producto no tenia nivel en este almacen. ') +
          'Sin asiento contable: las compras van directas a costo de ventas.',
      });

      escritos++;
    });
  }

  console.log('');
  console.log(`Niveles escritos : ${escritos}`);
  if (omitidos > 0) console.log(`Niveles omitidos : ${omitidos} (ya coincidian con el conteo)`);
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
      `Quedan ${restantes} nivel(es) en negativo fuera del alcance de esta ejecucion ` +
        '(otro almacen, otra empresa o el otro modo). Corrigelos antes del ultimo paso.'
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
  const o = leerArgumentos();

  const empresa = o.empresa ? await resolverEmpresa(o.empresa) : undefined;

  // ---------------------------------------------------------- diagnostico
  if (!o.conteo) {
    const [filas, ceros] = await Promise.all([
      buscarNegativos(empresa?.id, o.modo),
      contarCeros(empresa?.id, o.modo),
    ]);

    if (filas.length === 0) {
      console.log('');
      console.log('No hay ningun nivel de inventario en negativo.');
      console.log(`Niveles en cero: ${ceros} (normales, no se tocan).`);
      return;
    }

    imprimirNegativos(filas, ceros);
    if (o.csv) exportarCsv(filas, o.csv);
    imprimirNotaContable();

    console.log('');
    console.log('='.repeat(100));
    console.log('SIMULACION: no se escribio nada. Esto es solo el diagnostico.');
    console.log('Para corregir hace falta el conteo fisico del almacen:');
    console.log('  npx tsx scripts/inventario_negativo.ts --conteo=conteo.csv \\');
    console.log('      --empresa=<uuid> --modo=PRODUCCION --almacen=Principal');
    return;
  }

  // -------------------------------------------------------- carga de conteo
  const almacen = await resolverAlmacen(o.almacen!, empresa!.id);
  const referencia = o.referencia || new Date().toISOString().slice(0, 10);

  console.log('');
  console.log(`Empresa   : ${empresa!.name}`);
  console.log(`Entorno   : ${o.modo}`);
  console.log(`Almacen   : ${almacen.name} (${almacen.code})`);
  console.log(`Conteo    : ${o.conteo}   referencia "${referencia}"`);

  const plan = await construirPlan(o.conteo, empresa!.id, o.modo!, almacen.id, almacen.name);

  if (o.ausentes === 'cero') {
    for (const n of plan.noContados) {
      if (Math.abs(n.quantity) < CERO) continue; // ya esta en cero
      plan.ajustes.push({ ...n, contado: 0, diferencia: -n.quantity, valor: Math.abs(n.quantity) * n.cost });
    }
  }

  const escribibles = imprimirPlan(plan, o);
  if (o.csv) exportarCsv([...escribibles, ...plan.iguales], o.csv);
  imprimirNotaContable();

  if (!o.aplicar) {
    console.log('');
    console.log('='.repeat(100));
    console.log('SIMULACION: no se escribio nada.');
    console.log('Revisa los avisos de arriba. Para aplicar, la misma orden con:');
    console.log('  --aplicar --usuario=<correo>');
    return;
  }

  if (escribibles.length === 0) {
    console.log('');
    console.log('No hay ninguna diferencia que cargar.');
    return;
  }

  console.log('');
  console.log('='.repeat(100));
  console.log('CARGANDO CONTEO...');
  await aplicar(escribibles, o.usuario!, referencia);
  await sugerirValidacionDelCheck();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('');
    console.error('ERROR:', err.message);
    process.exit(1);
  });
