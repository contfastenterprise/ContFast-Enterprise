/**
 * Utility helper to validate Dominican Republic NCF and e-NCF formats.
 * 
 * - Standard NCF (B): 11 characters. Starts with "B", followed by 10 digits (2 for type, 8 sequence).
 * - Electronic NCF (E): 13 characters. Starts with "E", followed by 12 digits (2 for type, 10 sequence).
 */
export function isValidNcfFormat(ncf: string | null | undefined): boolean {
  if (!ncf) return false;
  const cleanNcf = ncf.trim().toUpperCase();

  const standardNcfRegex = /^B[0-9]{10}$/; 
  const electronicNcfRegex = /^E[0-9]{12}$/; 

  return standardNcfRegex.test(cleanNcf) || electronicNcfRegex.test(cleanNcf);
}

export function isElectronicNcf(ncf: string | null | undefined): boolean {
  if (!ncf) return false;
  const cleanNcf = ncf.trim().toUpperCase();
  return /^E[0-9]{12}$/.test(cleanNcf);
}
