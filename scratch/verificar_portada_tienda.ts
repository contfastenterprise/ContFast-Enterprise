/**
 * Lote 235 -- la portada de la tienda, configurable por empresa.
 *
 * Decision del dueno al redisenar la tienda (lote 231): anuncio de arriba,
 * titulo, texto e imagen, distintos por empresa; y a media obra, "que sea en
 * una pestana nueva" de Configuracion. Antes la portada decia lo mismo en las
 * seis empresas.
 *
 * Aqui se EJECUTAN las reglas (que se guarda, que se ensena cuando un campo
 * esta vacio) y se DIBUJAN la portada y la barra de anuncio. Las rutas y la
 * base, en `verificar_portada_tienda_db.ts`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const intenta = <T,>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };

const APP = 'src/app/[empresa]';

async function main() {
  //  Vale en los dos estados: la tienda del lote 231 con su cabecera.
  if (!/<CabeceraTienda\b/.test(leer(`${APP}/layout.tsx`))) throw new Error('Precondicion: la tienda ya no usa CabeceraTienda (lote 231)');

  console.log('\n1) Las reglas de la portada, ejecutadas\n');
  type P = typeof import('../src/services/storefront/portada');
  let M: P | null = null;
  try { M = await import('../src/services/storefront/portada'); } catch { M = null; }
  const E1 = ['lo que se guarda va recortado, y vacio es null', 'el anuncio y el titulo van en UNA linea; el texto conserva sus parrafos',
    'lo que pasa del tope se dice, campo por campo', 'vacio usa lo de siempre: sin anuncio, "Bienvenido a <empresa>", el texto neutro y sin imagen',
    'lo configurado manda sobre lo de siempre', 'lo que no es texto no rompe nada'];
  if (!M) falta(E1, 'no existe services/storefront/portada.ts');
  else {
    const m = M;
    const l = m.limpiarPortada({ anuncio: '  Envíos a todo el país  ', titulo: '   ', texto: '', imagenUrl: ' https://x/y.webp ' });
    ok(E1[0], l.anuncio === 'Envíos a todo el país' && l.titulo === null && l.texto === null && l.imagenUrl === 'https://x/y.webp', JSON.stringify(l));
    const l2 = m.limpiarPortada({ anuncio: 'Oferta\nde   octubre', titulo: 'Puertas\r\ny ventanas', texto: 'Uno.  \r\n\r\n\r\n\r\n  Dos   palabras.\nTres.' });
    ok(E1[1], l2.anuncio === 'Oferta de octubre' && l2.titulo === 'Puertas y ventanas' && l2.texto === 'Uno.\n\nDos palabras.\nTres.', JSON.stringify(l2));
    const largo = m.limpiarPortada({ anuncio: 'a'.repeat(m.LIMITES_DE_PORTADA.anuncio + 1), titulo: 't'.repeat(m.LIMITES_DE_PORTADA.titulo), texto: 'x'.repeat(m.LIMITES_DE_PORTADA.texto + 5) });
    const e = m.erroresDePortada(largo);
    ok(E1[2], Object.keys(e).sort().join(',') === 'anuncio,texto' && /120/.test(e.anuncio ?? '') && /405/.test(e.texto ?? '')
      && Object.keys(m.erroresDePortada(m.PORTADA_VACIA)).length === 0, JSON.stringify(e));
    const vacia = m.portadaParaMostrar(null, 'Latin Doors S.R.L');
    const vacia2 = m.portadaParaMostrar(m.limpiarPortada({ anuncio: ' ', titulo: '', texto: ' ', imagenUrl: '' }), 'Latin Doors S.R.L');
    ok(E1[3], vacia.anuncio === null && vacia.titulo === 'Bienvenido a Latin Doors S.R.L' && vacia.texto === m.TEXTO_POR_DEFECTO && vacia.imagenUrl === null
      && JSON.stringify(vacia2) === JSON.stringify(vacia), JSON.stringify(vacia));
    const llena = m.portadaParaMostrar({ anuncio: 'Abrimos sábados', titulo: 'Puertas a medida', texto: 'Fabricamos en Santiago.', imagenUrl: 'https://x/y.webp' }, 'Latin Doors');
    ok(E1[4], llena.anuncio === 'Abrimos sábados' && llena.titulo === 'Puertas a medida' && llena.texto === 'Fabricamos en Santiago.' && llena.imagenUrl === 'https://x/y.webp');
    const raro = intenta(() => m.limpiarPortada({ anuncio: 5, titulo: null, texto: { a: 1 }, imagenUrl: undefined } as never));
    ok(E1[5], raro !== 'LANZO' && JSON.stringify(raro) === JSON.stringify(m.PORTADA_VACIA), JSON.stringify(raro));
  }

  console.log('\n2) La portada y el anuncio, dibujados\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let C: Record<string, (p: unknown) => unknown> | null = null;
  try { C = (await import('../src/components/storefront/PortadaTienda')) as unknown as Record<string, (p: unknown) => unknown>; } catch { C = null; }
  const E2 = ['sin configurar: el titulo de siempre y el logo, sin barra de anuncio', 'configurada: su titulo, su texto con parrafos y su imagen',
    'el anuncio sale en su barra, y no al imprimir', 'sin logo ni imagen, las iniciales de la empresa'];
  if (!C?.PortadaTienda || !C?.BarraDeAnuncio) falta(E2, 'no existe PortadaTienda');
  else {
    const portada = (p: object) => renderToStaticMarkup(React.createElement(C!.PortadaTienda as never, { empresaSlug: 'latin', nombre: 'Latin Doors', logoUrl: 'https://x/logo.png', portada: null, ...p }));
    const barra = (p: unknown) => renderToStaticMarkup(React.createElement(C!.BarraDeAnuncio as never, { nombre: 'Latin Doors', portada: p }));
    const sin = portada({});
    ok(E2[0], /<h1[^>]*>Bienvenido a Latin Doors<\/h1>/.test(sin) && /src="https:\/\/x\/logo\.png"/.test(sin) && /href="\/latin\/productos"/.test(sin)
      && barra(null) === '' && barra({ anuncio: null, titulo: 'x', texto: null, imagenUrl: null }) === '');
    const con = portada({ portada: { anuncio: null, titulo: 'Puertas a medida', texto: 'Uno.\n\nDos.', imagenUrl: 'https://x/portada.webp' } });
    ok(E2[1], /<h1[^>]*>Puertas a medida<\/h1>/.test(con) && /whitespace-pre-line[^>]*>Uno\.\n\nDos\.</.test(con)
      && /src="https:\/\/x\/portada\.webp"/.test(con) && !/logo\.png/.test(con) && !/Bienvenido/.test(con));
    const b = barra({ anuncio: 'Abrimos sábados', titulo: null, texto: null, imagenUrl: null });
    ok(E2[2], />Abrimos sábados</.test(b) && /print:hidden/.test(b));
    ok(E2[3], />LD</.test(portada({ logoUrl: null })) && !/<img/.test(portada({ logoUrl: null })));
  }

  console.log('\n3) La tienda la lee sin poder caerse\n');
  const repo = sinComentarios(leer('src/services/storefront/portadaRepositorio.ts'));
  const leerBloque = (() => { const i = repo.indexOf('async leer('); return i < 0 ? '' : repo.slice(i, repo.indexOf('async guardar(', i)); })();
  ok('leer la portada NUNCA lanza: si falla (o falta la migracion) devuelve null',
    /try \{[\s\S]*SELECT tienda_anuncio, tienda_titulo, tienda_texto, tienda_imagen_url[\s\S]*\} catch \(e\) \{[\s\S]*return null;\s*\}/.test(leerBloque) && !/throw/.test(leerBloque));
  const esquema = sinComentarios(leer('src/db/schema/companies.ts'));
  ok('  y las columnas NO estan en el esquema compartido (un despliegue sin la migracion no tumba lo demas)',
    repo.length > 0 && !/tienda_(anuncio|titulo|texto|imagen_url)/.test(esquema) && !/tienda(Anuncio|Titulo|Texto|ImagenUrl)/.test(esquema));
  const mig = leer('drizzle/0016_portada_de_la_tienda.sql').replace(/--[^\n]*/g, '');
  const sentencias = mig.split(';').map((x) => x.trim()).filter(Boolean);
  ok('la migracion solo ANADE cuatro columnas, y se puede repetir',
    sentencias.length === 4 && sentencias.every((x) => /^ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "tienda_(anuncio|titulo|texto|imagen_url)" varchar\(\d+\)$/.test(x)), `${sentencias.length} sentencias`);
  const layout = sinComentarios(leer(`${APP}/layout.tsx`));
  const pagina = sinComentarios(leer(`${APP}/page.tsx`));
  ok('la tienda ensena el anuncio encima de la cabecera y la portada en el inicio',
    /<BarraDeAnuncio portada=\{portada\} nombre=\{company\.name\} \/>\s*<CabeceraTienda/.test(layout) && /leerPortadaDeLaTienda\(company\.id\)/.test(layout)
    && /<PortadaTienda [^>]*portada=\{portada\}/.test(pagina) && /leerPortadaDeLaTienda\(company\.id\)/.test(pagina) && !/Bienvenido a \{company\.name\}/.test(pagina));

  console.log('\n4) Configuracion: una pestana propia\n');
  const ajustes = sinComentarios(leer('src/app/dashboard/settings/page.tsx'));
  ok('la portada tiene su pestana "Tienda", para administracion y sistemas',
    /onClick=\{\(\) => setActiveTab\('tienda'\)\}/.test(ajustes) && />\s*Tienda\s*<\/button>/.test(ajustes)
    && /activeTab === 'tienda' && \(isAdministracion \|\| isSistemas\) && \(\s*<PortadaDeLaTienda \/>/.test(ajustes));
  //  Dentro del <form> de Empresa, Enter en el titulo enviaria el formulario de la empresa.
  const formEmpresa = (() => { const i = ajustes.indexOf('<form onSubmit={handleSave}'); return i < 0 ? 'X' : ajustes.slice(i, ajustes.indexOf('</form>', i)); })();
  ok('  y NO va dentro del formulario de la empresa', /<PortadaDeLaTienda \/>/.test(ajustes) && !/<PortadaDeLaTienda/.test(formEmpresa));
  const tarjeta = sinComentarios(leer('src/app/dashboard/settings/components/PortadaDeLaTienda.tsx'));
  ok('la tarjeta guarda lo que se ve, y se queda con lo GUARDADO',
    /method: 'PUT', headers: \{ 'Content-Type': 'application\/json' \}, body: JSON\.stringify\(f\)/.test(tarjeta)
    && /const p = leido\.cuerpo\.data\.portada;\s*setF\(/.test(tarjeta));
  ok('  la imagen se reduce antes de subir, y "Quitar" la deja vacia',
    /reducida = await reducirImagen\(file, LADO_DE_LA_PORTADA\)/.test(tarjeta) && /cuerpo\.append\('file', reducida\)/.test(tarjeta)
    && /onClick=\{\(\) => cambiar\('imagenUrl', ''\)\}/.test(tarjeta));
  ok('  y los topes de la pantalla son los del servidor (uno solo)',
    /tope=\{LIMITES_DE_PORTADA\.anuncio\}/.test(tarjeta) && /tope=\{LIMITES_DE_PORTADA\.titulo\}/.test(tarjeta) && /tope=\{LIMITES_DE_PORTADA\.texto\}/.test(tarjeta)
    && !/maxLength=/.test(tarjeta));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
