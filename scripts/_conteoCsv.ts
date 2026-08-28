/**
 * Lectura del CSV de conteo fisico.
 *
 * Se separa de `inventario_negativo.ts` porque no tiene nada que ver con el
 * dominio: es tolerancia a lo que produce Excel en un equipo dominicano.
 *
 * Lo que aguanta:
 *   - separador  ,  ;  o tabulador  (se detecta por la cabecera)
 *   - BOM inicial, saltos CRLF, lineas en blanco
 *   - campos entrecomillados con comillas dobles duplicadas dentro
 *   - cabeceras con acentos, mayusculas y espacios
 *
 * Lo que NO adivina: un numero como "1.000" o "1,000". Puede ser mil o puede
 * ser uno con tres decimales, y este fichero decide la existencia de un almacen
 * entero. Ante la duda corta la ejecucion y pide que se escriba sin ambiguedad.
 */
import { readFileSync } from 'fs';

export interface LineaConteo {
  sku: string;
  cantidad: number;
  /** Numero de linea en el fichero, para que los avisos sean accionables. */
  linea: number;
}

/** Quita acentos, mayusculas y todo lo que no sea alfanumerico. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ALIAS_SKU = ['sku', 'codigo', 'code', 'referencia', 'ref'];
const ALIAS_CANTIDAD = [
  'cantidadcontada', 'cantidad', 'contado', 'conteo', 'cantidadfisica',
  'fisico', 'existencia', 'existenciafisica', 'qty',
];

/** Parte una linea respetando las comillas dobles. */
function partir(linea: string, sep: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let dentro = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (dentro) {
      if (c === '"') {
        if (linea[i + 1] === '"') { actual += '"'; i++; } // comilla escapada
        else dentro = false;
      } else actual += c;
    } else if (c === '"') {
      dentro = true;
    } else if (c === sep) {
      campos.push(actual);
      actual = '';
    } else actual += c;
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

function detectarSeparador(cabecera: string): string {
  const candidatos = [';', ',', '\t'];
  let mejor = ',';
  let max = 0;
  for (const sep of candidatos) {
    const n = partir(cabecera, sep).length;
    if (n > max) { max = n; mejor = sep; }
  }
  return mejor;
}

/**
 * Convierte el texto de una cantidad a numero.
 *
 * Rechaza los casos ambiguos en vez de elegir por su cuenta: "1.000" puede ser
 * mil (formato dominicano) o uno con tres decimales (formato ingles), y
 * equivocarse aqui son mil unidades de diferencia en el almacen.
 */
export function leerCantidad(texto: string, donde: string): number {
  let s = texto.trim().replace(/\s/g, '').replace(/^\+/, '');
  if (!s) throw new Error(`${donde}: la cantidad esta vacia.`);

  const negativo = s.startsWith('-');
  if (negativo) s = s.slice(1);

  if (!/^[0-9.,]+$/.test(s)) {
    throw new Error(`${donde}: "${texto}" no es una cantidad.`);
  }

  const ambiguo = (valor: string) =>
    new Error(
      `${donde}: "${texto}" es ambiguo. Puede leerse como ${valor} o como ` +
        `${valor.replace(/[.,]/g, '')} segun si el separador es decimal o de millares. ` +
        'Escribelo sin separador de millares (1000 o 1000.5) y vuelve a ejecutar.'
    );

  const puntos = s.split('.').length - 1;
  const comas = s.split(',').length - 1;

  if (puntos > 0 && comas > 0) {
    // Con los dos presentes no hay duda: el ultimo que aparece es el decimal.
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const millares = decimal === '.' ? ',' : '.';
    s = s.split(millares).join('');
    if (decimal === ',') s = s.replace(',', '.');
  } else if (puntos > 1 || comas > 1) {
    // Repetido solo puede ser separador de millares: 1.234.567
    s = s.split(puntos > 1 ? '.' : ',').join('');
  } else if (puntos === 1 || comas === 1) {
    const sep = puntos === 1 ? '.' : ',';
    const fraccion = s.slice(s.indexOf(sep) + 1);
    const entera = s.slice(0, s.indexOf(sep));
    // Exactamente tres cifras detras y algo delante: no se puede distinguir.
    if (fraccion.length === 3 && entera.length > 0) throw ambiguo(s);
    s = s.replace(sep, '.');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`${donde}: "${texto}" no es una cantidad.`);
  return negativo ? -n : n;
}

/**
 * Lee el fichero y devuelve una linea por fila valida.
 *
 * No agrupa los SKU repetidos: eso lo decide quien llama, porque una hoja de
 * conteo real puede listar el mismo producto en varias estanterias y sumarlo en
 * silencio taparia tambien un error de captura.
 */
export function leerConteo(ruta: string): LineaConteo[] {
  const bruto = readFileSync(ruta, 'utf8').replace(/^\ufeff/, '');
  const lineas = bruto.split(/\r?\n/);

  const iCabecera = lineas.findIndex((l) => l.trim() !== '');
  if (iCabecera === -1) throw new Error(`${ruta} esta vacio.`);

  const sep = detectarSeparador(lineas[iCabecera]);
  const cabecera = partir(lineas[iCabecera], sep).map(normalizar);

  const iSku = cabecera.findIndex((c) => ALIAS_SKU.includes(c));
  const iCantidad = cabecera.findIndex((c) => ALIAS_CANTIDAD.includes(c));

  if (iSku === -1 || iCantidad === -1) {
    throw new Error(
      `${ruta}: no encuentro las columnas. Hacen falta una de [${ALIAS_SKU.join(', ')}] ` +
        `y una de [${ALIAS_CANTIDAD.join(', ')}]. La cabecera leida fue: ` +
        `${partir(lineas[iCabecera], sep).join(' | ')}`
    );
  }

  const filas: LineaConteo[] = [];
  for (let i = iCabecera + 1; i < lineas.length; i++) {
    if (lineas[i].trim() === '') continue;

    const campos = partir(lineas[i], sep);
    const sku = (campos[iSku] || '').trim();
    const cantidadTexto = (campos[iCantidad] || '').trim();

    // Una fila sin SKU y sin cantidad es relleno del fichero; se ignora. Una
    // con SKU pero sin cantidad es un descuido y hay que decirlo.
    if (!sku && !cantidadTexto) continue;
    if (!sku) throw new Error(`Linea ${i + 1} de ${ruta}: hay cantidad pero no SKU.`);

    filas.push({
      sku,
      cantidad: leerCantidad(cantidadTexto, `Linea ${i + 1} de ${ruta} (SKU ${sku})`),
      linea: i + 1,
    });
  }

  if (filas.length === 0) throw new Error(`${ruta}: no tiene ninguna fila de datos.`);
  return filas;
}
