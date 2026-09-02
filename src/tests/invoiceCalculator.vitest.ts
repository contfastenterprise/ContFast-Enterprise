/**
 * invoiceCalculator.vitest.ts
 *
 * Pruebas unitarias de InvoiceCalculator — el cálculo que produce las cifras de
 * TODAS las facturas del sistema y que se declaran a la DGII en el 607.
 *
 * La clase es pura: no toca base de datos ni red. Su propio autor la documentó
 * como "100% testable" y hasta ahora no tenía ni una prueba.
 *
 * Convenciones del cálculo, verificadas contra el código:
 *   - `line.discount` es un descuento POR UNIDAD, no por línea: se multiplica
 *     por la cantidad.
 *   - `line.taxRate` es una fracción (0.18 = 18%), no un porcentaje.
 *   - El ITBIS se agrupa POR TASA antes de aplicarse. Esto evita el arrastre de
 *     redondeo que produciría calcularlo línea a línea (ver el caso de 100
 *     líneas más abajo, donde la diferencia es de 6 centavos).
 *   - Base de la retención de ISR: subtotal − descuento (base imponible, sin ITBIS).
 *   - Base de la retención de ITBIS: el ITBIS total facturado.
 *
 * Referencias fiscales (RD):
 *   - ITBIS general 18% — Ley 253-12, Art. 23.
 *   - Retención de ISR 10% sobre servicios profesionales prestados por personas
 *     físicas — Reglamento 293-11, Art. 8.
 *   - Retención de ITBIS 30% en servicios de personas físicas y 100% cuando el
 *     proveedor es informal — Norma General 07-2009.
 */
import { describe, it, expect } from 'vitest';
import { InvoiceCalculator } from '../services/invoice/invoiceCalculator';
import type { IssueInvoiceInput } from '../services/invoice/types';

// ─── Ayudantes ───────────────────────────────────────────────────────────────

type Linea = IssueInvoiceInput['lines'][number];
type Retencion = NonNullable<IssueInvoiceInput['retentions']>[number];

function linea(over: Partial<Linea> = {}): Linea {
  return {
    productId: 'prod-1',
    productName: 'Producto de prueba',
    quantity: 1,
    unitPrice: 100,
    discount: 0,
    taxRate: 0.18,
    ...over,
  };
}

function factura(lines: Linea[], retentions?: Retencion[]): IssueInvoiceInput {
  return {
    companyId: 'empresa-1',
    modo: 'PRODUCCION',
    warehouseId: 'almacen-1',
    userId: 'usuario-1',
    ecfType: '31',
    paymentType: 'cash',
    lines,
    ...(retentions ? { retentions } : {}),
  };
}

const calcular = (input: IssueInvoiceInput) =>
  InvoiceCalculator.calculateTotalsAndRetentions(input);

// ─── Cálculo base ────────────────────────────────────────────────────────────

describe('InvoiceCalculator — cálculo base', () => {
  it('factura de una línea con ITBIS 18%', () => {
    const r = calcular(factura([linea({ quantity: 2, unitPrice: 1000 })]));

    expect(r.subtotal).toBe(2000);
    expect(r.totalDiscount).toBe(0);
    expect(r.totalTaxes).toBe(360);
    expect(r.total).toBe(2360);
    expect(r.totalRetained).toBe(0);
    expect(r.totalNet).toBe(2360);
  });

  it('el descuento es por unidad, no por línea', () => {
    // 3 unidades a 500 con 50 de descuento CADA UNA = 150 de descuento total.
    const r = calcular(factura([linea({ quantity: 3, unitPrice: 500, discount: 50 })]));

    expect(r.subtotal).toBe(1500);
    expect(r.totalDiscount).toBe(150);
    expect(r.totalTaxes).toBe(243); // (1500 − 150) × 0.18
    expect(r.total).toBe(1593);
  });

  it('el ITBIS se calcula sobre la base ya descontada', () => {
    const conDescuento = calcular(factura([linea({ quantity: 1, unitPrice: 1000, discount: 200 })]));
    const sinDescuento = calcular(factura([linea({ quantity: 1, unitPrice: 800 })]));

    expect(conDescuento.totalTaxes).toBe(sinDescuento.totalTaxes);
    expect(conDescuento.totalTaxes).toBe(144); // 800 × 0.18
  });

  it('una factura sin líneas devuelve todo en cero', () => {
    const r = calcular(factura([]));

    expect(r.subtotal).toBe(0);
    expect(r.totalTaxes).toBe(0);
    expect(r.total).toBe(0);
    expect(r.totalNet).toBe(0);
    expect(r.itemLines).toHaveLength(0);
    expect(r.taxesList).toHaveLength(0);
  });
});

// ─── Varias tasas en la misma factura ────────────────────────────────────────

