/**
 * payroll.vitest.ts
 *
 * Unit tests for PayrollCalculationService — Dominican Republic fiscal compliance.
 * Verifies: TSS (AFP/SFS) contributions, ISR progressive brackets, overtime,
 * and settlement calculations (prestaciones laborales) per Código de Trabajo DR.
 *
 * Values sourced from:
 *   - TSS rates: Resolution 326/2021 (AFP 2.87% emp / 7.10% employer, SFS 3.04% emp / 7.09% employer)
 *   - ISR brackets: DGII Notice 07-2024
 *   - Wage basis: Salario Mínimo Nacional (16,262.50 DOP) for TSS cap calculations
 */
import { describe, it, expect } from 'vitest';
import {
  PayrollCalculationService,
  type PayrollConfig,
  type IsrBracket,
} from '../services/payrollCalculationService';

// ─── Shared Test Fixtures ────────────────────────────────────────────────────

const config: PayrollConfig = {
  afpEmployee: 0.0287,
  sfsEmployee: 0.0304,
  afpEmployer: 0.0710,
  sfsEmployer: 0.0709,
  infotepEmployer: 0.0100,
  riskEmployer: 0.0110,
  overtimeDiurnaRate: 1.35,
  overtimeNocturnaRate: 1.85,
  overtimeFestivaRate: 2.00,
  overtimeDobleRate: 2.00,
};

