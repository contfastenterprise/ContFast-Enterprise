/**
 * Lote 173 -- la pantalla de acceso.
 *
 * QUE SE ARREGLA, Y POR QUE NO ES "SOLO ESTETICO"
 * -----------------------------------------------
 *  1. el logo empujaba el formulario FUERA de la pantalla: `justify-start` con
 *     `mt-20` y un logo de 450px en un portatil de 768px de alto obligaba a
 *     desplazarse para llegar al boton de entrar;
 *  2. el boton era `amber-500` y el panel entero usa #c5a059 (458 sitios): se
 *     entraba con un color y se aterrizaba en otro;
 *  3. el motivo del fallo salia en un aviso efimero en la esquina, lejos de
 *     los campos que se estan mirando -- y sin que un lector de pantalla lo
 *     anunciara;
 *  4. los `<input required>` disparaban el aviso NATIVO del navegador (en
 *     ingles) antes que zod, asi que los mensajes en español no se veian nunca;
 *  5. el fondo creaba una onda cada 3 segundos PARA SIEMPRE, sin mirar
 *     `prefers-reduced-motion`.
 *
 * La regla que se podia sacar del componente -- validar y traducir el motivo
 * del fallo -- vive en `services/auth/accesoDelUsuario.ts` y se EJECUTA aqui.
 * El resto se lee, porque es marcado.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
/** Sin comentarios: las comprobaciones en negativo no pueden fallar porque el
 *  codigo EXPLIQUE lo que retiro (misma cura que en el lote 172). */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const LOGIN = 'src/app/auth/login/page.tsx';
const FONDO = 'src/components/ui/interactive-ripple-background.tsx';