describe('InvoiceCalculator — varias tasas de ITBIS', () => {
  it('agrupa la base imponible por tasa y suma los impuestos', () => {
    const r = calcular(
      factura([
        linea({ productId: 'gravado', quantity: 1, unitPrice: 1000, taxRate: 0.18 }),
        linea({ productId: 'exento', quantity: 1, unitPrice: 500, taxRate: 0 }),
      ])
    );

    expect(r.subtotal).toBe(1500);
    expect(r.totalTaxes).toBe(180); // solo la línea gravada
    expect(r.total).toBe(1680);
  });

  it('convive la tasa reducida del 16% con la general del 18%', () => {
    const r = calcular(
      factura([
        linea({ productId: 'general', quantity: 1, unitPrice: 1000, taxRate: 0.18 }),
        linea({ productId: 'reducida', quantity: 1, unitPrice: 1000, taxRate: 0.16 }),
      ])
    );

    expect(r.totalTaxes).toBe(340); // 180 + 160
    expect(r.taxesList).toHaveLength(2);

    const tasas = r.taxesList.map((t: any) => t.rate).sort((a: number, b: number) => a - b);
    expect(tasas).toEqual([16, 18]); // taxesList expone el porcentaje, no la fracción
  });

  it('una factura totalmente exenta no genera impuesto', () => {
    const r = calcular(factura([linea({ quantity: 4, unitPrice: 250, taxRate: 0 })]));

    expect(r.subtotal).toBe(1000);
    expect(r.totalTaxes).toBe(0);
    expect(r.total).toBe(1000);
  });
});

// ─── Retenciones ─────────────────────────────────────────────────────────────

describe('InvoiceCalculator — retenciones', () => {
  const base = () => factura([linea({ quantity: 1, unitPrice: 10000 })]); // 10.000 + 1.800 ITBIS

  it('la retención de ISR se aplica sobre la base imponible, no sobre el total', () => {
    const r = calcular(
      factura(base().lines, [
        { retentionName: 'ISR Servicios', retentionType: 'ISR', retentionPercentage: 10 },
      ])
    );

    // 10% de 10.000 (base sin ITBIS), NO de 11.800.
    expect(r.totalRetained).toBe(1000);
    expect(r.total).toBe(11800);
    expect(r.totalNet).toBe(10800);
  });

  it('la retención de ITBIS se aplica sobre el ITBIS facturado', () => {
    const r = calcular(
      factura(base().lines, [
        { retentionName: 'ITBIS 100%', retentionType: 'ITBIS', retentionPercentage: 100 },
      ])
    );

    expect(r.totalRetained).toBe(1800); // el ITBIS completo
    expect(r.totalNet).toBe(10000); // el cliente paga solo la base
  });

  it('caso real: servicios profesionales con ISR 10% e ITBIS 30%', () => {
    const r = calcular(
      factura(base().lines, [
        { retentionName: 'ISR Servicios', retentionType: 'ISR', retentionPercentage: 10 },
        { retentionName: 'ITBIS Servicios', retentionType: 'ITBIS', retentionPercentage: 30 },
      ])
    );

    expect(r.calculatedRetentions).toHaveLength(2);
    expect(r.calculatedRetentions[0].retentionAmount).toBe(1000); // ISR: 10.000 × 10%
    expect(r.calculatedRetentions[1].retentionAmount).toBe(540); // ITBIS: 1.800 × 30%
    expect(r.totalRetained).toBe(1540);
    expect(r.totalNet).toBe(10260);
  });

  it('el tipo OTRA se calcula sobre la base imponible, igual que ISR', () => {
    const r = calcular(
      factura(base().lines, [
        { retentionName: 'Otra', retentionType: 'OTRA', retentionPercentage: 5 },
      ])
    );

    expect(r.totalRetained).toBe(500); // 10.000 × 5%
  });

  it('la retención descuenta del neto pero no altera el total facturado', () => {
    const sin = calcular(base());
    const con = calcular(
      factura(base().lines, [
        { retentionName: 'ISR', retentionType: 'ISR', retentionPercentage: 10 },
      ])
    );

    expect(con.total).toBe(sin.total); // lo que se declara en el 607 no cambia
    expect(con.totalNet).toBeLessThan(sin.totalNet); // lo que se cobra, sí
  });

  it('un descuento reduce también la base de la retención de ISR', () => {
    const r = calcular(
      factura([linea({ quantity: 1, unitPrice: 10000, discount: 2000 })], [
        { retentionName: 'ISR', retentionType: 'ISR', retentionPercentage: 10 },
      ])
    );

    expect(r.totalRetained).toBe(800); // 10% de 8.000, no de 10.000
  });
});

// ─── Redondeo al céntimo ─────────────────────────────────────────────────────