const isrBrackets: IsrBracket[] = [
  { fromAmount: 0.00,       toAmount: 416220.00,  fixedAmount: 0.00,     percentage: 0.00  },
  { fromAmount: 416220.01,  toAmount: 624329.00,  fixedAmount: 0.00,     percentage: 15.00 },
  { fromAmount: 624329.01,  toAmount: 867123.00,  fixedAmount: 31216.00, percentage: 20.00 },
  { fromAmount: 867123.01,  toAmount: null,        fixedAmount: 79776.00, percentage: 25.00 },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PayrollCalculationService', () => {
  // ---------------------------------------------------------------------------
  describe('getHourlyRate', () => {
    it('calculates hourly rate for 30,000 DOP salary (÷ 23.83 working days ÷ 8 hours)', () => {
      const rate = PayrollCalculationService.getHourlyRate(30_000);
      // Expected: 30000 / 23.83 / 8 ≈ 157.36
      expect(rate).toBeCloseTo(157.36, 1);
    });

    it('returns 0 for salary of 0', () => {
      expect(PayrollCalculationService.getHourlyRate(0)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('calculateOvertime', () => {
    it('computes diurna overtime: 10h × 1.35 multiplier', () => {
      const amount = PayrollCalculationService.calculateOvertime(30_000, 10, 'diurna', config);
      // 157.3646 * 10 * 1.35 ≈ 2124.42
      expect(amount).toBeCloseTo(2124.42, 0);
    });

    it('computes doble overtime: 10h × 2.00 multiplier', () => {
      const amount = PayrollCalculationService.calculateOvertime(30_000, 10, 'doble', config);
      // 157.3646 * 10 * 2.00 ≈ 3147.29
      expect(amount).toBeCloseTo(3147.29, 0);
    });

    it('computes nocturna overtime: 10h × 1.85 multiplier', () => {
      const amount = PayrollCalculationService.calculateOvertime(30_000, 10, 'nocturna', config);
      // 157.3646 * 10 * 1.85 ≈ 2911.24
      expect(amount).toBeCloseTo(2911.24, 0);
    });

    it('computes festiva overtime: 10h × 2.00 multiplier', () => {
      const amount = PayrollCalculationService.calculateOvertime(30_000, 10, 'festiva', config);
      expect(amount).toBeCloseTo(3147.29, 0);
    });

    it('returns 0 for 0 hours', () => {
      expect(PayrollCalculationService.calculateOvertime(30_000, 0, 'diurna', config)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('calculateIsr — progressive brackets', () => {
    it('returns 0 ISR for 400,000 DOP annualized net (exento)', () => {
      expect(PayrollCalculationService.calculateIsr(400_000, isrBrackets)).toBe(0);
    });

    it('returns correct ISR for 500,000 DOP annualized net (tramo 15%)', () => {
      // (500,000 - 416,220.01) * 0.15 = 12,566.99 annual → monthly ≈ 1,047.25
      const isr = PayrollCalculationService.calculateIsr(500_000, isrBrackets);
      expect(isr).toBeCloseTo(1047.25, 0);
    });

    it('returns correct ISR for 700,000 DOP annualized net (tramo 20%)', () => {
      // 31,216 + (700,000 - 624,329.01) * 0.20 = 46,350.19 annual → monthly ≈ 3,862.52
      const isr = PayrollCalculationService.calculateIsr(700_000, isrBrackets);
      expect(isr).toBeCloseTo(3862.52, 0);
    });

    it('returns correct ISR for 1,000,000 DOP annualized net (tramo 25%)', () => {
      // 79,776 + (1,000,000 - 867,123.01) * 0.25 = 112,995.24 annual → monthly ≈ 9,416.27
      const isr = PayrollCalculationService.calculateIsr(1_000_000, isrBrackets);
      expect(isr).toBeCloseTo(9416.27, 0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('calculateDetails — TSS deductions and net salary', () => {
    it('calculates AFP, SFS, ISR, and net salary for 25,000 DOP (no TSS caps reached)', () => {
      const result = PayrollCalculationService.calculateDetails({
        baseSalary: 25_000,
        isrBrackets,
        config,
      });

      // AFP Employee = 25,000 × 2.87% = 717.50
      expect(result.afp).toBe(717.50);

      // SFS Employee = 25,000 × 3.04% = 760.00
      expect(result.sfs).toBe(760.00);

      // Net for ISR = 25,000 - 717.50 - 760.00 = 23,522.50 → annualized = 282,270 (exento)
      expect(result.isr).toBe(0);

      // Net salary = 25,000 - 717.50 - 760.00 = 23,522.50
      expect(result.netSalary).toBe(23_522.50);
    });

    it('applies TSS caps correctly for 350,000 DOP salary (caps reached)', () => {
      const result = PayrollCalculationService.calculateDetails({
        baseSalary: 350_000,
        isrBrackets,
        config,
      });

      // AFP cap: 20 × 16,262.50 = 325,250. AFP Employee = 325,250 × 2.87% ≈ 9,334.68
      expect(result.afp).toBeCloseTo(9334.68, 1);

      // SFS cap: 10 × 16,262.50 = 162,625. SFS Employee = 162,625 × 3.04% ≈ 4,943.80
      expect(result.sfs).toBeCloseTo(4943.80, 1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('calculateSettlement — prestaciones laborales (Código de Trabajo DR)', () => {
    it('calculates preaviso, cesantía, and navidad for 6 months of service at 30,000 DOP', () => {
      const settlement = PayrollCalculationService.calculateSettlement({
        hireDate: new Date('2025-01-01'),
        terminationDate: new Date('2025-07-05'),
        salary: 30_000,
        includePreaviso: true,
        includeCesantia: true,
        vacacionesPendientesDays: 0,
        accumulatedNavidadBase: 180_000, // 6 months × 30,000
      });

      // Daily average wage: 30,000 / 23.83 ≈ 1,258.91
      // Preaviso = 14 days × 1,258.91 ≈ 17,624.84
      expect(settlement.preaviso).toBeCloseTo(17_624.84, 0);

      // Cesantía = 13 days × 1,258.91 ≈ 16,365.92
      expect(settlement.cesantia).toBeCloseTo(16_365.92, 0);

      // Navidad proporcional = 180,000 / 12 = 15,000
      expect(settlement.navidad).toBe(15_000);
    });

    it('returns 0 preaviso and 0 cesantía when flags are false', () => {
      const settlement = PayrollCalculationService.calculateSettlement({
        hireDate: new Date('2025-01-01'),
        terminationDate: new Date('2025-07-05'),
        salary: 30_000,
        includePreaviso: false,
        includeCesantia: false,
        vacacionesPendientesDays: 0,
        accumulatedNavidadBase: 180_000,
      });

      expect(settlement.preaviso).toBe(0);
      expect(settlement.cesantia).toBe(0);
    });
  });
});
