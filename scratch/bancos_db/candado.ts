/**
 * Candado de la base desechable de los bancos de integracion.
 *
 * POR QUE EXISTE
 * --------------
 * Los 33 bancos de `deuda_bancos.txt` ESCRIBEN: insertan, actualizan y, a
 * traves de `_limpieza.ts`, hacen `TRUNCATE ... CASCADE` de TODAS las tablas
 * transaccionales. Apuntados a la base real, borrarian facturas, asientos y
 * cobros de todas las empresas. Por eso llevaban semanas sin correr.
 *
 * Esto se precarga (`tsx --import`) antes que el banco, y se usa desde
 * `_limpieza.ts` antes de vaciar nada. Deja pasar solo si se cumplen LAS DOS:
 *
 *   1. `DATABASE_URL` apunta a 127.0.0.1:55432/contfast_bancos (el cluster que
 *      monta `base_desechable.ps1`, fuera del repositorio);
 *   2. la base lleva el comentario MARCA, que solo pone ese mismo guion al
 *      crearla. Un nombre de base se puede repetir por error; la marca no.
 *
 * Se comprueba con una conexion propia y NO con `src/db`: importar `src/db`
 * abre el pool contra lo que diga el entorno, y el candado tiene que decidir
 * antes de que nada de la aplicacion toque la base.
 */
import postgres from 'postgres';

export const MARCA = 'contfast: base DESECHABLE de los bancos de integracion';
const HOST = '127.0.0.1';
const PUERTO = '55432';
const BASE = 'contfast_bancos';

export function motivoDeRechazoUrl(url: string | undefined): string | null {
  if (!url) return 'DATABASE_URL no esta definida';
  let u: URL;
  try { u = new URL(url); } catch { return 'DATABASE_URL no es una URL valida'; }
  if (u.hostname !== HOST) return `el host es ${u.hostname}, no ${HOST}`;
  if (u.port !== PUERTO) return `el puerto es ${u.port || '(por defecto)'}, no ${PUERTO}`;
  if (u.pathname.replace(/^\//, '') !== BASE) return `la base es ${u.pathname.replace(/^\//, '')}, no ${BASE}`;
  return null;
}

export async function exigirBaseDesechable(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const motivo = motivoDeRechazoUrl(url);
  if (motivo) throw new Error(`CANDADO: no es la base desechable (${motivo}). No se ejecuta nada.`);

  const sql = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [fila] = await sql<{ marca: string | null }[]>`
      SELECT shobj_description(d.oid, 'pg_database') AS marca
      FROM pg_database d WHERE d.datname = current_database()`;
    if (fila?.marca !== MARCA) {
      throw new Error('CANDADO: la base no lleva la marca de desechable. Creala con base_desechable.ps1 -Accion reiniciar.');
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}
