/**
 * Sanitizes and escapes a string for safe insertion into PostgREST filter expressions (such as .or()).
 * Escapes PostgREST control characters (double quotes, backslashes)
 * and SQL ILIKE wildcards (%, _) to prevent filter injection and syntax errors.
 */
export function sanitizePostgrestFilter(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}
