/**
 * Banco del lote 101: la sesion con mSeller se comparte de verdad.
 *
 *     pnpm exec tsx scratch/verificar_sesion_compartida.ts
 *
 * EL FALLO
 * --------
 * `MSellerClient` guardaba el token 50 minutos en `this.tokenCache`, un campo
 * de INSTANCIA. Y cada emision hace `new MSellerClient(...)`. Instancia nueva,
 * caché vacío: el caché estaba escrito, comentado y pensado, y no acertaba
 * NUNCA. Cada factura pagaba una autenticacion entera contra mSeller antes de
 * mandar el comprobante.
 *
 * En caja, con clientes en fila, eso es un viaje de ida y vuelta muerto en cada
 * venta. La misma historia en `sessionCookieCache`, la del portal.
 *
 * POR QUE ESTE BANCO SI EJECUTA
 * -----------------------------
 * Los otros bancos leen el fuente porque lo que fijan es la FORMA del codigo.
 * Aqui lo que hay que fijar es COMPORTAMIENTO -- que la segunda llamada no pida
 * token, que cinco a la vez pidan uno solo, que una contraseña distinta no
 * reutilice nada -- y eso se comprueba corriendolo. La parte A corre el modulo
 * de verdad, con una autenticacion de mentira que cuenta cuantas veces la
 * llaman. La parte B si mira el fuente, porque tocar mSeller de verdad pediria
 * red y credenciales.
 *
 * EL MODULO SE CARGA A MANO, Y A PROPOSITO
 * ----------------------------------------
 * `sesionMseller` lo CREA este lote. Con un `import` normal arriba, la
 * contraprueba -- correr este mismo banco sobre los fuentes sin tocar -- moria
 * al cargar con "Cannot find module" antes de comprobar nada. Reventar no es
 * fallar: una contraprueba tiene que enseñar que falla CADA comprobacion, no
 * que el fichero no arranca. Por eso se carga dentro, y si no esta, la parte A
 * entera se reporta como FALLA una por una.
 */
import fs from 'fs';
import { createHash } from 'crypto';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

const CLI = 'src/services/dgii/msellerClient.ts';

function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}

/**
 * ¿Nombra este fichero ese identificador, ENTERO?
 *
 * `includes` sobre un nombre es una trampa de prefijo, y en esta auditoria ya
 * mordio tres veces: `documentServiceX` contiene `documentService`,
 * `documentTemplatesX` contiene `documentTemplates`, y `MS_ENVIO_X` contiene
 * `MS_ENVIO`. Renombrar algo para romperlo pasaba desapercibido porque el
 * nombre viejo seguia estando DENTRO del nuevo.
 *
 * Con bordes de palabra, `MS_ENVIO_X` ya no cuenta como `MS_ENVIO`.
 */
function nombra(f: string, identificador: string): boolean {
  return new RegExp(`\\b${identificador}\\b`).test(codigo(f));
}

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan, no puntuan: se cumplen ANTES y DESPUES del
//  lote, asi que como `ok()` darian OK gratis en la contraprueba.
// ─────────────────────────────────────────────────────────────────────────
exige(crudo(CLI).length > 10000, `No se pudo leer ${CLI}. Revisa desde donde se corre.`);

//  Quienes crean un cliente nuevo. TODO este lote descansa en que son varios y
//  cada uno con su instancia: si alguien centraliza el cliente en un sitio, el
//  caché compartido deja de ser necesario y esto hay que volver a pensarlo.
const CREAN_CLIENTE = [
  'src/services/invoice/invoiceSubmissionService.ts',
  'src/infrastructure/jobRunners.ts',
  'src/services/dgii/sincronizarPendientes.ts',
  'src/app/api/v1/invoices/[id]/xml/route.ts',
  'src/app/api/v1/ecf/[id]/dgii-status/route.ts',
  'src/app/api/v1/ecf/dgii-status/batch/route.ts',
];
for (const f of CREAN_CLIENTE) {
  exige(codigo(f).includes('new MSellerClient('),
        `${f} ya no crea un MSellerClient; el motivo de este lote cambia`);
}
//  Aqui `includes` si vale: lleva el parentesis, que cierra el nombre.

