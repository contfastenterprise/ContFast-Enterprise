import { roundMoney } from '@/utils/calculos';

/**
 * Payroll Calculation Service for Dominican Republic Legislation (TSS, DGII, Labor Code)
 */
export interface PayrollConfig {
  afpEmployee: number;
  sfsEmployee: number;
  afpEmployer: number;
  sfsEmployer: number;
  infotepEmployer: number;
  riskEmployer: number;
  overtimeDiurnaRate: number;
  overtimeNocturnaRate: number;
  overtimeFestivaRate: number;
  overtimeDobleRate: number;
}

export interface IsrBracket {
  fromAmount: number;
  toAmount: number | null;
  fixedAmount: number;
  percentage: number;
}

export class PayrollCalculationService {
  // TSS constant for minimum wage in DR
  public static readonly SALARIO_MINIMO_TSS = 16262.50;

  /**
   * Helper to round numbers to exactly 2 decimals
   */
  public static round(value: number): number {
    return roundMoney(value);
  }

  /**
   * Calculates the hourly rate based on Art. 85 of DR Labor Code
   */
  public static getHourlyRate(baseSalary: number): number {
    // 23.83 is the standard labor days in a month for monthly paid employees
    // 8 is the standard labor hours per day
    return baseSalary / 23.83 / 8;
  }

  /**
   * Calculates Overtime Amount
   */
  public static calculateOvertime(baseSalary: number, hours: number, type: 'diurna' | 'nocturna' | 'festiva' | 'doble', config: PayrollConfig): number {
    const hourlyRate = this.getHourlyRate(baseSalary);
    let rateFactor = 1.35; // Default diurna

    switch (type) {
      case 'nocturna':
        rateFactor = Number(config.overtimeNocturnaRate || 1.85);
        break;
      case 'festiva':
        rateFactor = Number(config.overtimeFestivaRate || 2.00);
        break;
      case 'doble':
        rateFactor = Number(config.overtimeDobleRate || 2.00);
        break;
      case 'diurna':
      default:
        rateFactor = Number(config.overtimeDiurnaRate || 1.35);
        break;
    }

    return this.round(hourlyRate * hours * rateFactor);
  }

  /**
   * Calculate progresivo ISR (DGII)
   */
  public static calculateIsr(annualNetSalary: number, brackets: IsrBracket[]): number {
    if (annualNetSalary <= 0 || brackets.length === 0) return 0;

    // Find the matching bracket
    // Sorted by fromAmount ascending
    const sortedBrackets = [...brackets].sort((a, b) => a.fromAmount - b.fromAmount);
    
    let applicableBracket: IsrBracket | null = null;
    for (const bracket of sortedBrackets) {
      const from = Number(bracket.fromAmount);
      const to = bracket.toAmount ? Number(bracket.toAmount) : Infinity;
      if (annualNetSalary >= from && annualNetSalary <= to) {
        applicableBracket = bracket;
        break;
      }
    }

    if (!applicableBracket) {
      // Fallback to highest bracket if exceeds all limits
      applicableBracket = sortedBrackets[sortedBrackets.length - 1];
    }

    const from = Number(applicableBracket.fromAmount);
    const fixed = Number(applicableBracket.fixedAmount);
    const pct = Number(applicableBracket.percentage) / 100;

    const annualIsr = fixed + (annualNetSalary - from) * pct;
    return this.round(Math.max(0, annualIsr / 12)); // Monthly ISR
  }

