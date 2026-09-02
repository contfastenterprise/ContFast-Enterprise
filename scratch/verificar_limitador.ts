/**
 * El limitador no puede dejar una clave sin caducidad.
 *
 * EL FALLO
 * --------
 * Contar y caducar eran DOS operaciones:
 *
 *     const currentCount = await Promise.race([incrPromise, timeoutPromise]);
 *     if (currentCount === 1) {
 *       r.expire(redisKey, windowSeconds).catch(() => {});  // fire and forget
 *     }
 *
 * El `EXPIRE` solo se ponia cuando el contador valia exactamente 1. Si esa
 * PRIMERA peticion tardaba mas de 200 ms, la carrera se resolvia por el timeout
 * y saltaba al `catch` -- pero el `INCR` YA se habia ejecutado en Redis. El
 * codigo nunca veia el 1, asi que el `EXPIRE` no se ponia NUNCA.
 *
 * A partir de ahi la clave vive sin caducidad: el contador sube con cada
 * peticion y, pasado el limite, el endpoint devuelve 429 PARA SIEMPRE. Esperar
 * no sirve, porque no hay ventana que se reinicie.
 *
 * Paso de verdad: la lista de facturas quedo bloqueada y hubo que borrar la
 * clave a mano.
 *
 * COMO SE COMPRUEBA
 * -----------------
 * No con un Redis de mentira que devuelve lo que le pidas: con uno que IMITA el
 * comportamiento real, incluido el poder tardar. La prueba que importa es la
 * del timeout en la primera peticion -- el caso exacto que rompia.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

// ── Un Redis minimo, con TTL de verdad y latencia controlable ───────────────
class RedisDeMentirijillas {
  valores = new Map<string, number>();
  ttl = new Map<string, number>();
  retrasoMs = 0;

  private async esperar() {
    if (this.retrasoMs > 0) await new Promise((r) => setTimeout(r, this.retrasoMs));
  }

  async incr(k: string): Promise<number> {
    await this.esperar();
    const v = (this.valores.get(k) ?? 0) + 1;
    this.valores.set(k, v);
    return v;
  }

  async expire(k: string, s: number): Promise<number> {
    await this.esperar();
    this.ttl.set(k, s);
    return 1;
  }

  /**
   * Ejecuta EL script, entero y sin interrupciones -- como hace Redis.
   *
   * No reimplementa lo que "deberia" hacer el script: LEE el texto que se le
   * pasa y obedece solo lo que ahi ponga. Asi, si alguien le quita el `EXPIRE`
   * al script de verdad, estas pruebas se ponen rojas. Un doble que hiciera lo
   * correcto por su cuenta se limitaria a probarse a si mismo.
   */
  async eval(script: string, _n: number, key: string, arg: string): Promise<number> {
    await this.esperar();
    let v = this.valores.get(key) ?? 0;
    if (/redis\.call\('INCR', KEYS\[1\]\)/.test(script)) {
      v += 1;
      this.valores.set(key, v);
    }
    // La condicion del EXPIRE se lee del script, trozo a trozo.
    const mCond = script.match(/if ([^\n]*?) then\s*redis\.call\('EXPIRE', KEYS\[1\], ARGV\[1\]\)/);
    if (mCond) {
      const cond = mCond[1];
      const porPrimera = /c == 1/.test(cond) && v === 1;
      // TTL: -1 = existe sin caducidad, -2 = no existe.
      const ttlActual = !this.valores.has(key) ? -2 : (this.ttl.has(key) ? this.ttl.get(key)! : -1);
      const porHuerfana = /redis\.call\('TTL', KEYS\[1\]\) == -1/.test(cond) && ttlActual === -1;
      if (porPrimera || porHuerfana) this.ttl.set(key, Number(arg));
    }
    return v;
  }

  /** Deja la clave como quedaba con el codigo viejo: con contador y sin TTL. */
  dejarHuerfana(k: string, valor: number) {
    this.valores.set(k, valor);
    this.ttl.delete(k);
  }

  tieneCaducidad(k: string) { return this.ttl.has(k); }
}

