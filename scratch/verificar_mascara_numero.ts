/**
 * Lote 188 -- el numero de los avisos se escribe con mascara y se avisa EN EL
 * MOMENTO si no vale.
 *
 * POR QUE
 * -------
 * Pedido del dueño (2026-09-24): "el sistema debe advertir si el numero no tiene
 * el formato y si prefiere cree una mascara para que funcione mejor y menos
 * errores". Hasta ahora un numero mal puesto no se sabia hasta pulsar Guardar, y
 * entonces el servidor devolvia un 400 (lote 178): el aviso llegaba tarde y en
 * otro sitio.
 *
 * LAS DOS DECISIONES QUE HAY QUE ENTENDER
 * --------------------------------------
 *
 * 1. LA REGLA NO SE ESCRIBE DOS VECES. El diagnostico usa `normalizarNumero`, la
 *    MISMA funcion con la que el servidor decide si acepta. Una segunda regla en
 *    el navegador es lo que hace que la pantalla diga "correcto" y el servidor
 *    responda 400 -- o al contrario, que es peor porque el numero se guarda y los
 *    avisos no llegan.
 *
 * 2. LA MASCARA SE APARTA CUANDO NO SABE. Solo agrupa lo que reconoce como
 *    dominicano (809/829/849, con o sin el 1 delante). Un `+`, otro pais o un
 *    area que no es de RD se dejan TAL COMO SE ESCRIBIERON: no conocemos el
 *    formato de los demas paises, y una mascara que adivina mete espacios donde
 *    no van y acaba causando mas errores de los que evita. El `+` se admite desde
 *    el lote 178 precisamente para el extranjero.
 *
 * Y VACIO NO ES UN ERROR: significa "esta empresa no recibe avisos", que es el
 * estado de las seis. Avisar ahi seria regañar por lo normal.
 *
 * Las dos reglas se EJECUTAN aqui: son puras, sin base ni red.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const REGLA = 'src/services/avisos/avisoPorWhatsApp.ts';
const PANTALLA = 'src/app/dashboard/settings/page.tsx';
const RUTA = 'src/app/api/v1/admin/settings/route.ts';

async function main() {
  // Vale en los DOS estados: la normalizacion y su uso en el servidor son del 178.
  const regla = leer(REGLA);
  if (!/export function normalizarNumero/.test(regla)) {
    throw new Error('Precondicion: ya no existe la normalizacion del numero (lote 178)');
  }
  if (!/normalizarNumero\(whatsappAvisos\)/.test(leer(RUTA))) {
    throw new Error('Precondicion: el servidor ya no valida el numero con esa regla');
  }
  console.log('  pre   la normalizacion existe y el servidor la usa');

  console.log('\n1) La mascara, ejecutada\n');
  let A: typeof import('../src/services/avisos/avisoPorWhatsApp') | null = null;
  try { A = await import('../src/services/avisos/avisoPorWhatsApp'); } catch { A = null; }

  const ETIQUETAS = [
    'agrupa un numero dominicano mientras se escribe',
    '  y con el 1 delante tambien',
    'NO toca lo que empieza por + (otro pais)',
    'NO toca un area que no es dominicana',
    'vacio no es un error: no se avisa de nada',
    'un numero valido dice COMO saldra',
    'faltan digitos: lo dice y cuantos',
    'un area que no es de RD: lo dice y como arreglarlo',
  ];

  const completo = !!A
    && typeof (A as { formatearNumeroMientrasEscribe?: unknown }).formatearNumeroMientrasEscribe === 'function'
    && typeof (A as { diagnosticoDelNumero?: unknown }).diagnosticoDelNumero === 'function';

  if (!completo || !A) {
    for (const t of ETIQUETAS) falta(t, 'la regla no tiene mascara ni diagnostico');
  } else {
    const { formatearNumeroMientrasEscribe: fmt, diagnosticoDelNumero: diag, normalizarNumero } = A;

    // --- LA MASCARA ---
    ok(ETIQUETAS[0], fmt('8095551234') === '809 555 1234', fmt('8095551234'));
    // Se agrupa MIENTRAS se escribe: los cortes se aplican a lo que ya hay.
    ok('  y va agrupando desde el primer digito',
      fmt('809') === '809' && fmt('80955') === '809 55' && fmt('8095551') === '809 555 1',
      `${fmt('809')} | ${fmt('80955')} | ${fmt('8095551')}`);
    ok(ETIQUETAS[1], fmt('18095551234') === '1 809 555 1234', fmt('18095551234'));
    ok('  las tres areas de RD', fmt('8295551234') === '829 555 1234' && fmt('8495551234') === '849 555 1234');
    // Lo que ya esta escrito con espacios no se rompe al seguir escribiendo.
    ok('  y reformatea lo ya escrito sin romperlo', fmt('809 555 1234') === '809 555 1234');

    // LA MASCARA SE APARTA: es la decision que evita que pelee con quien escribe.
    ok(ETIQUETAS[2], fmt('+34600123456') === '+34600123456', fmt('+34600123456'));
    ok('  y respeta el + aunque venga con espacios', fmt('+34 600 123 456') === '+34600123456');
    ok(ETIQUETAS[3], fmt('2125551234') === '2125551234', fmt('2125551234'));
    ok('  ni un numero largo sin +', fmt('34600123456') === '34600123456');
    ok('  ni vacio ni nulo', fmt('') === '' && fmt(null) === '' && fmt(undefined) === '');

    // --- EL DIAGNOSTICO ---
    console.log('\n2) El aviso, ejecutado\n');
    ok(ETIQUETAS[4], diag('').estado === 'vacio' && diag(null).estado === 'vacio' && diag('   ').estado === 'vacio');

    const bueno = diag('809 555 1234');
    ok(ETIQUETAS[5], bueno.estado === 'valido' && bueno.comoSaldra === '+18095551234', bueno.comoSaldra);
    ok('  y es el mismo numero que mandaria el sistema',
      bueno.comoSaldra === `+${normalizarNumero('809 555 1234')}`);
    ok('  tambien con codigo de pais', diag('+34600123456').comoSaldra === '+34600123456');

    const corto = diag('80955');
    ok(ETIQUETAS[6], corto.estado === 'incompleto' && /5 de 10/.test(corto.mensaje ?? ''), corto.mensaje);

    const area = diag('2125551234');
    ok(ETIQUETAS[7], area.estado === 'invalido' && /212/.test(area.mensaje ?? '') && /c[oó]digo de pa[ií]s/i.test(area.mensaje ?? ''),
      area.mensaje);

    ok('un numero absurdamente largo tambien se rechaza',
      diag('1234567890123456789').estado === 'invalido');

    // LA PROPIEDAD QUE LO ATA TODO: el diagnostico y el servidor no pueden
    // discrepar. Si discreparan, la pantalla diria una cosa y el guardado otra.
    const casos = ['', '809 555 1234', '8095551234', '80955', '2125551234', '+34600123456',
      '1 809 555 1234', '34600123456', '1234567890123456789', 'no es un numero'];
    const discrepan = casos.filter((c) => {
      const d = diag(c);
      const n = normalizarNumero(c);
      return (d.estado === 'valido') !== (n !== null);
    });
    ok('el aviso y lo que acepta el servidor NUNCA discrepan',
      discrepan.length === 0, discrepan.join(' | '));
  }

  console.log('\n3) La pantalla usa la regla, no una copia\n');
  const pantalla = leer(PANTALLA);
  const codigo = sinComentarios(pantalla);
  ok('importa la mascara y el diagnostico',
    /from '@\/services\/avisos\/avisoPorWhatsApp'/.test(pantalla)
    && /formatearNumeroMientrasEscribe/.test(codigo) && /diagnosticoDelNumero/.test(codigo));
  //  Negativa ATADA a la marca positiva: sola es cierta de balde antes del lote,
  //  cuando la pantalla no validaba NADA.
  ok('  y no tiene su propia expresion para validar',
    /diagnosticoDelNumero\(/.test(codigo)
    && !/\/\^\[0-9\]\{10\}\$\//.test(codigo) && !/AREAS_RD/.test(codigo));
  ok('la mascara se aplica al escribir',
    /whatsappAvisos: formatearNumeroMientrasEscribe\(e\.target\.value\)/.test(codigo));
  ok('el diagnostico se recalcula del valor del campo, sin estado propio',
    /const diagnosticoNumero = diagnosticoDelNumero\(formData\.whatsappAvisos\)/.test(codigo)
    && !/setDiagnosticoNumero/.test(codigo));
  ok('se enseña como saldra cuando es valido',
    /Se enviará a \{diagnosticoNumero\.comoSaldra\}/.test(codigo));
  ok('  y el motivo cuando no lo es',
    /diagnosticoNumero\.estado === 'incompleto'/.test(codigo) && /\{diagnosticoNumero\.mensaje\}/.test(codigo));
  // Vacio es legitimo: ni verde ni ambar.
  ok('vacio no se pinta como error',
    /diagnosticoNumero\.estado === 'vacio'/.test(codigo));
  //  Guardar NO se bloquea: el campo es opcional y el servidor ya lo rechaza.
  //  Igual que arriba, la negativa va atada: sin el diagnostico no habia nada que
  //  pudiera bloquear el boton, asi que sola no comprobaba nada.
  ok('no se bloquea el boton de guardar por este campo',
    /const diagnosticoNumero = /.test(codigo)
    && !/disabled=\{[^}]*diagnosticoNumero/.test(codigo));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
