import { InvoiceCalculator } from '../src/services/invoice/invoiceCalculator';
import { IssueInvoiceInput } from '../src/services/invoice/types';

const mockInput: IssueInvoiceInput = {
  companyId: 'company-123',
  warehouseId: 'wh-123',
  userId: 'user-123',
  ecfType: '31',
  paymentType: 'cash',
  lines: [
    {
      productId: 'prod-1',
      productName: 'Producto A',
      quantity: 2,
      unitPrice: 100,
      discount: 10, // RD$ 10 discount per unit
      taxRate: 0.18, // 18% ITBIS
    },
    {
      productId: 'prod-2',
      productName: 'Producto B',
      quantity: 1,
      unitPrice: 50,
      discount: 0,
      taxRate: 0.18,
    }
  ],
  retentions: [
    {
      retentionName: 'Retención ISR 2%',
      retentionType: 'ISR',
      retentionPercentage: 2,
    }
  ]
};

// Calculations manually:
// Line 1:
// - lineSubtotal = 2 * 100 = 200
// - lineDiscount = 2 * 10 = 20
// - lineTaxableAmount = 200 - 20 = 180
// - lineTaxAmount = 180 * 0.18 = 32.4
// - lineTotal = 180 + 32.4 = 212.4
// Line 2:
// - lineSubtotal = 1 * 50 = 50
// - lineDiscount = 0
// - lineTaxableAmount = 50
// - lineTaxAmount = 50 * 0.18 = 9
// - lineTotal = 50 + 9 = 59
// Totals:
// - subtotal = 200 + 50 = 250
// - totalDiscount = 20 + 0 = 20
// - totalTaxes = 32.4 + 9 = 41.4
// - total = subtotal - totalDiscount + totalTaxes = 250 - 20 + 41.4 = 271.4
// Retentions:
// - baseTaxable = subtotal - totalDiscount = 250 - 20 = 230
// - ISR amount = 230 * 0.02 = 4.6
// - totalRetained = 4.6
// - totalNet = total - totalRetained = 271.4 - 4.6 = 266.8

try {
  const result = InvoiceCalculator.calculateTotalsAndRetentions(mockInput);
  console.log('Result Subtotal:', result.subtotal, 'Expected: 250');
  console.log('Result Discount:', result.totalDiscount, 'Expected: 20');
  console.log('Result Taxes:', result.totalTaxes, 'Expected: 41.4');
  console.log('Result Total:', result.total, 'Expected: 271.4');
  console.log('Result Retained:', result.totalRetained, 'Expected: 4.6');
  console.log('Result TotalNet:', result.totalNet, 'Expected: 266.8');

  if (
    result.subtotal === 250 &&
    result.totalDiscount === 20 &&
    result.totalTaxes === 41.4 &&
    result.total === 271.4 &&
    result.totalRetained === 4.6 &&
    result.totalNet === 266.8
  ) {
    console.log('🎉 TEST SUCCESSFUL! Mathematically correct.');
  } else {
    console.error('❌ TEST FAILED! Incorrect values.');
    process.exit(1);
  }
} catch (error) {
  console.error('Test execution error:', error);
  process.exit(1);
}
