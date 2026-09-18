/**
 * Los avisos del sistema se guardan, se ven desde cualquier pantalla y se
 * cierran solos.
 *
 * EL HUECO (lote 160)
 * -------------------
 * Los avisos se calculaban en el panel de inicio y morian ahi: quien entraba
 * directo a facturar no se enteraba de ninguno, no habia forma de saber desde
 * cuando llevaba avisando algo, ni de quitarse de encima uno ya visto. La tabla
 * `notifications` existia desde el principio y estaba VACIA (0 filas medidas el
 * 2026-09-18; la unica referencia en todo `src/` era su esquema).
 *
 * Decidido por el dueño el 2026-09-18: guardar los avisos y enseñarlos en una
 * campana; "leida" es de la EMPRESA, no de cada persona.
 *
 * Se EJECUTA la regla de severidad; el resto del cableado se lee. LO QUE NO
 * PRUEBA: el guardado contra la base real (hace falta una base desechable).
 */
import fs from 'fs';
import { fuente } from './_fuente';

//  El modulo de avisos importa `@/db` (escribe las notificaciones), y `@/db`
//  revienta al cargarse sin DATABASE_URL. Una direccion que no lleva a ninguna
//  base: nada de este banco puede escribir.
process.env.DATABASE_URL = 'postgres://banco:banco@127.0.0.1:1/banco_sin_base';

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
  const ESQ = fuente('src/db/schema/system.ts');

  console.log('\n0) Precondiciones\n');
  exige('el panel sigue calculando sus avisos con id, titulo, descripcion y enlace',
    /alertsDetails\.push\(\{/.test(PANEL) && /actionLink:/.test(PANEL) && /actionText:/.test(PANEL));
  exige('siguen existiendo los cinco tipos de aviso',
    ['invoice_rejected', 'check_due', 'periodos_por_agotarse', 'caja_sin_cerrar', 'declaracion_pendiente']
      .every((t) => new RegExp(`'${t}'`).test(PANEL)));

  let m: typeof import('../src/services/avisos/sincronizarAvisos') | null = null;
  try { m = await import('../src/services/avisos/sincronizarAvisos'); } catch { m = null; }

  console.log('\n1) La gravedad de cada aviso\n');
  ok('un comprobante rechazado es un error', !!m && m.severidadDeAviso('invoice_rejected') === 'error');
  ok('cheque, caja y declaracion son advertencias',
    !!m && m.severidadDeAviso('check_due') === 'warning' && m.severidadDeAviso('caja_sin_cerrar') === 'warning'
    && m.severidadDeAviso('declaracion_pendiente') === 'warning');
  ok('lo demas es informativo',
    !!m && m.severidadDeAviso('periodos_por_agotarse') === 'info' && m.severidadDeAviso('cualquier_cosa') === 'info');

  console.log('\n2) La tabla: identidad estable, entorno y cierre\n');
  ok('guarda el modo, la clave, el enlace y cuando se resolvio',
    /modo: environmentMode\('modo'\)/.test(ESQ) && /clave: varchar\('clave', \{ length: 120 \}\)\.notNull\(\)/.test(ESQ)
    && /actionLink: varchar\('action_link'/.test(ESQ) && /resolvedAt: timestamp\('resolved_at'\)/.test(ESQ));
  ok('UNA fila por empresa, modo y clave: no se duplica en cada calculo',
    /uniqueIndex\('notifications_clave_idx'\)\.on\(table\.companyId, table\.modo, table\.clave\)/.test(ESQ));
  ok('el aviso es de la empresa: el usuario pasa a opcional',
    /userId: uuid\('user_id'\)\.references\(\(\) => users\.id\),/.test(ESQ) && !/userId: uuid\('user_id'\)\.notNull\(\)/.test(ESQ));
  {
    const mig = fs.existsSync('drizzle/0010_avisos_guardados.sql') ? fs.readFileSync('drizzle/0010_avisos_guardados.sql', 'utf8') : '';
    ok('la migracion añade lo que faltaba y no borra nada',
      /ALTER TABLE "notifications" ALTER COLUMN "user_id" DROP NOT NULL;/.test(mig)
      && /ADD COLUMN "modo"/.test(mig) && /ADD COLUMN "clave" varchar\(120\) NOT NULL/.test(mig)
      && /ADD COLUMN "resolved_at"/.test(mig)
      && /CREATE UNIQUE INDEX "notifications_clave_idx"/.test(mig)
      && !/DROP TABLE|DROP COLUMN/.test(mig));
    ok('y esta en el diario de migraciones', /"tag": "0010_avisos_guardados"/.test(fs.readFileSync('drizzle/meta/_journal.json', 'utf8')));
  }

  console.log('\n3) Guardar y cerrar\n');
  {
    const SINC = leer('src/services/avisos/sincronizarAvisos.ts');
    //  Se acota al cuerpo de `sincronizarAvisos`: `avisosVivos` y `marcarLeidos`
    //  repiten las mismas condiciones y hacian pasar comprobaciones que no
    //  miraban lo que creian (tres mutantes lo cantaron).
    const guardar = SINC.slice(SINC.indexOf('export async function sincronizarAvisos'), SINC.indexOf('export async function avisosVivos'));
    ok('la clave del aviso es su id del panel, no una inventada',
      /clave: a\.id,/.test(guardar) && /const claves = avisos\.map\(\(a\) => a\.id\);/.test(guardar));
    ok('lo que ya existe se actualiza en vez de duplicarse',
      /\.onConflictDoUpdate\(\{\s*target: \[notifications\.companyId, notifications\.modo, notifications\.clave\],/.test(guardar));
    ok('un aviso que reaparece vuelve a estar vivo (dentro de la actualizacion, no solo al insertar)',
      /set: \{[\s\S]*?resolvedAt: null,[\s\S]*?\},/.test(guardar));
    ok('lo que ya no aparece se cierra SIEMPRE, acotado a la empresa y el modo',
      /(?:^|\n)\s{4}await db\s*\n\s*\.update\(notifications\)\s*\n\s*\.set\(\{ resolvedAt: new Date\(\), updatedAt: new Date\(\) \}\)/.test(guardar)
      && /notInArray\(notifications\.clave, claves\)/.test(guardar)
      && /eq\(notifications\.companyId, companyId\),\s*eq\(notifications\.modo, modo\),\s*isNull\(notifications\.resolvedAt\)/.test(guardar));
    ok('sin avisos vivos se cierran todos (una lista vacia no vale en SQL)',
      /claves\.length > 0 \? notInArray\(notifications\.clave, claves\) : undefined/.test(guardar));
    ok('guardar un aviso NUNCA puede tumbar el panel',
      /catch \(err: unknown\) \{/.test(SINC) && /Logger\.warn\('\[avisos\]/.test(SINC) && !/throw /.test(SINC));
    ok('el panel guarda lo que acaba de calcular',
      /await sincronizarAvisos\(session\.companyId, session\.modo, stats\.alertsDetails \?\? \[\]\);/.test(fuente('src/app/api/v1/dashboard/route.ts')));
  }

  console.log('\n4) La campana\n');
  {
    const RUTA = leer('src/app/api/v1/notifications/route.ts');
    ok('la ruta devuelve los avisos vivos de la empresa y el modo de la sesion, y cuantos sin leer',
      /avisosVivos\(session\.companyId, session\.modo\)/.test(RUTA) && /sinLeer: avisos\.filter\(\(a\) => !a\.readAt\)\.length/.test(RUTA));
    ok('marcar leido acepta unos avisos o todos', /marcarLeidos\(session\.companyId, session\.modo, parsed\.data\.ids\)/.test(RUTA));
    const SINC = leer('src/services/avisos/sincronizarAvisos.ts');
    //  Solo el cuerpo de `marcarLeidos`: `sincronizarAvisos` tambien filtra por
    //  empresa y modo, y sin acotar esas comprobaciones pasaban de balde.
    const marcar = SINC.includes('export async function marcarLeidos') ? SINC.slice(SINC.indexOf('export async function marcarLeidos')) : '';
    ok('marcar leido NO resuelve el aviso',
      /\.set\(\{ readAt: new Date\(\), updatedAt: new Date\(\) \}\)/.test(marcar) && !/resolvedAt:/.test(marcar));
    ok('los no leidos salen primero', /nulls first/.test(SINC));
    ok('marcar leido no toca los de otra empresa ni otro modo',
      /eq\(notifications\.companyId, companyId\),\s*eq\(notifications\.modo, modo\),\s*isNull\(notifications\.readAt\)/.test(marcar)
      && /ids && ids\.length > 0 \? inArray\(notifications\.id, ids\) : undefined/.test(marcar));
    const CAMPANA = leer('src/components/ui/campana-avisos.tsx');
    ok('la campana enseña el contador de no leidos y la lista',
      /'use client'/.test(CAMPANA) && /sinLeer > 0/.test(CAMPANA) && /fetch\('\/api\/v1\/notifications'\)/.test(CAMPANA));
    ok('al pulsar un aviso lo marca leido y lleva a su pantalla',
      /body: JSON\.stringify\(\{ ids: \[aviso\.id\] \}\)/.test(CAMPANA) && /router\.push\(aviso\.actionLink\)/.test(CAMPANA));
    ok('esta en la barra de arriba, en todas las pantallas',
      /<CampanaAvisos \/>/.test(fuente('src/app/dashboard/ClientLayout.tsx')));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
