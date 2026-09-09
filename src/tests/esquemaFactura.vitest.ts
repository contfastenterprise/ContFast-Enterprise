/**
 * esquemaFactura.vitest.ts
 *
 * Guarda de P2-34, lote 2: la factura se valida con UN esquema, compartido por
 * la ruta de emisión y la pantalla.
 *
 * El esquema vivía dentro del fichero de la ruta, así que la pantalla no podía
 * usarlo y reimplementaba las reglas a mano en dos sitios que se solapaban. Al
 * sacarlo se le añaden las dos reglas que SOLO tenía la pantalla —el RNC y la
 * razón social para e-31/e-45, y el motivo del ajuste—, porque un POST directo
 * se las saltaba: eso es lo que más se comprueba aquí.
 *
 * Se ejecuta, no se lee: un examen del código no distingue un `refine` bien
 * puesto de uno que devuelve `true` siempre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { esquemaFactura } from '@/schemas/factura';
import { erroresPorCampo } from '@/schemas/errores';

const RAIZ = join(__dirname, '..', '..');
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const leer = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), 'utf8'));

const UUID = '00000000-0000-4000-8000-000000000000';

/** Una factura de consumo (e-32) válida. Cada prueba rompe una cosa. */
const base = () => ({
  warehouseId: UUID,
  ecfType: '32',
  paymentType: 'cash' as const,
  lines: [{ productId: UUID, productName: 'Cosa', quantity: 1, unitPrice: 100, discount: 0, taxRate: 0.18 }],
});

const fallos = (cuerpo: unknown) => {
  const r = esquemaFactura.safeParse(cuerpo);
  return r.success ? {} : erroresPorCampo(r.error);
};

describe('P2-34 · una factura completa pasa', () => {
  it('consumo con una línea', () => {
    expect(fallos(base())).toEqual({});
  });

  it('crédito fiscal con RNC y razón social', () => {
    expect(fallos({ ...base(), ecfType: '31', buyerRnc: '131796845', buyerName: 'Latin Doors SRL' })).toEqual({});
  });

  it('nota de crédito con motivo y NCF modificado', () => {
    expect(
      fallos({ ...base(), ecfType: '34', modifiedNcf: 'E320000001005', indicadorNotaCredito: 1 })
    ).toEqual({});
  });

  it('transferencia con banco y referencia', () => {
    expect(fallos({ ...base(), paymentType: 'bank_transfer', bankName: 'Banco BHD', transactionNumber: 'TXN1' })).toEqual({});
  });
});

describe('P2-34 · las dos reglas que solo tenía la pantalla, ahora también en el servidor', () => {
  // Sin esto, un POST directo emitía un crédito fiscal sin RNC del comprador,
  // que es justo lo que un e-31 no puede ser.
  it('e-31 sin RNC ni razón social', () => {
    expect(fallos({ ...base(), ecfType: '31' }).buyerRnc).toMatch(/RNC y la Razón Social/);
  });

  it('e-45 sin RNC ni razón social', () => {
    expect(fallos({ ...base(), ecfType: '45' }).buyerRnc).toMatch(/RNC y la Razón Social/);
  });

  it('e-31 con RNC pero sin razón social tampoco pasa', () => {
    expect(fallos({ ...base(), ecfType: '31', buyerRnc: '131796845' }).buyerRnc).toMatch(/RNC y la Razón Social/);
  });

  it('una nota de crédito sin motivo', () => {
    const e = fallos({ ...base(), ecfType: '34', modifiedNcf: 'E320000001005', indicadorNotaCredito: 0 });
    expect(e.indicadorNotaCredito).toMatch(/Motivo \/ Tipo de Ajuste/);
  });

  it('cada tipo de nota admite sus propios motivos', () => {
    // e-34 (crédito): 1, 2, 3.  e-33 (débito): 2, 3, 4.
    const nc = (ind: number) => fallos({ ...base(), ecfType: '34', modifiedNcf: 'E320000001005', indicadorNotaCredito: ind });
    const nd = (ind: number) => fallos({ ...base(), ecfType: '33', modifiedNcf: 'E320000001005', indicadorNotaCredito: ind });
    expect(nc(1)).toEqual({});
    expect(nc(4).indicadorNotaCredito).toBeDefined();
    expect(nd(4)).toEqual({});
    expect(nd(1).indicadorNotaCredito).toBeDefined();
  });

  it('una factura normal no pide motivo', () => {
    expect(fallos({ ...base(), indicadorNotaCredito: 0 })).toEqual({});
  });
});

