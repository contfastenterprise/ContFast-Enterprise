import { roundMoney } from '@/utils/calculos';
import { IssueInvoiceInput, CalculatedTotals } from './types';

export class InvoiceCalculator {
  /**
   * Calculates subtotals, discounts, taxes (ITBIS) and retentions.
   * Completely decoupled from database or network APIs (100% testable).
   */
  static calculateTotalsAndRetentions(data: IssueInvoiceInput): CalculatedTotals {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTaxes = 0;
    const itemLines: any[] = [];
    const taxSummaryMap: Record<string, { rate: number; amount: number }> = {};

    data.lines.forEach((line) => {
      const lineSubtotal = roundMoney(line.quantity * line.unitPrice);
      const lineDiscount = roundMoney(line.quantity * line.discount);
      const lineTaxableAmount = roundMoney(lineSubtotal - lineDiscount);
      const lineTaxAmount = roundMoney(lineTaxableAmount * line.taxRate);
      const lineTotal = roundMoney(lineTaxableAmount + lineTaxAmount);

      subtotal = roundMoney(subtotal + lineSubtotal);
      totalDiscount = roundMoney(totalDiscount + lineDiscount);
      totalTaxes = roundMoney(totalTaxes + lineTaxAmount);

      itemLines.push({
        productId: line.productId,
        name: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        subtotal: lineSubtotal,
        total: lineTotal,
        taxRate: line.taxRate, // Fixed and preserved for payload construction
      });

      const taxKey = `ITBIS_${(line.taxRate * 100).toFixed(0)}%`;
      if (!taxSummaryMap[taxKey]) {
        taxSummaryMap[taxKey] = { rate: line.taxRate * 100, amount: 0 };
      }
      taxSummaryMap[taxKey].amount = roundMoney(taxSummaryMap[taxKey].amount + lineTaxAmount);
    });

    const total = roundMoney(subtotal - totalDiscount + totalTaxes);
    const taxesList = Object.entries(taxSummaryMap).map(([name, val]) => ({
      taxType: 'ITBIS',
      rate: val.rate,
      amount: val.amount,
    }));

    let totalRetained = 0;
    const calculatedRetentions: any[] = [];

    if (data.retentions && data.retentions.length > 0) {
      data.retentions.forEach((ret) => {
        let amount = 0;
        const baseTaxable = roundMoney(subtotal - totalDiscount);

        if (ret.retentionType === 'ISR') {
          amount = roundMoney(baseTaxable * (ret.retentionPercentage / 100));
        } else if (ret.retentionType === 'ITBIS') {
          amount = roundMoney(totalTaxes * (ret.retentionPercentage / 100));
        } else {
          amount = roundMoney(baseTaxable * (ret.retentionPercentage / 100));
        }

        totalRetained = roundMoney(totalRetained + amount);
        calculatedRetentions.push({
          retentionId: ret.retentionId,
          retentionName: ret.retentionName,
          retentionType: ret.retentionType,
          retentionPercentage: ret.retentionPercentage,
          retentionAmount: amount,
          agentRnc: ret.agentRnc,
          retentionDate: ret.retentionDate,
        });
      });
    }

    const totalNet = roundMoney(total - totalRetained);

    return {
      subtotal,
      totalDiscount,
      totalTaxes,
      total,
      totalRetained,
      totalNet,
      itemLines,
      taxesList,
      calculatedRetentions,
    };
  }
}
