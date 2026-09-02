/**
 * cobroDeCheques.vitest.ts
 *
 * Guarda permanente del hallazgo ARP-25.
 *
 * `ApService.applyDueGuaranteeChecks` buscaba todos los cheques en garantía con
 * `dueDate <= hoy` y los daba por cobrados. Sin más condición. Por cada uno
 * marcaba el cheque `cleared`, restaba el importe del saldo bancario, insertaba
 * un movimiento de banco con `status: 'reconciled'` cableado, y asentaba.
 *
 * La fecha de vencimiento de un cheque en garantía es la que se pactó con el
 * proveedor para presentarlo. NO es la fecha en que el banco lo paga, y en un
 * cheque en garantía puede que no lo pague nunca: para eso es en garantía. El
 * sistema convertía una fecha pactada en un hecho bancario, y el `reconciled`
 * cableado impedía que la conciliación bancaria lo detectara.
 *
 * Verificado en producción (empresa 38a1a51e, agosto 2026): cuatro cheques por
 * 1.000.782,79 dados por cobrados al vencer. Los saldos del módulo de bancos se
 * fueron a negativo y hubo que taparlos con dos "ajustes" de 1.368.188,89 que
 * acabaron contra la cuenta de agrupación 1.1.01, uno de ellos con el debe y el
 * haber contra sí misma.
 *
 * Estas pruebas no ejecutan el flujo: leen el código. Su trabajo es que nadie
 * reintroduzca el automatismo sin darse cuenta.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

/** El código, sin comentarios: las notas de la auditoría citan los nombres viejos. */
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

describe('ARP-25 · un cheque en garantía no se cobra por vencer', () => {
  it('no queda ningún camino que aplique cheques sólo por fecha de vencimiento', () => {
    const culpables = ficherosDeCodigo(SRC)
      .filter((f) => sinComentarios(readFileSync(f, 'utf8')).includes('applyDueGuaranteeChecks'))
      .map((f) => relative(RAIZ, f).split('\\').join('/'));

    expect(
      culpables,
      'Vencer no es cobrar. Un cheque en garantía sólo se aplica cuando una persona confirma, ' +
        'contra el estado de cuenta, que el banco lo pagó. Usa confirmarCobroDeChequesEnGarantia.'
    ).toEqual([]);
  });

  it('la confirmación exige la lista de cheques y la fecha de cobro', () => {
    const svc = leer('src/services/apService.ts');
    expect(svc).toContain('confirmarCobroDeChequesEnGarantia');
    expect(
      svc,
      'Sin lista explícita de cheques la función tiene que fallar, no aplicar todo lo vencido.'
    ).toMatch(/checkIds\.length === 0[\s\S]{0,600}throw new Error/);
    expect(
      svc,
      'La fecha de cobro es la del estado de cuenta y es obligatoria: sin ella el asiento sale con la del servidor.'
    ).toMatch(/!fechaCobro[\s\S]{0,300}throw new Error/);
  });

  it('la fecha de cobro se valida y no puede ser futura', () => {
    const svc = leer('src/services/apService.ts');
    expect(svc).toContain('validarFechaDeCobro');
    expect(
      svc,
      'Un cheque no está cobrado hasta que el banco lo paga: la fecha no puede estar en el futuro.'
    ).toMatch(/fecha\.getTime\(\) > hoy\.getTime\(\)[\s\S]{0,300}throw new Error/);
    expect(
      svc,
      'La fecha se construye a medianoche LOCAL: new Date("AAAA-MM-DD") es medianoche UTC y en UTC-4 ' +
        'devuelve el día anterior, el mismo fallo que hubo en el cálculo de vacaciones.'
    ).toContain('new Date(anio, mes - 1, dia)');
  });

  it('ningún movimiento bancario de cheques nace conciliado', () => {
    const svc = leer('src/services/apService.ts');
    expect(
      svc.includes("status: 'reconciled'"),
      'Un movimiento no puede nacer conciliado: lo concilia una persona contra el estado de cuenta. ' +
        'Mientras nazca conciliado, la conciliación bancaria nunca podrá detectar un movimiento que no ocurrió.'
    ).toBe(false);
  });

  it('la ruta rechaza una petición sin cheques seleccionados', () => {
    const ruta = leer('src/app/api/v1/ap/payments/apply-guarantees/route.ts');
    expect(ruta).not.toContain('applyDueGuaranteeChecks');
    expect(
      ruta,
      'Un cuerpo vacío significaba "aplica todos los vencidos". Ahora tiene que rechazarse.'
    ).toContain('CONFIRMACION_REQUERIDA');
    expect(ruta).toMatch(/!checkId && \(!checkIds \|\| checkIds\.length === 0\)/);
  });

  it('la consulta de pendientes admite una lista explícita de cheques', () => {
    const repo = leer('src/repositories/apRepository.ts');
    expect(repo).toMatch(/findPendingGuaranteeChecks\([\s\S]{0,400}checkIds\?: string\[\]/);
    expect(
      repo,
      'Con lista explícita manda la lista, no el vencimiento: una persona puede confirmar un cheque ' +
        'que el banco pagó antes de la fecha pactada.'
    ).toContain('inArray(checks.id, checkIds)');
  });

  it('la pantalla envía los cheques que el usuario marcó', () => {
    const ui = leer('src/app/dashboard/ap/page.tsx');
    expect(ui).toContain('chequesConfirmados');
    expect(ui).toContain('checkIds: chequesConfirmados');
    expect(
      ui,
      'El botón no puede estar activo sin cheques marcados: es lo que reintroduciría el automatismo.'
    ).toContain('chequesConfirmados.length === 0');
  });
});
