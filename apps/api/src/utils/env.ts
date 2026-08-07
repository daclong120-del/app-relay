/**
 * Reads a required environment variable.
 *
 * Returns `string` (not `string | undefined`) so callers can use the value
 * directly inside closures — TypeScript does not carry a module-level
 * `if (!x) throw` narrowing across function boundaries.
 *
 * Throws at module load so a misconfigured deploy fails fast on boot instead
 * of silently running with an insecure fallback.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}
