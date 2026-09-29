/**
 * Lote 224 -- "Despachar lo disponible": la regla del reparto, el boton y la
 * ruta. La parte que escribe en la base la ejecuta
 * `verificar_despachar_disponible_db.ts` contra la base desechable.
 *
 * POR QUE
 * -------
 * Pedido del dueño (2026-09-28): con mercancia que falta, despachar lo que hay
 * y dejar el resto pendiente. La aprobacion era todo o nada y un borrador no
 * se edita, asi que habia que borrarlo y rehacerlo a mano -- y lo pendiente se
 * quedaba sin borrador, o sea sin el aviso del panel (lote 221).
 *
 * Dos propiedades se BARREN, porque si fallan el boton rompe:
 *  · lo que se despacha pasa `alcanzaLaExistencia` (si no, la aprobacion de
 *    dentro lo rechaza y el boton da error en vez de despachar);
 *  · despachado + pendiente = pedido, producto a producto.
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

const R = (productId: string, pedido: number, existencia: number | null, minimo: number | null = 0, llevaInventario = true) =>
  ({ productId, nombre: productId, sku: null, pedido, existencia, minimo, llevaInventario });

type Reparto = { despachar: Array<{ productId: string; cantidad: number }>; pendiente: Array<{ productId: string; cantidad: number }> };

async function main() {
  const E = await import('../src/services/inventario/existencia');
  const F = await import('../src/services/inventario/faltanteDelConduce') as unknown as {
    repartoDelDespacho?: (r: unknown[]) => Reparto;
    sePuedeDespacharEnParte?: (r: unknown[]) => boolean;
  };
  if (typeof E.alcanzaLaExistencia !== 'function') throw new Error('Precondicion: falta alcanzaLaExistencia');

  console.log('\n1) El reparto, ejecutado\n');
  const E1 = ['CON-000056: sale 1 dintel, quedan 4; lo que alcanza sale entero', 'lo que no lleva inventario sale entero',
    'el minimo del almacen cuenta: hay 6, minimo 3, pide 5 -> salen 3, quedan 2', 'bajo el minimo no sale nada',
    'el mismo producto en dos renglones se suma', 'sin nivel en el almacen, no sale nada',
    'BARRIDO: lo que sale pasa la aprobacion, y sale+queda = pedido (500 casos)',
    'el boton solo tiene sentido con algo que sale Y algo que queda'];
  if (!F.repartoDelDespacho || !F.sePuedeDespacharEnParte) falta(E1, 'no existe repartoDelDespacho');
  else {
    const rep = F.repartoDelDespacho;
    const mapa = (xs: Array<{ productId: string; cantidad: number }>) => Object.fromEntries(xs.map((x) => [x.productId, x.cantidad]));
    const r56 = rep([R('dintel', 5, 1), R('jamba', 20, 24), R('puerta', 12, 12)]);
    ok(E1[0], JSON.stringify(mapa(r56.despachar)) === JSON.stringify({ dintel: 1, jamba: 20, puerta: 12 })
      && JSON.stringify(mapa(r56.pendiente)) === JSON.stringify({ dintel: 4 }), JSON.stringify(r56));
    const rs = rep([R('closet', 103, 0, 0, false)]);
    ok(E1[1], mapa(rs.despachar).closet === 103 && rs.pendiente.length === 0);
    const rm = rep([R('marco', 5, 6, 3)]);
    ok(E1[2], mapa(rm.despachar).marco === 3 && mapa(rm.pendiente).marco === 2, JSON.stringify(rm));
    const rb = rep([R('marco', 5, 2, 3)]);
    ok(E1[3], rb.despachar.length === 0 && mapa(rb.pendiente).marco === 5);
    const rd = rep([R('p', 3, 4), R('p', 3, 4)]);
    ok(E1[4], mapa(rd.despachar).p === 4 && mapa(rd.pendiente).p === 2, JSON.stringify(rd));
    const rn = rep([R('x', 2, null, null)]);
    ok(E1[5], rn.despachar.length === 0 && mapa(rn.pendiente).x === 2);

    let malos = 0;
    for (let hay = 0; hay <= 9; hay++) for (let minimo = 0; minimo <= 4; minimo++) for (let pide = 1; pide <= 10; pide++) {
      const r = rep([R('a', pide, hay, minimo)]);
      const sale = mapa(r.despachar).a ?? 0;
      const queda = mapa(r.pendiente).a ?? 0;
      if (Math.abs(sale + queda - pide) > 1e-9) malos++;
      if (sale > 0 && !E.alcanzaLaExistencia(hay, minimo, sale)) malos++;
      if (sale < 0 || queda < 0) malos++;
      // Y no se queda corto: si cabia una unidad mas, deberia haber salido.
      if (queda > 0 && E.alcanzaLaExistencia(hay, minimo, sale + 1)) malos++;
    }
    ok(E1[6], malos === 0, `${malos} casos malos`);

    ok(E1[7], F.sePuedeDespacharEnParte([R('a', 5, 1)]) === true
      && F.sePuedeDespacharEnParte([R('a', 5, 9)]) === false
      && F.sePuedeDespacharEnParte([R('a', 5, 0)]) === false);
  }

  console.log('\n2) La confirmacion dice que queda pendiente\n');
  let V: { pendienteSiSeDespachaLoDisponible?: (c: unknown) => string | null } = {};
  try { V = await import('../src/app/dashboard/delivery-notes/components/VerConduce') as typeof V; } catch { V = {}; }
  const E2 = ['nombra lo que queda y cuanto', 'sin boton en un despachado', 'sin boton si alcanza todo', 'sin boton si no alcanza nada'];
  if (!V.pendienteSiSeDespachaLoDisponible) falta(E2, 'no existe pendienteSiSeDespachaLoDisponible');
  else {
    const renglon = (productId: string, nombre: string, despacha: number, existencia: number) =>
      ({ productId, sku: null, nombre, facturada: despacha, despacha, llevaInventario: true, existencia, minimo: 0, faltan: null });
    const conduce = (estado: string, renglones: unknown[]) => ({ id: 'x', numero: 'CON-X', estado, fechaEntrega: null, factura: null, cliente: null, almacen: null, renglones });
    const p = V.pendienteSiSeDespachaLoDisponible;
    const texto = p(conduce('draft', [renglon('d', 'Dintel Caoba', 5, 1), renglon('j', 'Jamba Roble', 20, 24)]));
    ok(E2[0], texto === 'Dintel Caoba: 4', String(texto));
    ok(E2[1], p(conduce('approved', [renglon('d', 'Dintel Caoba', 5, 1)])) === null);
    ok(E2[2], p(conduce('draft', [renglon('j', 'Jamba Roble', 20, 24)])) === null);
    ok(E2[3], p(conduce('draft', [renglon('d', 'Dintel Caoba', 5, 0)])) === null);
  }

  console.log('\n3) El boton, la ruta y la aprobacion\n');
  const visor = sinComentarios(leer('src/app/dashboard/delivery-notes/components/VerConduce.tsx'));
  ok('el boton solo sale cuando tiene sentido, y pide confirmacion',
    /footer=\{pendiente \? \(/.test(visor) && /await confirm\(\{/.test(visor) && /if \(!ok\) return;/.test(visor));
  ok('  llama a la ruta del reparto y mira r.ok antes de fiarse',
    /\/despachar-disponible`, \{ method: 'POST' \}/.test(visor) && /if \(r\.ok && data\?\.success\) \{\s*toast\.success/.test(visor));
  ok('  al terminar cierra y recarga la lista', /cerrar\(\);\s*onDespachado\(\);/.test(visor));
  // Los dos avisos de React Doctor del lote 223.
  ok('el conduce se pide al pulsar, no en un efecto; y se mira r.ok',
    !/useEffect/.test(visor) && /if \(r\.ok && data\?\.success\) setConduce\(data\.data\)/.test(visor));
  const ruta = sinComentarios(leer('src/app/api/v1/delivery-notes/[id]/despachar-disponible/route.ts'));
  ok('la ruta exige el permiso de aprobar (facturacion:write)',
    /enforcePermission\(auth\.userId, auth\.role, auth\.roleId, auth\.companyId, 'facturacion', 'write'\)/.test(ruta)
    && /DeliveryRepository\.despacharLoDisponible\(id, auth\.userId, auth\.companyId, auth\.modo\)/.test(ruta));
  const repo = sinComentarios(leer('src/repositories/deliveryRepository.ts'));
  ok('approve delega en aprobarEnTx, en su transaccion',
    /return await db\.transaction\(\(tx\) => this\.aprobarEnTx\(tx, id, userId, companyId, modo\)\);/.test(repo));
  ok('  y aprobarEnTx lee el conduce DENTRO de la transaccion',
    /const note = await this\.getById\(id, companyId, modo, tx\);\s*if \(!note\) \{\s*throw new Error\('Conduce no encontrado\.'\);/.test(repo));
  ok('el reparto bloquea el conduce, usa la regla, y aprueba en la MISMA transaccion',
    /\.for\('update'\)/.test(repo) && /repartoDelDespacho\(note\.lines\.map/.test(repo)
    && (repo.match(/await this\.aprobarEnTx\(tx, id, userId, companyId, modo\)/g) ?? []).length === 2);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
