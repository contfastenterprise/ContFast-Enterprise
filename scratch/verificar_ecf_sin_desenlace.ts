/**
 * Banco del lote 138: un comprobante que se queda sin veredicto no se lo dice
 * a nadie.
 *
 *     pnpm exec tsx scratch/verificar_ecf_sin_desenlace.ts
 *
 * EL HUECO. La DGII acepta o rechaza en decimas de segundo. Desde el lote 102
 * la propia factura persigue su veredicto con una escalera que alcanza unos 9
 * minutos (`services/dgii/escalera.ts`). Pasado eso NO QUEDA NADIE
 * PREGUNTANDO: el cron que barre los pendientes existe, pero necesita
 * `CRON_SECRET` en Vercel y en GitHub, y eso es configuracion del dueño, no
 * codigo. Mientras falte, no corre.
 *
 * Asi que un comprobante que no se resolvio en esos 9 minutos se queda como
 * esta, indefinidamente, y en la lista no se distingue de los demas: misma
 * fila, misma pinta, en la pagina que le toque.
 *
 * MEDIDO el 2026-09-15 contra la base (solo lectura,
 * `scratch/_to_delete/medir_ecf_estado.ts`): `E340000000002` llevaba 316 horas
 * -- 13 dias -- en `submitted`. Lo demas del nucleo fiscal salio limpio:
 * ningun NCF repetido, ninguna emitida sin NCF.
 *
 * LO QUE NO SE HACE, y es a proposito: NO se reenvia. Un `submitted` SI salio y
 * puede estar en la DGII esperando; reenviarlo duplicaria un comprobante
 * fiscal, y eso no se retira. El aviso lleva a la lista filtrada, donde ya
 * existe el boton de consultar estado uno a uno.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const STATS = 'src/app/api/v1/ecf/stats/route.ts';
const PANTALLA = 'src/app/dashboard/ecf/page.tsx';
const ESCALERA = 'src/services/dgii/escalera.ts';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
{
  //  La escalera existe y es finita: ese es el motivo del aviso.
  exige(fs.existsSync(ESCALERA), 'ya no existe la escalera de persecucion del veredicto');
  //  La pantalla ya sabe filtrar por estado, y 'submitted' es una de sus
  //  opciones: el boton del aviso se apoya en eso, no inventa una pantalla.
  const pant = codigo(PANTALLA);
  exige(/<option value="submitted">/.test(pant), 'la pantalla de e-CF ya no filtra por "submitted"');
  exige(/if \(filters\.status\) params\.set\('status', filters\.status\);/.test(pant),
        'la pantalla ya no manda el filtro de estado a la API');
  //  Y sigue sin ofrecer reenviar un 'submitted', que es lo que NO hay que
  //  hacer con uno atascado.
  exige(/\['rejected', 'signed', 'draft'\]\.includes\(inv\.status\)/.test(pant),
        'el boton de reenviar cambio de criterio: ojo, un `submitted` no se reenvia');
  //  Las estadisticas siguen siendo del periodo que se mira: por eso el conteo
  //  de atascados tiene que ir aparte, sin fechas.
  exige(/gte\(invoices\.createdAt, from\),/.test(codigo(STATS)),
        'las estadisticas de e-CF ya no filtran por periodo');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LA API CUENTA LOS QUE SE QUEDARON SIN DESENLACE');
// ─────────────────────────────────────────────────────────────────────────
{
  const src = codigo(STATS);
  ok('los cuenta, y los devuelve',
     /sinDesenlace: \{/.test(src)
     && /total: atascadosTotal,/.test(src)
     && /horasDelMasViejo:/.test(src));
  ok('cuenta `signed` y `submitted`; `draft` no, que aun no es comprobante',
     /inArray\(invoices\.status, \['signed', 'submitted'\]\)/.test(src));
  ok('con un umbral en horas, no a ojo',
     /const HORAS_SIN_DESENLACE = \d+;/.test(src)
     && /HORAS_SIN_DESENLACE \* 60 \* 60 \* 1000/.test(src)
     && /lte\(invoices\.createdAt, limite\)/.test(src));
  //  La propiedad que mas importa: el conteo NO puede heredar el periodo, o el
  //  atascado desaparece del aviso justo cuando mas tiempo lleva atascado.
  ok('y SIN el filtro de fechas del resto de estadisticas',
     !/baseConditions[\s\S]{0,40}inArray\(invoices\.status, \['signed', 'submitted'\]\)/.test(src)
     && /\.where\(and\([\s\S]{0,400}inArray\(invoices\.status, \['signed', 'submitted'\]\),[\s\S]{0,120}lte\(invoices\.createdAt, limite\)/.test(src));
  ok('sigue mirando solo la empresa y el entorno de quien pregunta',
     /\.where\(and\([\s\S]{0,200}eq\(invoices\.companyId, auth\.companyId\),[\s\S]{0,120}eq\(invoices\.modo, auth\.modo\),[\s\S]{0,200}inArray\(invoices\.status, \['signed', 'submitted'\]\)/.test(src));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. Y LA PANTALLA LO DICE');
// ─────────────────────────────────────────────────────────────────────────
{
  const src = codigo(PANTALLA);
  ok('el tipo de las estadisticas trae el dato',
     /sinDesenlace\?: \{ total: number; horasDelMasViejo: number; umbralHoras: number \};/.test(src));
  ok('el aviso solo sale si hay alguno',
     /\(stats\?\.sinDesenlace\?\.total \?\? 0\) > 0/.test(src));
  ok('dice cuantos son y cuanto lleva el mas antiguo',
     /sinDesenlace!\.total\} comprobante/.test(src)
     && /sinDesenlace!\.horasDelMasViejo\} h/.test(src));
  //  Y lleva a mirarlos, no a reenviarlos.
  ok('el boton filtra la lista, y vuelve a la pagina 1',
     /setFilters\(\(f\) => \(\{ \.\.\.f, status: 'submitted' \}\)\); setPage\(1\);/.test(src));
  //  "No reenvia" es una negacion, y antes de este lote seria cierta de balde
  //  porque el aviso no existia. Va pegada a la marca del estado posterior: el
  //  aviso TIENE que estar, y dentro no puede haber un reenvio.
  ok('y no reenvia nada desde el aviso',
     /sinDesenlace/.test(src) && !/sinDesenlace[\s\S]{0,1200}handleResubmit/.test(src));
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
