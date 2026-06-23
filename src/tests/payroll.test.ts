import { PayrollCalculationService, PayrollConfig, IsrBracket } from '../services/payrollCalculationService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

function runTests() {
  console.log('=== INICIANDO PRUEBAS UNITARIAS DE CÁLCULO DE NÓMINA ===');

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
    { fromAmount: 0.00, toAmount: 416220.00, fixedAmount: 0.00, percentage: 0.00 },
    { fromAmount: 416220.01, toAmount: 624329.00, fixedAmount: 0.00, percentage: 15.00 },
    { fromAmount: 624329.01, toAmount: 867123.00, fixedAmount: 31216.00, percentage: 20.00 },
    { fromAmount: 867123.01, toAmount: null, fixedAmount: 79776.00, percentage: 25.00 },
  ];

  // 1. Test getHourlyRate
  // Base Salary = 30,000 -> hourly rate = 30000 / 23.83 / 8 = 157.3646
  const rate = PayrollCalculationService.getHourlyRate(30000);
  assert(Math.abs(rate - 157.36) < 0.1, `Hourly rate should be around 157.36, got ${rate}`);

  // 2. Test calculateOvertime
  // 10 hours diurnas at 30,000 base salary
  const otAmount = PayrollCalculationService.calculateOvertime(30000, 10, 'diurna', config);
  // 157.3646 * 10 * 1.35 = 2124.42
  assert(Math.abs(otAmount - 2124.42) < 1.00, `Overtime diurna calculation check, got ${otAmount}`);

  // 10 hours dobles
  const otDouble = PayrollCalculationService.calculateOvertime(30000, 10, 'doble', config);
  // 157.3646 * 10 * 2.00 = 3147.29
  assert(Math.abs(otDouble - 3147.29) < 1.00, `Overtime doble calculation check, got ${otDouble}`);

  // 3. Test progressive ISR
  // Annualized net = 400,000 (Exento)
  const isrExempt = PayrollCalculationService.calculateIsr(400000, isrBrackets);
  assert(isrExempt === 0, `ISR for 400,000 annual net should be 0, got ${isrExempt}`);

  // Annualized net = 500,000 -> (500,000 - 416220.01) * 0.15 = 12566.99 annual -> monthly = 1047.25
  const isrTier2 = PayrollCalculationService.calculateIsr(500000, isrBrackets);
  assert(Math.abs(isrTier2 - 1047.25) < 1.00, `ISR for 500,000 annual net should be 1047.25, got ${isrTier2}`);

  // Annualized net = 700,000 -> 31216.00 + (700,000 - 624329.01) * 0.20 = 46350.19 annual -> monthly = 3862.52
  const isrTier3 = PayrollCalculationService.calculateIsr(700000, isrBrackets);
  assert(Math.abs(isrTier3 - 3862.52) < 1.00, `ISR for 700,000 annual net should be 3862.52, got ${isrTier3}`);

  // Annualized net = 1,000,000 -> 79776.00 + (1,000,000 - 867123.01) * 0.25 = 112995.24 annual -> monthly = 9416.27
  const isrTier4 = PayrollCalculationService.calculateIsr(1000000, isrBrackets);
  assert(Math.abs(isrTier4 - 9416.27) < 1.00, `ISR for 1,000,000 annual net should be 9416.27, got ${isrTier4}`);

  // 4. Test calculateDetails (TSS limits and net pay)
  // Salary: 25,000 (No caps reached)
  // Cotizable = 25,000. AFP Employee = 25000 * 2.87% = 717.50, SFS Employee = 25000 * 3.04% = 760.00
  // Net for ISR = 25000 - 717.50 - 760.00 = 23,522.50. Annualized = 282,270 (Exempt) -> ISR = 0
  // Net salary = 25000 - 717.50 - 760.00 = 23,522.50
  const detailsNormal = PayrollCalculationService.calculateDetails({
    baseSalary: 25000,
    isrBrackets,
    config,
  });
  assert(detailsNormal.afp === 717.50, `AFP should be 717.50, got ${detailsNormal.afp}`);
  assert(detailsNormal.sfs === 760.00, `SFS should be 760.00, got ${detailsNormal.sfs}`);
  assert(detailsNormal.isr === 0, `ISR should be 0, got ${detailsNormal.isr}`);
  assert(detailsNormal.netSalary === 23522.50, `Net salary should be 23522.50, got ${detailsNormal.netSalary}`);

  // Salary: 350,000 (Caps reached)
  // Cotizable = 350,000.
  // AFP Limit = 20 * 16262.50 = 325,250. AFP Employee = 325250 * 2.87% = 9334.68
  // SFS Limit = 10 * 16262.50 = 162,625. SFS Employee = 162625 * 3.04% = 4943.80
  const detailsCapped = PayrollCalculationService.calculateDetails({
    baseSalary: 350000,
    isrBrackets,
    config,
  });
  assert(Math.abs(detailsCapped.afp - 9334.68) < 0.05, `Capped AFP should be around 9334.68, got ${detailsCapped.afp}`);
  assert(Math.abs(detailsCapped.sfs - 4943.80) < 0.05, `Capped SFS should be around 4943.80, got ${detailsCapped.sfs}`);

  // 5. Test settlements (Prestaciones)
  // Hire Date: Jan 1, 2025. Term Date: Jun 30, 2025 (6 months). Salary: 30,000.
  // Months of service: 6 months.
  // Daily average wage: 30000 / 23.83 = 1258.91
  // Preaviso = 14 days * 1258.91 = 17624.84
  // Cesantia = 13 days * 1258.91 = 16365.92
  // Navidad (proportional) = average of wages (6 months * 30000 / 12) = 180000 / 12 = 15000
  const settlement = PayrollCalculationService.calculateSettlement({
    hireDate: new Date('2025-01-01'),
    terminationDate: new Date('2025-07-05'),
    salary: 30000,
    includePreaviso: true,
    includeCesantia: true,
    vacacionesPendientesDays: 0,
    accumulatedNavidadBase: 180000,
  });
  assert(Math.abs(settlement.preaviso - 17624.84) < 5.0, `Preaviso calculation check, got ${settlement.preaviso}`);
  assert(Math.abs(settlement.cesantia - 16365.92) < 5.0, `Cesantía calculation check, got ${settlement.cesantia}`);
  assert(settlement.navidad === 15000, `Navidad proportional calculation check, got ${settlement.navidad}`);

  console.log('=== TODAS LAS PRUEBAS DE CÁLCULO PASARON CON ÉXITO! ===');
}

runTests();