/** Reproduce el codigo VIEJO: dos operaciones, expire solo si el contador es 1. */
async function comoEraAntes(r: RedisDeMentirijillas, key: string, ventana: number) {
  try {
    const incrPromise = r.incr(key);
    const timeoutPromise = new Promise<number>((_, rej) =>
      setTimeout(() => rej(new Error('Redis timeout')), 200)
    );
    const c = await Promise.race([incrPromise, timeoutPromise]);
    if (c === 1) r.expire(key, ventana).catch(() => {});
    return c;
  } catch {
    return null; // fail-open, como hacia
  }
}

/**
 * EL SCRIPT DE VERDAD, sacado del fichero. No una copia escrita aqui: si el
 * script cambia en `rateLimiter.ts`, cambia lo que se prueba.
 */
const LUA_REAL = (() => {
  const src = fuente('src/middleware/rateLimiter.ts');
  const m = src.match(/const LUA_CONTAR_Y_CADUCAR = `([\s\S]*?)`;/);
  if (!m) {
    console.log(' FALLA  no se encuentra el script Lua en rateLimiter.ts');
    process.exit(1);
  }
  return m[1];
})();

/** El codigo NUEVO: una sola operacion atomica. */
async function comoEsAhora(r: RedisDeMentirijillas, key: string, ventana: number) {
  try {
    const evalPromise = r.eval(LUA_REAL, 1, key, String(ventana));
    const timeoutPromise = new Promise<number>((_, rej) =>
      setTimeout(() => rej(new Error('Redis timeout')), 200)
    );
    return Number(await Promise.race([evalPromise, timeoutPromise]));
  } catch {
    return null;
  }
}