describe('P2-34 · las reglas que ya tenía, cada una en su campo', () => {
  it('sin líneas', () => {
    expect(fallos({ ...base(), lines: [] }).lines).toMatch(/al menos una línea/);
  });

  it('cantidad cero, en la línea que falla', () => {
    const cuerpo = { ...base(), lines: [{ ...base().lines[0] }, { ...base().lines[0], quantity: 0 }] };
    expect(fallos(cuerpo)).toEqual({ 'lines.1.quantity': 'La cantidad debe ser mayor a cero' });
  });

  it('transferencia sin banco', () => {
    expect(fallos({ ...base(), paymentType: 'bank_transfer', transactionNumber: 'TXN1' }).bankName).toMatch(/banco y número/);
  });

  it('nota sin NCF modificado', () => {
    expect(fallos({ ...base(), ecfType: '34', indicadorNotaCredito: 1 }).modifiedNcf).toMatch(/NCF modificado es requerido/);
  });

  // El mensaje tiene que ir en las DOS comprobaciones de zod: la de tipo (el
  // campo no viene) y la de formato (viene pero no es un uuid). Puesto solo en
  // la segunda, un cuerpo sin almacen respondia "expected string, received
  // undefined" -- que es exactamente lo que este lote viene a quitar.
  it('sin almacén lo dice con palabras, venga vacío o no venga', () => {
    const { warehouseId: _fuera, ...sinAlmacen } = base();
    expect(fallos(sinAlmacen).warehouseId).toBe('Debe seleccionar un almacén.');
    expect(fallos({ ...base(), warehouseId: '' }).warehouseId).toBe('Debe seleccionar un almacén.');
  });

  it('sin líneas del todo, igual que con la lista vacía', () => {
    const { lines: _fuera, ...sinLineas } = base();
    expect(fallos(sinLineas).lines).toMatch(/al menos una línea/);
  });

  it('sin forma de pago', () => {
    const { paymentType: _fuera, ...sinPago } = base();
    expect(fallos(sinPago).paymentType).toBe('Selecciona la forma de pago.');
  });

  it('un tipo de e-CF que no se emite', () => {
    expect(fallos({ ...base(), ecfType: '99' }).ecfType).toMatch(/Tipo de e-CF inválido/);
  });
});

describe('P2-34 · la ruta y la pantalla lo usan, y ninguna valida por su cuenta', () => {
  const RUTA = 'src/app/api/v1/invoices/route.ts';
  const PANTALLA = 'src/app/dashboard/invoices/page.tsx';

  it('la ruta valida con el esquema compartido y devuelve los campos', () => {
    const f = leer(RUTA);
    expect(f).toContain('esquemaFactura.safeParse(body)');
    expect(f).toContain('const campos = erroresPorCampo(result.error);');
    expect(f, 'el esquema ya no vive dentro de la ruta').not.toContain('createInvoiceSchema');
  });

  it('la pantalla pasa el mismo esquema antes de llamar', () => {
    const f = leer(PANTALLA);
    expect(f).toContain('esquemaFactura.safeParse(buildInvoicePayload())');
    expect(f, 'quedan las cadenas de throw').not.toContain(
      "throw new Error('El RNC y la Razón Social del cliente son requeridos"
    );
    expect(f, 'quedan las cadenas de throw').not.toContain("throw new Error('Debe seleccionar un almacén.')");
  });

  it('el borrador sigue guardándose a medias, sin el esquema completo', () => {
    // Un borrador es justamente lo incompleto: si se le exigiera el esquema
    // entero, dejaría de servir para lo que sirve.
    const f = leer(PANTALLA);
    const i = f.indexOf('const handleSaveDraft');
    const j = f.indexOf('const handleLoadDraft');
    const cuerpo = f.slice(i, j);
    expect(cuerpo).toContain('erroresBasicos()');
    expect(cuerpo).not.toContain('esquemaFactura');
  });

  it('la pantalla pinta el error debajo de cada campo', () => {
    const f = leer(PANTALLA);
    expect(f).toContain("err('buyerRnc')");
    expect(f).toContain("err('bankName')");
    expect(f).toContain("err('transactionNumber')");
    expect(f).toContain("err('lines')");
    expect(f).toContain('setErrores(error.fields as Record<string, string>)');
  });
});
