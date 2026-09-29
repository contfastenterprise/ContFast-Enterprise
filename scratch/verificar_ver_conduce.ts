/**
 * Lote 223 -- ver un conduce desde la lista: factura, hora de emision, cliente,
 * numero y, por mercancia, SKU, nombre, cantidad facturada y cuanto falta.
 *
 * POR QUE
 * -------
 * Pedido del dueño (2026-09-28), a raiz del aviso del lote 221: el aviso dice
 * que a un conduce le falta mercancia, pero en la pantalla de conduces no habia
 * forma de abrirlo y ver el detalle. `GET [id]` devolvia los renglones pelados.
 *
 * Lo que el banco vigila:
 *  · el faltante sale de LA MISMA regla que el aviso y la aprobacion -- un
 *    conduce no puede decir "falta 1" en la campana y otra cosa al abrirlo;
 *  · solo un BORRADOR tiene faltante: uno despachado ya desconto su existencia;
 *  · la vista se DIBUJA con `react-dom/server` y se lee lo que sale.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (etiquetas: string[], motivo: string) => { for (const t of etiquetas) ok(t, false, motivo); };

const R = (productId: string, nombre: string, sku: string | null, pedido: number, existencia: number | null, facturada: number, minimo = 0, llevaInventario = true) =>
  ({ productId, nombre, sku, pedido, existencia, minimo, llevaInventario, facturada });

/** CON-2026-000056, medido el 2026-09-28. */
const CON56 = [
  R('dc', 'Dintel Caoba', 'PROD-000035', 5, 1, 5),
  R('jr', 'Jamba Roble', 'PROD-000040', 20, 24, 20),
  R('cl', 'Closet Blanco en Espejo', 'PROD-000081', 3, 0, 3, 0, false),
];

