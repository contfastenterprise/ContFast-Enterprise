/**
 * Presentacion: todo lo que este proceso imprime por pantalla o vuelca a CSV.
 *
 * Separado del resto para que las consultas y la escritura no compartan fichero
 * con el formateo de columnas. Ninguna funcion de aqui toca la base.
 */
import { writeFileSync } from 'fs';
import type { Ajuste, Nivel, Plan } from './_inventarioTipos';

// ------------------------------------------------------------------- formato

export const dinero = (n: number) =>
  n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const cantidad = (n: number) =>
  n.toLocaleString('es-DO', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
export const etiqueta = (f: { sku: string | null; productName: string }) =>
  `${f.sku ? `[${f.sku}] ` : ''}${f.productName}`;
export const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

// ------------------------------------------------------ modo 1: diagnostico

export function imprimirNegativos(filas: Nivel[], ceros: number) {
  console.log('');
  console.log('NIVELES DE INVENTARIO EN NEGATIVO');
  console.log('='.repeat(100));

  let empresaActual = '';
  let almacenActual = '';
  for (const f of filas) {
    const clave = `${(f as Nivel & { companyName: string }).companyName} [${f.modo}]`;
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
    console.log(
      `    ${etiqueta(f).padEnd(52).slice(0, 52)} ` +
        `${cantidad(f.quantity).padStart(14)}  ` +
        `x costo ${dinero(f.cost).padStart(12)}  ` +
        `= ${dinero(Math.abs(f.quantity) * f.cost).padStart(14)}`
    );
  }

  const total = filas.reduce((acc, f) => acc + Math.abs(f.quantity) * f.cost, 0);
  const unidades = filas.reduce((acc, f) => acc + Math.abs(f.quantity), 0);

  console.log('');
  console.log('-'.repeat(100));
  console.log(`Niveles en negativo : ${filas.length}`);
  console.log(`Unidades faltantes  : ${cantidad(unidades)}`);
  console.log(`Valor al costo      : RD$ ${dinero(total)}  (referencia, no genera asiento)`);
  console.log(`Niveles en cero     : ${ceros}  (normales, no se tocan)`);

  const sinCosto = filas.filter((f) => f.cost <= 0);
  if (sinCosto.length > 0) {
    console.log('');
    console.log(
      `AVISO: ${sinCosto.length} de estos productos tienen costo 0, asi que no aportan ` +
        'valor al total. Revisa el costo antes de dar el monto por bueno.'
    );
  }
}

export function imprimirNotaContable() {
  console.log('');
  console.log('POR QUE NO HAY ASIENTO');
  console.log('='.repeat(100));
  console.log(
    'Las compras de estos productos se imputan directamente a costo de ventas, asi que\n' +
      'su costo ya paso por resultados. Registrar aqui una merma contra "faltantes" lo\n' +
      'contaria dos veces. El ajuste corrige el kardex y nada mas.\n' +
      '\n' +
      'Lo que si depende de esto es el cierre: con las compras llevadas a gasto, el\n' +
      'inventario final contado es lo que corrige el costo de ventas del periodo. Un\n' +
      'almacen mal cuadrado mueve la base del ISR. Que lo revise el contador.'
  );
}

export function imprimirPlan(plan: Plan, opciones: { ausentes: 'ignorar' | 'cero' }): Ajuste[] {
  const escribibles = [...plan.ajustes, ...plan.nuevos];

  console.log('');
  console.log('CARGA DE CONTEO FISICO');
  console.log('='.repeat(100));
  console.log(
    `${'Producto'.padEnd(52)} ${'sistema'.padStart(14)} ${'contado'.padStart(14)} ${'ajuste'.padStart(14)}`
  );
  console.log('-'.repeat(100));

  for (const a of escribibles.sort((x, y) => y.valor - x.valor)) {
    console.log(
      `${etiqueta(a).padEnd(52).slice(0, 52)} ` +
        `${cantidad(a.quantity).padStart(14)} ` +
        `${cantidad(a.contado).padStart(14)} ` +
        `${(a.diferencia > 0 ? '+' : '') + cantidad(a.diferencia)}`.padStart(15) +
        (a.levelId === null ? '  (nivel nuevo)' : '') +
        (a.activo ? '' : '  (producto inactivo)')
    );
  }

  const suben = escribibles.filter((a) => a.diferencia > 0);
  const bajan = escribibles.filter((a) => a.diferencia < 0);

  console.log('');
  console.log('-'.repeat(100));
  console.log(`Niveles a ajustar   : ${escribibles.length}  (${suben.length} suben, ${bajan.length} bajan)`);
  console.log(`  de ellos nuevos   : ${plan.nuevos.length}  (producto contado sin fila de nivel)`);
  console.log(`Ya cuadrados        : ${plan.iguales.length}  (el conteo coincide, no se tocan)`);
  console.log(
    `Valor del ajuste    : RD$ ${dinero(escribibles.reduce((s, a) => s + a.valor, 0))}` +
      '  (referencia, no genera asiento)'
  );

  // --------------------------------------------- descuadres entre CSV y base
  if (plan.repetidos.length > 0) {
    console.log('');
    console.log(
      `AVISO: ${plan.repetidos.length} SKU ${plural(plan.repetidos.length, 'aparece', 'aparecen')} ` +
        'en mas de una linea del CSV. Se SUMAN:'
    );
    for (const r of plan.repetidos.slice(0, 20)) {
      console.log(`  ${r.sku}: lineas ${r.lineas.join(', ')} -> ${cantidad(r.total)}`);
    }
    if (plan.repetidos.length > 20) console.log(`  ... y ${plan.repetidos.length - 20} mas`);
    console.log('  Si alguno es una captura duplicada, corrigelo antes de aplicar.');
  }

  if (plan.desconocidos.length > 0) {
    console.log('');
    console.log(
      `AVISO: ${plan.desconocidos.length} SKU del CSV no ` +
        `${plural(plan.desconocidos.length, 'existe', 'existen')} en el catalogo de la ` +
        `empresa. NO se ${plural(plan.desconocidos.length, 'carga', 'cargan')}:`
    );
    for (const d of plan.desconocidos.slice(0, 20)) {
      console.log(`  ${d.sku} (linea ${d.lineas.join(', ')}): ${cantidad(d.cantidad)} unidades contadas`);
    }
    if (plan.desconocidos.length > 20) console.log(`  ... y ${plan.desconocidos.length - 20} mas`);
    console.log('  O el SKU esta mal escrito, o el producto no esta dado de alta.');
  }

  if (plan.sinInventario.length > 0) {
    console.log('');
    console.log(
      `AVISO: ${plan.sinInventario.length} producto(s) del CSV no llevan control de ` +
        'existencia (servicio o venta por encargo). NO se cargan:'
    );
    for (const s of plan.sinInventario) {
      console.log(`  [${s.sku}] ${s.nombre} -- contado ${cantidad(s.cantidad)}`);
    }
    console.log(
      '  Su nivel de inventario no deberia existir. Para retirarlo, ver el final de\n' +
        '  drizzle/0033_producto_sin_inventario.sql.'
    );
  }

  if (plan.noContados.length > 0) {
    const negativos = plan.noContados.filter((n) => n.quantity < 0);
    console.log('');
    console.log(
      `AVISO: ${plan.noContados.length} ${plural(plan.noContados.length, 'producto tiene', 'productos tienen')} ` +
        `nivel en este almacen y NO ${plural(plan.noContados.length, 'aparece', 'aparecen')} en el CSV:`
    );
    for (const n of plan.noContados.slice(0, 20)) {
      console.log(
        `  ${etiqueta(n).padEnd(52).slice(0, 52)} sistema: ${cantidad(n.quantity).padStart(14)}` +
          (n.quantity < 0 ? '   <-- SIGUE EN NEGATIVO' : '')
      );
    }
    if (plan.noContados.length > 20) console.log(`  ... y ${plan.noContados.length - 20} mas`);

    if (opciones.ausentes === 'cero') {
      console.log('');
      console.log('  --ausentes=cero: se cargaran como 0. Ya estan incluidos en el plan de arriba.');
    } else {
      console.log('');
      console.log(
        '  Por defecto NO se tocan: una linea que falta suele ser un olvido de captura,\n' +
          '  no una existencia real de cero. Si el conteo cubre el almacen entero y esto\n' +
          '  son de verdad ceros, repite con --ausentes=cero.'
      );
      if (negativos.length > 0) {
        console.log(
          negativos.length === 1
            ? '  OJO: 1 de ellos sigue en negativo y este conteo no lo corrige.'
            : `  OJO: ${negativos.length} de ellos siguen en negativo y este conteo no los corrige.`
        );
      }
    }
  }

  return escribibles;
}

export function exportarCsv(filas: (Nivel & Partial<Ajuste>)[], ruta: string) {
  const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [
    ['empresa', 'modo', 'almacen', 'sku', 'producto', 'cantidad_sistema',
     'cantidad_contada', 'diferencia', 'costo_unitario', 'valor_diferencia', 'level_id']
      .map(escapar).join(','),
    ...filas.map((f) =>
      [(f as { companyName?: string }).companyName || '', f.modo, f.warehouseName, f.sku || '',
       f.productName, f.quantity.toFixed(4),
       f.contado !== undefined ? f.contado.toFixed(4) : '',
       f.diferencia !== undefined ? f.diferencia.toFixed(4) : '',
       f.cost.toFixed(2),
       f.valor !== undefined ? f.valor.toFixed(2) : (Math.abs(f.quantity) * f.cost).toFixed(2),
       f.levelId || '']
        .map(escapar).join(',')
    ),
  ];
  writeFileSync(ruta, lineas.join('\n') + '\n', 'utf8');
  console.log('');
  console.log(`Detalle exportado a ${ruta}`);
}
