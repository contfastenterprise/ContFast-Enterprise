/**
 * Lote 199 -- lo que corre despues de responder tiene que sobrevivir a la respuesta.
 *
 * DE DONDE SALE
 * -------------
 * El dueño reporto el 2026-09-25 que los avisos no le llegaban por WhatsApp. Tras
 * arreglar dos cosas por el camino (el 196: el motivo del rechazo; el 197: la causa
 * del 500 del panel), el 2026-09-26 quedaba un silencio que no cuadraba:
 *
 *   · En PRODUCCION los 7 avisos vigentes seguian **sin marca de envio**.
 *   · Y en los registros no habia **ni una** linea `[avisos-whatsapp]`. Ni de exito ni
 *     de fallo. El dueño lo confirmo buscando en el panel de Vercel: "no me sale nada".
 *   · En LOCAL, esas mismas lineas si salian (con su 422 por falta de plantilla).
 *
 * Medido para descartar lo demas antes de mirar el mecanismo:
 *   · `sincronizarAvisos` SI habia corrido (las filas quedaron tocadas al abrir el
 *     panel), asi que la ruta llegaba hasta el final.
 *   · El numero de la empresa esta configurado y `normalizarNumero` lo acepta
 *     ("valido", se mandaria) -- ese camino tambien devuelve lista vacia en silencio.
 *   · `clavesYaMandadasPorWhatsApp` solo cuenta las que tienen marca (1), y
 *     `seMandaPorWhatsApp` acepta `invoice_rejected` y `declaracion_pendiente`. Los
 *     cuatro avisos de PRODUCCION calificaban.
 *
 * LA CAUSA: `void enviarAvisosPendientes(...)`. En una maquina de desarrollo el
 * proceso sigue vivo y la tarea termina; **en serverless Vercel congela la funcion en
 * cuanto se devuelve la respuesta**, asi que la peticion a Kapso se cortaba a medias y
 * ni sus lineas de registro se volcaban. Un envio que no ocurre y que tampoco se queja.
 *
 * LA CURA: `after()` de `next/server`, que es lo que `void` prometia -- corre despues
 * de responder, pero manteniendo la funcion viva. Sin dependencias nuevas
 * (`@vercel/functions` no esta instalado).
 *
 * Y UN TRINQUETE: este banco barre TODAS las rutas de API buscando el patron, porque
 * el proximo `void` no va a avisar tampoco. Medido: hoy no hay ninguno.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const RUTA = 'src/app/api/v1/dashboard/route.ts';

/** Todos los `route.ts` de la API. */
function rutasDeApi(dir = 'src/app/api'): string[] {
  const absoluto = join(raiz, dir);
  if (!existsSync(absoluto)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(absoluto)) {
    const relativo = `${dir}/${entrada}`;
    if (statSync(join(raiz, relativo)).isDirectory()) salida.push(...rutasDeApi(relativo));
    else if (entrada === 'route.ts' || entrada === 'route.tsx') salida.push(relativo);
  }
  return salida;
}

