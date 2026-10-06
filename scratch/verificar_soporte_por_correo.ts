/**
 * Lote 288 -- el ticket de Soporte sale por correo, y la pantalla deja de fingirlo.
 *
 * Antes: `support/page.tsx` esperaba 1,2 s con un `setTimeout`, decia "Ticket de soporte
 * creado" y no mandaba nada. Ahora la pantalla pide a `POST /api/v1/support/tickets`, que
 * manda el ticket por el SMTP de siempre (`utils/mailer.ts`) al CORREO DE LA EMPRESA de la
 * sesion (Configuracion > Empresa, `companies.email`) y lo deja en `system_email_logs`
 * (lote 157). Primero el destino era una variable de entorno, `SOPORTE_CORREO`; el dueño
 * lo cambio el mismo dia al correo de la empresa.
 *
 * LOTE 308: el destino pasa al buzon de soporte de ContFast (`CORREO_DE_SOPORTE`,
 * contfastenterprise@gmail.com). Las comprobaciones del destino se REESCRIBEN, no se borran:
 * las que decian "sin correo de empresa no sale" dicen ahora que sale igual, a soporte.
 *
 * Lo que se EJECUTA, sin mandar un solo correo de verdad ni tocar ninguna base:
 *  · `enviarTicketDeSoporte` con el transporte, el registro y los datos del usuario
 *    SUSTITUIDOS (son dependencias inyectadas);
 *  · `validarTicket`, `escaparHtml`, `fechaYHoraRD`, `identificadorDeTicket`;
 *  · `checkRateLimit` con el preset `soporte` y Redis ausente (como en produccion);
 *  · la accion de la pantalla (`enviarTicket`) contra un `fetch` sustituido.
 * El cableado de la ruta y de la pagina se mira en su texto.
 *
 * Se ejecuta con: npx tsx scratch/verificar_soporte_por_correo.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

delete process.env.REDIS_URL; // el limitador tiene que decidir SIN Redis, como en produccion

const raiz = resolve(__dirname, '..');
const leer = (r: string) => (existsSync(resolve(raiz, r)) ? readFileSync(resolve(raiz, r), 'utf8') : '');
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
async function intenta(t: string, f: () => boolean | Promise<boolean>) {
  try { ok(t, await f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
}
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const RUTA_API = 'src/app/api/v1/support/tickets/route.ts';
const PAGINA = 'src/app/dashboard/support/page.tsx';
const SOPORTE = 'contfastenterprise@gmail.com'; // el buzon de soporte de ContFast (lote 308)
const CORREO_EMPRESA = 'ventas@latindoors.test'; // el de Configuracion > Empresa: ya NO es el destino

const TICKET = {
  subject: 'No sale la <b>factura</b>',
  category: 'billing',
  message: 'Al emitir sale un error.\n<img src=x onerror="alert(1)"> & "comillas"',
};
const SESION = { userId: 'u-1', companyId: 'c-1', modo: 'PRUEBA' as const };
//  01:30 UTC del 5 = 21:30 del 4 en RD: el dia de UTC y el de RD NO coinciden a proposito.
const AHORA = new Date('2026-10-05T01:30:00Z');

/** Dependencias de mentira que apuntan todo lo que les piden. */
function falsas(opc: { correoEmpresa?: string | null; smtpFalla?: Error; registroFalla?: boolean } = {}) {
  const mandados: AnyRec[] = [];
  const registrados: AnyRec[] = [];
  const deps = {
    mandar: async (m: AnyRec) => { mandados.push(m); if (opc.smtpFalla) throw opc.smtpFalla; return { messageId: '<abc@smtp>' }; },
    registrar: async (f: AnyRec) => { registrados.push(f); if (opc.registroFalla) throw new Error('la base no contesta'); },
    //  Lote 308: aunque quien escribe traiga el correo de su empresa (como hasta el 288), el
    //  destino no lo mira. Se sigue pasando para que un mutante que vuelva a usarlo se vea.
    quienEscribe: async () => ({ nombre: 'Ana <Pérez>', correo: 'ana@latindoors.test', empresa: 'Latin Doors & Co',
      correoEmpresa: opc.correoEmpresa === undefined ? CORREO_EMPRESA : opc.correoEmpresa }),
    remitente: () => '"ContFast Soporte" <no-reply@contfast.test>',
    ahora: () => AHORA,
    bytes: () => new Uint8Array([0, 1, 2, 3, 4, 31]),
  };
  return { deps, mandados, registrados };
}

