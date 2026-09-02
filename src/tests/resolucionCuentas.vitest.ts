/**
 * resolucionCuentas.vitest.ts
 *
 * Guarda permanente de los hallazgos JRN-01, JRN-02, INV-04 y ARP-02.
 *
 * Cada módulo resolvía sus cuentas contables con su propia copia de
 * `getOrCreateAccount(tx, companyId, codigo, nombre, tipo)`. Esa función busca
 * por CÓDIGO LITERAL, ignora el nombre que se le pasa, y **crea la cuenta si no
 * la encuentra**. Tres consecuencias, las tres verificadas en producción:
 *
 *   · Los códigos venían de un plan de cuentas de tres niveles que no es el que
 *     el sistema siembra. `1.1.02` se pedía como "Efectivo en Bancos" y en el
 *     catálogo real es CUENTAS POR COBRAR: ocho cheques en garantía por
 *     2.642.619,83 acabaron acreditando la deuda de los clientes.
 *   · Las cuentas creadas al vuelo nacen con `nature`, `level` y `parentId` por
 *     defecto, lo que invierte signos en la balanza y rompe los totales por
 *     jerarquía. Así aparecieron 2.1.03, 2.1.04 y 2.1.05, duplicando a
 *     2.1.02.01, 2.1.02.03 y 2.1.02.02, que ya existían.
 *   · `2.1.01` y `1.1.01` son cuentas de AGRUPACIÓN y recibían movimientos.
 *
 * La corrección estructural es un resolvedor único que lee `accounting_mappings`
 * —la tabla de configuración que llevaba desde siempre sin que ningún asiento la
 * consultara— y que **falla en vez de crear**. Está en
 * `src/services/accounting/resolverCuentas.ts` y ya lo usa el flujo de cheques
 * en garantía.
 *
 * Migrar los demás módulos es trabajo de la Fase 2.3. Mientras tanto, esta
 * prueba congela lo que queda: la lista SOLO PUEDE ENCOGER. Si alguien añade
 * una copia nueva, o una llamada nueva, falla. Cuando se migre un módulo, hay
 * que bajar su número aquí, y la prueba lo exige.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

const DEFINICION = /(async function|static async)\s+getOrCreateAccount/g;
const LLAMADA = /(?<![\w.])(?:this\.|ArRepository\.)?getOrCreateAccount\s*\(/g;

/** El código, sin comentarios: las notas de la auditoría citan la función por su nombre. */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * Deuda conocida al cerrar la corrección de cheques en garantía.
 *
 * `llamadas` no incluye la propia definición. Cada entrada desaparece cuando su
 * módulo pase a usar el resolvedor.
 */
const PENDIENTES: Record<string, { definiciones: number; llamadas: number }> = {
  'src/app/api/v1/bank/accounts/[id]/transactions/route.ts': { definiciones: 1, llamadas: 2 },
  'src/app/api/v1/expenses/route.ts':                        { definiciones: 1, llamadas: 8 },
  'src/app/api/v1/expenses/[id]/route.ts':                   { definiciones: 1, llamadas: 8 },
  'src/repositories/arRepository.ts':                        { definiciones: 1, llamadas: 2 },
  'src/services/expenseService.ts':                          { definiciones: 1, llamadas: 8 },
  'src/services/invoice/invoiceDbBooker.ts':                 { definiciones: 1, llamadas: 10 },
};

function ficherosTs(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next' || entrada === 'tests') continue;
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) ficherosTs(p, acc);
    else if (entrada.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

const MEDIDO = ficherosTs(SRC).reduce<Record<string, { definiciones: number; llamadas: number }>>(
  (acc, ruta) => {
    const contenido = sinComentarios(readFileSync(ruta, 'utf8'));
    const definiciones = (contenido.match(DEFINICION) || []).length;
    const llamadas = (contenido.match(LLAMADA) || []).length - definiciones;
    if (definiciones > 0 || llamadas > 0) {
      acc[relative(RAIZ, ruta).split('\\').join('/')] = { definiciones, llamadas: Math.max(llamadas, 0) };
    }
    return acc;
  },
  {}
);

describe('JRN-01 · resolución de cuentas contables', () => {
  it('no aparece ninguna copia nueva de getOrCreateAccount', () => {
    const nuevos = Object.keys(MEDIDO).filter((f) => !(f in PENDIENTES));
    expect(
      nuevos,
      'Estos ficheros resuelven cuentas por código literal y pueden crearlas al vuelo. ' +
        'Usa el resolvedor de src/services/accounting/resolverCuentas.ts, que valida y falla ' +
        'en vez de inventar cuentas.'
    ).toEqual([]);
  });

  it('las copias que quedan no crecen', () => {
    for (const [fichero, esperado] of Object.entries(PENDIENTES)) {
      const medido = MEDIDO[fichero];
      if (!medido) continue; // ya migrado: lo cubre la comprobación siguiente
      expect(medido.definiciones, `${fichero}: definiciones`).toBeLessThanOrEqual(esperado.definiciones);
      expect(
        medido.llamadas,
        `${fichero}: hay ${medido.llamadas} llamadas y la deuda registrada eran ${esperado.llamadas}. ` +
          'No añadas más: migra al resolvedor.'
      ).toBeLessThanOrEqual(esperado.llamadas);
    }
  });

  it('la lista de deuda no tiene entradas obsoletas', () => {
    const yaMigrados = Object.entries(PENDIENTES)
      .filter(([f, esperado]) => {
        const medido = MEDIDO[f];
        return !medido || medido.llamadas < esperado.llamadas || medido.definiciones < esperado.definiciones;
      })
      .map(([f]) => f);

    expect(
      yaMigrados,
      'Estos ficheros ya usan menos getOrCreateAccount de lo registrado: baja su número en ' +
        'PENDIENTES (o quita la entrada) para que la lista siga encogiendo.'
    ).toEqual([]);
  });

  it('el resolvedor no crea cuentas', () => {
    const resolvedor = sinComentarios(
      readFileSync(join(SRC, 'services', 'accounting', 'resolverCuentas.ts'), 'utf8')
    );
    expect(
      resolvedor.includes('.insert(chartOfAccounts)'),
      'El resolvedor nunca debe crear una cuenta: si no puede resolverla, tiene que fallar.'
    ).toBe(false);
    expect(resolvedor).toContain('accountingMappings');
    expect(resolvedor).toContain('isTransactional');
  });

  it('el flujo de cheques en garantía ya no usa códigos cableados', () => {
    for (const fichero of ['src/app/api/v1/expenses/route.ts', 'src/app/api/v1/expenses/[id]/route.ts']) {
      const contenido = sinComentarios(readFileSync(join(RAIZ, fichero), 'utf8'));
      const bloque = contenido.slice(contenido.indexOf('isGuarantee: true'));
      expect(bloque, `${fichero}: el cheque en garantía debe resolver la cuenta del banco`).toContain(
        'resolverCuentaDeBanco('
      );
      expect(bloque, `${fichero}: el cheque en garantía debe resolver la cuenta por pagar`).toContain(
        'resolverCuentaPorPagar('
      );
    }
  });
});