async function main() {
  const ruta = leer(RUTA);

  //  PRECONDICIONES, ciertas en los DOS estados.
  if (ruta === '') throw new Error('Precondicion: no esta la ruta del panel');
  if (!/enviarAvisosPendientes/.test(ruta)) {
    throw new Error('Precondicion: la ruta del panel ya no manda los avisos');
  }
  //  El envio va DESPUES de sincronizar, que es cuando se sabe cual es nuevo (lote
  //  178). Eso no lo cambia este lote, pero si se invirtiera, el envio mandaria cosas
  //  que la sincronizacion todavia no ha cerrado.
  const codigo = sinComentarios(ruta);
  if (codigo.indexOf('sincronizarAvisos(') > codigo.indexOf('enviarAvisosPendientes(')) {
    throw new Error('Precondicion: el envio ya no va despues de sincronizar');
  }
  const todas = rutasDeApi();
  if (todas.length < 50) throw new Error(`Precondicion: solo ${todas.length} rutas de API; se esperaban muchas mas`);
  //  Las dos garantias del lote 178, que este lote no toca: el envio NO LANZA (avisar
  //  de un problema no puede convertirse en un problema) y marca solo lo que SALIO (un
  //  fallo de red se reintenta en la siguiente carga en vez de perderse). Si alguna se
  //  fuera, este banco se niega a correr en vez de dar un FALLA suave.
  const envio = leer('src/services/avisos/enviarAvisosPendientes.ts');
  if (!/catch \(err: unknown\)/.test(envio) || !/return 0;/.test(envio)) {
    throw new Error('Precondicion: el envio de avisos ya puede lanzar y tumbar el panel');
  }
  if (!/marcarMandadasPorWhatsApp\(companyId, modo, salieron\)/.test(envio)) {
    throw new Error('Precondicion: ya no se marca solo lo que salio');
  }
  console.log(`  pre   el envio no lanza, marca solo lo que salio y va despues de sincronizar · ${todas.length} rutas de API a barrer`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) La tarea sobrevive a la respuesta\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('el envio de avisos se programa con `after`',
    /after\(\(\) => enviarAvisosPendientes\(/.test(codigo));
  ok('  importado de next/server, sin dependencias nuevas',
    /import \{ NextRequest, NextResponse, after \} from 'next\/server'/.test(ruta)
    && !/@vercel\/functions/.test(ruta));
  //  NEGATIVA ATADA AL POSITIVO: "no hay void" seria cierto de balde en un fichero que
  //  no mandara nada.
  ok('  y ya no se lanza sin esperar (`void`), que en serverless no termina',
    /after\(\(\) => enviarAvisosPendientes\(/.test(codigo)
    && !/void enviarAvisosPendientes\(/.test(codigo));
  //  LO QUE NO SE PUEDE PERDER: el panel no debe esperar a WhatsApp. `after` corre
  //  DESPUES de responder; si alguien lo cambiara por un `await` delante del
  //  `NextResponse.json`, el panel volveria a pagar el plazo de 8 s por aviso.
  const dondeAfter = codigo.indexOf('after(() => enviarAvisosPendientes');
  //  LA RESPUESTA DE EXITO, no la primera del fichero: antes hay dos
  //  `return NextResponse.json` de las guardas (401 y 403), y buscando la primera la
  //  comprobacion daba FALLA por el orden de unas guardas que no tienen nada que ver.
  const dondeRespuesta = dondeAfter > -1 ? codigo.indexOf('return NextResponse.json', dondeAfter) : -1;
  ok('el panel sigue respondiendo sin esperar a WhatsApp',
    dondeAfter > -1 && dondeRespuesta > dondeAfter
    && !/await enviarAvisosPendientes\(/.test(codigo),
    `after en ${dondeAfter}, respuesta de exito en ${dondeRespuesta}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) TRINQUETE: ninguna ruta lanza y se olvida\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  El proximo `void` tampoco va a avisar: no falla, no se registra, y el trabajo
  //  simplemente no ocurre. Por eso se barren todas las rutas y no solo esta.
  //
  //  Se busca `void <algo>(`, que es la forma de "lanzar y olvidar" en este
  //  repositorio. `void 0` o `void` sobre algo que no es una llamada no cuentan.
  const culpables: string[] = [];
  for (const r of todas) {
    const c = sinComentarios(leer(r));
    for (const m of c.matchAll(/\bvoid\s+([A-Za-z_$][\w$.]*)\s*\(/g)) {
      culpables.push(`${r} → void ${m[1]}(`);
    }
  }
  ok('ninguna ruta de API lanza una tarea sin esperarla',
    culpables.length === 0,
    culpables.slice(0, 3).join(' · ') || `${todas.length} rutas barridas`);

  //  Y el mismo barrido sobre los servicios que las rutas llaman: un `void` alli tiene
  //  el mismo efecto, porque corre dentro de la misma funcion serverless.
  //
  //  DOS CASOS TOLERADOS, anotados a proposito y con su motivo:
  //   · `documentService.saveTemporaryFile` barre los ficheros viejos con
  //     `void this.barrerViejos()` (lote 183): si ese barrido no termina no se pierde
  //     nada -- lo unico que pasa es que un PDF temporal vive una hora mas, y el
  //     siguiente guardado lo intenta otra vez.
  //   · `queue.ts` usa `void` en su camino de respaldo, que es sincrono en la practica.
  const TOLERADOS = ['barrerViejos', 'triggerFallback'];
  const enServicios: string[] = [];
  const barrer = (dir: string) => {
    const absoluto = join(raiz, dir);
    if (!existsSync(absoluto)) return;
    for (const entrada of readdirSync(absoluto)) {
      const relativo = `${dir}/${entrada}`;
      if (statSync(join(raiz, relativo)).isDirectory()) barrer(relativo);
      else if (entrada.endsWith('.ts')) {
        const c = sinComentarios(leer(relativo));
        for (const m of c.matchAll(/\bvoid\s+(?:this\.)?([A-Za-z_$][\w$.]*)\s*\(/g)) {
          if (!TOLERADOS.includes(m[1]!)) enServicios.push(`${relativo} → void ${m[1]}(`);
        }
      }
    }
  };
  barrer('src/services');
  //  ATADO A LA MARCA DE ESTE LOTE. Como trinquete, esto es verdad antes y despues
  //  (ningun servicio tenia un `void` nuevo), asi que solo sobrevivia a la
  //  contraprueba. Su valor es hacia el futuro; se exige ademas que la cura de este
  //  lote este puesta, para que el banco no regale un OK en un arbol sin arreglar.
  ok('  ni los servicios que ellas llaman, salvo los dos casos anotados',
    /after\(\(\) => enviarAvisosPendientes\(/.test(codigo) && enServicios.length === 0,
    enServicios.slice(0, 3).join(' · ') || 'ninguno nuevo');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Lo que este lote NO cambia, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  LAS DOS GARANTIAS DEL LOTE 178 -- que el envio no pueda tumbar el panel y que
  //  marque solo lo que SALIO -- van de PRECONDICION, arriba: son verdad antes y
  //  despues de este lote, asi que como comprobaciones regalaban un OK en la
  //  contraprueba. Lo que este lote cambia es que el envio llegue a TERMINAR.
  console.log('  (que no lance y que marque solo lo que salio: de precondicion, arriba)');

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
