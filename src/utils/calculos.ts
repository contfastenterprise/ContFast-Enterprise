export function fraccionToDecimal(fraccion: string): number {
  const partes = fraccion.split("/");
  if (partes.length === 1) {
    return parseFloat(fraccion);
  } else if (partes.length === 2) {
    const numerador = parseFloat(partes[0]);
    const denominador = parseFloat(partes[1]);
    return denominador !== 0 ? numerador / denominador : NaN;
  }
  return NaN;
}

export function parseFraction(valor: string): number {
  // Si el valor es vacío o no es una cadena, retornar 0
  if (!valor || typeof valor !== 'string') {
    return 0;
  }

  const cleanValor = valor.replace(/"/g, '').trim();

  // Verificar si es una fracción mixta (entero y fracción)
  const regexMixta = /^(\d+)\s+(\d+\/\d+)$/;
  const partesMixta = cleanValor.match(regexMixta);
  if (partesMixta) {
    const entero = parseFloat(partesMixta[1]);
    const fraccion = fraccionToDecimal(partesMixta[2]);
    return entero + fraccion;
  }

  // Verificar si es solo una fracción
  const regexFraccion = /^(\d+)\/(\d+)$/;
  const partesFraccion = cleanValor.match(regexFraccion);
  if (partesFraccion) {
    return fraccionToDecimal(cleanValor);
  }

  // Si es solo un número
  const numero = parseFloat(cleanValor);
  return isNaN(numero) ? 0 : numero;
}

/**
 * Alias para compatibilidad
 */
export const CalculoFracion = parseFraction;

export function formatFraction(decimal: number): string {
  // Solo para fracciones comunes de 1/16 en adelante
  const fracciones = [
    { valor: 0, texto: "0" },
    { valor: 0.0625, texto: "1/16" },
    { valor: 0.125, texto: "1/8" },
    { valor: 0.1875, texto: "3/16" },
    { valor: 0.25, texto: "1/4" },
    { valor: 0.3125, texto: "5/16" },
    { valor: 0.375, texto: "3/8" },
    { valor: 0.4375, texto: "7/16" },
    { valor: 0.5, texto: "1/2" },
    { valor: 0.5625, texto: "9/16" },
    { valor: 0.625, texto: "5/8" },
    { valor: 0.6875, texto: "11/16" },
    { valor: 0.75, texto: "3/4" },
    { valor: 0.8125, texto: "13/16" },
    { valor: 0.875, texto: "7/8" },
    { valor: 0.9375, texto: "15/16" },
  ];
  const entero = Math.floor(decimal);
  const resto = +(decimal - entero).toFixed(4);
  let fraccion = "";
  let minDiff = 1;
  for (const f of fracciones) {
    const diff = Math.abs(resto - f.valor);
    if (diff < minDiff) {
      minDiff = diff;
      fraccion = f.texto || '';
    }
  }
  return entero > 0
    ? fraccion !== "0" && fraccion !== ""
      ? `${entero} ${fraccion}`
      : `${entero}`
    : fraccion !== "0" && fraccion !== ""
      ? fraccion
      : "0";
}

/**
 * Alias para compatibilidad
 */
export const decimalToFraccion = formatFraction;

/**
 * Safe money rounding to 2 decimal places to avoid floating point precision errors
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
