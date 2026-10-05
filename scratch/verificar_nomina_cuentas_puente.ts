/**
 * Lote 292 -- las cuentas de la nomina en Cuentas Puente (el "lote B" de
 * `docs/diseno_asientos_nomina.md`). Este lote NO asienta nada: siembra y
 * enlaza las cuentas que el asiento al aprobar (lote C) y el pago (lote D)
 * van a buscar, y les da su bloque en la pantalla.
 *
 * QUE SE VIGILA
 * -------------
 *  1. Las ocho claves, con su codigo, nombre, tipo, naturaleza y categoria.
 *  2. Que ninguna cae en una cuenta AJENA. Es el riesgo de verdad: en Latin
 *     Doors 2.1.03, 2.1.04 y 2.1.05 son ITBIS e ISR con movimientos, y
 *     `planParaCompletar` enlaza una cuenta que ya existe mirando su TIPO, no
 *     su nombre. Se EJECUTA el plan real con los catalogos de las seis empresas
 *     medidos en PRODUCCION el 2026-10-04 (`catalogosMedidos_2026-10-04.ts`).
 *  3. El bloque "Nomina", dibujado con el componente de verdad.
 *  4. El reparto total de los bloques.
 *  5. D7: el sembrador llama a 6.1.01.02 "Aportes Patronales TSS".
 *  6. El trinquete del lote 171: ningun codigo de nomina escrito fuera de la
 *     tabla y del sembrador.
 *
 * El modulo se carga con `import()` perezoso: existe en los dos estados, pero
 * asi un fallo al cargarlo da FALLA por etiqueta y no revienta el banco.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { CATALOGOS_MEDIDOS, MEDIDO_EL } from './catalogosMedidos_2026-10-04';

const raiz = join(__dirname, '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

/** Lo que propone el diseño (seccion 4). La fuente de verdad del banco. */
const ESPERADAS: { clave: string; codigo: string; nombre: string; tipo: string; naturaleza: string }[] = [
  { clave: 'payroll_salaries_expense', codigo: '6.1.01.01', nombre: 'Sueldos y Salarios', tipo: 'expense', naturaleza: 'debit' },
  { clave: 'payroll_employer_tss_expense', codigo: '6.1.01.02', nombre: 'Aportes Patronales TSS', tipo: 'expense', naturaleza: 'debit' },
  { clave: 'payroll_infotep_expense', codigo: '6.1.01.03', nombre: 'Aporte Infotep', tipo: 'expense', naturaleza: 'debit' },
  { clave: 'payroll_salaries_payable', codigo: '2.1.01.04', nombre: 'Sueldos por Pagar', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'payroll_tss_payable', codigo: '2.1.02.04', nombre: 'TSS por Pagar (AFP, SFS, SRL)', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'payroll_isr_payable', codigo: '2.1.02.05', nombre: 'ISR Retenido a Asalariados por Pagar', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'payroll_infotep_payable', codigo: '2.1.02.06', nombre: 'Infotep por Pagar', tipo: 'liability', naturaleza: 'credit' },
  { clave: 'payroll_other_deductions', codigo: '2.1.01.02', nombre: 'Otras Cuentas por Pagar', tipo: 'liability', naturaleza: 'credit' },
];
/** Las que ya existen en el catalogo sembrado de las seis; las demas se crean. */
const YA_EXISTEN = new Set(['6.1.01.01', '6.1.01.02', '2.1.01.02']);
/** Los nombres que puede tener HOY una cuenta enlazada a una clave de nomina.
 *  6.1.01.02 se llama "Retenciones TSS (SFS/AFP/TSS)" en las seis empresas y
 *  la renombra el contador (D7): se admite ese nombre y ningun otro. */
const NOMBRE_VIEJO_D7 = 'Retenciones TSS (SFS/AFP/TSS)';
/** Las de Latin Doors que NO pueden recibir ninguna clave de nomina. */
const AJENAS_LATIN = ['2.1.03', '2.1.04', '2.1.05'];