  /**
   * Calculate Complete Payroll details for an employee
   */
  public static calculateDetails(params: {
    baseSalary: number;
    overtimeAmount?: number;
    bonusAmount?: number;
    commissionAmount?: number;
    otherDeductions?: number;
    isrBrackets: IsrBracket[];
    config: PayrollConfig;
  }) {
    const baseSalary = Number(params.baseSalary);
    const overtimeAmount = Number(params.overtimeAmount || 0);
    const bonusAmount = Number(params.bonusAmount || 0);
    const commissionAmount = Number(params.commissionAmount || 0);
    const otherDeductions = Number(params.otherDeductions || 0);
    const config = params.config;

    // 1. Gross Salary
    const grossSalary = this.round(baseSalary + overtimeAmount + bonusAmount + commissionAmount);

    // 2. Cotizable TSS Salary (Base Salary + Commissions + any other recurring item, excluding extra hours and bonuses according to law)
    const cotizableSalary = this.round(baseSalary + commissionAmount);

    // 3. AFP limits (20 times minimum wage)
    const afpLimit = 20 * this.SALARIO_MINIMO_TSS;
    const afpBase = Math.min(cotizableSalary, afpLimit);
    const afpEmployee = this.round(afpBase * Number(config.afpEmployee || 0.0287));
    const afpEmployer = this.round(afpBase * Number(config.afpEmployer || 0.0710));

    // 4. SFS limits (10 times minimum wage)
    const sfsLimit = 10 * this.SALARIO_MINIMO_TSS;
    const sfsBase = Math.min(cotizableSalary, sfsLimit);
    const sfsEmployee = this.round(sfsBase * Number(config.sfsEmployee || 0.0304));
    const sfsEmployer = this.round(sfsBase * Number(config.sfsEmployer || 0.0709));

    // 5. INFOTEP (1% employer on base+commissions, 0.5% employee on bonuses/commissions. Note: Standard practice in DR is employer pays 1%, employee pays 0.5% only on commissions/bonuses/incentives)
    const infotepEmployer = this.round(cotizableSalary * Number(config.infotepEmployer || 0.0100));

    // 6. SRL (Riesgo Laboral) - Employer only, limit 4 minimum wages
    const srlLimit = 4 * this.SALARIO_MINIMO_TSS;
    const srlBase = Math.min(cotizableSalary, srlLimit);
    const riskEmployer = this.round(srlBase * Number(config.riskEmployer || 0.0110));

    // 7. Net Salary for ISR deduction: Gross Salary - AFP - SFS (Other items like overtime or bonus can be subject to ISR depending on policy, generally they are!)
    // Standard DGII rules: All incomes (base, overtime, commissions, bonuses) except double sueldo are subject to ISR.
    // Deductions allowed: SFS and AFP.
    const monthlyNetForIsr = Math.max(0, grossSalary - afpEmployee - sfsEmployee);
    const annualNetForIsr = monthlyNetForIsr * 12;
    const isr = this.calculateIsr(annualNetForIsr, params.isrBrackets);

    // 8. Net Salary to pay
    const netSalary = this.round(grossSalary - afpEmployee - sfsEmployee - isr - otherDeductions);

    return {
      baseSalary,
      overtimeAmount,
      bonusAmount,
      commissionAmount,
      grossSalary,
      afp: afpEmployee,
      sfs: sfsEmployee,
      isr,
      otherDeductions,
      netSalary,
      afpEmployer,
      sfsEmployer,
      riskEmployer,
      infotepEmployer,
    };
  }

  /**
   * Calculates settlements/severance according to DR Labor Code
   */
  public static calculateSettlement(params: {
    hireDate: Date;
    terminationDate: Date;
    salary: number;
    includePreaviso: boolean;
    includeCesantia: boolean;
    vacacionesPendientesDays: number;
    accumulatedNavidadBase: number; // Sum of wages in the calendar year
  }) {
    const hire = new Date(params.hireDate);
    const term = new Date(params.terminationDate);
    
    // Antigüedad en meses
    const diffTime = Math.abs(term.getTime() - hire.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const yearsOfService = diffDays / 365.25;
    const monthsOfService = yearsOfService * 12;

    const dailyRate = this.round(params.salary / 23.83);
    
    let preaviso = 0;
    if (params.includePreaviso) {
      if (monthsOfService >= 3 && monthsOfService < 6) {
        preaviso = 7 * dailyRate;
      } else if (monthsOfService >= 6 && monthsOfService < 12) {
        preaviso = 14 * dailyRate;
      } else if (monthsOfService >= 12) {
        preaviso = 28 * dailyRate;
      }
    }

    let cesantia = 0;
    if (params.includeCesantia) {
      if (monthsOfService >= 3 && monthsOfService < 6) {
        cesantia = 6 * dailyRate;
      } else if (monthsOfService >= 6 && monthsOfService < 12) {
        cesantia = 13 * dailyRate;
      } else if (yearsOfService >= 1 && yearsOfService < 5) {
        // 21 days per year
        cesantia = Math.floor(yearsOfService) * 21 * dailyRate;
        // Proportional part for fraction of year
        const fraction = yearsOfService - Math.floor(yearsOfService);
        if (fraction >= 0.25 && fraction < 0.5) cesantia += 6 * dailyRate;
        else if (fraction >= 0.5 && fraction < 1.0) cesantia += 13 * dailyRate;
      } else if (yearsOfService >= 5) {
        // 23 days per year
        cesantia = Math.floor(yearsOfService) * 23 * dailyRate;
        // Proportional part for fraction of year
        const fraction = yearsOfService - Math.floor(yearsOfService);
        if (fraction >= 0.25 && fraction < 0.5) cesantia += 6 * dailyRate;
        else if (fraction >= 0.5 && fraction < 1.0) cesantia += 13 * dailyRate;
      }
    }

    // Vacaciones proporcionales (según Código de Trabajo Art. 180)
    let vacaciones = params.vacacionesPendientesDays * dailyRate;

    // Navidad proporcional (duodécima parte del salario devengado)
    // accumulatedNavidadBase includes salary in current year before termination
    const navidad = this.round(params.accumulatedNavidadBase / 12);

    preaviso = this.round(preaviso);
    cesantia = this.round(cesantia);
    vacaciones = this.round(vacaciones);
    const total = this.round(preaviso + cesantia + vacaciones + navidad);

    return {
      monthsOfService: this.round(monthsOfService),
      yearsOfService: this.round(yearsOfService),
      dailyRate,
      preaviso,
      cesantia,
      vacaciones,
      navidad,
      total,
    };
  }
}