(async () => {
  console.log('\n1) EL CASO QUE ROMPIA: la primera peticion tarda de mas\n');

  {
    // Redis lento justo en la primera. El INCR llega; la respuesta, no a tiempo.
    const viejo = new RedisDeMentirijillas();
    viejo.retrasoMs = 250; // por encima de los 200 ms del timeout
    const r1 = await comoEraAntes(viejo, 'k', 60);
    await new Promise((r) => setTimeout(r, 300)); // que termine el incr colgado

    ok('el codigo viejo se rendia por timeout', r1 === null);
    ok('pero el contador SI subio en Redis', viejo.valores.get('k') === 1);
    ok('y la clave quedo SIN CADUCIDAD  <-- el fallo',
      !viejo.tieneCaducidad('k'));

    const nuevo = new RedisDeMentirijillas();
    nuevo.retrasoMs = 250;
    const r2 = await comoEsAhora(nuevo, 'k', 60);
    await new Promise((r) => setTimeout(r, 300));

    ok('el codigo nuevo tambien se rinde por timeout', r2 === null);
    ok('el contador sube igual', nuevo.valores.get('k') === 1);
    ok('PERO la caducidad quedo puesta: el script corre entero',
      nuevo.tieneCaducidad('k'));
  }

  console.log('\n2) Sin caducidad, el bloqueo es PARA SIEMPRE\n');

  {
    const viejo = new RedisDeMentirijillas();
    viejo.retrasoMs = 250;
    await comoEraAntes(viejo, 'k', 60);
    await new Promise((r) => setTimeout(r, 300));
    viejo.retrasoMs = 0;

    // A partir de aqui Redis va bien, pero el contador ya nunca vale 1.
    for (let i = 0; i < 5; i++) await comoEraAntes(viejo, 'k', 60);

    ok('la clave sigue sin caducidad tras varias peticiones buenas',
      !viejo.tieneCaducidad('k'));
    ok('y el contador solo sube', viejo.valores.get('k') === 6, String(viejo.valores.get('k')));
  }

  console.log('\n3) Con el arreglo, la ventana existe desde la primera\n');

  {
    const nuevo = new RedisDeMentirijillas();
    nuevo.retrasoMs = 250;
    await comoEsAhora(nuevo, 'k', 60);
    await new Promise((r) => setTimeout(r, 300));
    nuevo.retrasoMs = 0;
    for (let i = 0; i < 5; i++) await comoEsAhora(nuevo, 'k', 60);

    ok('la caducidad esta puesta', nuevo.tieneCaducidad('k'));
    ok('y vale lo que dice la ventana', nuevo.ttl.get('k') === 60, String(nuevo.ttl.get('k')));
    ok('el contador cuenta bien', nuevo.valores.get('k') === 6, String(nuevo.valores.get('k')));
  }

  console.log('\n3b) Una clave que YA quedo eterna se cura sola\n');

  // Esto es lo que hay ahora mismo en el Redis de la empresa: la clave
  // `ratelimit:standard:127.0.0.1` con el contador por encima del limite y sin
  // caducidad. Sin curarse sola, desplegar el arreglo no levantaria el 429:
  // el contador ya nunca vuelve a valer 1.
  {
    const r = new RedisDeMentirijillas();
    r.dejarHuerfana('k', 812); // muy por encima de los 500 del preset standard

    ok('de partida: contador alto y sin caducidad', !r.tieneCaducidad('k'));

    // Con el codigo VIEJO seguiria eterna para siempre.
    const viejo = new RedisDeMentirijillas();
    viejo.dejarHuerfana('k', 812);
    for (let i = 0; i < 3; i++) await comoEraAntes(viejo, 'k', 60);
    ok('el codigo viejo NO la cura: sigue sin caducidad', !viejo.tieneCaducidad('k'));

    // Con el nuevo, la primera peticion que la toca le pone la ventana.
    const c = await comoEsAhora(r, 'k', 60);
    ok('el nuevo le pone la caducidad en la primera peticion', r.tieneCaducidad('k'));
    ok('y es la ventana del preset', r.ttl.get('k') === 60, String(r.ttl.get('k')));
    ok('el contador no se falsea: sigue siendo el que habia +1', c === 813, String(c));
    // Ese 813 sigue por encima del limite, asi que esa peticion aun se rechaza
    // -- correcto: lo que se arregla es que ahora la ventana CADUCA y a los 60
    // segundos el endpoint vuelve solo.
  }

  console.log('\n4) El codigo de verdad usa el script, no las dos ordenes\n');

  {
    const src = fuente('src/middleware/rateLimiter.ts');
    ok('cuenta y caduca con un script Lua',
      /redis\.call\('INCR', KEYS\[1\]\)/.test(LUA_REAL)
      && /redis\.call\('EXPIRE', KEYS\[1\], ARGV\[1\]\)/.test(LUA_REAL));
    ok('y tambien caduca las claves que ya estaban huerfanas',
      /redis\.call\('TTL', KEYS\[1\]\) == -1/.test(LUA_REAL));
    ok('y el script no se queda de adorno: se usa',
      (src.match(/LUA_CONTAR_Y_CADUCAR/g) || []).length === 2,
      String((src.match(/LUA_CONTAR_Y_CADUCAR/g) || []).length));
    ok('lo lanza con eval',
      /r\.eval\(LUA_CONTAR_Y_CADUCAR, 1, redisKey, String\(windowSeconds\)\)/.test(src));
    ok('ya no hay un expire suelto con el error tragado',
      !/r\.expire\(redisKey, windowSeconds\)\.catch\(\(\) => \{\}\)/.test(src));
    ok('ni el incr por separado',
      !/const incrPromise = r\.incr\(redisKey\)/.test(src));
    ok('el timeout de 200 ms se conserva: Redis lento no bloquea al usuario',
      /new Error\('Redis timeout'\)\), 200\)/.test(src));
    ok('y los limites no se han tocado',
      /standard: \{ limit: 500, windowSeconds: 60 \}/.test(src)
      && /auth: \{ limit: 5, windowSeconds: 60 \}/.test(src)
      && /dgii: \{ limit: 20, windowSeconds: 60 \}/.test(src));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
