/**
 * vacaciones.vitest.ts
 *
 * Escala de vacaciones por antiguedad del Codigo de Trabajo dominicano
 * (Art. 177 y su parrafo). La funcion es pura, asi que se prueba sin base de
 * datos ni sesion.
 *
 * La fecha de corte se pasa siempre explicita: una prueba que dependa de `new
 * Date()` empieza a fallar sola cuando pasa el tiempo.
 */
import { describe, it, expect } from 'vitest';
import { PayrollCalculationService } from '../services/payrollCalculationService';

const dias = (alta: string, corte: string) =>
  PayrollCalculationService.calcularDiasVacacionesPorAntiguedad(alta, corte);

describe('vacaciones — antes de generar derecho', () => {
  it('no da dias antes de los 5 meses', () => {
    expect(dias('2026-01-15', '2026-01-15')).toBe(0); // mismo dia
    expect(dias('2026-01-15', '2026-04-14')).toBe(0); // 2 meses y pico
    expect(dias('2026-01-15', '2026-06-14')).toBe(0); // 4 meses y 30 dias
  });

  it('el derecho nace justo al cumplir el quinto mes', () => {
    expect(dias('2026-01-15', '2026-06-15')).toBe(6);
  });
});

describe('vacaciones — escala proporcional de 5 a 11 meses', () => {
  it('sube un dia por mes, de 6 a 12', () => {
    const esperado: Record<number, number> = { 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11, 11: 12 };
    for (const [meses, d] of Object.entries(esperado)) {
      const corte = new Date(Date.UTC(2026, 0 + Number(meses), 15));
      expect(dias('2026-01-15', corte.toISOString().slice(0, 10))).toBe(d);
    }
  });
});

describe('vacaciones — con un ano o mas', () => {
  it('al cumplir el ano salta a 14 dias, no a 13', () => {
    // El mes 11 da 12 dias; el 12 no da 13 sino los 14 del Art. 177.
    expect(dias('2026-01-15', '2026-12-15')).toBe(12);
    expect(dias('2026-01-15', '2027-01-15')).toBe(14);
  });

  it('se mantiene en 14 hasta el quinto ano', () => {
    expect(dias('2020-03-01', '2024-12-31')).toBe(14);
    expect(dias('2020-03-01', '2025-02-28')).toBe(14);
  });

  it('al cumplir 5 anos pasa a 18 dias', () => {
    expect(dias('2020-03-01', '2025-03-01')).toBe(18);
    expect(dias('2010-03-01', '2026-03-01')).toBe(18);
  });
});

describe('vacaciones — entradas defectuosas', () => {
  it('devuelve cero en vez de reventar', () => {
    expect(dias('no es una fecha', '2026-06-15')).toBe(0);
    expect(dias('2026-01-15', 'tampoco')).toBe(0);
  });

  it('devuelve cero si la fecha de corte es anterior al alta', () => {
    expect(dias('2026-06-15', '2026-01-15')).toBe(0);
  });
});

describe('vacaciones — bordes de calendario', () => {
  it('cuenta el mes completo, no los dias sueltos', () => {
    // Alta el 31: en meses de 30 dias el mes no se completa hasta el mes siguiente.
    expect(dias('2026-01-31', '2026-06-30')).toBe(6); // 4 meses y 30 dias -> 4... el dia 30 < 31
    expect(dias('2026-01-31', '2026-07-31')).toBe(7); // 6 meses exactos
  });

  it('quien entro un 29 de febrero cumple el ano el 28', () => {
    // En 2025 no hay 29 de febrero, asi que el ano se cumple el ultimo dia del
    // mes. Negarle el salto a 14 dias hasta el 1 de marzo le quitaria dias por
    // un accidente del calendario.
    expect(dias('2024-02-29', '2025-02-27')).toBe(12);
    expect(dias('2024-02-29', '2025-02-28')).toBe(14);
    expect(dias('2024-02-29', '2025-03-01')).toBe(14);
  });
});
