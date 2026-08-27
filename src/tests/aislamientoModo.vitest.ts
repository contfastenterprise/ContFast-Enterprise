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

/** Texto de la sentencia que contiene la posicion dada. */
function sentencia(texto: string, i: number): string {
  const ini = Math.max(texto.lastIndexOf(';', i), texto.lastIndexOf('{', i), texto.lastIndexOf('}', i)) + 1;
  const fin = texto.indexOf(';', i);
  return texto.slice(ini, fin === -1 ? texto.length : fin);
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