async function main() {
  // Precondiciones que valen en los dos estados.
  const empresas = Object.keys(CATALOGOS_MEDIDOS);
  if (empresas.length !== 6) throw new Error(`Precondicion: se esperaban 6 catalogos medidos, hay ${empresas.length}`);
  const latin = CATALOGOS_MEDIDOS['Latin Doors S.R.L'];
  if (!latin) throw new Error('Precondicion: falta el catalogo de Latin Doors S.R.L');
  for (const c of AJENAS_LATIN) {
    const f = latin.catalogo.find((x) => x[0] === c);
    if (!f || !f[4] || f[6] === 0) throw new Error(`Precondicion: en Latin Doors ${c} deberia ser transaccional y con movimientos (medido ${MEDIDO_EL})`);
  }

  let T: typeof import('../src/services/accounting/cuentasDelSistema') | null = null;
  try { T = await import('../src/services/accounting/cuentasDelSistema'); } catch { T = null; }
  if (!T) throw new Error('Precondicion: no se pudo cargar cuentasDelSistema.ts');
  const { CUENTAS_DEL_SISTEMA, GRUPOS_DE_PUENTES, PUENTES_DE_CUENTAS, planParaCompletar } = T;

  console.log('\n1) Las ocho claves de la nomina\n');
  for (const e of ESPERADAS) {
    const c = CUENTAS_DEL_SISTEMA.find((x) => x.clave === e.clave);
    ok(`${e.clave} -> ${e.codigo} ${e.nombre}`,
      !!c && c.codigo === e.codigo && c.nombre === e.nombre && c.tipo === e.tipo && c.naturaleza === e.naturaleza
      && (c.categoria as string) === 'nomina',
      c ? `${c.codigo} ${c.nombre} ${c.tipo}/${c.naturaleza} [${c.categoria}]` : 'no existe');
  }
  const deNomina = CUENTAS_DEL_SISTEMA.filter((c) => /^payroll_/.test(c.clave));
  ok('son exactamente ocho, y ninguna usa 2.1.03, 2.1.04 ni 2.1.05',
    deNomina.length === 8 && deNomina.every((c) => !AJENAS_LATIN.includes(c.codigo)),
    deNomina.map((c) => c.codigo).join(' '));
  const isrAsal = CUENTAS_DEL_SISTEMA.find((c) => c.clave === 'payroll_isr_payable');
  const isrTerc = CUENTAS_DEL_SISTEMA.find((c) => c.clave === 'isr_withholding_payable');
  ok('el ISR de asalariados (IR-3) no comparte cuenta con el de terceros (IR-17)',
    !!isrAsal && !!isrTerc && isrAsal.codigo !== isrTerc.codigo, `${isrAsal?.codigo} / ${isrTerc?.codigo}`);

  console.log('\n2) Ninguna clave cae en una cuenta ajena: el plan real, con los seis catalogos medidos\n');
  for (const nombre of empresas) {
    const med = CATALOGOS_MEDIDOS[nombre];
    const porCodigo = new Map(med.catalogo.map((f) => [f[0], f]));
    const catalogo = med.catalogo.map((f) => ({ id: `id:${f[0]}`, code: f[0], type: f[2], isTransactional: f[4], status: f[5], renglones: f[6] }));
    const enlazadas = new Set(med.claves.map((k) => k.split('=')[0]));
    let plan: ReturnType<typeof planParaCompletar> = [];
    let lanzo = '';
    try { plan = planParaCompletar(catalogo, enlazadas); } catch (e) { lanzo = (e as Error).message; }
    const problemas: string[] = [];
    if (lanzo) problemas.push(`el plan se niega: ${lanzo}`);
    for (const e of ESPERADAS) {
      const paso = plan.find((p) => ('clave' in p && p.clave === e.clave) || ('claves' in p && p.claves.includes(e.clave)));
      if (!paso) { problemas.push(`${e.clave}: sin paso`); continue; }
      if (YA_EXISTEN.has(e.codigo)) {
        // Se ENLAZA a la existente, y la existente tiene que ser la suya.
        if (paso.accion !== 'enlazar') { problemas.push(`${e.clave}: ${paso.accion} en vez de enlazar`); continue; }
        const f = porCodigo.get(paso.codigo);
        const nombreOk = !!f && (f[1] === e.nombre || (e.codigo === '6.1.01.02' && f[1] === NOMBRE_VIEJO_D7));
        if (paso.codigo !== e.codigo || !nombreOk) problemas.push(`${e.clave} enlazaria ${paso.codigo} "${f?.[1]}"`);
      } else {
        // Se CREA, con su nombre, bajo su padre, y no existia nada con ese codigo.
        if (paso.accion !== 'crear_y_enlazar') { problemas.push(`${e.clave}: ${paso.accion} en vez de crear`); continue; }
        const padre = e.codigo.slice(0, e.codigo.lastIndexOf('.'));
        if (paso.cuenta.codigo !== e.codigo || paso.cuenta.nombre !== e.nombre || paso.codigoPadre !== padre || porCodigo.has(e.codigo)) {
          problemas.push(`${e.clave} crearia ${paso.cuenta.codigo} "${paso.cuenta.nombre}" bajo ${paso.codigoPadre}`);
        }
      }
    }
    // Ningun paso, de ninguna clave, toca 2.1.03-2.1.05; y lo que ya estaba
    // enlazado no se mueve (las 17 claves de antes: 'nada').
    for (const p of plan) {
      const cod = p.accion === 'enlazar' ? p.codigo : p.accion === 'crear_y_enlazar' ? p.cuenta.codigo : '';
      if (AJENAS_LATIN.includes(cod)) problemas.push(`un paso toca ${cod}`);
      if (p.accion !== 'nada' && !(('clave' in p ? [p.clave] : p.claves).every((k) => /^payroll_/.test(k)))) {
        problemas.push(`mueve una clave que no es de nomina: ${JSON.stringify(p)}`);
      }
    }
    const pasosNomina = plan.filter((p) => p.accion !== 'nada').length;
    ok(`${nombre}: 3 se enlazan a la suya, 5 se crean bajo su padre, nada mas se mueve`,
      problemas.length === 0 && pasosNomina === 8, problemas.join('; ') || `${pasosNomina} pasos`);
  }

  console.log('\n3) El bloque "Nomina", dibujado\n');
  const nomina = GRUPOS_DE_PUENTES.find((g) => (g.categoria as string) === 'nomina');
  ok('el bloque se llama "Nómina" y dice que alimenta',
    !!nomina && nomina.titulo === 'Nómina'
    && nomina.descripcion === 'Sueldos, aportes a la TSS, Infotep y retenciones de ISR de los empleados: lo que la nómina asienta al aprobarse y paga después.',
    nomina ? `${nomina.titulo}: ${nomina.descripcion}` : 'no hay bloque');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let html = '';
  try {
    const { CuentasPuente } = await import('../src/app/dashboard/settings/components/CuentasPuente');
    const nada = () => undefined;
    // Las cuentas de Latin Doors tal como estan (con el nombre viejo de 6.1.01.02).
    const accounts = latin.catalogo.map((f) => ({ id: `id:${f[0]}`, code: f[0], name: f[1], type: f[2], isTransactional: f[4] }));
    const draftMappings = { payroll_salaries_expense: 'id:6.1.01.01' };
    html = renderToStaticMarkup(React.createElement(CuentasPuente as never,
      { p: { draftMappings, setDraftMappings: nada, mappingSubmitting: false, handleSaveMappings: nada, cargar: nada, accounts } } as never));
  } catch (e) { html = `LANZO ${(e as Error).message}`; }
  // La tarjeta del bloque: desde su <h4> hasta el siguiente <h4> (o el final).
  const iTitulo = html.indexOf('>Nómina</h4>');
  const resto = iTitulo >= 0 ? html.slice(iTitulo) : '';
  const tarjeta = resto.slice(0, resto.indexOf('<h4', 5) > 0 ? resto.indexOf('<h4', 5) : undefined);
  const idsEnTarjeta = [...tarjeta.matchAll(/<select[^>]*\bid="puente-([0-9.]+)"/g)].map((m) => m[1]).sort();
  ok('la pantalla pinta la tarjeta "Nómina" con su descripcion',
    iTitulo >= 0 && /lo que la nómina asienta al aprobarse y paga después/.test(tarjeta), html.startsWith('LANZO') ? html : '');
  ok('  y dentro, un desplegable por cada una de las ocho cuentas, y ninguno mas',
    JSON.stringify(idsEnTarjeta) === JSON.stringify(ESPERADAS.map((e) => e.codigo).sort()), idsEnTarjeta.join(' '));
  const sueldos = /<select[^>]*\bid="puente-6\.1\.01\.01"[^>]*>([\s\S]*?)<\/select>/.exec(tarjeta)?.[1] ?? '';
  ok('  el de sueldos ofrece solo gastos transaccionales, y ya trae la elegida',
    /<option value="id:6\.1\.01\.01" selected="">6\.1\.01\.01 - Sueldos y Salarios<\/option>/.test(sueldos)
    && /6\.1\.01\.02 - Retenciones TSS/.test(sueldos)
    && !/2\.1\.0/.test(sueldos) && !/value="id:6\.1\.01"/.test(sueldos), sueldos.slice(0, 160));

  console.log('\n4) El reparto es total\n');
  const enBloques = GRUPOS_DE_PUENTES.flatMap((g) => g.puentes.map((p) => p.codigo));
  const fuera = PUENTES_DE_CUENTAS.filter((p) => !enBloques.includes(p.codigo)).map((p) => p.codigo);
  ok('toda cuenta puente cae en exactamente un bloque, y las de nomina en el suyo',
    fuera.length === 0 && new Set(enBloques).size === enBloques.length
    && ESPERADAS.every((e) => nomina?.puentes.some((p) => p.codigo === e.codigo && p.claves.includes(e.clave))),
    `fuera: ${fuera.join(' ') || '-'}; nomina: ${nomina?.puentes.map((p) => p.codigo).join(' ') ?? '-'}`);
  ok('el bloque de nomina va el ultimo (despues de impuestos)',
    GRUPOS_DE_PUENTES.length > 0 && (GRUPOS_DE_PUENTES[GRUPOS_DE_PUENTES.length - 1].categoria as string) === 'nomina'
    && GRUPOS_DE_PUENTES[GRUPOS_DE_PUENTES.length - 2]?.categoria === 'impuestos',
    GRUPOS_DE_PUENTES.map((g) => g.categoria).join(' > '));

  console.log('\n5) El sembrador (empresas nuevas) y D7\n');
  const repo = leer('src/repositories/accountingRepository.ts');
  const i = repo.indexOf('public static async seedDefaultChartOfAccounts(');
  const sembrador = i > 0 ? repo.slice(i, repo.indexOf('\n  public static', i + 10)) : '';
  if (!sembrador) throw new Error('Precondicion: no encuentro el sembrador');
  ok('D7: 6.1.01.02 se siembra como "Aportes Patronales TSS", y ya no como retenciones',
    /code: '6\.1\.01\.02', name: 'Aportes Patronales TSS', type: 'expense', nature: 'debit', isTransactional: true/.test(sembrador)
    && !/name: 'Retenciones TSS/.test(sembrador));
  const filaSembrada = (e: typeof ESPERADAS[number]) => new RegExp(
    `\\{ code: '${e.codigo.replace(/\./g, '\\.')}', name: '${e.nombre.replace(/[().]/g, (m) => `\\${m}`)}', type: '${e.tipo}', nature: '${e.naturaleza}', isTransactional: true \\}`);
  const noSembradas = ESPERADAS.filter((e) => !filaSembrada(e).test(sembrador)).map((e) => e.codigo);
  ok('el sembrador crea las ocho, transaccionales, con su tipo y naturaleza', noSembradas.length === 0, noSembradas.join(' '));
  // Y cada una DESPUES de su padre: el sembrador busca el padre en lo ya creado
  // y, si no esta, la deja colgando sin padre (parentId null) sin avisar.
  const desordenadas = ESPERADAS.filter((e) => {
    const padre = e.codigo.slice(0, e.codigo.lastIndexOf('.'));
    const iPadre = sembrador.indexOf(`code: '${padre}', `);
    const iHija = sembrador.indexOf(`code: '${e.codigo}', `);
    return iPadre < 0 || iHija < 0 || iHija < iPadre;
  }).map((e) => e.codigo);
  ok('  cada una despues de su padre (si no, nace sin padre)', desordenadas.length === 0, desordenadas.join(' '));

  console.log('\n6) El trinquete: ningun codigo de nomina escrito fuera de la tabla y del sembrador\n');
  const permitidos = new Set(['src/services/accounting/cuentasDelSistema.ts', 'src/repositories/accountingRepository.ts']);
  const ficheros = (dir: string, acc: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) ficheros(p, acc); else if (/\.tsx?$/.test(n)) acc.push(p);
    }
    return acc;
  };
  const sueltos: string[] = [];
  const nuevos = ESPERADAS.filter((e) => !YA_EXISTEN.has(e.codigo)).map((e) => e.codigo);
  for (const f of ficheros(join(raiz, 'src'))) {
    const rel = relative(raiz, f).replace(/\\/g, '/');
    if (permitidos.has(rel) || rel.startsWith('src/tests/')) continue;
    const t = readFileSync(f, 'utf8');
    for (const c of nuevos) if (new RegExp(`['"\`]${c.replace(/\./g, '\\.')}['"\`]`).test(t)) sueltos.push(`${rel}: ${c}`);
  }
  // La negacion sola seria cierta de balde antes del lote: va unida a que los
  // codigos esten en la tabla.
  ok('ningun codigo nuevo de nomina aparece suelto en src/ (solo en la tabla y el sembrador)',
    sueltos.length === 0 && nuevos.every((c) => CUENTAS_DEL_SISTEMA.some((x) => x.codigo === c)), sueltos.join(' | '));

  console.log(`\n${fallos === 0 ? `TODO CORRECTO (${total})` : `${fallos} FALLIDAS de ${total}`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
