/**
 * aislamientoModo.vitest.ts
 *
 * Guarda permanente del grupo A de la auditoria.
 *
 * Cuarenta tablas llevan columna `modo` para separar PRUEBA de PRODUCCION, y
 * todas tienen DEFAULT 'PRODUCCION'. Eso hace que olvidar el campo en un INSERT
 * no falle: la fila se guarda igual, en PRODUCCION, sin importar el entorno de
 * la sesion. Trabajar en PRUEBA escribia sobre los datos reales.
 *
 * Como el fallo es silencioso por diseno de la columna, no basta con haberlo
 * corregido una vez: esta prueba recorre el codigo y falla si alguien anade un
 * INSERT nuevo sin fijar `modo`.
 *
 * No sustituye a las pruebas de comportamiento (scratch/verificar_grupo_a.ts
 * ejercita las rutas contra una base real); cubre lo que aquellas no pueden,
 * que es el codigo que todavia no existe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

/**
 * INSERT cuyos valores se arman en una variable o un array previo, donde `modo`
 * si viaja pero fuera de la sentencia. Cada excepcion se comprueba a mano y se
 * anota aqui con el motivo; la lista no debe crecer sin revisarla.
 */
const EXCEPCIONES: Record<string, string> = {
  'src/repositories/bankRepository.ts': 'values([bankAccountLine, contraAccountLine]) — ambos literales fijan modo unas lineas antes',
  'src/services/financialMovementService.ts': 'values(chunk) — el array se arma con modo en autoSeedMovements',
};

function ficheros(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === 'tests' || nombre === 'node_modules') continue;
      salida.push(...ficheros(ruta));
    } else if (/\.tsx?$/.test(ruta) && !ruta.includes(join('db', 'schema'))) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Tablas declaradas con columna `modo` en el esquema. */
