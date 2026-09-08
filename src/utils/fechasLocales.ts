/**
 * Fechas en formato local (YYYY-MM-DD) sin pasar por UTC.
 *
 * Vivian como funciones sueltas dentro de dashboard/purchases/page.tsx. Al
 * sacar GuaranteeChecksView a su propio archivo (auditoria P2-38, piloto de
 * partir las paginas grandes) las necesitaban los dos, y duplicarlas era
 * crear la tercera copia de lo mismo.
 */

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getFirstDayOfMonthString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function formatDateDisplay(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const parts = dateString.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}
