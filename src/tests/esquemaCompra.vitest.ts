/**
 * esquemaCompra.vitest.ts
 *
 * Guarda de P2-34, lote 1: la compra se valida con UN esquema, compartido por el
 * alta, la edición y la pantalla.
 *
 * Antes cada uno tenía su propia cadena de `if`: la pantalla soltaba un aviso
 * efímero sin marcar ningún campo, y el servidor repetía las mismas reglas a
 * mano con otros mensajes. Las reglas son condicionales —formal/menor, monto
 * general/líneas, cheque— y por eso aquí se EJECUTAN, no se leen: un examen del
 * código no distingue un `superRefine` bien hecho de uno que deja pasar todo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { esquemaCompra, erroresPorCampo } from '@/schemas/compra';

const RAIZ = join(__dirname, '..', '..');
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const leer = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), 'utf8'));

/** Una compra formal con líneas, completa. Cada prueba rompe una cosa. */
const base = () => ({
  supplierId: 'sup-1',
  isMinorExpense: false,
  isGeneralAmount: false,
  expenseType: '02',
  ncf: 'B0100000001',
  issueDate: '2026-09-09',
  paymentMethod: '01',
  amount: 1000,
  itbis: 180,
  description: '',
  debitAccountId: null,
  lines: [{ productId: 'p-1', description: 'Cosa', quantity: 1, unitCost: 1000, subtotal: 1000, itbis: 180, total: 1180 }],
  guaranteeCheck: null,
});

const fallos = (cuerpo: unknown) => {
  const r = esquemaCompra.safeParse(cuerpo);
  return r.success ? {} : erroresPorCampo(r.error);
};

describe('P2-34 · una compra completa pasa', () => {
  it('formal con líneas', () => {
    expect(fallos(base())).toEqual({});
  });

  it('gasto menor sin suplidor ni NCF', () => {
    expect(fallos({ ...base(), isMinorExpense: true, supplierId: null, ncf: null })).toEqual({});
  });

  it('monto general con concepto y cuenta', () => {
    expect(
      fallos({ ...base(), isGeneralAmount: true, lines: [], description: 'Alquiler', debitAccountId: 'acc-1' })
    ).toEqual({});
  });
});

describe('P2-34 · cada regla marca SU campo', () => {
  it('formal sin suplidor', () => {
    expect(fallos({ ...base(), supplierId: '' })).toEqual({ supplierId: 'Selecciona un suplidor' });
  });

  it('formal sin NCF', () => {
    expect(fallos({ ...base(), ncf: '' })).toEqual({ ncf: 'Ingresa el NCF de la factura' });
  });

  it('formal con NCF mal formado', () => {
    expect(fallos({ ...base(), ncf: 'X123' }).ncf).toMatch(/formato del NCF es inválido/);
  });

  it('gasto menor con e-NCF', () => {
    expect(fallos({ ...base(), isMinorExpense: true, supplierId: null, ncf: 'E310100000001' })).toEqual({
      ncf: 'Esta compra no puede guardarse como gasto menor ya que tiene e-NCF',
    });
  });

  it('monto general: subtotal, concepto y cuenta, cada uno en su sitio', () => {
    expect(fallos({ ...base(), isGeneralAmount: true, lines: [], amount: 0, description: '  ', debitAccountId: '' })).toEqual({
      amount: 'El subtotal de la compra debe ser mayor a 0',
      description: 'El concepto general (descripción) es obligatorio',
      debitAccountId: 'Selecciona la cuenta contable de costo/gasto',
    });
  });

  it('sin monto general y sin líneas', () => {
    expect(fallos({ ...base(), lines: [] })).toEqual({ lines: 'Agrega al menos una línea' });
  });

  it('el cheque de garantía viene entero o marca lo que falta', () => {
    const conCheque = {
      ...base(),
      paymentMethod: '04',
      guaranteeCheck: { bankAccountId: '', checkNumber: ' ', payee: 'X', amount: 0, issueDate: '2026-09-09', dueDate: '' },
    };
    expect(fallos(conCheque)).toEqual({
      'guaranteeCheck.bankAccountId': 'Selecciona la cuenta bancaria del cheque',
      'guaranteeCheck.checkNumber': 'Ingresa el número de cheque',
      'guaranteeCheck.dueDate': 'Selecciona la fecha de cobro del cheque',
      'guaranteeCheck.amount': 'El monto del cheque debe ser mayor a 0',
    });
  });

  it('si el cliente no manda isGeneralAmount, se deduce de la forma del cuerpo', () => {
    // Sin líneas y con cuenta contable es monto general: no debe pedir líneas,
    // sí debe pedir el concepto.
    const { isGeneralAmount: _fuera, ...sinBandera } = { ...base(), lines: [], debitAccountId: 'acc-1', description: '' };
    expect(fallos(sinBandera)).toEqual({ description: 'El concepto general (descripción) es obligatorio' });
  });

  it('el primer fallo de un campo es el que se enseña', () => {
    // NCF vacío dispara "ingresa" y no también "formato": una cosa cada vez.
    const e = fallos({ ...base(), ncf: '' });
    expect(Object.keys(e)).toEqual(['ncf']);
  });
});

describe('P2-34 · los tres lo usan, y ninguno valida por su cuenta', () => {
  const RUTAS = ['src/app/api/v1/expenses/route.ts', 'src/app/api/v1/expenses/[id]/route.ts', 'src/app/dashboard/purchases/page.tsx'];

  it('los tres pasan por esquemaCompra', () => {
    for (const r of RUTAS) {
      expect(leer(r), `${r}: debe validar con el esquema compartido`).toContain('esquemaCompra.safeParse(');
    }
  });

  it('ninguno conserva su cadena de if', () => {
    for (const r of RUTAS) {
      const f = leer(r);
      expect(f, `${r}: queda la validación a mano`).not.toContain('Suplidor es requerido para compras formales');
      expect(f, `${r}: queda la validación a mano`).not.toContain("return toast.error('Selecciona un suplidor')");
      expect(f, `${r}: sigue validando el NCF por su cuenta`).not.toContain('isValidNcfFormat(');
    }
  });

  it('el servidor responde con los campos, no solo con un mensaje', () => {
    for (const r of RUTAS.slice(0, 2)) {
      expect(leer(r)).toContain('fields: erroresPorCampo(validacion.error)');
    }
  });

  it('la pantalla pinta el error debajo de cada campo y también los que devuelva el servidor', () => {
    const p = leer('src/app/dashboard/purchases/page.tsx');
    expect(p).toContain("err('ncf')");
    expect(p).toContain("err('supplierId')");
    expect(p).toContain("err('guaranteeCheck.checkNumber')");
    expect(p).toContain('setErrores(data.error.fields as Record<string, string>)');
  });
});