async function main() {
  for (const f of [LOGIN, FONDO]) {
    if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: falta ${f}`);
  }
  const login = leer(LOGIN);
  const codigo = sinComentarios(login);
  // Vale en los dos estados: lo que cambia es COMO se ve y que valida, no que
  // la pantalla exista ni que mande el formulario.
  if (!/fetch\('\/api\/v1\/auth\/login'/.test(login)) throw new Error('Precondicion: el login ya no llama a /api/v1/auth/login');

  console.log('\n1) La regla, ejecutada\n');
  let A: typeof import('../src/services/auth/accesoDelUsuario') | null = null;
  try { A = await import('../src/services/auth/accesoDelUsuario'); } catch { A = null; }

  if (!A) {
    for (const t of [
      'el correo vacio se rechaza diciendo que falta, no que el formato esta mal',
      'un correo con formato malo se rechaza por el formato',
      'la contraseña vacia se rechaza diciendo que falta',
      'una contraseña corta sigue rechazandose',
      'unas credenciales validas pasan',
      'un fallo de red no se confunde con una contraseña incorrecta',
      'un mensaje del servidor se respeta tal cual',
      'nunca devuelve un motivo vacio',
    ]) falta(t, 'no existe services/auth/accesoDelUsuario.ts');
  } else {
    const { esquemaAcceso, motivoDelFallo, SIN_CONEXION } = A;
    const parse = (email: string, password: string) => esquemaAcceso.safeParse({ email, password });
    const primer = (email: string, password: string) => {
      const r = parse(email, password);
      return r.success ? null : r.error.issues[0].message;
    };

    ok('el correo vacio se rechaza diciendo que falta, no que el formato esta mal',
      primer('', 'secreto123') === 'Ingrese su correo electrónico', String(primer('', 'secreto123')));
    ok('un correo con formato malo se rechaza por el formato',
      /formato/.test(String(primer('pepe', 'secreto123'))), String(primer('pepe', 'secreto123')));
    ok('la contraseña vacia se rechaza diciendo que falta',
      primer('a@b.do', '') === 'Ingrese su contraseña', String(primer('a@b.do', '')));
    ok('una contraseña corta sigue rechazandose',
      /al menos 6/.test(String(primer('a@b.do', '123'))), String(primer('a@b.do', '123')));
    ok('unas credenciales validas pasan', parse('a@b.do', 'secreto123').success === true);

    // Decirle "acceso incorrecto" a quien se quedo sin wifi le hace dudar de su
    // contraseña. Son dos cosas distintas y se dicen distinto.
    for (const m of ['Failed to fetch', 'failed to fetch', 'NetworkError when attempting to fetch', 'Load resource error']) {
      ok(`un fallo de red no se confunde con una contraseña incorrecta (${m.slice(0, 18)})`,
        motivoDelFallo(m) === SIN_CONEXION, motivoDelFallo(m));
    }
    ok('un mensaje del servidor se respeta tal cual',
      motivoDelFallo('El usuario está inactivo.') === 'El usuario está inactivo.');
    // Un cuadro de error en blanco es peor que uno generico.
    for (const vacio of ['', '   ', null, undefined, 42]) {
      ok(`nunca devuelve un motivo vacio (${JSON.stringify(vacio)})`,
        typeof motivoDelFallo(vacio) === 'string' && motivoDelFallo(vacio).trim().length > 0,
        JSON.stringify(motivoDelFallo(vacio)));
    }
  }

  console.log('\n2) El formulario usa esa regla y no la del navegador\n');
  ok('la pantalla importa el esquema compartido',
    /import \{ esquemaAcceso, motivoDelFallo, type DatosDeAcceso \} from '@\/services\/auth\/accesoDelUsuario'/.test(login));
  ok('  y lo usa como resolver', /resolver: zodResolver\(esquemaAcceso\)/.test(login));
  // La negacion sola seria verdad de balde si no hubiera formulario: va unida
  // a que el esquema compartido SI este puesto.
  ok('ya no hay un esquema propio en la pantalla',
    !/const loginSchema = z\.object/.test(codigo) && /esquemaAcceso/.test(login));
  ok('los inputs ya no llevan `required` (tapaba los mensajes en español)',
    !/\brequired\b/.test(codigo) && /zodResolver\(esquemaAcceso\)/.test(login));
  ok('  y el formulario desactiva la validacion nativa', /<form[^>]*noValidate/.test(codigo.replace(/\n/g, ' ')));
  ok('el correo recibe el foco al cargar', /autoFocus/.test(codigo));

  console.log('\n3) El fallo se ve donde se esta mirando\n');
  ok('hay un aviso dentro del formulario', /\{motivoDelError && \(/.test(login));
  ok('  anunciado a los lectores de pantalla', /role="alert"/.test(codigo));
  ok('  alimentado por la regla', /setMotivoDelError\(motivoDelFallo\(/.test(login));
  ok('  y se limpia al reintentar', /setMotivoDelError\(null\)/.test(codigo));
  ok('el aviso efimero de error ya no se usa',
    !/toast\.error/.test(codigo) && /role="alert"/.test(codigo));
  ok('ni el de exito, que aparecia y se iba al navegar',
    !/toast\.success/.test(codigo) && /router\.push\('\/dashboard'\)/.test(login));
  ok('cada campo dice si esta invalido y a que mensaje apunta',
    /aria-invalid=\{!!errors\.email\}/.test(codigo) && /aria-describedby=\{errors\.email \? 'error-email' : undefined\}/.test(codigo)
    && /aria-invalid=\{!!errors\.password\}/.test(codigo) && /id="error-password"/.test(codigo));

  console.log('\n4) El color es el de la marca\n');
  const DORADO = '#c5a059';
  ok('el boton de entrar usa el dorado de la marca', new RegExp(`bg-\\[${DORADO}\\]`).test(codigo));
  ok('  y el foco de los campos tambien', new RegExp(`focus:ring-\\[${DORADO}\\]`).test(codigo));
  ok('no queda ningun ambar suelto', !/amber-\d00/.test(codigo), (codigo.match(/amber-\d00/g) || []).join(' '));
  ok('el icono de chispas dejo paso a uno de entrar',
    !/\bSparkles\b/.test(codigo) && /<LogIn /.test(codigo));

  console.log('\n5) El formulario cabe en la pantalla\n');
  ok('el bloque se centra en vez de empezar arriba',
    /justify-center/.test(codigo) && !/justify-start/.test(codigo));
  ok('  y ya no lleva un margen superior fijo de 5rem', !/\bmt-20\b/.test(codigo));
  ok('el logo se encoge en pantallas pequeñas',
    /max-w-\[260px\] sm:max-w-\[340px\] lg:max-w-\[420px\]/.test(codigo));
  ok('la pagina tiene un titulo, aunque el logo sea una imagen',
    /<h1 className="sr-only">/.test(codigo) && /alt="ContFast Enterprise"/.test(codigo));

  console.log('\n6) El boton del ojo se puede usar y se entiende\n');
  ok('dice lo que hace', /aria-label=\{showPassword \? 'Ocultar contraseña' : 'Mostrar contraseña'\}/.test(codigo));
  ok('  y si esta pulsado', /aria-pressed=\{showPassword\}/.test(codigo));
  ok('vuelve al orden de tabulacion', !/tabIndex=\{-1\}/.test(codigo) && /aria-label=\{showPassword/.test(codigo));
  ok('  con un foco visible', /focus-visible:ring-2/.test(codigo));

  console.log('\n7) El fondo deja de animarse solo\n');
  const fondo = leer(FONDO);
  const fondoCodigo = sinComentarios(fondo);
  ok('no queda el intervalo que creaba una onda cada 3 segundos',
    !/setInterval/.test(fondoCodigo) && /createRipple/.test(fondoCodigo));
  ok('  ni el useEffect que lo montaba', !/useEffect/.test(fondoCodigo));
  // El `onClick` ya estaba antes del lote: solo, seria un OK regalado en la
  // contraprueba. Lo que este lote afirma es que se QUEDA mientras se van las
  // automaticas, asi que va unido a eso.
  ok('las ondas al hacer clic se quedan (lo que se va es la animacion perpetua)',
    /onClick=\{createRipple\}/.test(fondoCodigo) && !/setInterval/.test(fondoCodigo));
  ok('y no se crean si el sistema pide reducir el movimiento',
    /prefers-reduced-motion: reduce/.test(fondoCodigo) && /matchMedia/.test(fondoCodigo));
  // Que la comprobacion este ANTES de crear la onda, no despues de crearla.
  const iReduce = fondoCodigo.indexOf('prefers-reduced-motion');
  const iCrear = fondoCodigo.indexOf('setRipples(prev => [...prev, newRipple])');
  ok('  y se mira ANTES de crearla', iReduce > 0 && iCrear > 0 && iReduce < iCrear, `${iReduce} < ${iCrear}`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
