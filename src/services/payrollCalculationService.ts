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
    frequency?: 'mensual' | 'quincenal' | 'semanal';
    overtimeAmount?: number;
    bonusAmount?: number;
    commissionAmount?: number;
    otherDeductions?: number;
    isrBrackets: IsrBracket[];
    config: PayrollConfig;
  }) {
    const baseSalary = Number(params.baseSalary);
    const frequency = params.frequency || 'mensual';
    const overtimeAmount = Number(params.overtimeAmount || 0);
    const bonusAmount = Number(params.bonusAmount || 0);
    const commissionAmount = Number(params.commissionAmount || 0);
    const otherDeductions = Number(params.otherDeductions || 0);
    const config = params.config;

    // Factor de periodo para proyectar salarios
    let factorPeriodo = 1;
    if (frequency === 'quincenal') factorPeriodo = 2;
    if (frequency === 'semanal') factorPeriodo = 4.3333; // Promedio de semanas por mes

    // 1. Gross Salary (del periodo)
    const grossSalary = this.round(baseSalary + overtimeAmount + bonusAmount + commissionAmount);

    // 2. Cotizable TSS Salary (del periodo)
    const cotizableSalary = this.round(baseSalary + commissionAmount);

    // 3. AFP limits (20 times minimum wage)
    const afpLimit = (20 * this.SALARIO_MINIMO_TSS) / factorPeriodo;
    const afpBase = Math.min(cotizableSalary, afpLimit);
    const afpEmployee = this.round(afpBase * Number(config.afpEmployee || 0.0287));
    const afpEmployer = this.round(afpBase * Number(config.afpEmployer || 0.0710));

    // 4. SFS limits (10 times minimum wage)
    const sfsLimit = (10 * this.SALARIO_MINIMO_TSS) / factorPeriodo;
    const sfsBase = Math.min(cotizableSalary, sfsLimit);
    const sfsEmployee = this.round(sfsBase * Number(config.sfsEmployee || 0.0304));
    const sfsEmployer = this.round(sfsBase * Number(config.sfsEmployer || 0.0709));

    // 5. INFOTEP 
    const infotepEmployer = this.round(cotizableSalary * Number(config.infotepEmployer || 0.0100));

    // 6. SRL (Riesgo Laboral)
    const srlLimit = (4 * this.SALARIO_MINIMO_TSS) / factorPeriodo;
    const srlBase = Math.min(cotizableSalary, srlLimit);
    const riskEmployer = this.round(srlBase * Number(config.riskEmployer || 0.0110));

    // 7. Net Salary for ISR deduction
    // Para calcular el ISR de una quincena/semana, proyectamos el salario gravable al mes, calculamos el ISR mensual, y luego lo dividimos entre el factor.
    const projectedMonthlyNetForIsr = Math.max(0, (grossSalary * factorPeriodo) - (afpEmployee * factorPeriodo) - (sfsEmployee * factorPeriodo));
    const annualNetForIsr = projectedMonthlyNetForIsr * 12;
    const monthlyIsr = this.calculateIsr(annualNetForIsr, params.isrBrackets);
    const isr = this.round(monthlyIsr / factorPeriodo);

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
   * Dias de vacaciones que le corresponden a un empleado por su antiguedad,
   * segun el Codigo de Trabajo dominicano (Art. 177 y su parrafo).
   *
   *   menos de 5 meses .... 0   (no genera derecho)
   *   5 a 11 meses ........ escala proporcional, de 6 a 12 dias
   *   1 a 5 anos .......... 14 dias
   *   5 anos o mas ........ 18 dias
   *
   * Son dias LABORABLES: no cuentan domingos ni feriados nacionales.
   *
   * ADVERTENCIA: sobre el tramo de 5 anos o mas no hay lectura unica. Algunas
   * fuentes lo leen como 18 dias de descanso y otras como 14 dias de descanso
   * pagados a razon de 18 dias de salario. Aqui se devuelve 18 porque es la
   * lectura mas extendida y la mas favorable al trabajador, pero el resultado
   * es una SUGERENCIA: la pantalla deja ajustarlo antes de guardar. No lo
   * conviertas en un calculo automatico sin consultarlo con el asesor laboral.
   */
  /**
   * Devuelve el dia de CALENDARIO de una fecha, sin desfase de zona horaria.
   *
   * `new Date('2026-01-31')` se interpreta como medianoche UTC, pero los
   * getters (`getDate`, `getMonth`) leen en hora local: en Republica Dominicana
   * (UTC-4) eso devuelve el 30 de enero. La fecha de alta llega de la base como
   * cadena 'YYYY-MM-DD' (columna `date`) y la de corte suele ser un instante
   * real, de modo que una se desplazaba un dia y la otra no. El desfase solo se
   * notaba en los bordes de mes, y siempre a favor de mas antiguedad: a quien
   * entraba un dia 1 se le adelantaba un mes entero de vacaciones.
   *
   * Devuelve null si la fecha no es valida.
   */
  private static aDiaDeCalendario(valor: Date | string): Date | null {
    if (typeof valor === 'string') {
      const partes = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (partes) {
        return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
      }
    }

    const fecha = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(fecha.getTime())) return null;
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  }

  public static calcularDiasVacacionesPorAntiguedad(hireDate: Date | string, referenceDate: Date | string = new Date()): number {
    const alta = this.aDiaDeCalendario(hireDate);
    const corte = this.aDiaDeCalendario(referenceDate);
    if (!alta || !corte || corte < alta) return 0;

    // Meses completos entre las dos fechas, contando el dia del mes.
    //
    // El caso de fin de mes hay que tratarlo aparte: quien entro un 31 cumple
    // el mes el 30 de junio, porque el 31 de junio no existe. Sin esta
    // salvedad, a todo el que entra un 29, 30 o 31 se le come un mes en los
    // meses cortos y se le niegan dias que le corresponden.
    let meses = (corte.getFullYear() - alta.getFullYear()) * 12 + (corte.getMonth() - alta.getMonth());
    const ultimoDiaDelMesDeCorte = new Date(corte.getFullYear(), corte.getMonth() + 1, 0).getDate();
    const cumpleElMes = corte.getDate() >= alta.getDate() || corte.getDate() === ultimoDiaDelMesDeCorte;
    if (!cumpleElMes) meses -= 1;
    if (meses < 5) return 0;
    if (meses < 12) return meses + 1;   // 5->6, 6->7, ... 11->12

    const anios = Math.floor(meses / 12);
    return anios >= 5 ? 18 : 14;
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
