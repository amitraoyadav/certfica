/**
 * Utility functions for masking vehicle Chassis and Engine numbers on certificates.
 * 
 * Rules:
 * - Hide the first 4 characters/digits of Chassis Number with 'XXXX'
 *   e.g. "MD2A11CY3NC00981" -> "XXXX11CY3NC00981"
 *   e.g. "01373" -> "XXXX3"
 *   e.g. "1234" -> "XXXX"
 * 
 * - Hide the first 5 characters/digits of Engine Number with 'XXXXX'
 *   e.g. "DHGBNC01294" -> "XXXXXC01294"
 *   e.g. "02098" -> "XXXXX"
 *   e.g. "JF50E987654" -> "XXXXX987654"
 * 
 * This applies to ALL certificates (old and new) when viewed, printed,
 * downloaded as PDF, emailed, or verified, while preserving full unmasked
 * numbers in the backend database and admin inputs.
 */

export function maskChassisNumber(chassis: string | null | undefined, showFull?: boolean): string {
  if (!chassis) return 'Not Provided';
  const trimmed = chassis.trim();
  if (!trimmed) return 'Not Provided';
  if (showFull) return trimmed;
  if (
    trimmed.toLowerCase() === 'not provided' ||
    trimmed.toLowerCase() === 'not specified' ||
    trimmed === 'na' ||
    trimmed === 'n/a' ||
    trimmed === '-'
  ) {
    return trimmed;
  }

  // If already starts with XXXX, do not double mask
  if (trimmed.toUpperCase().startsWith('XXXX')) {
    return trimmed;
  }

  if (trimmed.length <= 4) {
    return 'XXXX';
  }

  return 'XXXX' + trimmed.slice(4);
}

export function maskEngineNumber(engine: string | null | undefined, showFull?: boolean): string {
  if (!engine) return 'Not Provided';
  const trimmed = engine.trim();
  if (!trimmed) return 'Not Provided';
  if (showFull) return trimmed;
  if (
    trimmed.toLowerCase() === 'not provided' ||
    trimmed.toLowerCase() === 'not specified' ||
    trimmed === 'na' ||
    trimmed === 'n/a' ||
    trimmed === '-'
  ) {
    return trimmed;
  }

  // If already starts with XXXXX, do not double mask
  if (trimmed.toUpperCase().startsWith('XXXXX')) {
    return trimmed;
  }

  if (trimmed.length <= 5) {
    return 'XXXXX';
  }

  return 'XXXXX' + trimmed.slice(5);
}
