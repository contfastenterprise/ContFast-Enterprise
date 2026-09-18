/**
 * El panel avisa del 606 y del 607 del mes cerrado, hasta que se marcan
 * presentados.
 *
 * EL HUECO (lote 159)
 * -------------------
 * Los dos formatos se arman a mano: alguien entra a la pantalla, elige el mes y
 * pulsa exportar. Nada avisaba de que el mes hubiera cerrado ni quedaba
 * constancia de si se presento. Medido el 2026-09-18 en Latin Doors
 * (PRODUCCION): julio con 35 compras con NCF y 23 comprobantes declarables, y
 * agosto con 33 y 17. El plazo de la DGII vence el dia 15 del mes siguiente:
 * los cuatro (606 y 607 de julio y agosto) ya habian vencido sin que nada lo
 * dijera.
 *
 * Decidido por el dueño el 2026-09-18: el fichero NO se guarda (se genera al
 * descargarlo, asi nunca esta viejo) y el aviso vive hasta que alguien marca
 * ese periodo como presentado.
 *
 * Se EJECUTA la regla de periodos y plazos; el cableado se lee. LO QUE NO
 * PRUEBA: el aviso contra la base real.
 */
import fs from 'fs';
import { fuente } from './_fuente';

const leer = (ruta: string) => (fs.existsSync(ruta) ? fuente(ruta) : '');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