async function main() {
  // Vale en los dos estados: la regla del aviso (lote 221) ya existe.
  const F = await import('../src/services/inventario/faltanteDelConduce');
  if (typeof F.faltantesDelConduce !== 'function') throw new Error('Precondicion: falta faltantesDelConduce (lote 221)');
  const G = F as unknown as {
    renglonesParaVer?: (r: unknown[], e: string) => Array<{ productId: string; nombre: string; facturada: number; despacha: number; faltan: number | null }>;
    disponibilidadDelRenglon?: (r: unknown, e: string) => { texto: string; tono: string };
  };

  console.log('\n1) Los renglones para ver, ejecutados\n');
  const E1 = ['borrador: faltan 4 Dintel Caoba, 0 lo que alcanza, null lo que no lleva inventario',
    '  y el faltante es EL MISMO que dice el aviso', 'despachado: ningun faltante (null, no 0)',
    'anulado: tampoco', 'el mismo producto en dos renglones: suma lo que despacha, no lo facturado',
    'ordenados por nombre'];
  if (!G.renglonesParaVer) falta(E1, 'no existe renglonesParaVer');
  else {
    const ver = G.renglonesParaVer(CON56, 'draft');
    const por = new Map(ver.map((r) => [r.productId, r]));
    ok(E1[0], por.get('dc')?.faltan === 4 && por.get('jr')?.faltan === 0 && por.get('cl')?.faltan === null
      && por.get('dc')?.facturada === 5, JSON.stringify(ver.map((r) => [r.productId, r.faltan])));
    const delAviso = new Map(F.faltantesDelConduce(CON56).map((f) => [f.productId, f.faltan]));
    ok(E1[1], ver.every((r) => r.faltan === null || r.faltan === (delAviso.get(r.productId) ?? 0)));
    ok(E1[2], G.renglonesParaVer(CON56, 'approved').every((r) => r.faltan === null));
    ok(E1[3], G.renglonesParaVer(CON56, 'voided').every((r) => r.faltan === null));
    const doble = G.renglonesParaVer([R('p', 'Puerta', 'P', 3, 10, 6), R('p', 'Puerta', 'P', 3, 10, 6)], 'draft');
    ok(E1[4], doble.length === 1 && doble[0].despacha === 6 && doble[0].facturada === 6, JSON.stringify(doble));
    ok(E1[5], ver.map((r) => r.nombre).join('|') === 'Closet Blanco en Espejo|Dintel Caoba|Jamba Roble');
  }

  console.log('\n2) La columna de faltante\n');
  const E2 = ['falta: "Faltan 4 · hay 1", en rojo', '  una sola: "Falta 1"', '  con minimo, lo dice',
    'alcanza: "Disponible", en verde', 'sin inventario: lo dice, sin tono', 'despachado: "Despachado"', 'anulado: "—"'];
  if (!G.disponibilidadDelRenglon) falta(E2, 'no existe disponibilidadDelRenglon');
  else {
    const d = G.disponibilidadDelRenglon;
    const base = { existencia: 1, minimo: 0, llevaInventario: true };
    const d4 = d({ ...base, faltan: 4 }, 'draft');
    ok(E2[0], d4.texto === 'Faltan 4 · hay 1' && d4.tono === 'falta', d4.texto);
    ok(E2[1], d({ ...base, faltan: 1 }, 'draft').texto === 'Falta 1 · hay 1');
    ok(E2[2], d({ faltan: 2, existencia: 6, minimo: 3, llevaInventario: true }, 'draft').texto === 'Faltan 2 · hay 6 (mínimo 3)');
    const d0 = d({ ...base, faltan: 0 }, 'draft');
    ok(E2[3], d0.texto === 'Disponible' && d0.tono === 'alcanza');
    const dn = d({ ...base, faltan: null, llevaInventario: false }, 'draft');
    ok(E2[4], dn.texto === 'No lleva inventario' && dn.tono === 'neutro');
    ok(E2[5], d({ ...base, faltan: null }, 'approved').texto === 'Despachado');
    ok(E2[6], d({ ...base, faltan: null }, 'voided').texto === '—');
  }

  console.log('\n3) La vista, DIBUJADA\n');
  const E3 = ['cabecera: numero, factura, cliente con RNC, almacen', 'las cinco columnas pedidas',
    'cada renglon con su SKU, nombre, facturada y faltante', 'aviso arriba si falta mercancia',
    '  y sin aviso en un conduce despachado'];
  let Vista: ((p: { conduce: unknown }) => unknown) | null = null;
  try {
    const m = await import('../src/app/dashboard/delivery-notes/components/VerConduce');
    Vista = (m as unknown as { VistaDelConduce?: typeof Vista }).VistaDelConduce ?? null;
  } catch { Vista = null; }
  if (!Vista || !G.renglonesParaVer) falta(E3, 'no existe VistaDelConduce');
  else {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const conduce = (estado: string) => ({
      id: 'x', numero: 'CON-2026-000056', estado, fechaEntrega: '2026-09-25',
      factura: { id: 'f', ncf: 'E310000000027', emitida: '2026-09-25T16:20:43.773Z' },
      cliente: { nombre: 'JUNIO JOSE FLORENTINO NICACIO', rnc: '03105070316' }, almacen: 'Principal',
      renglones: G.renglonesParaVer!(CON56, estado),
    });
    const html = renderToStaticMarkup(React.createElement(Vista as never, { conduce: conduce('draft') }));
    ok(E3[0], html.includes('CON-2026-000056') && html.includes('E310000000027')
      && html.includes('JUNIO JOSE FLORENTINO NICACIO · 03105070316') && html.includes('Principal'));
    ok(E3[1], ['SKU', 'Mercancía', 'Facturada', 'Despacha', 'Faltante'].every((c) => html.includes(`>${c}</th>`)));
    ok(E3[2], html.includes('PROD-000035') && html.includes('Dintel Caoba') && html.includes('Faltan 4 · hay 1')
      && html.includes('No lleva inventario') && html.includes('Disponible'));
    ok(E3[3], /falta mercancía en 1 producto\./.test(html));
    const despachado = renderToStaticMarkup(React.createElement(Vista as never, { conduce: conduce('approved') }));
    ok(E3[4], !/falta mercancía/.test(despachado) && despachado.includes('Despachado'));
  }

  console.log('\n4) La ruta y la consulta\n');
  const ruta = sinComentarios(leer('src/app/api/v1/delivery-notes/[id]/detalle/route.ts'));
  ok('la ruta exige el permiso de ver un conduce',
    /enforcePermission\(auth\.userId, auth\.role, auth\.roleId, auth\.companyId, 'facturacion', 'read'\)/.test(ruta));
  ok('  pide el conduce de SU empresa y SU modo, y contesta 404 si no esta',
    /verConduce\(id, auth\.companyId, auth\.modo\)/.test(ruta) && /status: 404/.test(ruta));
  const consulta = sinComentarios(leer('src/services/inventario/verConduce.ts'));
  ok('la consulta se acota por empresa, modo y borrados',
    /eq\(deliveryNotes\.companyId, companyId\)/.test(consulta) && /eq\(deliveryNotes\.modo, modo\)/.test(consulta)
    && /isNull\(deliveryNotes\.deletedAt\)/.test(consulta));
  ok('  con el almacen de SU factura y su modo, como la aprobacion',
    /eq\(inventoryLevels\.warehouseId, cabecera\.warehouseId\)/.test(consulta) && /eq\(inventoryLevels\.modo, modo\)/.test(consulta));
  ok('  lo facturado suma TODAS las lineas del producto en la factura',
    /sum\(\$\{invoiceLines\.quantity\}\)/.test(consulta) && /groupBy\(invoiceLines\.productId\)/.test(consulta));
  ok('  y el faltante lo decide la regla, no la consulta', /renglonesParaVer\(/.test(consulta));

  console.log('\n5) La pantalla\n');
  //  LOTE 224: re-anclado. El visor paso a un hook (`useVerConduce`) para pedir
  //  el conduce AL PULSAR y no en un efecto (aviso de React Doctor del 223). Lo
  //  que se vigila no cambia: el ojo abre ESE conduce, y el visor se pinta.
  const pagina = sinComentarios(leer('src/app/dashboard/delivery-notes/page.tsx'));
  ok('importa el visor', /import \{ VerConduce, useVerConduce \} from '\.\/components\/VerConduce';/.test(pagina)
    && /const visor = useVerConduce\(\);/.test(pagina));
  // Acotado al boton: el visor aparece tambien donde se pinta.
  ok('un icono de ojo en acciones abre ESE conduce',
    /onClick=\{\(\) => visor\.abrir\(note\.id\)\}[\s\S]{0,700}<Eye className/.test(pagina));
  ok('  y es un boton que no envia formularios', /type="button"\s*onClick=\{\(\) => visor\.abrir\(note\.id\)\}/.test(pagina));
  ok('se pinta con el visor, y recarga la lista tras despachar',
    /<VerConduce visor=\{visor\} onDespachado=\{loadDeliveryNotes\} \/>/.test(pagina));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
