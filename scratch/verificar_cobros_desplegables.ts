/**
 * Lote 267 -- Cuentas por Cobrar: los clientes en una lista que se despliega y se contrae.
 *
 * Pedido del dueño (2026-10-03): *"en la pagina dashboard/receivables los clientes deben verse en
 * una lista que se pueda expandir y contraer, parecida a la de /dashboard/receivables-report"*.
 * Antes cada cliente era una tarjeta con sus facturas SIEMPRE a la vista.
 *
 * Las reglas (`services/cartera/listaDeClientes.ts`) EJECUTADAS, y la tabla de la pestaña "Balances
 * de Clientes" leida. Lo que se ve se miro en el navegador.
 *
 * Se ejecuta con: npx tsx scratch/verificar_cobros_desplegables.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => { const p = resolve(raiz, r); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => { comprobadas++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean) => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const pagina = sinComentarios(leer('src/app/dashboard/receivables/page.tsx'));
  const repo = sinComentarios(leer('src/repositories/arRepository.ts'));
  if (!/activeTab === 'pending'/.test(pagina) || !/static async getPendingAR/.test(repo)) throw new Error('Precondicion: no esta la pantalla de cobros o su consulta');
  //  La pestaña, acotada: de "Balances de Clientes" a la de recibos.
  const pestana = pagina.slice(pagina.indexOf("activeTab === 'pending' && ("), pagina.indexOf("activeTab === 'receipts' && ("));
  //  El detalle de un cliente desplegado vive en su propio componente (React Doctor: JSX demasiado
  //  anidado), en el mismo fichero.
  const detalle = (() => {
    const i = pagina.indexOf('function DetalleDelCliente(');
    const j = pagina.indexOf('export default function ReceivablesPage', i);
    return i > -1 && j > i ? pagina.slice(i, j) : '';
  })();

  console.log('\n1) Las reglas, ejecutadas\n');
  const E = ['pulsar un cliente cerrado lo abre; pulsar el abierto lo cierra', '  y abrir otro cierra el anterior (uno a la vez, como el reporte)', 'las iniciales del avatar: dos letras, en mayusculas, sin espacios delante',
    'vencida = con saldo y vencimiento ANTERIOR a hoy (dia de RD): la que vence hoy aun no'];
  let R: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/services/cartera/listaDeClientes.ts'))) R = await import('../src/services/cartera/listaDeClientes');
  if (!R) for (const t of E) ok(t, false, 'no existe services/cartera/listaDeClientes.ts');
  else {
    const r = R;
    intenta(E[0], () => r.alternarCliente(null, 'a') === 'a' && r.alternarCliente('a', 'a') === null);
    intenta(E[1], () => r.alternarCliente('a', 'b') === 'b');
    intenta(E[2], () => r.inicialesDelCliente('  latin doors') === 'LA' && r.inicialesDelCliente('') === '?' && r.inicialesDelCliente(null) === '?');
    intenta(E[3], () => r.estaVencida('2026-10-02', 100, '2026-10-03') && !r.estaVencida('2026-10-03', 100, '2026-10-03')
      && !r.estaVencida('2026-10-02', 0, '2026-10-03') && !r.estaVencida(null, 100, '2026-10-03'));
  }

  console.log('\n2) La lista, como la del reporte\n');
  ok('una tabla con una fila por cliente: Cliente, RNC/Cedula, Facturas, Balance y Acciones',
    /<thead className="bg-\[#003366\] text-white">[\s\S]*?>Cliente<[\s\S]*?>RNC\/Cédula<[\s\S]*?>Facturas Pendientes<[\s\S]*?>Balance Pendiente<[\s\S]*?>Acciones</.test(pestana)
    && /<tbody key=\{customer\.customerId\}>/.test(pestana));
  ok('  las facturas solo se ven con el cliente desplegado',
    /const abierto = clienteAbierto === customer\.customerId;/.test(pestana)
    && /\{abierto && \([\s\S]{0,300}<DetalleDelCliente invoices=\{customer\.invoices\} \/>/.test(pestana)
    && !/customer\.invoices\.map\(/.test(pestana) && /invoices\.map\(inv =>/.test(detalle));
  ok('  el detalle se anima sin tocar la altura, y marca vencidas por el dia de RD',
    /initial=\{\{ opacity: 0, y: -8 \}\}/.test(detalle) && !/height/.test(detalle)
    && /const \[hoy\] = useState\(\(\) => diaRD\(\)\);/.test(detalle) && /estaVencida\(inv\.dueDate, inv\.balance, hoy\)/.test(detalle));
  ok('  se despliega con el nombre y con la flecha, que son botones (y dicen si estan abiertos)',
    (pestana.match(/onClick=\{alternar\} aria-expanded=\{abierto\}/g) ?? []).length === 1
    && /onClick=\{alternar\}\s*aria-expanded=\{abierto\}\s*aria-label=\{abierto \? `Ocultar las facturas de/.test(pestana)
    && /setClienteAbierto\(alternarCliente\(clienteAbierto, customer\.customerId\)\)/.test(pestana)
    && /import \{[^}]*\balternarCliente\b[^}]*\} from '@\/services\/cartera\/listaDeClientes'/.test(pagina));
  ok('  la fila dice el RNC del cliente, que ahora trae la consulta',
    /\{customer\.customerRnc \|\| 'N\/A'\}/.test(pestana)
    && /customerRnc: customers\.rncCedula,/.test(repo) && /customerRnc: ar\.customerRnc \?\? null,/.test(repo));
  ok('  y el detalle marca cada factura Vencida o Pendiente', /\{isOverdue \? 'Vencida' : 'Pendiente'\}/.test(detalle));

  console.log('\n3) Lo que no cambia (invariantes)\n');
  invariante('cada cliente sigue con "Imprimir" y "Registrar Cobro"',
    /onClick=\{\(\) => handlePrintCustomerStatement\(customer\.customerId\)\}/.test(pestana) && /onClick=\{\(\) => handleOpenPayment\(customer\)\}/.test(pestana));
  invariante('la busqueda, la carga con error y el "Todo al dia" siguen', /filteredCustomers\.map\(/.test(pestana) && /<ErrorDeCarga mensaje=\{errorCarga\}/.test(pestana) && /Todo al día/.test(pestana));
  invariante('las fechas pasan por formatDateDisplay', /formatDateDisplay\(inv\.dueDate\)/.test(pagina) && /formatDateDisplay\(inv\.invoiceDate\)/.test(pagina));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`} (${comprobadas} comprobaciones)\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