async function main() {
  const PANEL = fuente('src/repositories/dashboardRepository.ts');
  const P606 = fuente('src/app/dashboard/reports/606/page.tsx');
  const P607 = fuente('src/app/dashboard/reports/607/page.tsx');

  console.log('\n0) Precondiciones\n');
  exige('las dos pantallas siguen exportando el TXT del periodo elegido',
    /exportTxt/.test(P606) && /exportTxt/.test(P607)
    && /reports\/606\/download\?period=/.test(P606) && /reports\/607\/txt\?period=/.test(P607));
  exige('el panel sigue armando avisos con enlace y contandolos',
    /alertsDetails\.push\(\{/.test(PANEL) && /alertCount:/.test(PANEL));

  let m: typeof import('../src/services/dgii/declaracionesPendientes') | null = null;
  try { m = await import('../src/services/dgii/declaracionesPendientes'); } catch { m = null; }

  //  18/09/2026 a las 11:00 de RD.
  const ahora = new Date('2026-09-18T15:00:00Z');

  console.log('\n1) Que periodos estan cerrados y cuando vencen\n');
  ok('el periodo de hoy es septiembre, y el cerrado mas reciente agosto',
    !!m && m.periodoDe(ahora) === '202609' && m.periodosCerrados(ahora)[0] === '202608');
  ok('se miran tres periodos hacia atras, del mas reciente al mas viejo',
    !!m && JSON.stringify(m.periodosCerrados(ahora)) === JSON.stringify(['202608', '202607', '202606']));
  ok('el plazo de la DGII es el dia 15 del mes siguiente',
    !!m && m.DIA_LIMITE_DECLARACION === 15 && m.limiteDePresentacion('202608') === '2026-09-15'
    && m.limiteDePresentacion('202612') === '2027-01-15');
  ok('los dias del plazo salen en los dos sentidos',
    //  Del 18/09 al 15/09 van -3; al 15/10, 27 (12 que quedan de septiembre
    //  mas 15). Lo escribi como 28 al principio y el banco lo canto.
    !!m && m.diasParaElLimite('202608', ahora) === -3 && m.diasParaElLimite('202609', ahora) === 27);
  ok('el periodo de la pantalla (AAAA-MM) se guarda como AAAAMM',
    !!m && m.periodoCompacto('2026-08') === '202608');
  ok('el nombre del periodo se lee en español', !!m && m.nombreDelPeriodo('202608') === 'agosto 2026');

  console.log('\n2) Que queda pendiente, con el caso real de Latin Doors\n');
  {
    const conDatos = (_t: string, p: string) => p === '202607' || p === '202608';
    const pendientes = m?.declaracionesPendientes({ ahora, conDatos, presentada: () => false }) ?? [];
    ok('julio y agosto, 606 y 607: cuatro avisos',
      pendientes.length === 4 && pendientes.every((d) => d.periodo === '202607' || d.periodo === '202608'));
    //  Las tres siguientes son sobre listas: si la lista viene vacia -sin
    //  modulo, en la contraprueba- un `every` o un `length === 0` serian
    //  ciertos de balde. Por eso cada una exige ademas el caso contrario.
    ok('los cuatro salen como vencidos (el plazo era el dia 15)',
      pendientes.length === 4 && pendientes.every((d) => d.vencida === true));
    ok('un periodo SIN datos no avisa: no hay nada que declarar',
      pendientes.length === 4
      && (m?.declaracionesPendientes({ ahora, conDatos: () => false, presentada: () => false }) ?? []).length === 0);
    ok('lo ya marcado como presentado deja de avisar',
      (m?.declaracionesPendientes({ ahora, conDatos, presentada: (t, p) => t === '606' || p === '202607' }) ?? [])
        .length === 1);
    ok('el mes en curso NUNCA avisa: todavia no ha cerrado',
      pendientes.length === 4 && !pendientes.some((d) => d.periodo === '202609')
      && (m?.declaracionesPendientes({ ahora, conDatos: (_t, p) => p === '202609', presentada: () => false }) ?? []).length === 0);
    const dentroDePlazo = new Date('2026-09-05T15:00:00Z');
    const aTiempo = m?.declaracionesPendientes({ ahora: dentroDePlazo, conDatos: (_t, p) => p === '202608', presentada: () => false }) ?? [];
    ok('dentro del plazo avisa sin marcar vencido, y dice cuantos dias quedan',
      aTiempo.length === 2 && aTiempo.every((d) => d.vencida === false && d.dias === 10));
    ok('el titulo distingue vencido, hoy y los dias que faltan',
      !!m && /venció hace 3 día\(s\)/.test(m.tituloDeclaracion(pendientes[0]))
      && /vence en 10 día\(s\)/.test(m.tituloDeclaracion(aTiempo[0]))
      && /vence HOY/.test(m.tituloDeclaracion({ tipo: '606', periodo: '202608', limite: '2026-09-15', dias: 0, vencida: false })));
  }

  console.log('\n3) El cableado del panel\n');
  ok('mira compras con NCF para el 606 y comprobantes declarables para el 607',
    /coalesce\(\$\{expenses\.ncf\}, ''\) <> ''/.test(PANEL)
    && /\$\{invoices\.status\} not in \('draft', 'rejected', 'void'\)/.test(PANEL));
  ok('lee las marcas de la empresa y el modo', /\.from\(declaracionesDgii\)\s*\.where\(withTenantMode\(declaracionesDgii, ctx\)\)/.test(PANEL));
  ok('decide con la regla, no con una copia',
    /declaracionesPendientes\(\{\s*ahora: today,\s*conDatos:/.test(PANEL) && /presentada: \(tipo, periodo\) => presentadas\.has\(`\$\{tipo\}\|\$\{periodo\}`\)/.test(PANEL));
  ok('el aviso lleva a la pantalla de ese formato y periodo, y se cuenta',
    /actionLink: `\/dashboard\/reports\/\$\{d\.tipo\}\?period=\$\{d\.periodo\}`/.test(PANEL)
    && /\+ declaracionesPorPresentar\.length,/.test(PANEL));
  //  Negacion: sin el aviso tampoco habria generacion, asi que va unida a la
  //  marca del estado posterior.
  ok('el panel avisa pero NO genera ni guarda el fichero',
    /type: 'declaracion_pendiente',/.test(PANEL) && !/txtDel60[67]|generate606Txt|StorageService/.test(PANEL));

  console.log('\n4) La marca: ruta y pantallas\n');
  {
    const RUTA = leer('src/app/api/v1/reports/declaraciones/route.ts');
    ok('la ruta exige permiso de contabilidad para escribir y para borrar',
      (RUTA.match(/enforcePermission\([^)]*'contabilidad', 'write'\)/g) || []).length === 2
      && /'contabilidad', 'read'/.test(RUTA));
    ok('valida el formato y el periodo antes de guardar',
      /tipo: z\.enum\(TIPOS_DECLARACION\)/.test(RUTA) && /periodo: z\.string\(\)\.regex\(\/\^\\d\{4\}\(0\[1-9\]\|1\[0-2\]\)\$\//.test(RUTA));
    ok('marcar dos veces el mismo periodo no es un error', /\.onConflictDoNothing\(\)/.test(RUTA));
    ok('guarda quien lo marco, en su empresa y modo',
      /companyId: auth\.companyId,\s*modo: auth\.modo,\s*tipo: parsed\.data\.tipo,\s*periodo: parsed\.data\.periodo,\s*presentadaPor: auth\.userId,/.test(RUTA));
    ok('se puede quitar la marca, acotando empresa y modo',
      /\.delete\(declaracionesDgii\)\s*\.where\(and\(\s*eq\(declaracionesDgii\.companyId, auth\.companyId\),\s*eq\(declaracionesDgii\.modo, auth\.modo\),/.test(RUTA));
    ok('la ruta deja constancia y NO sube nada a la DGII',
      /\.insert\(declaracionesDgii\)/.test(RUTA) && !/mseller|dgii\.gov\.do|fetch\(/i.test(RUTA));
  }
  for (const [nombre, pantalla, tipo] of [['606', P606, '606'], ['607', P607, '607']] as const) {
    ok(`la pantalla del ${nombre} marca y desmarca el periodo`,
      new RegExp(`body: JSON\\.stringify\\(\\{ tipo: '${tipo}', periodo \\}\\)`).test(pantalla)
      && new RegExp(`declaraciones\\?tipo=${tipo}&periodo=\\$\\{periodo\\}`).test(pantalla)
      && /method: 'DELETE'/.test(pantalla));
    ok(`la pantalla del ${nombre} enseña si ya se presento`,
      /presentadaEn \? `Presentado el \$\{formatDateDisplay\(presentadaEn\)\}` : 'Marcar como presentado'/.test(pantalla)
      && /cargarPresentacion\(\);/.test(pantalla));
  }
  {
    const esquema = fuente('src/db/schema/accounting.ts');
    ok('la tabla guarda la marca, con una sola por empresa, modo, formato y periodo',
      /export const declaracionesDgii = pgTable\('declaraciones_dgii'/.test(esquema)
      && /uniqueIndex\('declaraciones_dgii_unica_idx'\)\s*\.on\(table\.companyId, table\.modo, table\.tipo, table\.periodo\)/.test(esquema));
    const mig = fs.existsSync('drizzle/0009_declaraciones_dgii.sql') ? fs.readFileSync('drizzle/0009_declaraciones_dgii.sql', 'utf8') : '';
    ok('la migracion crea la tabla y su indice unico, y nada mas',
      /CREATE TABLE "declaraciones_dgii"/.test(mig)
      && /CREATE UNIQUE INDEX "declaraciones_dgii_unica_idx"/.test(mig)
      && (mig.match(/--> statement-breakpoint/g) || []).length === 3
      && !/DROP|ALTER TABLE "(invoices|expenses)"/.test(mig));
    ok('y esta en el diario de migraciones', /"tag": "0009_declaraciones_dgii"/.test(fs.readFileSync('drizzle/meta/_journal.json', 'utf8')));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
