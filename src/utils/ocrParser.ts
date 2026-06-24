export interface OcrInvoiceData {
  supplier: string;
  rnc: string;
  ncf: string;
  ecf: boolean;
  date: string;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  itbis: number;
  total: number;
  totalDOP: number;
}

/**
 * Parses the raw text extracted from OCR to find invoice details,
 * specialized for Dominican Republic fiscal documents (RNC, NCF, e-CF, ITBIS, USD/DOP exchange rate).
 */
export function parseOcrText(text: string): OcrInvoiceData {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const normalizedText = text.toLowerCase();

  // Initialize empty data
  const result: OcrInvoiceData = {
    supplier: '',
    rnc: '',
    ncf: '',
    ecf: false,
    date: '',
    currency: 'DOP',
    exchangeRate: 1,
    subtotal: 0,
    itbis: 0,
    total: 0,
    totalDOP: 0
  };

  // 1. Detect RNC (9 or 11 digits)
  // Find "RNC" label or any sequence of digits matching the format
  const rncLabelMatch = normalizedText.match(/(?:rnc|registro\s+único|registro\s+unico)[:.\s]*(\d[\d\s-]{7,15}\d)/);
  if (rncLabelMatch) {
    const rawRnc = rncLabelMatch[1].replace(/[\s-]/g, '');
    if (rawRnc.length === 9 || rawRnc.length === 11) {
      result.rnc = rawRnc;
    }
  }
  
  if (!result.rnc) {
    // Fallback: search for any sequence of 9 or 11 digits
    const rawDigitsMatches = text.match(/\b\d{9}\b|\b\d{11}\b|\b\d{3}-\d{5}-\d{1}\b|\b\d{3}-\d{7}-\d{1}\b/g);
    if (rawDigitsMatches) {
      const cleanRnc = rawDigitsMatches[0].replace(/-/g, '');
      result.rnc = cleanRnc;
    }
  }

  // 2. Detect Supplier Name (Search backwards from the RNC line, since business name is always before RNC)
  const noiseKeywords = [
    'factura', 'comprobante', 'rnc', 'ncf', 'tel', 'email', 'web', 'calle', 'av.', 
    'santo domingo', 'r.d.', 'república', 'republica', 'dominicana', 'cliente', 
    'fecha', 'vendedor', 'cotizacion', 'remision', 'diario', 'documento', 'original',
    'copia', 'caja', 'cajero', 'condicion', 'pago'
  ];

  let rncLineIndex = -1;
  if (result.rnc) {
    rncLineIndex = lines.findIndex(line => {
      const cleanLine = line.replace(/[\s-]/g, '');
      return cleanLine.includes(result.rnc) || line.toLowerCase().includes('rnc');
    });
  } else {
    // If no RNC detected, look for "rnc" label line
    rncLineIndex = lines.findIndex(line => line.toLowerCase().includes('rnc'));
  }

  // If we found the RNC line index, search backwards from there
  if (rncLineIndex > 0) {
    for (let i = rncLineIndex - 1; i >= 0; i--) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      const digitCount = (line.match(/\d/g) || []).length;
      const ratio = digitCount / line.length;

      const containsNoise = noiseKeywords.some(keyword => lowerLine.includes(keyword));
      const isTooNumeric = ratio > 0.3;
      const isValidLength = line.length > 2 && line.length < 50;

      if (!containsNoise && !isTooNumeric && isValidLength) {
        result.supplier = line;
        break;
      }
    }
  }

  // Fallback: If supplier is still empty, scan from the top forwards
  if (!result.supplier) {
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      const digitCount = (line.match(/\d/g) || []).length;
      const ratio = digitCount / line.length;

      const containsNoise = noiseKeywords.some(keyword => lowerLine.includes(keyword));
      const isTooNumeric = ratio > 0.3;
      const isValidLength = line.length > 2 && line.length < 50;

      if (!containsNoise && !isTooNumeric && isValidLength) {
        result.supplier = line;
        break;
      }
    }
  }

  // 3. Detect NCF (traditional starting with B, or e-CF starting with E)
  const ncfMatch = text.match(/\b([bB]\d{10})\b|\b([eE]\d{12})\b/);
  if (ncfMatch) {
    const rawNcf = ncfMatch[0].toUpperCase();
    result.ncf = rawNcf;
    result.ecf = rawNcf.startsWith('E');
  } else {
    // Broad search for letters B or E followed by digits with spaces/typos
    const broadNcfMatch = normalizedText.match(/\b(b|e)\s*(\d[\d\s]{9,12}\d)\b/);
    if (broadNcfMatch) {
      const letter = broadNcfMatch[1].toUpperCase();
      const numbers = broadNcfMatch[2].replace(/\s/g, '');
      if (letter === 'B' && numbers.length === 10) {
        result.ncf = letter + numbers;
        result.ecf = false;
      } else if (letter === 'E' && numbers.length === 12) {
        result.ncf = letter + numbers;
        result.ecf = true;
      }
    }
  }

  // 4. Detect Date (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
  // Matching DD/MM/YYYY or DD-MM-YYYY (with optional spaces and 2 or 4 digit years)
  const dateDMYMatch = text.match(/\b(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})\b/);
  if (dateDMYMatch) {
    const day = dateDMYMatch[1].padStart(2, '0');
    const month = dateDMYMatch[2].padStart(2, '0');
    let year = dateDMYMatch[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    // In DR, dates are overwhelmingly DD/MM/YYYY, but let's do a basic validation
    const val1 = parseInt(day, 10);
    const val2 = parseInt(month, 10);
    if (val2 <= 12) { // DD/MM/YYYY
      result.date = `${year}-${month}-${day}`;
    } else if (val1 <= 12) { // MM/DD/YYYY fallback
      result.date = `${year}-${day}-${month}`;
    }
  } else {
    // Matching YYYY-MM-DD (with optional spaces)
    const dateYMDMatch = text.match(/\b(\d{4})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})\b/);
    if (dateYMDMatch) {
      const year = dateYMDMatch[1];
      const month = dateYMDMatch[2].padStart(2, '0');
      const day = dateYMDMatch[3].padStart(2, '0');
      result.date = `${year}-${month}-${day}`;
    } else {
      // Matching written months in Spanish (e.g. "24 de junio de 2026", "24-jun-26", "24/junio/2026")
      const monthsMap: { [key: string]: string } = {
        jan: '01', ene: '01', feb: '02', mar: '03', apr: '04', abr: '04',
        may: '05', jun: '06', jul: '07', aug: '08', ago: '08', sep: '09',
        oct: '10', nov: '11', dec: '12', dic: '12'
      };
      const textLower = text.toLowerCase();
      const writtenDateMatch = textLower.match(/(\d{1,2})\s*(?:de\s+|-|\/)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\s*(?:de\s+|del\s+|-|\/)?\s*(\d{2,4})/);
      if (writtenDateMatch) {
        const day = writtenDateMatch[1].padStart(2, '0');
        const monthName = writtenDateMatch[2].substring(0, 3);
        let year = writtenDateMatch[3];
        if (year.length === 2) {
          year = `20${year}`;
        }
        const month = monthsMap[monthName];
        if (month) {
          result.date = `${year}-${month}-${day}`;
        }
      }
    }
  }

  // 5. Detect Currency
  let detectedCurrency = '';
  const totalKeywords = ['total', 'neto a pagar', 'total a pagar', 'importe total'];
  let totalLine = '';
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (totalKeywords.some(keyword => lowerLine.includes(keyword))) {
      totalLine = lowerLine;
      break;
    }
  }

  if (totalLine) {
    if (totalLine.includes('us$') || totalLine.includes('usd') || totalLine.includes('u$s') || totalLine.includes('usd$')) {
      detectedCurrency = 'USD';
    } else if (totalLine.includes('€') || totalLine.includes('eur') || totalLine.includes('euro')) {
      detectedCurrency = 'EUR';
    } else if (totalLine.includes('rd$') || totalLine.includes('dop') || totalLine.includes('pesos') || totalLine.includes('rd $')) {
      detectedCurrency = 'DOP';
    } else if (totalLine.includes('$')) {
      // If totalLine has just $, check general text for dollar indicators. If none, it's DOP (standard in Dominican invoices)
      if (normalizedText.includes('usd') || normalizedText.includes('u.s.d.') || normalizedText.includes('dollars') || normalizedText.includes('dólares') || normalizedText.includes('us$')) {
        detectedCurrency = 'USD';
      } else {
        detectedCurrency = 'DOP';
      }
    }
  }

  if (!detectedCurrency) {
    if (normalizedText.includes('us$') || normalizedText.includes('usd') || normalizedText.includes('u.s.d.') || normalizedText.includes('dollars') || normalizedText.includes('dólares')) {
      detectedCurrency = 'USD';
    } else if (normalizedText.includes('€') || normalizedText.includes('eur') || normalizedText.includes('euros')) {
      detectedCurrency = 'EUR';
    } else {
      detectedCurrency = 'DOP';
    }
  }
  
  result.currency = detectedCurrency;

  // 6. Detect Exchange Rate (Tasa / TC / Tipo Cambio / Exchange Rate)
  const exchangeRateMatch = normalizedText.match(/(?:tasa|t\.c\.|tc|tipo\s+de?\s*cambio|tasa\s+de?\s*(?:cambio|venta|dolar|dólar|usd))[:\s\-\#]*([\d.,]+)/);
  if (exchangeRateMatch) {
    const parsedRate = parseFloat(exchangeRateMatch[1].replace(/,/g, ''));
    if (!isNaN(parsedRate) && parsedRate > 1 && parsedRate < 200) {
      result.exchangeRate = parsedRate;
    }
  }

  // 7. Helper to extract amounts from lines
  const parseAmount = (regex: RegExp): number => {
    let bestVal = 0;
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const strVal = match[1].replace(/,/g, '');
      const val = parseFloat(strVal);
      if (!isNaN(val) && val > bestVal) {
        bestVal = val;
      }
    }
    return bestVal;
  };

  // Extract Subtotal, ITBIS, and Total
  // Using multiple regex variants to cover typical Dominican receipt layouts
  result.subtotal = parseAmount(/(?:sub[-_\s]*total|sub\s*neto|monto\s*gravado|gravado)[:\s]*RD?\$?\s*([\d,]+\.\d{2})\b/gi);
  if (result.subtotal === 0) {
    result.subtotal = parseAmount(/(?:sub[-_\s]*total|sub\s*neto|monto\s*gravado|gravado)[:\s]*RD?\$?\s*([\d,]+\.?\d*)/gi);
  }

  result.itbis = parseAmount(/(?:itbis|itbis\s*\(?18%?\)?|itbis\s*\(?16%?\)?|impuesto|itbi|itb)[:\s]*RD?\$?\s*([\d,]+\.\d{2})\b/gi);
  if (result.itbis === 0) {
    result.itbis = parseAmount(/(?:itbis|itbis\s*\(?18%?\)?|itbis\s*\(?16%?\)?|impuesto|itbi|itb)[:\s]*RD?\$?\s*([\d,]+\.?\d*)/gi);
  }

  result.total = parseAmount(/(?:total|total\s+a\s+pagar|neto\s+a\s+pagar|net\s+amount|importe\s+total)[:\s]*RD?\$?\s*([\d,]+\.\d{2})\b/gi);
  if (result.total === 0) {
    result.total = parseAmount(/(?:total|total\s+a\s+pagar|neto\s+a\s+pagar|net\s+amount|importe\s+total)[:\s]*RD?\$?\s*([\d,]+\.?\d*)/gi);
  }

  // 8. Handle calculations & fallback rules
  if (result.total === 0 && result.subtotal > 0) {
    // If total is missing but we have subtotal & ITBIS
    result.total = result.subtotal + result.itbis;
  } else if (result.subtotal === 0 && result.total > 0) {
    // If subtotal is missing but we have total & ITBIS
    result.subtotal = Math.max(0, result.total - result.itbis);
  }

  // Compute Total in DOP
  result.totalDOP = result.total * result.exchangeRate;

  return result;
}