function tablasConModo(): Set<string> {
  const dir = join(SRC, 'db', 'schema');
  const con = new Set<string>();
  for (const nombre of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const texto = readFileSync(join(dir, nombre), 'utf8');
    const re = /export const (\w+) = pgTable\('[\w_]+',\s*\{([\s\S]*?)\n\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      if (m[2].includes('environmentMode(')) con.add(m[1]);
    }
  }
  return con;
}

/**
 * Texto de la sentencia que empieza en la posicion dada.
 *
 * Avanza contando parentesis y llaves, y corta en el primer `;` que aparece a
 * profundidad cero. Hace falta esa precision: una cadena como
 * `.update(t).set({ ... }).where(...)` lleva llaves y saltos de linea en medio,
 * y cortar por el primer `;` o por la llave anterior parte la sentencia y hace
 * creer que al `where` le falta un filtro que si esta.
 */
function sentencia(texto: string, i: number): string {
  let prof = 0;
  for (let j = i; j < texto.length; j++) {
    const c = texto[j];
    if (c === '(' || c === '{' || c === '[') prof++;
    else if (c === ')' || c === '}' || c === ']') prof--;
    else if (c === ';' && prof <= 0) return texto.slice(i, j);
  }
  return texto.slice(i);
}

/**
 * Muchas consultas no escriben el filtro a mano: pasan un predicado ya armado,
 * como `.where(alcance)` o `.where(cond(payrolls))`. Eso es correcto y ademas
 * preferible, pero leyendo solo la sentencia parece que falta el filtro. Aqui se
 * resuelve el identificador contra su definicion en el mismo fichero.
 */
function aplicaPredicadoConModo(texto: string, st: string, tabla: string): boolean {
  const m = /\.where\(\s*([A-Za-z_$][\w$]*)\s*[()]/.exec(st);
  if (!m) return false;
  const nombre = m[1];
  const def = new RegExp(`(?:const|let|function)\\s+${nombre}\\b`).exec(texto);
  if (!def) return false;
  // La definicion es corta en la practica; con mirar lo que sigue basta.
  const cuerpo = texto.slice(def.index, def.index + 400);
  // Vale por el modo o por la clave primaria: son las dos formas de acotar, y
  // al predicado auxiliar se le aplica el mismo criterio que a la sentencia.
  return /\.modo\b/.test(cuerpo) || new RegExp(`eq\\(\\s*${tabla}\\.id\\b`).test(cuerpo);
}

describe('aislamiento por entorno — INSERT', () => {
  const CON_MODO = tablasConModo();

  it('el esquema declara las tablas transaccionales con modo', () => {
    // Si este numero cae, alguien quito la columna de una tabla y hay que
    // enterarse aqui, no en produccion.
    expect(CON_MODO.size).toBeGreaterThanOrEqual(40);
    for (const t of ['invoices', 'expenses', 'journalEntries', 'payrolls', 'inventoryLevels', 'checks']) {
      expect(CON_MODO.has(t)).toBe(true);
    }
  });

  it('todo INSERT sobre una tabla con modo fija el modo', () => {
    const olvidos: string[] = [];

    for (const ruta of ficheros(SRC)) {
      const rel = relative(RAIZ, ruta).split('\\').join('/');
      const texto = readFileSync(ruta, 'utf8');
      const re = /\.insert\((\w+)\)/g;
      let m: RegExpExecArray | null;

      while ((m = re.exec(texto))) {
        const tabla = m[1];
        if (!CON_MODO.has(tabla)) continue;
        if (EXCEPCIONES[rel]) continue;

        const st = sentencia(texto, m.index);
        const fijaModo = /\bmodo\s*[,:]/.test(st) || st.includes(`${tabla}.modo`);
        if (!fijaModo) {
          const linea = texto.slice(0, m.index).split('\n').length;
          olvidos.push(`${rel}:${linea} — insert(${tabla}) sin modo`);
        }
      }
    }

    expect(olvidos, `\n${olvidos.join('\n')}\n\nAnade \`modo\` al INSERT. La columna tiene DEFAULT 'PRODUCCION', ` +
      'asi que olvidarlo NO falla: guarda la fila en el entorno equivocado sin avisar.').toEqual([]);
  });

  /**
   * Grupo C de la auditoria. Un UPDATE o un DELETE que no se localiza por clave
   * primaria alcanza a todas las filas que cumplan el criterio, y si el criterio
   * no incluye el entorno, alcanza tambien a las del otro. Asi la conciliacion
   * bancaria marcaba como conciliados los movimientos de PRUEBA: filtraba por
   * cuenta y rango de fechas, y una fecha no distingue entornos.
   *
   * Localizar por `id` si es suficiente: el UUID pertenece a una sola fila y por
   * tanto a un solo entorno.
   */
  it('todo UPDATE/DELETE no localizado por id filtra por modo', () => {
    // Excepciones revisadas una a una. Cada una lleva su motivo en el codigo.
    const PERMITIDO = [
      // La cola no lleva el modo en el payload, pero invoiceId ya fija el entorno:
      // una factura vive en uno solo y todos sus envios comparten el suyo.
      'src/infrastructure/jobRunners.ts',
      'src/infrastructure/worker.ts',
      // Ante un token robado hay que cerrar TODAS las sesiones del usuario,
      // tambien las de otras empresas y las del otro entorno.
      'src/middleware/auth.ts',
    ];

    const olvidos: string[] = [];

    for (const ruta of ficheros(SRC)) {
      const rel = relative(RAIZ, ruta).split('\\').join('/');
      if (PERMITIDO.includes(rel)) continue;
      const texto = readFileSync(ruta, 'utf8');
      const re = /\.(update|delete)\((\w+)\)/g;
      let m: RegExpExecArray | null;

      while ((m = re.exec(texto))) {
        const tabla = m[2];
        if (!CON_MODO.has(tabla)) continue;

        const st = sentencia(texto, m.index);
        const porClave = new RegExp(`eq\\(\\s*${tabla}\\.id\\b`).test(st);
        if (porClave || st.includes(`${tabla}.modo`) || /\bmodo\s*[,:]/.test(st)) continue;
        if (aplicaPredicadoConModo(texto, st, tabla)) continue;

        const linea = texto.slice(0, m.index).split('\n').length;
        olvidos.push(`${rel}:${linea} — ${m[1]}(${tabla}) sin modo y sin localizar por id`);
      }
    }

    expect(olvidos, `\n${olvidos.join('\n')}\n\nUn ${'UPDATE/DELETE'} por criterios amplios alcanza ` +
      'tambien las filas del otro entorno. Anade el filtro por modo, o localizalo por id.').toEqual([]);
  });

  it('las excepciones anotadas siguen existiendo y siguen fijando el modo', () => {
    // Una excepcion que se queda obsoleta es un agujero silencioso: si el
    // fichero cambia de forma, hay que revisarla en vez de arrastrarla.
    for (const [rel, motivo] of Object.entries(EXCEPCIONES)) {
      const texto = readFileSync(join(RAIZ, rel), 'utf8');
      expect(texto, `${rel} ya no fija modo en ninguna parte — revisa la excepcion: ${motivo}`)
        .toMatch(/\bmodo[,:]/);
    }
  });
});