describe('InvoiceCalculator — redondeo', () => {
  it('no arrastra el error clásico de punto flotante', () => {
    // 3 × 0.1 en coma flotante da 0.30000000000000004.
    const r = calcular(factura([linea({ quantity: 3, unitPrice: 0.1 })]));

    expect(r.subtotal).toBe(0.3);
    expect(r.totalTaxes).toBe(0.05); // 0.3 × 0.18 = 0.054 → 0.05
    expect(r.total).toBe(0.35);
  });

  it('agrupar por tasa evita el arrastre de redondeo de 100 líneas', () => {
    // Cada línea a 33.33: por línea daría 33.33 × 0.18 = 5.9994 → 6.00, y 100
    // líneas sumarían 600.00. Agrupando: 3.333 × 0.18 = 599.94. Seis centavos
    // de diferencia, que en el 607 son una discrepancia real.
    const lineas = Array.from({ length: 100 }, (_, i) =>
      linea({ productId: `p-${i}`, quantity: 1, unitPrice: 33.33 })
    );
    const r = calcular(factura(lineas));

    expect(r.subtotal).toBe(3333);
    expect(r.totalTaxes).toBe(599.94);
    expect(r.total).toBe(3932.94);
  });

  it('todos los importes devueltos tienen como mucho dos decimales', () => {
    const r = calcular(
      factura(
        [
          linea({ quantity: 7, unitPrice: 13.37, discount: 1.11 }),
          linea({ productId: 'b', quantity: 3, unitPrice: 99.99, taxRate: 0.16 }),
        ],
        [{ retentionName: 'ISR', retentionType: 'ISR', retentionPercentage: 10 }]
      )
    );

    const dosDecimales = (n: number) => expect(Math.round(n * 100)).toBe(n * 100);
    [r.subtotal, r.totalDiscount, r.totalTaxes, r.total, r.totalRetained, r.totalNet].forEach(
      dosDecimales
    );
  });

  it('el total cuadra con la identidad subtotal − descuento + impuestos', () => {
    const r = calcular(
      factura([
        linea({ quantity: 7, unitPrice: 13.37, discount: 1.11 }),
        linea({ productId: 'b', quantity: 3, unitPrice: 99.99, taxRate: 0.16 }),
      ])
    );

    expect(r.total).toBe(Math.round((r.subtotal - r.totalDiscount + r.totalTaxes) * 100) / 100);
    expect(r.totalNet).toBe(Math.round((r.total - r.totalRetained) * 100) / 100);
  });
});

// ─── Detalle de líneas y resumen de impuestos ────────────────────────────────

describe('InvoiceCalculator — detalle devuelto', () => {
  it('cada línea conserva su base imponible individual', () => {
    const r = calcular(
      factura([
        linea({ productId: 'a', quantity: 2, unitPrice: 100, discount: 10 }),
        linea({ productId: 'b', quantity: 1, unitPrice: 50 }),
      ])
    );

    expect(r.itemLines).toHaveLength(2);
    expect(r.itemLines[0].subtotal).toBe(200);
    expect(r.itemLines[0].total).toBe(180); // 200 − (2 × 10)
    expect(r.itemLines[1].total).toBe(50);
  });

  it('el resumen de impuestos suma exactamente el ITBIS total', () => {
    const r = calcular(
      factura([
        linea({ quantity: 1, unitPrice: 1000, taxRate: 0.18 }),
        linea({ productId: 'b', quantity: 1, unitPrice: 2000, taxRate: 0.16 }),
      ])
    );

    const suma = r.taxesList.reduce((acc: number, t: any) => acc + t.amount, 0);
    expect(Math.round(suma * 100) / 100).toBe(r.totalTaxes);
  });
});

// ─── Comportamiento en los bordes ────────────────────────────────────────────
//
// Estos casos NO afirman que el comportamiento actual sea el deseable: dejan
// constancia de cuál es. La clase no valida sus entradas, así que la validación
// tiene que ocurrir antes de llamarla. Si algún día se añade esa validación,
// estas pruebas fallarán y habrá que actualizarlas a propósito.

describe('InvoiceCalculator — bordes sin validar', () => {
  it('un descuento mayor que la línea produce una base NEGATIVA', () => {
    const r = calcular(factura([linea({ quantity: 1, unitPrice: 100, discount: 150 })]));

    expect(r.totalDiscount).toBe(150);
    expect(r.totalTaxes).toBe(-9); // −50 × 0.18
    expect(r.total).toBe(-59);
  });

  it('una cantidad negativa produce importes negativos', () => {
    const r = calcular(factura([linea({ quantity: -2, unitPrice: 100 })]));

    expect(r.subtotal).toBe(-200);
    expect(r.total).toBe(-236);
  });

  it('una retención del 100% de ISR deja el neto por debajo del ITBIS a enterar', () => {
    const r = calcular(
      factura([linea({ quantity: 1, unitPrice: 1000 })], [
        { retentionName: 'ISR total', retentionType: 'ISR', retentionPercentage: 100 },
      ])
    );

    expect(r.totalRetained).toBe(1000);
    expect(r.totalNet).toBe(180); // 1.180 − 1.000
  });
});
