/**
 * trazabilidadContable.vitest.ts
 *
 * Guarda permanente de dos hallazgos de la Fase 2.
 *
 * ── JRN-16 · un asiento sin autor no es auditable ───────────────────────────
 *
 * `journal_entries` no guardaba quién registró el asiento. El 14/07/2026, en la
 * empresa 38a1a51e, apareció un asiento DUPLICADO de 545.724,30 de la compra con
 * NCF E310000012204. No hubo forma de saber de dónde salió —doble clic, reintento
 * por timeout, o alguien registrándolo dos veces— porque el asiento no llevaba
 * autor y `audit_logs` sólo tenía entradas y salidas de sesión.
 *
 * ── JRN-11 · un control no puede crear el dato que valida ───────────────────
 *
 * `isPeriodOpen` creaba un período abierto cuando la empresa no tenía ninguno, y
 * devolvía true. Sólo saltaba con cero períodos, de modo que una empresa con los
 * períodos de un año y ninguno del siguiente se quedaba bloqueada sin
 * explicación. Le pasó a la empresa 38a1a51e: tenía julio de 2026 y no tenía
 * agosto, y desde el día 1 no pudo asentar nada.
 *
 * Estas pruebas leen el código: su trabajo es que ninguno de los dos vuelva.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const leer = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), 'utf8'));

function ficherosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next' || entrada === 'tests') continue;
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) ficherosDeCodigo(p, acc);
    else if (entrada.endsWith('.ts') || entrada.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

/**
 * Devuelve los argumentos de cada llamada a `createJournalEntry(...)`, contando
 * paréntesis hasta cerrar. Una búsqueda por líneas no serviría: las llamadas
 * ocupan entre seis y treinta líneas según cuántos renglones lleve el asiento.
 */
function argumentosDeLasLlamadas(fuente: string): string[] {
  const bloques: string[] = [];
  const marca = 'createJournalEntry(';
  let desde = 0;

  for (;;) {
    const i = fuente.indexOf(marca, desde);
    if (i === -1) break;
    desde = i + marca.length;

    // La definición del método, no una llamada.
    if (/(?:static\s+async|async\s+function)\s+$/.test(fuente.slice(Math.max(0, i - 30), i))) continue;

    let profundidad = 1;
    let j = desde;
    while (j < fuente.length && profundidad > 0) {
      if (fuente[j] === '(') profundidad++;
      else if (fuente[j] === ')') profundidad--;
      j++;
    }
    bloques.push(fuente.slice(desde, j - 1));
  }
  return bloques;
}

describe('JRN-16 · todo asiento registra quién lo hizo', () => {
  it('la columna existe en el esquema', () => {
    const esquema = leer('src/db/schema/accounting.ts');
    expect(esquema).toContain("createdBy: uuid('created_by')");
    expect(
      esquema,
      'Si se borra el usuario el asiento tiene que quedarse: un asiento contable no desaparece ' +
        'porque se vaya un empleado.'
    ).toMatch(/created_by[\s\S]{0,120}onDelete: 'set null'/);
  });

  it('el repositorio la persiste', () => {
    const repo = leer('src/repositories/accountingRepository.ts');
    expect(repo).toContain('createdBy?: string | null;');
    expect(repo).toMatch(/createdBy: \(data as any\)\.createdBy \|\| null/);
  });

  it('ninguna llamada a createJournalEntry deja el asiento sin autor', () => {
    const huerfanas: string[] = [];

    for (const fichero of ficherosDeCodigo(SRC)) {
      const rel = relative(RAIZ, fichero).split('\\').join('/');
      if (rel.endsWith('accountingRepository.ts')) continue; // ahí vive la definición
      const fuente = sinComentarios(readFileSync(fichero, 'utf8'));
      for (const args of argumentosDeLasLlamadas(fuente)) {
        if (!args.includes('createdBy')) huerfanas.push(rel);
      }
    }

    expect(
      huerfanas,
      'Este asiento no guarda quién lo registró. Pasa `createdBy` con el usuario de la sesión: ' +
        'sin autor, un asiento duplicado o equivocado no se puede explicar después.'
    ).toEqual([]);
  });
});

describe('JRN-11 · los períodos contables se siembran, no se improvisan', () => {
  it('isPeriodOpen ya no crea períodos', () => {
    const repo = leer('src/repositories/accountingRepository.ts');
    const desde = repo.indexOf('static async isPeriodOpen');
    const hasta = repo.indexOf('static async createJournalEntry');
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);

    const cuerpo = repo.slice(desde, hasta);
    expect(
      cuerpo.includes('insert(accountingPeriods)'),
      'Un control que crea el dato que está validando no valida nada. Si no hay período, ' +
        'isPeriodOpen tiene que devolver false y quien llama debe fallar con un mensaje claro.'
    ).toBe(false);
  });

  it('el sembrador cubre los dos entornos y es idempotente', () => {
    const repo = leer('src/repositories/accountingRepository.ts');
    expect(repo).toContain('sembrarPeriodosContables');
    expect(
      repo,
      'Los dos entornos: sembrar sólo PRODUCCION deja el de prácticas bloqueado.'
    ).toMatch(/\['PRODUCCION', 'PRUEBA'\] as const/);
    expect(
      repo,
      'Tiene que poder llamarse dos veces sin duplicar períodos.'
    ).toContain('yaEstan.has(');
  });

  it('las tres altas de empresa siembran los períodos', () => {
    const rutas = [
      'src/app/api/v1/admin/companies/route.ts',
      'src/app/api/v1/auth/register/route.ts',
      'src/app/api/v1/setup/confirm/route.ts',
    ];
    const sinSembrar = rutas.filter((r) => !leer(r).includes('sembrarPeriodosContables'));
    expect(
      sinSembrar,
      'Una empresa que nace sin períodos no puede asentar nada, y el error que ve el usuario ' +
        'no dice que falte abrir el período.'
    ).toEqual([]);
  });

  it('el error de período dice qué hay que hacer', () => {
    const repo = leer('src/repositories/accountingRepository.ts');
    expect(repo).toContain('Contabilidad > Períodos');
  });
});

describe('ARP-25 · el movimiento bancario manual tampoco nace conciliado', () => {
  it('bankRepository no cablea el estado', () => {
    const repo = leer('src/repositories/bankRepository.ts');
    expect(
      repo.includes("status: 'reconciled'"),
      'Conciliar es cotejar el movimiento contra el estado de cuenta del banco, y eso no lo puede ' +
        'hacer el mismo código que acaba de crearlo.'
    ).toBe(false);
  });
});