//  Y los plazos, que este lote no toca.
for (const t of ['MS_AUTENTICACION', 'MS_ENVIO', 'MS_CONSULTA']) {
  exige(nombra(CLI, t), `msellerClient ha perdido ${t}`);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una autenticacion de mentira que cuenta cuantas veces la piden. */
function autenticadorFalso(valor: string, duracionMs = 60_000, tardanza = 0) {
  const estado = { veces: 0 };
  const pedir = async () => {
    estado.veces++;
    if (tardanza) await dormir(tardanza);
    return { valor, duracionMs };
  };
  return { estado, pedir };
}

type Modulo = typeof import('../src/services/dgii/sesionMseller');

async function main(): Promise<void> {
  let M: Modulo | null = null;
  try {
    M = (await import('../src/services/dgii/sesionMseller')) as Modulo;
  } catch {
    M = null;
  }

  /** Como `ok`, pero si el modulo no existe la comprobacion falla sin ejecutarse. */
  async function okA(t: string, prueba: () => Promise<boolean> | boolean): Promise<void> {
    if (!M) { ok(`${t}  [no existe sesionMseller]`, false); return; }
    let r = false;
    try { r = await prueba(); } catch (e) { r = false; console.log(`        ${(e as Error).message}`); }
    ok(t, r);
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('A. EL CACHE, CORRIENDOLO DE VERDAD');
  // ───────────────────────────────────────────────────────────────────────
  let una = { valor: '', deCache: true };
  let dos = { valor: '', deCache: false };
  let vecesPrimera = -1;

  await okA('la primera lo pide y la segunda no', async () => {
    M!._vaciarSesiones();
    const k = M!.claveDeSesion('api', 'https://ecf.api.mseller.app', 'eCF', 'a@b.do', 'secreta');
    const { estado, pedir } = autenticadorFalso('TOKEN-1');
    una = await M!.sesionVigente(k, pedir);
    dos = await M!.sesionVigente(k, pedir);
    vecesPrimera = estado.veces;
    return estado.veces === 1 && una.deCache === false && dos.deCache === true;
  });
  await okA('y las dos devuelven el mismo token',
    () => una.valor === 'TOKEN-1' && dos.valor === 'TOKEN-1' && vecesPrimera === 1);

  //  Lo que separa una empresa de otra, y un ambiente de otro. Un token de
  //  pruebas usado contra produccion es un envio al sitio equivocado.
  await okA('ambiente, empresa, contraseña y tipo de sesion dan claves distintas', () => {
    const base = ['https://ecf.api.mseller.app', 'eCF', 'a@b.do', 'secreta'] as const;
    const todas = new Set([
      M!.claveDeSesion('api', ...base),
      M!.claveDeSesion('api', base[0], 'TesteCF', base[2], base[3]),
      M!.claveDeSesion('api', base[0], base[1], 'otra@b.do', base[3]),
      M!.claveDeSesion('api', base[0], base[1], base[2], 'CAMBIADA'),
      M!.claveDeSesion('portal', ...base),
    ]);
    return todas.size === 5;
  });

  await okA('y no se cruzan los valores', async () => {
    M!._vaciarSesiones();
    const prod = M!.claveDeSesion('api', 'https://x', 'eCF', 'a@b.do', 'secreta');
    const prue = M!.claveDeSesion('api', 'https://x', 'TesteCF', 'a@b.do', 'secreta');
    const p = await M!.sesionVigente(prod, autenticadorFalso('TOKEN-PRODUCCION').pedir);
    const q = await M!.sesionVigente(prue, autenticadorFalso('TOKEN-PRUEBAS').pedir);
    return p.valor === 'TOKEN-PRODUCCION' && q.valor === 'TOKEN-PRUEBAS'
      && M!._sesionesGuardadas() === 2;
  });

  //  Cambiar la contraseña en Ajustes tiene que invalidar en el acto, no a los
  //  50 minutos.
  await okA('con otra contraseña no se reutiliza el token anterior', async () => {
    M!._vaciarSesiones();
    const vieja = M!.claveDeSesion('api', 'https://x', 'eCF', 'a@b.do', 'vieja');
    const nueva = M!.claveDeSesion('api', 'https://x', 'eCF', 'a@b.do', 'nueva');
    await M!.sesionVigente(vieja, autenticadorFalso('TOKEN-VIEJO').pedir);
    const conNueva = await M!.sesionVigente(nueva, autenticadorFalso('TOKEN-NUEVO').pedir);
    return conNueva.deCache === false && conNueva.valor === 'TOKEN-NUEVO';
  });

  //  La contraseña entra como huella, y la huella es de ESTE proceso.
  await okA('la clave del cache no lleva la contraseña en claro',
    () => !M!.claveDeSesion('api', 'https://x', 'eCF', 'a@b.do', 'secreta').includes('secreta'));
  await okA('ni su huella sin sal, que seria comparable fuera del proceso', () => {
    const clave = M!.claveDeSesion('api', 'https://x', 'eCF', 'a@b.do', 'secreta');
    return !clave.includes(createHash('sha256').update('secreta').digest('hex').slice(0, 32));
  });

  //  Caducidad.
  let caducaAntes = { deCache: false };
  let caducaDespues = { deCache: true };
  let vecesCaducidad = -1;
  await okA('mientras vale, no se vuelve a pedir', async () => {
    M!._vaciarSesiones();
    const k = M!.claveDeSesion('api', 'https://x', 'eCF', 'c@d.do', 'z');
    const { estado, pedir } = autenticadorFalso('TOKEN-CORTO', 40);
    await M!.sesionVigente(k, pedir);
    caducaAntes = await M!.sesionVigente(k, pedir);
    await dormir(70);
    caducaDespues = await M!.sesionVigente(k, pedir);
    vecesCaducidad = estado.veces;
    return caducaAntes.deCache === true;
  });
  await okA('cuando caduca, se vuelve a pedir',
    () => caducaDespues.deCache === false && vecesCaducidad === 2);

  //  Tres cajas cobrando a la vez tras un arranque en frio.
  let cinco: { valor: string }[] = [];
  let vecesSimultaneas = -1;
  await okA('cinco llamadas simultaneas autentican UNA sola vez', async () => {
    M!._vaciarSesiones();
    const k = M!.claveDeSesion('api', 'https://x', 'eCF', 'e@f.do', 'z');
    const { estado, pedir } = autenticadorFalso('TOKEN-UNICO', 60_000, 30);
    cinco = await Promise.all([
      M!.sesionVigente(k, pedir), M!.sesionVigente(k, pedir), M!.sesionVigente(k, pedir),
      M!.sesionVigente(k, pedir), M!.sesionVigente(k, pedir),
    ]);
    vecesSimultaneas = estado.veces;
    return estado.veces === 1;
  });
  await okA('y las cinco reciben el mismo token',
    () => cinco.length === 5 && cinco.every((c) => c.valor === 'TOKEN-UNICO'));

  //  Una autenticacion que revienta no se queda pegada.
  let trasFallo = { valor: '', deCache: true };
  let vecesTrasFallo = -1;
  await okA('si la autenticacion falla, fallan las dos y no se guarda nada', async () => {
    M!._vaciarSesiones();
    const k = M!.claveDeSesion('api', 'https://x', 'eCF', 'g@h.do', 'z');
    const rota = async (): Promise<{ valor: string; duracionMs: number }> => {
      throw new Error('mSeller auth failed (500)');
    };
    const dosIntentos = await Promise.allSettled([
      M!.sesionVigente(k, rota), M!.sesionVigente(k, rota),
    ]);
    const bien = dosIntentos.every((d) => d.status === 'rejected') && M!._sesionesGuardadas() === 0;
    const { estado, pedir } = autenticadorFalso('TOKEN-TRAS-FALLO');
    trasFallo = await M!.sesionVigente(k, pedir);
    vecesTrasFallo = estado.veces;
    return bien;
  });
  await okA('y la siguiente vuelve a intentarlo, no hereda la promesa rota',
    () => trasFallo.valor === 'TOKEN-TRAS-FALLO' && vecesTrasFallo === 1);

  //  Olvidar, que es lo que hace el 401.
  await okA('olvidar la sesion obliga a pedir otra', async () => {
    M!._vaciarSesiones();
    const k = M!.claveDeSesion('api', 'https://x', 'eCF', 'i@j.do', 'z');
    const { estado, pedir } = autenticadorFalso('TOKEN-A');
    await M!.sesionVigente(k, pedir);
    M!.olvidarSesion(k);
    const tras = await M!.sesionVigente(k, pedir);
    return tras.deCache === false && estado.veces === 2;
  });

  // ───────────────────────────────────────────────────────────────────────
  console.log('B. EL CLIENTE USA EL CACHE COMPARTIDO Y NO EL SUYO');
  // ───────────────────────────────────────────────────────────────────────
  ok('no queda ningun caché de instancia',
     !codigo(CLI).includes('tokenCache') && !codigo(CLI).includes('sessionCookieCache'));
  ok('la autenticacion pasa por el modulo compartido',
     codigo(CLI).includes("from './sesionMseller'") && codigo(CLI).includes('sesionVigente('));
  ok('la cookie del portal tambien, que tenia el mismo fallo',
     codigo(CLI).includes("claveDeSesion('portal'"));
  ok('y el token de la API va por su propia clave',
     codigo(CLI).includes("claveDeSesion('api'"));

  ok('un 401 con token del cache renueva y reintenta',
     codigo(CLI).includes('olvidarSesion(this.claveApi())'));
  //  La CONDICION entera, no las palabras sueltas: `tokenDeCache` tambien
  //  aparece en la asignacion y en el registro de tiempos, asi que buscarla a
  //  secas daba OK aunque se quitara del `if` y se reintentara siempre.
  ok('pero solo si venia del cache, y una sola vez',
     codigo(CLI).includes(
       '(response.status === 401 || response.status === 403) && tokenDeCache'));
  ok('y el reintento NO cubre cortes ni plazos agotados',
     crudo(CLI).includes('Un corte o un plazo agotado NO entran aqui'));

  // ───────────────────────────────────────────────────────────────────────
  console.log('C. LOS TIEMPOS QUEDAN REGISTRADOS');
  // ───────────────────────────────────────────────────────────────────────
  ok('cada envio registra el reparto por tramos',
     codigo(CLI).includes("Logger.info('[tiempos-ecf] envio'"));
  ok('con los tres tramos por separado',
     codigo(CLI).includes('autenticacion_ms') && codigo(CLI).includes('transmision_ms')
     && codigo(CLI).includes('clave_api_ms'));
  ok('y diciendo si el token salio del cache, que es lo que se quiere medir',
     codigo(CLI).includes("tokenDeCache ? 'del cache' : 'pedido'"));
  ok('se registra pase lo que pase, no solo cuando sale bien',
     /finally\s*\{[\s\S]{0,600}\[tiempos-ecf\]/.test(codigo(CLI)));

  //  El temporizador del envio: con el reintento hay DOS peticiones posibles, y
  //  al reestructurar se habia quedado solo en el camino de error.
  ok('el temporizador del envio se apaga en el finally, no tras un fetch suelto',
     /finally\s*\{[\s\S]{0,400}clearTimeout\(timeoutId\)/.test(codigo(CLI)));

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
