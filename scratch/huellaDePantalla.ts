/**
 * Lotes 253 en adelante: lo que un banco de "partir una pagina sin cambiar lo que hace" necesita.
 *
 *  · `huella(src)`: lo VISIBLE de un fichero de pantalla -- clases, textos entre etiquetas,
 *    `placeholder`, `title`, `aria-label`, avisos (`toast.*`) y direcciones de la API --, con
 *    repetidos (lote 239: comparar como conjunto dejo pasar un mutante).
 *  · `diferencia(a, b)`: lo que sobra y lo que falta entre dos huellas.
 *  · `piezas(src)`: cada componente y hook del fichero, con sus lineas.
 *  · `enCommit(commit, ruta)`: el fichero tal como estaba en un commit (para comparar con el
 *    estado de antes sin depender de la carpeta).
 */
import { execFileSync } from 'child_process';

export function enCommit(commit: string, ruta: string): string {
  return execFileSync('git', ['show', `${commit}:${ruta}`], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).replace(/\r\n/g, '\n');
}

export function huella(src: string): string[] {
  const s = src.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const salida: string[] = [];
  for (const m of s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) salida.push(`clase:${(m[1] ?? m[2]).replace(/\s+/g, ' ').trim()}`);
  for (const m of s.matchAll(/\b(placeholder|title|aria-label)="([^"]*)"/g)) salida.push(`${m[1]}:${m[2]}`);
  for (const m of s.matchAll(/toast\.(?:success|error|warning|info|loading)\(\s*(['`])([^'`]*)\1/g)) salida.push(`aviso:${m[2]}`);
  //  La direccion entera, con sus `${...}` (lote 255: cortarla en el primero dejaba pasar un cambio despues).
  for (const m of s.matchAll(/['`](\/api\/v1\/[^'`?]*)/g)) salida.push(`api:${m[1]}`);
  //  El '>' de una flecha (=>) no abre texto visible. El de una etiqueta multilinea, solo en su
  //  linea, si: por eso no se excluye el que va tras espacios.
  //  Lote 255: tambien el texto que va seguido de una expresion (`Historial {cargando && ...}`).
  for (const m of s.matchAll(/(?<!=)>([^<>{}]*[A-Za-zÁÉÍÓÚáéíóúñÑ][^<>{}]*)(?=[<{])/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    //  El cierre de un tipo genérico (`ReturnType<typeof useX>;`) no es texto: lo de detrás es código.
    if (t.startsWith(';')) continue;
    if (t &&!/^[\w.]+$/.test(t.replace(/\s/g, '')) || /\s/.test(t)) salida.push(`texto:${t}`);
  }
  return salida.sort();
}

export function diferencia(antes: string[], despues: string[]): { faltan: string[]; sobran: string[] } {
  const cuenta = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const a = cuenta(antes), d = cuenta(despues);
  const faltan: string[] = [], sobran: string[] = [];
  for (const [k, n] of a) for (let i = (d.get(k) ?? 0); i < n; i++) faltan.push(k);
  for (const [k, n] of d) for (let i = (a.get(k) ?? 0); i < n; i++) sobran.push(k);
  return { faltan, sobran };
}

/** Los componentes y hooks de nivel superior del fichero, con cuantas lineas tiene cada uno. */
export function piezas(src: string): { nombre: string; lineas: number }[] {
  const lineas = src.replace(/\r\n/g, '\n').split('\n');
  const salida: { nombre: string; lineas: number }[] = [];
  let actual: { nombre: string; desde: number } | null = null;
  lineas.forEach((l, i) => {
    const m = /^(?:export default )?function ([A-Za-z]\w*)\b/.exec(l);
    if (m) {
      if (actual) salida.push({ nombre: actual.nombre, lineas: i - actual.desde });
      actual = { nombre: m[1], desde: i };
    } else if (actual && l === '}') {
      salida.push({ nombre: actual.nombre, lineas: i - actual.desde + 1 });
      actual = null;
    }
  });
  return salida;
}
