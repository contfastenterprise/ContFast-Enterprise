/**
 * Lote 212 -- el linter sin errores, que era lo que paraba el CI despues del lote 211.
 *
 * Con la instalacion arreglada, el pipeline llegaba a `pnpm run lint` y se paraba: 16
 * errores en lo que ve el CI (17 en local, uno en `_referencia/`, que git ignora):
 *   - 4 `require()` en guiones CommonJS de la raiz y de scripts/, sin la linea
 *     `eslint-disable` que ya llevan los otros cinco guiones de scripts/;
 *   - `receivables-report`: el efecto llamaba a `fetchData` antes de declararla;
 *   - `bank-reconciliation` y `retentions`: `<a href>` a paginas internas, que RECARGA la
 *     aplicacion entera en vez de navegar (`<Link>`);
 *   - `reports/page.tsx`: `PdfCard` y `LinkCard` definidas DENTRO del componente, asi que
 *     cada render creaba un tipo nuevo y React remontaba todas las tarjetas;
 *   - `GraficaDonaRiesgo`: un acumulador mutado dentro del `map` del render.
 *
 * SE EJECUTA el linter, no se lee: la propiedad es "cero errores", y la da ESLint.
 *
 * Y SE DIBUJA la dona: el cambio toca algo que se ve, y un linter contento no dice que el
 * dibujo siga igual. Como esa comprobacion es cierta ANTES y DESPUES del lote por
 * definicion (existe para demostrar que nada cambio), no va como `ok()` -- regalaria un OK
 * en la contraprueba -- sino como INVARIANTE: si el dibujo cambia, el banco se para con
 * codigo 3 y lo dice.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');

let fallos = 0;
let contadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  contadas++;
  if (!c) fallos++;
};

const FICHEROS = [
  'clean-imports.js',
  'test_api.js',
  'scripts/migrate-agent.js',
  'src/app/dashboard/receivables-report/page.tsx',
  'src/app/dashboard/reports/bank-reconciliation/page.tsx',
  'src/app/dashboard/retentions/page.tsx',
  'src/app/dashboard/reports/page.tsx',
  'src/components/cartera/GraficaDonaRiesgo.tsx',
] as const;

interface ResultadoEslint {
  filePath: string;
  errorCount: number;
  messages: { ruleId: string | null; severity: number; line: number }[];
}

class InvarianteRoto extends Error {}

/** El desfase de cada arco como lo calculaba el acumulador de antes del lote. */
function desfasesDeAntes(porcentajes: number[], circunferencia: number): number[] {
  const res: number[] = [];
  let acumulado = 0;
  for (const p of porcentajes) {
    res.push(-((acumulado / 100) * circunferencia));
    acumulado += p;
  }
  return res;
}

async function dibujaIgual(): Promise<void> {
  const [React, { renderToStaticMarkup }, dona, riesgo] = await Promise.all([
    import('react'),
    import('react-dom/server'),
    import('../src/components/cartera/GraficaDonaRiesgo'),
    import('../src/services/cartera/riesgo'),
  ]);
  const niveles = ['bajo', 'medio', 'alto', 'critico'] as const;
  // Con decimales a proposito: una suma que se equivocara de orden o saltara un nivel
  // daria otros numeros, y con enteros redondos dos errores podrian compensarse.
  for (const porcentajes of [[40, 30, 20, 10], [12.5, 37.25, 0, 50.25], [100, 0, 0, 0]]) {
    const stats = niveles.map((key, i) => ({
      key,
      config: riesgo.CONFIG_RIESGO[key],
      cantidad: i + 1,
      porcentaje: porcentajes[i],
      saldo: 1000 * (i + 1),
    }));
    const html = renderToStaticMarkup(
      React.createElement(dona.GraficaDonaRiesgo, {
        stats,
        totalEntidades: 10,
        totalSaldo: 10000,
        seleccionado: null,
        onSeleccionar: () => {},
        nombrePlural: 'clientes',
      }),
    );
    const dibujados = [...html.matchAll(/stroke-dashoffset="([^"]+)"/g)].map((m) => Number(m[1]));
    const tamano = 300;
    const grosor = 32;
    const circunferencia = 2 * Math.PI * ((tamano - grosor) / 2);
    const esperados = desfasesDeAntes(porcentajes, circunferencia);
    const iguales =
      dibujados.length === esperados.length && dibujados.every((d, i) => Math.abs(d - esperados[i]) < 1e-9);
    if (!iguales) {
      throw new InvarianteRoto(
        `la dona se dibuja distinto con ${porcentajes.join('/')}: ${dibujados.join(', ')} frente a ${esperados.join(', ')}`,
      );
    }
  }
  console.log('  inv   la dona dibuja cada arco donde lo dibujaba (3 repartos, con decimales)');
}

async function main() {
  //  PRECONDICION, cierta en los DOS estados: los ocho ficheros existen.
  for (const f of FICHEROS) if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: no esta ${f}`);
  console.log('  pre   los ocho ficheros del lote existen');

  await dibujaIgual();

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) ESLint, EJECUTADO sobre todo el repositorio\n');
  // ───────────────────────────────────────────────────────────────────────────
  // ESLint sale con 1 cuando hay errores; el JSON llega igual por stdout.
  let salida = '';
  try {
    salida = execSync('pnpm exec eslint -f json', { cwd: raiz, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    salida = (e as { stdout?: string }).stdout ?? '';
  }
  const inicio = salida.indexOf('[');
  const resultados: ResultadoEslint[] = inicio >= 0 ? JSON.parse(salida.slice(inicio)) : [];
  if (resultados.length < 100) throw new Error(`Precondicion: ESLint no reviso el repositorio (${resultados.length} ficheros)`);

  const errores = resultados.flatMap((r) =>
    r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath.split(/contfast_v\.2[\\/]/)[1]}:${m.line} ${m.ruleId}`),
  );
  ok('cero errores en todo el repositorio', errores.length === 0, errores.slice(0, 4).join('; ') || `${resultados.length} ficheros`);
  ok('  y `_referencia/` (ignorada por git) no entra: local y CI dicen lo mismo',
    !resultados.some((r) => /[\\/]_referencia[\\/]/.test(r.filePath)));

  const normal = (p: string) => p.replace(/\\/g, '/');
  for (const f of FICHEROS) {
    const r = resultados.find((x) => normal(x.filePath).endsWith(`/${f}`));
    const reglas = r?.messages.filter((m) => m.severity === 2).map((m) => m.ruleId).join(', ');
    ok(`  ${f}: sin errores`, r !== undefined && r.errorCount === 0, reglas || (r ? '' : 'ESLint no lo reviso'));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} (${contadas} comprobaciones)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  if (e instanceof InvarianteRoto) {
    console.error(`INVARIANTE ROTO: ${e.message}`);
    process.exit(3);
  }
  console.error(e);
  process.exit(2);
});