//  UN BANCO COLGADO NO PUEDE PARECER VERDE (lote 236): si un mutante deja una promesa sin
//  resolver, el intervalo del limitador mantiene vivo el proceso y nadie llega al final.
const vigia = setTimeout(() => { console.log(' FALLA  el banco no llego al final en 60 s (colgado)'); process.exit(1); }, 60_000);

async function main() {
  const S: AnyRec | null = existsSync(resolve(raiz, 'src/services/soporte/enviarTicketDeSoporte.ts'))
    ? await import('../src/services/soporte/enviarTicketDeSoporte') : null;
  const T: AnyRec | null = existsSync(resolve(raiz, 'src/services/soporte/ticketDeSoporte.ts'))
    ? await import('../src/services/soporte/ticketDeSoporte') : null;
  const P: AnyRec | null = existsSync(resolve(raiz, 'src/app/dashboard/support/enviarTicket.ts'))
    ? await import('../src/app/dashboard/support/enviarTicket') : null;
  const L: AnyRec = await import('../src/middleware/rateLimiter');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) El envio (ejecutado, con el transporte sustituido)\n');
  const E1 = [
    'el destino es el buzon de soporte de ContFast (no el de la empresa), y el correo sale UNA vez',
    'el Reply-To es el correo del usuario (no el remitente del sistema)',
    'el correo lleva el identificador, la empresa, el usuario y la fecha en hora de RD',
    'lo que escribe el usuario va ESCAPADO en el HTML (ni <img> ni <b> vivos)',
    'el asunto lleva el identificador y la empresa',
    'empresa SIN correo: el ticket sale igual, a soporte, y queda registrado',
    'con el correo de la empresa mal escrito, igual: sale a soporte',
    'el correo enviado queda REGISTRADO: contexto soporte, referencia el ticket, enviado, con modo y usuario',
    'SMTP caido: dice que NO salio, con el motivo, y no da el ticket por enviado',
    '  y el fallo tambien queda registrado, sin fecha de envio',
    'un fallo al REGISTRAR no convierte un correo que salio en un fallo',
  ];
  if (!S) for (const t of E1) ok(t, false, 'no existe enviarTicketDeSoporte.ts');
  else {
    const bien = falsas();
    const r = await S.enviarTicketDeSoporte(TICKET, SESION, bien.deps);
    const m = bien.mandados[0] ?? {};
    await intenta(E1[0], () => r.enviado === true && bien.mandados.length === 1 && m.to === SOPORTE && m.to !== CORREO_EMPRESA);
    await intenta(E1[1], () => m.replyTo === 'ana@latindoors.test' && !String(m.from).includes('ana@'));
    await intenta(E1[2], () => /^SOP-[A-HJ-NP-Z2-9]{6}$/.test(r.id)
      && m.text.includes(r.id) && m.text.includes('Latin Doors & Co') && m.text.includes('ana@latindoors.test')
      && m.text.includes('04-10-2026 21:30') && m.html.includes('04-10-2026 21:30') && m.text.includes('Facturación e-CF'));
    await intenta(E1[3], () => !/<img/i.test(m.html) && m.html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
      && !m.html.includes('<b>factura') && m.html.includes('&lt;b&gt;factura') && m.html.includes('Latin Doors &amp; Co')
      && m.html.includes('Ana &lt;Pérez&gt;'));
    await intenta(E1[4], () => m.subject.startsWith(`[Soporte ${r.id}] Latin Doors & Co`));

    const sinVar = falsas({ correoEmpresa: null });
    const r2 = await S.enviarTicketDeSoporte(TICKET, SESION, sinVar.deps);
    await intenta(E1[5], () => r2.enviado === true && sinVar.mandados.length === 1
      && sinVar.mandados[0].to === SOPORTE && sinVar.registrados.length === 1);
    //  Cuatro formas de "mal escrito" que la regla del lote 201 rechaza.
    const malos = ['ventas arroba latindoors', 'ventas@latindoors', 'a@b.com c@d.com', '   '];
    let mandadosMalos = 0;
    let todosRechazados = true;
    for (const correoEmpresa of malos) {
      const mala = falsas({ correoEmpresa });
      const r3 = await S.enviarTicketDeSoporte(TICKET, SESION, mala.deps);
      mandadosMalos += mala.mandados.filter((x) => x.to === SOPORTE).length;
      todosRechazados = todosRechazados && r3.enviado === true;
    }
    //  (`todosRechazados` conserva el nombre de antes: ahora significa "todos salieron".)
    await intenta(E1[6], () => todosRechazados && mandadosMalos === malos.length);

    const f = bien.registrados[0] ?? {};
    await intenta(E1[7], () => bien.registrados.length === 1 && f.context === 'soporte' && f.referenceId === r.id
      && f.status === 'sent' && f.toEmail === SOPORTE && f.companyId === 'c-1' && f.userId === 'u-1' && f.modo === 'PRUEBA'
      && f.providerMessageId === '<abc@smtp>' && f.sentAt instanceof Date);

    const caido = falsas({ smtpFalla: new Error('connect ECONNREFUSED 127.0.0.1:587') });
    const r4 = await S.enviarTicketDeSoporte(TICKET, SESION, caido.deps);
    await intenta(E1[8], () => r4.enviado === false && r4.codigo === 'ERROR_DE_ENVIO' && /ECONNREFUSED/.test(r4.mensaje) && !/enviado/i.test(r4.mensaje));
    const fc = caido.registrados[0] ?? {};
    await intenta(E1[9], () => caido.registrados.length === 1 && fc.status === 'failed' && /ECONNREFUSED/.test(fc.errorMessage ?? '') && fc.sentAt === null);

    const sinRegistro = falsas({ registroFalla: true });
    const r5 = await S.enviarTicketDeSoporte(TICKET, SESION, sinRegistro.deps);
    await intenta(E1[10], () => r5.enviado === true && sinRegistro.mandados.length === 1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) Lo que se acepta (ejecutado)\n');
  const E2 = [
    'un ticket correcto pasa, recortado',
    'asunto vacio, asunto de dos lineas o asunto de mas de 120: no',
    'descripcion corta o de mas de 4000: no',
    'una categoria que no es de la lista: no',
    'escaparHtml escapa los cinco caracteres',
    'el identificador sale del alfabeto sin 0/O ni 1/I',
  ];
  if (!T) for (const t of E2) ok(t, false, 'no existe ticketDeSoporte.ts');
  else {
    const v = (c: unknown) => T.validarTicket(c);
    await intenta(E2[0], () => { const r = v({ subject: '  Hola mundo ', category: 'cash', message: '  Una descripcion larga  ' }); return r.bien && r.ticket.subject === 'Hola mundo' && r.ticket.message === 'Una descripcion larga'; });
    await intenta(E2[1], () => !v({ ...TICKET, subject: '' }).bien && !v({ ...TICKET, subject: 'Hola\r\nBcc: x@y.z' }).bien && !v({ ...TICKET, subject: 'x'.repeat(121) }).bien && v({ ...TICKET, subject: 'x'.repeat(120) }).bien);
    await intenta(E2[2], () => !v({ ...TICKET, message: 'corto' }).bien && !v({ ...TICKET, message: 'x'.repeat(4001) }).bien && v({ ...TICKET, message: 'x'.repeat(4000) }).bien);
    await intenta(E2[3], () => !v({ ...TICKET, category: 'hack' }).bien && !v({ subject: 'abc', message: 'x'.repeat(20) }).bien && !v(null).bien);
    await intenta(E2[4], () => T.escaparHtml(`<a href="x">'&'</a>`) === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    await intenta(E2[5], () => T.identificadorDeTicket(new Uint8Array([0, 8, 13, 22, 23, 31])) === 'SOP-AJPYZ9');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) La ruta\n');
  const ruta = leer(RUTA_API);
  const permisos = leer('src/tests/permisosRutas.vitest.ts');
  ok('existe POST /api/v1/support/tickets y exige sesion (401 sin ella)',
    /export async function POST/.test(ruta) && /const session = await verifyAuth\(req\);\s*if \(!session\) \{[\s\S]{0,120}status: 401/.test(ruta));
  ok('valida el cuerpo con validarTicket y contesta 400 con el motivo',
    /const valido = validarTicket\(cuerpo\);\s*if \(!valido\.bien\) \{[\s\S]{0,160}status: 400/.test(ruta));
  ok('limita por USUARIO con el preset soporte, antes de mandar',
    /checkRateLimit\(`soporte:\$\{session\.userId\}`, 'soporte'\)/.test(ruta)
    && ruta.indexOf("'soporte')") > -1 && ruta.indexOf("'soporte')") < ruta.indexOf('enviarTicketDeSoporte(valido'));
  ok('empresa, usuario y modo salen de la SESION (nunca del cuerpo)',
    /enviarTicketDeSoporte\(valido\.ticket, \{\s*userId: session\.userId,\s*companyId: session\.companyId,\s*modo: session\.modo,/.test(ruta)
    && !/(body|cuerpo|valido\.ticket)\.(companyId|userId)/.test(ruta));
  ok('solo un ticket enviado da 201; un fallo del SMTP 502, y ya no hay 409 por falta de correo de empresa',
    /if \(r\.enviado\) \{\s*return NextResponse\.json\(\{ success: true, data: \{ id: r\.id \} \}, \{ status: 201 \}\);/.test(ruta)
    && /\{ status: 502 \}/.test(ruta) && !/SIN_CORREO_DE_EMPRESA|409/.test(ruta));
  ok('va en ABIERTAS_A_PROPOSITO (sin permiso de modulo a proposito), no en PENDIENTES',
    /^\s*'v1\/support\/tickets\/route\.ts': '[^']+',/m.test(permisos.slice(permisos.indexOf('ABIERTAS_A_PROPOSITO')))
    && !/new Set\(\[[\s\S]*'v1\/support\/tickets\/route\.ts'[\s\S]*\]\)/.test(permisos.slice(0, permisos.indexOf('ABIERTAS_A_PROPOSITO'))));
  const envio = leer('src/services/soporte/enviarTicketDeSoporte.ts');
  const reglas = leer('src/services/soporte/ticketDeSoporte.ts');
  ok('el destino es CORREO_DE_SOPORTE = contfastenterprise@gmail.com (lote 308)',
    /export const CORREO_DE_SOPORTE = 'contfastenterprise@gmail\.com';/.test(reglas)
    && /const destino = CORREO_DE_SOPORTE;/.test(envio));
  ok('  y ya no se lee companies.email para el ticket',
    /const destino = CORREO_DE_SOPORTE;/.test(envio) && !/companies\.email/.test(envio) && !/correoEmpresa/.test(envio + reglas));
  ok('  y ninguna variable de entorno decide el destino (SOPORTE_CORREO, descartada)',
    reglas !== '' && !/env\.SOPORTE_CORREO|env\[['"]SOPORTE_CORREO/.test(reglas + envio + ruta));

  console.log('\n4) El limite de frecuencia (ejecutado, sin Redis)\n');
  await intenta('con Redis ausente el preset soporte NO se abre: cinco tickets si, el sexto no (10 minutos), y otro usuario sigue pudiendo', async () => {
    const r: boolean[] = [];
    for (let i = 0; i < 6; i++) r.push(await L.checkRateLimit('soporte:banco-u1', 'soporte'));
    //  Y el tope es de CADA usuario: otro sigue pudiendo. Va en la misma comprobacion
    //  porque, sola, era cierta de balde antes del lote (sin freno todo pasa).
    const otro = await L.checkRateLimit('soporte:banco-u2', 'soporte');
    return r.slice(0, 5).every(Boolean) && r[5] === false && otro && L.RATE_LIMIT_PRESETS.soporte?.windowSeconds === 600;
  });
  invariante('el preset standard sigue abierto sin Redis (no se toca el resto de la API)',
    await (async () => { const r: boolean[] = []; for (let i = 0; i < 600; i++) r.push(await L.checkRateLimit('banco-std', 'standard')); return r.every(Boolean); })());

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) La pantalla (la accion ejecutada contra un fetch sustituido)\n');
  const pagina = leer(PAGINA);
  ok('ya no simula: ni setTimeout ni "Ticket de soporte creado"', !/setTimeout/.test(pagina) && !/Ticket de soporte creado/.test(pagina));
  ok('el envio pasa por enviarTicket con la guarda en un useRef', /const enCurso = useRef\(false\);/.test(pagina)
    && /await enviarTicket\(\{ subject, category, message \}, \{[\s\S]*?enCurso,/.test(pagina));
  ok('lo escrito SOLO se borra dentro de alEnviar', (() => {
    const i = pagina.indexOf('alEnviar: (id) => {');
    const j = pagina.indexOf('alFallar:', i);
    const fuera = pagina.slice(0, i) + pagina.slice(j);
    return i > -1 && j > i && /setSubject\(''\);\s*setMessage\(''\);/.test(pagina.slice(i, j)) && !/setSubject\(''\)|setMessage\(''\)/.test(fuera);
  })());
  ok('el boton dice "Enviando..." mientras va', /\{submitting \? 'Enviando\.\.\.' : 'Enviar Mensaje'\}/.test(pagina));

  const E5 = [
    'pide POST a /api/v1/support/tickets con lo escrito',
    'con el ticket enviado, alEnviar recibe el identificador',
    'DOBLE CLIC: una sola peticion; la segunda se ignora',
    'un 409 dice el motivo del servidor y NO llama a alEnviar (lo escrito se conserva)',
    'un 502 con la pagina de error en HTML: fallo con el estado, no "creado"',
    'sin red: lo dice, y la guarda se suelta para poder reintentar',
  ];
  if (!P) for (const t of E5) ok(t, false, 'no existe support/enviarTicket.ts');
  else {
    const prueba = (respuestas: Array<() => Promise<Response>>) => {
      const pedidas: AnyRec[] = [];
      const eventos: string[] = [];
      let n = 0;
      const acciones = {
        pedir: (async (url: string, init: AnyRec) => { pedidas.push({ url, init }); return respuestas[Math.min(n++, respuestas.length - 1)](); }) as unknown as typeof fetch,
        enCurso: { current: false },
        alCambiarEnvio: (b: boolean) => eventos.push(b ? 'enviando' : 'listo'),
        alEnviar: (id: string) => eventos.push(`enviado ${id}`),
        alFallar: (m: string) => eventos.push(`fallo ${m}`),
      };
      return { acciones, pedidas, eventos };
    };
    const json = (estado: number, cuerpo: unknown) => async () => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
    const campos = { subject: 'Asunto', category: 'cash', message: 'Mensaje largo de prueba' };

    const a = prueba([json(201, { success: true, data: { id: 'SOP-ABCDEF' } })]);
    const d1 = await P.enviarTicket(campos, a.acciones);
    await intenta(E5[0], () => a.pedidas.length === 1 && a.pedidas[0].url === '/api/v1/support/tickets'
      && a.pedidas[0].init.method === 'POST' && JSON.stringify(JSON.parse(a.pedidas[0].init.body)) === JSON.stringify(campos));
    await intenta(E5[1], () => d1 === 'enviado' && a.eventos.join('|') === 'enviando|enviado SOP-ABCDEF|listo');

    let soltar: (r: Response) => void = () => {};
    const b = prueba([() => new Promise<Response>((res) => { soltar = res; })]);
    const p1 = P.enviarTicket(campos, b.acciones);
    const p2 = P.enviarTicket(campos, b.acciones);
    soltar(new Response(JSON.stringify({ success: true, data: { id: 'SOP-UNOUNO' } }), { status: 201 }));
    const [x1, x2] = await Promise.all([p1, p2]);
    await intenta(E5[2], () => b.pedidas.length === 1 && x1 === 'enviado' && x2 === 'ignorado');

    const SIN = 'Tu empresa no tiene un correo configurado en Configuración > Empresa.';
    const c = prueba([json(409, { success: false, error: { message: SIN } })]);
    const d3 = await P.enviarTicket(campos, c.acciones);
    await intenta(E5[3], () => d3 === 'fallo' && c.eventos.includes(`fallo ${SIN}`) && !c.eventos.some((e) => e.startsWith('enviado')));

    const dd = prueba([async () => new Response('<html>Bad Gateway</html>', { status: 502 })]);
    const d4 = await P.enviarTicket(campos, dd.acciones);
    await intenta(E5[4], () => d4 === 'fallo' && dd.eventos.some((e) => /^fallo .*502/.test(e)) && !dd.eventos.some((e) => e.startsWith('enviado')));

    const e = prueba([async () => { throw new TypeError('Failed to fetch'); }, json(201, { success: true, data: { id: 'SOP-OTROOO' } })]);
    const d5 = await P.enviarTicket(campos, e.acciones);
    const d6 = await P.enviarTicket(campos, e.acciones);
    await intenta(E5[5], () => d5 === 'fallo' && e.eventos[1].startsWith('fallo No se pudo conectar') && e.acciones.enCurso.current === false
      && e.eventos[2] === 'listo' && d6 === 'enviado' && e.pedidas.length === 2);
  }

  console.log('\n6) Lo que no cambia (invariantes)\n');
  invariante('la pantalla conserva sus cuatro categorias y su cabecera',
    ['value="billing"', 'value="cash"', 'value="bank"', 'value="account"', 'titulo="Soporte y Centro de Ayuda"'].every((x) => pagina.includes(x)));
  invariante('las facturas siguen saliendo por sendEmailJob con el mismo transporte (getTransporter)',
    /const \{ getTransporter \} = await import\('@\/utils\/mailer'\);/.test(leer('src/infrastructure/jobRunners.ts')));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); }).finally(() => clearTimeout(vigia));
