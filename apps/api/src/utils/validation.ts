export const PACKAGE_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Validates whether a string is a valid Android package ID.
 * Prevents command injection and malformed package inputs.
 */
export function isValidPackageId(packageId: string | null | undefined): boolean {
  if (!packageId || typeof packageId !== 'string') return false;
  if (packageId.length > 255) return false;
  return PACKAGE_ID_REGEX.test(packageId);
}
